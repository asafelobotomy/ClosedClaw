/**
 * GTK GUI Monitor
 * 
 * Handles inbound messages from the GTK GUI and routes them through
 * the embedded Pi agent for AI responses.
 * 
 * Supports "lite mode" for small local models (e.g., Ollama 1B/3B) that
 * bypasses the full Pi agent system and uses a minimal prompt.
 */

import crypto from "node:crypto";
import type { ChannelAccountSnapshot, ClosedClawConfig } from "ClosedClaw/plugin-sdk";
import type { GtkMessage } from "./ipc.js";
import { loadCoreAgentDeps, type CoreConfig } from "./core-bridge.js";

/**
 * Simple conversation history for lite mode
 */
interface LiteModeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const liteModeSessions = new Map<string, LiteModeMessage[]>();
const LITE_MODE_MAX_HISTORY = 10; // Keep last 10 messages for context

/**
 * Call Ollama API directly with a minimal prompt (lite mode)
 * Used for small local models that can't handle the full Pi agent system prompt
 */
async function callOllamaLite(params: {
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
        content: `You are ${agentName}, a helpful AI assistant. Be concise, friendly, and helpful. Respond naturally to the user's messages.`,
      },
    ];
    liteModeSessions.set(sessionKey, history);
  }

  // Add user message
  history.push({ role: "user" as const, content: userMessage });

  // Trim history if too long (keep system + last N exchanges)
  while (history.length > LITE_MODE_MAX_HISTORY * 2 + 1) {
    history.splice(1, 2); // Remove oldest user+assistant pair after system
  }

  log?.debug?.(`Lite mode: calling ${baseUrl} with ${history.length} messages`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: history,
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
  const assistantMessage = data.choices?.[0]?.message?.content?.trim() || "";

  // Add assistant response to history
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
 * Get Ollama base URL from config
 */
function getOllamaBaseUrl(cfg: CoreConfig): string | undefined {
  const modelsConfig = (cfg as Record<string, unknown>).models as Record<string, unknown> | undefined;
  const providers = modelsConfig?.providers as Record<string, unknown> | undefined;
  const ollama = providers?.ollama as Record<string, unknown> | undefined;
  return ollama?.baseUrl as string | undefined;
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
): Promise<{ text: string | null; error?: string }> {
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

    log?.debug?.(`Using lite mode for Ollama model: ${model}`);
    
    try {
      const text = await callOllamaLite({
        baseUrl,
        model,
        sessionKey,
        userMessage,
        agentName,
        log,
      });
      
      log?.info?.(`Lite mode response: ${text.slice(0, 80)}...`);
      return { text };
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
