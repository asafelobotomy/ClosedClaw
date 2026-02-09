/**
 * Squad Coordinator - Orchestrates multi-agent workflows
 *
 * Manages squad lifecycle and executes complex tasks using strategies:
 * - **Pipeline**: Sequential chain (A → B → C)
 * - **Parallel**: Concurrent execution with result aggregation
 * - **Map-Reduce**: Split, parallel process, merge
 * - **Consensus**: Multiple agents vote on best solution
 *
 * @module agents/squad/coordinator
 */

import { AGENTS } from "../../constants/index.js";
import type { AgentHandle, AgentSpawnConfig, AgentSpawner, AgentResponse } from "./spawner.js";
import { TaskQueue, type Task, type TaskInput, type TaskPriority } from "./task-queue.js";
import { AgentIPC, type AgentMessage } from "./ipc.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Coordination strategy type.
 */
export type CoordinationStrategy = "pipeline" | "parallel" | "map-reduce" | "consensus";

/**
 * Configuration for creating a squad.
 */
export interface SquadConfig {
  /** Squad name */
  name: string;

  /** Coordination strategy */
  strategy: CoordinationStrategy;

  /** Agents to spawn in this squad */
  agents: AgentSpawnConfig[];

  /** Max squad lifetime in ms (default: COORDINATION.SQUAD.MAX_LIFETIME_MS) */
  maxDuration?: number;

  /** Max inactivity before auto-terminate (default: COORDINATION.SQUAD.INACTIVITY_TIMEOUT_MS) */
  inactivityTimeout?: number;
}

/**
 * A complex task that the squad works on.
 */
export interface ComplexTask {
  /** Task description */
  description: string;

  /** Pre-decomposed subtasks (optional — coordinator decomposes if absent) */
  subtasks?: TaskInput[];

  /** How to evaluate completion */
  successCriteria?: string;

  /** Overall priority */
  priority?: TaskPriority;

  /** Custom input data */
  input?: unknown;
}

/**
 * Individual agent contribution to the squad result.
 */
export interface AgentContribution {
  agentId: string;
  role: string;
  taskId: string;
  output: unknown;
  tokensUsed: number;
  durationMs: number;
}

/**
 * Result from a squad task execution.
 */
export interface SquadResult {
  /** Whether the overall task succeeded */
  success: boolean;

  /** Aggregated output */
  output: unknown;

  /** Individual agent contributions */
  contributions: AgentContribution[];

  /** Execution metrics */
  metrics: {
    durationMs: number;
    tasksCompleted: number;
    tasksFailed: number;
    totalTokens: number;
  };

  /** Error description on failure */
  error?: string;
}

/**
 * Live squad status.
 */
export interface SquadStatus {
  id: string;
  name: string;
  strategy: CoordinationStrategy;
  agents: Array<{ id: string; role: string; state: string }>;
  taskQueue: {
    pending: number;
    claimed: number;
    completed: number;
    failed: number;
  };
  createdAt: Date;
  isRunning: boolean;
}

/**
 * Internal squad instance.
 */
interface Squad {
  id: string;
  config: SquadConfig;
  agents: AgentHandle[];
  taskQueue: TaskQueue;
  ipc: AgentIPC;
  createdAt: Date;
  isRunning: boolean;
  lifetimeTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Configuration for the coordinator.
 */
export interface CoordinatorConfig {
  /** The agent spawner to use for creating agents */
  spawner: AgentSpawner;

