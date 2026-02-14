/**
 * Tests for squad-aware agent tools.
 *
 * @see {@link ./tools.ts}
 */

/* oxlint-disable typescript-eslint/unbound-method */

import { describe, it, expect, vi } from "vitest";
import {
  createDelegateToAgentTool,
  createSquadMemoryReadTool,
  createSquadMemoryWriteTool,
  createSquadBroadcastTool,
  createSquadStatusTool,
  createWaitForTaskTool,
  createSquadTools,
  type SquadToolContext,
} from "./tools.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseResult(result: unknown): unknown {
  // Tool handler returns { content: [{ type: "text", text: "..." }] }
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text);
}

function mockContext(overrides?: Partial<SquadToolContext>): SquadToolContext {
  const memStore = new Map<string, unknown>();

  return {
    agentId: "agent-1",
    squadId: "squad-1",
    coordinator: {
      getSquadStatus: vi.fn().mockReturnValue({
        isRunning: true,
        strategy: "pipeline",
        agents: [
          { agentId: "agent-1", role: "coder", state: "idle" },
          { agentId: "agent-2", role: "researcher", state: "working" },
        ],
      }),
      createSquad: vi.fn().mockResolvedValue("squad-new"),
      executeTask: vi.fn().mockResolvedValue({ success: true, output: "done" }),
      terminateSquad: vi.fn().mockResolvedValue(undefined),
    } as unknown as SquadToolContext["coordinator"],
    sharedMemory: {
      get: vi.fn((key: string) => memStore.get(key)),
      set: vi.fn((key: string, value: unknown) => {
        memStore.set(key, value);
      }),
      keys: vi.fn(() => [...memStore.keys()]),
      flagImportant: vi.fn(),
      size: vi.fn(() => memStore.size),
      delete: vi.fn(),
      clear: vi.fn(),
    } as unknown as SquadToolContext["sharedMemory"],
    workingMemory: {} as SquadToolContext["workingMemory"],
    ipc: {
      broadcast: vi.fn(),
    } as unknown as SquadToolContext["ipc"],
    taskQueue: {
      enqueue: vi.fn().mockReturnValue("task-42"),
      getTask: vi.fn().mockReturnValue({
        id: "task-42",
        status: "completed",
        type: "code",
        description: "Implement feature",
        priority: "normal",
        claimedBy: "agent-2",
        result: { data: "done" },
        error: undefined,
        attempts: 1,
        createdAt: "2025-01-01T00:00:00Z",
        completedAt: "2025-01-01T00:01:00Z",
      }),
      getStats: vi.fn().mockReturnValue({
        pending: 2,
        claimed: 1,
        completed: 5,
        failed: 0,
        cancelled: 0,
        totalEnqueued: 8,
      }),
    } as unknown as SquadToolContext["taskQueue"],
    isCoordinator: true,
    ...overrides,
  };
}

// ─── delegate_to_agent ──────────────────────────────────────────────────────

describe("createDelegateToAgentTool", () => {
  it("enqueues a task with the given description", async () => {
    const ctx = mockContext();
    const tool = createDelegateToAgentTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", {
        task_description: "Write auth module",
        task_type: "code",
        priority: "high",
      }),
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.taskId).toBe("task-42");
    expect(result.priority).toBe("high");
    expect(ctx.taskQueue.enqueue).toHaveBeenCalledOnce();

    const enqueuedInput = (ctx.taskQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(enqueuedInput.description).toBe("Write auth module");
    expect(enqueuedInput.type).toBe("code");
    expect(enqueuedInput.priority).toBe("high");
    expect(enqueuedInput.metadata.delegatedBy).toBe("agent-1");
  });

  it("defaults task_type and priority", async () => {
    const ctx = mockContext();
    const tool = createDelegateToAgentTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", { task_description: "Do something" }),
    ) as Record<string, unknown>;

    expect(result.priority).toBe("normal");
    const input = (ctx.taskQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.type).toBe("general");
    expect(input.priority).toBe("normal");
  });

  it("passes target_role as requiredCapabilities", async () => {
    const ctx = mockContext();
    const tool = createDelegateToAgentTool(ctx);

    await tool.execute("test-call-id", {
      task_description: "Research topic",
      target_role: "researcher",
    });

    const input = (ctx.taskQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.requiredCapabilities).toEqual(["researcher"]);
    expect(input.metadata.targetRole).toBe("researcher");
  });

  it("passes target_agent_id in metadata", async () => {
    const ctx = mockContext();
    const tool = createDelegateToAgentTool(ctx);

    await tool.execute("test-call-id", {
      task_description: "Review code",
      target_agent_id: "agent-7",
    });

    const input = (ctx.taskQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.metadata.targetAgentId).toBe("agent-7");
  });

  it("parses JSON input_data", async () => {
    const ctx = mockContext();
    const tool = createDelegateToAgentTool(ctx);

    await tool.execute("test-call-id", {
      task_description: "Process",
      input_data: '{"key":"val"}',
    });

    const input = (ctx.taskQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.input).toEqual({ key: "val" });
  });

  it("falls back on invalid JSON input_data", async () => {
    const ctx = mockContext();
    const tool = createDelegateToAgentTool(ctx);

    await tool.execute("test-call-id", { task_description: "Process", input_data: "not-json" });

    const input = (ctx.taskQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.input).toEqual({ raw: "not-json" });
  });
});

