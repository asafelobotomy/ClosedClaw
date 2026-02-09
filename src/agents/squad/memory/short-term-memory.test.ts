/**
 * Tests for ShortTermMemory class
 *
 * @module agents/squad/memory/short-term-memory.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AGENTS } from "../../../constants/index.js";
import {
  ShortTermMemory,
  createShortTermMemory,
  type ShortTermEntry,
} from "./short-term-memory.js";

describe("ShortTermMemory", () => {
  let stm: ShortTermMemory;

  beforeEach(() => {
    // Use short TTL for testing (1 second)
    stm = new ShortTermMemory(1000, false); // Disable auto-cleanup for tests
  });

  afterEach(() => {
    stm.destroy();
  });

  describe("constructor", () => {
    it("creates with default TTL", () => {
      const defaultStm = new ShortTermMemory(undefined, false);
      defaultStm.set("key", "value");
      expect(defaultStm.has("key")).toBe(true);
      defaultStm.destroy();
    });

    it("creates with custom TTL", () => {
      const customStm = new ShortTermMemory(5000, false);
      customStm.set("key", "value");
      expect(customStm.has("key")).toBe(true);
      customStm.destroy();
    });

    it("throws if TTL < 1", () => {
      expect(() => new ShortTermMemory(0, false)).toThrow("defaultTtl must be >= 1");
    });

    it("throws if TTL > MAX_TTL_MS", () => {
      const tooLarge = AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS + 1;
      expect(() => new ShortTermMemory(tooLarge, false)).toThrow("defaultTtl must be <=");
    });

    it("starts auto-cleanup when enabled", () => {
      const autoStm = new ShortTermMemory(1000, true, 100);
      expect(autoStm).toBeDefined();
      autoStm.destroy();
    });
  });

  describe("set and get", () => {
    it("stores and retrieves values", () => {
      stm.set("task", "Analyze code");
      stm.set("status", "in-progress");

      expect(stm.get("task")).toBe("Analyze code");
      expect(stm.get("status")).toBe("in-progress");
    });

    it("returns undefined for non-existent keys", () => {
      expect(stm.get("nonexistent")).toBeUndefined();
    });

    it("stores with custom TTL", () => {
      stm.set("customTtl", "value", 5000);
      expect(stm.get("customTtl")).toBe("value");
    });

    it("throws if custom TTL < 1", () => {
      expect(() => stm.set("key", "value", 0)).toThrow("TTL must be >= 1");
    });

    it("throws if custom TTL > MAX_TTL_MS", () => {
      const tooLarge = AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS + 1;
      expect(() => stm.set("key", "value", tooLarge)).toThrow("TTL must be <=");
    });

    it("stores various value types", () => {
      stm.set("string", "text");
      stm.set("number", 42);
      stm.set("boolean", true);
      stm.set("object", { foo: "bar" });
      stm.set("array", [1, 2, 3]);
      stm.set("null", null);

      expect(stm.get("string")).toBe("text");
      expect(stm.get("number")).toBe(42);
      expect(stm.get("boolean")).toBe(true);
      expect(stm.get("object")).toEqual({ foo: "bar" });
      expect(stm.get("array")).toEqual([1, 2, 3]);
      expect(stm.get("null")).toBeNull();
    });

    it("increments access count on get", () => {
      stm.set("key", "value");

      stm.get("key");
      stm.get("key");
      stm.get("key");

      const stats = stm.getStats();
      expect(stats.avgAccessCount).toBe(3);
    });

    it("extends TTL on access", async () => {
      // Set with 100ms TTL
      stm.set("key", "value", 100);

      // Access after 50ms (extends TTL)
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(stm.get("key")).toBe("value");

      // Should still exist after another 50ms (total 100ms from start)
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(stm.has("key")).toBe(true); // Extended TTL keeps it alive
    });
  });

  describe("expiration", () => {
    it("returns undefined for expired entries", async () => {
      stm.set("expires", "value", 50); // 50ms TTL

      // Don't access it - let it expire naturally
      // (accessing would extend TTL)

      // Should be expired after 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(stm.get("expires")).toBeUndefined();
    });

    it("removes expired entries on has() check", async () => {
      stm.set("expires", "value", 50);
      expect(stm.size()).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(stm.has("expires")).toBe(false);
      expect(stm.size()).toBe(0); // Cleaned up
    });
  });

  describe("has", () => {
    it("returns true for existing keys", () => {
      stm.set("exists", "yes");
      expect(stm.has("exists")).toBe(true);
    });

    it("returns false for non-existent keys", () => {
      expect(stm.has("missing")).toBe(false);
    });

    it("returns false for expired keys", async () => {
      stm.set("expires", "value", 50);
      expect(stm.has("expires")).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(stm.has("expires")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes keys", () => {
      stm.set("temp", "data");
      expect(stm.has("temp")).toBe(true);

      stm.delete("temp");
      expect(stm.has("temp")).toBe(false);
      expect(stm.get("temp")).toBeUndefined();
    });

    it("returns true if key existed", () => {
      stm.set("key", "value");
      expect(stm.delete("key")).toBe(true);
    });

    it("returns false if key did not exist", () => {
      expect(stm.delete("nonexistent")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      stm.set("key1", "value1");
      stm.set("key2", "value2");
      stm.set("key3", "value3");
      expect(stm.size()).toBe(3);

      stm.clear();
      expect(stm.size()).toBe(0);
      expect(stm.has("key1")).toBe(false);
    });
  });

  describe("size and keys", () => {
    it("tracks size correctly", () => {
      expect(stm.size()).toBe(0);

      stm.set("a", 1);
      expect(stm.size()).toBe(1);

      stm.set("b", 2);
      expect(stm.size()).toBe(2);

      stm.delete("a");
      expect(stm.size()).toBe(1);

      stm.clear();
      expect(stm.size()).toBe(0);
    });

    it("returns all keys", () => {
      stm.set("a", 1);
      stm.set("b", 2);
      stm.set("c", 3);

      const keys = stm.keys();
      expect(keys).toContain("a");
      expect(keys).toContain("b");
      expect(keys).toContain("c");
      expect(keys.length).toBe(3);
    });
  });

  describe("flagImportant", () => {
    it("flags entry as important", () => {
      stm.set("key", "value");
      expect(stm.flagImportant("key")).toBe(true);

      const hot = stm.getHotEntries();
      expect(hot.length).toBe(1);
      expect(hot[0][0]).toBe("key");
    });

    it("returns false for non-existent keys", () => {
      expect(stm.flagImportant("missing")).toBe(false);
    });

    it("returns false for expired keys", async () => {
      stm.set("expires", "value", 50);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(stm.flagImportant("expires")).toBe(false);
    });
  });

  describe("getHotEntries", () => {
    it("returns entries with access count >= threshold", () => {
      stm.set("cold", "value");
      stm.set("hot", "value");

      // Access "hot" 5 times (threshold)
      for (let i = 0; i < 5; i++) {
        stm.get("hot");
      }

      const hot = stm.getHotEntries();
      expect(hot.length).toBe(1);
      expect(hot[0][0]).toBe("hot");
    });

    it("returns flagged entries", () => {
      stm.set("important", "value");
      stm.flagImportant("important");

      const hot = stm.getHotEntries();
      expect(hot.length).toBe(1);
      expect(hot[0][0]).toBe("important");
    });

    it("skips expired entries", async () => {
      // Set entry with short TTL but DON'T access it
      // (accessing would extend TTL and prevent expiration in test timeframe)
      stm.set("willExpire", "value", 50);

      // Manually increment access count without extending TTL (hack for test)
      const entry = (stm as any).cache.get("willExpire");
      if (entry) {
        entry.accessCount = 5; // Make it hot
      }

      // Should be hot initially
      const initialHot = stm.getHotEntries();
      expect(initialHot.length).toBe(1);

      // Wait for expiration (50ms TTL + buffer)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not be in hot entries after expiration
      expect(stm.getHotEntries().length).toBe(0);
    });

    it("returns empty array when no hot entries", () => {
      stm.set("cold1", "value");
      stm.set("cold2", "value");

      expect(stm.getHotEntries()).toEqual([]);
    });
  });

  describe("evictExpired", () => {
    it("removes expired entries", async () => {
      stm.set("expires1", "value", 50);
      stm.set("expires2", "value", 50);
      stm.set("persists", "value", 10_000);

      expect(stm.size()).toBe(3);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const evicted = stm.evictExpired();
      expect(evicted).toBe(2);
      expect(stm.size()).toBe(1);
      expect(stm.has("persists")).toBe(true);
    });

    it("returns 0 when no expired entries", () => {
      stm.set("key1", "value");
      stm.set("key2", "value");

      expect(stm.evictExpired()).toBe(0);
      expect(stm.size()).toBe(2);
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", () => {
      stm.set("a", 1);
      stm.set("b", 2);
      stm.set("c", 3);

      // Access patterns
      stm.get("a"); // 1 access
      stm.get("b");
      stm.get("b"); // 2 accesses
      stm.get("c");
      stm.get("c");
      stm.get("c"); // 3 accesses

      const stats = stm.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.hotEntries).toBe(0); // None reached threshold (5)
      expect(stats.avgAccessCount).toBe(2); // (1+2+3)/3
    });

    it("counts hot entries correctly", () => {
      stm.set("hot", "value");

      // Make it hot (5 accesses)
      for (let i = 0; i < 5; i++) {
        stm.get("hot");
      }

      const stats = stm.getStats();
      expect(stats.hotEntries).toBe(1);
    });

    it("handles empty cache", () => {
      const stats = stm.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.hotEntries).toBe(0);
      expect(stats.avgAccessCount).toBe(0);
    });
  });

  describe("auto-cleanup", () => {
    it("automatically evicts expired entries", async () => {
      // Create with auto-cleanup every 50ms
      const autoStm = new ShortTermMemory(100, true, 50);

      autoStm.set("expires", "value", 50);
      expect(autoStm.size()).toBe(1);

      // Wait for expiration + cleanup cycle
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(autoStm.size()).toBe(0);
      autoStm.destroy();
    });
  });

  describe("createShortTermMemory", () => {
    it("creates instance with default TTL", () => {
      const stm = createShortTermMemory();
      expect(stm).toBeDefined();
      stm.destroy();
    });

    it("creates instance with custom TTL", () => {
      const stm = createShortTermMemory(5000);
      stm.set("key", "value");
      expect(stm.has("key")).toBe(true);
      stm.destroy();
    });
  });

  describe("real-world usage", () => {
    it("manages agent communication cache", () => {
      const commsCache = createShortTermMemory<string>(300_000); // 5 min

      // Store recent messages
      commsCache.set("msg_123", "Hello from agent A");
      commsCache.set("msg_124", "Response from agent B");

      // Access frequently
      for (let i = 0; i < 5; i++) {
        commsCache.get("msg_123");
      }

      // Should be hot for consolidation
      const hot = commsCache.getHotEntries();
      expect(hot.length).toBe(1);
      expect(hot[0][1].value).toBe("Hello from agent A");

      commsCache.destroy();
    });

    it("caches task queue state", () => {
      const queueCache = createShortTermMemory<{
        status: string;
        assignedTo?: string;
      }>();

      queueCache.set("task_1", { status: "pending" });
      queueCache.set("task_2", { status: "in-progress", assignedTo: "agent_A" });

      const task = queueCache.get("task_2");
      expect(task?.status).toBe("in-progress");
      expect(task?.assignedTo).toBe("agent_A");

      queueCache.destroy();
    });
  });
});
