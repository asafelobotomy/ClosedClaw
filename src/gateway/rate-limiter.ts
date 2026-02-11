/**
 * In-memory sliding-window rate limiter for the gateway HTTP server.
 *
 * Two tiers:
 * - **general**: applied to all requests (default: 200 req/min per IP)
 * - **auth**: applied to auth-sensitive endpoints (default: 20 req/min per IP)
 *
 * This is intentionally simple — no external dependencies. For production
 * deployments behind a reverse proxy, consider using the proxy's rate-limiting
 * features (e.g., Nginx limit_req, Cloudflare Rate Limiting).
 *
 * @module
 */

export interface RateLimiterOptions {
  /** Max requests per window (default: 200). */
  maxRequests?: number;
  /** Window size in milliseconds (default: 60_000 = 1 minute). */
  windowMs?: number;
}

interface RateBucket {
  /** Timestamps of requests within the current window. */
  timestamps: number[];
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, RateBucket>();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(opts?: RateLimiterOptions) {
    this.maxRequests = opts?.maxRequests ?? 200;
    this.windowMs = opts?.windowMs ?? 60_000;

    // Periodic cleanup of stale buckets every 2 minutes.
    this.cleanupTimer = setInterval(() => this.cleanup(), 120_000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref(); // Don't block process exit.
    }
  }

  /**
   * Check if a request from `key` (typically IP address) should be allowed.
   *
   * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
   */
  check(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    // Prune expired entries.
    bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

    if (bucket.timestamps.length >= this.maxRequests) {
      const oldestInWindow = bucket.timestamps[0]!;
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    bucket.timestamps.push(now);
    return { allowed: true };
  }

  /** Remove buckets that have had no activity in the last window. */
  private cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.timestamps.every((t) => t <= cutoff)) {
        this.buckets.delete(key);
      }
    }
  }

  /** Stop the cleanup interval (for graceful shutdown / tests). */
  dispose() {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.buckets.clear();
  }
}
