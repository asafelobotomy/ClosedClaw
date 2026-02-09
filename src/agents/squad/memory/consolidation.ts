/**
 * Memory Consolidation - Promotes hot short-term entries to long-term storage
 *
 * Based on human memory consolidation (sleep/rehearsal cycles):
 * - Frequently accessed short-term entries (hot entries) are persisted
 * - Consolidation runs periodically in the background
 * - Entries are converted to Episode records in long-term episodic store
 *
 * Design principles:
 * - Non-blocking: async with max duration per cycle
 * - Batch processing: configurable batch size
 * - Idempotent: safe to run multiple times
 * - Observable: returns detailed results for monitoring
 *
 * @module agents/squad/memory/consolidation
 */

import { AGENTS } from "../../../constants/index.js";
import type { ShortTermMemory, ShortTermEntry } from "./short-term-memory.js";
import type { EpisodicStore, Episode, EpisodeOutcome } from "./long-term-memory.js";

// ─────────────────────────── Types ───────────────────────────

/**
 * Context required for memory consolidation.
 *
 * Provides the short-term memory source and long-term episodic sink,
 * plus optional metadata about the owning squad/agent.
 */
export interface ConsolidationContext {
  /** Source: short-term memory containing hot entries */
  shortTermMemory: ShortTermMemory;
  /** Sink: long-term episodic store to persist into */
  episodicStore: EpisodicStore;
  /** Squad ID for episode attribution (default: "unknown") */
  squadId?: string;
  /** Agent IDs participating in this squad */
  agentIds?: string[];
}

/**
 * Result of a single consolidation cycle.
 */
export interface ConsolidationResult {
  /** Number of entries promoted from short-term to long-term */
  consolidated: number;
  /** Number of entries skipped (too young, already at capacity, etc.) */
  skipped: number;
  /** Number of entries that failed to consolidate */
  failed: number;
  /** Wall-clock time of consolidation (ms) */
  durationMs: number;
  /** Whether the cycle hit the max-duration budget */
  timedOut: boolean;
}

/**
 * Options for fine-tuning consolidation behavior.
 */
export interface ConsolidationOptions {
  /** Maximum entries to consolidate per cycle (default: from constants) */
  batchSize?: number;
  /** Maximum wall-clock time per cycle in ms (default: from constants) */
  maxDurationMs?: number;
  /** Minimum age before entry is eligible for consolidation in ms (default: from constants) */
  minAgeMs?: number;
  /** Whether to remove consolidated entries from short-term memory (default: true) */
  removeAfterConsolidation?: boolean;
  /** Custom ID generator for episodes (default: crypto.randomUUID) */
  idGenerator?: () => string;
  /** Current time in ms (default: Date.now()), for testing */
  nowMs?: number;
}

// ─────────────────────────── Core consolidation ───────────────────────────

/**
 * Run a single consolidation cycle.
 *
 * Finds hot entries in short-term memory, converts them to Episode records,
 * and stores them in the long-term episodic store.
 *
 * @param ctx - Consolidation context (source + sink)
 * @param options - Optional tuning parameters
 * @returns Result describing what was consolidated
 *
 * @example
 * ```typescript
 * const result = await consolidateMemory({
 *   shortTermMemory: stm,
 *   episodicStore: ltm.episodic,
 *   squadId: "squad-1",
 *   agentIds: ["researcher", "coder"],
 * });
 *
 * console.log(`Consolidated ${result.consolidated} entries in ${result.durationMs}ms`);
 * ```
 */
export async function consolidateMemory(
  ctx: ConsolidationContext,
  options?: ConsolidationOptions,
): Promise<ConsolidationResult> {
  const batchSize = options?.batchSize ?? AGENTS.MEMORY.CONSOLIDATION.BATCH_SIZE;
  const maxDurationMs = options?.maxDurationMs ?? AGENTS.MEMORY.CONSOLIDATION.MAX_DURATION_MS;
  const minAgeMs = options?.minAgeMs ?? AGENTS.MEMORY.CONSOLIDATION.MIN_AGE_MS;
  const removeAfter = options?.removeAfterConsolidation ?? true;
  const idGen = options?.idGenerator ?? defaultIdGenerator;
  const now = options?.nowMs ?? Date.now();

  const startTime = now;
  let consolidated = 0;
  let skipped = 0;
  let failed = 0;
  let timedOut = false;

  // Get hot entries from short-term memory
  const hotEntries = ctx.shortTermMemory.getHotEntries();

  // Process up to batchSize entries
  const toProcess = hotEntries.slice(0, batchSize);

  for (const [key, entry] of toProcess) {
    // Check time budget
    const elapsed = (options?.nowMs ? now : Date.now()) - startTime;
    if (elapsed >= maxDurationMs) {
      timedOut = true;
      break;
    }

    // Check minimum age
    const entryAge = now - entry.createdAt.getTime();
    if (entryAge < minAgeMs) {
      skipped++;
      continue;
    }

    // Convert to episode
    try {
      const episode = convertToEpisode(key, entry, {
        squadId: ctx.squadId ?? "unknown",
        agentIds: ctx.agentIds ?? [],
        idGenerator: idGen,
      });

      await ctx.episodicStore.store(episode);
      consolidated++;

      // Remove from short-term if configured
      if (removeAfter) {
        ctx.shortTermMemory.delete(key);
      }
    } catch {
      failed++;
    }
  }

  // Count entries not processed (beyond batch)
  skipped += Math.max(0, hotEntries.length - toProcess.length);

  const endTime = options?.nowMs ? now : Date.now();

  return {
    consolidated,
    skipped,
    failed,
    durationMs: endTime - startTime,
    timedOut,
  };
}

// ─────────────────────────── Scheduler ───────────────────────────

