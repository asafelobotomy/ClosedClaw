/**
 * Task Queue - Priority queue with dependencies, claims, and retries
 *
 * Provides task distribution for multi-agent squads:
 * - Priority ordering (high > normal > low)
 * - Atomic task claims (no double-assignment)
 * - Task dependencies (B waits for A)
 * - Retry with exponential backoff
 * - Capability-based matching
 * - Timeout enforcement
 *
 * @module agents/squad/task-queue
 */

import { AGENTS } from "../../constants/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Task priority levels. Higher priority tasks are claimed first.
 */
export type TaskPriority = "high" | "normal" | "low";

/** Numeric weights for priority ordering (higher = more urgent) */
const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Task lifecycle states.
 *
 * ```
 * PENDING → CLAIMED → COMPLETED
 *              ↓
 *           FAILED → (retry) → PENDING
 *              ↓
 *           CANCELLED
 * ```
 */
export type TaskStatus = "pending" | "claimed" | "completed" | "failed" | "cancelled";

/**
 * Task definition for squad work distribution.
 */
export interface Task {
  /** Unique task identifier */
  id: string;

  /** Task type (used for role-based routing) */
  type: string;

  /** Human-readable description */
  description: string;

  /** Task input data */
  input: unknown;

  /** Priority level */
  priority: TaskPriority;

  /** Required capabilities for the claiming agent */
  requiredCapabilities?: string[];

  /** Task IDs that must complete before this task can be claimed */
  dependsOn?: string[];

  /** Max execution time in ms (default: from COORDINATION.QUEUE constants) */
  timeout?: number;

  /** Max retry attempts (default: from COORDINATION.QUEUE constants) */
  retries?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a task (id is auto-generated if omitted).
 */
export type TaskInput = Omit<Task, "id"> & { id?: string };

/**
 * Internal task record with tracking metadata.
 */
interface TaskRecord {
  task: Task;
  status: TaskStatus;
  claimedBy?: string;
  claimedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Summary of task state for external queries.
 */
export interface TaskInfo {
  id: string;
  type: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  claimedBy?: string;
  claimedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  attempts: number;
  createdAt: Date;
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  /** Total tasks ever enqueued */
  totalEnqueued: number;
  /** Currently pending */
  pending: number;
  /** Currently claimed (in-progress) */
  claimed: number;
  /** Completed successfully */
  completed: number;
  /** Failed (exhausted retries) */
  failed: number;
  /** Cancelled */
  cancelled: number;
}

/**
 * Configuration for the task queue.
 */
export interface TaskQueueConfig {
  /** Max tasks in queue (default: COORDINATION.QUEUE.MAX_SIZE) */
  maxSize?: number;

  /** Default claim timeout in ms (default: COORDINATION.QUEUE.CLAIM_TIMEOUT_MS) */
  claimTimeout?: number;

  /** Default max execution time in ms (default: COORDINATION.QUEUE.MAX_EXECUTION_MS) */
  maxExecutionTime?: number;

  /** Default retry base backoff in ms (default: COORDINATION.QUEUE.RETRY_BASE_MS) */
  retryBaseMs?: number;

  /** Default max retry backoff in ms (default: COORDINATION.QUEUE.RETRY_MAX_MS) */
  retryMaxMs?: number;

  /** Default max retries (default: COORDINATION.QUEUE.MAX_RETRIES) */
  maxRetries?: number;
}

// ─── TaskQueue ──────────────────────────────────────────────────────────────

/**
 * Priority task queue for multi-agent work distribution.
 *
 * Tasks are dequeued in priority order (high > normal > low), with FIFO
 * within the same priority level. Supports dependencies, capability matching,
 * atomic claims, and automatic retries.
 *
 * @example
 * ```typescript
 * const queue = new TaskQueue();
 *
 * // Enqueue tasks
 * const id = queue.enqueue({
 *   type: "research",
 *   description: "Find TypeScript patterns",
 *   input: { topic: "decorators" },
 *   priority: "high",
 *   requiredCapabilities: ["web_search"],
 * });
 *
 * // Agent claims a task it can handle
 * const task = queue.claim("agent-1", ["web_search", "reading"]);
 * if (task) {
 *   // Do work...
 *   queue.complete(task.id, { findings: [...] });
 * }
 * ```
 */
export class TaskQueue {
  private readonly records: Map<string, TaskRecord> = new Map();
  private readonly config: Required<TaskQueueConfig>;
  private totalEnqueued = 0;

  constructor(config: TaskQueueConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? AGENTS.COORDINATION.QUEUE.MAX_SIZE,
      claimTimeout: config.claimTimeout ?? AGENTS.COORDINATION.QUEUE.CLAIM_TIMEOUT_MS,
      maxExecutionTime: config.maxExecutionTime ?? AGENTS.COORDINATION.QUEUE.MAX_EXECUTION_MS,
      retryBaseMs: config.retryBaseMs ?? AGENTS.COORDINATION.QUEUE.RETRY_BASE_MS,
      retryMaxMs: config.retryMaxMs ?? AGENTS.COORDINATION.QUEUE.RETRY_MAX_MS,
      maxRetries: config.maxRetries ?? AGENTS.COORDINATION.QUEUE.MAX_RETRIES,
    };
  }

