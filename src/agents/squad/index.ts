/**
 * Agent Squad System - Multi-agent coordination infrastructure
 *
 * Exports all squad subsystems:
 * - **Memory**: Three-tier brain-inspired memory (working, short-term, long-term)
 * - **Spawner**: Agent lifecycle management (spawn, terminate, restart)
 * - **IPC**: Inter-agent communication (direct, broadcast, request-reply, pub/sub)
 * - **Task Queue**: Priority queue with dependencies, claims, and retries
 * - **Coordinator**: Squad orchestration with multiple strategies
 * - **Tools**: Squad-aware agent tools (delegate, memory, broadcast, status)
 * - **Primitives**: Synchronization primitives (mutex, barrier, semaphore, event)
 * - **Templates**: Pre-built agent profiles (researcher, coder, reviewer, etc.)
 * - **Resources**: Token budgets, rate limiting, and resource monitoring
 *
 * @module agents/squad
 */

// ─── Memory System ────────────────────────────────────────────────────────────

export { WorkingMemory, type WorkingMemoryEntry } from "./memory/working-memory.js";

export { ShortTermMemory, type ShortTermEntry } from "./memory/short-term-memory.js";

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

// ─── Squad Tools ──────────────────────────────────────────────────────────────

export {
  createDelegateToAgentTool,
  createSquadMemoryReadTool,
  createSquadMemoryWriteTool,
  createSquadBroadcastTool,
  createSquadStatusTool,
  createWaitForTaskTool,
  createSquadTools,
  type SquadToolContext,
  type SquadToolSet,
} from "./tools.js";

// ─── Coordination Primitives ──────────────────────────────────────────────────

export {
  Mutex,
  Barrier,
  Semaphore,
  Event,
  SyncTimeoutError,
  waitForAny,
  waitForAll,
} from "./primitives.js";

// ─── Agent Templates ──────────────────────────────────────────────────────────

export {
  getAgentTemplate,
  listTemplateIds,
  spawnConfigFromTemplate,
  findTemplatesByCapability,
  AGENT_TEMPLATES,
  RESEARCHER_TEMPLATE,
  CODER_TEMPLATE,
  REVIEWER_TEMPLATE,
  TESTER_TEMPLATE,
  DOCUMENTER_TEMPLATE,
  DEVOPS_TEMPLATE,
  type AgentTemplate,
  type TemplateSpawnOptions,
} from "./templates.js";

// ─── Resource Management ──────────────────────────────────────────────────────

export {
  TokenBudgetTracker,
  RateLimiter,
  ResourceManager,
  type TokenBudget,
  type RateLimitConfig,
  type SquadResourceSnapshot,
  type ResourceAlert,
  type ResourceManagerConfig,
} from "./resources.js";

// ─── Squad Integration ────────────────────────────────────────────────────────

export {
  analyzeTaskForSquad,
  buildSquadFromProfiles,
  formSquadForTask,
  buildComplexTask,
  type SquadFormationRequest,
  type TaskAnalysis,
  type SquadBuildResult,
} from "./integration.js";