/**
 * Handle for a running consolidation scheduler.
 */
export interface ConsolidationScheduler {
  /** Stop the scheduler */
  stop(): void;
  /** Whether the scheduler is currently running */
  readonly running: boolean;
  /** Number of cycles executed */
  readonly cycleCount: number;
  /** Last consolidation result (or null if no cycle has run) */
  readonly lastResult: ConsolidationResult | null;
}

/**
 * Start a periodic consolidation scheduler.
 *
 * Runs consolidateMemory() at a fixed interval. The timer is unref'd
 * so it doesn't prevent Node.js process exit.
 *
 * @param ctx - Consolidation context
 * @param options - Consolidation options (applied to every cycle)
 * @param intervalMs - Interval between cycles (default: from constants)
 * @returns Scheduler handle with stop(), running, cycleCount
 *
 * @example
 * ```typescript
 * const scheduler = startConsolidationScheduler({
 *   shortTermMemory: stm,
 *   episodicStore: ltm.episodic,
 *   squadId: "squad-1",
 * });
 *
 * // Later...
 * scheduler.stop();
 * console.log(`Ran ${scheduler.cycleCount} cycles`);
 * ```
 */
export function startConsolidationScheduler(
  ctx: ConsolidationContext,
  options?: ConsolidationOptions,
  intervalMs?: number,
): ConsolidationScheduler {
  const interval = intervalMs ?? AGENTS.MEMORY.CONSOLIDATION.INTERVAL_MS;

  let running = true;
  let cycleCount = 0;
  let lastResult: ConsolidationResult | null = null;

  const timer = setInterval(async () => {
    if (!running) return;

    try {
      lastResult = await consolidateMemory(ctx, options);
      cycleCount++;
    } catch {
      // Consolidation errors are non-fatal; log and continue
    }
  }, interval) as ReturnType<typeof setInterval> & { unref?: () => void };

  // Don't prevent process exit
  if (timer.unref) {
    timer.unref();
  }

  return {
    stop() {
      running = false;
      clearInterval(timer);
    },
    get running() {
      return running;
    },
    get cycleCount() {
      return cycleCount;
    },
    get lastResult() {
      return lastResult;
    },
  };
}

// ─────────────────────────── Helpers ───────────────────────────

/**
 * Convert a short-term memory entry to an Episode record.
 *
 * Extracts structured data from the entry value when possible,
 * falling back to string representation for unstructured data.
 */
export function convertToEpisode(
  key: string,
  entry: ShortTermEntry,
  context: {
    squadId: string;
    agentIds: string[];
    idGenerator: () => string;
  },
): Episode {
  const value = entry.value;

  // Try to extract structured episode data from entry value
  const taskDescription = extractTaskDescription(key, value);
  const outcome = extractOutcome(value);
  const durationMs = extractDuration(entry);
  const tokensUsed = extractTokens(value);
  const tags = extractTags(key, value);
  const metadata = extractMetadata(key, value, entry);

  return {
    id: context.idGenerator(),
    timestamp: entry.createdAt,
    squadId: context.squadId,
    taskDescription,
    agentsInvolved: context.agentIds,
    outcome,
    durationMs,
    tokensUsed,
    tags,
    metadata,
  };
}

/**
 * Extract task description from entry key and value.
 */
function extractTaskDescription(key: string, value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.taskDescription === "string") return obj.taskDescription;
    if (typeof obj.task === "string") return obj.task;
    if (typeof obj.description === "string") return obj.description;
    if (typeof obj.message === "string") return obj.message;
  }
  if (typeof value === "string") return value;
  return `Memory entry: ${key}`;
}

/**
 * Extract outcome from entry value, defaulting to "success".
 */
function extractOutcome(value: unknown): EpisodeOutcome {
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const raw = obj.outcome ?? obj.status ?? obj.result;
    if (raw === "success" || raw === "failure" || raw === "partial" || raw === "cancelled") {
      return raw;
    }
    if (raw === "error" || raw === "failed") return "failure";
    if (raw === "ok" || raw === "completed" || raw === "done") return "success";
  }
  return "success"; // Default: assume success for hot entries
}

/**
 * Extract duration from entry metadata (time between creation and last access).
 */
function extractDuration(entry: ShortTermEntry): number {
  if (typeof entry.value === "object" && entry.value !== null) {
    const obj = entry.value as Record<string, unknown>;
    if (typeof obj.durationMs === "number") return obj.durationMs;
    if (typeof obj.duration === "number") return obj.duration;
  }
  // Fall back to time between creation and last access
  return entry.lastAccessedAt.getTime() - entry.createdAt.getTime();
}

/**
 * Extract token usage from entry value.
 */
function extractTokens(value: unknown): number {
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.tokensUsed === "number") return obj.tokensUsed;
    if (typeof obj.tokens === "number") return obj.tokens;
    if (typeof obj.tokenCount === "number") return obj.tokenCount;
  }
  return 0; // Unknown token usage
}

/**
 * Extract tags from entry key and value.
 */
function extractTags(key: string, value: unknown): string[] {
  const tags: string[] = [key]; // Always include the key as a tag

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.tags)) {
      tags.push(...obj.tags.filter((t): t is string => typeof t === "string"));
    }
  }

  return [...new Set(tags)]; // Deduplicate
}

/**
 * Extract metadata from entry for debugging/auditability.
 */
function extractMetadata(
  key: string,
  _value: unknown,
  entry: ShortTermEntry,
): Record<string, unknown> {
  return {
    sourceKey: key,
    accessCount: entry.accessCount,
    flaggedImportant: entry.flaggedImportant ?? false,
    ttlMs: entry.ttl,
  };
}

/**
 * Default ID generator using crypto.randomUUID.
 */
function defaultIdGenerator(): string {
  return crypto.randomUUID();
}
