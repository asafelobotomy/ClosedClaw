/**
 * Tests for memory consolidation engine
 *
 * @module agents/squad/memory/consolidation.test
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AGENTS } from "../../../constants/index.js";
import {
  consolidateMemory,
  convertToEpisode,
  startConsolidationScheduler,
  type ConsolidationContext,
} from "./consolidation.js";
import { EpisodicStore } from "./long-term-memory.js";
import { ShortTermMemory } from "./short-term-memory.js";

// ─────────────────── Test helpers ───────────────────

/** Create a ShortTermMemory with auto-cleanup disabled */
function createTestSTM(ttl: number = 300_000): ShortTermMemory {
  return new ShortTermMemory(ttl, false);
}

/** Access an entry enough times to make it "hot" */
function makeHot(stm: ShortTermMemory, key: string, times?: number): void {
  const threshold = times ?? AGENTS.MEMORY.SHORT_TERM.HOT_ENTRY_THRESHOLD;
  for (let i = 0; i < threshold; i++) {
    stm.get(key);
  }
}

let counter = 0;
function testIdGenerator(): string {
  return `test-episode-${++counter}`;
}

describe("consolidateMemory", () => {
  let tmpDir: string;
  let stm: ShortTermMemory;
  let episodicStore: EpisodicStore;
  let ctx: ConsolidationContext;

  beforeEach(async () => {
    counter = 0;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "consolidation-test-"));
    stm = createTestSTM();
    episodicStore = new EpisodicStore(path.join(tmpDir, "episodic.json"), "");
    await episodicStore.load();

    ctx = {
      shortTermMemory: stm,
      episodicStore,
      squadId: "test-squad",
      agentIds: ["agent-a", "agent-b"],
    };
  });

  afterEach(async () => {
    stm.destroy();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─────────────── Basic consolidation ───────────────

  describe("basic flow", () => {
    it("consolidates hot entries from STM to LTM", async () => {
      stm.set("task-result", { task: "Security audit", outcome: "success", tokensUsed: 500 });
      makeHot(stm, "task-result");

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0, // Don't filter by age in tests
      });

      expect(result.consolidated).toBe(1);
      expect(result.failed).toBe(0);
      expect(episodicStore.count()).toBe(1);

      const episode = episodicStore.getRecent(1)[0]!;
      expect(episode.taskDescription).toBe("Security audit");
      expect(episode.outcome).toBe("success");
      expect(episode.tokensUsed).toBe(500);
      expect(episode.squadId).toBe("test-squad");
      expect(episode.agentsInvolved).toEqual(["agent-a", "agent-b"]);
    });

    it("removes consolidated entries from STM by default", async () => {
      stm.set("to-consolidate", "data");
      makeHot(stm, "to-consolidate");

      await consolidateMemory(ctx, { idGenerator: testIdGenerator, minAgeMs: 0 });

      expect(stm.has("to-consolidate")).toBe(false);
    });

    it("keeps consolidated entries in STM when removeAfterConsolidation=false", async () => {
      stm.set("keep-me", "data");
      makeHot(stm, "keep-me");

      await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0,
        removeAfterConsolidation: false,
      });

      expect(stm.has("keep-me")).toBe(true);
      expect(episodicStore.count()).toBe(1);
    });

    it("skips non-hot entries", async () => {
      stm.set("cold-entry", "data");
      // Don't make it hot — accessCount stays below threshold

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0,
      });

      expect(result.consolidated).toBe(0);
      expect(episodicStore.count()).toBe(0);
    });

    it("consolidates flagged-important entries even if not hot", async () => {
      stm.set("important", "critical data");
      stm.flagImportant("important");

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0,
      });

      expect(result.consolidated).toBe(1);
    });

    it("handles multiple hot entries", async () => {
      stm.set("entry-1", { task: "Task one" });
      stm.set("entry-2", { task: "Task two" });
      stm.set("entry-3", { task: "Task three" });
      makeHot(stm, "entry-1");
      makeHot(stm, "entry-2");
      makeHot(stm, "entry-3");

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0,
      });

      expect(result.consolidated).toBe(3);
      expect(episodicStore.count()).toBe(3);
    });

    it("returns zero result on empty STM", async () => {
      const result = await consolidateMemory(ctx, { idGenerator: testIdGenerator });

      expect(result.consolidated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // ─────────────── Batching & limits ───────────────

  describe("batching", () => {
    it("respects batchSize limit", async () => {
      // Create 5 hot entries
      for (let i = 0; i < 5; i++) {
        stm.set(`batch-${i}`, `data-${i}`);
        makeHot(stm, `batch-${i}`);
      }

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0,
        batchSize: 2,
      });

      expect(result.consolidated).toBe(2);
      expect(result.skipped).toBe(3); // Remaining entries counted as skipped
      expect(episodicStore.count()).toBe(2);
    });
  });

  // ─────────────── Min age filter ───────────────

  describe("minAge filtering", () => {
    it("skips entries younger than minAgeMs", async () => {
      stm.set("young-entry", "data");
      makeHot(stm, "young-entry");

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 60_000, // 1 minute minimum age
        nowMs: Date.now(), // Entry was just created, so < 1 minute old
      });

      expect(result.consolidated).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it("consolidates entries older than minAgeMs", async () => {
      stm.set("old-entry", "data");
      makeHot(stm, "old-entry");

      const result = await consolidateMemory(ctx, {
        idGenerator: testIdGenerator,
        minAgeMs: 0, // No minimum age
      });

      expect(result.consolidated).toBe(1);
    });
  });

  // ─────────────── Default context ───────────────

  describe("default values", () => {
    it("uses 'unknown' squad ID when not provided", async () => {
      const ctxNoSquad: ConsolidationContext = {
        shortTermMemory: stm,
        episodicStore,
      };

      stm.set("no-squad", "data");
      makeHot(stm, "no-squad");

      await consolidateMemory(ctxNoSquad, { idGenerator: testIdGenerator, minAgeMs: 0 });

      const episode = episodicStore.getRecent(1)[0]!;
      expect(episode.squadId).toBe("unknown");
      expect(episode.agentsInvolved).toEqual([]);
    });
  });
});

