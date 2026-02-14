/**
 * GTK GUI Monitor
 *
 * Handles inbound messages from the GTK GUI and routes them through
 * the embedded Pi agent for AI responses.
 *
 * Supports "lite mode" for small local models (e.g., Ollama 1B/3B) that
 * bypasses the full Pi agent system and uses a minimal prompt.
 *
 * Enhanced lite mode supports:
 * - Native tool calling for models that support it (qwen3, llama3.1+, etc.)
 * - Pattern-based tool fallback for models that don't
 * - Tools: read_file, run_command, list_directory, save_note, recall_notes, current_time
 */

import crypto from "node:crypto";
import type { ChannelAccountSnapshot, ClosedClawConfig } from "ClosedClaw/plugin-sdk";
import type { GtkMessage } from "./ipc.js";
import { loadCoreAgentDeps, type CoreConfig } from "./core-bridge.js";
import {
  getOllamaTools,
  executeTool,
  executePatterns,
  modelSupportsTools,
  getNativeToolSystemPrompt,
  getPatternSystemPrompt,
} from "./lite-tools.js";
import { routeWithClawTalk } from "./clawtalk-bridge.js";
import { hasOrchestrationTags, processOrchestrationTags } from "./orchestration-tags.js";

/**
 * Conversation message for lite mode
 */
interface LiteModeMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_name?: string;
}

const liteModeSessions = new Map<string, LiteModeMessage[]>();
const LITE_MODE_MAX_HISTORY = 10; // Keep last 10 exchanges
const LITE_MODE_MAX_ITERATIONS = 8; // Max ReAct iterations (Thought→Action→Observation cycles)

/**
 * Call Ollama API with native tool calling support and ReAct-style multi-step reasoning.
 * Implements a loop: the model can request tools multiple times until it provides a final answer.
 * For models like qwen3, llama3.1+, mistral, etc.
 */
