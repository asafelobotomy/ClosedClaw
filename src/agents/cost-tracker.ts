/**
 * Cost Tracker — Track token usage and costs per model
 *
 * Records token usage (input/output/cache) for every model call
 * and computes costs using the model's configured pricing.
 *
 * Features:
 * - Per-model and per-agent cost tracking
 * - Time-windowed queries (last 24h, 7d, 30d)
 * - Budget alerts when approaching limits
 * - Usage summaries for CLI reporting
 *
 * Built for integration with:
 * - ModelDefinitionConfig.cost from config/types.models.ts
 * - FallbackChain events (track which model actually handled tokens)
 * - Intent router (track costs per intent category)
 *
 * @module agents/cost-tracker
 */

import type { IntentCategory } from "./intent-router.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Cost rates for a model (per 1M tokens).
 */
export interface ModelCostRates {
  /** Cost per 1M input tokens */
  input: number;
  /** Cost per 1M output tokens */
  output: number;
  /** Cost per 1M cache-read tokens */
  cacheRead: number;
  /** Cost per 1M cache-write tokens */
  cacheWrite: number;
}

/**
 * A single usage record.
 */
export interface UsageRecord {
  /** Timestamp of the usage event */
  timestamp: number;

  /** Model that was used */
  modelId: string;

  /** Agent that made the call */
  agentId: string;

  /** Intent category (if classified) */
  intent?: IntentCategory;

  /** Tokens consumed */
  tokens: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };

  /** Computed cost in USD */
  costUsd: number;

  /** Whether this was a fallback call */
  isFallback: boolean;

  /** Session ID for correlation */
  sessionId?: string;
}

/**
 * Aggregated usage summary.
 */
export interface UsageSummary {
  /** Time period start */
  since: number;

  /** Time period end */
  until: number;

  /** Total number of calls */
  totalCalls: number;

  /** Total tokens across all models */
  totalTokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };

  /** Total cost in USD */
  totalCostUsd: number;

  /** Breakdown by model */
  byModel: Map<string, ModelUsageSummary>;

  /** Breakdown by agent */
  byAgent: Map<string, AgentUsageSummary>;

  /** Breakdown by intent */
  byIntent: Map<IntentCategory, number>;

  /** Fallback stats */
  fallbackCalls: number;
  fallbackCostUsd: number;
}

/**
 * Per-model usage summary.
 */
export interface ModelUsageSummary {
  modelId: string;
  calls: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
  avgTokensPerCall: number;
}

/**
 * Per-agent usage summary.
 */
export interface AgentUsageSummary {
  agentId: string;
  calls: number;
  costUsd: number;
  primaryModel: string;
}

/**
 * Budget alert when usage approaches or exceeds a limit.
 */
export interface BudgetAlert {
  type: "warning" | "exceeded";
  modelId?: string;
  agentId?: string;
  currentCostUsd: number;
  limitUsd: number;
  period: string;
  timestamp: number;
}

/**
 * Budget configuration.
 */
export interface BudgetConfig {
  /** Per-model daily budget in USD */
  perModelDaily?: Record<string, number>;

  /** Per-agent daily budget in USD */
  perAgentDaily?: Record<string, number>;

  /** Global daily budget in USD */
  globalDaily?: number;

  /** Warning threshold (0–1, default: 0.8 = warn at 80%) */
  warningThreshold?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = MS_PER_DAY * 7;
const MS_PER_MONTH = MS_PER_DAY * 30;
const DEFAULT_WARNING_THRESHOLD = 0.8;
const MAX_RECORDS = 100_000; // Keep last 100k records in memory

/**
 * Common time periods for queries.
 */
export const TIME_PERIODS = {
  HOUR: 3_600_000,
  DAY: MS_PER_DAY,
  WEEK: MS_PER_WEEK,
  MONTH: MS_PER_MONTH,
} as const;

// ─── Cost Computation ───────────────────────────────────────────────────────

/**
 * Compute the cost of a single API call.
 *
 * @param tokens - Token counts
 * @param rates - Model cost rates (per 1M tokens)
 * @returns Cost in USD
 */
export function computeCost(
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
  rates: ModelCostRates,
): number {
  const factor = 1 / 1_000_000; // Per-token rate from per-1M rate
  return (
    tokens.input * rates.input * factor +
    tokens.output * rates.output * factor +
    (tokens.cacheRead ?? 0) * rates.cacheRead * factor +
    (tokens.cacheWrite ?? 0) * rates.cacheWrite * factor
  );
}

// ─── Cost Tracker ───────────────────────────────────────────────────────────

/**
 * Tracks token usage and costs across models and agents.
 *
 * @example
 * ```typescript
 * const tracker = new CostTracker();
 *
 * // Register model costs
 * tracker.registerModelRates("claude-opus-4", {
 *   input: 15, output: 75, cacheRead: 1.5, cacheWrite: 3.75,
 * });
 *
 * // Record usage
 * tracker.record({
 *   modelId: "claude-opus-4",
 *   agentId: "main",
 *   tokens: { input: 1000, output: 500 },
 * });
 *
 * // Query costs
 * const summary = tracker.summarize({ since: Date.now() - 86400000 });
 * console.log(`Today's cost: $${summary.totalCostUsd.toFixed(4)}`);
 * ```
 */
export class CostTracker {
  private readonly records: UsageRecord[] = [];
  private readonly modelRates: Map<string, ModelCostRates> = new Map();
  private budgetConfig: BudgetConfig = {};
  private readonly alerts: BudgetAlert[] = [];

