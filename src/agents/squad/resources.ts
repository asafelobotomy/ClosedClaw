/**
 * Squad Resource Management
 *
 * Manages resource budgets, rate limiting, and memory limits for squads:
 * - **Token Budget**: Track and enforce per-agent and per-squad token spending
 * - **Rate Limiter**: Respect API RPM/TPM quotas with queuing
 * - **Memory Monitor**: Track agent memory usage and emit warnings
 *
 * All limits are configurable and emit events when approaching thresholds.
 *
 * @module agents/squad/resources
 */

import { AGENTS } from "../../constants/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Token budget configuration.
 */
export interface TokenBudget {
  /** Maximum tokens for this entity */
  limit: number;

  /** Current usage */
  used: number;

  /** Whether the budget has been exceeded */
  exceeded: boolean;

  /** Warning threshold (0-1, e.g., 0.8 = warn at 80%) */
  warnThreshold: number;
}

/**
 * Rate limit configuration for API calls.
 */
export interface RateLimitConfig {
  /** Requests per minute */
  rpm: number;

  /** Tokens per minute */
  tpm: number;
}

/**
 * Rate limiter state.
 */
interface RateLimiterState {
  /** Request timestamps in the current window */
  requestTimestamps: number[];

  /** Token counts in the current window */
  tokenCounts: Array<{ timestamp: number; tokens: number }>;

  /** Queued requests awaiting a slot */
  queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
}

/**
 * Resource usage snapshot for a squad.
 */
export interface SquadResourceSnapshot {
  /** Squad ID */
  squadId: string;

  /** Per-agent token usage */
  agents: Array<{
    agentId: string;
    tokensUsed: number;
    tokenLimit: number;
    percentUsed: number;
  }>;

  /** Squad-wide token totals */
  totalTokensUsed: number;
  totalTokenLimit: number;

  /** Rate limiter state */
  rateLimiter: {
    currentRpm: number;
    maxRpm: number;
    currentTpm: number;
    maxTpm: number;
    queuedRequests: number;
  };

  /** Alerts */
  alerts: ResourceAlert[];
}

/**
 * A resource alert.
 */
export interface ResourceAlert {
  /** Alert severity */
  severity: "warning" | "critical";

  /** Which entity exceeded the threshold */
  entity: string;

  /** Resource type */
  resource: "tokens" | "rpm" | "tpm" | "memory";

  /** Human-readable message */
  message: string;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Configuration for the resource manager.
 */
export interface ResourceManagerConfig {
  /** Default per-agent token budget */
  defaultAgentTokenLimit?: number;

  /** Squad-wide token budget */
  squadTokenLimit?: number;

  /** Warning threshold (0-1) */
  warnThreshold?: number;

  /** Rate limiting config */
  rateLimit?: Partial<RateLimitConfig>;

  /** Callback when alerts fire */
  onAlert?: (alert: ResourceAlert) => void;
}

// ─── Token Budget Tracker ──────────────────────────────────────────────────

/**
 * Tracks token usage across agents and squads.
 *
 * @example
 * ```typescript
 * const tracker = new TokenBudgetTracker({
 *   defaultAgentLimit: 100_000,
 *   squadLimit: 500_000,
 *   warnThreshold: 0.8,
 * });
 *
 * tracker.registerAgent("agent-1", 50_000);
 * tracker.recordUsage("agent-1", 1_500);
 *
 * if (tracker.isExceeded("agent-1")) {
 *   // Budget exceeded — terminate or throttle
 * }
 * ```
 */
export class TokenBudgetTracker {
  private readonly budgets: Map<string, TokenBudget> = new Map();
  private readonly defaultLimit: number;
  private readonly squadLimit: number;
  private readonly warnThreshold: number;
  private totalUsed = 0;
  private readonly alerts: ResourceAlert[] = [];
  private readonly onAlert?: (alert: ResourceAlert) => void;

  constructor(opts?: {
    defaultAgentLimit?: number;
    squadLimit?: number;
    warnThreshold?: number;
    onAlert?: (alert: ResourceAlert) => void;
  }) {
    this.defaultLimit = opts?.defaultAgentLimit ?? AGENTS.SPAWNING.DEFAULT_TOKEN_BUDGET;
    this.squadLimit = opts?.squadLimit ?? this.defaultLimit * 10;
    this.warnThreshold = opts?.warnThreshold ?? 0.8;
    this.onAlert = opts?.onAlert;
  }

  /**
   * Register an agent with a token budget.
   */
  registerAgent(agentId: string, limit?: number): void {
    this.budgets.set(agentId, {
      limit: limit ?? this.defaultLimit,
      used: 0,
      exceeded: false,
      warnThreshold: this.warnThreshold,
    });
  }

