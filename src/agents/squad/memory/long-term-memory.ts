/**
 * Long-Term Memory - Persistent episodic storage
 *
 * Based on human long-term memory systems:
 * - **Episodic** (MVP): Task history, outcomes, agent collaboration records
 * - **Semantic** (Phase 3): Facts, concepts, validated knowledge
 * - **Procedural** (Phase 3): Strategies, workflows, learned procedures
 *
 * Design principles:
 * - Persistent to disk via EncryptedStore (encrypted at rest)
 * - Retention policies keep store from growing unbounded
 * - Simple text search for MVP; vector search in Phase 3
 * - Append-friendly in-memory buffer flushed periodically
 *
 * @module agents/squad/memory/long-term-memory
 */

import { AGENTS } from "../../../constants/index.js";
import {
  readEncryptedStore,
  writeEncryptedStore,
  type EncryptedStoreOptions,
} from "../../../security/encrypted-store.js";

// ─────────────────────────── Types ───────────────────────────

/**
 * Outcome of a squad task
 */
export type EpisodeOutcome = "success" | "failure" | "partial" | "cancelled";

/**
 * A single recorded episode (task execution record).
 *
 * Captures the who/what/when/how/result of a completed task.
 */
export interface Episode {
  /** Unique episode identifier (UUID) */
  id: string;
  /** When the episode occurred */
  timestamp: Date;
  /** Squad that executed the task (empty string if solo agent) */
  squadId: string;
  /** Human-readable task description */
  taskDescription: string;
  /** Agent IDs involved in the task */
  agentsInvolved: string[];
  /** Outcome of the task */
  outcome: EpisodeOutcome;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Total tokens consumed */
  tokensUsed: number;
  /** Optional tags for categorization / search */
  tags?: string[];
  /** Optional structured metadata (tool results, error info, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Serializable form stored on disk (dates as ISO strings)
 */
interface SerializedEpisode {
  id: string;
  timestamp: string;
  squadId: string;
  taskDescription: string;
  agentsInvolved: string[];
  outcome: EpisodeOutcome;
  durationMs: number;
  tokensUsed: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Result of a search query against the episodic store
 */
export interface EpisodeSearchResult {
  /** Matching episodes (newest first) */
  episodes: Episode[];
  /** Total matches (may exceed returned count) */
  totalMatches: number;
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /** Number of episodes removed */
  removed: number;
  /** Number of episodes retained */
  retained: number;
}

/**
 * Statistics about the episodic store
 */
export interface EpisodicStoreStats {
  /** Total number of episodes */
  totalEpisodes: number;
  /** Number of successful outcomes */
  successCount: number;
  /** Number of failed outcomes */
  failureCount: number;
  /** Average duration across all episodes (ms) */
  avgDurationMs: number;
  /** Total tokens consumed across all episodes */
  totalTokensUsed: number;
  /** Oldest episode timestamp (or null if empty) */
  oldestTimestamp: Date | null;
  /** Newest episode timestamp (or null if empty) */
  newestTimestamp: Date | null;
}

// ─────────────────────────── EpisodicStore ───────────────────────────

/**
 * Persistent episodic memory store.
 *
 * Records task execution history for future reference.
 * Data is encrypted at rest using the ClosedClaw EncryptedStore.
 *
 * @example
 * ```typescript
 * const store = new EpisodicStore("/path/to/episodes.json", "passphrase");
 * await store.load();
 *
 * await store.store({
 *   id: crypto.randomUUID(),
 *   timestamp: new Date(),
 *   squadId: "squad-1",
 *   taskDescription: "Audit security module",
 *   agentsInvolved: ["devops", "coder"],
 *   outcome: "success",
 *   durationMs: 312_000,
 *   tokensUsed: 15_000,
 *   tags: ["security", "audit"],
 * });
 *
 * const recent = await store.getRecent(5);
 * const results = await store.search("security");
 * ```
 */
export class EpisodicStore {
  /** In-memory episode list (kept sorted newest-first) */
  private episodes: Episode[] = [];

  /** Whether data has been loaded from disk */
  private loaded = false;

  /** EncryptedStore options for persistence */
  private readonly storeOptions: EncryptedStoreOptions;

  /**
   * Create an episodic store backed by an encrypted file.
   *
   * @param storePath - Absolute path to the store file
   * @param passphrase - Passphrase for encryption (empty string disables encryption)
   */
  constructor(
    private readonly storePath: string,
    private readonly passphrase: string,
  ) {
    this.storeOptions = {
      filePath: storePath,
      passphrase,
      ensureDir: true,
      config: passphrase
        ? undefined // Use default encryption config
        : { enabled: false, algorithm: "xchacha20-poly1305", kdf: "argon2id", kdfParams: { memory: 65536, iterations: 3, parallelism: 4, keyLength: 32 } },
    };
  }

