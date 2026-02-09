/**
 * Tests for Cost Tracker
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CostTracker,
  computeCost,
  formatUsageSummary,
  TIME_PERIODS,
  type ModelCostRates,
} from "./cost-tracker.js";

const OPUS_RATES: ModelCostRates = {
  input: 15,     // $15 per 1M input tokens
  output: 75,    // $75 per 1M output tokens
  cacheRead: 1.5,
  cacheWrite: 3.75,
};

const HAIKU_RATES: ModelCostRates = {
  input: 0.25,
  output: 1.25,
  cacheRead: 0.03,
  cacheWrite: 0.3,
};

// ─── computeCost ────────────────────────────────────────────────────────────

describe("computeCost", () => {
  it("computes basic cost", () => {
    const cost = computeCost(
      { input: 1000, output: 500 },
      OPUS_RATES,
    );

    // 1000 * 15/1M + 500 * 75/1M = 0.015 + 0.0375 = 0.0525
    expect(cost).toBeCloseTo(0.0525, 4);
  });

  it("includes cache costs", () => {
    const cost = computeCost(
      { input: 1000, output: 500, cacheRead: 2000, cacheWrite: 100 },
      OPUS_RATES,
    );

    // 0.015 + 0.0375 + 0.003 + 0.000375 = 0.055875
    expect(cost).toBeCloseTo(0.055875, 4);
  });

  it("returns 0 for zero tokens", () => {
    expect(computeCost({ input: 0, output: 0 }, OPUS_RATES)).toBe(0);
  });

  it("handles cheap models", () => {
    const cost = computeCost(
      { input: 10000, output: 5000 },
      HAIKU_RATES,
    );

    // 10000 * 0.25/1M + 5000 * 1.25/1M = 0.0025 + 0.00625 = 0.00875
    expect(cost).toBeCloseTo(0.00875, 5);
  });
});

// ─── CostTracker ────────────────────────────────────────────────────────────

describe("CostTracker", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
    tracker.registerModelRates("claude-opus-4", OPUS_RATES);
    tracker.registerModelRates("claude-haiku-4", HAIKU_RATES);
  });

  describe("record", () => {
    it("records a usage event", () => {
      const record = tracker.record({
        modelId: "claude-opus-4",
        agentId: "main",
        tokens: { input: 1000, output: 500 },
      });

      expect(record.modelId).toBe("claude-opus-4");
      expect(record.agentId).toBe("main");
      expect(record.costUsd).toBeCloseTo(0.0525, 4);
      expect(record.isFallback).toBe(false);
      expect(record.timestamp).toBeGreaterThan(0);
    });

    it("records fallback calls", () => {
      const record = tracker.record({
        modelId: "claude-haiku-4",
        agentId: "main",
        tokens: { input: 500, output: 200 },
        isFallback: true,
      });

      expect(record.isFallback).toBe(true);
    });

    it("records intent", () => {
      const record = tracker.record({
        modelId: "claude-opus-4",
        agentId: "main",
        intent: "reasoning",
        tokens: { input: 1000, output: 500 },
      });

      expect(record.intent).toBe("reasoning");
    });

    it("computes zero cost for unknown models", () => {
      const record = tracker.record({
        modelId: "unknown-model",
        agentId: "main",
        tokens: { input: 1000, output: 500 },
      });

      expect(record.costUsd).toBe(0);
    });
  });

  describe("summarize", () => {
    it("summarizes all records", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });
      tracker.record({ modelId: "claude-haiku-4", agentId: "main", tokens: { input: 5000, output: 2000 } });

      const summary = tracker.summarize();

      expect(summary.totalCalls).toBe(2);
      expect(summary.totalCostUsd).toBeGreaterThan(0);
      expect(summary.totalTokens.input).toBe(6000);
      expect(summary.totalTokens.output).toBe(2500);
    });

    it("filters by model", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });
      tracker.record({ modelId: "claude-haiku-4", agentId: "main", tokens: { input: 5000, output: 2000 } });

      const summary = tracker.summarize({ modelId: "claude-opus-4" });
      expect(summary.totalCalls).toBe(1);
      expect(summary.byModel.size).toBe(1);
    });

    it("filters by agent", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });
      tracker.record({ modelId: "claude-opus-4", agentId: "devops", tokens: { input: 2000, output: 1000 } });

      const summary = tracker.summarize({ agentId: "devops" });
      expect(summary.totalCalls).toBe(1);
      expect(summary.byAgent.size).toBe(1);
    });

    it("breaks down by model", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 2000, output: 1000 } });
      tracker.record({ modelId: "claude-haiku-4", agentId: "main", tokens: { input: 5000, output: 2000 } });

      const summary = tracker.summarize();
      expect(summary.byModel.size).toBe(2);

      const opus = summary.byModel.get("claude-opus-4");
      expect(opus?.calls).toBe(2);
      expect(opus?.tokens.input).toBe(3000);
    });

    it("tracks fallback stats", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 }, isFallback: false });
      tracker.record({ modelId: "claude-haiku-4", agentId: "main", tokens: { input: 500, output: 200 }, isFallback: true });

      const summary = tracker.summarize();
      expect(summary.fallbackCalls).toBe(1);
      expect(summary.fallbackCostUsd).toBeGreaterThan(0);
    });

    it("tracks by intent", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", intent: "reasoning", tokens: { input: 1000, output: 500 } });
      tracker.record({ modelId: "claude-haiku-4", agentId: "main", intent: "triage", tokens: { input: 100, output: 50 } });

      const summary = tracker.summarize();
      expect(summary.byIntent.get("reasoning")).toBeGreaterThan(0);
      expect(summary.byIntent.get("triage")).toBeGreaterThan(0);
    });
  });

  describe("modelCost / agentCost", () => {
    it("returns cost for specific model", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });

      const cost = tracker.modelCost("claude-opus-4");
      expect(cost).toBeCloseTo(0.0525, 4);
    });

    it("returns cost for specific agent", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "devops", tokens: { input: 1000, output: 500 } });

      expect(tracker.agentCost("devops")).toBeCloseTo(0.0525, 4);
      expect(tracker.agentCost("main")).toBe(0);
    });
  });

  describe("budgets", () => {
    it("emits warning when approaching budget", () => {
      tracker.setBudgetConfig({
        globalDaily: 0.10, // $0.10 daily budget
        warningThreshold: 0.5,
      });

      // Record usage that exceeds 50% of $0.10
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 5000, output: 2000 } });

      const alerts = tracker.getAlerts();
      // Cost = 0.225 > 0.05 (50% of 0.10) → warning
      expect(alerts.some((a) => a.type === "warning" || a.type === "exceeded")).toBe(true);
    });

    it("emits exceeded when over budget", () => {
      tracker.setBudgetConfig({
        perModelDaily: { "claude-opus-4": 0.01 }, // Very low budget
      });

      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });

      const alerts = tracker.getAlerts();
      expect(alerts.some((a) => a.type === "exceeded")).toBe(true);
    });

    it("clears alerts", () => {
      tracker.setBudgetConfig({ globalDaily: 0.001 });
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });
      expect(tracker.getAlerts().length).toBeGreaterThan(0);

      tracker.clearAlerts();
      expect(tracker.getAlerts()).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("exports and loads records", () => {
      tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 1000, output: 500 } });
      tracker.record({ modelId: "claude-haiku-4", agentId: "main", tokens: { input: 2000, output: 1000 } });

      const records = tracker.getRecords();
      expect(records).toHaveLength(2);

      const newTracker = new CostTracker();
      newTracker.registerModelRates("claude-opus-4", OPUS_RATES);
      newTracker.loadRecords(records);
      expect(newTracker.recordCount).toBe(2);
    });
  });

  describe("registerModelRatesBatch", () => {
    it("registers multiple models at once", () => {
      const t = new CostTracker();
      t.registerModelRatesBatch({
        "model-a": { cost: OPUS_RATES },
        "model-b": { cost: HAIKU_RATES },
      });

      const rec = t.record({ modelId: "model-a", agentId: "main", tokens: { input: 1000, output: 500 } });
      expect(rec.costUsd).toBeGreaterThan(0);
    });
  });
});

// ─── formatUsageSummary ─────────────────────────────────────────────────────

describe("formatUsageSummary", () => {
  it("formats a basic summary", () => {
    const tracker = new CostTracker();
    tracker.registerModelRates("claude-opus-4", OPUS_RATES);
    tracker.record({ modelId: "claude-opus-4", agentId: "main", tokens: { input: 10000, output: 5000 } });

    const summary = tracker.summarize();
    const formatted = formatUsageSummary(summary);

    expect(formatted).toContain("Usage Summary");
    expect(formatted).toContain("Total calls: 1");
    expect(formatted).toContain("Total cost: $");
    expect(formatted).toContain("claude-opus-4");
  });
});