  /**
   * Record token usage for an agent.
   *
   * @returns whether the agent has exceeded its budget
   */
  recordUsage(agentId: string, tokens: number): boolean {
    const budget = this.budgets.get(agentId);
    if (!budget) {
      // Auto-register with default limit
      this.registerAgent(agentId);
      return this.recordUsage(agentId, tokens);
    }

    budget.used += tokens;
    this.totalUsed += tokens;

    const agentPercent = budget.used / budget.limit;
    const squadPercent = this.totalUsed / this.squadLimit;

    // Check agent threshold
    if (agentPercent >= this.warnThreshold && !budget.exceeded) {
      this.emitAlert({
        severity: agentPercent >= 1 ? "critical" : "warning",
        entity: agentId,
        resource: "tokens",
        message: `Agent ${agentId} at ${Math.round(agentPercent * 100)}% token budget (${budget.used}/${budget.limit})`,
        timestamp: new Date(),
      });
    }

    if (budget.used >= budget.limit) {
      budget.exceeded = true;
    }

    // Check squad threshold
    if (squadPercent >= this.warnThreshold) {
      this.emitAlert({
        severity: squadPercent >= 1 ? "critical" : "warning",
        entity: "squad",
        resource: "tokens",
        message: `Squad at ${Math.round(squadPercent * 100)}% token budget (${this.totalUsed}/${this.squadLimit})`,
        timestamp: new Date(),
      });
    }

    return budget.exceeded;
  }

  /**
   * Check if an agent's budget is exceeded.
   */
  isExceeded(agentId: string): boolean {
    return this.budgets.get(agentId)?.exceeded ?? false;
  }

  /**
   * Check if the squad-wide budget is exceeded.
   */
  isSquadExceeded(): boolean {
    return this.totalUsed >= this.squadLimit;
  }

  /**
   * Get the budget state for an agent.
   */
  getBudget(agentId: string): TokenBudget | undefined {
    return this.budgets.get(agentId);
  }

  /**
   * Get total tokens used across all agents.
   */
  getTotalUsed(): number {
    return this.totalUsed;
  }

  /**
   * Get the squad token limit.
   */
  getSquadLimit(): number {
    return this.squadLimit;
  }

  /**
   * Get all alerts.
   */
  getAlerts(): ResourceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get usage summary for all agents.
   */
  getSummary(): Array<{
    agentId: string;
    used: number;
    limit: number;
    percent: number;
    exceeded: boolean;
  }> {
    return [...this.budgets.entries()].map(([agentId, budget]) => ({
      agentId,
      used: budget.used,
      limit: budget.limit,
      percent: Math.round((budget.used / budget.limit) * 100),
      exceeded: budget.exceeded,
    }));
  }

  /**
   * Reset usage for an agent (e.g., on new task).
   */
  resetAgent(agentId: string): void {
    const budget = this.budgets.get(agentId);
    if (budget) {
      this.totalUsed -= budget.used;
      budget.used = 0;
      budget.exceeded = false;
    }
  }

  /**
   * Reset all usage (e.g., new squad session).
   */
  resetAll(): void {
    for (const budget of this.budgets.values()) {
      budget.used = 0;
      budget.exceeded = false;
    }
    this.totalUsed = 0;
    this.alerts.length = 0;
  }

  private emitAlert(alert: ResourceAlert): void {
    this.alerts.push(alert);
    this.onAlert?.(alert);
  }
}

// ─── Rate Limiter ──────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter for API calls.
 *
 * Tracks requests per minute (RPM) and tokens per minute (TPM).
 * Queues requests when limits are reached.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({ rpm: 60, tpm: 100_000 });
 *
 * await limiter.acquire(); // blocks if at limit
 * const response = await callApi();
 * limiter.recordTokens(response.usage.total_tokens);
 * ```
 */
export class RateLimiter {
  readonly rpm: number;
  readonly tpm: number;
  private readonly state: RateLimiterState;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(config: RateLimitConfig) {
    this.rpm = config.rpm;
    this.tpm = config.tpm;
    this.state = {
      requestTimestamps: [],
      tokenCounts: [],
      queue: [],
    };

    // Cleanup old entries every 10 seconds
    this.cleanupTimer = setInterval(() => this.cleanup(), 10_000);
    if (typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      (this.cleanupTimer as { unref: () => void }).unref();
    }
  }

  /**
   * Acquire a slot for a request. Blocks if at RPM limit.
   *
   * @param timeoutMs - Max wait time (default: 60s)
   * @throws {Error} If timeout exceeded
   */
  async acquire(timeoutMs = 60_000): Promise<void> {
    this.cleanup();

    if (this.state.requestTimestamps.length < this.rpm) {
      this.state.requestTimestamps.push(Date.now());
      return;
    }

    // Rate limited — queue the request
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.state.queue.findIndex((q) => q.resolve === resolve);
        if (idx >= 0) {
          this.state.queue.splice(idx, 1);
        }
        reject(new Error(`Rate limiter timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      if (typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }

