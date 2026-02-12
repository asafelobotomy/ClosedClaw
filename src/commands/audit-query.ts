/**
 * CLI commands for querying and analyzing the immutable audit log.
 *
 * Provides forensic-grade access to recorded security events with filtering,
 * export, and integrity verification capabilities.
 */

import type { RuntimeEnv as Runtime } from "../runtime.js";
import { resolveStateDir } from "../config/paths.js";
import {
  getAuditLogPath,
  getAuditLogStats,
  queryAuditLog,
  verifyAuditLogIntegrity,
  exportAuditLogAsCsv,
  type AuditEventType,
  type AuditSeverity,
  type AuditQueryOptions,
} from "../security/audit-logger.js";
import fs from "node:fs/promises";
import { theme } from "../terminal/theme.js";
import { formatTimestamp } from "../utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditQueryCommandOptions = {
  types?: string[];
  severities?: string[];
  since?: string;
  until?: string;
  actor?: string;
  session?: string;
  grep?: string;
  failedOnly?: boolean;
  limit?: number;
  reverse?: boolean;
  json?: boolean;
};

export type AuditStatsCommandOptions = {
  json?: boolean;
  verify?: boolean;
};

export type AuditExportCommandOptions = {
  output: string;
  format?: "csv" | "json";
  types?: string[];
  since?: string;
  until?: string;
};

