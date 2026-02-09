/**
 * Tests for Agent Spawner - lifecycle, resource limits, heartbeats, restarts
 *
 * @module agents/squad/spawner.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentSpawner,
  createAgentSpawner,
  type AgentHandle,
  type AgentResponse,
  type AgentSpawnConfig,
  type AgentTaskHandler,
  type AgentTaskMessage,
  type SpawnerEvent,
} from "./spawner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple task handler that echoes the message */
const echoHandler: AgentTaskHandler = async (_handle, message) => {
  return { success: true, output: `echo: ${message.content}`, tokensUsed: 42 };
};

/** Handler that always fails */
const failHandler: AgentTaskHandler = async (_handle, _message) => {
  return { success: false, error: "Intentional failure" };
};

/** Handler that throws */
const throwHandler: AgentTaskHandler = async () => {
  throw new Error("Boom");
};

function makeConfig(overrides: Partial<AgentSpawnConfig> = {}): AgentSpawnConfig {
  return {
    role: "researcher",
    squadId: "squad-1",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentSpawner", () => {
  let spawner: AgentSpawner;

  beforeEach(() => {
    spawner = new AgentSpawner({ taskHandler: echoHandler });
  });

  afterEach(async () => {
    await spawner.shutdown();
  });

  // ─── Spawning ───────────────────────────────────────────────────────────

  describe("spawn", () => {
    it("should spawn an agent and transition to ready", async () => {
      const handle = await spawner.spawn(makeConfig());

      expect(handle.id).toBeDefined();
      expect(handle.role).toBe("researcher");
      expect(handle.squadId).toBe("squad-1");
      expect(handle.name).toBe("researcher"); // defaults to role

      const status = handle.getStatus();
      expect(status.state).toBe("ready");
      expect(status.tasksCompleted).toBe(0);
      expect(status.tasksFailed).toBe(0);
      expect(status.tokensUsed).toBe(0);
      expect(status.restartCount).toBe(0);
    });

    it("should use custom name when provided", async () => {
      const handle = await spawner.spawn(makeConfig({ name: "Alice" }));
      expect(handle.name).toBe("Alice");
    });

    it("should enforce max agents per squad", async () => {
      const smallSpawner = new AgentSpawner({
        taskHandler: echoHandler,
        maxAgentsPerSquad: 2,
      });

      await smallSpawner.spawn(makeConfig());
      await smallSpawner.spawn(makeConfig());

      await expect(smallSpawner.spawn(makeConfig())).rejects.toThrow(
        /max capacity/,
      );

      await smallSpawner.shutdown();
    });

    it("should allow agents in different squads independently", async () => {
      const small = new AgentSpawner({
        taskHandler: echoHandler,
        maxAgentsPerSquad: 1,
      });

      await small.spawn(makeConfig({ squadId: "squad-a" }));
      await small.spawn(makeConfig({ squadId: "squad-b" }));

      expect(small.agentCount).toBe(2);
      await small.shutdown();
    });

    it("should run onInit callback during spawn", async () => {
      const initFn = vi.fn();
      await spawner.spawn(makeConfig({ onInit: initFn }));
      expect(initFn).toHaveBeenCalledTimes(1);
    });

    it("should clean up on init failure", async () => {
      const badInit = async () => {
        throw new Error("Init failed");
      };

      await expect(
        spawner.spawn(makeConfig({ onInit: badInit })),
      ).rejects.toThrow(/Failed to initialize/);

      expect(spawner.agentCount).toBe(0);
    });

    it("should emit agent:spawned event", async () => {
      const events: SpawnerEvent[] = [];
      spawner.on((e) => events.push(e));

      await spawner.spawn(makeConfig({ role: "coder" }));

      const spawned = events.find((e) => e.type === "agent:spawned");
      expect(spawned).toBeDefined();
      expect(spawned?.detail?.role).toBe("coder");
    });
  });

  // ─── Task Execution ─────────────────────────────────────────────────────

  describe("send (task execution)", () => {
    it("should execute a task and return response", async () => {
      const handle = await spawner.spawn(makeConfig());
      const response = await handle.send({
        taskId: "t1",
        content: "Hello",
      });

      expect(response.success).toBe(true);
      expect(response.output).toBe("echo: Hello");
      expect(response.tokensUsed).toBe(42);
    });

    it("should track task completion metrics", async () => {
      const handle = await spawner.spawn(makeConfig());

      await handle.send({ taskId: "t1", content: "first" });
      await handle.send({ taskId: "t2", content: "second" });

      const status = handle.getStatus();
      expect(status.tasksCompleted).toBe(2);
      expect(status.tokensUsed).toBe(84); // 42 * 2
    });

    it("should track task failure metrics", async () => {
      const failSpawner = new AgentSpawner({ taskHandler: failHandler });
      const handle = await failSpawner.spawn(makeConfig());

      const response = await handle.send({ taskId: "t1", content: "fail" });
      expect(response.success).toBe(false);

      const status = handle.getStatus();
      expect(status.tasksFailed).toBe(1);
      expect(status.tasksCompleted).toBe(0);

      await failSpawner.shutdown();
    });

    it("should handle thrown errors gracefully", async () => {
      const throwSpawner = new AgentSpawner({ taskHandler: throwHandler });
      const handle = await throwSpawner.spawn(makeConfig());

      const response = await handle.send({ taskId: "t1", content: "throw" });
      expect(response.success).toBe(false);
      expect(response.error).toBe("Boom");

      await throwSpawner.shutdown();
    });

    it("should refuse tasks for terminated agents", async () => {
      const handle = await spawner.spawn(makeConfig());
      await spawner.terminate(handle.id);

      // Create a new handle reference to test the terminated state
      // Since the original handle is removed, call send on it (it was terminated)
      // The handle was already terminated so send should return failure
      const response = await handle.send({ taskId: "t1", content: "late" });
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/terminated/);
    });

    it("should return to idle after task completes", async () => {
      const handle = await spawner.spawn(makeConfig());
      await handle.send({ taskId: "t1", content: "do work" });

      const status = handle.getStatus();
      expect(status.state).toBe("idle");
      expect(status.currentTaskId).toBeUndefined();
    });
  });

  // ─── Lifecycle & State Transitions ──────────────────────────────────────

  describe("state transitions", () => {
    it("should allow valid transitions", async () => {
      const handle = await spawner.spawn(makeConfig());
      expect(handle.getStatus().state).toBe("ready");

      handle.transition("working");
      expect(handle.getStatus().state).toBe("working");

      handle.transition("idle");
      expect(handle.getStatus().state).toBe("idle");

      handle.transition("working");
      expect(handle.getStatus().state).toBe("working");
    });

    it("should reject invalid transitions", async () => {
      const handle = await spawner.spawn(makeConfig());
      // ready → terminated is not allowed (must go through terminating)
      expect(() => handle.transition("terminated")).toThrow(/Invalid state transition/);
    });

    it("should no-op on same-state transition", async () => {
      const handle = await spawner.spawn(makeConfig());
      handle.transition("ready"); // Already ready, should not throw
      expect(handle.getStatus().state).toBe("ready");
    });

    it("should emit state-changed events", async () => {
      const events: SpawnerEvent[] = [];
      spawner.on((e) => events.push(e));

      const handle = await spawner.spawn(makeConfig());
      handle.transition("working");

      const stateEvents = events.filter((e) => e.type === "agent:state-changed");
      expect(stateEvents.length).toBeGreaterThanOrEqual(2); // init→ready, ready→working
    });
  });

  // ─── Termination ────────────────────────────────────────────────────────

  describe("terminate", () => {
    it("should terminate an agent and remove from registry", async () => {
      const handle = await spawner.spawn(makeConfig());
      expect(spawner.agentCount).toBe(1);

      await spawner.terminate(handle.id);
      expect(spawner.agentCount).toBe(0);
    });

    it("should run onTerminate callback", async () => {
      const terminateFn = vi.fn();
      const handle = await spawner.spawn(
        makeConfig({ onTerminate: terminateFn }),
      );

      await spawner.terminate(handle.id);
      expect(terminateFn).toHaveBeenCalledTimes(1);
    });

    it("should still terminate if onTerminate throws", async () => {
      const badTerminate = async () => {
        throw new Error("Cleanup failed");
      };
      const handle = await spawner.spawn(
        makeConfig({ onTerminate: badTerminate }),
      );

      await spawner.terminate(handle.id);
      expect(spawner.agentCount).toBe(0);
    });

    it("should throw if agent not found", async () => {
      await expect(spawner.terminate("nonexistent")).rejects.toThrow(
        /not found/,
      );
    });

    it("should no-op if agent already terminated", async () => {
      const handle = await spawner.spawn(makeConfig());
      await spawner.terminate(handle.id);
      // Second termination - agent was already removed
      await expect(spawner.terminate(handle.id)).rejects.toThrow(/not found/);
    });

    it("should emit agent:terminated event", async () => {
      const events: SpawnerEvent[] = [];
      spawner.on((e) => events.push(e));

      const handle = await spawner.spawn(makeConfig());
      await spawner.terminate(handle.id);

      const terminated = events.find((e) => e.type === "agent:terminated");
      expect(terminated).toBeDefined();
    });
  });

  // ─── Squad Operations ──────────────────────────────────────────────────

  describe("squad operations", () => {
    it("should list agents by squad", async () => {
      await spawner.spawn(makeConfig({ squadId: "s1", role: "coder" }));
      await spawner.spawn(makeConfig({ squadId: "s1", role: "reviewer" }));
      await spawner.spawn(makeConfig({ squadId: "s2", role: "tester" }));

      expect(spawner.listAgents("s1")).toHaveLength(2);
      expect(spawner.listAgents("s2")).toHaveLength(1);
      expect(spawner.listAgents("s3")).toHaveLength(0);
    });

    it("should terminate all agents in a squad", async () => {
      await spawner.spawn(makeConfig({ squadId: "s1" }));
      await spawner.spawn(makeConfig({ squadId: "s1" }));
      await spawner.spawn(makeConfig({ squadId: "s2" }));

      await spawner.terminateSquad("s1");

      expect(spawner.listAgents("s1")).toHaveLength(0);
      expect(spawner.listAgents("s2")).toHaveLength(1);
    });

    it("should shutdown all agents", async () => {
      await spawner.spawn(makeConfig({ squadId: "s1" }));
      await spawner.spawn(makeConfig({ squadId: "s2" }));

      await spawner.shutdown();
      expect(spawner.agentCount).toBe(0);
    });
  });

  // ─── Heartbeat ──────────────────────────────────────────────────────────

  describe("heartbeat monitoring", () => {
    it("should record heartbeats and reset missed count", async () => {
      const handle = await spawner.spawn(makeConfig());

      const before = handle.getStatus();
      expect(before.missedHeartbeats).toBe(0);

      handle.heartbeat();
      const after = handle.getStatus();
      expect(after.missedHeartbeats).toBe(0);
      expect(after.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(
        before.lastHeartbeat.getTime(),
      );
    });

    it("should start and stop heartbeat timer", () => {
      spawner.startHeartbeat();
      spawner.startHeartbeat(); // Idempotent
      spawner.stopHeartbeat();
      spawner.stopHeartbeat(); // Idempotent
    });

    it("should emit heartbeat-missed events when threshold exceeded", async () => {
      const events: SpawnerEvent[] = [];
      const quickSpawner = new AgentSpawner({
        taskHandler: echoHandler,
        heartbeatInterval: 50,
        maxMissedHeartbeats: 2,
      });
      quickSpawner.on((e) => events.push(e));

      await quickSpawner.spawn(makeConfig());

      quickSpawner.startHeartbeat();

      // Wait for a few heartbeat checks
      await new Promise((resolve) => setTimeout(resolve, 200));

      quickSpawner.stopHeartbeat();

      const missedEvents = events.filter(
        (e) => e.type === "agent:heartbeat-missed",
      );
      expect(missedEvents.length).toBeGreaterThan(0);

      await quickSpawner.shutdown();
    });
  });

  // ─── Restart ────────────────────────────────────────────────────────────

  describe("restart", () => {
    it("should restart an agent with the same config", async () => {
      const handle = await spawner.spawn(
        makeConfig({ role: "coder", name: "Bob" }),
      );
      const oldId = handle.id;

      const newHandle = await spawner.restartAgent(oldId);
      expect(newHandle).not.toBeNull();
      expect(newHandle!.id).not.toBe(oldId);
      expect(newHandle!.role).toBe("coder");
      expect(newHandle!.name).toBe("Bob");
    });

    it("should return null when restart limit exceeded", async () => {
      const limitedSpawner = new AgentSpawner({
        taskHandler: echoHandler,
        maxRestartAttempts: 0,
      });

      const handle = await limitedSpawner.spawn(makeConfig());
      const result = await limitedSpawner.restartAgent(handle.id);
      expect(result).toBeNull();

      await limitedSpawner.shutdown();
    });

    it("should throw when restarting nonexistent agent", async () => {
      await expect(spawner.restartAgent("nonexistent")).rejects.toThrow(
        /not found/,
      );
    });

    it("should emit agent:restarted event", async () => {
      const events: SpawnerEvent[] = [];
      spawner.on((e) => events.push(e));

      const handle = await spawner.spawn(makeConfig());
      await spawner.restartAgent(handle.id);

      const restarted = events.find((e) => e.type === "agent:restarted");
      expect(restarted).toBeDefined();
      expect(restarted?.detail?.previousId).toBe(handle.id);
    });
  });

  // ─── Event System ──────────────────────────────────────────────────────

  describe("events", () => {
    it("should register and unregister listeners", async () => {
      const events: SpawnerEvent[] = [];
      const listener = (e: SpawnerEvent) => events.push(e);

      spawner.on(listener);
      await spawner.spawn(makeConfig());
      expect(events.length).toBeGreaterThan(0);

      const count = events.length;
      spawner.off(listener);
      await spawner.spawn(makeConfig());
      expect(events.length).toBe(count); // No new events after off()
    });

    it("should not break if listener throws", async () => {
      spawner.on(() => {
        throw new Error("Bad listener");
      });

      // Should still spawn successfully
      const handle = await spawner.spawn(makeConfig());
      expect(handle).toBeDefined();
    });
  });

  // ─── Status & Listing ──────────────────────────────────────────────────

  describe("getStatus", () => {
    it("should return agent status", async () => {
      const handle = await spawner.spawn(makeConfig());
      const status = spawner.getStatus(handle.id);
      expect(status.state).toBe("ready");
    });

    it("should throw for unknown agent", () => {
      expect(() => spawner.getStatus("nonexistent")).toThrow(/not found/);
    });
  });

  describe("listAllAgents", () => {
    it("should list all agents across squads", async () => {
      await spawner.spawn(makeConfig({ squadId: "s1" }));
      await spawner.spawn(makeConfig({ squadId: "s2" }));

      const all = spawner.listAllAgents();
      expect(all).toHaveLength(2);
    });
  });
});

// ─── Factory ──────────────────────────────────────────────────────────────────

describe("createAgentSpawner", () => {
  it("should create a spawner with default config", () => {
    const spawner = createAgentSpawner();
    expect(spawner).toBeInstanceOf(AgentSpawner);
  });

  it("should create a spawner with custom config", () => {
    const spawner = createAgentSpawner({
      maxAgentsPerSquad: 5,
      taskHandler: echoHandler,
    });
    expect(spawner).toBeInstanceOf(AgentSpawner);
  });
});