async function callOllamaWithTools(params: {
  baseUrl: string;
  model: string;
  sessionKey: string;
  userMessage: string;
  agentName: string;
  enableTools: boolean;
  maxIterations?: number;
  customSystemPrompt?: string;
  toolFilter?: string[];
  log?: { debug?: (msg: string) => void; error?: (msg: string) => void; info?: (msg: string) => void };
}): Promise<string> {
  const { baseUrl, model, sessionKey, userMessage, agentName, enableTools, log } = params;
  const maxIterations = params.maxIterations ?? LITE_MODE_MAX_ITERATIONS;

  // Get or create conversation history
  let history = liteModeSessions.get(sessionKey);
  if (!history) {
    history = [
      {
        role: "system" as const,
        content: params.customSystemPrompt ?? getNativeToolSystemPrompt(agentName),
      },
    ];
    liteModeSessions.set(sessionKey, history);
  }

  // Add user message
  history.push({ role: "user" as const, content: userMessage });

  // Trim history if too long (keep system + last N exchanges)
  while (history.length > LITE_MODE_MAX_HISTORY * 2 + 1) {
    history.splice(1, 2);
  }

  // Use Ollama's native API for tool calling
  const ollamaNativeUrl = baseUrl.replace("/v1", "");

  // ReAct loop: continue until model stops requesting tools or we hit max iterations
  let iteration = 0;
  let lastContent = "";

  while (iteration < maxIterations) {
    iteration++;
    log?.info?.(`ReAct iteration ${iteration}/${maxIterations}`);
    log?.debug?.(`Lite mode (tools): calling ${ollamaNativeUrl}/api/chat with ${history.length} messages`);

    const requestBody: Record<string, unknown> = {
      model,
      messages: history.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_name ? { tool_name: m.tool_name } : {}),
      })),
      stream: false,
    };

    if (enableTools) {
      let tools = getOllamaTools();
      if (params.toolFilter && params.toolFilter.length > 0) {
        tools = tools.filter((t: Record<string, unknown>) => {
          const fn = t.function as Record<string, unknown> | undefined;
          return fn?.name && params.toolFilter!.includes(fn.name as string);
        });
      }
      requestBody.tools = tools;
      if (iteration === 1) {
        log?.info?.(`Tools enabled: ${(requestBody.tools as unknown[]).length} tools available`);
      }
    } else {
      if (iteration === 1) {
        log?.info?.(`Tools disabled`);
      }
    }

    const response = await fetch(`${ollamaNativeUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      message?: {
        role: string;
        content: string;
        tool_calls?: Array<{
          function: { name: string; arguments: Record<string, unknown> };
        }>;
      };
    };

    const assistantMessage = data.message;
    if (!assistantMessage) {
      throw new Error("No message in Ollama response");
    }

    lastContent = assistantMessage.content?.trim() || "";

    // Check if model wants to call tools (continue ReAct loop)
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      log?.info?.(`Iteration ${iteration}: Model requested ${assistantMessage.tool_calls.length} tool call(s)`);

      // Add assistant message with tool calls to history
      history.push({
        role: "assistant" as const,
        content: lastContent,
        tool_calls: assistantMessage.tool_calls,
      });

      // Execute each tool and collect results (Observation phase)
      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: args } = toolCall.function;
        log?.info?.(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);

        const output = await executeTool(name, args);
        log?.info?.(`Tool ${name} output: ${output.slice(0, 100)}...`);

        // Add tool result to history (Observation)
        history.push({
          role: "tool" as const,
          content: output,
          tool_name: name,
        });
      }

      // Continue loop - model will process tool results and potentially call more tools
      continue;
    }

    // No tool calls - model has provided final answer
    log?.info?.(`Iteration ${iteration}: Model provided final answer (no more tool calls)`);
    history.push({ role: "assistant" as const, content: lastContent });
    return lastContent;
  }

  // Hit max iterations - return whatever we have
  log?.error?.(`ReAct loop hit max iterations (${maxIterations}). Returning last response.`);
  if (lastContent) {
    history.push({ role: "assistant" as const, content: lastContent });
  }
  return lastContent || "I apologize, but I ran into my iteration limit while processing your request. Please try a simpler query.";
}

/**
 * Call Ollama API with pattern-based tool fallback
 * For models that don't support native tool calling
 */
async function callOllamaWithPatterns(params: {
  baseUrl: string;
  model: string;
  sessionKey: string;
  userMessage: string;
  agentName: string;
  log?: { debug?: (msg: string) => void; error?: (msg: string) => void };
}): Promise<string> {
  const { baseUrl, model, sessionKey, userMessage, agentName, log } = params;

  // Get or create conversation history
  let history = liteModeSessions.get(sessionKey);
  if (!history) {
    history = [
      {
        role: "system" as const,
        content: getPatternSystemPrompt(agentName),
      },
    ];
    liteModeSessions.set(sessionKey, history);
  }

  // Add user message
  history.push({ role: "user" as const, content: userMessage });

  // Trim history
  while (history.length > LITE_MODE_MAX_HISTORY * 2 + 1) {
    history.splice(1, 2);
  }

  log?.debug?.(`Lite mode (patterns): calling ${baseUrl} with ${history.length} messages`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let assistantMessage = data.choices?.[0]?.message?.content?.trim() || "";

  // Parse and execute any patterns in the response
  assistantMessage = await executePatterns(assistantMessage);

  // Add processed response to history
  if (assistantMessage) {
    history.push({ role: "assistant" as const, content: assistantMessage });
  }

  return assistantMessage;
}

/**
 * Check if lite mode should be used based on config
 */
function shouldUseLiteMode(cfg: CoreConfig): boolean {
  const pluginConfig = (cfg as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
  const entries = pluginConfig?.entries as Record<string, unknown> | undefined;
  const gtkConfig = entries?.["gtk-gui"] as Record<string, unknown> | undefined;
  const config = gtkConfig?.config as Record<string, unknown> | undefined;
  return config?.liteMode === true;
}

/**
 * Check if lite mode tools are enabled
 */
function areLiteModeToolsEnabled(cfg: CoreConfig): boolean {
  const pluginConfig = (cfg as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
  const entries = pluginConfig?.entries as Record<string, unknown> | undefined;
  const gtkConfig = entries?.["gtk-gui"] as Record<string, unknown> | undefined;
  const config = gtkConfig?.config as Record<string, unknown> | undefined;
  // Default to true if not specified
  return config?.liteModeTools !== false;
}

/**
 * Get max iterations for ReAct loop from config
 */
function getLiteModeMaxIterations(cfg: CoreConfig): number {
  const pluginConfig = (cfg as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
  const entries = pluginConfig?.entries as Record<string, unknown> | undefined;
  const gtkConfig = entries?.["gtk-gui"] as Record<string, unknown> | undefined;
  const config = gtkConfig?.config as Record<string, unknown> | undefined;
  const maxIter = config?.liteModeMaxIterations;
  // Default to 8, clamp between 1 and 20
  if (typeof maxIter === "number" && maxIter >= 1 && maxIter <= 20) {
    return Math.floor(maxIter);
  }
  return LITE_MODE_MAX_ITERATIONS;
}

/**
 * Get Ollama base URL from config
 */
function getOllamaBaseUrl(cfg: CoreConfig): string | undefined {
  const modelsConfig = (cfg as Record<string, unknown>).models as Record<string, unknown> | undefined;
  const providers = modelsConfig?.providers as Record<string, unknown> | undefined;
  const ollama = providers?.ollama as Record<string, unknown> | undefined;
  return ollama?.baseUrl as string | undefined;
}

/**
 * Get ClawTalk escalation config from GTK plugin config
 */
function getClawTalkConfig(cfg: CoreConfig): {
  escalationThreshold: number;
  escalationModel: string | undefined;
} {
  const pluginConfig = (cfg as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
  const entries = pluginConfig?.entries as Record<string, unknown> | undefined;
  const gtkConfig = entries?.["gtk-gui"] as Record<string, unknown> | undefined;
  const config = gtkConfig?.config as Record<string, unknown> | undefined;
  return {
    escalationThreshold:
      typeof config?.clawtalkEscalationThreshold === "number"
        ? config.clawtalkEscalationThreshold
        : 0.5,
    escalationModel:
      typeof config?.clawtalkEscalationModel === "string"
        ? config.clawtalkEscalationModel
        : undefined,
  };
}

export type GtkMonitorContext = {
  cfg: ClosedClawConfig;
  accountId: string;
  log?: {
    info?: (msg: string) => void;
    debug?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
  setStatus?: (patch: Partial<ChannelAccountSnapshot>) => void;
  userId: string;
};

type SessionEntry = {
  sessionId: string;
  updatedAt: number;
};

/**
 * Process an inbound GTK message and generate an AI response.
 * Returns the response text or null if processing failed.
 */
export async function processGtkMessage(
  message: GtkMessage,
  ctx: GtkMonitorContext,
): Promise<{ text: string | null; error?: string; riskLevel?: "low" | "medium" | "high" }> {
  const { cfg, accountId, log, userId } = ctx;

  if (message.type !== "message") {
    log?.debug?.(`Ignoring non-message type: ${message.type}`);
    return { text: null };
  }

  const userMessage = message.text?.trim();
  if (!userMessage) {
    log?.debug?.("Ignoring empty message");
    return { text: null };
  }

  log?.info?.(`Processing GTK message from ${message.from}: ${userMessage.slice(0, 80)}...`);

  let deps: Awaited<ReturnType<typeof loadCoreAgentDeps>>;
  try {
    deps = await loadCoreAgentDeps();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unable to load core agent dependencies";
    log?.error?.(errorMsg);
    return { text: null, error: errorMsg };
  }

  // Use config as CoreConfig
  const coreConfig = cfg as CoreConfig;

  // Build session key based on user ID
  const sessionKey = `gtk-gui:${userId}`;
  const agentId = "main";

  // Resolve paths
  const storePath = deps.resolveStorePath(coreConfig.session?.store, { agentId });
  const agentDir = deps.resolveAgentDir(coreConfig, agentId);
  const workspaceDir = deps.resolveAgentWorkspaceDir(coreConfig, agentId);

  // Ensure workspace exists
  await deps.ensureAgentWorkspace({ dir: workspaceDir });

  // Load or create session entry
  const sessionStore = deps.loadSessionStore(storePath);
  const now = Date.now();
  let sessionEntry = sessionStore[sessionKey] as SessionEntry | undefined;

  if (!sessionEntry) {
    sessionEntry = {
      sessionId: crypto.randomUUID(),
      updatedAt: now,
    };
    sessionStore[sessionKey] = sessionEntry;
    await deps.saveSessionStore(storePath, sessionStore);
  }

  const sessionId = sessionEntry.sessionId;
  const sessionFile = deps.resolveSessionFilePath(sessionId, sessionEntry, { agentId });

  // Resolve model from config - check agents.defaults.model.primary first
  const agentsConfig = (coreConfig as Record<string, unknown>).agents as Record<string, unknown> | undefined;
  const defaultsConfig = agentsConfig?.defaults as Record<string, unknown> | undefined;
  const modelConfig = defaultsConfig?.model as Record<string, unknown> | undefined;
  const primaryModel = modelConfig?.primary as string | undefined;
  
  const modelRef = primaryModel?.trim() || `${deps.DEFAULT_PROVIDER}/${deps.DEFAULT_MODEL}`;
  const slashIndex = modelRef.indexOf("/");
  const provider = slashIndex === -1 ? deps.DEFAULT_PROVIDER : modelRef.slice(0, slashIndex);
  const model = slashIndex === -1 ? modelRef : modelRef.slice(slashIndex + 1);

  // Resolve agent identity for personalized prompt
  const identity = deps.resolveAgentIdentity(coreConfig, agentId);
  const agentName = identity?.name?.trim() || "ClosedClaw";

  // Check for lite mode (for small local models like Ollama 1B/3B)
  if (shouldUseLiteMode(coreConfig) && provider === "ollama") {
    const baseUrl = getOllamaBaseUrl(coreConfig);
    if (!baseUrl) {
      return { text: null, error: "Lite mode requires Ollama baseUrl in config" };
    }

    const toolsEnabled = areLiteModeToolsEnabled(coreConfig);
    const supportsNativeTools = modelSupportsTools(model);
    const maxIterations = getLiteModeMaxIterations(coreConfig);

    // Route through ClawTalk pipeline for intent-based subagent routing
    const clawTalkConfig = getClawTalkConfig(coreConfig);
    const routing = routeWithClawTalk({
      userMessage,
      baseSessionKey: sessionKey,
      config: {
        agentName,
        escalationThreshold: clawTalkConfig.escalationThreshold,
        escalationModel: clawTalkConfig.escalationModel,
      },
    });

    log?.info?.(
      `[clawtalk] Intent: ${routing.intent} (${(routing.confidence * 100).toFixed(0)}%) → ${routing.agentName} [${routing.agentId}]${routing.escalated ? " ⬆ ESCALATED" : ""}`,
    );
    if (routing.tpc) {
      log?.info?.(
        `[clawtalk-tpc] Transport: ${routing.tpc.active ? "TPC (acoustic)" : "TEXT fallback"}${routing.tpc.fallbackReason ? ` — ${routing.tpc.fallbackReason}` : ""}`,
      );
    }
    log?.debug?.(
      `[clawtalk] Wire: ${routing.wire}`,
    );
    log?.debug?.(
      `Using lite mode: model=${routing.model ?? model}, toolsEnabled=${toolsEnabled}, nativeTools=${supportsNativeTools}, maxIterations=${maxIterations}`,
    );

    // Use the subagent-scoped session key and system prompt
    const effectiveModel = routing.model ?? model;
    const effectiveSessionKey = routing.sessionKey;

    try {
      let text: string;

      if (toolsEnabled && supportsNativeTools) {
        // Use native tool calling with ClawTalk subagent routing
        log?.debug?.(`Lite mode: ${routing.agentName} using native tool calling for ${effectiveModel}`);
        text = await callOllamaWithTools({
          baseUrl,
          model: effectiveModel,
          sessionKey: effectiveSessionKey,
          userMessage,
          agentName,
          enableTools: routing.tools.length > 0,
          maxIterations,
          customSystemPrompt: routing.systemPrompt,
          toolFilter: routing.tools.length > 0 ? routing.tools : undefined,
          log,
        });
      } else if (toolsEnabled) {
        // Use pattern-based fallback for non-tool models
        log?.debug?.(`Lite mode: using pattern-based tools for ${effectiveModel}`);
        text = await callOllamaWithPatterns({
          baseUrl,
          model: effectiveModel,
          sessionKey: effectiveSessionKey,
          userMessage,
          agentName,
          log,
        });
      } else {
        // Tools disabled, just chat with subagent's system prompt
        log?.debug?.(`Lite mode: tools disabled, ${routing.agentName} plain chat for ${effectiveModel}`);
        text = await callOllamaWithTools({
          baseUrl,
          model: effectiveModel,
          sessionKey: effectiveSessionKey,
          userMessage,
          agentName,
          enableTools: false,
          maxIterations: 1,
          customSystemPrompt: routing.systemPrompt,
          log,
        });
      }

      log?.info?.(`Lite mode response: ${text.slice(0, 80)}...`);

      // Post-process: extract and act on orchestration tags
      if (hasOrchestrationTags(text)) {
        log?.debug?.(`[orch] Detected orchestration tags in response, processing...`);
        const tagResult = await processOrchestrationTags(text, log);
        if (tagResult.sideEffects.length > 0) {
          log?.info?.(`[orch] Side-effects: ${tagResult.sideEffects.join("; ")}`);
        }
        if (tagResult.handoff) {
          log?.info?.(`[orch] Handoff requested → ${tagResult.handoff.target}`);
        }
        text = tagResult.cleanText;
      }

      return { text, riskLevel: routing.riskLevel };
    } catch (err) {
      const errorMsg = `Lite mode error: ${err instanceof Error ? err.message : String(err)}`;
      log?.error?.(errorMsg);
      return { text: null, error: errorMsg };
    }
  }

  // Resolve thinking level
  const thinkLevel = deps.resolveThinkingDefault({ cfg: coreConfig, provider, model });

  // System prompt for GTK GUI context
  const systemPrompt = `You are ${agentName}, a helpful AI assistant running on a Linux desktop.
You are communicating via a GTK GUI application - the user's exclusive interface.
Be helpful, concise, and friendly. Use Markdown for formatting when appropriate.
This is a direct conversation - no other channels are active.`;

  // Resolve timeout
  const timeoutMs = deps.resolveAgentTimeoutMs({ cfg: coreConfig });
  const runId = `gtk:${accountId}:${Date.now()}`;

  try {
    log?.debug?.(`Running agent with session ${sessionId}`);
    
    const result = await deps.runEmbeddedPiAgent({
      sessionId,
      sessionKey,
      messageProvider: "gtk-gui",
      sessionFile,
      workspaceDir,
      config: coreConfig,
      prompt: userMessage,
      provider,
      model,
      thinkLevel,
      verboseLevel: "off",
      timeoutMs,
      runId,
      lane: "gtk",
      extraSystemPrompt: systemPrompt,
      agentDir,
    });

    // Extract text from payloads
    const texts = (result.payloads ?? [])
      .filter((p) => p.text && !p.isError)
      .map((p) => p.text?.trim())
      .filter(Boolean);

    const text = texts.join("\n\n") || null;

    if (!text && result.meta?.aborted) {
      return { text: null, error: "Response generation was aborted" };
    }

    log?.info?.(`Generated response: ${text?.slice(0, 80) ?? "(empty)"}...`);
    return { text };
  } catch (err) {
    const errorMsg = `Agent error: ${err instanceof Error ? err.message : String(err)}`;
    log?.error?.(errorMsg);
    return { text: null, error: errorMsg };
  }
}