// ─────────────── convertToEpisode ───────────────

describe("convertToEpisode", () => {
  const baseContext = {
    squadId: "squad-1",
    agentIds: ["agent-x"],
    idGenerator: () => "test-id",
  };

  function makeEntry(
    value: unknown,
    overrides?: Partial<{
      accessCount: number;
      createdAt: Date;
      lastAccessedAt: Date;
      ttl: number;
      flaggedImportant: boolean;
    }>,
  ) {
    return {
      value,
      createdAt: overrides?.createdAt ?? new Date("2026-02-09T00:00:00Z"),
      lastAccessedAt: overrides?.lastAccessedAt ?? new Date("2026-02-09T00:05:00Z"),
      ttl: overrides?.ttl ?? 300_000,
      accessCount: overrides?.accessCount ?? 10,
      flaggedImportant: overrides?.flaggedImportant,
    };
  }

  it("extracts taskDescription from object with task field", () => {
    const entry = makeEntry({ task: "Audit code", outcome: "success" });
    const ep = convertToEpisode("audit", entry, baseContext);
    expect(ep.taskDescription).toBe("Audit code");
  });

  it("extracts taskDescription from object with description field", () => {
    const entry = makeEntry({ description: "Fix bug" });
    const ep = convertToEpisode("fix", entry, baseContext);
    expect(ep.taskDescription).toBe("Fix bug");
  });

  it("extracts taskDescription from string value", () => {
    const entry = makeEntry("Run security scan");
    const ep = convertToEpisode("scan", entry, baseContext);
    expect(ep.taskDescription).toBe("Run security scan");
  });

  it("falls back to key-based description", () => {
    const entry = makeEntry(42);
    const ep = convertToEpisode("magic-number", entry, baseContext);
    expect(ep.taskDescription).toBe("Memory entry: magic-number");
  });

  it("extracts outcome from value", () => {
    const entry = makeEntry({ outcome: "failure" });
    const ep = convertToEpisode("fail", entry, baseContext);
    expect(ep.outcome).toBe("failure");
  });

  it("maps 'error' status to failure", () => {
    const entry = makeEntry({ status: "error" });
    const ep = convertToEpisode("err", entry, baseContext);
    expect(ep.outcome).toBe("failure");
  });

  it("maps 'completed' status to success", () => {
    const entry = makeEntry({ status: "completed" });
    const ep = convertToEpisode("done", entry, baseContext);
    expect(ep.outcome).toBe("success");
  });

  it("defaults outcome to success", () => {
    const entry = makeEntry("plain string");
    const ep = convertToEpisode("key", entry, baseContext);
    expect(ep.outcome).toBe("success");
  });

  it("extracts tokensUsed from value", () => {
    const entry = makeEntry({ tokensUsed: 1234 });
    const ep = convertToEpisode("key", entry, baseContext);
    expect(ep.tokensUsed).toBe(1234);
  });

  it("extracts durationMs from value", () => {
    const entry = makeEntry({ durationMs: 5000 });
    const ep = convertToEpisode("key", entry, baseContext);
    expect(ep.durationMs).toBe(5000);
  });

  it("falls back to creation-to-access time for duration", () => {
    const entry = makeEntry("data", {
      createdAt: new Date("2026-02-09T00:00:00Z"),
      lastAccessedAt: new Date("2026-02-09T00:05:00Z"),
    });
    const ep = convertToEpisode("key", entry, baseContext);
    expect(ep.durationMs).toBe(5 * 60 * 1000);
  });

  it("includes key as a tag", () => {
    const entry = makeEntry("data");
    const ep = convertToEpisode("my-key", entry, baseContext);
    expect(ep.tags).toContain("my-key");
  });

  it("merges tags from value", () => {
    const entry = makeEntry({ tags: ["security", "audit"] });
    const ep = convertToEpisode("task", entry, baseContext);
    expect(ep.tags).toContain("task");
    expect(ep.tags).toContain("security");
    expect(ep.tags).toContain("audit");
  });

  it("deduplicates tags", () => {
    const entry = makeEntry({ tags: ["task", "task", "unique"] });
    const ep = convertToEpisode("task", entry, baseContext);
    const taskCount = ep.tags!.filter((t) => t === "task").length;
    expect(taskCount).toBe(1);
  });

  it("includes metadata from entry", () => {
    const entry = makeEntry("data", { accessCount: 7, flaggedImportant: true, ttl: 60_000 });
    const ep = convertToEpisode("key", entry, baseContext);
    expect(ep.metadata).toEqual({
      sourceKey: "key",
      accessCount: 7,
      flaggedImportant: true,
      ttlMs: 60_000,
    });
  });

  it("uses provided id generator", () => {
    const entry = makeEntry("data");
    const ep = convertToEpisode("key", entry, {
      ...baseContext,
      idGenerator: () => "custom-id-123",
    });
    expect(ep.id).toBe("custom-id-123");
  });

  it("sets squad and agents from context", () => {
    const entry = makeEntry("data");
    const ep = convertToEpisode("key", entry, {
      squadId: "my-squad",
      agentIds: ["a1", "a2"],
      idGenerator: () => "id",
    });
    expect(ep.squadId).toBe("my-squad");
    expect(ep.agentsInvolved).toEqual(["a1", "a2"]);
  });
});