  /**
   * Register cost rates for a model.
   */
  registerModelRates(modelId: string, rates: ModelCostRates): void {
    this.modelRates.set(modelId, rates);
  }

  /**
   * Register rates from a model definitions map.
   */
  registerModelRatesBatch(
    models: Record<string, { cost: ModelCostRates }>,
  ): void {
    for (const [id, def] of Object.entries(models)) {
      this.modelRates.set(id, def.cost);
    }
  }

  /**
   * Set budget configuration.
   */
  setBudgetConfig(config: BudgetConfig): void {
    this.budgetConfig = config;
  }

  /**
   * Record a usage event.
   */
  record(event: {
    modelId: string;
    agentId: string;
    intent?: IntentCategory;
    tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
    isFallback?: boolean;
    sessionId?: string;
  }): UsageRecord {
    const rates = this.modelRates.get(event.modelId);
    const costUsd = rates ? computeCost(event.tokens, rates) : 0;

    const record: UsageRecord = {
      timestamp: Date.now(),
      modelId: event.modelId,
      agentId: event.agentId,
      intent: event.intent,
      tokens: {
        input: event.tokens.input,
        output: event.tokens.output,
        cacheRead: event.tokens.cacheRead ?? 0,
        cacheWrite: event.tokens.cacheWrite ?? 0,
      },
      costUsd,
      isFallback: event.isFallback ?? false,
      sessionId: event.sessionId,
    };

    this.records.push(record);

    // Evict old records if over limit
    if (this.records.length > MAX_RECORDS) {
      this.records.splice(0, this.records.length - MAX_RECORDS);
    }

    // Check budgets
    this.checkBudgets(record);

    return record;
  }

  /**
   * Get a usage summary for a time period.
   */
  summarize(opts?: {
    since?: number;
    until?: number;
    modelId?: string;
    agentId?: string;
  }): UsageSummary {
    const since = opts?.since ?? 0;
    const until = opts?.until ?? Date.now();

    const filtered = this.records.filter((r) => {
      if (r.timestamp < since || r.timestamp > until) return false;
      if (opts?.modelId && r.modelId !== opts.modelId) return false;
      if (opts?.agentId && r.agentId !== opts.agentId) return false;
      return true;
    });

    const totalTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let totalCostUsd = 0;
    let fallbackCalls = 0;
    let fallbackCostUsd = 0;

    const byModel = new Map<string, ModelUsageSummary>();
    const byAgent = new Map<string, AgentUsageSummary>();
    const byIntent = new Map<IntentCategory, number>();

    for (const r of filtered) {
      // Totals
      totalTokens.input += r.tokens.input;
      totalTokens.output += r.tokens.output;
      totalTokens.cacheRead += r.tokens.cacheRead ?? 0;
      totalTokens.cacheWrite += r.tokens.cacheWrite ?? 0;
      totalCostUsd += r.costUsd;

      if (r.isFallback) {
        fallbackCalls++;
        fallbackCostUsd += r.costUsd;
      }

      // By model
      let modelSummary = byModel.get(r.modelId);
      if (!modelSummary) {
        modelSummary = {
          modelId: r.modelId,
          calls: 0,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          costUsd: 0,
          avgTokensPerCall: 0,
        };
        byModel.set(r.modelId, modelSummary);
      }
      modelSummary.calls++;
      modelSummary.tokens.input += r.tokens.input;
      modelSummary.tokens.output += r.tokens.output;
      modelSummary.tokens.cacheRead += r.tokens.cacheRead ?? 0;
      modelSummary.tokens.cacheWrite += r.tokens.cacheWrite ?? 0;
      modelSummary.costUsd += r.costUsd;
      modelSummary.avgTokensPerCall =
        (modelSummary.tokens.input + modelSummary.tokens.output) / modelSummary.calls;

      // By agent
      let agentSummary = byAgent.get(r.agentId);
      if (!agentSummary) {
        agentSummary = {
          agentId: r.agentId,
          calls: 0,
          costUsd: 0,
          primaryModel: r.modelId,
        };
        byAgent.set(r.agentId, agentSummary);
      }
      agentSummary.calls++;
      agentSummary.costUsd += r.costUsd;

      // By intent
      if (r.intent) {
        byIntent.set(r.intent, (byIntent.get(r.intent) ?? 0) + r.costUsd);
      }
    }

    return {
      since,
      until,
      totalCalls: filtered.length,
      totalTokens,
      totalCostUsd,
      byModel,
      byAgent,
      byIntent,
      fallbackCalls,
      fallbackCostUsd,
    };
  }

