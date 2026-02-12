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
import { encode, estimateTokens } from "./encoder.js";
import { serialize } from "./parser.js";
import { Directory } from "./directory.js";
import { shouldEscalate } from "./escalation.js";
import { loadDictionary } from "./dictionary.js";
import { MetricsTracker } from "./metrics.js";
import type { ClawTalkDictionary } from "./types.js";
import {
  toDense,
  fromDense,
  applyLexiconCompression,
  applyLexiconExpansion,
  estimateDenseTokens,
} from "./clawdense.js";
import { FallbackChain, type FallbackResult } from "../fallback-chain.js";

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
  private fallbackChain: FallbackChain | null = null;

  constructor(deps: OrchestratorDeps, config?: Partial<ClawTalkConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.directory = new Directory();
    this.metrics = new MetricsTracker();
    this.deps = deps;

    // Initialize fallback chain if configured
    if (this.config.fallbackChain && this.config.fallbackChain.length > 0) {
      this.fallbackChain = new FallbackChain({
        chain: this.config.fallbackChain,
        cooldownMs: this.config.fallbackCooldownMs ?? 60_000,
        circuitBreakerThreshold: 3,
      });
    }
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

      // Step 4: Compress (ClawDense) if enabled
      let prompt: string;
      const compressionLevel = this.config.compressionLevel;
      const useCompression = compressionLevel !== undefined && compressionLevel !== "transport";

      if (useCompression) {
        // In "hybrid" and "native" modes, compress the CT/1 message for internal use
        const denseWire = applyLexiconCompression(toDense(encoded.message));
        prompt = buildAgentPrompt(encoded.message, userMessage, agent.name);
        wireLog.push(`⇒ dense: ${denseWire}`);

        // Track compression stats
        const verboseTokens = estimateTokens(userMessage);
        const denseTokens = estimateDenseTokens(denseWire);
        const ratio = verboseTokens > 0 ? denseTokens / verboseTokens : 1;
        this.deps.log?.debug?.(
          `[clawtalk] ClawDense: ${verboseTokens} → ${denseTokens} tokens (ratio=${ratio.toFixed(2)})`,
        );
      } else {
        prompt = buildAgentPrompt(encoded.message, userMessage, agent.name);
      }

      // In "transport" mode, compress only inter-agent (subagent handoff) messages
      // but pass user-facing prompt as-is (compression applied at handoff layer)

      // Step 5: Execute via the subagent (with fallback chain if configured)
      let response: string;

      if (this.fallbackChain) {
        // When escalation selected a specific model, try it first before
        // falling through to the configured chain. This ensures the
        // escalation model gets priority while still benefiting from
        // automatic hot-swap if it fails.
        const chainResult: FallbackResult<string> = await this.fallbackChain.execute(
          async (modelId: string) => {
            // If escalation selected a model and this is the first attempt,
            // override the chain's model with the escalation pick
            const effectiveModel = escalated && model ? model : modelId;
            return await this.deps.executePrompt({
              prompt,
              systemPrompt: agent.systemPrompt,
              model: effectiveModel,
              tools: agent.tools,
            });
          },
        );

        if (chainResult.success) {
          response = chainResult.result!;
          if (chainResult.attemptsCount > 1) {
            this.deps.log?.info?.(
              `[clawtalk] Fallback chain: ${chainResult.successModelId} ` +
              `succeeded after ${chainResult.attemptsCount} attempt(s)`,
            );
            wireLog.push(
              `⚡ fallback: ${chainResult.events.filter((e) => e.type === "fallback").map((e) => e.modelId).join(" → ")} → ${chainResult.successModelId}`,
            );
          }
        } else {
          throw chainResult.lastError ?? new Error("All models in fallback chain failed");
        }
      } else {
        // Direct execution without fallback chain
        response = await this.deps.executePrompt({
          prompt,
          systemPrompt: agent.systemPrompt,
          model,
          tools: agent.tools,
        });
      }

      // Step 6: Decompress response if it's in ClawDense format
      let decodedResponse = response;
      if (useCompression && response.trim().match(/^[!@?$#><=~.[\]]/)) {
        try {
          const expanded = applyLexiconExpansion(response);
          const ctMsg = fromDense(expanded);
          decodedResponse = ctMsg.params.text as string ?? ctMsg.params.result as string ?? expanded;
        } catch {
          // If decompression fails, use raw response
          decodedResponse = response;
        }
      }

      // Step 7: Build response CT message
      const responseMsg: ClawTalkMessage = {
        version: 1,
        verb: "RES",
        params: { ok: true, text: decodedResponse },
      };
      wireLog.push(`← ${serialize(responseMsg).slice(0, 200)}`);

      if (this.config.metrics) {
        this.metrics.recordDecode(true);
      }

      return {
        text: decodedResponse,
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
      .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
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
