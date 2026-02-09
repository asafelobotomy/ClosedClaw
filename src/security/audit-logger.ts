/**
 * Immutable append-only audit logging for ClosedClaw.
 *
 * Provides forensic-grade recording of all high-risk operations:
 * - Tool executions (shell commands, file writes, edits)
 * - Configuration changes
 * - Skill/plugin installations
 * - Credential access
 * - Channel message sends (optional)
 * - Egress policy violations
 *
 * **Format**: JSONL (one event per line) for streaming reads and append-only writes.
 * **Storage**: `~/.closedclaw/audit.log` with optional encryption overlay.
 * **Integrity**: SHA-256 hash chain for tamper detection.
 *
 * @see {@link /docs/security/audit-logging.md Audit Logging Documentation}
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Audit event types for categorization and filtering.
 */
export type AuditEventType =
  | "tool_exec" // Tool execution (shell, file ops)
  | "config_change" // Configuration modification
  | "skill_install" // Skill/plugin installation
  | "skill_uninstall" // Skill/plugin removal
  | "credential_access" // Credential read/write
  | "channel_send" // Outbound message (optional, can be noisy)
  | "egress_blocked" // Network egress violation
  | "egress_allowed" // Network egress allowed (if logging enabled)
  | "auth_event" // Authentication (login, logout, token refresh)
  | "session_event" // Session lifecycle (create, destroy)
  | "security_alert" // Security warnings (sandbox escape attempt, etc.)
  | "gateway_event" // Gateway start/stop/config reload
  | "upstream_sync"; // Upstream tracking events

/**
 * Severity levels for audit events.
 */
export type AuditSeverity = "info" | "warn" | "error" | "critical";

/**
 * A single immutable audit log entry.
 *
 * Each entry includes a hash of the previous entry for tamper detection.
 * The hash chain ensures log integrity even without encryption.
 */
export interface AuditEntry {
  /** Entry sequence number (monotonically increasing) */
  seq: number;

  /** ISO 8601 timestamp */
  ts: string;

  /** Event type for categorization */
  type: AuditEventType;

  /** Severity level */
  severity: AuditSeverity;

  /** Human-readable event summary */
  summary: string;

  /** Structured event details (type-dependent) */
  details: Record<string, unknown>;

  /** Agent or user that triggered the event */
  actor?: string;

  /** Session key (if applicable) */
  session?: string;

  /** Channel that the event is associated with */
  channel?: string;

  /** SHA-256 hash of the previous entry (hash chain) */
  prevHash: string;

  /** SHA-256 hash of this entry (computed from all fields except this one) */
  hash: string;
}

/**
 * Options for querying the audit log.
 */
export interface AuditQueryOptions {
  /** Filter by event type(s) */
  types?: AuditEventType[];

  /** Filter by severity level(s) */
  severities?: AuditSeverity[];

  /** Start of time range (ISO string or Date) */
  since?: string | Date;

  /** End of time range (ISO string or Date) */
  until?: string | Date;

  /** Filter by actor */
  actor?: string;

  /** Filter by session key pattern */
  session?: string;

  /** Grep pattern for summary/details */
  grep?: string;

  /** Only show failed/blocked events */
  failedOnly?: boolean;

  /** Maximum entries to return */
  limit?: number;

  /** Return entries in reverse order (newest first) */
  reverse?: boolean;
}

/**
 * Audit log statistics.
 */
export interface AuditLogStats {
  /** Total number of entries */
  totalEntries: number;

  /** File size in bytes */
  fileSizeBytes: number;

  /** First entry timestamp */
  firstEntry?: string;

  /** Last entry timestamp */
  lastEntry?: string;

  /** Count by event type */
  byType: Partial<Record<AuditEventType, number>>;

  /** Count by severity */
  bySeverity: Partial<Record<AuditSeverity, number>>;

  /** Hash chain integrity status */
  integrityOk: boolean;
}

/**
 * Custom error for audit log integrity failures.
 */
export class AuditIntegrityError extends Error {
  public readonly entrySeq: number;
  public readonly expectedHash: string;
  public readonly actualHash: string;

