/**
 * Tests for WorkingMemory class
 *
 * @module agents/squad/memory/working-memory.test
 */

import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemory, createWorkingMemory } from "./working-memory.js";
import { AGENTS } from "../../../constants/index.js";

describe("WorkingMemory", () => {
  let wm: WorkingMemory;

  beforeEach(() => {
    wm = new WorkingMemory(5); // Smaller size for testing
  });

  describe("constructor", () => {
    it("creates with default max size 10", () => {
      const defaultWm = new WorkingMemory();
      expect(defaultWm.capacity()).toBe(
        AGENTS.MEMORY.WORKING.DEFAULT_CAPACITY,
      );
    });

    it("creates with custom max size", () => {
      const customWm = new WorkingMemory(7);
      expect(customWm.capacity()).toBe(7);
    });

    it("throws if max size < 1", () => {
      expect(() => new WorkingMemory(0)).toThrow("maxSize must be >=");
      expect(() => new WorkingMemory(-5)).toThrow("maxSize must be >=");
    });

    it("throws if max size > MAX_CAPACITY", () => {
      const tooLarge = AGENTS.MEMORY.WORKING.MAX_CAPACITY + 1;
      expect(() => new WorkingMemory(tooLarge)).toThrow("maxSize must be <=");
    });
  });

  describe("set and get", () => {
    it("stores and retrieves values", () => {
      wm.set("task", "Analyze code");
      wm.set("status", "in-progress");

      expect(wm.get("task")).toBe("Analyze code");
      expect(wm.get("status")).toBe("in-progress");
    });

    it("returns undefined for non-existent keys", () => {
      expect(wm.get("nonexistent")).toBeUndefined();
    });

    it("overwrites existing keys", () => {
      wm.set("count", 1);
      wm.set("count", 2);
      expect(wm.get("count")).toBe(2);
    });

    it("stores various value types", () => {
      // Use larger capacity for this test (6 items, needs size >= 6)
      const largeWm = new WorkingMemory(10);

      largeWm.set("string", "text");
      largeWm.set("number", 42);
      largeWm.set("boolean", true);
      largeWm.set("object", { foo: "bar" });
      largeWm.set("array", [1, 2, 3]);
      largeWm.set("null", null);

      expect(largeWm.get("string")).toBe("text");
      expect(largeWm.get("number")).toBe(42);
      expect(largeWm.get("boolean")).toBe(true);
      expect(largeWm.get("object")).toEqual({ foo: "bar" });
      expect(largeWm.get("array")).toEqual([1, 2, 3]);
      expect(largeWm.get("null")).toBeNull();
    });

    it("updates lastAccessedAt on get", () => {
      wm.set("key", "value");
      const entry1 = (wm as any).items.get("key");
      const time1 = entry1.lastAccessedAt.getTime();

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 5) {
        // Spin wait
      }

      wm.get("key");
      const entry2 = (wm as any).items.get("key");
      const time2 = entry2.lastAccessedAt.getTime();

      expect(time2).toBeGreaterThan(time1);
    });
  });

  describe("has", () => {
    it("returns true for existing keys", () => {
      wm.set("exists", "yes");
      expect(wm.has("exists")).toBe(true);
    });

    it("returns false for non-existent keys", () => {
      expect(wm.has("missing")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes keys", () => {
      wm.set("temp", "data");
      expect(wm.has("temp")).toBe(true);

      wm.delete("temp");
      expect(wm.has("temp")).toBe(false);
      expect(wm.get("temp")).toBeUndefined();
    });

    it("returns true if key existed", () => {
      wm.set("key", "value");
      expect(wm.delete("key")).toBe(true);
    });

    it("returns false if key did not exist", () => {
      expect(wm.delete("nonexistent")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all items", () => {
      wm.set("key1", "value1");
      wm.set("key2", "value2");
      wm.set("key3", "value3");
      expect(wm.size()).toBe(3);

      wm.clear();
      expect(wm.size()).toBe(0);
      expect(wm.has("key1")).toBe(false);
      expect(wm.has("key2")).toBe(false);
      expect(wm.has("key3")).toBe(false);
    });
  });

  describe("size and capacity", () => {
    it("tracks size correctly", () => {
      expect(wm.size()).toBe(0);

      wm.set("a", 1);
      expect(wm.size()).toBe(1);

      wm.set("b", 2);
      expect(wm.size()).toBe(2);

      wm.delete("a");
      expect(wm.size()).toBe(1);

      wm.clear();
      expect(wm.size()).toBe(0);
    });

    it("reports capacity correctly", () => {
      expect(wm.capacity()).toBe(5);
    });

    it("detects when full", () => {
      expect(wm.isFull()).toBe(false);

      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);
      wm.set("d", 4);
      expect(wm.isFull()).toBe(false);

      wm.set("e", 5);
      expect(wm.isFull()).toBe(true);
    });
  });

  describe("LRU eviction", () => {
    it("evicts least recently used when at capacity", () => {
      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);
      wm.set("d", 4);
      wm.set("e", 5);
      expect(wm.size()).toBe(5);

      // Adding 6th item should evict "a" (oldest)
      wm.set("f", 6);
      expect(wm.size()).toBe(5);
      expect(wm.has("a")).toBe(false);
      expect(wm.has("f")).toBe(true);
    });

    it("accessing item moves it to end (MRU)", () => {
      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);
      wm.set("d", 4);
      wm.set("e", 5);

      // Access "a" to make it MRU
      wm.get("a");

      // Adding 6th item should evict "b" (now oldest)
      wm.set("f", 6);
      expect(wm.has("a")).toBe(true);
      expect(wm.has("b")).toBe(false);
      expect(wm.has("f")).toBe(true);
    });

    it("updating existing key does not trigger eviction", () => {
      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);
      wm.set("d", 4);
      wm.set("e", 5);
      expect(wm.size()).toBe(5);

      // Updating existing key should not evict
      wm.set("a", 10);
      expect(wm.size()).toBe(5);
      expect(wm.get("a")).toBe(10);
    });

    it("evicts in correct order for multiple additions", () => {
      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);
      wm.set("d", 4);
      wm.set("e", 5);

      // Add 3 more items
      wm.set("f", 6); // Evicts a
      wm.set("g", 7); // Evicts b
      wm.set("h", 8); // Evicts c

      expect(wm.has("a")).toBe(false);
      expect(wm.has("b")).toBe(false);
      expect(wm.has("c")).toBe(false);
      expect(wm.has("d")).toBe(true);
      expect(wm.has("e")).toBe(true);
      expect(wm.has("f")).toBe(true);
      expect(wm.has("g")).toBe(true);
      expect(wm.has("h")).toBe(true);
    });
  });

  describe("keys", () => {
    it("returns all keys in LRU order", () => {
      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);

      const keys = wm.keys();
      expect(keys).toEqual(["a", "b", "c"]);
    });

    it("returns empty array when empty", () => {
      expect(wm.keys()).toEqual([]);
    });

    it("reflects access order", () => {
      wm.set("a", 1);
      wm.set("b", 2);
      wm.set("c", 3);

      // Access "a" to move it to end
      wm.get("a");

      const keys = wm.keys();
      expect(keys).toEqual(["b", "c", "a"]);
    });
  });

  describe("toObject", () => {
    it("converts to plain object", () => {
      wm.set("name", "Alice");
      wm.set("age", 30);
      wm.set("active", true);

      const obj = wm.toObject();
      expect(obj).toEqual({
        name: "Alice",
        age: 30,
        active: true,
      });
    });

    it("returns empty object when empty", () => {
      expect(wm.toObject()).toEqual({});
    });

    it("handles complex values", () => {
      wm.set("user", { name: "Bob", roles: ["admin", "user"] });
      wm.set("config", { timeout: 5000 });

      const obj = wm.toObject();
      expect(obj.user).toEqual({ name: "Bob", roles: ["admin", "user"] });
      expect(obj.config).toEqual({ timeout: 5000 });
    });
  });

  describe("createWorkingMemory", () => {
    it("creates instance with default size", () => {
      const wm = createWorkingMemory();
      expect(wm.capacity()).toBe(10);
    });

    it("creates instance with custom size", () => {
      const wm = createWorkingMemory(7);
      expect(wm.capacity()).toBe(7);
    });
  });

  describe("real-world usage", () => {
    it("manages agent task context", () => {
      const agentMemory = createWorkingMemory(10);

      // Agent starts task
      agentMemory.set("currentTask", "Analyze security audit");
      agentMemory.set("userId", "user_123");
      agentMemory.set("startTime", Date.now());

      // Agent executes tool
      agentMemory.set("lastToolCall", {
        tool: "web_search",
        query: "SQL injection prevention",
        result: ["Use parameterized queries", "Validate input"],
      });

      // Agent accesses context
      const task = agentMemory.get("currentTask");
      expect(task).toBe("Analyze security audit");

      // Task completes
      agentMemory.clear();
      expect(agentMemory.size()).toBe(0);
    });

    it("handles rapid context switches", () => {
      const agentMemory = createWorkingMemory(5);

      // Task 1
      agentMemory.set("task", "Research");
      agentMemory.set("query", "AI safety");
      expect(agentMemory.size()).toBe(2);

      // Task 1 completes
      agentMemory.clear();

      // Task 2
      agentMemory.set("task", "Code review");
      agentMemory.set("file", "auth.ts");
      agentMemory.set("line", 42);
      expect(agentMemory.size()).toBe(3);
      expect(agentMemory.get("query")).toBeUndefined(); // Previous task data gone
    });
  });
});
