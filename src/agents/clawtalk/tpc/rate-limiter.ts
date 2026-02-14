/**
 * TPC Per-Agent Rate Limiter
 *
 * Sliding window rate limiter that tracks message counts per agent.
 * Prevents runaway agents from flooding the dead-drop transport.
 *
 * Uses a fixed-window approximation for efficiency:
 *   weighted_count = prev_window_count * overlap_fraction + current_window_count
 */

export interface RateLimiterConfig {
  /** Max messages per agent per window (default: 100) */
  maxPerWindow: number;
  /** Window size in ms (default: 60000 = 1 minute) */
  windowMs: number;
}

const DEFAULT_RATE_CONFIG: RateLimiterConfig = {
  maxPerWindow: 100,
  windowMs: 60_000,
};

interface AgentBucket {
  current: number;
  previous: number;
  windowStart: number;
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private buckets: Map<string, AgentBucket> = new Map();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_CONFIG, ...config };
  }

  /**
   * Check if an agent is allowed to send a message.
   * Does NOT consume a slot — call `record()` after actual send.
   */
  isAllowed(agentId: string): boolean {
    const count = this.getWeightedCount(agentId);
    return count < this.config.maxPerWindow;
  }

  /**
   * Record a message from an agent. Returns false if rate limit exceeded.
   */
  record(agentId: string): boolean {
    if (!this.isAllowed(agentId)) {
      return false;
    }

    const bucket = this.getOrCreateBucket(agentId);
    this.maybeRotateWindow(bucket);
    bucket.current++;
    return true;
  }

  /**
   * Get the current weighted count for an agent (for diagnostics).
   */
  getWeightedCount(agentId: string): number {
    const bucket = this.buckets.get(agentId);
    if (!bucket) return 0;

    this.maybeRotateWindow(bucket);

    const now = Date.now();
    const elapsed = now - bucket.windowStart;
    const overlap = Math.max(0, 1 - elapsed / this.config.windowMs);

    return bucket.previous * overlap + bucket.current;
  }

  /**
   * Get the remaining capacity for an agent.
   */
  remaining(agentId: string): number {
    return Math.max(0, Math.floor(this.config.maxPerWindow - this.getWeightedCount(agentId)));
  }

  /**
   * Reset rate limiting for a specific agent.
   */
  resetAgent(agentId: string): void {
    this.buckets.delete(agentId);
  }

  /**
   * Reset all rate limiting state.
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Get stats for all tracked agents.
   */
  getStats(): Array<{
    agentId: string;
    weightedCount: number;
    remaining: number;
    limited: boolean;
  }> {
    const result: Array<{
      agentId: string;
      weightedCount: number;
      remaining: number;
      limited: boolean;
    }> = [];

    for (const agentId of this.buckets.keys()) {
      const wc = this.getWeightedCount(agentId);
      result.push({
        agentId,
        weightedCount: Math.round(wc * 100) / 100,
        remaining: this.remaining(agentId),
        limited: wc >= this.config.maxPerWindow,
      });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private getOrCreateBucket(agentId: string): AgentBucket {
    let bucket = this.buckets.get(agentId);
    if (!bucket) {
      bucket = {
        current: 0,
        previous: 0,
        windowStart: Date.now(),
      };
      this.buckets.set(agentId, bucket);
    }
    return bucket;
  }

  private maybeRotateWindow(bucket: AgentBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.windowStart;

    if (elapsed >= this.config.windowMs) {
      // How many full windows have elapsed?
      const windowsPassed = Math.floor(elapsed / this.config.windowMs);
      if (windowsPassed >= 2) {
        // More than 2 full windows — all old counts are irrelevant
        bucket.previous = 0;
        bucket.current = 0;
      } else {
        // Exactly 1 window passed — rotate
        bucket.previous = bucket.current;
        bucket.current = 0;
      }
      bucket.windowStart = now;
    }
  }
}
