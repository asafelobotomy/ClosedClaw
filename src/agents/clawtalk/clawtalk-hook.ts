/**
 * ClawTalk Before-Agent-Start Hook
 *
 * Registers a `before_agent_start` plugin hook that runs the ClawTalk
 * encoder + directory on every incoming prompt to:
 *   1. Classify intent via heuristic patterns (<1ms, no LLM call)
 *   2. Route to the appropriate subagent profile
 *   3. Inject the subagent's system prompt and tool allowlist
 *   4. Optionally override the model (escalation to cloud)
 *   5. When agent-to-agent, encode message via TPC (default transport)
 *
 * This replaces the self-contained classifier previously duplicated
 * in the GTK extension's clawtalk-bridge.ts.
 */

import { encode } from "./encoder.js";
import { Directory, type RoutingDecision } from "./directory.js";
import { shouldEscalate } from "./escalation.js";
import type { ClawTalkConfig, EncodedMessage } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { TPCRuntime } from "./tpc/index.js";
import { logVerbose } from "../../globals.js";
import type {
  PluginHookBeforeAgentStartEvent,
  PluginHookBeforeAgentStartResult,
  PluginHookAgentContext,
  PluginHookMessageContext,
  PluginHookMessageSendingEvent,
  PluginHookMessageSendingResult,
} from "../../plugins/types.js";

const ARTIFACT_PATTERNS: RegExp[] = [
  /^CT\/\d+\s+(REQ|RES|TASK|STATUS|NOOP|ERR|ACK|MULTI)\b.*$/gm,
  /[!@?][\w]+:[\w:]+\([^)]*\)/g,
  /\[ClawTalk routing:.*?\]/g,
  /^(<=|>>|!!|~|\.|ok|\[\])\s/gm,
  />>?\$sub\(\w+\)/g,
];

