/**
 * Tests for Task Queue - priority, claims, dependencies, retries, timeouts
 *
 * @module agents/squad/task-queue.test
 */

import { describe, expect, it, beforeEach } from "vitest";
import { TaskQueue, createTaskQueue, type TaskInput } from "./task-queue.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    type: "research",
    description: "Test task",
    input: { data: "test" },
    priority: "normal",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TaskQueue", () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  // ─── Enqueue ──────────────────────────────────────────────────────────

  describe("enqueue", () => {
    it("should enqueue a task and return its ID", () => {
      const id = queue.enqueue(makeTask());
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(queue.size).toBe(1);
    });

    it("should use provided ID if given", () => {
      const id = queue.enqueue(makeTask({ id: "custom-id" }));
      expect(id).toBe("custom-id");
    });

    it("should reject duplicate IDs", () => {
      queue.enqueue(makeTask({ id: "dup" }));
      expect(() => queue.enqueue(makeTask({ id: "dup" }))).toThrow(/already exists/);
    });

    it("should enforce max queue size", () => {
      const small = new TaskQueue({ maxSize: 2 });
      small.enqueue(makeTask());
      small.enqueue(makeTask());
      expect(() => small.enqueue(makeTask())).toThrow(/full/);
    });

    it("should validate dependencies exist", () => {
      expect(() => queue.enqueue(makeTask({ dependsOn: ["nonexistent"] }))).toThrow(/not found/);
    });

    it("should accept valid dependencies", () => {
      const dep = queue.enqueue(makeTask({ id: "dep-1" }));
      const child = queue.enqueue(makeTask({ dependsOn: [dep] }));
      expect(child).toBeDefined();
    });

    it("should set default retries and timeout from config", () => {
      const id = queue.enqueue(makeTask());
      const info = queue.getTask(id);
      expect(info).toBeDefined();
    });
  });

  // ─── Claim ────────────────────────────────────────────────────────────

  describe("claim", () => {
    it("should claim the next available task", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      const task = queue.claim("agent-1");
      expect(task).not.toBeNull();
      expect(task!.id).toBe("t1");
    });

    it("should return null when queue is empty", () => {
      expect(queue.claim("agent-1")).toBeNull();
    });

    it("should return null when all tasks are claimed", () => {
      queue.enqueue(makeTask());
      queue.claim("agent-1");
      expect(queue.claim("agent-2")).toBeNull();
    });

    it("should claim higher priority tasks first", () => {
      queue.enqueue(makeTask({ id: "low", priority: "low" }));
      queue.enqueue(makeTask({ id: "high", priority: "high" }));
      queue.enqueue(makeTask({ id: "normal", priority: "normal" }));

      expect(queue.claim("a1")!.id).toBe("high");
      expect(queue.claim("a2")!.id).toBe("normal");
      expect(queue.claim("a3")!.id).toBe("low");
    });

    it("should use FIFO within same priority", () => {
      queue.enqueue(makeTask({ id: "first", priority: "normal" }));
      queue.enqueue(makeTask({ id: "second", priority: "normal" }));

      expect(queue.claim("a1")!.id).toBe("first");
      expect(queue.claim("a2")!.id).toBe("second");
    });

    it("should match required capabilities", () => {
      queue.enqueue(
        makeTask({
          id: "web-task",
          requiredCapabilities: ["web_search"],
        }),
      );
      queue.enqueue(
        makeTask({
          id: "code-task",
          requiredCapabilities: ["coding"],
        }),
      );

      // Agent with only coding capability
      const task = queue.claim("coder", ["coding"]);
      expect(task!.id).toBe("code-task");
    });

    it("should skip tasks when agent lacks capabilities", () => {
      queue.enqueue(
        makeTask({
          id: "needs-search",
          requiredCapabilities: ["web_search", "reading"],
        }),
      );

      // Agent has only reading
      expect(queue.claim("a1", ["reading"])).toBeNull();
    });

    it("should claim tasks with no required capabilities", () => {
      queue.enqueue(makeTask({ id: "any-task" }));
      const task = queue.claim("a1", ["whatever"]);
      expect(task).not.toBeNull();
    });

    it("should block on unresolved dependencies", () => {
      const dep = queue.enqueue(makeTask({ id: "dep" }));
      queue.enqueue(makeTask({ id: "child", dependsOn: [dep] }));

      // dep is pending, not completed — child should not be claimable before dep
      const task = queue.claim("a1");
      expect(task!.id).toBe("dep"); // Should get the dep first
    });

    it("should unblock after dependency completed", () => {
      const dep = queue.enqueue(makeTask({ id: "dep" }));
      queue.enqueue(makeTask({ id: "child", dependsOn: [dep] }));

      queue.claim("a1"); // Claims dep
      queue.complete(dep); // Complete it

      const task = queue.claim("a2");
      expect(task!.id).toBe("child"); // Now child is claimable
    });

    it("should increment attempt counter", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.claim("a1");
      const info = queue.getTask("t1");
      expect(info.attempts).toBe(1);
    });

    it("should track claimedBy", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.claim("agent-42");
      const info = queue.getTask("t1");
      expect(info.claimedBy).toBe("agent-42");
    });
  });

  // ─── Complete ─────────────────────────────────────────────────────────

  describe("complete", () => {
    it("should mark a claimed task as completed", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.claim("a1");
      queue.complete("t1", { answer: 42 });

      const info = queue.getTask("t1");
      expect(info.status).toBe("completed");
      expect(info.result).toEqual({ answer: 42 });
      expect(info.completedAt).toBeDefined();
    });

    it("should throw if task not claimed", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      expect(() => queue.complete("t1")).toThrow(/expected "claimed"/);
    });

    it("should throw if task not found", () => {
      expect(() => queue.complete("nonexistent")).toThrow(/not found/);
    });
  });

  // ─── Fail ─────────────────────────────────────────────────────────────

  describe("fail", () => {
    it("should re-queue task when retries remain", () => {
      queue.enqueue(makeTask({ id: "t1", retries: 3 }));
      queue.claim("a1");
      const retried = queue.fail("t1", "Oops");

      expect(retried).toBe(true);
      expect(queue.getStatus("t1")).toBe("pending");
    });

    it("should mark failed when retries exhausted", () => {
      queue.enqueue(makeTask({ id: "t1", retries: 1 }));
      queue.claim("a1");
      const retried = queue.fail("t1", "Oops");

      expect(retried).toBe(false);
      expect(queue.getStatus("t1")).toBe("failed");
      expect(queue.getTask("t1").error).toBe("Oops");
    });

    it("should allow re-claim after retry", () => {
      queue.enqueue(makeTask({ id: "t1", retries: 2 }));
      queue.claim("a1");
      queue.fail("t1", "first fail");

      // Should be claimable again
      const task = queue.claim("a2");
      expect(task!.id).toBe("t1");
    });

    it("should throw if task not claimed", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      expect(() => queue.fail("t1", "err")).toThrow(/expected "claimed"/);
    });
  });

  // ─── Cancel ───────────────────────────────────────────────────────────

  describe("cancel", () => {
    it("should cancel a pending task", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.cancel("t1");
      expect(queue.getStatus("t1")).toBe("cancelled");
    });

    it("should cancel a claimed task", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.claim("a1");
      queue.cancel("t1");
      expect(queue.getStatus("t1")).toBe("cancelled");
    });

    it("should throw on already completed task", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.claim("a1");
      queue.complete("t1");
      expect(() => queue.cancel("t1")).toThrow(/already/);
    });
  });

  // ─── Release ──────────────────────────────────────────────────────────

  describe("release", () => {
    it("should return claimed task to pending", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.claim("a1");
      queue.release("t1");

      expect(queue.getStatus("t1")).toBe("pending");
      expect(queue.getTask("t1").claimedBy).toBeUndefined();
    });

    it("should throw if not claimed", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      expect(() => queue.release("t1")).toThrow(/expected "claimed"/);
    });
  });

  describe("releaseByAgent", () => {
    it("should release all tasks claimed by a specific agent", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.enqueue(makeTask({ id: "t2" }));
      queue.enqueue(makeTask({ id: "t3" }));

      queue.claim("agent-crash");
      queue.claim("agent-crash");
      queue.claim("agent-ok");

      const released = queue.releaseByAgent("agent-crash");
      expect(released).toBe(2);

      const stats = queue.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.claimed).toBe(1);
    });
  });

  // ─── Timeout ──────────────────────────────────────────────────────────

  describe("releaseTimedOut", () => {
    it("should release tasks that exceeded timeout", () => {
      const fastQueue = new TaskQueue({ maxSize: 100 });
      const id = fastQueue.enqueue(makeTask({ timeout: 1 })); // 1ms timeout
      fastQueue.claim("a1");

      // Wait a bit for timeout
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait
      }

      const released = fastQueue.releaseTimedOut();
      expect(released).toBe(1);
      expect(fastQueue.getStatus(id)).toBe("pending");
    });

    it("should not release tasks within timeout", () => {
      queue.enqueue(makeTask({ id: "t1", timeout: 60_000 }));
      queue.claim("a1");

      const released = queue.releaseTimedOut();
      expect(released).toBe(0);
    });
  });

  // ─── Listing & Stats ─────────────────────────────────────────────────

  describe("listTasks", () => {
    it("should filter by status", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.enqueue(makeTask({ id: "t2" }));
      queue.claim("a1");

      const pending = queue.listTasks({ status: "pending" });
      expect(pending).toHaveLength(1);

      const claimed = queue.listTasks({ status: "claimed" });
      expect(claimed).toHaveLength(1);
    });

    it("should filter by type", () => {
      queue.enqueue(makeTask({ id: "t1", type: "research" }));
      queue.enqueue(makeTask({ id: "t2", type: "code" }));

      const research = queue.listTasks({ type: "research" });
      expect(research).toHaveLength(1);
      expect(research[0].type).toBe("research");
    });

    it("should filter by claimedBy", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.enqueue(makeTask({ id: "t2" }));
      queue.claim("agent-x");

      const byAgent = queue.listTasks({ claimedBy: "agent-x" });
      expect(byAgent).toHaveLength(1);
    });
  });

  describe("getStats", () => {
    it("should report accurate counts", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.enqueue(makeTask({ id: "t2", retries: 0 }));
      queue.enqueue(makeTask({ id: "t3" }));

      queue.claim("a1");
      queue.complete("t1");

      queue.claim("a2");
      queue.fail("t2", "bad");

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(3);
      expect(stats.pending).toBe(1); // t3
      expect(stats.completed).toBe(1); // t1
      expect(stats.failed).toBe(1); // t2
      expect(stats.claimed).toBe(0);
    });
  });

  // ─── Purge & Clear ────────────────────────────────────────────────────

  describe("purge", () => {
    it("should remove completed and failed tasks", () => {
      queue.enqueue(makeTask({ id: "t1" }));
      queue.enqueue(makeTask({ id: "t2", retries: 0 }));
      queue.enqueue(makeTask({ id: "t3" }));

      queue.claim("a1");
      queue.complete("t1");

      queue.claim("a2");
      queue.fail("t2", "err");

      const purged = queue.purge();
      expect(purged).toBe(2);
      expect(queue.size).toBe(1); // Only t3 remains
    });
  });

  describe("clear", () => {
    it("should remove all tasks", () => {
      queue.enqueue(makeTask());
      queue.enqueue(makeTask());
      queue.clear();
      expect(queue.size).toBe(0);
    });
  });

  // ─── Retry Backoff ────────────────────────────────────────────────────

  describe("getRetryDelay", () => {
    it("should calculate exponential backoff", () => {
      const q = new TaskQueue({ retryBaseMs: 100, retryMaxMs: 5000 });
      expect(q.getRetryDelay(0)).toBe(100);
      expect(q.getRetryDelay(1)).toBe(200);
      expect(q.getRetryDelay(2)).toBe(400);
    });

    it("should cap at max backoff", () => {
      const q = new TaskQueue({ retryBaseMs: 100, retryMaxMs: 300 });
      expect(q.getRetryDelay(10)).toBe(300);
    });
  });
});

// ─── Factory ──────────────────────────────────────────────────────────────────

describe("createTaskQueue", () => {
  it("should create a queue with defaults", () => {
    const q = createTaskQueue();
    expect(q).toBeInstanceOf(TaskQueue);
  });

  it("should create a queue with custom config", () => {
    const q = createTaskQueue({ maxSize: 10 });
    expect(q).toBeInstanceOf(TaskQueue);
  });
});