  /**
   * Add a task to the queue.
   *
   * @returns The task ID
   * @throws {Error} If queue is at max capacity
   * @throws {Error} If a dependency task ID doesn't exist
   */
  enqueue(input: TaskInput): string {
    if (this.records.size >= this.config.maxSize) {
      throw new Error(`Task queue is full (max ${this.config.maxSize} tasks)`);
    }

    const id = input.id ?? crypto.randomUUID();
    if (this.records.has(id)) {
      throw new Error(`Task ${id} already exists`);
    }

    // Validate dependencies exist
    if (input.dependsOn) {
      for (const depId of input.dependsOn) {
        if (!this.records.has(depId)) {
          throw new Error(`Dependency task ${depId} not found`);
        }
      }
    }

    const task: Task = {
      ...input,
      id,
      retries: input.retries ?? this.config.maxRetries,
      timeout: input.timeout ?? this.config.maxExecutionTime,
    };

    const now = new Date();
    this.records.set(id, {
      task,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    this.totalEnqueued++;
    return id;
  }

  /**
   * Claim the highest-priority available task.
   *
   * A task is available if:
   * 1. Status is "pending"
   * 2. All dependencies are "completed"
   * 3. Agent has all required capabilities (if specified)
   *
   * Claims are atomic — only one agent can claim a task.
   *
   * @param agentId - The claiming agent
   * @param capabilities - Agent's capabilities for matching
   * @returns The claimed task, or null if none available
   */
  claim(agentId: string, capabilities?: string[]): Task | null {
    const candidates = this.getClaimable(capabilities);

    if (candidates.length === 0) return null;

    // Sort by priority (high first), then by creation time (oldest first)
    candidates.sort((a, b) => {
      const pw = PRIORITY_WEIGHT[b.task.priority] - PRIORITY_WEIGHT[a.task.priority];
      if (pw !== 0) return pw;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const record = candidates[0];
    record.status = "claimed";
    record.claimedBy = agentId;
    record.claimedAt = new Date();
    record.updatedAt = new Date();
    record.attempts++;

    return record.task;
  }

  /**
   * Mark a task as completed successfully.
   *
   * @param taskId - The task to complete
   * @param result - The task result
   * @throws {Error} If task not found or not in "claimed" state
   */
  complete(taskId: string, result?: unknown): void {
    const record = this.getRecord(taskId);

    if (record.status !== "claimed") {
      throw new Error(
        `Cannot complete task ${taskId}: status is "${record.status}" (expected "claimed")`,
      );
    }

    record.status = "completed";
    record.result = result;
    record.completedAt = new Date();
    record.updatedAt = new Date();
  }

  /**
   * Mark a task as failed.
   *
   * If retries remain, the task is re-queued as "pending".
   * Otherwise, it stays in "failed" state.
   *
   * @param taskId - The task that failed
   * @param error - Error description
   * @returns Whether the task was re-queued for retry
   * @throws {Error} If task not found or not in "claimed" state
   */
  fail(taskId: string, error: string): boolean {
    const record = this.getRecord(taskId);

    if (record.status !== "claimed") {
      throw new Error(
        `Cannot fail task ${taskId}: status is "${record.status}" (expected "claimed")`,
      );
    }

    record.error = error;
    record.updatedAt = new Date();

    const maxRetries = record.task.retries ?? this.config.maxRetries;
    if (record.attempts < maxRetries) {
      // Re-queue for retry
      record.status = "pending";
      record.claimedBy = undefined;
      record.claimedAt = undefined;
      return true;
    }

    // Exhausted retries
    record.status = "failed";
    return false;
  }

  /**
   * Cancel a task. Can cancel pending or claimed tasks.
   *
   * @param taskId - The task to cancel
   * @throws {Error} If task not found or already completed/failed/cancelled
   */
  cancel(taskId: string): void {
    const record = this.getRecord(taskId);

    if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") {
      throw new Error(
        `Cannot cancel task ${taskId}: already "${record.status}"`,
      );
    }

    record.status = "cancelled";
    record.updatedAt = new Date();
  }

  /**
   * Get detailed info about a task.
   *
   * @throws {Error} If task not found
   */
  getTask(taskId: string): TaskInfo {
    const record = this.getRecord(taskId);
    return this.toTaskInfo(record);
  }

  /**
   * Get the status of a task.
   *
   * @throws {Error} If task not found
   */
  getStatus(taskId: string): TaskStatus {
    return this.getRecord(taskId).status;
  }

  /**
   * List all tasks matching a status filter.
   */
  listTasks(filter?: { status?: TaskStatus; type?: string; claimedBy?: string }): TaskInfo[] {
    const results: TaskInfo[] = [];

    for (const record of this.records.values()) {
      if (filter?.status && record.status !== filter.status) continue;
      if (filter?.type && record.task.type !== filter.type) continue;
      if (filter?.claimedBy && record.claimedBy !== filter.claimedBy) continue;
      results.push(this.toTaskInfo(record));
    }

    return results;
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    let pending = 0;
    let claimed = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;

    for (const record of this.records.values()) {
      switch (record.status) {
        case "pending": pending++; break;
        case "claimed": claimed++; break;
        case "completed": completed++; break;
        case "failed": failed++; break;
        case "cancelled": cancelled++; break;
      }
    }

    return {
      totalEnqueued: this.totalEnqueued,
      pending,
      claimed,
      completed,
      failed,
      cancelled,
    };
  }

  /**
   * Release a claimed task back to pending (e.g., agent died).
   *
   * @param taskId - The task to release
   * @throws {Error} If task not found or not claimed
   */
  release(taskId: string): void {
    const record = this.getRecord(taskId);

    if (record.status !== "claimed") {
      throw new Error(
        `Cannot release task ${taskId}: status is "${record.status}" (expected "claimed")`,
      );
    }

    record.status = "pending";
    record.claimedBy = undefined;
    record.claimedAt = undefined;
    record.updatedAt = new Date();
  }

  /**
   * Release all tasks claimed by a specific agent.
   * Useful when an agent crashes/terminates.
   *
   * @returns Number of tasks released
   */
  releaseByAgent(agentId: string): number {
    let count = 0;

    for (const record of this.records.values()) {
      if (record.status === "claimed" && record.claimedBy === agentId) {
        record.status = "pending";
        record.claimedBy = undefined;
        record.claimedAt = undefined;
        record.updatedAt = new Date();
        count++;
      }
    }

    return count;
  }

  /**
   * Check for timed-out claims and release them.
   *
   * @returns Number of tasks released due to timeout
   */
  releaseTimedOut(): number {
    const now = Date.now();
    let count = 0;

    for (const record of this.records.values()) {
      if (record.status !== "claimed" || !record.claimedAt) continue;

      const elapsed = now - record.claimedAt.getTime();
      const timeout = record.task.timeout ?? this.config.maxExecutionTime;

      if (elapsed > timeout) {
        record.status = "pending";
        record.claimedBy = undefined;
        record.claimedAt = undefined;
        record.updatedAt = new Date();
        count++;
      }
    }

    return count;
  }

  /**
   * Remove completed, failed, and cancelled tasks from the queue.
   *
   * @returns Number of tasks purged
   */
  purge(): number {
    let count = 0;
    for (const [id, record] of this.records) {
      if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") {
        this.records.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Get the total number of tasks in the queue (all states).
   */
  get size(): number {
    return this.records.size;
  }

  /**
   * Clear all tasks from the queue.
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Calculate retry backoff delay for a given attempt number.
   */
  getRetryDelay(attempt: number): number {
    return Math.min(
      this.config.retryBaseMs * 2 ** attempt,
      this.config.retryMaxMs,
    );
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  /** Get a record or throw if not found. */
  private getRecord(taskId: string): TaskRecord {
    const record = this.records.get(taskId);
    if (!record) {
      throw new Error(`Task ${taskId} not found`);
    }
    return record;
  }

  /** Check if all dependencies of a task are completed. */
  private areDependenciesMet(task: Task): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) return true;

    for (const depId of task.dependsOn) {
      const dep = this.records.get(depId);
      if (!dep || dep.status !== "completed") return false;
    }

    return true;
  }

  /** Check if agent capabilities satisfy task requirements. */
  private hasCapabilities(task: Task, capabilities?: string[]): boolean {
    if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) return true;
    if (!capabilities) return false;

    return task.requiredCapabilities.every((req) => capabilities.includes(req));
  }

  /** Get all tasks that can be claimed right now. */
  private getClaimable(capabilities?: string[]): TaskRecord[] {
    const results: TaskRecord[] = [];

    for (const record of this.records.values()) {
      if (record.status !== "pending") continue;
      if (!this.areDependenciesMet(record.task)) continue;
      if (!this.hasCapabilities(record.task, capabilities)) continue;
      results.push(record);
    }

    return results;
  }

  /** Convert internal record to external TaskInfo. */
  private toTaskInfo(record: TaskRecord): TaskInfo {
    return {
      id: record.task.id,
      type: record.task.type,
      description: record.task.description,
      priority: record.task.priority,
      status: record.status,
      claimedBy: record.claimedBy,
      claimedAt: record.claimedAt,
      completedAt: record.completedAt,
      result: record.result,
      error: record.error,
      attempts: record.attempts,
      createdAt: record.createdAt,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a TaskQueue with the given configuration.
 */
export function createTaskQueue(config?: TaskQueueConfig): TaskQueue {
  return new TaskQueue(config);
}