// ─────────────── ConsolidationScheduler ───────────────

describe("startConsolidationScheduler", () => {
  let tmpDir: string;
  let stm: ShortTermMemory;
  let episodicStore: EpisodicStore;

  beforeEach(async () => {
    counter = 0;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sched-test-"));
    stm = createTestSTM();
    episodicStore = new EpisodicStore(path.join(tmpDir, "episodic.json"), "");
    await episodicStore.load();
  });

  afterEach(async () => {
    stm.destroy();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a running scheduler", () => {
    const scheduler = startConsolidationScheduler(
      { shortTermMemory: stm, episodicStore },
      { idGenerator: testIdGenerator, minAgeMs: 0 },
      60_000,
    );

    expect(scheduler.running).toBe(true);
    expect(scheduler.cycleCount).toBe(0);
    expect(scheduler.lastResult).toBeNull();

    scheduler.stop();
  });

  it("stops cleanly", () => {
    const scheduler = startConsolidationScheduler(
      { shortTermMemory: stm, episodicStore },
      { idGenerator: testIdGenerator },
      60_000,
    );

    scheduler.stop();
    expect(scheduler.running).toBe(false);
  });

  it("runs consolidation on interval", async () => {
    vi.useFakeTimers();

    stm.set("scheduled-entry", { task: "Scheduled task" });
    makeHot(stm, "scheduled-entry");

    const scheduler = startConsolidationScheduler(
      { shortTermMemory: stm, episodicStore },
      { idGenerator: testIdGenerator, minAgeMs: 0 },
      100, // 100ms interval for fast testing
    );

    // Advance timer to trigger one cycle
    await vi.advanceTimersByTimeAsync(150);

    expect(scheduler.cycleCount).toBe(1);
    expect(scheduler.lastResult).not.toBeNull();
    expect(scheduler.lastResult!.consolidated).toBe(1);
    expect(episodicStore.count()).toBe(1);

    scheduler.stop();
    vi.useRealTimers();
  });
});