  /**
   * Load episodes from disk. Must be called before other operations.
   * Safe to call multiple times (no-op after first load).
   */
  async load(): Promise<void> {
    if (this.loaded) {return;}

    const data = await readEncryptedStore<SerializedEpisode[]>(this.storeOptions);

    if (data && Array.isArray(data)) {
      this.episodes = data.map(deserializeEpisode);
      // Sort newest-first
      this.episodes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    this.loaded = true;
  }

  /**
   * Store a new episode. Persists to disk immediately.
   *
   * @param episode - The episode to record
   * @throws If store exceeds MAX_EPISODIC_ENTRIES (run cleanup first)
   */
  async store(episode: Episode): Promise<void> {
    this.ensureLoaded();

    const maxEntries = AGENTS.MEMORY.LONG_TERM.MAX_EPISODIC_ENTRIES;
    if (this.episodes.length >= maxEntries) {
      throw new Error(
        `Episodic store full (${maxEntries} entries). Run cleanup() before storing new episodes.`,
      );
    }

    // Insert sorted (newest first)
    const insertIdx = this.episodes.findIndex(
      (e) => e.timestamp.getTime() <= episode.timestamp.getTime(),
    );
    if (insertIdx === -1) {
      this.episodes.push(episode);
    } else {
      this.episodes.splice(insertIdx, 0, episode);
    }

    await this.flush();
  }

  /**
   * Store multiple episodes at once (batch insert).
   * More efficient than calling store() in a loop.
   *
   * @param episodes - Episodes to record
   */
  async storeBatch(episodes: Episode[]): Promise<void> {
    this.ensureLoaded();

    const maxEntries = AGENTS.MEMORY.LONG_TERM.MAX_EPISODIC_ENTRIES;
    if (this.episodes.length + episodes.length > maxEntries) {
      throw new Error(
        `Batch would exceed episodic store limit (${maxEntries}). Run cleanup() first.`,
      );
    }

    this.episodes.push(...episodes);
    this.episodes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    await this.flush();
  }

  /**
   * Search episodes by text query.
   *
   * Matches against taskDescription and tags (case-insensitive substring).
   * MVP: simple text search. Phase 3 will add vector/semantic search.
   *
   * @param query - Search text
   * @param limit - Maximum results to return (default: MAX_SEARCH_RESULTS)
   * @returns Matching episodes (newest first)
   */
  search(query: string, limit?: number): EpisodeSearchResult {
    this.ensureLoaded();

    const maxResults = limit ?? AGENTS.MEMORY.LONG_TERM.MAX_SEARCH_RESULTS;
    const lowerQuery = query.toLowerCase();

    const matches = this.episodes.filter((ep) => {
      if (ep.taskDescription.toLowerCase().includes(lowerQuery)) {return true;}
      if (ep.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))) {return true;}
      if (ep.squadId.toLowerCase().includes(lowerQuery)) {return true;}
      if (ep.agentsInvolved.some((a) => a.toLowerCase().includes(lowerQuery))) {return true;}
      return false;
    });

    return {
      episodes: matches.slice(0, maxResults),
      totalMatches: matches.length,
    };
  }

  /**
   * Get most recent episodes.
   *
   * @param limit - Maximum number to return
   * @returns Recent episodes (newest first)
   */
  getRecent(limit: number): Episode[] {
    this.ensureLoaded();
    return this.episodes.slice(0, Math.min(limit, this.episodes.length));
  }

  /**
   * Get episodes by outcome type.
   *
   * @param outcome - Filter by outcome
   * @param limit - Maximum results
   * @returns Matching episodes (newest first)
   */
  getByOutcome(outcome: EpisodeOutcome, limit?: number): Episode[] {
    this.ensureLoaded();
    const matches = this.episodes.filter((ep) => ep.outcome === outcome);
    return limit ? matches.slice(0, limit) : matches;
  }

  /**
   * Get episodes for a specific squad.
   *
   * @param squadId - Squad identifier
   * @param limit - Maximum results
   * @returns Matching episodes (newest first)
   */
  getBySquad(squadId: string, limit?: number): Episode[] {
    this.ensureLoaded();
    const matches = this.episodes.filter((ep) => ep.squadId === squadId);
    return limit ? matches.slice(0, limit) : matches;
  }

  /**
   * Get a single episode by ID.
   *
   * @param id - Episode ID
   * @returns Episode or undefined
   */
  getById(id: string): Episode | undefined {
    this.ensureLoaded();
    return this.episodes.find((ep) => ep.id === id);
  }