// ─── squad_memory_read ──────────────────────────────────────────────────────

describe("createSquadMemoryReadTool", () => {
  it("lists keys from shared memory", async () => {
    const ctx = mockContext();
    // Seed memory
    (ctx.sharedMemory.set as ReturnType<typeof vi.fn>)("key1", "val1");
    (ctx.sharedMemory.set as ReturnType<typeof vi.fn>)("key2", "val2");

    const tool = createSquadMemoryReadTool(ctx);
    const result = parseResult(await tool.execute("test-call-id", { action: "list_keys" })) as {
      keys: Array<{ key: string; found: boolean }>;
      count: number;
    };

    expect(result.count).toBe(2);
    expect(result.keys.map((k) => k.key).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "key1",
      "key2",
    ]);
  });

  it("reads a specific key", async () => {
    const ctx = mockContext();
    (ctx.sharedMemory.set as ReturnType<typeof vi.fn>)("mykey", "myval");

    const tool = createSquadMemoryReadTool(ctx);
    const result = parseResult(
      await tool.execute("test-call-id", { action: "get", key: "mykey" }),
    ) as {
      found: boolean;
      key: string;
      value: unknown;
    };

    expect(result.found).toBe(true);
    expect(result.key).toBe("mykey");
    expect(result.value).toBe("myval");
  });

  it("returns not-found for missing key", async () => {
    const ctx = mockContext();

    const tool = createSquadMemoryReadTool(ctx);
    const result = parseResult(
      await tool.execute("test-call-id", { action: "get", key: "nope" }),
    ) as {
      found: boolean;
      value: unknown;
    };

    expect(result.found).toBe(false);
    expect(result.value).toBeNull();
  });

  it("returns error when key missing for get action", async () => {
    const ctx = mockContext();
    const tool = createSquadMemoryReadTool(ctx);
    const result = parseResult(await tool.execute("test-call-id", { action: "get" })) as {
      error: string;
    };

    expect(result.error).toContain("Key required");
  });
});

// ─── squad_memory_write ──────────────────────────────────────────────────────

describe("createSquadMemoryWriteTool", () => {
  it("writes a value", async () => {
    const ctx = mockContext();
    const tool = createSquadMemoryWriteTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", { key: "results", value: '"hello"' }),
    ) as {
      success: boolean;
      key: string;
      writtenBy: string;
    };

    expect(result.success).toBe(true);
    expect(result.key).toBe("results");
    expect(result.writtenBy).toBe("agent-1");
    expect(ctx.sharedMemory.set).toHaveBeenCalledWith("results", "hello", undefined);
  });

  it("flags important entries", async () => {
    const ctx = mockContext();
    const tool = createSquadMemoryWriteTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", {
        key: "findings",
        value: '"critical data"',
        important: "true",
      }),
    ) as { important: boolean };

    expect(result.important).toBe(true);
    expect(ctx.sharedMemory.flagImportant).toHaveBeenCalledWith("findings");
  });

  it("applies TTL in milliseconds", async () => {
    const ctx = mockContext();
    const tool = createSquadMemoryWriteTool(ctx);

    await tool.execute("test-call-id", { key: "temp", value: '"data"', ttl_seconds: "60" });

    expect(ctx.sharedMemory.set).toHaveBeenCalledWith("temp", "data", 60_000);
  });

  it("stores raw string when JSON parse fails", async () => {
    const ctx = mockContext();
    const tool = createSquadMemoryWriteTool(ctx);

    await tool.execute("test-call-id", { key: "raw", value: "not valid json" });

    expect(ctx.sharedMemory.set).toHaveBeenCalledWith("raw", "not valid json", undefined);
  });
});

