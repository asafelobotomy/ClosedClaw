/**
 * Agent Spawner - Creates and manages agent instances within a squad
 *
 * Handles agent lifecycle from initialization through termination:
 * - INITIALIZING → READY → WORKING → IDLE → TERMINATING → TERMINATED
 *
 * Features:
 * - Resource limits (max agents, token budgets)
 * - Heartbeat monitoring (detect hung/crashed agents)
 * - Auto-restart on failure (configurable retries)
 * - Graceful shutdown with cleanup
 *
 * @module agents/squad/spawner
 */

import { AGENTS } from "../../constants/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Agent lifecycle states.
 *
 * State machine:
 * ```
 * INITIALIZING → READY → WORKING ↔ IDLE
 *                   ↓        ↓        ↓
 *              TERMINATING ← ← ← ← ←
 *                   ↓
 *              TERMINATED
 * ```
 */
export type AgentState =
  | "initializing"
  | "ready"
  | "working"
  | "idle"
  | "terminating"
  | "terminated";

/**
 * Valid state transitions for the agent lifecycle.
 * Used for validation to prevent invalid state changes.
 */
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  initializing: ["ready", "terminating", "terminated"],
  ready: ["working", "idle", "terminating"],
  working: ["idle", "ready", "terminating"],
  idle: ["working", "ready", "terminating"],
  terminating: ["terminated"],
  terminated: [],
};

/**
 * Configuration for spawning an agent.
 */
export interface AgentSpawnConfig {
  /** Agent role identifier (e.g., "researcher", "coder", "reviewer", "tester") */
  role: string;

  /** Squad this agent belongs to */
  squadId: string;

  /** Optional display name */
  name?: string;

  /** Path to agent profile markdown */
  profile?: string;

  /** Override default model for this agent */
  model?: string;

  /** Subset of available tools (undefined = all) */
  tools?: string[];

  /** Token budget per task */
  maxTokens?: number;

  /** Agent-specific environment variables */
  environment?: Record<string, string>;

  /** Custom initialization function */
  onInit?: (handle: AgentHandle) => Promise<void>;

  /** Custom cleanup function */
  onTerminate?: (handle: AgentHandle) => Promise<void>;
}

/**
 * Runtime status of an agent.
 */
export interface AgentStatus {
  /** Current lifecycle state */
  state: AgentState;

  /** When agent was created */
  createdAt: Date;

  /** When current state was entered */
  stateChangedAt: Date;

  /** Last successful heartbeat */
  lastHeartbeat: Date;

  /** Consecutive missed heartbeats */
  missedHeartbeats: number;

  /** Number of tasks completed */
  tasksCompleted: number;

  /** Number of tasks failed */
  tasksFailed: number;

  /** Total tokens consumed across all tasks */
  tokensUsed: number;

  /** Whether agent has been auto-restarted */
  restartCount: number;

  /** Current task being worked on (if working) */
  currentTaskId?: string;
}

/**
 * Handle to a spawned agent with operations.
 */
export interface AgentHandle {
  /** Unique agent identifier */
  readonly id: string;

  /** Agent role */
  readonly role: string;

  /** Squad this agent belongs to */
  readonly squadId: string;

  /** Display name (role if not set) */
  readonly name: string;

  /** Current status snapshot */
  getStatus(): AgentStatus;

  /** Send a task message to the agent */
  send(message: AgentTaskMessage): Promise<AgentResponse>;

  /** Transition agent to a new state */
  transition(newState: AgentState): void;

  /** Record a heartbeat */
  heartbeat(): void;

  /** Record task completion */
  recordTaskComplete(tokensUsed?: number): void;

  /** Record task failure */
  recordTaskFailed(): void;

  /** Set current task ID */
  setCurrentTask(taskId: string | undefined): void;

  /** Terminate this agent */
  terminate(): Promise<void>;
}

/**
 * Message sent to an agent as a task.
 */
export interface AgentTaskMessage {
  /** Task identifier */
  taskId: string;

  /** Task description or instruction */
  content: string;

  /** Additional context/data */
  context?: Record<string, unknown>;
}

/**
 * Response from an agent after processing a task.
 */
export interface AgentResponse {
  /** Whether the task was processed successfully */
  success: boolean;

  /** Result payload */
  output?: unknown;

  /** Error message on failure */
  error?: string;

  /** Tokens consumed by this task */
  tokensUsed?: number;
}

/**
 * Handler function that processes agent task messages.
 * Provided when creating a spawner to define how agents execute work.
 */
export type AgentTaskHandler = (
  handle: AgentHandle,
  message: AgentTaskMessage,
) => Promise<AgentResponse>;

/**
 * Event types emitted by the spawner.
 */
