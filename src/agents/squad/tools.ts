/**
 * Squad-Aware Agent Tools
 *
 * Provides tools that agents within a squad can use to collaborate:
 * - `delegate_to_agent`: Assign a subtask to a specific agent
 * - `squad_memory_read`: Read from shared squad memory
 * - `squad_memory_write`: Write to shared squad memory
 * - `squad_broadcast`: Send a message to all squad members
 * - `squad_status`: Get current squad status and agent states
 * - `wait_for_task`: Block until a specific task completes
 *
 * Tools are access-controlled:
 * - **All agents**: memory read/write, broadcast, status, wait
 * - **Coordinator only**: delegate (spawns or assigns to specific agents)
 *
 * @module agents/squad/tools
 */

import type { AnyAgentTool } from "../tools/common.js";
import type { SquadCoordinator, SquadStatus } from "./coordinator.js";
import type { AgentIPC, AgentMessage } from "./ipc.js";
import type { ShortTermMemory } from "./memory/short-term-memory.js";
import type { WorkingMemory } from "./memory/working-memory.js";
import type { TaskQueue, TaskInput } from "./task-queue.js";
import { jsonResult, readStringParam } from "../tools/common.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Context provided to squad tools at creation time.
 */
export interface SquadToolContext {
  /** The agent ID that owns these tools */
  agentId: string;

  /** The squad ID this agent belongs to */
  squadId: string;

  /** Reference to the coordinator (for delegate/status) */
  coordinator: SquadCoordinator;

  /** Shared short-term memory for the squad */
  sharedMemory: ShortTermMemory;

  /** Agent's working memory */
  workingMemory: WorkingMemory;

  /** IPC for messaging */
  ipc: AgentIPC;

  /** Task queue for task management */
  taskQueue: TaskQueue;

  /** Whether this agent is the coordinator (enables delegate) */
  isCoordinator?: boolean;
}

/**
 * Result from creating squad tools.
 */
export interface SquadToolSet {
  /** All tools created for this agent */
  tools: AnyAgentTool[];

  /** Only the tools names, for logging */
  names: string[];
}

// ─── Tool Factories ────────────────────────────────────────────────────────

/**
 * Create the `delegate_to_agent` tool (coordinator-only).
 *
 * Allows the coordinator to assign a task to a specific agent by role or ID.
 */
export function createDelegateToAgentTool(ctx: SquadToolContext): AnyAgentTool {
  return {
    label: "Delegate Task",
    name: "delegate_to_agent",
    description: [
      "Delegate a subtask to another agent in the squad.",
      "Specify the target agent by role (e.g. 'researcher', 'coder') or by agent ID.",
      "The task is enqueued and assigned to the matching agent.",
      "Returns the task ID for tracking. Use wait_for_task to get the result.",
    ].join(" "),
    parameters: {
      target_role: {
        type: "string",
        description: "Role of the target agent (e.g. 'researcher', 'coder', 'reviewer', 'tester')",
      },
      target_agent_id: {
        type: "string",
        description: "Specific agent ID to delegate to (overrides target_role)",
      },
      task_description: {
        type: "string",
        description: "Description of the task to delegate",
        required: true,
      },
      task_type: {
        type: "string",
        description:
          "Task type for routing (e.g. 'research', 'code', 'review', 'test'). Defaults to 'general'",
      },
      priority: {
        type: "string",
        description: "Task priority: 'high', 'normal', or 'low'. Defaults to 'normal'",
      },
      input_data: {
        type: "string",
        description: "JSON-encoded input data for the task",
      },
    },
    execute: async (_toolCallId, params) => {
      const description = readStringParam(params as Record<string, unknown>, "task_description", {
        required: true,
      });
      const taskType = readStringParam(params as Record<string, unknown>, "task_type") ?? "general";
      const priority = readStringParam(params as Record<string, unknown>, "priority") ?? "normal";
      const targetRole = readStringParam(params as Record<string, unknown>, "target_role");
      const targetAgentId = readStringParam(params as Record<string, unknown>, "target_agent_id");
      const inputDataStr = readStringParam(params as Record<string, unknown>, "input_data");

      let input: unknown = {};
      if (inputDataStr) {
        try {
          input = JSON.parse(inputDataStr);
        } catch {
          input = { raw: inputDataStr };
        }
      }

      // Validate priority
      const validPriorities = ["high", "normal", "low"];
      const taskPriority = validPriorities.includes(priority) ? priority : "normal";

      const taskInput: TaskInput = {
        type: taskType,
        description,
        input,
        priority: taskPriority as "high" | "normal" | "low",
        requiredCapabilities: targetRole ? [targetRole] : undefined,
        metadata: {
          delegatedBy: ctx.agentId,
          targetAgentId,
          targetRole,
        },
      };

      const taskId = ctx.taskQueue.enqueue(taskInput);

      return jsonResult({
        success: true,
        taskId,
        message: `Task delegated: ${description}`,
        targetRole: targetRole ?? "any",
        targetAgentId: targetAgentId ?? "auto-assigned",
        priority: taskPriority,
      });
    },
  };
}

