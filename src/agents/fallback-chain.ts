/**
 * Fallback Chain Handler — Ordered model failover with logging
 *
 * When a model request fails (rate limit, service down, auth error),
 * the fallback chain tries the next model in sequence.
 *
 * Features:
 * - Ordered fallback chain: primary → fallback1 → fallback2 → ...
 * - Reason-aware: Different retry behavior for 429 vs 503 vs 401
 * - Cooldown tracking: Don't retry a recently-failed model
 * - Event logging: All fallback events emitted for audit integration
 * - Circuit breaker: After N consecutive failures, mark model as down
 *
 * Integrates with:
 * - `FailoverError` / `FailoverReason` from `src/agents/failover-error.ts`
 * - `ModelRoutingConfig` from `src/agents/intent-router.ts`
 * - Audit logger for security-relevant events
 *
 * @module agents/fallback-chain
 */

import type { FailoverReason } from "./pi-embedded-helpers/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for a fallback chain.
 */
export interface FallbackChainConfig {
  /** Ordered list of model IDs to try */
  chain: string[];

  /** Maximum number of retries across the chain (default: chain.length) */
  maxRetries?: number;

  /** Cooldown period after a model fails, in ms (default: 60000 = 1 min) */
  cooldownMs?: number;

  /** Number of consecutive failures before circuit-breaking a model (default: 3) */
  circuitBreakerThreshold?: number;

  /** Circuit breaker reset time in ms (default: 300000 = 5 min) */
  circuitBreakerResetMs?: number;
}

/**
 * State of a single model in the fallback chain.
 */
export interface ModelState {
  /** Model ID */
  modelId: string;

  /** Whether this model is currently available */
  available: boolean;

  /** Number of consecutive failures */
  consecutiveFailures: number;

  /** Timestamp of last failure (0 if never failed) */
  lastFailureAt: number;

  /** Last failure reason */
  lastFailureReason?: FailoverReason;

  /** Total number of successful calls */
  totalSuccesses: number;

  /** Total number of failed calls */
  totalFailures: number;

  /** Whether circuit breaker is tripped */
  circuitBroken: boolean;

  /** When circuit breaker was tripped */
  circuitBrokenAt: number;
}

/**
 * A fallback event emitted during chain execution.
 */
export interface FallbackEvent {
  /** Timestamp */
  timestamp: number;

  /** Event type */
  type: "attempt" | "fallback" | "success" | "exhausted" | "circuit_break" | "circuit_reset";

  /** Model that was tried */
  modelId: string;

  /** Position in the chain (0-indexed) */
  chainIndex: number;

  /** Failure reason (if type is "fallback") */
  reason?: FailoverReason;

  /** Error message (if failed) */
  error?: string;

  /** Next model to try (if type is "fallback") */
  nextModelId?: string;
}

/**
 * Result of a fallback chain attempt.
 */
export interface FallbackResult<T> {
  /** Whether any model succeeded */
  success: boolean;

  /** The successful result (if success) */
  result?: T;

  /** The model that succeeded */
  successModelId?: string;

  /** Position of successful model in chain */
  chainIndex?: number;

  /** All events during the chain execution */
  events: FallbackEvent[];

  /** Total models attempted */
  attemptsCount: number;

  /** Error from the last attempt (if all failed) */
  lastError?: Error;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3; // 3 consecutive failures → circuit break
const DEFAULT_CIRCUIT_BREAKER_RESET_MS = 300_000; // 5 minutes

/**
 * Reasons that should trigger an immediate fallback (don't retry same model).
 */
const IMMEDIATE_FALLBACK_REASONS: Set<FailoverReason> = new Set([
  "auth", // Bad key — won't fix itself
  "billing", // Account issue
  "rate_limit", // 429 — back off
]);

/**
 * Reasons that might be transient (could retry after brief delay).
 */
const TRANSIENT_REASONS: Set<FailoverReason> = new Set([
  "timeout", // Network blip
  "unknown", // Unclear, might recover
]);

// ─── Fallback Chain ─────────────────────────────────────────────────────────

/**
 * Manages an ordered fallback chain of models with health tracking.
 *
 * @example
 * ```typescript
 * const chain = new FallbackChain({
 *   chain: ["claude-opus-4", "gpt-4o", "ollama:llama3"],
 *   cooldownMs: 60000,
 *   circuitBreakerThreshold: 3,
 * });
 *
 * const result = await chain.execute(async (modelId) => {
 *   return await callModel(modelId, prompt);
 * });
 *
 * if (result.success) {
 *   console.log(`Used model: ${result.successModelId}`);
 * } else {
 *   console.log("All models failed");
 * }
 * ```
 */
export class FallbackChain {
  private readonly config: Required<FallbackChainConfig>;
  private readonly states: Map<string, ModelState> = new Map();
  private readonly eventLog: FallbackEvent[] = [];

