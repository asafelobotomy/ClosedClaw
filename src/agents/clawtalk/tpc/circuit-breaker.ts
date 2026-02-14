/**
 * TPC Circuit Breaker
 *
 * Monitors dead-drop transport health and trips to a fail-closed state
 * when consecutive failures exceed a threshold. When tripped, ALL
 * agent-to-agent messages are blocked (not silently routed to text).
 *
 * This is a security requirement: text fallback must be an explicit
 * decision, not a silent degradation.
 *
 * States:
 *   CLOSED  → Normal operation (dead-drop working)
 *   OPEN    → Tripped (dead-drop failing; messages BLOCKED)
 *   HALF    → Recovery probe: next message attempts dead-drop
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before tripping (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting recovery from OPEN state (default: 30000) */
  recoveryTimeoutMs: number;
  /** Time window for counting failures (default: 60000) */
  failureWindowMs: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  failureWindowMs: 60_000,
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = "closed";
  private failures: number[] = []; // timestamps of failures
  private lastTrippedAt: number = 0;
  private successesSinceHalfOpen: number = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Get the current circuit state.
   */
  getState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  /**
   * Check if a message is allowed through the circuit.
   *
   * Returns true if the circuit is CLOSED or HALF-OPEN (recovery probe).
   * Returns false if OPEN (messages are blocked).
   */
  isAllowed(): boolean {
    this.maybeTransitionToHalfOpen();
    return this.state !== "open";
  }

  /**
   * Record a successful dead-drop operation.
   */
  recordSuccess(): void {
    if (this.state === "half-open") {
      this.successesSinceHalfOpen++;
      // After 2 consecutive successes in half-open, close the circuit
      if (this.successesSinceHalfOpen >= 2) {
        this.state = "closed";
        this.failures = [];
        this.successesSinceHalfOpen = 0;
      }
    } else {
      // In closed state, prune old failures
      this.pruneOldFailures();
    }
  }

  /**
   * Record a dead-drop failure.
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.pruneOldFailures();

    if (this.state === "half-open") {
      // Failure during recovery → immediately re-trip
      this.state = "open";
      this.lastTrippedAt = now;
      this.successesSinceHalfOpen = 0;
      return;
    }

    // Check if we've exceeded the failure threshold
    if (this.failures.length >= this.config.failureThreshold) {
      this.state = "open";
      this.lastTrippedAt = now;
    }
  }

  /**
   * Manually reset the circuit breaker to closed state.
   */
  reset(): void {
    this.state = "closed";
    this.failures = [];
    this.lastTrippedAt = 0;
    this.successesSinceHalfOpen = 0;
  }

  /**
   * Get diagnostic info for debugging/logging.
   */
  getStats(): {
    state: CircuitState;
    recentFailures: number;
    lastTrippedAt: number;
    config: CircuitBreakerConfig;
  } {
    this.pruneOldFailures();
    return {
      state: this.getState(),
      recentFailures: this.failures.length,
      lastTrippedAt: this.lastTrippedAt,
      config: { ...this.config },
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private maybeTransitionToHalfOpen(): void {
    if (
      this.state === "open" &&
      Date.now() - this.lastTrippedAt >= this.config.recoveryTimeoutMs
    ) {
      this.state = "half-open";
      this.successesSinceHalfOpen = 0;
    }
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}
