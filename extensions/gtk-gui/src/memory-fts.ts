/**
 * SQLite FTS5 Memory Store for GTK GUI Lite Mode
 *
 * Replaces JSON-file scanning in recall_notes with indexed full-text search.
 * Uses node:sqlite (built-in, no npm dep). Falls back to JSON if sqlite unavailable.
 *
 * Schema:
 *   facts(id, type, content, entities, confidence, timestamp, day)
 *   facts_fts(content, entities)  — FTS5 virtual table
 */

import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FactType = "W" | "B" | "O" | "S";

export interface StoredFact {
  id: number;
  type: FactType;
  content: string;
  entities: string[];
  confidence: number | null;
  timestamp: string;
  day: string;
}

export interface SearchResult {
  fact: StoredFact;
  rank?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════

const MEMORY_DIR = join(homedir(), ".closedclaw", "workspace", "memory");
const DB_PATH = join(MEMORY_DIR, "facts.db");

let _db: InstanceType<typeof import("node:sqlite").DatabaseSync> | null = null;
let _unavailable = false;

/**
 * Lazily open (or create) the FTS5-backed database.
 * Returns null if node:sqlite is not available on this runtime.
 */
export function getDatabase(): InstanceType<typeof import("node:sqlite").DatabaseSync> | null {
  if (_db) return _db;
  if (_unavailable) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    mkdirSync(MEMORY_DIR, { recursive: true });
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode=WAL");
    _db.exec("PRAGMA synchronous=NORMAL");
    initSchema(_db);
    return _db;
  } catch {
    _unavailable = true;
    return null;
  }
}

/**
 * Open an in-memory database (for testing).
 */
export function getInMemoryDatabase(): InstanceType<typeof import("node:sqlite").DatabaseSync> {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  return db;
}

function initSchema(db: InstanceType<typeof import("node:sqlite").DatabaseSync>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL CHECK(type IN ('W','B','O','S')),
      content     TEXT NOT NULL,
      entities    TEXT NOT NULL DEFAULT '[]',
      confidence  REAL,
      timestamp   TEXT NOT NULL,
      day         TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_day ON facts(day)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_timestamp ON facts(timestamp)`);

  // FTS5 index for full-text search
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
        content,
        entities,
        content=facts,
        content_rowid=id
      )
    `);
    // Triggers to keep FTS in sync
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, content, entities)
        VALUES (new.id, new.content, new.entities);
      END
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content, entities)
        VALUES ('delete', old.id, old.content, old.entities);
      END
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content, entities)
        VALUES ('delete', old.id, old.content, old.entities);
        INSERT INTO facts_fts(rowid, content, entities)
        VALUES (new.id, new.content, new.entities);
      END
    `);
  } catch {
    // FTS5 not available — full-text search degrades to LIKE
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert a fact into the database. Returns the rowid.
 */
export function insertFact(
  db: InstanceType<typeof import("node:sqlite").DatabaseSync>,
  fact: {
    type: FactType;
    content: string;
    entities: string[];
    confidence?: number | null;
    timestamp?: string;
  },
): number {
  const now = fact.timestamp ?? new Date().toISOString();
  const day = now.slice(0, 10);
  const entitiesJson = JSON.stringify(fact.entities);

  const stmt = db.prepare(`
    INSERT INTO facts (type, content, entities, confidence, timestamp, day)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    fact.type,
    fact.content,
    entitiesJson,
    fact.confidence ?? null,
    now,
    day,
  );
  return Number(result.lastInsertRowid);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full-text search with entity/type/time filters.
 */