export type AuditVerifyCommandOptions = {
  json?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEventTypes(types?: string[]): AuditEventType[] | undefined {
  if (!types || types.length === 0) {
    return undefined;
  }
  const validTypes = new Set<AuditEventType>([
    "tool_exec",
    "config_change",
    "skill_install",
    "skill_uninstall",
    "credential_access",
    "channel_send",
    "egress_blocked",
    "egress_allowed",
    "auth_event",
    "session_event",
    "security_alert",
    "gateway_event",
    "upstream_sync",
  ]);

  const result: AuditEventType[] = [];
  for (const t of types) {
    if (!validTypes.has(t as AuditEventType)) {
      throw new Error(`Invalid event type: ${t}. Valid types: ${Array.from(validTypes).join(", ")}`);
    }
    result.push(t as AuditEventType);
  }
  return result;
}

function parseSeverities(severities?: string[]): AuditSeverity[] | undefined {
  if (!severities || severities.length === 0) {
    return undefined;
  }
  const validSeverities = new Set<AuditSeverity>(["info", "warn", "error", "critical"]);

  const result: AuditSeverity[] = [];
  for (const s of severities) {
    if (!validSeverities.has(s as AuditSeverity)) {
      throw new Error(`Invalid severity: ${s}. Valid severities: ${Array.from(validSeverities).join(", ")}`);
    }
    result.push(s as AuditSeverity);
  }
  return result;
}

function parseTimeRange(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  // Try ISO 8601
  const isoDate = new Date(value);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try relative time (e.g., "1h", "30m", "2d")
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid time format: ${value}. Use ISO 8601 or relative time (e.g., 1h, 30m, 2d)`);
  }

  const [, amount, unit] = match;
  const now = new Date();
  const offset = Number.parseInt(amount, 10);

  switch (unit) {
    case "s":
      now.setSeconds(now.getSeconds() - offset);
      break;
    case "m":
      now.setMinutes(now.getMinutes() - offset);
      break;
    case "h":
      now.setHours(now.getHours() - offset);
      break;
    case "d":
      now.setDate(now.getDate() - offset);
      break;
  }

  return now;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Query audit log entries with filtering.
 */
export async function auditQueryCommand(
  runtime: Runtime,
  options: AuditQueryCommandOptions,
): Promise<void> {
  const logPath = getAuditLogPath(resolveStateDir());

  try {
    await fs.access(logPath);
  } catch {
    runtime.log(theme.error(`Audit log not found: ${logPath}`));
    runtime.log(theme.muted("No audit events have been recorded yet."));
    return;
  }

  const queryOpts: AuditQueryOptions = {
    types: parseEventTypes(options.types),
    severities: parseSeverities(options.severities),
    since: parseTimeRange(options.since),
    until: parseTimeRange(options.until),
    actor: options.actor,
    session: options.session,
    grep: options.grep,
    failedOnly: options.failedOnly,
    limit: options.limit,
    reverse: options.reverse,
  };

  const entries = await queryAuditLog(logPath, queryOpts);

  if (options.json) {
    runtime.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    runtime.log(theme.muted("No matching audit entries found."));
    return;
  }

  runtime.log(theme.heading(`Audit Log (${entries.length} entries)`));
  runtime.log("");

  for (const entry of entries) {
    const timestamp = formatTimestamp(new Date(entry.ts));
    const typeLabel = theme.accent(entry.type.padEnd(16));
    const sevLabel =
      entry.severity === "critical"
        ? theme.error("CRIT")
        : entry.severity === "error"
          ? theme.error("ERR ")
          : entry.severity === "warn"
            ? theme.warn("WARN")
            : theme.muted("INFO");

    runtime.log(`[${theme.muted(`#${entry.seq}`.padEnd(6))}] ${timestamp} ${sevLabel} ${typeLabel} ${entry.summary}`);

    if (entry.actor) {
      runtime.log(`  ${theme.muted("Actor:")} ${entry.actor}`);
    }
    if (entry.session) {
      runtime.log(`  ${theme.muted("Session:")} ${entry.session}`);
    }
    if (entry.channel) {
      runtime.log(`  ${theme.muted("Channel:")} ${entry.channel}`);
    }

    // Show key details
    if (Object.keys(entry.details).length > 0) {
      const detailKeys = Object.keys(entry.details).slice(0, 3);
      for (const key of detailKeys) {
        const value = entry.details[key];
        const valueStr =
          typeof value === "string"
            ? value.length > 60
              ? `${value.slice(0, 60)}…`
              : value
            : JSON.stringify(value);
        runtime.log(`  ${theme.muted(key + ":")} ${valueStr}`);
      }
      if (Object.keys(entry.details).length > 3) {
        runtime.log(`  ${theme.muted(`(${Object.keys(entry.details).length - 3} more fields)`)}`);
      }
    }

    runtime.log("");
  }

  runtime.log(theme.muted(`Showing ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`));
}

/**
 * Show audit log statistics.
 */
export async function auditStatsCommand(
  runtime: Runtime,
  options: AuditStatsCommandOptions,
): Promise<void> {
  const logPath = getAuditLogPath(resolveStateDir());

  try {
    await fs.access(logPath);
  } catch {
    runtime.log(theme.error(`Audit log not found: ${logPath}`));
    runtime.log(theme.muted("No audit events have been recorded yet."));
    return;
  }

  const stats = await getAuditLogStats(logPath);

  if (options.verify) {
    try {
      await verifyAuditLogIntegrity(logPath);
      if (options.json) {
        runtime.log(JSON.stringify({ ...stats, integrityOk: true }, null, 2));
      } else {
        runtime.log(theme.success("✓ Audit log integrity verified"));
      }
    } catch (err) {
      const error = err as Error;
      if (options.json) {
        runtime.log(
          JSON.stringify({ ...stats, integrityOk: false, integrityError: error.message }, null, 2),
        );
      } else {
        runtime.log(theme.error(`✗ Audit log integrity failure: ${error.message}`));
      }
      throw err;
    }
  }

  if (options.json) {
    runtime.log(JSON.stringify(stats, null, 2));
    return;
  }

  runtime.log(theme.heading("Audit Log Statistics"));
  runtime.log("");
  runtime.log(`${theme.muted("Log path:")} ${logPath}`);
  runtime.log(`${theme.muted("Total entries:")} ${stats.totalEntries}`);
  runtime.log(`${theme.muted("File size:")} ${formatFileSize(stats.fileSizeBytes)}`);

  if (stats.firstEntry) {
    runtime.log(`${theme.muted("First entry:")} ${formatTimestamp(new Date(stats.firstEntry))}`);
  }
  if (stats.lastEntry) {
    runtime.log(`${theme.muted("Last entry:")} ${formatTimestamp(new Date(stats.lastEntry))}`);
  }

  runtime.log("");
  runtime.log(theme.heading("By Event Type"));
  const typeEntries = Object.entries(stats.byType).toSorted((a, b) => b[1] - a[1]);
  for (const [type, count] of typeEntries) {
    runtime.log(`  ${type.padEnd(20)} ${count}`);
  }

  runtime.log("");
  runtime.log(theme.heading("By Severity"));
  const sevEntries = Object.entries(stats.bySeverity).toSorted((a, b) => {
    const sevOrder = { critical: 0, error: 1, warn: 2, info: 3 };
    return sevOrder[a[0] as keyof typeof sevOrder] - sevOrder[b[0] as keyof typeof sevOrder];
  });
  for (const [severity, count] of sevEntries) {
    const label =
      severity === "critical"
        ? theme.error("critical")
        : severity === "error"
          ? theme.error("error")
          : severity === "warn"
            ? theme.warn("warn")
            : theme.muted("info");
    runtime.log(`  ${label.padEnd(20)} ${count}`);
  }

  runtime.log("");
  runtime.log(theme.muted(`Integrity check: ${stats.integrityOk ? theme.success("✓ OK") : theme.error("✗ FAILED")}`));
}

/**
 * Export audit log entries to CSV or JSON.
 */
export async function auditExportCommand(
  runtime: Runtime,
  options: AuditExportCommandOptions,
): Promise<void> {
  const logPath = getAuditLogPath(resolveStateDir());

  try {
    await fs.access(logPath);
  } catch {
    runtime.log(theme.error(`Audit log not found: ${logPath}`));
    return;
  }

  const queryOpts: AuditQueryOptions = {
    types: parseEventTypes(options.types),
    since: parseTimeRange(options.since),
    until: parseTimeRange(options.until),
  };

  const entries = await queryAuditLog(logPath, queryOpts);

  if (entries.length === 0) {
    runtime.log(theme.warn("No matching entries to export."));
    return;
  }

  const format = options.format ?? "csv";
  let content: string;

  if (format === "csv") {
    content = exportAuditLogAsCsv(entries);
  } else {
    content = JSON.stringify(entries, null, 2);
  }

  await fs.writeFile(options.output, content, "utf-8");
  runtime.log(theme.success(`✓ Exported ${entries.length} entries to ${options.output}`));
}

/**
 * Verify audit log integrity.
 */
export async function auditVerifyCommand(
  runtime: Runtime,
  options: AuditVerifyCommandOptions,
): Promise<void> {
  const logPath = getAuditLogPath(resolveStateDir());

  try {
    await fs.access(logPath);
  } catch {
    runtime.log(theme.error(`Audit log not found: ${logPath}`));
    return;
  }

  const result = await verifyAuditLogIntegrity(logPath);

  if (result.ok) {
    if (options.json) {
      runtime.log(JSON.stringify({ integrityOk: true }, null, 2));
    } else {
      runtime.log(theme.success("✓ Audit log integrity verified"));
      runtime.log(theme.muted("All hash chains are valid. No tampering detected."));
    }
  } else {
    const errorMessage = result.failure?.message ?? "Unknown integrity error";
    if (options.json) {
      runtime.log(JSON.stringify({ integrityOk: false, error: errorMessage }, null, 2));
    } else {
      runtime.log(theme.error(`✗ Audit log integrity failure`));
      runtime.log(theme.error(errorMessage));
      runtime.log("");
      runtime.log(theme.warn("This may indicate:"));
      runtime.log("  • Manual modification of the audit log");
      runtime.log("  • Corruption due to filesystem issues");
      runtime.log("  • Incomplete write operations");
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
