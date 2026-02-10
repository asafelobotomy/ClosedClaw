/**
 * Tests for audit hooks integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  logToolExecution,
  logConfigChange,
  logSkillInstall,
  logCredentialAccess,
  logChannelSend,
  logEgressBlocked,
  logAuthEvent,
  logSessionEvent,
  logSecurityAlert,
  logGatewayEvent,
  closeAuditLogger,
} from "../security/audit-hooks.js";
import { AuditLogger, getAuditLogPath, readAuditLog } from "../security/audit-logger.js";

describe("audit hooks", () => {
  let tmpDir: string;
  let auditLogPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-hooks-test-"));
    auditLogPath = path.join(tmpDir, "audit.log");

    // Mock resolveStateDir to use temp directory
    vi.mock("../config/paths.js", () => ({
      resolveStateDir: () => tmpDir,
    }));

    // Mock getAuditLogPath to use temp directory
    vi.mock("../security/audit-logger.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../security/audit-logger.js")>();
      return {
        ...actual,
        getAuditLogPath: () => auditLogPath,
      };
    });
  });

  afterEach(async () => {
    await closeAuditLogger();
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("logToolExecution", () => {
    it("logs successful tool execution", async () => {
      await logToolExecution({
        tool: "bash",
        command: "echo hello",
        result: "success",
        actor: "user:alice",
        session: "agent:main:whatsapp:dm:+1234567890",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("tool_exec");
      expect(entries[0].severity).toBe("info");
      expect(entries[0].summary).toContain("bash");
      expect(entries[0].summary).toContain("echo hello");
      expect(entries[0].details.tool).toBe("bash");
      expect(entries[0].details.command).toBe("echo hello");
      expect(entries[0].actor).toBe("user:alice");
      expect(entries[0].session).toBe("agent:main:whatsapp:dm:+1234567890");
    });

    it("logs failed tool execution with error", async () => {
      await logToolExecution({
        tool: "bash",
        command: "rm -rf /",
        result: "failure",
        error: "Permission denied",
        exitCode: 1,
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].severity).toBe("warn");
      expect(entries[0].details.result).toBe("failure");
      expect(entries[0].details.error).toBe("Permission denied");
      expect(entries[0].details.exitCode).toBe(1);
    });

    it("includes execution duration", async () => {
      await logToolExecution({
        tool: "bash",
        command: "sleep 1",
        result: "success",
        duration: 1234,
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.duration).toBe(1234);
    });
  });

  describe("logConfigChange", () => {
    it("logs config update", async () => {
      await logConfigChange({
        action: "update",
        path: "~/.closedclaw/config.json5",
        keys: ["gateway.port", "models.primary"],
        actor: "cli:configure",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("config_change");
      expect(entries[0].severity).toBe("info");
      expect(entries[0].summary).toContain("Config update");
      expect(entries[0].details.action).toBe("update");
      expect(entries[0].details.keys).toEqual(["gateway.port", "models.primary"]);
    });

    it("logs config creation", async () => {
      await logConfigChange({
        action: "create",
        path: "~/.closedclaw/config.json5",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.action).toBe("create");
    });

    it("logs config deletion", async () => {
      await logConfigChange({
        action: "delete",
        path: "~/.closedclaw/config.backup.json5",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.action).toBe("delete");
    });
  });

  describe("logSkillInstall", () => {
    it("logs verified skill installation", async () => {
      await logSkillInstall({
        skillId: "weather",
        skillPath: "~/.closedclaw/workspace/skills/weather/SKILL.md",
        action: "install",
        verified: true,
        signer: "publisher@example.com",
        actor: "cli:skills",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("skill_install");
      expect(entries[0].severity).toBe("info");
      expect(entries[0].summary).toContain("verified: yes");
      expect(entries[0].details.verified).toBe(true);
      expect(entries[0].details.signer).toBe("publisher@example.com");
    });

    it("logs unverified skill installation with warning", async () => {
      await logSkillInstall({
        skillId: "untrusted-skill",
        skillPath: "~/.closedclaw/workspace/skills/untrusted-skill/SKILL.md",
        action: "install",
        verified: false,
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].severity).toBe("warn");
      expect(entries[0].summary).toContain("verified: no");
      expect(entries[0].details.verified).toBe(false);
    });

    it("logs skill uninstallation", async () => {
      await logSkillInstall({
        skillId: "weather",
        skillPath: "~/.closedclaw/workspace/skills/weather/SKILL.md",
        action: "uninstall",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].type).toBe("skill_uninstall");
    });
  });

  describe("logCredentialAccess", () => {
    it("logs credential read", async () => {
      await logCredentialAccess({
        action: "read",
        service: "anthropic",
        account: "api-key-1",
        actor: "agent:main",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("credential_access");
      expect(entries[0].details.action).toBe("read");
      expect(entries[0].details.service).toBe("anthropic");
      expect(entries[0].details.account).toBe("api-key-1");
    });

    it("logs credential write", async () => {
      await logCredentialAccess({
        action: "write",
        service: "openai",
        account: "api-key-1",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.action).toBe("write");
    });

    it("logs credential deletion", async () => {
      await logCredentialAccess({
        action: "delete",
        service: "anthropic",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.action).toBe("delete");
    });
  });

  describe("logChannelSend", () => {
    it("logs message send", async () => {
      await logChannelSend({
        channel: "whatsapp",
        recipient: "+1234567890",
        messageType: "text",
        actor: "agent:main",
        session: "agent:main:whatsapp:dm:+1234567890",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("channel_send");
      expect(entries[0].channel).toBe("whatsapp");
      expect(entries[0].details.recipient).toBe("+1234567890");
      expect(entries[0].details.messageType).toBe("text");
    });
  });

  describe("logEgressBlocked", () => {
    it("logs blocked egress with reason", async () => {
      await logEgressBlocked({
        url: "https://malicious.com/data",
        reason: "Domain not in allowlist",
        actor: "agent:main",
        session: "agent:main:whatsapp:dm:+1234567890",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("egress_blocked");
      expect(entries[0].severity).toBe("warn");
      expect(entries[0].details.url).toBe("https://malicious.com/data");
      expect(entries[0].details.reason).toBe("Domain not in allowlist");
    });
  });

  describe("logAuthEvent", () => {
    it("logs login event", async () => {
      await logAuthEvent({
        action: "login",
        provider: "anthropic",
        account: "user@example.com",
        actor: "cli:auth",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("auth_event");
      expect(entries[0].details.action).toBe("login");
      expect(entries[0].details.provider).toBe("anthropic");
    });

    it("logs token refresh", async () => {
      await logAuthEvent({
        action: "token_refresh",
        provider: "anthropic",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.action).toBe("token_refresh");
    });
  });

  describe("logSessionEvent", () => {
    it("logs session creation", async () => {
      await logSessionEvent({
        action: "create",
        sessionKey: "agent:main:whatsapp:dm:+1234567890",
        actor: "gateway",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("session_event");
      expect(entries[0].details.action).toBe("create");
      expect(entries[0].session).toBe("agent:main:whatsapp:dm:+1234567890");
    });

    it("logs session timeout", async () => {
      await logSessionEvent({
        action: "timeout",
        sessionKey: "agent:main:whatsapp:dm:+1234567890",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].details.action).toBe("timeout");
    });
  });

  describe("logSecurityAlert", () => {
    it("logs critical security alerts", async () => {
      await logSecurityAlert({
        alert: "Potential sandbox escape attempt detected",
        details: {
          command: "../../etc/passwd",
          blocked: true,
        },
        actor: "agent:main",
        session: "agent:main:whatsapp:dm:+1234567890",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("security_alert");
      expect(entries[0].severity).toBe("critical");
      expect(entries[0].summary).toContain("sandbox escape");
      expect(entries[0].details.command).toBe("../../etc/passwd");
    });
  });

  describe("logGatewayEvent", () => {
    it("logs gateway start", async () => {
      await logGatewayEvent({
        action: "start",
        details: {
          port: 18789,
          version: "2026.2.1",
        },
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("gateway_event");
      expect(entries[0].severity).toBe("info");
      expect(entries[0].summary).toBe("Gateway start");
      expect(entries[0].details.port).toBe(18789);
    });

    it("logs gateway crash with error severity", async () => {
      await logGatewayEvent({
        action: "crash",
        details: {
          error: "Uncaught exception",
        },
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries[0].severity).toBe("error");
      expect(entries[0].summary).toBe("Gateway crash");
    });
  });

  describe("hash chain integrity", () => {
    it("maintains hash chain across multiple events", async () => {
      await logToolExecution({
        tool: "bash",
        command: "echo 1",
        result: "success",
      });

      await logConfigChange({
        action: "update",
        path: "config.json5",
      });

      await logSkillInstall({
        skillId: "test",
        skillPath: "/test/SKILL.md",
        action: "install",
      });

      const entries = await readAuditLog(auditLogPath);
      expect(entries).toHaveLength(3);

      // First entry should link to genesis
      expect(entries[0].prevHash).toBe("0000000000000000000000000000000000000000000000000000000000000000");

      // Second entry should link to first
      expect(entries[1].prevHash).toBe(entries[0].hash);

      // Third entry should link to second
      expect(entries[2].prevHash).toBe(entries[1].hash);
    });
  });

  describe("error handling", () => {
    it("gracefully handles audit logging failures", async () => {
      // Close the audit logger to simulate failure
      await closeAuditLogger();

      // Mock console.warn
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Should not throw
      await logToolExecution({
        tool: "bash",
        command: "test",
        result: "success",
      });

      warnSpy.mockRestore();
    });
  });
});
