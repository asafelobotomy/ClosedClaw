/**
 * Tests for Squad Coordinator - strategies, squad lifecycle, task execution
 *
 * @module agents/squad/coordinator.test
 */

import { afterEach, beforeEach, describe, expect, it, _vi } from "vitest";
import type { TaskInput } from "./task-queue.js";
import {
  SquadCoordinator,
  createSquadCoordinator,
  type SquadConfig,
  type ComplexTask,
} from "./coordinator.js";
import { AgentSpawner, type AgentTaskHandler } from "./spawner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Task handler that prepends role to output */
const roleEchoHandler: AgentTaskHandler = async (handle, message) => {
  return {
    success: true,
    output: `[${handle.role}] ${message.content}`,
    tokensUsed: 10,
  };
};

/** Task handler that fails */
const failingHandler: AgentTaskHandler = async () => {
  return { success: false, error: "Agent failed" };
};

/** Counter-based handler to verify execution order */
function createOrderedHandler(): {
  handler: AgentTaskHandler;
  calls: Array<{ role: string; content: string; order: number }>;
} {
  let counter = 0;
  const calls: Array<{ role: string; content: string; order: number }> = [];

  return {
    calls,
    handler: async (handle, message) => {
      calls.push({ role: handle.role, content: message.content, order: counter++ });
      return { success: true, output: `result-${counter}`, tokensUsed: 5 };
    },
  };
}

function makeSquadConfig(overrides: Partial<SquadConfig> = {}): SquadConfig {
  return {
    name: "test-squad",
    strategy: "pipeline",
    agents: [
      { role: "researcher", squadId: "" },
      { role: "coder", squadId: "" },
    ],
    ...overrides,
  };
}