  constructor(entrySeq: number, expectedHash: string, actualHash: string) {
    super(
      `Audit log integrity failure at entry #${entrySeq}: ` +
        `expected hash ${expectedHash.slice(0, 12)}…, got ${actualHash.slice(0, 12)}…`,
    );
    this.name = "AuditIntegrityError";
    this.entrySeq = entrySeq;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Genesis hash (hash chain starts here) */
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Compute SHA-256 hash for an audit entry (excluding `hash` field).
 */
export function computeEntryHash(entry: Omit<AuditEntry, "hash">): string {
  const canonical = JSON.stringify({
    seq: entry.seq,
    ts: entry.ts,
    type: entry.type,
    severity: entry.severity,
    summary: entry.summary,
    details: entry.details,
    actor: entry.actor,
    session: entry.session,
    channel: entry.channel,
    prevHash: entry.prevHash,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Audit Logger
// ---------------------------------------------------------------------------

/**
 * Immutable append-only audit logger.
 *
 * Thread-safe via sequential write queue. Hash chain provides
 * tamper detection without requiring encryption.
 */
export class AuditLogger {
  private logPath: string;
  private writeStream: WriteStream | null = null;
  private lastHash: string = GENESIS_HASH;
  private lastSeq = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /**
   * Initialize the logger — read existing log to recover hash chain state.
   * Creates log file and parent directories if needed.
   */
  async init(): Promise<void> {
    const dir = path.dirname(this.logPath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    // Recover last hash from existing log
    try {
      const content = await fs.readFile(this.logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const lastEntry = JSON.parse(lastLine) as AuditEntry;
        this.lastHash = lastEntry.hash;
        this.lastSeq = lastEntry.seq;
      }
    } catch (err) {
      const error = err as { code?: string };
      if (error.code !== "ENOENT") {
        // Log exists but is corrupt — start fresh chain but preserve file
        this.lastHash = GENESIS_HASH;
        this.lastSeq = 0;
      }
    }

    // Open append-only write stream
    this.writeStream = createWriteStream(this.logPath, {
      flags: "a",
      encoding: "utf-8",
      mode: 0o600,
    });
  }

  /**
   * Append an audit event to the log.
   *
   * @param event - Event data (type, severity, summary, details, actor, session, channel)
   * @returns The complete audit entry with hash
   */
  async log(event: {
    type: AuditEventType;
    severity: AuditSeverity;
    summary: string;
    details?: Record<string, unknown>;
    actor?: string;
    session?: string;
    channel?: string;
  }): Promise<AuditEntry> {
    if (this.closed) {
      throw new Error("AuditLogger is closed");
    }

    // Serialize writes to maintain hash chain integrity
    const entry = await new Promise<AuditEntry>((resolve, reject) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          const seq = ++this.lastSeq;
          const partial: Omit<AuditEntry, "hash"> = {
            seq,
            ts: new Date().toISOString(),
            type: event.type,
            severity: event.severity,
            summary: event.summary,
            details: event.details ?? {},
            actor: event.actor,
            session: event.session,
            channel: event.channel,
            prevHash: this.lastHash,
          };

          const hash = computeEntryHash(partial);
          const fullEntry: AuditEntry = { ...partial, hash };

          // Append to file
          const line = JSON.stringify(fullEntry) + "\n";
          await new Promise<void>((res, rej) => {
            if (!this.writeStream) {
              rej(new Error("Write stream not initialized — call init() first"));
              return;
            }
            this.writeStream.write(line, (err) => {
              if (err) rej(err);
              else res();
            });
          });

          this.lastHash = hash;
          resolve(fullEntry);
        })
        .catch(reject);
    });

    return entry;
  }

  /**
   * Close the audit logger and flush pending writes.
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.writeQueue;
    if (this.writeStream) {
      await new Promise<void>((resolve, reject) => {
        this.writeStream!.end((err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.writeStream = null;
    }
  }

  /**
   * Get the path to the audit log file.
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Get current sequence number.
   */
  getLastSeq(): number {
    return this.lastSeq;
  }
}

// ---------------------------------------------------------------------------
// Query & Analysis
// ---------------------------------------------------------------------------

/**
 * Read and parse all entries from an audit log file.
 *
 * @param logPath - Path to the audit log
 * @returns Array of parsed entries
 */
export async function readAuditLog(logPath: string): Promise<AuditEntry[]> {
  try {
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as AuditEntry);
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * Query audit log entries with filtering.
 *
 * @param logPath - Path to the audit log
 * @param options - Query filter options
 * @returns Filtered entries
 */
export async function queryAuditLog(
  logPath: string,
  options: AuditQueryOptions = {},
): Promise<AuditEntry[]> {
  let entries = await readAuditLog(logPath);

  // Filter by type
  if (options.types && options.types.length > 0) {
    const typeSet = new Set(options.types);
    entries = entries.filter((e) => typeSet.has(e.type));
  }

  // Filter by severity
  if (options.severities && options.severities.length > 0) {
    const sevSet = new Set(options.severities);
    entries = entries.filter((e) => sevSet.has(e.severity));
  }

  // Filter by time range
  if (options.since) {
    const since = new Date(options.since).getTime();
    entries = entries.filter((e) => new Date(e.ts).getTime() >= since);
  }
  if (options.until) {
    const until = new Date(options.until).getTime();
    entries = entries.filter((e) => new Date(e.ts).getTime() <= until);
  }

  // Filter by actor
  if (options.actor) {
    entries = entries.filter((e) => e.actor === options.actor);
  }

  // Filter by session pattern
  if (options.session) {
    entries = entries.filter((e) => e.session?.includes(options.session!));
  }

  // Grep filter (search summary and stringified details)
  if (options.grep) {
    const pattern = options.grep.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.summary.toLowerCase().includes(pattern) ||
        JSON.stringify(e.details).toLowerCase().includes(pattern),
    );
  }

  // Failed only
  if (options.failedOnly) {
    entries = entries.filter(
      (e) =>
        e.severity === "error" ||
        e.severity === "critical" ||
        e.type === "egress_blocked" ||
        (e.details.result &&
          typeof e.details.result === "string" &&
          e.details.result.startsWith("blocked")),
    );
  }

  // Reverse order
  if (options.reverse) {
    entries.reverse();
  }

  // Limit
  if (options.limit && options.limit > 0) {
    entries = entries.slice(0, options.limit);
  }

  return entries;
}

/**
 * Verify the integrity of the audit log hash chain.
 *
 * @param logPath - Path to the audit log
 * @returns Object with integrity status and first failure (if any)
 */
export async function verifyAuditLogIntegrity(
  logPath: string,
): Promise<{ ok: boolean; entries: number; failure?: AuditIntegrityError }> {
  const entries = await readAuditLog(logPath);

  if (entries.length === 0) {
    return { ok: true, entries: 0 };
  }

  let prevHash = GENESIS_HASH;

  for (const entry of entries) {
    // Verify prevHash link
    if (entry.prevHash !== prevHash) {
      return {
        ok: false,
        entries: entries.length,
        failure: new AuditIntegrityError(entry.seq, prevHash, entry.prevHash),
      };
    }

    // Verify entry hash
    const { hash, ...rest } = entry;
    const computed = computeEntryHash(rest);
    if (computed !== hash) {
      return {
        ok: false,
        entries: entries.length,
        failure: new AuditIntegrityError(entry.seq, hash, computed),
      };
    }

    prevHash = hash;
  }

  return { ok: true, entries: entries.length };
}

/**
 * Compute statistics for the audit log.
 *
 * @param logPath - Path to the audit log
 * @returns Log statistics
 */
export async function getAuditLogStats(logPath: string): Promise<AuditLogStats> {
  const entries = await readAuditLog(logPath);
  const integrity = await verifyAuditLogIntegrity(logPath);

  let fileSizeBytes = 0;
  try {
    const stat = await fs.stat(logPath);
    fileSizeBytes = stat.size;
  } catch {
    // File doesn't exist
  }

  const byType: Partial<Record<AuditEventType, number>> = {};
  const bySeverity: Partial<Record<AuditSeverity, number>> = {};

  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;
  }

  return {
    totalEntries: entries.length,
    fileSizeBytes,
    firstEntry: entries.length > 0 ? entries[0].ts : undefined,
    lastEntry: entries.length > 0 ? entries[entries.length - 1].ts : undefined,
    byType,
    bySeverity,
    integrityOk: integrity.ok,
  };
}

// ---------------------------------------------------------------------------
// Default Paths
// ---------------------------------------------------------------------------

/**
 * Get the default audit log path.
 */
export function getAuditLogPath(stateDir?: string): string {
  const dir = stateDir ?? path.join(os.homedir(), ".closedclaw");
  return path.join(dir, "audit.log");
}

/**
 * Export audit log to CSV format.
 *
 * @param entries - Audit entries to export
 * @returns CSV string
 */
export function exportAuditLogAsCsv(entries: AuditEntry[]): string {
  const headers = ["seq", "timestamp", "type", "severity", "summary", "actor", "session", "details"];
  const rows = entries.map((e) => [
    String(e.seq),
    e.ts,
    e.type,
    e.severity,
    `"${e.summary.replace(/"/g, '""')}"`,
    e.actor ?? "",
    e.session ?? "",
    `"${JSON.stringify(e.details).replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}
