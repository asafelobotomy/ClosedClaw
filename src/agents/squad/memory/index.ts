/**
 * Squad Memory System - Brain-inspired three-tier architecture
 *
 * Tier 1: **Working Memory** — Active task context (7±2 items, LRU eviction)
 * Tier 2: **Short-Term Memory** — Recent data cache with TTL and access tracking
 * Tier 3: **Long-Term Memory** — Persistent episodic store with encrypted disk backing
 *
 * **Consolidation** engine promotes hot short-term entries to long-term storage.
 *
 * @example
 * ```typescript
 * import {
 *   WorkingMemory,
 *   ShortTermMemory,
 *   LongTermMemory,
 *   consolidateMemory,
 *   startConsolidationScheduler,
 * } from "./memory/index.js";
 *
 * // Tier 1: Active context
 * const wm = new WorkingMemory();
 * wm.set("currentTask", "Analyze code");
 *
 * // Tier 2: Recent cache
 * const stm = new ShortTermMemory();
 * stm.set("lastResult", { status: "success" });
 *
 * // Tier 3: Persistent history
 * const ltm = new LongTermMemory("/path/to/store", "passphrase");
 * await ltm.load();
 *
 * // Promote hot entries from STM → LTM
 * const scheduler = startConsolidationScheduler({
 *   shortTermMemory: stm,
 *   episodicStore: ltm.episodic,
 *   squadId: "my-squad",
 * });
 * ```
 *
 * @module agents/squad/memory
 */

// Tier 1: Working Memory
export { WorkingMemory, createWorkingMemory } from "./working-memory.js";
export type { WorkingMemoryEntry } from "./working-memory.js";

// Tier 2: Short-Term Memory
export { ShortTermMemory, createShortTermMemory } from "./short-term-memory.js";
export type { ShortTermEntry } from "./short-term-memory.js";

// Tier 3: Long-Term Memory
export { EpisodicStore, LongTermMemory, createLongTermMemory } from "./long-term-memory.js";
export type {
  Episode,
  EpisodeOutcome,
  EpisodeSearchResult,
  CleanupResult,
  EpisodicStoreStats,
} from "./long-term-memory.js";

// Consolidation
export {
  consolidateMemory,
  startConsolidationScheduler,
  convertToEpisode,
} from "./consolidation.js";
export type {
  ConsolidationContext,
  ConsolidationResult,
  ConsolidationOptions,
  ConsolidationScheduler,
} from "./consolidation.js";