/**
 * Create the `squad_memory_read` tool.
 *
 * Read values from the squad's shared short-term memory.
 */
export function createSquadMemoryReadTool(ctx: SquadToolContext): AnyAgentTool {
  return {
    label: "Squad Memory Read",
    name: "squad_memory_read",
    description: [
      "Read a value from the squad's shared memory.",
      "Provide a key to look up. Returns the value and metadata (access count, age).",
      "Use 'list_keys' action to see all available keys.",
    ].join(" "),
    parameters: {
      action: {
        type: "string",
        description: "'get' to read a specific key, 'list_keys' to list all keys",
        required: true,
      },
      key: {
        type: "string",
        description: "The memory key to read (required for 'get' action)",
      },
    },
    execute: async (_toolCallId, params) => {
      const action = readStringParam(params as Record<string, unknown>, "action", {
        required: true,
      });
      const key = readStringParam(params as Record<string, unknown>, "key");

      if (action === "list_keys") {
        const keys = ctx.sharedMemory.keys();
        const entries = keys.map((k) => {
          const val = ctx.sharedMemory.get(k);
          return { key: k, found: val !== undefined };
        });
        return jsonResult({ keys: entries, count: entries.length });
      }

      if (!key) {
        return jsonResult({ error: "Key required for 'get' action" });
      }

      const value = ctx.sharedMemory.get(key);
      if (value === undefined) {
        return jsonResult({ found: false, key, value: null });
      }

      return jsonResult({ found: true, key, value });
    },
  };
}

/**
 * Create the `squad_memory_write` tool.
 *
 * Write values to the squad's shared short-term memory.
 */
export function createSquadMemoryWriteTool(ctx: SquadToolContext): AnyAgentTool {
  return {
    label: "Squad Memory Write",
    name: "squad_memory_write",
    description: [
      "Write a value to the squad's shared memory.",
      "Other agents in the squad can read this value.",
      "Values have a TTL and are automatically cleaned up.",
      "Set 'important' to true to flag for long-term consolidation.",
    ].join(" "),
    parameters: {
      key: {
        type: "string",
        description: "The memory key to write",
        required: true,
      },
      value: {
        type: "string",
        description: "The value to store (JSON string for complex data)",
        required: true,
      },
      important: {
        type: "string",
        description: "Set to 'true' to flag this for long-term memory consolidation",
      },
      ttl_seconds: {
        type: "string",
        description: "Time to live in seconds. Defaults to 300 (5 minutes).",
      },
    },
    execute: async (_toolCallId, params) => {
      const key = readStringParam(params as Record<string, unknown>, "key", { required: true });
      const rawValue = readStringParam(params as Record<string, unknown>, "value", {
        required: true,
      });
      const important = readStringParam(params as Record<string, unknown>, "important") === "true";
      const ttlStr = readStringParam(params as Record<string, unknown>, "ttl_seconds");

      let value: unknown;
      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }

      const ttl = ttlStr ? Number.parseInt(ttlStr, 10) * 1000 : undefined;
      ctx.sharedMemory.set(key, value, ttl);

      if (important) {
        ctx.sharedMemory.flagImportant(key);
      }

      return jsonResult({
        success: true,
        key,
        important,
        ttlMs: ttl ?? "default",
        writtenBy: ctx.agentId,
      });
    },
  };
}

/**
 * Create the `squad_broadcast` tool.
 *
 * Broadcast a message to all agents in the squad.
 */