  constructor(config: FallbackChainConfig) {
    this.config = {
      chain: [...config.chain],
      maxRetries: config.maxRetries ?? config.chain.length,
      cooldownMs: config.cooldownMs ?? DEFAULT_COOLDOWN_MS,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerResetMs: config.circuitBreakerResetMs ?? DEFAULT_CIRCUIT_BREAKER_RESET_MS,
    };

    // Initialize states
    for (const modelId of this.config.chain) {
      this.states.set(modelId, createInitialState(modelId));
    }
  }

  /**
   * Execute a function against the fallback chain.
   *
   * Tries each model in order. On failure, classifies the reason
   * and moves to the next available model.
   *
   * @param fn - Function to call with each model ID
   * @param classifyError - Extract FailoverReason from error (optional)
   * @returns Result with success/failure info and event log
   */
  async execute<T>(
    fn: (modelId: string) => Promise<T>,
    classifyError?: (error: Error) => FailoverReason,
  ): Promise<FallbackResult<T>> {
    const events: FallbackEvent[] = [];
    let attempts = 0;
    let lastError: Error | undefined;

    const now = Date.now();

    for (let i = 0; i < this.config.chain.length && attempts < this.config.maxRetries; i++) {
      const modelId = this.config.chain[i];
      const state = this.states.get(modelId)!;

      // Check circuit breaker
      if (state.circuitBroken) {
        if (now - state.circuitBrokenAt >= this.config.circuitBreakerResetMs) {
          // Reset circuit breaker — give the model another chance
          state.circuitBroken = false;
          state.consecutiveFailures = 0;
          state.circuitBrokenAt = 0;
          const resetEvent: FallbackEvent = {
            timestamp: now,
            type: "circuit_reset",
            modelId,
            chainIndex: i,
          };
          events.push(resetEvent);
          this.eventLog.push(resetEvent);
        } else {
          // Circuit still broken — skip this model
          continue;
        }
      }

      // Check cooldown
      if (state.lastFailureAt > 0 && now - state.lastFailureAt < this.config.cooldownMs) {
        // Still in cooldown — skip
        continue;
      }

      // Attempt this model
      attempts++;
      const attemptEvent: FallbackEvent = {
        timestamp: Date.now(),
        type: "attempt",
        modelId,
        chainIndex: i,
      };
      events.push(attemptEvent);
      this.eventLog.push(attemptEvent);

      try {
        const result = await fn(modelId);

        // Success!
        state.consecutiveFailures = 0;
        state.available = true;
        state.totalSuccesses++;

        const successEvent: FallbackEvent = {
          timestamp: Date.now(),
          type: "success",
          modelId,
          chainIndex: i,
        };
        events.push(successEvent);
        this.eventLog.push(successEvent);

        return {
          success: true,
          result,
          successModelId: modelId,
          chainIndex: i,
          events,
          attemptsCount: attempts,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        // Classify the failure
        const reason = classifyError?.(error) ?? classifyErrorDefault(error);

        // Update state
        state.consecutiveFailures++;
        state.lastFailureAt = Date.now();
        state.lastFailureReason = reason;
        state.totalFailures++;

        // Check circuit breaker
        if (state.consecutiveFailures >= this.config.circuitBreakerThreshold) {
          state.circuitBroken = true;
          state.circuitBrokenAt = Date.now();
          state.available = false;

          const cbEvent: FallbackEvent = {
            timestamp: Date.now(),
            type: "circuit_break",
            modelId,
            chainIndex: i,
            reason,
            error: error.message,
          };
          events.push(cbEvent);
          this.eventLog.push(cbEvent);
        }

        // Determine next model
        const nextIndex = findNextAvailable(
          this.config.chain,
          this.states,
          i + 1,
          now,
          this.config,
        );
        const nextModelId = nextIndex !== -1 ? this.config.chain[nextIndex] : undefined;

        const fallbackEvent: FallbackEvent = {
          timestamp: Date.now(),
          type: "fallback",
          modelId,
          chainIndex: i,
          reason,
          error: error.message,
          nextModelId,
        };
        events.push(fallbackEvent);
        this.eventLog.push(fallbackEvent);

        // For transient errors, we could retry the same model after a delay,
        // but for simplicity we just move to the next model
        if (IMMEDIATE_FALLBACK_REASONS.has(reason)) {
          // Skip ahead — don't retry this model soon
          continue;
        }
      }
    }

    // All models exhausted
    const exhaustedEvent: FallbackEvent = {
      timestamp: Date.now(),
      type: "exhausted",
      modelId: this.config.chain[this.config.chain.length - 1],
      chainIndex: this.config.chain.length - 1,
    };
    events.push(exhaustedEvent);
    this.eventLog.push(exhaustedEvent);

    return {
      success: false,
      events,
      attemptsCount: attempts,
      lastError,
    };
  }

  /**
   * Get the current state of all models in the chain.
   */
  getModelStates(): ModelState[] {
    return [...this.states.values()];
  }

  /**
   * Get all events since the chain was created.
   */
  getEventLog(): FallbackEvent[] {
    return [...this.eventLog];
  }

  /**
   * Get recent events (last N).
   */
  getRecentEvents(count: number): FallbackEvent[] {
    return this.eventLog.slice(-count);
  }

  /**
   * Reset a specific model's state (e.g., after fixing credentials).
   */
  resetModel(modelId: string): boolean {
    const state = this.states.get(modelId);
    if (!state) {
      return false;
    }

    Object.assign(state, createInitialState(modelId));
    return true;
  }

  /**
   * Reset all model states.
   */
  resetAll(): void {
    for (const [modelId] of this.states) {
      this.states.set(modelId, createInitialState(modelId));
    }
    this.eventLog.length = 0;
  }

  /**
   * Get a summary of chain health.
   */
  getHealthSummary(): {
    totalModels: number;
    availableModels: number;
    circuitBrokenModels: string[];
    totalAttempts: number;
    totalSuccesses: number;
    totalFailures: number;
  } {
    let available = 0;
    const circuitBroken: string[] = [];
    let totalSuccesses = 0;
    let totalFailures = 0;

    for (const state of this.states.values()) {
      if (state.available && !state.circuitBroken) {
        available++;
      }
      if (state.circuitBroken) {
        circuitBroken.push(state.modelId);
      }
      totalSuccesses += state.totalSuccesses;
      totalFailures += state.totalFailures;
    }

    return {
      totalModels: this.states.size,
      availableModels: available,
      circuitBrokenModels: circuitBroken,
      totalAttempts: totalSuccesses + totalFailures,
      totalSuccesses,
      totalFailures,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createInitialState(modelId: string): ModelState {
  return {
    modelId,
    available: true,
    consecutiveFailures: 0,
    lastFailureAt: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    circuitBroken: false,
    circuitBrokenAt: 0,
  };
}

function findNextAvailable(
  chain: string[],
  states: Map<string, ModelState>,
  startIndex: number,
  now: number,
  config: Required<FallbackChainConfig>,
): number {
  for (let i = startIndex; i < chain.length; i++) {
    const state = states.get(chain[i]);
    if (!state) {
      continue;
    }

    // Skip circuit-broken (unless reset time elapsed)
    if (state.circuitBroken && now - state.circuitBrokenAt < config.circuitBreakerResetMs) {
      continue;
    }

    // Skip if in cooldown
    if (state.lastFailureAt > 0 && now - state.lastFailureAt < config.cooldownMs) {
      continue;
    }

    return i;
  }
  return -1;
}

/**
 * Default error classifier when no custom classifier is provided.
 */
function classifyErrorDefault(error: Error): FailoverReason {
  const msg = error.message.toLowerCase();

  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
    return "rate_limit";
  }
  if (
    msg.includes("auth") ||
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden")
  ) {
    return "auth";
  }
  if (
    msg.includes("billing") ||
    msg.includes("402") ||
    msg.includes("payment") ||
    msg.includes("quota")
  ) {
    return "billing";
  }
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("abort")
  ) {
    return "timeout";
  }

  return "unknown";
}

// Re-export for convenience (avoid needing to import from TRANSIENT_REASONS to check)
export { IMMEDIATE_FALLBACK_REASONS, TRANSIENT_REASONS };
