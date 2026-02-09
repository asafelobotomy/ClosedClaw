/**
 * Agent Squad System - Multi-agent coordination infrastructure
 *
 * Exports all squad subsystems:
 * - **Memory**: Three-tier brain-inspired memory (working, short-term, long-term)
 * - **Spawner**: Agent lifecycle management (spawn, terminate, restart)
 * - **IPC**: Inter-agent communication (direct, broadcast, request-reply, pub/sub)
 * - **Task Queue**: Priority queue with dependencies, claims, and retries
 * - **Coordinator**: Squad orchestration with multiple strategies
 *
 * @module agents/squad
 */

// ─── Memory System ────────────────────────────────────────────────────────────

export {
  WorkingMemory,
  type WorkingMemoryEntry,
} from "./memory/working-memory.js";

export {
  ShortTermMemory,
  type ShortTermEntry,
} from "./memory/short-term-memory.js";

export {
  EpisodicStore,
  LongTermMemory,
  createLongTermMemory,
  type Episode,
  type EpisodeOutcome,
  type EpisodeSearchResult,
  type CleanupResult,
  type EpisodicStoreStats,
} from "./memory/long-term-memory.js";

export {
  consolidateMemory,
  startConsolidationScheduler,
  convertToEpisode,
  type ConsolidationContext,
  type ConsolidationOptions,
  type ConsolidationResult,
  type ConsolidationScheduler,
} from "./memory/consolidation.js";

// ─── Agent Spawner ────────────────────────────────────────────────────────────

export {
  AgentSpawner,
  createAgentSpawner,
  type AgentState,
  type AgentSpawnConfig,
  type AgentStatus,
  type AgentHandle,
  type AgentTaskMessage,
  type AgentResponse,
  type AgentTaskHandler,
  type SpawnerConfig,
  type SpawnerEvent,
  type SpawnerEventType,
  type SpawnerEventListener,
} from "./spawner.js";

// ─── Inter-Agent Communication ────────────────────────────────────────────────

export {
  AgentIPC,
  createAgentIPC,
  type AgentMessage,
  type MessageType,
  type MessageHandler,
  type RequestHandler,
  type Subscription,
  type IPCConfig,
  type IPCStats,
} from "./ipc.js";

// ─── Task Queue ───────────────────────────────────────────────────────────────

export {
  TaskQueue,
  createTaskQueue,
  type Task,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
  type TaskInfo,
  type QueueStats,
  type TaskQueueConfig,
} from "./task-queue.js";

// ─── Squad Coordinator ────────────────────────────────────────────────────────

export {
  SquadCoordinator,
  createSquadCoordinator,
  type CoordinationStrategy,
  type SquadConfig,
  type ComplexTask,
  type SquadResult,
  type SquadStatus,
  type AgentContribution,
  type CoordinatorConfig,
} from "./coordinator.js";
