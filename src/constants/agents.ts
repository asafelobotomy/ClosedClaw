/**
 * Agent and squad system constants.
 *
 * Centralizes all configuration for:
 * - Memory systems (working, short-term, long-term)
 * - Squad coordination
 * - Agent spawning and lifecycle
 * - Task queue configuration
 *
 * @module constants/agents
 */

const MS = 1000;
const MINUTE = 60 * MS;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;

/**
 * Memory system configuration (brain-inspired architecture).
 *
 * Based on human cognitive memory research:
 * - Working memory: Limited capacity (Miller's Law: 7±2 items)
 * - Short-term memory: TTL-based cache (minutes)
 * - Long-term memory: Persistent storage (days to lifetime)
 */
export const MEMORY = {
  /**
   * Working memory (active task context).
   *
   * Holds information being actively processed for current task.
   * Based on Miller's Law: humans can hold 7±2 items in working memory.
   */
  WORKING: {
    /** Default capacity (items) - aligned with Miller's Law */
    DEFAULT_CAPACITY: 10,

    /** Minimum allowed capacity (prevent zero/negative) */
    MIN_CAPACITY: 1,

    /** Maximum allowed capacity (prevent memory abuse) */
    MAX_CAPACITY: 50,
  } as const,

  /**
   * Short-term memory (recent data cache).
   *
   * Temporary storage with automatic expiration.
   * Hot entries (frequently accessed) get promoted to long-term.
   */
  SHORT_TERM: {
    /** Default TTL for entries (5 minutes) */
    DEFAULT_TTL_MS: 5 * MINUTE,

    /** Maximum TTL to prevent unbounded growth (1 hour) */
    MAX_TTL_MS: 1 * HOUR,

    /** Memory budget per squad (prevents OOM) */
    MAX_SIZE_BYTES: 10 * MB,

    /** Access count threshold for consolidation to long-term */
    HOT_ENTRY_THRESHOLD: 5,

    /** How often to run consolidation process */
    CONSOLIDATION_INTERVAL_MS: 5 * MINUTE,

    /** TTL extension on access (extends expiration) */
    ACCESS_EXTENSION_MS: 5 * MINUTE,
  } as const,

  /**
   * Long-term memory (persistent storage).
   *
   * Three store types:
   * - Episodic: Task history, outcomes
   * - Semantic: Facts, concepts, knowledge
   * - Procedural: Strategies, workflows
   */
  LONG_TERM: {
    /**
     * Retention policy for different memory types.
     * Based on usefulness and storage efficiency.
     */
    RETENTION: {
      /** Keep successful task outcomes (days) */
      SUCCESS_DAYS: 90,

      /** Keep failed task outcomes (days) - shorter to focus on wins */
      FAILURE_DAYS: 30,

      /** Keep validated semantic facts (forever) */
      VALIDATED_FACTS_DAYS: Number.POSITIVE_INFINITY,

      /** Keep unvalidated semantic facts (days) */
      UNVALIDATED_FACTS_DAYS: 30,

      /** Keep procedures with success rate above threshold */
      PROCEDURE_SUCCESS_RATE: 0.7,

      /** Keep recently used procedures (days) */
      PROCEDURE_RECENT_DAYS: 60,
    } as const,

    /** How often to run cleanup (remove old entries) */
    CLEANUP_INTERVAL_MS: 1 * DAY,

    /** Max results returned from search queries */
    MAX_SEARCH_RESULTS: 100,

    /** Max size of episodic store before mandatory cleanup (entries) */
    MAX_EPISODIC_ENTRIES: 10_000,

    /** Max size of semantic store (entries) */
    MAX_SEMANTIC_ENTRIES: 50_000,

    /** Max size of procedural store (entries) */
    MAX_PROCEDURAL_ENTRIES: 1_000,
  } as const,

  /**
   * Consolidation process configuration.
   *
   * Moves hot entries from short-term to long-term memory.
   * Runs in background to avoid blocking agent operations.
   */
  CONSOLIDATION: {
    /** Run consolidation every N milliseconds */
    INTERVAL_MS: 5 * MINUTE,

    /** Batch size for consolidation (entries per cycle) */
    BATCH_SIZE: 100,

    /** Max time spent in consolidation per cycle */
    MAX_DURATION_MS: 30 * MS,

    /** Min age before entry is eligible for consolidation (ms) */
    MIN_AGE_MS: 1 * MINUTE,
  } as const,
} as const;