  /** Max concurrent squads (default: COORDINATION.SQUAD.MAX_SQUADS) */
  maxSquads?: number;
}

// ─── Strategy Implementations ─────────────────────────────────────────────────

/**
 * Execute tasks in pipeline (sequential) order.
 *
 * Each agent gets the output of the previous agent as input.
 * Agent order follows the order they were spawned.
 */
async function executePipeline(
  squad: Squad,
  tasks: TaskInput[],
  spawner: AgentSpawner,
): Promise<SquadResult> {
  const startTime = Date.now();
  const contributions: AgentContribution[] = [];
  let lastOutput: unknown = undefined;
  let totalTokens = 0;
  let tasksCompleted = 0;
  let tasksFailed = 0;

  for (const taskInput of tasks) {
    const taskId = squad.taskQueue.enqueue(taskInput);
    const task = squad.taskQueue.claim("coordinator");

    if (!task) {
      tasksFailed++;
      continue;
    }

    // Find an agent that matches the task type (by role)
    const agent = findAgentForTask(squad.agents, task);

    if (!agent) {
      squad.taskQueue.fail(taskId, "No capable agent found");
      tasksFailed++;
      continue;
    }

    const taskStart = Date.now();
    const response = await agent.send({
      taskId,
      content: task.description,
      context: {
        input: task.input,
        previousOutput: lastOutput,
      },
    });

    const durationMs = Date.now() - taskStart;

    if (response.success) {
      squad.taskQueue.complete(taskId, response.output);
      lastOutput = response.output;
      tasksCompleted++;
    } else {
      squad.taskQueue.fail(taskId, response.error ?? "Unknown failure");
      tasksFailed++;
    }

    totalTokens += response.tokensUsed ?? 0;

    contributions.push({
      agentId: agent.id,
      role: agent.role,
      taskId,
      output: response.output,
      tokensUsed: response.tokensUsed ?? 0,
      durationMs,
    });
  }

  return {
    success: tasksFailed === 0,
    output: lastOutput,
    contributions,
    metrics: {
      durationMs: Date.now() - startTime,
      tasksCompleted,
      tasksFailed,
      totalTokens,
    },
  };
}

/**
 * Execute all tasks in parallel across available agents.
 */
async function executeParallel(
  squad: Squad,
  tasks: TaskInput[],
  spawner: AgentSpawner,
): Promise<SquadResult> {
  const startTime = Date.now();
  const contributions: AgentContribution[] = [];
  let totalTokens = 0;
  let tasksCompleted = 0;
  let tasksFailed = 0;

  // Enqueue all tasks
  const taskIds = tasks.map((t) => squad.taskQueue.enqueue(t));

  // Assign tasks to agents round-robin
  const assignments: Array<{ agent: AgentHandle; taskId: string; task: Task }> = [];

  for (const taskId of taskIds) {
    const task = squad.taskQueue.claim("coordinator");
    if (!task) continue;

    const agent = findAgentForTask(squad.agents, task) ?? squad.agents[assignments.length % squad.agents.length];

    if (agent) {
      assignments.push({ agent, taskId, task });
    }
  }

  // Execute in parallel
  const results = await Promise.allSettled(
    assignments.map(async ({ agent, taskId, task }) => {
      const taskStart = Date.now();
      const response = await agent.send({
        taskId,
        content: task.description,
        context: { input: task.input },
      });

      const durationMs = Date.now() - taskStart;

      if (response.success) {
        squad.taskQueue.complete(taskId, response.output);
        tasksCompleted++;
      } else {
        squad.taskQueue.fail(taskId, response.error ?? "Unknown failure");
        tasksFailed++;
      }

      totalTokens += response.tokensUsed ?? 0;

      contributions.push({
        agentId: agent.id,
        role: agent.role,
        taskId,
        output: response.output,
        tokensUsed: response.tokensUsed ?? 0,
        durationMs,
      });

      return response;
    }),
  );

  const outputs = results
    .filter((r): r is PromiseFulfilledResult<AgentResponse> => r.status === "fulfilled")
    .map((r) => r.value.output);

  return {
    success: tasksFailed === 0,
    output: outputs,
    contributions,
    metrics: {
      durationMs: Date.now() - startTime,
      tasksCompleted,
      tasksFailed,
      totalTokens,
    },
  };
}

/**
 * Map-reduce: distribute work, collect results, apply reducer.
 *
 * The first task is treated as the "reduce" task, remaining as "map" tasks.
 * Map tasks run in parallel, then reduce aggregates the results.
 */
async function executeMapReduce(
  squad: Squad,
  tasks: TaskInput[],
  spawner: AgentSpawner,
): Promise<SquadResult> {
  if (tasks.length < 2) {
    return executePipeline(squad, tasks, spawner);
  }

  const startTime = Date.now();
  const contributions: AgentContribution[] = [];
  let totalTokens = 0;

  // Map phase: run all tasks except last in parallel
  const mapTasks = tasks.slice(0, -1);
  const reduceTask = tasks[tasks.length - 1];

  const mapResult = await executeParallel(squad, mapTasks, spawner);
  contributions.push(...mapResult.contributions);
  totalTokens += mapResult.metrics.totalTokens;

  // Reduce phase: pass map outputs as input to reduce task
  const reduceInput: TaskInput = {
    ...reduceTask,
    input: { mapResults: mapResult.output, originalInput: reduceTask.input },
  };

  const reduceResult = await executePipeline(squad, [reduceInput], spawner);
  contributions.push(...reduceResult.contributions);
  totalTokens += reduceResult.metrics.totalTokens;

  return {
    success: mapResult.success && reduceResult.success,
    output: reduceResult.output,
    contributions,
    metrics: {
      durationMs: Date.now() - startTime,
      tasksCompleted: mapResult.metrics.tasksCompleted + reduceResult.metrics.tasksCompleted,
      tasksFailed: mapResult.metrics.tasksFailed + reduceResult.metrics.tasksFailed,
      totalTokens,
    },
  };
}

/**
 * Consensus: all agents work on the same task, then majority vote.
 *
 * Each agent produces a result; the most common output wins.
 * Uses JSON serialization for comparison.
 */
async function executeConsensus(
  squad: Squad,
  tasks: TaskInput[],
  spawner: AgentSpawner,
): Promise<SquadResult> {
  const startTime = Date.now();
  const contributions: AgentContribution[] = [];
  let totalTokens = 0;
  let tasksCompleted = 0;
  let tasksFailed = 0;

  // For consensus, give the same task to every agent
  const primaryTask = tasks[0];
  if (!primaryTask) {
    return {
      success: false,
      output: null,
      contributions: [],
      metrics: { durationMs: 0, tasksCompleted: 0, tasksFailed: 0, totalTokens: 0 },
      error: "No tasks provided",
    };
  }

  const agentResults: Array<{ agent: AgentHandle; response: AgentResponse }> = [];

  const results = await Promise.allSettled(
    squad.agents.map(async (agent) => {
      const taskId = squad.taskQueue.enqueue({
        ...primaryTask,
        id: `${primaryTask.id ?? "consensus"}-${agent.id}`,
      });
      squad.taskQueue.claim("coordinator");

      const taskStart = Date.now();
      const response = await agent.send({
        taskId,
        content: primaryTask.description,
        context: { input: primaryTask.input },
      });

      const durationMs = Date.now() - taskStart;
      totalTokens += response.tokensUsed ?? 0;

      if (response.success) {
        squad.taskQueue.complete(taskId, response.output);
        tasksCompleted++;
      } else {
        squad.taskQueue.fail(taskId, response.error ?? "Failure");
        tasksFailed++;
      }

      agentResults.push({ agent, response });

      contributions.push({
        agentId: agent.id,
        role: agent.role,
        taskId,
        output: response.output,
        tokensUsed: response.tokensUsed ?? 0,
        durationMs,
      });

      return response;
    }),
  );

  // Majority vote on successful outputs
  const successfulOutputs = agentResults
    .filter((r) => r.response.success)
    .map((r) => r.response.output);

  const consensusOutput = findMajority(successfulOutputs);

  return {
    success: tasksCompleted > tasksFailed,
    output: consensusOutput,
    contributions,
    metrics: {
      durationMs: Date.now() - startTime,
      tasksCompleted,
      tasksFailed,
      totalTokens,
    },
  };
}

// ─── SquadCoordinator ─────────────────────────────────────────────────────────

/**
 * Squad Coordinator - creates squads and orchestrates multi-agent workflows.
 *
 * @example
 * ```typescript
 * const coordinator = new SquadCoordinator({ spawner });
 *
 * const squad = await coordinator.createSquad({
 *   name: "research-team",
 *   strategy: "pipeline",
 *   agents: [
 *     { role: "researcher", squadId: "" },
 *     { role: "coder", squadId: "" },
 *   ],
 * });
 *
 * const result = await coordinator.executeTask(squad.id, {
 *   description: "Build a REST API",
 *   subtasks: [
 *     { type: "research", description: "Research best practices", input: {}, priority: "normal" },
 *     { type: "code", description: "Implement API", input: {}, priority: "normal" },
 *   ],
 * });
 * ```
 */
export class SquadCoordinator {
  private readonly squads: Map<string, Squad> = new Map();
  private readonly spawner: AgentSpawner;
  private readonly maxSquads: number;