  /**
   * Cleanup old episodes based on retention policy.
   *
   * Retention rules (from constants):
   * - Successful episodes: keep for SUCCESS_DAYS
   * - Failed episodes: keep for FAILURE_DAYS
   *
   * @param nowMs - Current time in ms (default: Date.now()), useful for testing
   * @returns Cleanup result with counts
   */
  async cleanup(nowMs?: number): Promise<CleanupResult> {
    this.ensureLoaded();

    const now = nowMs ?? Date.now();
    const retention = AGENTS.MEMORY.LONG_TERM.RETENTION;
    const successMaxAge = retention.SUCCESS_DAYS * 24 * 60 * 60 * 1000;
    const failureMaxAge = retention.FAILURE_DAYS * 24 * 60 * 60 * 1000;

    const before = this.episodes.length;

    this.episodes = this.episodes.filter((ep) => {
      const ageMs = now - ep.timestamp.getTime();

      switch (ep.outcome) {
        case "success":
        case "partial":
          return ageMs <= successMaxAge;
        case "failure":
        case "cancelled":
          return ageMs <= failureMaxAge;
        default:
          return ageMs <= successMaxAge;
      }
    });

    const removed = before - this.episodes.length;

    if (removed > 0) {
      await this.flush();
    }

    return { removed, retained: this.episodes.length };
  }

  /**
   * Get statistics about the store.
   */
  getStats(): EpisodicStoreStats {
    this.ensureLoaded();

    let successCount = 0;
    let failureCount = 0;
    let totalDuration = 0;
    let totalTokens = 0;

    for (const ep of this.episodes) {
      if (ep.outcome === "success") {successCount++;}
      if (ep.outcome === "failure") {failureCount++;}
      totalDuration += ep.durationMs;
      totalTokens += ep.tokensUsed;
    }

    return {
      totalEpisodes: this.episodes.length,
      successCount,
      failureCount,
      avgDurationMs: this.episodes.length > 0 ? totalDuration / this.episodes.length : 0,
      totalTokensUsed: totalTokens,
      oldestTimestamp: this.episodes.length > 0 ? this.episodes[this.episodes.length - 1]!.timestamp : null,
      newestTimestamp: this.episodes.length > 0 ? this.episodes[0]!.timestamp : null,
    };
  }

  /**
   * Total number of episodes in the store.
   */
  count(): number {
    this.ensureLoaded();
    return this.episodes.length;
  }

  /**
   * Clear all episodes. Destructive operation.
   */
  async clear(): Promise<void> {
    this.episodes = [];
    this.loaded = true;
    await this.flush();
  }

  // ─────────────────── Private helpers ───────────────────

  /** Throw if load() hasn't been called */
  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("EpisodicStore not loaded. Call load() before using the store.");
    }
  }

  /** Persist current state to disk */
  private async flush(): Promise<void> {
    const serialized = this.episodes.map(serializeEpisode);
    await writeEncryptedStore<SerializedEpisode[]>(this.storeOptions, serialized);
  }
}

// ─────────────────────────── LongTermMemory ───────────────────────────

/**
 * Top-level long-term memory facade.
 *
 * MVP exposes only the episodic store.
 * Phase 3 will add semantic and procedural stores.
 *
 * @example
 * ```typescript
 * const ltm = new LongTermMemory("/path/to/ltm/", "passphrase");
 * await ltm.load();
 *
 * await ltm.episodic.store(episode);
 * const recent = ltm.episodic.getRecent(10);
 * ```
 */
export class LongTermMemory {
  /** Episodic memory store (task history) */
  readonly episodic: EpisodicStore;

  // Phase 3 placeholders:
  // readonly semantic: SemanticStore;
  // readonly procedural: ProceduralStore;

  /**
   * Create long-term memory backed by encrypted files.
   *
   * @param storeDir - Directory for long-term memory files
   * @param passphrase - Passphrase for encryption
   */
  constructor(
    private readonly storeDir: string,
    passphrase: string,
  ) {
    this.episodic = new EpisodicStore(`${storeDir}/episodic.json`, passphrase);
  }

  /**
   * Load all stores from disk.
   */
  async load(): Promise<void> {
    await this.episodic.load();
    // Phase 3: await this.semantic.load();
    // Phase 3: await this.procedural.load();
  }
}

// ─────────────────────────── Serialization helpers ───────────────────────────

function serializeEpisode(ep: Episode): SerializedEpisode {
  return {
    id: ep.id,
    timestamp: ep.timestamp.toISOString(),
    squadId: ep.squadId,
    taskDescription: ep.taskDescription,
    agentsInvolved: ep.agentsInvolved,
    outcome: ep.outcome,
    durationMs: ep.durationMs,
    tokensUsed: ep.tokensUsed,
    tags: ep.tags,
    metadata: ep.metadata,
  };
}

function deserializeEpisode(raw: SerializedEpisode): Episode {
  return {
    id: raw.id,
    timestamp: new Date(raw.timestamp),
    squadId: raw.squadId,
    taskDescription: raw.taskDescription,
    agentsInvolved: raw.agentsInvolved,
    outcome: raw.outcome,
    durationMs: raw.durationMs,
    tokensUsed: raw.tokensUsed,
    tags: raw.tags,
    metadata: raw.metadata,
  };
}

/**
 * Create a new LongTermMemory instance with default settings.
 *
 * @param storeDir - Directory for long-term memory data
 * @param passphrase - Passphrase for encryption
 * @returns New LongTermMemory instance
 */
export function createLongTermMemory(storeDir: string, passphrase: string): LongTermMemory {
  return new LongTermMemory(storeDir, passphrase);
}
