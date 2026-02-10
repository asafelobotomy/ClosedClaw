/**
 * Tests for immutable audit logging.
 *
 * @see {@link ../audit-logger.ts}
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AuditLogger,
  computeEntryHash,
  readAuditLog,
  queryAuditLog,
  verifyAuditLogIntegrity,
  getAuditLogStats,
  getAuditLogPath,
  exportAuditLogAsCsv,
  AuditIntegrityError,
  type AuditEntry,
} from "./audit-logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let logPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-test-"));
  logPath = path.join(tmpDir, "audit.log");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// computeEntryHash
// ---------------------------------------------------------------------------

describe("computeEntryHash", () => {
  it("produces consistent hash for same input", () => {
    const entry = {
      seq: 1,
      ts: "2026-02-09T00:00:00.000Z",
      type: "tool_exec" as const,
      severity: "info" as const,
      summary: "test",
      details: {},
      prevHash: "0".repeat(64),
    };
    const hash1 = computeEntryHash(entry);
    const hash2 = computeEntryHash(entry);
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different input", () => {
    const base = {
      seq: 1,
      ts: "2026-02-09T00:00:00.000Z",
      type: "tool_exec" as const,
      severity: "info" as const,
      summary: "test",
      details: {},
      prevHash: "0".repeat(64),
    };
    const hash1 = computeEntryHash(base);
    const hash2 = computeEntryHash({ ...base, summary: "modified" });
    expect(hash1).not.toBe(hash2);
  });

  it("produces 64-char hex string", () => {
    const entry = {
      seq: 1,
      ts: "2026-02-09T00:00:00.000Z",
      type: "tool_exec" as const,
      severity: "info" as const,
      summary: "test",
      details: {},
      prevHash: "0".repeat(64),
    };
    const hash = computeEntryHash(entry);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash changes when prevHash changes", () => {
    const base = {
      seq: 1,
      ts: "2026-02-09T00:00:00.000Z",
      type: "tool_exec" as const,
      severity: "info" as const,
      summary: "test",
      details: {},
      prevHash: "0".repeat(64),
    };
    const hash1 = computeEntryHash(base);
    const hash2 = computeEntryHash({ ...base, prevHash: "1".repeat(64) });
    expect(hash1).not.toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// AuditLogger
// ---------------------------------------------------------------------------

describe("AuditLogger", () => {
  it("creates log file on init", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.close();

    // File may or may not exist (created on first write), but dir should be ok
    const dir = path.dirname(logPath);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("logs an event and writes to file", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();

    const entry = await logger.log({
      type: "tool_exec",
      severity: "info",
      summary: "Executed ls -la",
      details: { command: "ls -la", exitCode: 0 },
      actor: "main",
    });

    await logger.close();

    expect(entry.seq).toBe(1);
    expect(entry.type).toBe("tool_exec");
    expect(entry.summary).toBe("Executed ls -la");
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.prevHash).toBe("0".repeat(64)); // Genesis hash

    // Verify file contents
    const content = await fs.readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim()) as AuditEntry;
    expect(parsed.seq).toBe(1);
  });

  it("maintains sequence numbers", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();

    await logger.log({ type: "tool_exec", severity: "info", summary: "first" });
    await logger.log({ type: "config_change", severity: "warn", summary: "second" });
    const third = await logger.log({
      type: "security_alert",
      severity: "critical",
      summary: "third",
    });

    await logger.close();

    expect(third.seq).toBe(3);
    expect(logger.getLastSeq()).toBe(3);
  });

  it("builds hash chain across entries", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();

    const e1 = await logger.log({ type: "tool_exec", severity: "info", summary: "first" });
    const e2 = await logger.log({ type: "tool_exec", severity: "info", summary: "second" });
    const e3 = await logger.log({ type: "tool_exec", severity: "info", summary: "third" });

    await logger.close();

    expect(e1.prevHash).toBe("0".repeat(64));
    expect(e2.prevHash).toBe(e1.hash);
    expect(e3.prevHash).toBe(e2.hash);
  });

  it("recovers hash chain from existing log", async () => {
    // Write initial entries
    const logger1 = new AuditLogger(logPath);
    await logger1.init();
    const e1 = await logger1.log({ type: "tool_exec", severity: "info", summary: "first" });
    await logger1.close();

    // Reopen and continue
    const logger2 = new AuditLogger(logPath);
    await logger2.init();
    expect(logger2.getLastSeq()).toBe(1);

    const e2 = await logger2.log({ type: "tool_exec", severity: "info", summary: "second" });
    await logger2.close();

    expect(e2.prevHash).toBe(e1.hash);
    expect(e2.seq).toBe(2);
  });

  it("throws when logging after close", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.close();

    await expect(
      logger.log({ type: "tool_exec", severity: "info", summary: "late" }),
    ).rejects.toThrow("closed");
  });

  it("includes optional fields", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();

    const entry = await logger.log({
      type: "channel_send",
      severity: "info",
      summary: "Sent message to Telegram",
      details: { messageId: "abc123" },
      actor: "main",
      session: "agent:main:telegram:dm:12345",
      channel: "telegram",
    });

    await logger.close();

    expect(entry.actor).toBe("main");
    expect(entry.session).toBe("agent:main:telegram:dm:12345");
    expect(entry.channel).toBe("telegram");
  });

  it("handles concurrent writes safely", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();

    // Fire 10 concurrent writes
    const promises = Array.from({ length: 10 }, (_, i) =>
      logger.log({ type: "tool_exec", severity: "info", summary: `event-${i}` }),
    );

    const entries = await Promise.all(promises);
    await logger.close();

    // All should have unique seq numbers
    const seqs = entries.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(10);

    // Hash chain should be valid
    const integrity = await verifyAuditLogIntegrity(logPath);
    expect(integrity.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// readAuditLog
// ---------------------------------------------------------------------------

describe("readAuditLog", () => {
  it("returns empty array for non-existent file", async () => {
    const entries = await readAuditLog(path.join(tmpDir, "nonexistent.log"));
    expect(entries).toEqual([]);
  });

  it("parses all entries from log file", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({ type: "tool_exec", severity: "info", summary: "one" });
    await logger.log({ type: "config_change", severity: "warn", summary: "two" });
    await logger.close();

    const entries = await readAuditLog(logPath);
    expect(entries).toHaveLength(2);
    expect(entries[0].summary).toBe("one");
    expect(entries[1].summary).toBe("two");
  });
});

// ---------------------------------------------------------------------------
// queryAuditLog
// ---------------------------------------------------------------------------

describe("queryAuditLog", () => {
  beforeEach(async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({
      type: "tool_exec",
      severity: "info",
      summary: "ls command",
      actor: "main",
    });
    await logger.log({
      type: "config_change",
      severity: "warn",
      summary: "changed sandbox mode",
      actor: "admin",
    });
    await logger.log({
      type: "egress_blocked",
      severity: "error",
      summary: "blocked evil.com",
      details: { domain: "evil.com" },
      actor: "main",
    });
    await logger.log({
      type: "security_alert",
      severity: "critical",
      summary: "sandbox escape attempt",
      actor: "main",
      session: "agent:main:telegram:dm:12345",
    });
    await logger.close();
  });

  it("returns all entries with no filters", async () => {
    const entries = await queryAuditLog(logPath);
    expect(entries).toHaveLength(4);
  });

  it("filters by type", async () => {
    const entries = await queryAuditLog(logPath, { types: ["tool_exec"] });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_exec");
  });

  it("filters by multiple types", async () => {
    const entries = await queryAuditLog(logPath, {
      types: ["tool_exec", "config_change"],
    });
    expect(entries).toHaveLength(2);
  });

  it("filters by severity", async () => {
    const entries = await queryAuditLog(logPath, { severities: ["critical"] });
    expect(entries).toHaveLength(1);
    expect(entries[0].severity).toBe("critical");
  });

  it("filters by actor", async () => {
    const entries = await queryAuditLog(logPath, { actor: "admin" });
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toBe("admin");
  });

  it("filters by session pattern", async () => {
    const entries = await queryAuditLog(logPath, { session: "telegram" });
    expect(entries).toHaveLength(1);
  });

  it("filters by grep pattern", async () => {
    const entries = await queryAuditLog(logPath, { grep: "evil" });
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toContain("evil");
  });

  it("grep searches details too", async () => {
    const entries = await queryAuditLog(logPath, { grep: "evil.com" });
    expect(entries).toHaveLength(1);
  });

  it("filters failed only", async () => {
    const entries = await queryAuditLog(logPath, { failedOnly: true });
    expect(entries.length).toBeGreaterThanOrEqual(2); // error + critical
  });

  it("applies limit", async () => {
    const entries = await queryAuditLog(logPath, { limit: 2 });
    expect(entries).toHaveLength(2);
  });

  it("returns entries in reverse order", async () => {
    const entries = await queryAuditLog(logPath, { reverse: true });
    expect(entries[0].seq).toBeGreaterThan(entries[entries.length - 1].seq);
  });

  it("combines multiple filters", async () => {
    const entries = await queryAuditLog(logPath, {
      types: ["tool_exec", "egress_blocked"],
      actor: "main",
      limit: 5,
    });
    expect(entries).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// verifyAuditLogIntegrity
// ---------------------------------------------------------------------------

describe("verifyAuditLogIntegrity", () => {
  it("returns ok for empty log", async () => {
    const result = await verifyAuditLogIntegrity(path.join(tmpDir, "no.log"));
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(0);
  });

  it("returns ok for valid hash chain", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({ type: "tool_exec", severity: "info", summary: "one" });
    await logger.log({ type: "tool_exec", severity: "info", summary: "two" });
    await logger.log({ type: "tool_exec", severity: "info", summary: "three" });
    await logger.close();

    const result = await verifyAuditLogIntegrity(logPath);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(3);
  });

  it("detects tampered entry", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({ type: "tool_exec", severity: "info", summary: "original" });
    await logger.log({ type: "tool_exec", severity: "info", summary: "second" });
    await logger.close();

    // Tamper with the first entry
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const entry = JSON.parse(lines[0]) as AuditEntry;
    entry.summary = "TAMPERED";
    lines[0] = JSON.stringify(entry);
    await fs.writeFile(logPath, lines.join("\n") + "\n");

    const result = await verifyAuditLogIntegrity(logPath);
    expect(result.ok).toBe(false);
    expect(result.failure).toBeInstanceOf(AuditIntegrityError);
  });

  it("detects broken hash chain", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({ type: "tool_exec", severity: "info", summary: "one" });
    await logger.log({ type: "tool_exec", severity: "info", summary: "two" });
    await logger.close();

    // Break the chain by modifying prevHash of second entry
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const entry2 = JSON.parse(lines[1]) as AuditEntry;
    entry2.prevHash = "bad".repeat(21) + "0";
    lines[1] = JSON.stringify(entry2);
    await fs.writeFile(logPath, lines.join("\n") + "\n");

    const result = await verifyAuditLogIntegrity(logPath);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAuditLogStats
// ---------------------------------------------------------------------------

describe("getAuditLogStats", () => {
  it("returns zero stats for empty log", async () => {
    const stats = await getAuditLogStats(path.join(tmpDir, "no.log"));
    expect(stats.totalEntries).toBe(0);
    expect(stats.integrityOk).toBe(true);
  });

  it("computes correct statistics", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({ type: "tool_exec", severity: "info", summary: "one" });
    await logger.log({ type: "tool_exec", severity: "warn", summary: "two" });
    await logger.log({ type: "config_change", severity: "info", summary: "three" });
    await logger.close();

    const stats = await getAuditLogStats(logPath);
    expect(stats.totalEntries).toBe(3);
    expect(stats.fileSizeBytes).toBeGreaterThan(0);
    expect(stats.firstEntry).toBeDefined();
    expect(stats.lastEntry).toBeDefined();
    expect(stats.byType.tool_exec).toBe(2);
    expect(stats.byType.config_change).toBe(1);
    expect(stats.bySeverity.info).toBe(2);
    expect(stats.bySeverity.warn).toBe(1);
    expect(stats.integrityOk).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAuditLogPath
// ---------------------------------------------------------------------------

describe("getAuditLogPath", () => {
  it("uses default state directory", () => {
    const p = getAuditLogPath();
    expect(p).toContain(".ClosedClaw");
    expect(p).toContain("audit.log");
  });

  it("uses custom state directory", () => {
    const p = getAuditLogPath("/custom/dir");
    expect(p).toBe("/custom/dir/audit.log");
  });
});

// ---------------------------------------------------------------------------
// exportAuditLogAsCsv
// ---------------------------------------------------------------------------

describe("exportAuditLogAsCsv", () => {
  it("produces CSV with headers", () => {
    const csv = exportAuditLogAsCsv([]);
    expect(csv).toContain("seq,timestamp,type,severity,summary,actor,session,details");
  });

  it("exports entries as CSV rows", async () => {
    const logger = new AuditLogger(logPath);
    await logger.init();
    await logger.log({
      type: "tool_exec",
      severity: "info",
      summary: "ran ls",
      actor: "main",
    });
    await logger.close();

    const entries = await readAuditLog(logPath);
    const csv = exportAuditLogAsCsv(entries);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain("tool_exec");
    expect(lines[1]).toContain("main");
  });

  it("escapes quotes in summary", () => {
    const entries: AuditEntry[] = [
      {
        seq: 1,
        ts: "2026-02-09T00:00:00Z",
        type: "tool_exec",
        severity: "info",
        summary: 'command with "quotes"',
        details: {},
        prevHash: "0".repeat(64),
        hash: "a".repeat(64),
      },
    ];
    const csv = exportAuditLogAsCsv(entries);
    expect(csv).toContain('""quotes""');
  });
});

// ---------------------------------------------------------------------------
// AuditIntegrityError
// ---------------------------------------------------------------------------

describe("AuditIntegrityError", () => {
  it("includes entry seq and hashes", () => {
    const err = new AuditIntegrityError(5, "expected123", "actual456");
    expect(err.entrySeq).toBe(5);
    expect(err.expectedHash).toBe("expected123");
    expect(err.actualHash).toBe("actual456");
    expect(err.name).toBe("AuditIntegrityError");
    expect(err.message).toContain("#5");
  });
});