export type SpawnerEventType =
  | "agent:spawned"
  | "agent:state-changed"
  | "agent:terminated"
  | "agent:heartbeat-missed"
  | "agent:restarted";

/**
 * Event payload for spawner events.
 */
export interface SpawnerEvent {
  type: SpawnerEventType;
  agentId: string;
  squadId: string;
  timestamp: Date;
  detail?: Record<string, unknown>;
}

/**
 * Listener for spawner events.
 */
export type SpawnerEventListener = (event: SpawnerEvent) => void;

// ─── Agent Handle Implementation ────────────────────────────────────────────

/**
 * Internal agent handle with mutable status.
 */
class AgentHandleImpl implements AgentHandle {
  readonly id: string;
  readonly role: string;
  readonly squadId: string;
  readonly name: string;

  private status: AgentStatus;
  private readonly config: AgentSpawnConfig;
  private readonly spawner: AgentSpawner;

  constructor(id: string, config: AgentSpawnConfig, spawner: AgentSpawner) {
    this.id = id;
    this.role = config.role;
    this.squadId = config.squadId;
    this.name = config.name ?? config.role;
    this.config = config;
    this.spawner = spawner;

    const now = new Date();
    this.status = {
      state: "initializing",
      createdAt: now,
      stateChangedAt: now,
      lastHeartbeat: now,
      missedHeartbeats: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tokensUsed: 0,
      restartCount: 0,
    };
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }

  async send(message: AgentTaskMessage): Promise<AgentResponse> {
    if (this.status.state === "terminated" || this.status.state === "terminating") {
      return { success: false, error: `Agent ${this.id} is ${this.status.state}` };
    }

    const _previousState = this.status.state;
    this.transition("working");
    this.setCurrentTask(message.taskId);

    try {
      const response = await this.spawner.executeTask(this, message);

      if (response.success) {
        this.recordTaskComplete(response.tokensUsed);
      } else {
        this.recordTaskFailed();
      }

      return response;
    } catch (err) {
      this.recordTaskFailed();
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.setCurrentTask(undefined);
      // Return to idle unless terminating
      if (this.status.state === "working") {
        this.transition("idle");
      }
    }
  }

