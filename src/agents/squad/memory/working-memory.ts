/**
 * Working Memory - Agent's immediate task context
 *
 * Based on human working memory (7±2 items, Miller's Law).
 * Holds active information being processed for current task.
 * Cleared when task completes.
 *
 * Design principles:
 * - Limited capacity prevents cognitive overload
 * - LRU eviction when full
 * - Fastest access (in-memory, no serialization)
 * - Per-agent isolation
 *
 * @module agents/squad/memory/working-memory
 */

import { AGENTS } from "../../../constants/index.js";

/**
 * Entry in working memory with access tracking
 */
export interface WorkingMemoryEntry {
  /** Stored value */
  value: any;
  /** When entry was created */
  createdAt: Date;
  /** When entry was last accessed */
  lastAccessedAt: Date;
}

/**
 * Working memory for an agent's active task context.
 *
 * Capacity limited to 7±2 items (Miller's Law). Evicts least recently
 * accessed items when full.
 *
 * @example
 * ```typescript
 * const wm = new WorkingMemory(10);
 * wm.set("currentTask", "Analyze security audit");
 * wm.set("lastToolResult", { status: "success" });
 *
 * const task = wm.get("currentTask");  // "Analyze security audit"
 * wm.clear();  // Task complete, clear context
 * ```
 */
export class WorkingMemory {
  /** Internal storage (LRU ordered) */
  private items: Map<string, WorkingMemoryEntry> = new Map();

  /**
   * Create working memory with capacity limit
   *
   * @param maxSize - Maximum items (default: 10, aligned with 7±2 items)
   */
  constructor(private readonly maxSize: number = AGENTS.MEMORY.WORKING.DEFAULT_CAPACITY) {
    if (maxSize < AGENTS.MEMORY.WORKING.MIN_CAPACITY) {
      throw new Error(`Working memory maxSize must be >= ${AGENTS.MEMORY.WORKING.MIN_CAPACITY}`);
    }
    if (maxSize > AGENTS.MEMORY.WORKING.MAX_CAPACITY) {
      throw new Error(`Working memory maxSize must be <= ${AGENTS.MEMORY.WORKING.MAX_CAPACITY}`);
    }
  }

  /**
   * Store value in working memory.
   * Evicts LRU item if at capacity.
   *
   * @param key - Unique key
   * @param value - Any serializable value
   */
  set(key: string, value: any): void {
    // If at capacity and key is new, evict LRU
    if (!this.items.has(key) && this.items.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Store entry (Map maintains insertion order)
    this.items.set(key, {
      value,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });
  }

  /**
   * Retrieve value from working memory.
   * Updates last accessed time.
   *
   * @param key - Key to retrieve
   * @returns Value or undefined if not found
   */
  get(key: string): any | undefined {
    const entry = this.items.get(key);
    if (!entry) return undefined;

    // Update access time
    entry.lastAccessedAt = new Date();

    // Move to end (most recently used) by deleting and re-inserting
    this.items.delete(key);
    this.items.set(key, entry);

    return entry.value;
  }

  /**
   * Check if key exists in working memory
   *
   * @param key - Key to check
   * @returns True if key exists
   */
  has(key: string): boolean {
    return this.items.has(key);
  }

  /**
   * Delete key from working memory
   *
   * @param key - Key to delete
   * @returns True if key existed
   */
  delete(key: string): boolean {
    return this.items.delete(key);
  }

  /**
   * Clear all items from working memory.
   * Used when task completes or agent resets.
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Get all keys currently in working memory
   *
   * @returns Array of keys (LRU order)
   */
  keys(): string[] {
    return Array.from(this.items.keys());
  }

  /**
   * Get current size (number of items)
   *
   * @returns Number of items in working memory
   */
  size(): number {
    return this.items.size;
  }

  /**
   * Get maximum capacity
   *
   * @returns Maximum number of items
   */
  capacity(): number {
    return this.maxSize;
  }

  /**
   * Check if working memory is at capacity
   *
   * @returns True if full
   */
  isFull(): boolean {
    return this.items.size >= this.maxSize;
  }

  /**
   * Get all entries as plain object (for debugging/serialization)
   *
   * @returns Object with all key-value pairs
   */
  toObject(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, entry] of this.items) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * Evict least recently used item.
   * Called automatically when at capacity.
   *
   * @private
   */
  private evictLeastRecentlyUsed(): void {
    // Map maintains insertion order, first key is LRU
    const lruKey = this.items.keys().next().value;
    if (lruKey !== undefined) {
      this.items.delete(lruKey);
    }
  }
}

/**
 * Create working memory with default settings
 *
 * @param maxSize - Maximum items (default: 10)
 * @returns New WorkingMemory instance
 */
export function createWorkingMemory(maxSize?: number): WorkingMemory {
  return new WorkingMemory(maxSize);
}