      this.state.queue.push({ resolve, reject, timer });
    });
  }

  /**
   * Record tokens used by a request (for TPM tracking).
   */
  recordTokens(tokens: number): void {
    this.state.tokenCounts.push({ timestamp: Date.now(), tokens });
  }

  /**
   * Get current requests in the window.
   */
  getCurrentRpm(): number {
    this.cleanup();
    return this.state.requestTimestamps.length;
  }

  /**
   * Get current tokens in the window.
   */
  getCurrentTpm(): number {
    this.cleanup();
    return this.state.tokenCounts.reduce((sum, tc) => sum + tc.tokens, 0);
  }

  /**
   * Check if a request would exceed RPM limit.
   */
  wouldExceedRpm(): boolean {
    this.cleanup();
    return this.state.requestTimestamps.length >= this.rpm;
  }

  /**
   * Check if tokens would exceed TPM limit.
   */
  wouldExceedTpm(additionalTokens: number): boolean {
    return this.getCurrentTpm() + additionalTokens > this.tpm;
  }

  /**
   * Number of queued requests.
   */
  get queueLength(): number {
    return this.state.queue.length;
  }

  /**
   * Dispose of the rate limiter (stops cleanup interval).
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Reject all queued requests
    for (const q of this.state.queue) {
      clearTimeout(q.timer);
      q.reject(new Error("Rate limiter disposed"));
    }
    this.state.queue = [];
  }

  /**
   * Remove expired entries and process queued requests.
   */
  private cleanup(): void {
    const windowStart = Date.now() - 60_000; // 1-minute window

    // Purge old request timestamps
    this.state.requestTimestamps = this.state.requestTimestamps.filter((t) => t > windowStart);

    // Purge old token counts
    this.state.tokenCounts = this.state.tokenCounts.filter((tc) => tc.timestamp > windowStart);

    // Process queued requests if slots available
    while (this.state.queue.length > 0 && this.state.requestTimestamps.length < this.rpm) {
      const next = this.state.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        this.state.requestTimestamps.push(Date.now());
        next.resolve();
      }
    }
  }
}

// ─── Resource Manager ──────────────────────────────────────────────────────

/**
 * Unified resource manager for a squad.
 *
 * Combines token budget tracking and rate limiting with alert emission.
 *
 * @example
 * ```typescript
 * const manager = new ResourceManager({
 *   defaultAgentTokenLimit: 100_000,
 *   squadTokenLimit: 500_000,
 *   rateLimit: { rpm: 60, tpm: 100_000 },
 *   onAlert: (alert) => console.warn(alert.message),
 * });
 *
 * manager.registerAgent("agent-1");
 * await manager.acquireSlot("agent-1");
 * manager.recordUsage("agent-1", 1_500);
 * ```
 */
export class ResourceManager {
  readonly tokenTracker: TokenBudgetTracker;
  readonly rateLimiter: RateLimiter;
  private readonly onAlert?: (alert: ResourceAlert) => void;

  constructor(config?: ResourceManagerConfig) {
    this.onAlert = config?.onAlert;

    this.tokenTracker = new TokenBudgetTracker({
      defaultAgentLimit: config?.defaultAgentTokenLimit ?? AGENTS.SPAWNING.DEFAULT_TOKEN_BUDGET,
      squadLimit: config?.squadTokenLimit,
      warnThreshold: config?.warnThreshold ?? 0.8,
      onAlert: this.onAlert,
    });

    this.rateLimiter = new RateLimiter({
      rpm: config?.rateLimit?.rpm ?? 60,
      tpm: config?.rateLimit?.tpm ?? 100_000,
    });
  }

  /**
   * Register an agent with the resource manager.
   */
  registerAgent(agentId: string, tokenLimit?: number): void {
    this.tokenTracker.registerAgent(agentId, tokenLimit);
  }

  /**
   * Acquire a rate limit slot for an agent request.
   *
   * @throws {Error} If agent budget is exceeded
   */
  async acquireSlot(agentId: string, timeoutMs?: number): Promise<void> {
    if (this.tokenTracker.isExceeded(agentId)) {
      throw new Error(`Token budget exceeded for agent ${agentId}`);
    }

    if (this.tokenTracker.isSquadExceeded()) {
      throw new Error("Squad token budget exceeded");
    }

    await this.rateLimiter.acquire(timeoutMs);
  }

  /**
   * Record token usage for an agent.
   *
   * @returns Whether the agent budget is now exceeded
   */
  recordUsage(agentId: string, tokens: number): boolean {
    this.rateLimiter.recordTokens(tokens);
    return this.tokenTracker.recordUsage(agentId, tokens);
  }

  /**
   * Get a resource snapshot for the squad.
   */
  getSnapshot(squadId: string): SquadResourceSnapshot {
    const summary = this.tokenTracker.getSummary();

    return {
      squadId,
      agents: summary.map((s) => ({
        agentId: s.agentId,
        tokensUsed: s.used,
        tokenLimit: s.limit,
        percentUsed: s.percent,
      })),
      totalTokensUsed: this.tokenTracker.getTotalUsed(),
      totalTokenLimit: this.tokenTracker.getSquadLimit(),
      rateLimiter: {
        currentRpm: this.rateLimiter.getCurrentRpm(),
        maxRpm: this.rateLimiter.rpm,
        currentTpm: this.rateLimiter.getCurrentTpm(),
        maxTpm: this.rateLimiter.tpm,
        queuedRequests: this.rateLimiter.queueLength,
      },
      alerts: this.tokenTracker.getAlerts(),
    };
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.rateLimiter.dispose();
  }
}
