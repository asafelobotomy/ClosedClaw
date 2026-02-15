/**
 * Tests for audit query CLI commands.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stripAnsi } from "../terminal/ansi.js";
import type { Runtime } from "../runtime.js";
import { AuditLogger } from "../security/audit-logger.js";
import {
  auditQueryCommand,
  auditStatsCommand,
  auditExportCommand,
  auditVerifyCommand,
} from "./audit-query.js";

// Mock resolveStateDir to use temp directory
vi.mock("../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/paths.js")>();
  return {
    ...actual,
    resolveStateDir: vi.fn(),
  };
});

describe("audit query commands", () => {
  let tmpDir: string;
  let auditLogger: AuditLogger;
  let runtime: Runtime;
  let logOutput: string[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-query-test-"));
    const logPath = path.join(tmpDir, "audit.log");
    auditLogger = new AuditLogger(logPath);
    await auditLogger.init();

    // Mock resolveStateDir to return our temp directory
    const { resolveStateDir } = await import("../config/paths.js");
    vi.mocked(resolveStateDir).mockReturnValue(tmpDir);

    logOutput = [];
    runtime = {
      log: (msg: string) => {
        logOutput.push(msg);
      },
      error: (msg: string) => {
        logOutput.push(`ERROR: ${msg}`);
      },
    } as Runtime;
  });

  afterEach(async () => {
    await auditLogger.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("auditQueryCommand", () => {
    it("reports when no audit log exists", async () => {
      const nonExistentDir = path.join(tmpDir, "nonexistent");
      const { resolveStateDir } = await import("../config/paths.js");
      vi.mocked(resolveStateDir).mockReturnValue(nonExistentDir);

      const testRuntime = {
        ...runtime,
        log: (msg: string) => logOutput.push(msg),
      } as Runtime;

      await auditQueryCommand(testRuntime, {});

      expect(logOutput.some((l) => l.includes("not found"))).toBe(true);

      // Restore for other tests
      vi.mocked(resolveStateDir).mockReturnValue(tmpDir);
    });

    it("queries all entries", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Tool: bash | Command: echo hello",
        details: { tool: "bash", command: "echo hello" },
      });

      await auditLogger.log({
        type: "config_change",
        severity: "info",
        summary: "Config update: ~/.closedclaw/config.json5",
        details: { action: "update", path: "~/.closedclaw/config.json5" },
      });

      await auditQueryCommand(runtime, {});

      const output = logOutput.join("\n");
      expect(output).toMatch(/tool_exec/);
      expect(output).toMatch(/config_change/);
      expect(output).toMatch(/Showing 2 entries/);
    });

    it("filters by event type", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Tool: bash",
        details: {},
      });

      await auditLogger.log({
        type: "config_change",
        severity: "info",
        summary: "Config update",
        details: {},
      });

      await auditQueryCommand(runtime, { types: ["tool_exec"] });

      const output = logOutput.join("\n");
      expect(output).toMatch(/tool_exec/);
      expect(output).not.toMatch(/config_change/);
      expect(output).toMatch(/Showing 1 entry/);
    });

    it("filters by severity", async () => {
      await auditLogger.log({
        type: "security_alert",
        severity: "critical",
        summary: "Security alert",
        details: {},
      });

      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Tool exec",
        details: {},
      });

      await auditQueryCommand(runtime, { severities: ["critical"] });

      const output = logOutput.join("\n");
      expect(output).toMatch(/security_alert/);
      expect(output).not.toMatch(/tool_exec/);
    });

    it("filters by time range (relative)", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Old event",
        details: {},
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Recent event",
        details: {},
      });

      await auditQueryCommand(runtime, { since: "1s" });

      const output = logOutput.join("\n");
      // Both events should be recent enough
      expect(output).toMatch(/Showing/);
    });

    it("filters by actor", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "User tool",
        details: {},
        actor: "user:alice",
      });

      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "System tool",
        details: {},
        actor: "system",
      });

      await auditQueryCommand(runtime, { actor: "user:alice" });

      const output = logOutput.join("\n");
      expect(output).toMatch(/user:alice/);
      expect(output).not.toMatch(/system/);
    });

    it("returns JSON output", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test event",
        details: { foo: "bar" },
      });

      await auditQueryCommand(runtime, { json: true });

      const output = logOutput.join("\n");
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].summary).toBe("Test event");
    });

    it("limits results", async () => {
      for (let i = 0; i < 10; i++) {
        await auditLogger.log({
          type: "tool_exec",
          severity: "info",
          summary: `Event ${i}`,
          details: {},
        });
      }

      await auditQueryCommand(runtime, { limit: 5 });

      const output = logOutput.join("\n");
      expect(output).toMatch(/Showing 5 entries/);
    });

    it("reverses order", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "First",
        details: {},
      });

      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Second",
        details: {},
      });

      await auditQueryCommand(runtime, { reverse: true, json: true });

      const output = logOutput.join("\n");
      const parsed = JSON.parse(output);
      expect(parsed[0].summary).toBe("Second");
      expect(parsed[1].summary).toBe("First");
    });
  });

  describe("auditStatsCommand", () => {
    it("shows statistics", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Tool 1",
        details: {},
      });

      await auditLogger.log({
        type: "config_change",
        severity: "warn",
        summary: "Config 1",
        details: {},
      });

      await auditStatsCommand(runtime, {});

      const output = stripAnsi(logOutput.join("\n"));
      expect(output).toMatch(/Total entries:\s+2/);
      expect(output).toMatch(/By Event Type/);
      expect(output).toMatch(/tool_exec/);
      expect(output).toMatch(/config_change/);
    });

    it("verifies integrity", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test",
        details: {},
      });

      await auditStatsCommand(runtime, { verify: true });

      const output = logOutput.join("\n");
      expect(output).toMatch(/integrity verified/);
    });

    it("returns JSON output", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test",
        details: {},
      });

      await auditStatsCommand(runtime, { json: true });

      const output = logOutput.join("\n");
      const parsed = JSON.parse(output);
      expect(parsed.totalEntries).toBe(1);
      expect(parsed.byType).toHaveProperty("tool_exec");
    });
  });

  describe("auditExportCommand", () => {
    it("exports to CSV", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test event",
        details: { command: "echo hello" },
      });

      const exportPath = path.join(tmpDir, "export.csv");

      await auditExportCommand(runtime, { output: exportPath, format: "csv" });

      const content = await fs.readFile(exportPath, "utf-8");
      expect(content).toMatch(/seq,timestamp,type,severity,summary/);
      expect(content).toMatch(/tool_exec/);
      expect(content).toMatch(/Test event/);
    });

    it("exports to JSON", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test event",
        details: {},
      });

      const exportPath = path.join(tmpDir, "export.json");

      await auditExportCommand(runtime, { output: exportPath, format: "json" });

      const content = await fs.readFile(exportPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].summary).toBe("Test event");
    });

    it("filters during export", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Tool event",
        details: {},
      });

      await auditLogger.log({
        type: "config_change",
        severity: "info",
        summary: "Config event",
        details: {},
      });

      const exportPath = path.join(tmpDir, "export.json");

      await auditExportCommand(runtime, {
        output: exportPath,
        format: "json",
        types: ["tool_exec"],
      });

      const content = await fs.readFile(exportPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe("tool_exec");
    });
  });

  describe("auditVerifyCommand", () => {
    it("verifies valid log", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test",
        details: {},
      });

      await auditVerifyCommand(runtime, {});

      const output = logOutput.join("\n");
      expect(output).toMatch(/integrity verified/);
      expect(output).toMatch(/No tampering detected/);
    });

    it("returns JSON output", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test",
        details: {},
      });

      await auditVerifyCommand(runtime, { json: true });

      const output = logOutput.join("\n");
      const parsed = JSON.parse(output);
      expect(parsed.integrityOk).toBe(true);
    });

    it("detects tampering", async () => {
      await auditLogger.log({
        type: "tool_exec",
        severity: "info",
        summary: "Test",
        details: {},
      });

      await auditLogger.close();

      // Tamper with the log
      const logContent = await fs.readFile(auditLogger.getLogPath(), "utf-8");
      const tampered = logContent.replace("Test", "Tampered");
      await fs.writeFile(auditLogger.getLogPath(), tampered, "utf-8");

      // auditVerifyCommand calls process.exit(1) on tampered logs
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });
      try {
        await expect(auditVerifyCommand(runtime, {})).rejects.toThrow();
      } finally {
        exitSpy.mockRestore();
      }
    });
  });
});