// ─── squad_broadcast ────────────────────────────────────────────────────────

describe("createSquadBroadcastTool", () => {
  it("broadcasts a message via IPC", async () => {
    const ctx = mockContext();
    const tool = createSquadBroadcastTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", { message: "Found results", message_type: "result" }),
    ) as { success: boolean; type: string };

    expect(result.success).toBe(true);
    expect(result.type).toBe("result");
    expect(ctx.ipc.broadcast).toHaveBeenCalledOnce();

    const [senderId, msg] = (ctx.ipc.broadcast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(senderId).toBe("agent-1");
    expect(msg.type).toBe("result");
    expect(msg.payload.message).toBe("Found results");
  });

  it("defaults to notification type", async () => {
    const ctx = mockContext();
    const tool = createSquadBroadcastTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", { message: "status update" }),
    ) as {
      type: string;
    };

    expect(result.type).toBe("notification");
  });

  it("falls back to notification for invalid type", async () => {
    const ctx = mockContext();
    const tool = createSquadBroadcastTool(ctx);

    const result = parseResult(
      await tool.execute("test-call-id", { message: "hello", message_type: "invalid_type" }),
    ) as { type: string };

    expect(result.type).toBe("notification");
  });
});

// ─── squad_status ──────────────────────────────────────────────────────────

describe("createSquadStatusTool", () => {
  it("returns squad status and queue stats", async () => {
    const ctx = mockContext();
    const tool = createSquadStatusTool(ctx);

    const result = parseResult(await tool.execute("test-call-id", {})) as {
      squadId: string;
      isRunning: boolean;
      strategy: string;
      agents: Array<{ agentId: string }>;
      taskQueue: { pending: number; completed: number; total: number };
      myAgentId: string;
    };

    expect(result.squadId).toBe("squad-1");
    expect(result.isRunning).toBe(true);
    expect(result.strategy).toBe("pipeline");
    expect(result.agents).toHaveLength(2);
    expect(result.taskQueue.pending).toBe(2);
    expect(result.taskQueue.completed).toBe(5);
    expect(result.taskQueue.total).toBe(8);
    expect(result.myAgentId).toBe("agent-1");
  });

  it("handles coordinator errors gracefully", async () => {
    const ctx = mockContext({
      coordinator: {
        getSquadStatus: vi.fn().mockImplementation(() => {
          throw new Error("squad not found");
        }),
      } as unknown as SquadToolContext["coordinator"],
    });

    const tool = createSquadStatusTool(ctx);
    const result = parseResult(await tool.execute("test-call-id", {})) as {
      isRunning: boolean;
      strategy: string;
    };

    expect(result.isRunning).toBe(false);
    expect(result.strategy).toBe("unknown");
  });
});

// ─── wait_for_task ─────────────────────────────────────────────────────────

describe("createWaitForTaskTool", () => {
  it("returns task info", async () => {
    const ctx = mockContext();
    const tool = createWaitForTaskTool(ctx);

    const result = parseResult(await tool.execute("test-call-id", { task_id: "task-42" })) as {
      taskId: string;
      status: string;
      result: unknown;
    };

    expect(result.taskId).toBe("task-42");
    expect(result.status).toBe("completed");
    expect(result.result).toEqual({ data: "done" });
  });

  it("returns error for unknown task", async () => {
    const ctx = mockContext();
    (ctx.taskQueue.getTask as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const tool = createWaitForTaskTool(ctx);
    const result = parseResult(await tool.execute("test-call-id", { task_id: "task-999" })) as {
      error: string;
    };

    expect(result.error).toContain("not found");
  });
});

// ─── createSquadTools (factory) ─────────────────────────────────────────────

describe("createSquadTools", () => {
  it("includes delegate_to_agent for coordinators", () => {
    const ctx = mockContext({ isCoordinator: true });
    const toolSet = createSquadTools(ctx);

    expect(toolSet.names).toContain("delegate_to_agent");
    expect(toolSet.names).toContain("squad_memory_read");
    expect(toolSet.names).toContain("squad_memory_write");
    expect(toolSet.names).toContain("squad_broadcast");
    expect(toolSet.names).toContain("squad_status");
    expect(toolSet.names).toContain("wait_for_task");
    expect(toolSet.tools).toHaveLength(6);
  });

  it("excludes delegate_to_agent for non-coordinators", () => {
    const ctx = mockContext({ isCoordinator: false });
    const toolSet = createSquadTools(ctx);

    expect(toolSet.names).not.toContain("delegate_to_agent");
    expect(toolSet.tools).toHaveLength(5);
  });
});
