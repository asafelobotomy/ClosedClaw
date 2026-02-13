/**
 * ClawTalk Before-Agent-Start Hook
 *
 * Registers a `before_agent_start` plugin hook that runs the ClawTalk
 * encoder + directory on every incoming prompt to:
 *   1. Classify intent via heuristic patterns (<1ms, no LLM call)
 *   2. Route to the appropriate subagent profile
 *   3. Inject the subagent's system prompt and tool allowlist
 *   4. Optionally override the model (escalation to cloud)
 *
 * This replaces the self-contained classifier previously duplicated
 * in the GTK extension's clawtalk-bridge.ts.
 */

import { encode } from "./encoder.js";
import { Directory, type RoutingDecision } from "./directory.js";
import { shouldEscalate } from "./escalation.js";
import type { ClawTalkConfig, EncodedMessage } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
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
}

// Module-level singleton directory (no LLM deps, safe to share).
let sharedDirectory: Directory | null = null;
let activeConfig: ClawTalkConfig = DEFAULT_CONFIG;

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
 * Classify intent and route to subagent, returning a routing result.
 * Exported for use by the GTK bridge and other consumers.
 */
export function routeMessage(userMessage: string): ClawTalkRouting {
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
  };
}

/**
 * The hook handler for `before_agent_start`.
 *
 * Returns systemPrompt, toolAllowlist, and modelOverride based on
 * intent classification of the user's prompt.
 */
export function clawtalkBeforeAgentStartHandler(
  event: PluginHookBeforeAgentStartEvent,
  _ctx: PluginHookAgentContext,
): PluginHookBeforeAgentStartResult | void {
  if (!activeConfig.enabled) {
    return;
  }

  const prompt = event.prompt?.trim();
  if (!prompt) {
    return;
  }

  const routing = routeMessage(prompt);

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

  logVerbose(
    `[clawtalk] intent=${routing.intent} -> ${routing.agentId} confidence=${(routing.confidence * 100).toFixed(0)}%`,
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
