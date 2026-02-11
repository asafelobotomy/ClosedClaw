/**
 * Tests for LongTermMemory and EpisodicStore
 *
 * @module agents/squad/memory/long-term-memory.test
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, _vi } from "vitest";
import { AGENTS } from "../../../constants/index.js";
import {
  EpisodicStore,
  LongTermMemory,
  createLongTermMemory,
  type Episode,
} from "./long-term-memory.js";

// ─────────────────── Test helpers ───────────────────

function makeEpisode(overrides?: Partial<Episode>): Episode {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    squadId: "test-squad",
    taskDescription: "Test task description",
    agentsInvolved: ["agent-1", "agent-2"],
    outcome: "success",
    durationMs: 5000,
    tokensUsed: 1500,
    tags: ["test"],
    ...overrides,
  };
}

function makeEpisodeAt(daysAgo: number, overrides?: Partial<Episode>): Episode {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return makeEpisode({ timestamp: ts, ...overrides });
}

describe("EpisodicStore", () => {
  let tmpDir: string;
  let storePath: string;
  let store: EpisodicStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltm-test-"));
    storePath = path.join(tmpDir, "episodic.json");
    // Empty passphrase = no encryption (faster for unit tests)
    store = new EpisodicStore(storePath, "");
    await store.load();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─────────────── Constructor & load ───────────────

  describe("load", () => {
    it("loads from empty state (no file)", async () => {
      expect(store.count()).toBe(0);
    });

    it("is idempotent (multiple loads are safe)", async () => {
      await store.store(makeEpisode());
      await store.load(); // Second load should be no-op
      expect(store.count()).toBe(1);
    });

    it("loads persisted data from disk", async () => {
      const ep = makeEpisode({ taskDescription: "persisted task" });
      await store.store(ep);

      // Create new store instance pointing to same file
      const store2 = new EpisodicStore(storePath, "");
      await store2.load();

      expect(store2.count()).toBe(1);
      expect(store2.getById(ep.id)?.taskDescription).toBe("persisted task");
    });

    it("throws if operations called before load", () => {
      const unloaded = new EpisodicStore(path.join(tmpDir, "nope.json"), "");
      expect(() => unloaded.count()).toThrow("not loaded");
      expect(() => unloaded.search("x")).toThrow("not loaded");
      expect(() => unloaded.getRecent(5)).toThrow("not loaded");
    });
  });

  // ─────────────── Store ───────────────

  describe("store", () => {
    it("stores a single episode", async () => {
      const ep = makeEpisode();
      await store.store(ep);
      expect(store.count()).toBe(1);
    });

    it("stores multiple episodes", async () => {
      await store.store(makeEpisode({ id: "ep-1" }));
      await store.store(makeEpisode({ id: "ep-2" }));
      await store.store(makeEpisode({ id: "ep-3" }));
      expect(store.count()).toBe(3);
    });

    it("maintains newest-first order", async () => {
      const old = makeEpisode({ id: "old", timestamp: new Date("2026-01-01") });
      const mid = makeEpisode({ id: "mid", timestamp: new Date("2026-01-15") });
      const recent = makeEpisode({ id: "new", timestamp: new Date("2026-02-01") });

      // Insert out of order
      await store.store(mid);
      await store.store(old);
      await store.store(recent);

      const all = store.getRecent(10);
      expect(all[0]!.id).toBe("new");
      expect(all[1]!.id).toBe("mid");
      expect(all[2]!.id).toBe("old");
    });

    it("persists to disk", async () => {
      await store.store(makeEpisode({ taskDescription: "disk check" }));

      const raw = await fs.readFile(storePath, "utf-8");
      const data = JSON.parse(raw);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].taskDescription).toBe("disk check");
    });

    it("preserves episode fields through serialization", async () => {
      const ep = makeEpisode({
        tags: ["security", "audit"],
        metadata: { tool: "grep", exitCode: 0 },
      });
      await store.store(ep);

      // Reload from disk
      const store2 = new EpisodicStore(storePath, "");
      await store2.load();
      const loaded = store2.getById(ep.id);

      expect(loaded).toBeDefined();
      expect(loaded!.taskDescription).toBe(ep.taskDescription);
      expect(loaded!.squadId).toBe(ep.squadId);
      expect(loaded!.agentsInvolved).toEqual(ep.agentsInvolved);
      expect(loaded!.outcome).toBe(ep.outcome);
      expect(loaded!.durationMs).toBe(ep.durationMs);
      expect(loaded!.tokensUsed).toBe(ep.tokensUsed);
      expect(loaded!.tags).toEqual(["security", "audit"]);
      expect(loaded!.metadata).toEqual({ tool: "grep", exitCode: 0 });
      expect(loaded!.timestamp.getTime()).toBe(ep.timestamp.getTime());
    });

    it("throws when store is full", async () => {
      // Temporarily mock the constant to a small number
      const origMax = AGENTS.MEMORY.LONG_TERM.MAX_EPISODIC_ENTRIES;
      Object.defineProperty(AGENTS.MEMORY.LONG_TERM, "MAX_EPISODIC_ENTRIES", {
        value: 3,
        configurable: true,
      });

      try {
        await store.store(makeEpisode({ id: "1" }));
        await store.store(makeEpisode({ id: "2" }));
        await store.store(makeEpisode({ id: "3" }));
        await expect(store.store(makeEpisode({ id: "4" }))).rejects.toThrow("Episodic store full");
      } finally {
        Object.defineProperty(AGENTS.MEMORY.LONG_TERM, "MAX_EPISODIC_ENTRIES", {
          value: origMax,
          configurable: true,
        });
      }
    });
  });

  // ─────────────── storeBatch ───────────────

  describe("storeBatch", () => {
    it("stores multiple episodes at once", async () => {
      const episodes = [
        makeEpisode({ id: "b-1" }),
        makeEpisode({ id: "b-2" }),
        makeEpisode({ id: "b-3" }),
      ];
      await store.storeBatch(episodes);
      expect(store.count()).toBe(3);
    });

    it("sorts after batch insert", async () => {
      const episodes = [
        makeEpisode({ id: "old", timestamp: new Date("2025-01-01") }),
        makeEpisode({ id: "new", timestamp: new Date("2026-06-01") }),
        makeEpisode({ id: "mid", timestamp: new Date("2026-01-01") }),
      ];
      await store.storeBatch(episodes);

      const recent = store.getRecent(10);
      expect(recent[0]!.id).toBe("new");
      expect(recent[2]!.id).toBe("old");
    });
  });

  // ─────────────── Search ───────────────

  describe("search", () => {
    beforeEach(async () => {
      await store.storeBatch([
        makeEpisode({ id: "s1", taskDescription: "Audit security module", tags: ["security"] }),
        makeEpisode({
          id: "s2",
          taskDescription: "Fix memory leak in gateway",
          tags: ["perf", "gateway"],
        }),
        makeEpisode({ id: "s3", taskDescription: "Update documentation for CLI", tags: ["docs"] }),
        makeEpisode({
          id: "s4",
          taskDescription: "Security patch for SSRF",
          tags: ["security", "networking"],
        }),
        makeEpisode({
          id: "s5",
          taskDescription: "Build agent spawner",
          squadId: "squad-alpha",
          agentsInvolved: ["coder"],
        }),
      ]);
    });

    it("searches by task description", () => {
      const result = store.search("security");
      expect(result.totalMatches).toBe(2);
      expect(result.episodes.map((e) => e.id)).toContain("s1");
      expect(result.episodes.map((e) => e.id)).toContain("s4");
    });

    it("searches by tags", () => {
      const result = store.search("gateway");
      expect(result.totalMatches).toBe(1);
      expect(result.episodes[0]!.id).toBe("s2");
    });

    it("searches by squad ID", () => {
      const result = store.search("squad-alpha");
      expect(result.totalMatches).toBe(1);
      expect(result.episodes[0]!.id).toBe("s5");
    });

    it("searches by agent name", () => {
      const result = store.search("coder");
      expect(result.totalMatches).toBe(1);
      expect(result.episodes[0]!.id).toBe("s5");
    });

    it("is case-insensitive", () => {
      const result = store.search("SECURITY");
      expect(result.totalMatches).toBe(2);
    });

    it("returns empty for no matches", () => {
      const result = store.search("nonexistent-query-xyz");
      expect(result.totalMatches).toBe(0);
      expect(result.episodes).toEqual([]);
    });

    it("respects limit", () => {
      const result = store.search("security", 1);
      expect(result.episodes.length).toBe(1);
      expect(result.totalMatches).toBe(2); // Total matches still reported
    });
  });

  // ─────────────── getRecent ───────────────

  describe("getRecent", () => {
    it("returns newest episodes first", async () => {
      for (let i = 0; i < 5; i++) {
        await store.store(
          makeEpisode({
            id: `r-${i}`,
            timestamp: new Date(Date.now() - i * 60_000),
          }),
        );
      }

      const recent = store.getRecent(3);
      expect(recent.length).toBe(3);
      expect(recent[0]!.id).toBe("r-0"); // Most recent
      expect(recent[2]!.id).toBe("r-2");
    });

    it("returns all if limit exceeds count", async () => {
      await store.store(makeEpisode({ id: "only-one" }));
      const recent = store.getRecent(100);
      expect(recent.length).toBe(1);
    });

    it("returns empty on empty store", () => {
      expect(store.getRecent(10)).toEqual([]);
    });
  });

  // ─────────────── getByOutcome ───────────────

  describe("getByOutcome", () => {
    beforeEach(async () => {
      await store.storeBatch([
        makeEpisode({ id: "o1", outcome: "success" }),
        makeEpisode({ id: "o2", outcome: "failure" }),
        makeEpisode({ id: "o3", outcome: "success" }),
        makeEpisode({ id: "o4", outcome: "partial" }),
        makeEpisode({ id: "o5", outcome: "cancelled" }),
      ]);
    });

    it("filters by success", () => {
      const results = store.getByOutcome("success");
      expect(results.length).toBe(2);
    });

    it("filters by failure", () => {
      const results = store.getByOutcome("failure");
      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe("o2");
    });

    it("respects limit", () => {
      const results = store.getByOutcome("success", 1);
      expect(results.length).toBe(1);
    });
  });

  // ─────────────── getBySquad ───────────────

  describe("getBySquad", () => {
    it("filters by squad ID", async () => {
      await store.storeBatch([
        makeEpisode({ id: "sq1", squadId: "alpha" }),
        makeEpisode({ id: "sq2", squadId: "beta" }),
        makeEpisode({ id: "sq3", squadId: "alpha" }),
      ]);

      const alpha = store.getBySquad("alpha");
      expect(alpha.length).toBe(2);
      expect(alpha.map((e) => e.id).toSorted()).toEqual(["sq1", "sq3"]);
    });
  });

  // ─────────────── getById ───────────────

  describe("getById", () => {
    it("returns episode by ID", async () => {
      const ep = makeEpisode({ id: "find-me", taskDescription: "findable task" });
      await store.store(ep);

      const found = store.getById("find-me");
      expect(found).toBeDefined();
      expect(found!.taskDescription).toBe("findable task");
    });

    it("returns undefined for unknown ID", () => {
      expect(store.getById("does-not-exist")).toBeUndefined();
    });
  });

  // ─────────────── Cleanup (retention) ───────────────

  describe("cleanup", () => {
    it("removes old successful episodes beyond retention", async () => {
      const retentionDays = AGENTS.MEMORY.LONG_TERM.RETENTION.SUCCESS_DAYS;

      await store.storeBatch([
        makeEpisodeAt(retentionDays + 10, { id: "old-success", outcome: "success" }),
        makeEpisodeAt(5, { id: "recent-success", outcome: "success" }),
      ]);

      const result = await store.cleanup();
      expect(result.removed).toBe(1);
      expect(result.retained).toBe(1);
      expect(store.getById("recent-success")).toBeDefined();
      expect(store.getById("old-success")).toBeUndefined();
    });

    it("removes old failed episodes with shorter retention", async () => {
      const failRetention = AGENTS.MEMORY.LONG_TERM.RETENTION.FAILURE_DAYS;
      const successRetention = AGENTS.MEMORY.LONG_TERM.RETENTION.SUCCESS_DAYS;

      await store.storeBatch([
        // Old failure: beyond failure retention but within success retention
        makeEpisodeAt(failRetention + 5, { id: "old-fail", outcome: "failure" }),
        // Old success: within success retention
        makeEpisodeAt(failRetention + 5, { id: "old-success", outcome: "success" }),
      ]);

      // Both are `failRetention + 5` days old.
      // Failure retention < success retention, so failure gets cleaned but success stays.
      if (failRetention + 5 <= successRetention) {
        const result = await store.cleanup();
        expect(store.getById("old-fail")).toBeUndefined();
        expect(store.getById("old-success")).toBeDefined();
      }
    });

    it("treats partial as success retention", async () => {
      const retentionDays = AGENTS.MEMORY.LONG_TERM.RETENTION.SUCCESS_DAYS;

      await store.store(
        makeEpisodeAt(retentionDays + 10, { id: "old-partial", outcome: "partial" }),
      );

      const result = await store.cleanup();
      expect(result.removed).toBe(1);
    });

    it("treats cancelled as failure retention", async () => {
      const retentionDays = AGENTS.MEMORY.LONG_TERM.RETENTION.FAILURE_DAYS;

      await store.store(
        makeEpisodeAt(retentionDays + 10, { id: "old-cancelled", outcome: "cancelled" }),
      );

      const result = await store.cleanup();
      expect(result.removed).toBe(1);
    });

    it("accepts custom nowMs for deterministic tests", async () => {
      const now = Date.now();
      const ep = makeEpisode({
        id: "custom-now",
        timestamp: new Date(now - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        outcome: "success",
      });
      await store.store(ep);

      const result = await store.cleanup(now);
      // SUCCESS_DAYS is 90, so 100 days old should be removed
      expect(result.removed).toBe(1);
    });

    it("no-ops when nothing to clean", async () => {
      await store.store(makeEpisode({ id: "fresh" }));
      const result = await store.cleanup();
      expect(result.removed).toBe(0);
      expect(result.retained).toBe(1);
    });

    it("persists after cleanup", async () => {
      const retentionDays = AGENTS.MEMORY.LONG_TERM.RETENTION.SUCCESS_DAYS;
      await store.store(makeEpisodeAt(retentionDays + 10, { id: "to-remove", outcome: "success" }));
      await store.store(makeEpisode({ id: "to-keep" }));

      await store.cleanup();

      // Reload and check persistence
      const store2 = new EpisodicStore(storePath, "");
      await store2.load();
      expect(store2.count()).toBe(1);
      expect(store2.getById("to-keep")).toBeDefined();
    });
  });

  // ─────────────── Stats ───────────────

  describe("getStats", () => {
    it("returns zero stats on empty store", () => {
      const stats = store.getStats();
      expect(stats.totalEpisodes).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
      expect(stats.totalTokensUsed).toBe(0);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });

    it("computes correct statistics", async () => {
      await store.storeBatch([
        makeEpisode({
          outcome: "success",
          durationMs: 1000,
          tokensUsed: 100,
          timestamp: new Date("2026-01-01"),
        }),
        makeEpisode({
          outcome: "failure",
          durationMs: 2000,
          tokensUsed: 200,
          timestamp: new Date("2026-01-15"),
        }),
        makeEpisode({
          outcome: "success",
          durationMs: 3000,
          tokensUsed: 300,
          timestamp: new Date("2026-02-01"),
        }),
      ]);

      const stats = store.getStats();
      expect(stats.totalEpisodes).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.avgDurationMs).toBe(2000);
      expect(stats.totalTokensUsed).toBe(600);
      expect(stats.newestTimestamp!.getTime()).toBe(new Date("2026-02-01").getTime());
      expect(stats.oldestTimestamp!.getTime()).toBe(new Date("2026-01-01").getTime());
    });
  });

  // ─────────────── Clear ───────────────

  describe("clear", () => {
    it("removes all episodes", async () => {
      await store.storeBatch([makeEpisode({ id: "c1" }), makeEpisode({ id: "c2" })]);
      expect(store.count()).toBe(2);

      await store.clear();
      expect(store.count()).toBe(0);
    });

    it("persists empty state", async () => {
      await store.store(makeEpisode());
      await store.clear();

      const store2 = new EpisodicStore(storePath, "");
      await store2.load();
      expect(store2.count()).toBe(0);
    });
  });
});

// ─────────────── LongTermMemory facade ───────────────

describe("LongTermMemory", () => {
  let tmpDir: string;
  let ltm: LongTermMemory;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltm-facade-"));
    ltm = new LongTermMemory(tmpDir, "");
    await ltm.load();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exposes episodic store", () => {
    expect(ltm.episodic).toBeInstanceOf(EpisodicStore);
  });

  it("can store and retrieve via facade", async () => {
    const ep = makeEpisode({ taskDescription: "facade test" });
    await ltm.episodic.store(ep);
    expect(ltm.episodic.count()).toBe(1);
    expect(ltm.episodic.getRecent(1)[0]!.taskDescription).toBe("facade test");
  });
});

// ─────────────── createLongTermMemory helper ───────────────

describe("createLongTermMemory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltm-factory-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a usable LongTermMemory instance", async () => {
    const ltm = createLongTermMemory(tmpDir, "");
    await ltm.load();
    expect(ltm.episodic.count()).toBe(0);
  });
});