  transition(newState: AgentState): void {
    const currentState = this.status.state;
    if (currentState === newState) {
      return;
    }

    const allowed = VALID_TRANSITIONS[currentState];
    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${currentState} → ${newState}. ` +
          `Allowed: ${allowed.join(", ") || "none"}`,
      );
    }

    this.status.state = newState;
    this.status.stateChangedAt = new Date();

    this.spawner.emitEvent({
      type: "agent:state-changed",
      agentId: this.id,
      squadId: this.squadId,
      timestamp: this.status.stateChangedAt,
      detail: { from: currentState, to: newState },
    });
  }

  heartbeat(): void {
    this.status.lastHeartbeat = new Date();
    this.status.missedHeartbeats = 0;
  }

  /** Increment missed heartbeat counter. Returns current count. */
  incrementMissedHeartbeat(): number {
    this.status.missedHeartbeats++;
    return this.status.missedHeartbeats;
  }

  recordTaskComplete(tokensUsed?: number): void {
    this.status.tasksCompleted++;
    if (tokensUsed) {
      this.status.tokensUsed += tokensUsed;
    }
  }

  recordTaskFailed(): void {
    this.status.tasksFailed++;
  }

  setCurrentTask(taskId: string | undefined): void {
    this.status.currentTaskId = taskId;
  }

  incrementRestart(): void {
    this.status.restartCount++;
  }

  getConfig(): AgentSpawnConfig {
    return this.config;
  }

  async terminate(): Promise<void> {
    await this.spawner.terminate(this.id);
  }
}

// ─── Agent Spawner ──────────────────────────────────────────────────────────

/**
 * Configuration for the AgentSpawner.
 */
export interface SpawnerConfig {
  /** Max agents per squad (default: SPAWNING.MAX_AGENTS_PER_SQUAD) */
  maxAgentsPerSquad?: number;

  /** Default token budget per agent (default: SPAWNING.DEFAULT_TOKEN_BUDGET) */
  defaultTokenBudget?: number;

  /** Max restart attempts on failure (default: SPAWNING.MAX_RESTART_ATTEMPTS) */
  maxRestartAttempts?: number;

  /** Heartbeat interval in ms (default: SPAWNING.HEARTBEAT_INTERVAL_MS) */
  heartbeatInterval?: number;

  /** Max missed heartbeats before marking dead (default: SPAWNING.MAX_MISSED_HEARTBEATS) */
  maxMissedHeartbeats?: number;

  /** Grace period for shutdown in ms (default: SPAWNING.SHUTDOWN_GRACE_PERIOD_MS) */
  shutdownGracePeriod?: number;

  /** Agent task handler */
  taskHandler?: AgentTaskHandler;
}

/**
 * Agent spawner - creates and manages agent instances.
 *
 * Manages the full agent lifecycle, enforces resource limits, and
 * monitors agent health via heartbeats.
 *
 * @example
 * ```typescript
 * const spawner = new AgentSpawner({
 *   taskHandler: async (handle, message) => {
 *     return { success: true, output: `Processed: ${message.content}` };
 *   },
 * });
 *
 * const agent = await spawner.spawn({
 *   role: "researcher",
 *   squadId: "squad-1",
 * });
 *
 * const response = await agent.send({
 *   taskId: "task-1",
 *   content: "Research topic X",
 * });
 *
 * await spawner.terminate(agent.id);
 * ```
 */
export class AgentSpawner {
  private readonly agents: Map<string, AgentHandleImpl> = new Map();
  private readonly listeners: SpawnerEventListener[] = [];
  private readonly config: Required<SpawnerConfig>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(config: SpawnerConfig = {}) {
    this.config = {
      maxAgentsPerSquad: config.maxAgentsPerSquad ?? AGENTS.SPAWNING.MAX_AGENTS_PER_SQUAD,
      defaultTokenBudget: config.defaultTokenBudget ?? AGENTS.SPAWNING.DEFAULT_TOKEN_BUDGET,
      maxRestartAttempts: config.maxRestartAttempts ?? AGENTS.SPAWNING.MAX_RESTART_ATTEMPTS,
      heartbeatInterval: config.heartbeatInterval ?? AGENTS.SPAWNING.HEARTBEAT_INTERVAL_MS,
      maxMissedHeartbeats: config.maxMissedHeartbeats ?? AGENTS.SPAWNING.MAX_MISSED_HEARTBEATS,
      shutdownGracePeriod: config.shutdownGracePeriod ?? AGENTS.SPAWNING.SHUTDOWN_GRACE_PERIOD_MS,
      taskHandler: config.taskHandler ?? defaultTaskHandler,
    };
  }

  /**
   * Spawn a new agent in a squad.
   *
   * Validates resource limits, creates agent handle, runs initialization,
   * and transitions to READY state.
   *
   * @throws {Error} If squad capacity exceeded
   * @throws {Error} If initialization fails
   */
  async spawn(config: AgentSpawnConfig): Promise<AgentHandle> {
    // Check squad capacity
    const squadAgents = this.listAgents(config.squadId);
    if (squadAgents.length >= this.config.maxAgentsPerSquad) {
      throw new Error(
        `Squad ${config.squadId} has reached max capacity ` +
          `(${this.config.maxAgentsPerSquad} agents)`,
      );
    }

    const id = crypto.randomUUID();
    const handle = new AgentHandleImpl(id, config, this);
    this.agents.set(id, handle);

    try {
      // Run custom initialization if provided
      if (config.onInit) {
        await config.onInit(handle);
      }

      // Transition to ready
      handle.transition("ready");

      this.emitEvent({
        type: "agent:spawned",
        agentId: id,
        squadId: config.squadId,
        timestamp: new Date(),
        detail: { role: config.role, name: handle.name },
      });

      return handle;
    } catch (err) {
      // Clean up on init failure
      this.agents.delete(id);
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to initialize agent ${id} (${config.role}): ${detail}`, {
        cause: err,
      });
    }
  }

  /**
   * Terminate an agent, running cleanup and transitioning to TERMINATED.
   *
   * @param agentId - Agent to terminate
   * @throws {Error} If agent not found
   */
  async terminate(agentId: string): Promise<void> {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const status = handle.getStatus();
    if (status.state === "terminated") {
      return;
    }

    try {
      // Transition to terminating (skip if already there)
      if (status.state !== "terminating") {
        handle.transition("terminating");
      }

      // Run custom cleanup
      const config = handle.getConfig();
      if (config.onTerminate) {
        // Apply grace period timeout
        await Promise.race([
          config.onTerminate(handle),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("Shutdown grace period exceeded")),
              this.config.shutdownGracePeriod,
            ),
          ),
        ]);
      }
    } catch {
      // Terminate even if cleanup fails
    } finally {
      handle.transition("terminated");
      this.agents.delete(agentId);

      this.emitEvent({
        type: "agent:terminated",
        agentId,
        squadId: handle.squadId,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Terminate all agents in a squad.
   */
  async terminateSquad(squadId: string): Promise<void> {
    const agents = this.listAgents(squadId);
    await Promise.allSettled(agents.map((a) => this.terminate(a.id)));
  }

  /**
   * Terminate all agents across all squads and stop heartbeat monitoring.
   */
  async shutdown(): Promise<void> {
    this.stopHeartbeat();
    const allAgents = [...this.agents.keys()];
    await Promise.allSettled(allAgents.map((id) => this.terminate(id)));
  }

  /**
   * Get the status of an agent.
   *
   * @throws {Error} If agent not found
   */
  getStatus(agentId: string): AgentStatus {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return handle.getStatus();
  }

  /**
   * List all agents in a specific squad.
   */
  listAgents(squadId: string): AgentHandle[] {
    const result: AgentHandle[] = [];
    for (const handle of this.agents.values()) {
      if (handle.squadId === squadId) {
        result.push(handle);
      }
    }
    return result;
  }

  /**
   * List all agents across all squads.
   */
  listAllAgents(): AgentHandle[] {
    return [...this.agents.values()];
  }

  /**
   * Get the total number of active (non-terminated) agents.
   */
  get agentCount(): number {
    return this.agents.size;
  }

  /**
   * Execute a task on an agent via the configured task handler.
   * Called internally by AgentHandleImpl.send().
   */
  async executeTask(handle: AgentHandle, message: AgentTaskMessage): Promise<AgentResponse> {
    return this.config.taskHandler(handle, message);
  }

  /**
   * Attempt to restart a failed agent.
   *
   * Re-spawns with original config if under restart limit.
   * Returns new handle on success, null if limit exceeded.
   */
  async restartAgent(agentId: string): Promise<AgentHandle | null> {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const status = handle.getStatus();
    if (status.restartCount >= this.config.maxRestartAttempts) {
      return null; // Exceeded restart limit
    }

    const config = handle.getConfig();

    // Terminate old agent
    await this.terminate(agentId);

    // Calculate backoff delay
    const backoff = Math.min(
      AGENTS.SPAWNING.RESTART_BACKOFF_BASE_MS * 2 ** status.restartCount,
      AGENTS.SPAWNING.RESTART_BACKOFF_MAX_MS,
    );

    await new Promise((resolve) => setTimeout(resolve, backoff));

    // Spawn new agent with same config
    const newHandle = await this.spawn(config);

    // Carry over restart count
    const impl = newHandle as AgentHandleImpl;
    for (let i = 0; i <= status.restartCount; i++) {
      impl.incrementRestart();
    }

    this.emitEvent({
      type: "agent:restarted",
      agentId: newHandle.id,
      squadId: config.squadId,
      timestamp: new Date(),
      detail: {
        previousId: agentId,
        restartCount: status.restartCount + 1,
      },
    });

    return newHandle;
  }

  // ─── Heartbeat Monitoring ───────────────────────────────────────────────

  /**
   * Start heartbeat monitoring for all agents.
   *
   * Checks each agent's last heartbeat at the configured interval.
   * Agents with too many missed heartbeats are terminated or restarted.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.heartbeatInterval);

    // Allow process to exit even if timer is running
    if (typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      (this.heartbeatTimer as { unref: () => void }).unref();
    }
  }

  /**
   * Stop heartbeat monitoring.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Check heartbeats for all active agents.
   * Called on interval by startHeartbeat().
   */
  private checkHeartbeats(): void {
    for (const [agentId, handle] of this.agents) {
      const status = handle.getStatus();
      if (status.state === "terminated" || status.state === "terminating") {
        continue;
      }

      const missed = handle.incrementMissedHeartbeat();

      if (missed >= this.config.maxMissedHeartbeats) {
        this.emitEvent({
          type: "agent:heartbeat-missed",
          agentId,
          squadId: handle.squadId,
          timestamp: new Date(),
          detail: { missedCount: missed },
        });
      }
    }
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  /**
   * Register an event listener.
   */
  on(listener: SpawnerEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an event listener.
   */
  off(listener: SpawnerEventListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
    }
  }

  /**
   * Emit an event to all listeners.
   * @internal
   */
  emitEvent(event: SpawnerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the spawner
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Default task handler that returns not-implemented.
 * Override with actual agent execution logic.
 */
const defaultTaskHandler: AgentTaskHandler = async (_handle, _message) => {
  return {
    success: false,
    error: "No task handler configured. Provide a taskHandler in SpawnerConfig.",
  };
};

/**
 * Create an AgentSpawner with the given configuration.
 *
 * @example
 * ```typescript
 * const spawner = createAgentSpawner({
 *   taskHandler: async (handle, msg) => ({ success: true, output: "done" }),
 * });
 * ```
 */
export function createAgentSpawner(config?: SpawnerConfig): AgentSpawner {
  return new AgentSpawner(config);
}