  constructor(config: CoordinatorConfig) {
    this.spawner = config.spawner;
    this.maxSquads = config.maxSquads ?? AGENTS.COORDINATION.SQUAD.MAX_SQUADS;
  }

  /**
   * Create a new squad with the specified agents and strategy.
   *
   * @returns The squad ID
   * @throws {Error} If max squads reached
   */
  async createSquad(config: SquadConfig): Promise<string> {
    if (this.squads.size >= this.maxSquads) {
      throw new Error(`Max squads reached (${this.maxSquads})`);
    }

    const squadId = crypto.randomUUID();
    const ipc = new AgentIPC();
    const taskQueue = new TaskQueue();

    // Spawn all agents
    const agents: AgentHandle[] = [];
    for (const agentConfig of config.agents) {
      const handle = await this.spawner.spawn({
        ...agentConfig,
        squadId,
      });
      ipc.register(handle.id);
      agents.push(handle);
    }

    const squad: Squad = {
      id: squadId,
      config,
      agents,
      taskQueue,
      ipc,
      createdAt: new Date(),
      isRunning: true,
    };

    // Set up lifetime timer if configured
    const maxDuration = config.maxDuration ?? AGENTS.COORDINATION.SQUAD.MAX_LIFETIME_MS;
    if (maxDuration > 0 && maxDuration < Number.POSITIVE_INFINITY) {
      squad.lifetimeTimer = setTimeout(() => {
        this.terminateSquad(squadId).catch(() => {});
      }, maxDuration);

      if (typeof squad.lifetimeTimer === "object" && "unref" in squad.lifetimeTimer) {
        (squad.lifetimeTimer as { unref: () => void }).unref();
      }
    }

    this.squads.set(squadId, squad);
    return squadId;
  }