export function createSquadBroadcastTool(ctx: SquadToolContext): AnyAgentTool {
  return {
    label: "Squad Broadcast",
    name: "squad_broadcast",
    description: [
      "Broadcast a message to all other agents in the squad.",
      "Use for status updates, findings, or coordination signals.",
      "Messages are delivered asynchronously to all squad members.",
    ].join(" "),
    parameters: {
      message: {
        type: "string",
        description: "The message to broadcast to all squad members",
        required: true,
      },
      message_type: {
        type: "string",
        description:
          "Message type: 'notification', 'result', 'question', or 'error'. Defaults to 'notification'",
      },
    },
    execute: async (_toolCallId, params) => {
      const message = readStringParam(params as Record<string, unknown>, "message", {
        required: true,
      });
      const type =
        readStringParam(params as Record<string, unknown>, "message_type") ?? "notification";

      const validTypes = ["notification", "result", "question", "error"];
      const messageType = validTypes.includes(type) ? type : "notification";

      ctx.ipc.broadcast(ctx.agentId, {
        type: messageType as AgentMessage["type"],
        payload: { message },
      });

      return jsonResult({
        success: true,
        message: "Broadcast sent to all squad members",
        type: messageType,
      });
    },
  };
}

/**
 * Create the `squad_status` tool.
 *
 * Get the current status of the squad, including agent states and task queue.
 */
export function createSquadStatusTool(ctx: SquadToolContext): AnyAgentTool {
  return {
    label: "Squad Status",
    name: "squad_status",
    description: [
      "Get the current status of the squad.",
      "Shows agent states (idle, working, terminated), task queue stats,",
      "and overall squad health. Useful for coordination decisions.",
    ].join(" "),
    parameters: {},
    execute: async () => {
      let status: SquadStatus | undefined;
      try {
        status = ctx.coordinator.getSquadStatus(ctx.squadId);
      } catch {
        // Squad may have been terminated
      }

      const queueStats = ctx.taskQueue.getStats();

      return jsonResult({
        squadId: ctx.squadId,
        isRunning: status?.isRunning ?? false,
        strategy: status?.strategy ?? "unknown",
        agents: status?.agents ?? [],
        taskQueue: {
          pending: queueStats.pending,
          claimed: queueStats.claimed,
          completed: queueStats.completed,
          failed: queueStats.failed,
          cancelled: queueStats.cancelled,
          total:
            queueStats.pending +
            queueStats.claimed +
            queueStats.completed +
            queueStats.failed +
            queueStats.cancelled,
        },
        myAgentId: ctx.agentId,
      });
    },
  };
}

/**
 * Create the `wait_for_task` tool.
 *
 * Poll for the completion of a specific task.
 */
export function createWaitForTaskTool(ctx: SquadToolContext): AnyAgentTool {
  return {
    label: "Wait for Task",
    name: "wait_for_task",
    description: [
      "Check the status of a previously delegated task.",
      "Returns the task result if completed, or current status if still in progress.",
      "Use the task_id returned by delegate_to_agent.",
    ].join(" "),
    parameters: {
      task_id: {
        type: "string",
        description: "The task ID to check status for",
        required: true,
      },
    },
    execute: async (_toolCallId, params) => {
      const taskId = readStringParam(params as Record<string, unknown>, "task_id", {
        required: true,
      });

      const info = ctx.taskQueue.getTask(taskId);
      if (!info) {
        return jsonResult({ error: `Task ${taskId} not found`, taskId });
      }

      return jsonResult({
        taskId: info.id,
        status: info.status,
        type: info.type,
        description: info.description,
        priority: info.priority,
        claimedBy: info.claimedBy,
        result: info.result,
        error: info.error,
        attempts: info.attempts,
        createdAt: info.createdAt,
        completedAt: info.completedAt,
      });
    },
  };
}

// ─── Squad Tool Set Factory ───────────────────────────────────────────────

/**
 * Create the full set of squad-aware tools for an agent.
 *
 * The `delegate_to_agent` tool is only included when `ctx.isCoordinator` is true.
 *
 * @example
 * ```typescript
 * const toolSet = createSquadTools({
 *   agentId: "agent-1",
 *   squadId: "squad-1",
 *   coordinator,
 *   sharedMemory,
 *   workingMemory,
 *   ipc,
 *   taskQueue,
 *   isCoordinator: false,
 * });
 *
 * // Register tools with agent
 * for (const tool of toolSet.tools) {
 *   agent.addTool(tool);
 * }
 * ```
 */
export function createSquadTools(ctx: SquadToolContext): SquadToolSet {
  const tools: AnyAgentTool[] = [
    createSquadMemoryReadTool(ctx),
    createSquadMemoryWriteTool(ctx),
    createSquadBroadcastTool(ctx),
    createSquadStatusTool(ctx),
    createWaitForTaskTool(ctx),
  ];

  // Only coordinators can delegate
  if (ctx.isCoordinator) {
    tools.unshift(createDelegateToAgentTool(ctx));
  }

  return {
    tools,
    names: tools.map((t) => t.name),
  };
}