/**
 * Agent spawning and lifecycle configuration.
 *
 * Controls how agents are created, monitored, and terminated.
 */
export const SPAWNING = {
  /** Agent initialization timeout */
  INIT_TIMEOUT_MS: 30 * MS,

  /** Heartbeat interval for health checks */
  HEARTBEAT_INTERVAL_MS: 10 * MS,

  /** Max missed heartbeats before considering agent dead */
  MAX_MISSED_HEARTBEATS: 3,

  /** Grace period for graceful shutdown */
  SHUTDOWN_GRACE_PERIOD_MS: 10 * MS,

  /** Max agents per squad (prevent resource exhaustion) */
  MAX_AGENTS_PER_SQUAD: 10,

  /** Max memory per agent (MB) */
  MAX_MEMORY_MB: 512,

  /** Default token budget per agent per task */
  DEFAULT_TOKEN_BUDGET: 100_000,

  /** Auto-restart on failure (max retries) */
  MAX_RESTART_ATTEMPTS: 3,

  /** Backoff between restart attempts (exponential) */
  RESTART_BACKOFF_BASE_MS: 5 * MS,

  /** Max backoff between restart attempts */
  RESTART_BACKOFF_MAX_MS: 1 * MINUTE,
} as const;

/**
 * Squad coordination configuration.
 *
 * Controls task distribution, synchronization, and lifecycle.
 */
export const COORDINATION = {
  /**
   * Task queue configuration.
   */
  QUEUE: {
    /** Max tasks in queue per squad */
    MAX_SIZE: 1000,

    /** Task claim timeout (how long to hold claim) */
    CLAIM_TIMEOUT_MS: 5 * MINUTE,

    /** Max task execution time */
    MAX_EXECUTION_MS: 30 * MINUTE,

    /** Retry backoff base (exponential) */
    RETRY_BASE_MS: 1 * MS,

    /** Max retry backoff */
    RETRY_MAX_MS: 1 * MINUTE,

    /** Max retry attempts */
    MAX_RETRIES: 3,
  } as const,

  /**
   * Coordination primitives timeouts.
   *
   * Prevents deadlocks and infinite waits.
   */
  PRIMITIVES: {
    /** Lock timeout (prevent deadlock) */
    LOCK_TIMEOUT_MS: 30 * MS,

    /** Barrier timeout (prevent infinite wait) */
    BARRIER_TIMEOUT_MS: 5 * MINUTE,

    /** Event wait timeout */
    EVENT_WAIT_TIMEOUT_MS: 1 * MINUTE,

    /** Semaphore acquire timeout */
    SEMAPHORE_TIMEOUT_MS: 30 * MS,
  } as const,

  /**
   * Squad lifecycle limits.
   */
  SQUAD: {
    /** Max squad lifetime (auto-terminate after) */
    MAX_LIFETIME_MS: 24 * HOUR,

    /** Inactivity timeout (auto-terminate idle squads) */
    INACTIVITY_TIMEOUT_MS: 1 * HOUR,

    /** Max squads per gateway */
    MAX_SQUADS: 50,

    /** Squad cleanup interval (check for expired squads) */
    CLEANUP_INTERVAL_MS: 5 * MINUTE,
  } as const,
} as const;

/**
 * All agent-related constants namespace.
 *
 * @example
 * ```typescript
 * import { AGENTS } from '../constants';
 *
 * // Working memory
 * const capacity = AGENTS.MEMORY.WORKING.DEFAULT_CAPACITY; // 10
 *
 * // Short-term memory
 * const ttl = AGENTS.MEMORY.SHORT_TERM.DEFAULT_TTL_MS; // 300000 (5 min)
 *
 * // Long-term retention
 * const retention = AGENTS.MEMORY.LONG_TERM.RETENTION.SUCCESS_DAYS; // 90
 * ```
 */
export const AGENTS = {
  MEMORY,
  SPAWNING,
  COORDINATION,
} as const;