export function searchFacts(
  db: InstanceType<typeof import("node:sqlite").DatabaseSync>,
  opts: {
    query?: string;
    entity?: string;
    type?: FactType;
    since?: string; // "7d" or "2026-02-01"
    limit?: number;
  } = {},
): SearchResult[] {
  const limit = opts.limit ?? 50;
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Type filter
  if (opts.type && ["W", "B", "O", "S"].includes(opts.type)) {
    conditions.push("f.type = ?");
    params.push(opts.type);
  }

  // Entity filter
  if (opts.entity) {
    // Search in the JSON array
    conditions.push("f.entities LIKE ?");
    params.push(`%"${opts.entity}"%`);
  }

  // Time filter
  if (opts.since) {
    const sinceStr = opts.since.trim();
    const daysMatch = sinceStr.match(/^(\d+)d$/);
    if (daysMatch) {
      const cutoff = new Date(Date.now() - Number.parseInt(daysMatch[1], 10) * 86400000);
      conditions.push("f.timestamp >= ?");
      params.push(cutoff.toISOString());
    } else {
      conditions.push("f.day >= ?");
      params.push(sinceStr);
    }
  }

  // Full-text search via FTS5
  if (opts.query) {
    const hasFts = hasFtsTable(db);
    if (hasFts) {
      // Use FTS5 with rank
      const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
      const sql = `
        SELECT f.*, rank
        FROM facts_fts fts
        JOIN facts f ON f.id = fts.rowid
        WHERE facts_fts MATCH ?
        ${where}
        ORDER BY rank
        LIMIT ?
      `;
      params.unshift(sanitizeFtsQuery(opts.query));
      params.push(limit);
      try {
        const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
        return rows.map(rowToResult);
      } catch {
        // FTS query failed — fall through to LIKE
      }
    }

    // Fallback: LIKE search
    conditions.push("f.content LIKE ?");
    params.push(`%${opts.query}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT f.* FROM facts f ${where} ORDER BY f.timestamp DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToResult);
}

/**
 * Get all facts for a specific entity (for reflect).
 */
export function getFactsByEntity(
  db: InstanceType<typeof import("node:sqlite").DatabaseSync>,
  entity: string,
): StoredFact[] {
  const rows = db
    .prepare(`SELECT * FROM facts WHERE entities LIKE ? ORDER BY timestamp`)
    .all(`%"${entity}"%`) as Array<Record<string, unknown>>;
  return rows.map((r) => rowToResult(r).fact);
}

/**
 * Get unique entities across all facts.
 */
export function getAllEntities(
  db: InstanceType<typeof import("node:sqlite").DatabaseSync>,
): string[] {
  const rows = db
    .prepare("SELECT DISTINCT entities FROM facts")
    .all() as Array<{ entities: string }>;
  const entitySet = new Set<string>();
  for (const row of rows) {
    try {
      const arr = JSON.parse(row.entities) as string[];
      for (const e of arr) entitySet.add(e);
    } catch {}
  }
  return [...entitySet].sort();
}

/**
 * Get fact count and date range stats.
 */
export function getStats(
  db: InstanceType<typeof import("node:sqlite").DatabaseSync>,
): { total: number; byType: Record<string, number>; earliest?: string; latest?: string } {
  const total = (
    db.prepare("SELECT COUNT(*) as cnt FROM facts").get() as { cnt: number }
  ).cnt;

  const byType: Record<string, number> = {};
  const typeRows = db
    .prepare("SELECT type, COUNT(*) as cnt FROM facts GROUP BY type")
    .all() as Array<{ type: string; cnt: number }>;
  for (const r of typeRows) byType[r.type] = r.cnt;

  const range = db
    .prepare("SELECT MIN(day) as earliest, MAX(day) as latest FROM facts")
    .get() as { earliest: string | null; latest: string | null };

  return {
    total,
    byType,
    earliest: range.earliest ?? undefined,
    latest: range.latest ?? undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT / MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Import facts from the existing MemoryIndex JSON into SQLite.
 * Idempotent: skips facts that already exist (by content + timestamp match).
 */
export function importFromIndex(
  db: InstanceType<typeof import("node:sqlite").DatabaseSync>,
  facts: Array<{
    type: FactType;
    content: string;
    entities: string[];
    confidence?: number | null;
    timestamp: string;
  }>,
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  const checkStmt = db.prepare(
    "SELECT id FROM facts WHERE content = ? AND timestamp = ?",
  );
  const insertStmt = db.prepare(`
    INSERT INTO facts (type, content, entities, confidence, timestamp, day)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN TRANSACTION");
  try {
    for (const f of facts) {
      const existing = checkStmt.get(f.content, f.timestamp);
      if (existing) {
        skipped++;
        continue;
      }
      insertStmt.run(
        f.type,
        f.content,
        JSON.stringify(f.entities),
        f.confidence ?? null,
        f.timestamp,
        f.timestamp.slice(0, 10),
      );
      imported++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { imported, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function hasFtsTable(db: InstanceType<typeof import("node:sqlite").DatabaseSync>): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts_fts'")
      .get() as { name: string } | undefined;
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Sanitize FTS5 query — escape special chars, handle simple keyword search.
 */
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 operator characters that might cause syntax errors
  let clean = query.replace(/[*():^"]/g, "");
  // If multiple words, wrap each as a term (implicit AND)
  const words = clean
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w}"`)
    .join(" ");
  return words || clean;
}

function rowToResult(row: Record<string, unknown>): SearchResult {
  let entities: string[] = [];
  try {
    entities = JSON.parse(String(row.entities ?? "[]"));
  } catch {}

  return {
    fact: {
      id: Number(row.id),
      type: String(row.type) as FactType,
      content: String(row.content),
      entities,
      confidence: row.confidence != null ? Number(row.confidence) : null,
      timestamp: String(row.timestamp),
      day: String(row.day),
    },
    rank: row.rank != null ? Number(row.rank) : undefined,
  };
}
