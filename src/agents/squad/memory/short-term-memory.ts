/**
 * Short-Term Memory - Recent data cache with TTL
 *
 * Based on human short-term memory (seconds to minutes).
 * Temporary storage with automatic expiration.
 * Hot entries (frequently accessed) get promoted to long-term memory.
 *
 * Design principles:
 * - TTL-based expiration (default: 5 minutes)
 * - Access count tracking for consolidation
 * - Automatic TTL extension on access
 * - Size limits prevent memory exhaustion
 *
 * @module agents/squad/memory/short-term-memory
 */

import { AGENTS } from "../../../constants/index.js";

/**
 * Entry in short-term memory with TTL and access tracking
 */
export interface ShortTermEntry<T = any> {
  /** Stored value */
  value: T;
  /** When entry was created */
  createdAt: Date;
  /** When entry was last accessed */
  lastAccessedAt: Date;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** How many times accessed */
  accessCount: number;
  /** Manually flagged as important for consolidation */
  flaggedImportant?: boolean;
}

/**
 * Short-term memory for recent data cache.
 *
 * Entries expire after TTL, but TTL extends on access.
 * Frequently accessed entries (>= 5 accesses) trigger consolidation
 * to long-term memory.
 *
 * @example
 * ```typescript
 * const stm = new ShortTermMemory();
 *
 * // Store with default 5-minute TTL
 * stm.set("recentResult", { status: "success" });
 *
 * // Store with custom TTL
 * stm.set("tempFlag", true, 60_000); // 1 minute
 *
 * // Access extends TTL automatically
 * const result = stm.get("recentResult"); // TTL extended
 *
 * // Get hot entries for consolidation
 * const hot = stm.getHotEntries(); // accessCount >= 5
 * ```
 */
export class ShortTermMemory<T = any> {
  /** Internal storage */
  private cache: Map<string, ShortTermEntry<T>> = new Map();

  /** Timer for automatic expiration cleanup */
  private cleanupTimer?: NodeJS.Timeout;

  /**
   * Create short-term memory cache
   *
   * @param defaultTtl - Default TTL in milliseconds (default: 5 minutes)
   * @param autoCleanup - Enable automatic cleanup (default: true)
   * @param cleanupInterval - Cleanup interval in milliseconds (default: 1 minute)
   */
  constructor(
    private readonly defaultTtl: number = AGENTS.MEMORY.SHORT_TERM.DEFAULT_TTL_MS,
    autoCleanup: boolean = true,
    cleanupInterval: number = 60_000, // 1 minute
  ) {
    if (defaultTtl < 1) {
      throw new Error("Short-term memory defaultTtl must be >= 1");
    }
    if (defaultTtl > AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS) {
      throw new Error(
        `Short-term memory defaultTtl must be <= ${AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS}`,
      );
    }

    if (autoCleanup) {
      this.startAutoCleanup(cleanupInterval);
    }
  }

  /**
   * Store value in short-term memory with TTL
   *
   * @param key - Unique key
   * @param value - Value to store
   * @param ttl - Time-to-live in milliseconds (default: from constructor)
   */
  set(key: string, value: T, ttl?: number): void {
    const effectiveTtl = ttl ?? this.defaultTtl;

    if (effectiveTtl < 1) {
      throw new Error("TTL must be >= 1");
    }
    if (effectiveTtl > AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS) {
      throw new Error(`TTL must be <= ${AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS}`);
    }

    const now = new Date();
    this.cache.set(key, {
      value,
      createdAt: now,
      lastAccessedAt: now,
      ttl: effectiveTtl,
      accessCount: 0,
    });
  }

  /**
   * Retrieve value from short-term memory.
   * Automatically extends TTL and increments access count.
   *
   * @param key - Key to retrieve
   * @returns Value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check expiration
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = new Date();

    // Extend TTL on access
    const extensionMs = AGENTS.MEMORY.SHORT_TERM.ACCESS_EXTENSION_MS;
    entry.ttl = Math.min(entry.ttl + extensionMs, AGENTS.MEMORY.SHORT_TERM.MAX_TTL_MS);

    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   *
   * @param key - Key to check
   * @returns True if key exists and not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from short-term memory
   *
   * @param key - Key to delete
   * @returns True if key existed
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current size (number of entries, including expired)
   *
   * @returns Number of entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys (including expired)
   *
   * @returns Array of keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Flag entry as important for consolidation priority
   *
   * @param key - Key to flag
   * @returns True if key exists
   */
  flagImportant(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      return false;
    }

    entry.flaggedImportant = true;
    return true;
  }

  /**
   * Get hot entries eligible for consolidation to long-term memory.
   * Hot entries are those with access count >= threshold or flagged important.
   *
   * @returns Array of [key, entry] tuples
   */
  getHotEntries(): Array<[string, ShortTermEntry<T>]> {
    const hot: Array<[string, ShortTermEntry<T>]> = [];
    const threshold = AGENTS.MEMORY.SHORT_TERM.HOT_ENTRY_THRESHOLD;

    for (const [key, entry] of this.cache.entries()) {
      // Skip expired
      if (this.isExpired(entry)) {
        continue;
      }

      // Check if hot
      if (entry.accessCount >= threshold || entry.flaggedImportant) {
        hot.push([key, entry]);
      }
    }

    return hot;
  }

  /**
   * Evict all expired entries.
   * Returns number of entries evicted.
   *
   * @returns Number of entries evicted
   */
  evictExpired(): number {
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Get statistics about memory usage
   *
   * @returns Statistics object
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    hotEntries: number;
    avgAccessCount: number;
  } {
    let expired = 0;
    let hot = 0;
    let totalAccess = 0;

    const threshold = AGENTS.MEMORY.SHORT_TERM.HOT_ENTRY_THRESHOLD;

    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expired++;
      }
      if (entry.accessCount >= threshold || entry.flaggedImportant) {
        hot++;
      }
      totalAccess += entry.accessCount;
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expired,
      hotEntries: hot,
      avgAccessCount: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
    };
  }

  /**
   * Destroy short-term memory and cleanup timers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }

  /**
   * Check if entry is expired
   *
   * @private
   */
  private isExpired(entry: ShortTermEntry<T>): boolean {
    const age = Date.now() - entry.createdAt.getTime();
    return age > entry.ttl;
  }

  /**
   * Start automatic cleanup timer
   *
   * @private
   */
  private startAutoCleanup(interval: number): void {
    this.cleanupTimer = setInterval(() => {
      this.evictExpired();
    }, interval);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}

/**
 * Create short-term memory with default settings
 *
 * @param defaultTtl - Default TTL in milliseconds
 * @returns New ShortTermMemory instance
 */
export function createShortTermMemory<T = any>(defaultTtl?: number): ShortTermMemory<T> {
  return new ShortTermMemory<T>(defaultTtl);
}
