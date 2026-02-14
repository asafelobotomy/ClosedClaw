/**
 * ClawTalk Metrics Tracker
 *
 * Tracks compression ratios, comprehension rates, token savings,
 * and per-macro/per-intent usage statistics.
 */

import type { ClawTalkMetrics, IntentCategory } from "./types.js";
import { estimateTokens } from "./encoder.js";

/** In-memory metrics tracker */
export class MetricsTracker {
  private metrics: ClawTalkMetrics;

  constructor() {
    this.metrics = createEmptyMetrics();
  }

  /** Record an encode operation */
  recordEncode(naturalLength: number, wireLength: number, intent: IntentCategory): void {
    this.metrics.totalEncoded++;

    const naturalTokens = estimateTokens("x".repeat(naturalLength));
    const wireTokens = estimateTokens("x".repeat(wireLength));
    this.metrics.tokensSaved += Math.max(0, naturalTokens - wireTokens);

    // Rolling average compression ratio
    const ratio = wireLength > 0 ? wireLength / Math.max(naturalLength, 1) : 1;
    this.metrics.avgCompressionRatio =
      (this.metrics.avgCompressionRatio * (this.metrics.totalEncoded - 1) + ratio) /
      this.metrics.totalEncoded;

    // Intent counts
    this.metrics.intentCounts[intent] = (this.metrics.intentCounts[intent] ?? 0) + 1;
  }

  /** Record a decode operation */
  recordDecode(success: boolean): void {
    this.metrics.totalDecoded++;
    const total = this.metrics.totalDecoded;
    const successCount =
      Math.round(this.metrics.comprehensionRate * (total - 1)) + (success ? 1 : 0);
    this.metrics.comprehensionRate = successCount / total;
  }

  /** Record a macro usage */
  recordMacroUsage(name: string): void {
    this.metrics.macroUsage[name] = (this.metrics.macroUsage[name] ?? 0) + 1;
  }

  /** Record an escalation event */
  recordEscalation(): void {
    this.metrics.escalationCount++;
  }

  /** Get current metrics snapshot */
  getMetrics(): ClawTalkMetrics {
    return { ...this.metrics };
  }

  /** Reset metrics */
  reset(): void {
    this.metrics = createEmptyMetrics();
  }
}

function createEmptyMetrics(): ClawTalkMetrics {
  return {
    totalEncoded: 0,
    totalDecoded: 0,
    avgCompressionRatio: 0,
    comprehensionRate: 1.0,
    tokensSaved: 0,
    macroUsage: {},
    intentCounts: {},
    escalationCount: 0,
    periodStart: new Date().toISOString(),
  };
}