export function stripClawTalkArtifacts(text: string): string {
  if (!text) {
    return text;
  }
  let cleaned = text;
  for (const pattern of ARTIFACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Resolved routing result exposed for external consumers (GTK bridge, telemetry). */
export interface ClawTalkRouting {
  /** Which subagent was selected */
  agentId: string;
  /** System prompt for the subagent */
  systemPrompt: string;
  /** Tool allowlist for the subagent */
  tools: string[];
  /** Model override (only set when escalating) */
  modelOverride?: string;
  /** Whether escalation was triggered */
  escalated: boolean;
  /** Detected intent */
  intent: string;
  /** Classification confidence 0-1 */
  confidence: number;
  /** CT/1 wire representation */
  wire: string;
  /** TPC transport status */
  tpc?: {
    /** Whether this message uses TPC encoding */
    active: boolean;
    /** Reason for text fallback (only set when active=false) */
    fallbackReason?: string;
  };
}

// Module-level singleton directory (no LLM deps, safe to share).
let sharedDirectory: Directory | null = null;
let activeConfig: ClawTalkConfig = DEFAULT_CONFIG;

// TPC runtime — lazily initialized when TPC is enabled.
let tpcRuntime: TPCRuntime | null = null;
let tpcInitPromise: Promise<void> | null = null;

/**
 * Get or create the shared Directory singleton.
 */
function getDirectory(): Directory {
  if (!sharedDirectory) {
    sharedDirectory = new Directory();
  }
  return sharedDirectory;
}

/**
 * Get or create the shared TPC runtime. Initializes lazily on first call.
 */
async function getTpcRuntime(): Promise<TPCRuntime | null> {
  const tpcConfig = activeConfig.tpc;
  if (!tpcConfig?.enabled && tpcConfig?.enabled !== undefined) {
    return null;
  }

  if (tpcRuntime?.isReady()) {
    return tpcRuntime;
  }

  if (tpcInitPromise) {
    await tpcInitPromise;
    return tpcRuntime;
  }

  tpcRuntime = new TPCRuntime({
    enabled: tpcConfig?.enabled ?? true,
    mode: tpcConfig?.mode ?? "file",
    deadDropPath: tpcConfig?.deadDropPath,
    maxMessageAge: tpcConfig?.maxMessageAge ?? 300,
    enforceForAgentToAgent: tpcConfig?.enforceForAgentToAgent ?? true,
    allowTextFallback: tpcConfig?.allowTextFallback ?? false,
  });

  tpcInitPromise = tpcRuntime.initialize().catch((err) => {
    logVerbose(`[clawtalk-tpc] TPC init failed: ${err}`);
    tpcRuntime = null;
  }).finally(() => {
    tpcInitPromise = null;
  });

  await tpcInitPromise;
  return tpcRuntime;
}

/**
 * Determine if the current agent context represents agent-to-agent communication.
 * An agentId present in context indicates a sub-agent call.
 */
function isAgentToAgent(ctx: PluginHookAgentContext): boolean {
  return ctx.agentId != null && ctx.agentId !== "";
}

/**
 * Update the ClawTalk config used by the hook.
 * Called when config is reloaded (SIGUSR1).
 */
export function updateClawTalkHookConfig(config: Partial<ClawTalkConfig>): void {
  activeConfig = { ...DEFAULT_CONFIG, ...config };
}

/**
 * Get the shared Directory for external inspection.
 */
export function getClawTalkDirectory(): Directory {
  return getDirectory();
}

/**
 * Get the TPC runtime (if initialized).
 * Returns null if TPC has not been initialized yet.
 */
export function getClawTalkTpcRuntime(): TPCRuntime | null {
  return tpcRuntime;
}

/**
 * Initialize the TPC runtime explicitly (for consumers that need it immediately).
 */
export async function initClawTalkTpc(): Promise<TPCRuntime | null> {
  return getTpcRuntime();
}

/**
 * Shut down the TPC runtime (for clean process exit).
 */
export async function shutdownClawTalkTpc(): Promise<void> {
  if (tpcRuntime) {
    await tpcRuntime.shutdown();
    tpcRuntime = null;
  }
}

/**
 * Classify intent and route to subagent, returning a routing result.
 * Exported for use by the GTK bridge and other consumers.
 *
 * @param userMessage - The raw user message
 * @param opts - Optional context for TPC transport decision
 */
export function routeMessage(
  userMessage: string,
  opts?: { agentToAgent?: boolean },
): ClawTalkRouting {
  const encoded: EncodedMessage = encode(userMessage);
  const directory = getDirectory();
  const routing: RoutingDecision = directory.routeMessage(encoded.message, encoded.intent);
  const agent = routing.primary;

  // Escalation check
  const escalationDecision = shouldEscalate({
    confidence: encoded.confidence,
    intent: encoded.intent,
    inputLength: userMessage.length,
    config: activeConfig,
  });

  // TPC transport decision —
  // TPC is default for agent-to-agent; text is fallback only.
  let tpcStatus: ClawTalkRouting["tpc"];
  if (opts?.agentToAgent) {
    const runtime = tpcRuntime;
    if (runtime?.isReady()) {
      const fallback = runtime.shouldFallbackToText({
        isAgentToAgent: true,
        wire: encoded.wire,
      });
      tpcStatus = fallback
        ? { active: false, fallbackReason: "tpc=false in wire or config override" }
        : { active: true };
    } else {
      // TPC runtime not ready — check if text fallback is allowed
      const allowFallback = activeConfig.tpc?.allowTextFallback ?? false;
      tpcStatus = {
        active: false,
        fallbackReason: allowFallback
          ? "TPC runtime not initialized, using text fallback"
          : "TPC runtime not initialized",
      };
    }
  } else {
    // Human-facing communication — always text
    tpcStatus = { active: false, fallbackReason: "human-facing message" };
  }

  return {
    agentId: agent.id,
    systemPrompt: agent.systemPrompt,
    tools: agent.tools,
    modelOverride: escalationDecision.escalate
      ? (escalationDecision.targetModel ?? activeConfig.escalationModel)
      : undefined,
    escalated: escalationDecision.escalate,
    intent: encoded.intent,
    confidence: encoded.confidence,
    wire: encoded.wire,
    tpc: tpcStatus,
  };
}

/**
 * The hook handler for `before_agent_start`.
 *
 * Returns systemPrompt, toolAllowlist, and modelOverride based on
 * intent classification of the user's prompt.
 *
 * When agent-to-agent communication is detected, triggers TPC
 * initialization so messages default to acoustic encoding.
 */
export function clawtalkBeforeAgentStartHandler(
  event: PluginHookBeforeAgentStartEvent,
  ctx: PluginHookAgentContext,
): PluginHookBeforeAgentStartResult | void {
  if (!activeConfig.enabled) {
    return;
  }

  const prompt = event.prompt?.trim();
  if (!prompt) {
    return;
  }

  const agentToAgent = isAgentToAgent(ctx);
  const routing = routeMessage(prompt, { agentToAgent });

  // Lazily initialize TPC runtime for agent-to-agent calls
  if (agentToAgent && !tpcRuntime) {
    void getTpcRuntime();
  }

  // For the conversation fallback agent, don't override anything —
  // let the default system prompt and full tool set apply.
  if (routing.agentId === "conversation" && !routing.escalated) {
    return;
  }

  const result: PluginHookBeforeAgentStartResult = {};

  // Inject subagent system prompt as prepended context
  if (routing.systemPrompt) {
    result.prependContext = routing.systemPrompt;
  }

  // Set tool allowlist
  if (routing.tools.length > 0) {
    result.toolAllowlist = routing.tools;
  }

  // Set model override on escalation
  if (routing.modelOverride) {
    result.modelOverride = routing.modelOverride;
  }

  const tpcTag = routing.tpc?.active ? " [TPC]" : " [TEXT]";
  logVerbose(
    `[clawtalk] intent=${routing.intent} -> ${routing.agentId} confidence=${(routing.confidence * 100).toFixed(0)}%${tpcTag}`,
  );

  return result;
}

/**
 * Outbound sanitizer for `message_sending`.
 * Strips protocol artifacts from outgoing user-visible content.
 */
export function clawtalkMessageSendingHandler(
  event: PluginHookMessageSendingEvent,
  _ctx: PluginHookMessageContext,
): PluginHookMessageSendingResult | void {
  if (!activeConfig.enabled) {
    return;
  }

  const content = typeof event.content === "string" ? event.content : "";
  if (!content) {
    return;
  }

  const cleaned = stripClawTalkArtifacts(content);
  if (cleaned === content) {
    return;
  }

  return { content: cleaned };
}
