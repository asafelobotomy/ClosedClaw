/**
 * Tests for squad resource management.
 *
 * @see {@link ./resources.ts}
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  TokenBudgetTracker,
  RateLimiter,
  ResourceManager,
  type ResourceAlert,
} from "./resources.js";

// ─── TokenBudgetTracker ────────────────────────────────────────────────────

describe("TokenBudgetTracker", () => {
  it("tracks zero usage for newly registered agent", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.registerAgent("agent-1");

    const budget = tracker.getBudget("agent-1");
    expect(budget?.used).toBe(0);
    expect(budget?.exceeded).toBe(false);
    expect(budget?.limit).toBe(10_000);
  });

  it("records usage correctly", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.registerAgent("agent-1");

    tracker.recordUsage("agent-1", 3_000);
    expect(tracker.getBudget("agent-1")?.used).toBe(3_000);

    tracker.recordUsage("agent-1", 2_000);
    expect(tracker.getBudget("agent-1")?.used).toBe(5_000);
  });

  it("marks agent as exceeded when at limit", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 1_000 });
    tracker.registerAgent("agent-1");

    const exceeded = tracker.recordUsage("agent-1", 1_000);
    expect(exceeded).toBe(true);
    expect(tracker.isExceeded("agent-1")).toBe(true);
  });

  it("returns false for isExceeded on unknown agent", () => {
    const tracker = new TokenBudgetTracker();
    expect(tracker.isExceeded("unknown")).toBe(false);
  });

  it("auto-registers unknown agent on recordUsage", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.recordUsage("new-agent", 100);

    expect(tracker.getBudget("new-agent")).toBeDefined();
    expect(tracker.getBudget("new-agent")?.used).toBe(100);
  });

  it("allows custom per-agent limit", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.registerAgent("agent-1", 500);

    const exceeded = tracker.recordUsage("agent-1", 500);
    expect(exceeded).toBe(true);
    expect(tracker.getBudget("agent-1")?.limit).toBe(500);
  });

  it("tracks total across all agents", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 100_000 });
    tracker.registerAgent("agent-1");
    tracker.registerAgent("agent-2");

    tracker.recordUsage("agent-1", 5_000);
    tracker.recordUsage("agent-2", 3_000);

    expect(tracker.getTotalUsed()).toBe(8_000);
  });

  it("detects squad-wide budget exceeded", () => {
    const tracker = new TokenBudgetTracker({
      defaultAgentLimit: 100_000,
      squadLimit: 10_000,
    });
    tracker.registerAgent("agent-1");
    tracker.recordUsage("agent-1", 10_000);

    expect(tracker.isSquadExceeded()).toBe(true);
  });

  it("emits warning alert at threshold", () => {
    const alerts: ResourceAlert[] = [];
    const tracker = new TokenBudgetTracker({
      defaultAgentLimit: 1_000,
      warnThreshold: 0.8,
      onAlert: (a) => alerts.push(a),
    });
    tracker.registerAgent("agent-1");

    // 79% — no alert
    tracker.recordUsage("agent-1", 790);
    expect(alerts).toHaveLength(0);

    // 81% — warning
    tracker.recordUsage("agent-1", 20);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].entity).toBe("agent-1");
  });

  it("emits critical alert when fully exceeded", () => {
    const alerts: ResourceAlert[] = [];
    const tracker = new TokenBudgetTracker({
      defaultAgentLimit: 1_000,
      warnThreshold: 0.8,
      onAlert: (a) => alerts.push(a),
    });
    tracker.registerAgent("agent-1");

    tracker.recordUsage("agent-1", 1_000);
    const criticals = alerts.filter((a) => a.severity === "critical");
    expect(criticals.length).toBeGreaterThanOrEqual(1);
  });

  it("resetAgent clears agent usage", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.registerAgent("agent-1");
    tracker.recordUsage("agent-1", 5_000);

    tracker.resetAgent("agent-1");
    expect(tracker.getBudget("agent-1")?.used).toBe(0);
    expect(tracker.getBudget("agent-1")?.exceeded).toBe(false);
    expect(tracker.getTotalUsed()).toBe(0);
  });

  it("resetAll clears all usage", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.registerAgent("agent-1");
    tracker.registerAgent("agent-2");
    tracker.recordUsage("agent-1", 3_000);
    tracker.recordUsage("agent-2", 2_000);

    tracker.resetAll();
    expect(tracker.getTotalUsed()).toBe(0);
    expect(tracker.getBudget("agent-1")?.exceeded).toBe(false);
    expect(tracker.getBudget("agent-2")?.exceeded).toBe(false);
  });

  it("getSummary returns per-agent data", () => {
    const tracker = new TokenBudgetTracker({ defaultAgentLimit: 10_000 });
    tracker.registerAgent("agent-1");
    tracker.registerAgent("agent-2");
    tracker.recordUsage("agent-1", 5_000);
    tracker.recordUsage("agent-2", 2_000);

    const summary = tracker.getSummary();
    expect(summary).toHaveLength(2);

    const a1 = summary.find((s) => s.agentId === "agent-1");
    expect(a1?.used).toBe(5_000);
    expect(a1?.percent).toBe(50);
    expect(a1?.exceeded).toBe(false);
  });
});

// ─── RateLimiter ───────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests up to RPM limit", async () => {
    const limiter = new RateLimiter({ rpm: 3, tpm: 100_000 });

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.getCurrentRpm()).toBe(3);
    expect(limiter.wouldExceedRpm()).toBe(true);

    limiter.dispose();
  });

  it("blocks when RPM limit reached and times out", async () => {
    const limiter = new RateLimiter({ rpm: 1, tpm: 100_000 });

    await limiter.acquire();

    await expect(limiter.acquire(50)).rejects.toThrow("Rate limiter timeout");

    limiter.dispose();
  });

  it("records and reports TPM", () => {
    const limiter = new RateLimiter({ rpm: 60, tpm: 100_000 });

    limiter.recordTokens(5_000);
    limiter.recordTokens(3_000);

    expect(limiter.getCurrentTpm()).toBe(8_000);
    expect(limiter.wouldExceedTpm(95_000)).toBe(true);
    expect(limiter.wouldExceedTpm(90_000)).toBe(false);

    limiter.dispose();
  });

  it("tryAcquire returns true when RPM is not exceeded", () => {
    const limiter = new RateLimiter({ rpm: 5, tpm: 100_000 });
    expect(limiter.wouldExceedRpm()).toBe(false);
    limiter.dispose();
  });

  it("tracks queue length", async () => {
    const limiter = new RateLimiter({ rpm: 1, tpm: 100_000 });

    await limiter.acquire();
    // Start blocked requests (don't await)
    const p1 = limiter.acquire(5_000);
    const p2 = limiter.acquire(5_000);

    expect(limiter.queueLength).toBe(2);

    limiter.dispose();
    // Catch rejections from dispose
    await p1.catch(() => {});
    await p2.catch(() => {});
  });

  it("dispose rejects queued requests", async () => {
    const limiter = new RateLimiter({ rpm: 1, tpm: 100_000 });

    await limiter.acquire();
    const p = limiter.acquire(60_000);

    limiter.dispose();

    await expect(p).rejects.toThrow("Rate limiter disposed");
  });
});

// ─── ResourceManager ───────────────────────────────────────────────────────

describe("ResourceManager", () => {
  it("acquireSlot passes when budget available", async () => {
    const manager = new ResourceManager({
      defaultAgentTokenLimit: 100_000,
      rateLimit: { rpm: 60, tpm: 100_000 },
    });
    manager.registerAgent("agent-1");

    // Should not throw
    await manager.acquireSlot("agent-1");

    manager.dispose();
  });

  it("acquireSlot throws when agent budget exceeded", async () => {
    const manager = new ResourceManager({
      defaultAgentTokenLimit: 1_000,
      rateLimit: { rpm: 60, tpm: 100_000 },
    });
    manager.registerAgent("agent-1");
    manager.recordUsage("agent-1", 1_000);

    await expect(manager.acquireSlot("agent-1")).rejects.toThrow("Token budget exceeded");

    manager.dispose();
  });

  it("acquireSlot throws when squad budget exceeded", async () => {
    const manager = new ResourceManager({
      defaultAgentTokenLimit: 100_000,
      squadTokenLimit: 5_000,
      rateLimit: { rpm: 60, tpm: 100_000 },
    });
    manager.registerAgent("agent-1");
    manager.recordUsage("agent-1", 5_000);

    await expect(manager.acquireSlot("agent-1")).rejects.toThrow("Squad token budget exceeded");

    manager.dispose();
  });

  it("recordUsage tracks both tokens and rate", () => {
    const manager = new ResourceManager({
      defaultAgentTokenLimit: 100_000,
      rateLimit: { rpm: 60, tpm: 100_000 },
    });
    manager.registerAgent("agent-1");

    const exceeded = manager.recordUsage("agent-1", 5_000);
    expect(exceeded).toBe(false);

    expect(manager.rateLimiter.getCurrentTpm()).toBe(5_000);
    expect(manager.tokenTracker.getTotalUsed()).toBe(5_000);

    manager.dispose();
  });

  it("getSnapshot returns full squad state", () => {
    const manager = new ResourceManager({
      defaultAgentTokenLimit: 100_000,
      rateLimit: { rpm: 60, tpm: 100_000 },
    });
    manager.registerAgent("agent-1");
    manager.registerAgent("agent-2");
    manager.recordUsage("agent-1", 10_000);
    manager.recordUsage("agent-2", 5_000);

    const snapshot = manager.getSnapshot("squad-1");

    expect(snapshot.squadId).toBe("squad-1");
    expect(snapshot.agents).toHaveLength(2);
    expect(snapshot.totalTokensUsed).toBe(15_000);
    expect(snapshot.rateLimiter.maxRpm).toBe(60);
    expect(snapshot.rateLimiter.currentTpm).toBe(15_000);

    const a1 = snapshot.agents.find((a) => a.agentId === "agent-1");
    expect(a1?.tokensUsed).toBe(10_000);
    expect(a1?.percentUsed).toBe(10);

    manager.dispose();
  });

  it("uses default config when none provided", () => {
    const manager = new ResourceManager();
    manager.registerAgent("agent-1");

    // Should not throw
    expect(manager.tokenTracker.getBudget("agent-1")).toBeDefined();

    manager.dispose();
  });

  it("forwards alerts to callback", () => {
    const alerts: ResourceAlert[] = [];
    const manager = new ResourceManager({
      defaultAgentTokenLimit: 1_000,
      warnThreshold: 0.5,
      onAlert: (a) => alerts.push(a),
      rateLimit: { rpm: 60, tpm: 100_000 },
    });
    manager.registerAgent("agent-1");
    manager.recordUsage("agent-1", 600);

    expect(alerts.length).toBeGreaterThan(0);

    manager.dispose();
  });
});