  /**
   * Execute a complex task on a squad.
   *
   * Uses the squad's configured strategy to distribute and coordinate work.
   *
   * @throws {Error} If squad not found or not running
   */
  async executeTask(squadId: string, task: ComplexTask): Promise<SquadResult> {
    const squad = this.getSquad(squadId);

    if (!squad.isRunning) {
      return {
        success: false,
        output: null,
        contributions: [],
        metrics: { durationMs: 0, tasksCompleted: 0, tasksFailed: 0, totalTokens: 0 },
        error: `Squad ${squadId} is not running`,
      };
    }

    // Use pre-decomposed subtasks or create a single task
    const tasks: TaskInput[] = task.subtasks ?? [
      {
        type: "general",
        description: task.description,
        input: task.input ?? {},
        priority: task.priority ?? "normal",
      },
    ];

    switch (squad.config.strategy) {
      case "pipeline":
        return executePipeline(squad, tasks, this.spawner);
      case "parallel":
        return executeParallel(squad, tasks, this.spawner);
      case "map-reduce":
        return executeMapReduce(squad, tasks, this.spawner);
      case "consensus":
        return executeConsensus(squad, tasks, this.spawner);
      default:
        return {
          success: false,
          output: null,
          contributions: [],
          metrics: { durationMs: 0, tasksCompleted: 0, tasksFailed: 0, totalTokens: 0 },
          error: `Unknown strategy: ${squad.config.strategy}`,
        };
    }
  }

