/**
 * TPC Nonce Store
 *
 * Tracks message nonces to prevent replay attacks.
 * Uses a JSON file backed store with periodic pruning.
 *
 * Each nonce is stored with its timestamp. Nonces older than
 * the configured TTL are pruned automatically.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NonceStoreConfig {
  /** Path to the nonce store file */
  storePath: string;
  /** TTL for nonces in seconds (default: 3600 = 1 hour) */
  nonceTtlSeconds: number;
  /** Maximum entries before forced pruning (default: 10000) */
  maxEntries: number;
}

interface NonceEntry {
  /** Unix timestamp (seconds) when the nonce was first seen */
  ts: number;
}

interface NonceStoreData {
  /** Map of nonce → entry */
  nonces: Record<string, NonceEntry>;
  /** Last prune timestamp */
  lastPrune: number;
}

// ---------------------------------------------------------------------------
// Nonce Store
// ---------------------------------------------------------------------------

export class NonceStore {
  private readonly config: NonceStoreConfig;
  private readonly resolvedPath: string;
  private data: NonceStoreData;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: NonceStoreConfig) {
    this.config = config;
    this.resolvedPath = NonceStore.resolvePath(config.storePath);
    this.data = this.load();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Check if a nonce has been seen before. If not, record it.
   * Returns true if the nonce is unique (first time seen).
   * Returns false if the nonce is a replay (seen before).
   */
  checkAndRecord(nonce: string): boolean {
    // Prune if needed
    this.pruneIfNeeded();

    // Check for replay
    if (this.data.nonces[nonce] !== undefined) {
      return false; // Replay detected
    }

    // Record the nonce
    const now = Math.floor(Date.now() / 1000);
    this.data.nonces[nonce] = { ts: now };
    this.dirty = true;
    this.scheduleSave();

    return true; // Unique nonce
  }

  /**
   * Check if a nonce exists without recording it.
   */
  has(nonce: string): boolean {
    return this.data.nonces[nonce] !== undefined;
  }

  /**
   * Get the number of stored nonces.
   */
  size(): number {
    return Object.keys(this.data.nonces).length;
  }

  /**
   * Force an immediate save to disk.
   */
  async flush(): Promise<void> {
    if (this.dirty) {
      this.save();
      this.dirty = false;
    }
  }

  /**
   * Force prune expired nonces now.
   */
  prune(): number {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - this.config.nonceTtlSeconds;

    let removed = 0;
    const nonces = this.data.nonces;
    for (const [nonce, entry] of Object.entries(nonces)) {
      if (entry.ts <= cutoff) {
        delete nonces[nonce];
        removed++;
      }
    }

    this.data.lastPrune = now;
    if (removed > 0) {
      this.dirty = true;
      this.scheduleSave();
    }

    return removed;
  }

  /**
   * Clear all nonces. Use for testing or emergency recovery.
   */
  clear(): void {
    this.data = { nonces: {}, lastPrune: Math.floor(Date.now() / 1000) };
    this.dirty = true;
    this.save();
  }

  /**
   * Stop the save timer and flush pending changes.
   */
  async close(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flush();
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private load(): NonceStoreData {
    try {
      if (fs.existsSync(this.resolvedPath)) {
        const raw = fs.readFileSync(this.resolvedPath, "utf-8");
        const parsed = JSON.parse(raw) as NonceStoreData;
        if (parsed.nonces && typeof parsed.lastPrune === "number") {
          return parsed;
        }
      }
    } catch {
      // Corrupted file — start fresh
    }

    return { nonces: {}, lastPrune: Math.floor(Date.now() / 1000) };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.resolvedPath);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

      const json = JSON.stringify(this.data);
      const tempPath = `${this.resolvedPath}.tmp`;
      fs.writeFileSync(tempPath, json, { mode: 0o600 });
      fs.renameSync(tempPath, this.resolvedPath);
    } catch {
      // Swallow write errors — nonce store is best-effort
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      return;
    }
    // Debounce saves: write at most once per second
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        this.save();
        this.dirty = false;
      }
    }, 1000);
  }

  private pruneIfNeeded(): void {
    const now = Math.floor(Date.now() / 1000);
    const size = this.size();

    // Prune if over max entries or if it's been > 5 minutes since last prune
    if (size > this.config.maxEntries || now - this.data.lastPrune > 300) {
      this.prune();
    }
  }

  static resolvePath(p: string): string {
    if (p.startsWith("~/")) {
      return path.join(process.env.HOME ?? "/tmp", p.slice(2));
    }
    return p;
  }
}
