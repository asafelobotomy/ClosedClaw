/**
 * ClawTalk Orchestrator
 *
 * The central coordinator that connects all ClawTalk components:
 * - Encoder: natural language → CT/1
 * - Directory: CT/1 → subagent routing
 * - Escalation: confidence-based model selection
 * - Execution: subagent task execution via LLM
 * - Decoder: CT/1 response → natural language
 * - Metrics: tracking all operations
 *
 * This is the main entry point for ClawTalk processing.
 */

import type { ClawTalkConfig, OrchestratorResult, ClawTalkMessage } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { encode } from "./encoder.js";
import { serialize } from "./parser.js";
import { Directory } from "./directory.js";
import { shouldEscalate } from "./escalation.js";
import { loadDictionary } from "./dictionary.js";
import { MetricsTracker } from "./metrics.js";
import type { ClawTalkDictionary } from "./types.js";

export interface OrchestratorDeps {
  /** Execute a prompt against an LLM (Ollama or cloud) */
  executePrompt: (params: {
    prompt: string;
    systemPrompt: string;
    model?: string;
    tools?: string[];
  }) => Promise<string>;
  /** Logger */
  log?: {
    info?: (msg: string) => void;
    debug?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

/**
 * The ClawTalk Orchestrator.
 * Manages the full lifecycle of a user request through the ClawTalk pipeline.
 */
export class Orchestrator {
  private config: ClawTalkConfig;
  private directory: Directory;
  private metrics: MetricsTracker;
  private dictionary: ClawTalkDictionary | null = null;
  private deps: OrchestratorDeps;

  constructor(deps: OrchestratorDeps, config?: Partial<ClawTalkConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.directory = new Directory();
    this.metrics = new MetricsTracker();
    this.deps = deps;
  }

  /**
   * Initialize the orchestrator (load dictionary, etc.)
   */
  async init(): Promise<void> {
    this.dictionary = await loadDictionary(this.config.dictionaryPath);
    this.deps.log?.info?.(
      `ClawTalk orchestrator initialized (dict v${this.dictionary.version})`,
    );
  }

  /**
   * Process a user message through the full ClawTalk pipeline.
   *
   * Flow:
   * 1. Encode: natural language → CT/1 (with confidence)
   * 2. Route: CT/1 → subagent via Directory
   * 3. Escalation check: local vs cloud model
   * 4. Execute: run the subagent with appropriate model
   * 5. Build response CT message
   */
  async process(userMessage: string): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const wireLog: string[] = [];
    const handledBy: string[] = [];
    let escalated = false;

    try {
      // Step 1: Encode
      const encoded = encode(userMessage);
      wireLog.push(`→ ${encoded.wire}`);
      this.deps.log?.info?.(
        `[clawtalk] Encoded: ${encoded.wire} (confidence=${pct(encoded.confidence)}, intent=${encoded.intent})`,
      );
      if (this.config.metrics) {
        this.metrics.recordEncode(userMessage.length, encoded.wire.length, encoded.intent);
      }

      // Step 2: Route via Directory
      const routing = this.directory.routeMessage(encoded.message, encoded.intent);
      const agent = routing.primary;
      handledBy.push(agent.id);
      this.deps.log?.info?.(`[clawtalk] Routed to: ${agent.name} (${agent.id})`);

      // Step 3: Escalation check
      const escalationDecision = shouldEscalate({
        confidence: encoded.confidence,
        intent: encoded.intent,
        inputLength: userMessage.length,
        config: this.config,
      });

      let model: string | undefined;
      if (escalationDecision.escalate) {
        escalated = true;
        model = escalationDecision.targetModel;
        this.deps.log?.info?.(
          `[clawtalk] ESCALATING: ${escalationDecision.reason} → model: ${model ?? "default cloud"}`,
        );
        if (this.config.metrics) {
          this.metrics.recordEscalation();
        }
      } else {
        model = this.config.localModel ?? agent.preferredModel;
        this.deps.log?.debug?.(`[clawtalk] Local execution: ${escalationDecision.reason}`);
      }

      // Step 4: Execute via the subagent
      const prompt = buildAgentPrompt(encoded.message, userMessage, agent.name);
      const response = await this.deps.executePrompt({
        prompt,
        systemPrompt: agent.systemPrompt,
        model,
        tools: agent.tools,
      });

      // Step 5: Build response CT message
      const responseMsg: ClawTalkMessage = {
        version: 1,
        verb: "RES",
        params: { ok: true, text: response },
      };
      wireLog.push(`← ${serialize(responseMsg).slice(0, 200)}`);

      if (this.config.metrics) {
        this.metrics.recordDecode(true);
      }

      return {
        text: response,
        handledBy,
        escalated,
        wireLog,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.deps.log?.error?.(`[clawtalk] Error: ${errorMsg}`);

      // Fallback: if ClawTalk fails and fallback is enabled, pass through raw
      if (this.config.fallbackOnError) {
        this.deps.log?.info?.("[clawtalk] Falling back to direct execution");
        try {
          const fallbackResponse = await this.deps.executePrompt({
            prompt: userMessage,
            systemPrompt: "You are a helpful AI assistant.",
          });
          return {
            text: fallbackResponse,
            handledBy: ["fallback"],
            escalated: false,
            wireLog: [...wireLog, "← FALLBACK"],
            durationMs: Date.now() - startTime,
          };
        } catch {
          return {
            text: null,
            error: `ClawTalk and fallback both failed: ${errorMsg}`,
            handledBy: [],
            escalated,
            wireLog,
            durationMs: Date.now() - startTime,
          };
        }
      }

      return {
        text: null,
        error: errorMsg,
        handledBy,
        escalated,
        wireLog,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /** Get the directory for registration/inspection */
  getDirectory(): Directory {
    return this.directory;
  }

  /** Get current metrics */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /** Reset metrics */
  resetMetrics(): void {
    this.metrics.reset();
  }
}

/**
 * Build the prompt to send to the subagent LLM.
 * Combines the ClawTalk context with the original user message.
 */
function buildAgentPrompt(
  ctMessage: ClawTalkMessage,
  originalMessage: string,
  agentName: string,
): string {
  const parts: string[] = [];

  parts.push(`[Task routed to ${agentName}]`);

  if (ctMessage.action && ctMessage.action !== "chat") {
    parts.push(`Detected action: ${ctMessage.action}`);
    const paramStr = Object.entries(ctMessage.params)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    if (paramStr) {
      parts.push(`Parameters:\n${paramStr}`);
    }
  }

  parts.push(`\nUser request: ${originalMessage}`);

  return parts.join("\n");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