  /**
   * Get cost for a specific model over a time period.
   */
  modelCost(modelId: string, sinceMs?: number): number {
    const since = sinceMs ?? 0;
    return this.records
      .filter((r) => r.modelId === modelId && r.timestamp >= since)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /**
   * Get cost for a specific agent over a time period.
   */
  agentCost(agentId: string, sinceMs?: number): number {
    const since = sinceMs ?? 0;
    return this.records
      .filter((r) => r.agentId === agentId && r.timestamp >= since)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /**
   * Get all budget alerts.
   */
  getAlerts(): BudgetAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear alerts.
   */
  clearAlerts(): void {
    this.alerts.length = 0;
  }

  /**
   * Get total record count.
   */
  get recordCount(): number {
    return this.records.length;
  }

  /**
   * Get all records (for persistence).
   */
  getRecords(): UsageRecord[] {
    return [...this.records];
  }

  /**
   * Load records from persistence.
   */
  loadRecords(records: UsageRecord[]): void {
    this.records.push(...records);
    // Enforce max
    if (this.records.length > MAX_RECORDS) {
      this.records.splice(0, this.records.length - MAX_RECORDS);
    }
  }

  // ─── Budget Checking ────────────────────────────────────────────────────

  private checkBudgets(record: UsageRecord): void {
    const threshold = this.budgetConfig.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    const dayStart = Date.now() - MS_PER_DAY;

    // Check per-model daily budget
    if (this.budgetConfig.perModelDaily) {
      const limit = this.budgetConfig.perModelDaily[record.modelId];
      if (limit !== undefined) {
        const current = this.modelCost(record.modelId, dayStart);
        this.emitBudgetAlert(current, limit, threshold, {
          modelId: record.modelId,
          period: "daily",
        });
      }
    }

    // Check per-agent daily budget
    if (this.budgetConfig.perAgentDaily) {
      const limit = this.budgetConfig.perAgentDaily[record.agentId];
      if (limit !== undefined) {
        const current = this.agentCost(record.agentId, dayStart);
        this.emitBudgetAlert(current, limit, threshold, {
          agentId: record.agentId,
          period: "daily",
        });
      }
    }

    // Check global daily budget
    if (this.budgetConfig.globalDaily !== undefined) {
      const current = this.records
        .filter((r) => r.timestamp >= dayStart)
        .reduce((sum, r) => sum + r.costUsd, 0);
      this.emitBudgetAlert(current, this.budgetConfig.globalDaily, threshold, {
        period: "daily",
      });
    }
  }

  private emitBudgetAlert(
    current: number,
    limit: number,
    threshold: number,
    context: { modelId?: string; agentId?: string; period: string },
  ): void {
    if (current >= limit) {
      this.alerts.push({
        type: "exceeded",
        modelId: context.modelId,
        agentId: context.agentId,
        currentCostUsd: current,
        limitUsd: limit,
        period: context.period,
        timestamp: Date.now(),
      });
    } else if (current >= limit * threshold) {
      this.alerts.push({
        type: "warning",
        modelId: context.modelId,
        agentId: context.agentId,
        currentCostUsd: current,
        limitUsd: limit,
        period: context.period,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Format a cost summary for CLI display.
 */
export function formatUsageSummary(summary: UsageSummary): string {
  const lines: string[] = [];

  lines.push(`Usage Summary (${formatTimeRange(summary.since, summary.until)})`);
  lines.push("─".repeat(60));
  lines.push(`Total calls: ${summary.totalCalls}`);
  lines.push(`Total cost: $${summary.totalCostUsd.toFixed(4)}`);
  lines.push(
    `Total tokens: ${formatNumber(summary.totalTokens.input)} in / ${formatNumber(summary.totalTokens.output)} out`,
  );

  if (summary.fallbackCalls > 0) {
    lines.push(
      `Fallback calls: ${summary.fallbackCalls} ($${summary.fallbackCostUsd.toFixed(4)})`,
    );
  }

  // By model
  if (summary.byModel.size > 0) {
    lines.push("");
    lines.push("By Model:");
    for (const [, model] of [...summary.byModel.entries()].sort(
      (a, b) => b[1].costUsd - a[1].costUsd,
    )) {
      lines.push(
        `  ${model.modelId}: ${model.calls} calls, $${model.costUsd.toFixed(4)}, ~${formatNumber(model.avgTokensPerCall)} tokens/call`,
      );
    }
  }

  // By agent
  if (summary.byAgent.size > 0) {
    lines.push("");
    lines.push("By Agent:");
    for (const [, agent] of [...summary.byAgent.entries()].sort(
      (a, b) => b[1].costUsd - a[1].costUsd,
    )) {
      lines.push(
        `  ${agent.agentId}: ${agent.calls} calls, $${agent.costUsd.toFixed(4)}`,
      );
    }
  }

  return lines.join("\n");
}

function formatTimeRange(since: number, until: number): string {
  if (since === 0) return "all time";
  const duration = until - since;
  if (duration <= MS_PER_DAY) return "last 24h";
  if (duration <= MS_PER_WEEK) return "last 7d";
  if (duration <= MS_PER_MONTH) return "last 30d";
  return `${Math.round(duration / MS_PER_DAY)}d`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}