  /**
   * Get the live status of a squad.
   *
   * @throws {Error} If squad not found
   */
  getSquadStatus(squadId: string): SquadStatus {
    const squad = this.getSquad(squadId);
    const queueStats = squad.taskQueue.getStats();

    return {
      id: squad.id,
      name: squad.config.name,
      strategy: squad.config.strategy,
      agents: squad.agents.map((a) => ({
        id: a.id,
        role: a.role,
        state: a.getStatus().state,
      })),
      taskQueue: {
        pending: queueStats.pending,
        claimed: queueStats.claimed,
        completed: queueStats.completed,
        failed: queueStats.failed,
      },
      createdAt: squad.createdAt,
      isRunning: squad.isRunning,
    };
  }

  /**
   * Terminate a squad and all its agents.
   *
   * @throws {Error} If squad not found
   */
  async terminateSquad(squadId: string): Promise<void> {
    const squad = this.getSquad(squadId);

    squad.isRunning = false;

    // Clear lifetime timer
    if (squad.lifetimeTimer) {
      clearTimeout(squad.lifetimeTimer);
    }

    // Terminate all agents
    await this.spawner.terminateSquad(squadId);

    // Clean up IPC
    for (const agent of squad.agents) {
      if (squad.ipc.isRegistered(agent.id)) {
        squad.ipc.unregister(agent.id);
      }
    }

    this.squads.delete(squadId);
  }

  /**
   * Terminate all squads.
   */
  async shutdown(): Promise<void> {
    const ids = [...this.squads.keys()];
    await Promise.allSettled(ids.map((id) => this.terminateSquad(id)));
  }

  /**
   * List all active squads.
   */
  listSquads(): SquadStatus[] {
    return [...this.squads.keys()].map((id) => this.getSquadStatus(id));
  }

  /**
   * Get the number of active squads.
   */
  get squadCount(): number {
    return this.squads.size;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private getSquad(squadId: string): Squad {
    const squad = this.squads.get(squadId);
    if (!squad) {
      throw new Error(`Squad ${squadId} not found`);
    }
    return squad;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find an agent whose role matches the task type.
 * Falls back to first idle agent if no role match.
 */
function findAgentForTask(agents: AgentHandle[], task: Task): AgentHandle | undefined {
  // Prefer role match
  const roleMatch = agents.find((a) => {
    const status = a.getStatus();
    return a.role === task.type && status.state !== "terminated" && status.state !== "terminating";
  });

  if (roleMatch) return roleMatch;

  // Fall back to first non-terminated agent
  return agents.find((a) => {
    const status = a.getStatus();
    return status.state !== "terminated" && status.state !== "terminating";
  });
}

/**
 * Find the most common value in an array (majority vote).
 * Uses JSON serialization for deep comparison.
 */
function findMajority(values: unknown[]): unknown {
  if (values.length === 0) return null;

  const counts = new Map<string, { value: unknown; count: number }>();

  for (const v of values) {
    const key = JSON.stringify(v);
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { value: v, count: 1 });
    }
  }

  let best: { value: unknown; count: number } = { value: null, count: 0 };
  for (const entry of counts.values()) {
    if (entry.count > best.count) {
      best = entry;
    }
  }

  return best.value;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a SquadCoordinator with the given configuration.
 */
export function createSquadCoordinator(config: CoordinatorConfig): SquadCoordinator {
  return new SquadCoordinator(config);
}