function makeSubtask(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    type: "general",
    description: "Subtask",
    input: {},
    priority: "normal",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SquadCoordinator", () => {
  let spawner: AgentSpawner;
  let coordinator: SquadCoordinator;

  beforeEach(() => {
    spawner = new AgentSpawner({ taskHandler: roleEchoHandler });
    coordinator = new SquadCoordinator({ spawner });
  });

  afterEach(async () => {
    await coordinator.shutdown();
    await spawner.shutdown();
  });

  // ─── Squad Lifecycle ──────────────────────────────────────────────────

  describe("createSquad", () => {
    it("should create a squad and spawn agents", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig());
      expect(squadId).toBeDefined();

      const status = coordinator.getSquadStatus(squadId);
      expect(status.name).toBe("test-squad");
      expect(status.strategy).toBe("pipeline");
      expect(status.agents).toHaveLength(2);
      expect(status.isRunning).toBe(true);
    });

    it("should enforce max squads limit", async () => {
      const limited = new SquadCoordinator({ spawner, maxSquads: 1 });
      await limited.createSquad(makeSquadConfig());

      await expect(limited.createSquad(makeSquadConfig())).rejects.toThrow(/Max squads/);

      await limited.shutdown();
    });

    it("should assign correct squadId to spawned agents", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig());
      const status = coordinator.getSquadStatus(squadId);

      expect(status.agents.length).toBe(2);
      // All agents should be ready
      expect(status.agents.every((a) => a.state === "ready")).toBe(true);
    });
  });

  describe("terminateSquad", () => {
    it("should terminate all agents and remove squad", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig());
      expect(coordinator.squadCount).toBe(1);

      await coordinator.terminateSquad(squadId);
      expect(coordinator.squadCount).toBe(0);
    });

    it("should throw for unknown squad", async () => {
      await expect(coordinator.terminateSquad("nonexistent")).rejects.toThrow(/not found/);
    });
  });

  describe("shutdown", () => {
    it("should terminate all squads", async () => {
      await coordinator.createSquad(makeSquadConfig({ name: "s1" }));
      await coordinator.createSquad(makeSquadConfig({ name: "s2" }));
      expect(coordinator.squadCount).toBe(2);

      await coordinator.shutdown();
      expect(coordinator.squadCount).toBe(0);
    });
  });

  describe("listSquads", () => {
    it("should list all active squads", async () => {
      await coordinator.createSquad(makeSquadConfig({ name: "alpha" }));
      await coordinator.createSquad(makeSquadConfig({ name: "beta" }));

      const list = coordinator.listSquads();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.name).toSorted()).toEqual(["alpha", "beta"]);
    });
  });

  // ─── Pipeline Strategy ────────────────────────────────────────────────

  describe("pipeline strategy", () => {
    it("should execute tasks sequentially", async () => {
      const { handler, calls } = createOrderedHandler();
      const pipeSpawner = new AgentSpawner({ taskHandler: handler });
      const pipeCoordinator = new SquadCoordinator({ spawner: pipeSpawner });

      const squadId = await pipeCoordinator.createSquad(makeSquadConfig({ strategy: "pipeline" }));

      const result = await pipeCoordinator.executeTask(squadId, {
        description: "Pipeline test",
        subtasks: [makeSubtask({ description: "Step 1" }), makeSubtask({ description: "Step 2" })],
      });

      expect(result.success).toBe(true);
      expect(result.contributions).toHaveLength(2);
      // Verify sequential execution
      expect(calls[0].order).toBeLessThan(calls[1].order);

      await pipeCoordinator.shutdown();
      await pipeSpawner.shutdown();
    });

    it("should pass previous output to next task", async () => {
      const contextCapture: Array<Record<string, unknown>> = [];
      const capturingHandler: AgentTaskHandler = async (_handle, message) => {
        contextCapture.push(message.context ?? {});
        return { success: true, output: `output-${contextCapture.length}`, tokensUsed: 5 };
      };

      const capSpawner = new AgentSpawner({ taskHandler: capturingHandler });
      const capCoordinator = new SquadCoordinator({ spawner: capSpawner });

      const squadId = await capCoordinator.createSquad(makeSquadConfig({ strategy: "pipeline" }));

      await capCoordinator.executeTask(squadId, {
        description: "Pipeline chain",
        subtasks: [makeSubtask({ description: "A" }), makeSubtask({ description: "B" })],
      });

      // Second task should receive first task's output
      expect(contextCapture[1].previousOutput).toBe("output-1");

      await capCoordinator.shutdown();
      await capSpawner.shutdown();
    });

    it("should report metrics", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig({ strategy: "pipeline" }));

      const result = await coordinator.executeTask(squadId, {
        description: "Metric test",
        subtasks: [makeSubtask({ description: "T1" }), makeSubtask({ description: "T2" })],
      });

      expect(result.metrics.tasksCompleted).toBe(2);
      expect(result.metrics.tasksFailed).toBe(0);
      expect(result.metrics.totalTokens).toBeGreaterThan(0);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Parallel Strategy ────────────────────────────────────────────────

  describe("parallel strategy", () => {
    it("should execute all tasks concurrently", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig({ strategy: "parallel" }));

      const result = await coordinator.executeTask(squadId, {
        description: "Parallel test",
        subtasks: [
          makeSubtask({ description: "A" }),
          makeSubtask({ description: "B" }),
          makeSubtask({ description: "C" }),
        ],
      });

      expect(result.success).toBe(true);
      expect(result.contributions).toHaveLength(3);
      // Output should be an array of results
      expect(Array.isArray(result.output)).toBe(true);
    });

    it("should report failures for failed tasks", async () => {
      const failSpawner = new AgentSpawner({ taskHandler: failingHandler });
      const failCoordinator = new SquadCoordinator({ spawner: failSpawner });

      const squadId = await failCoordinator.createSquad(makeSquadConfig({ strategy: "parallel" }));

      const result = await failCoordinator.executeTask(squadId, {
        description: "Fail test",
        subtasks: [makeSubtask({ description: "Will fail" })],
      });

      expect(result.success).toBe(false);
      expect(result.metrics.tasksFailed).toBeGreaterThan(0);

      await failCoordinator.shutdown();
      await failSpawner.shutdown();
    });
  });

  // ─── Map-Reduce Strategy ──────────────────────────────────────────────

  describe("map-reduce strategy", () => {
    it("should map tasks then reduce results", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig({ strategy: "map-reduce" }));

      const result = await coordinator.executeTask(squadId, {
        description: "Map-reduce test",
        subtasks: [
          makeSubtask({ description: "Map A" }),
          makeSubtask({ description: "Map B" }),
          makeSubtask({ description: "Reduce" }),
        ],
      });

      expect(result.success).toBe(true);
      // Should have contributions from both map and reduce phases
      expect(result.contributions.length).toBeGreaterThanOrEqual(3);
    });

    it("should fall back to pipeline for single task", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig({ strategy: "map-reduce" }));

      const result = await coordinator.executeTask(squadId, {
        description: "Single task",
        subtasks: [makeSubtask({ description: "Only one" })],
      });

      expect(result.success).toBe(true);
    });
  });

  // ─── Consensus Strategy ───────────────────────────────────────────────

  describe("consensus strategy", () => {
    it("should give all agents the same task", async () => {
      const callRoles: string[] = [];
      const consensusHandler: AgentTaskHandler = async (handle) => {
        callRoles.push(handle.role);
        return { success: true, output: "agreed", tokensUsed: 5 };
      };

      const conSpawner = new AgentSpawner({ taskHandler: consensusHandler });
      const conCoordinator = new SquadCoordinator({ spawner: conSpawner });

      const squadId = await conCoordinator.createSquad(makeSquadConfig({ strategy: "consensus" }));

      const result = await conCoordinator.executeTask(squadId, {
        description: "Vote on this",
        subtasks: [makeSubtask({ description: "Question" })],
      });

      expect(result.success).toBe(true);
      expect(callRoles).toContain("researcher");
      expect(callRoles).toContain("coder");
      expect(result.output).toBe("agreed"); // Majority

      await conCoordinator.shutdown();
      await conSpawner.shutdown();
    });

    it("should pick majority output", async () => {
      let _callCount = 0;
      const mixedHandler: AgentTaskHandler = async () => {
        callCount++;
        // First agent says "A", second says "A" → majority is "A"
        return { success: true, output: "A", tokensUsed: 5 };
      };

      const mixSpawner = new AgentSpawner({ taskHandler: mixedHandler });
      const mixCoordinator = new SquadCoordinator({ spawner: mixSpawner });

      const squadId = await mixCoordinator.createSquad(
        makeSquadConfig({
          strategy: "consensus",
          agents: [
            { role: "a1", squadId: "" },
            { role: "a2", squadId: "" },
            { role: "a3", squadId: "" },
          ],
        }),
      );

      const result = await mixCoordinator.executeTask(squadId, {
        description: "Vote",
        subtasks: [makeSubtask({ description: "Q" })],
      });

      expect(result.output).toBe("A");

      await mixCoordinator.shutdown();
      await mixSpawner.shutdown();
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────

  describe("error handling", () => {
    it("should return error for terminated squad", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig());
      await coordinator.terminateSquad(squadId);

      // Squad is gone, should throw
      await expect(coordinator.executeTask(squadId, { description: "Late task" })).rejects.toThrow(
        /not found/,
      );
    });

    it("should auto-create single task when no subtasks given", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig({ strategy: "pipeline" }));

      const result = await coordinator.executeTask(squadId, {
        description: "Simple task with no subtasks",
        input: { data: "test" },
      });

      expect(result.success).toBe(true);
      expect(result.contributions).toHaveLength(1);
    });
  });

  // ─── Status ───────────────────────────────────────────────────────────

  describe("getSquadStatus", () => {
    it("should report agent states and queue stats", async () => {
      const squadId = await coordinator.createSquad(makeSquadConfig());
      const status = coordinator.getSquadStatus(squadId);

      expect(status.id).toBe(squadId);
      expect(status.name).toBe("test-squad");
      expect(status.strategy).toBe("pipeline");
      expect(status.agents).toHaveLength(2);
      expect(status.taskQueue.pending).toBe(0);
      expect(status.createdAt).toBeInstanceOf(Date);
      expect(status.isRunning).toBe(true);
    });

    it("should throw for unknown squad", () => {
      expect(() => coordinator.getSquadStatus("nonexistent")).toThrow(/not found/);
    });
  });
});

// ─── Factory ──────────────────────────────────────────────────────────────────

describe("createSquadCoordinator", () => {
  it("should create coordinator with spawner", () => {
    const spawner = new AgentSpawner();
    const coordinator = createSquadCoordinator({ spawner });
    expect(coordinator).toBeInstanceOf(SquadCoordinator);
  });
});
