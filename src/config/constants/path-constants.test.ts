import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import {
  STATE_DIRNAME,
  SUBDIRS,
  CONFIG_FILENAME_JSON5,
  getPathSeparator,
  getHomeEnvVar,
  getHomeDir,
  getStateDir,
  getSandboxesDir,
  getVoiceCallsDir,
  getMemoryDir,
  getLogsDir,
  getConfigPath,
  resolveUserPath,
  joinPaths,
  getRelativePath,
  normalizePath,
  GATEWAY_LOCK_FILENAME,
  getGatewayLockPath,
} from "./path-constants.js";

describe("path-constants", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constant definitions", () => {
    it("should define state directory name", () => {
      expect(STATE_DIRNAME).toBe(".ClosedClaw");
    });

    it("should define subdirectory names", () => {
      expect(SUBDIRS.SANDBOXES).toBe("sandboxes");
      expect(SUBDIRS.VOICE_CALLS).toBe("voice-calls");
      expect(SUBDIRS.MEMORY).toBe("memory");
      expect(SUBDIRS.LOGS).toBe("logs");
    });

    it("should define config filename", () => {
      expect(CONFIG_FILENAME_JSON5).toBe("config.json5");
    });

    it("should define lock filename", () => {
      expect(GATEWAY_LOCK_FILENAME).toBe("gateway.lock");
    });
  });

  describe("platform helpers", () => {
    it("should return platform-specific path separator", () => {
      const sep = getPathSeparator();
      expect(["/", "\\"]).toContain(sep);
    });

    it("should return platform-specific home env var", () => {
      const envVar = getHomeEnvVar();
      expect(["HOME", "USERPROFILE"]).toContain(envVar);
    });
  });

  describe("getHomeDir()", () => {
    it("should return home directory", () => {
      const home = getHomeDir();
      expect(home).toBe(os.homedir());
      expect(home.length).toBeGreaterThan(0);
    });
  });

  describe("getStateDir()", () => {
    it("should return default state directory", () => {
      delete process.env.ClosedClaw_STATE_DIR;
      const stateDir = getStateDir();
      expect(stateDir).toContain(".ClosedClaw");
    });

    it("should respect ClosedClaw_STATE_DIR override", () => {
      process.env.ClosedClaw_STATE_DIR = "/custom/path";
      const stateDir = getStateDir();
      expect(stateDir).toContain("custom");
    });

    it("should resolve tilde in override", () => {
      process.env.ClosedClaw_STATE_DIR = "~/custom";
      const stateDir = getStateDir();
      expect(stateDir).not.toContain("~");
      expect(stateDir).toContain("custom");
    });
  });

  describe("path builders", () => {
    it("should build sandboxes dir", () => {
      const dir = getSandboxesDir();
      expect(dir).toContain(".ClosedClaw");
      expect(dir).toContain("sandboxes");
    });

    it("should build voice calls dir", () => {
      const dir = getVoiceCallsDir();
      expect(dir).toContain(".ClosedClaw");
      expect(dir).toContain("voice-calls");
    });

    it("should build memory dir", () => {
      const dir = getMemoryDir();
      expect(dir).toContain(".ClosedClaw");
      expect(dir).toContain("workspace");
      expect(dir).toContain("memory");
    });

    it("should build logs dir", () => {
      const dir = getLogsDir();
      expect(dir).toContain(".ClosedClaw");
      expect(dir).toContain("logs");
    });

    it("should build config path", () => {
      const configPath = getConfigPath();
      expect(configPath).toContain(".ClosedClaw");
      expect(configPath).toContain("config.json5");
    });

    it("should respect config path override", () => {
      process.env.ClosedClaw_CONFIG_PATH = "/custom/config.json5";
      const configPath = getConfigPath();
      expect(configPath).toContain("custom");
    });

    it("should build gateway lock path", () => {
      const lockPath = getGatewayLockPath();
      expect(lockPath).toContain(".ClosedClaw");
      expect(lockPath).toContain("gateway.lock");
    });
  });

  describe("resolveUserPath()", () => {
    it("should resolve tilde to home directory", () => {
      const resolved = resolveUserPath("~/test");
      expect(resolved).not.toContain("~");
      expect(resolved).toContain("test");
    });

    it("should resolve relative paths", () => {
      const resolved = resolveUserPath("./test");
      expect(resolved).not.toContain("./");
      expect(resolved).toContain("test");
    });

    it("should handle absolute paths", () => {
      const resolved = resolveUserPath("/absolute/path");
      expect(resolved).toBe("/absolute/path");
    });

    it("should handle empty string", () => {
      const resolved = resolveUserPath("");
      expect(resolved).toBe("");
    });

    it("should trim whitespace", () => {
      const resolved = resolveUserPath("  ~/test  ");
      expect(resolved).not.toContain(" ");
    });
  });

  describe("path utilities", () => {
    it("should join paths", () => {
      const joined = joinPaths("a", "b", "c");
      expect(joined).toContain("a");
      expect(joined).toContain("b");
      expect(joined).toContain("c");
    });

    it("should get relative path", () => {
      const from = "/home/user";
      const to = "/home/user/documents";
      const relative = getRelativePath(from, to);
      expect(relative).toBe("documents");
    });

    it("should normalize paths", () => {
      const normalized = normalizePath("/a/b/../c");
      expect(normalized).not.toContain("..");
    });
  });

  describe("consistency checks", () => {
    it("should have consistent subdirectory structure", () => {
      const sandboxes = getSandboxesDir();
      const logs = getLogsDir();
      const stateDir = getStateDir();

      // All subdirs should be under state dir
      expect(sandboxes).toContain(stateDir);
      expect(logs).toContain(stateDir);
    });

    it("should respect state dir override in all builders", () => {
      process.env.ClosedClaw_STATE_DIR = "/custom";
      
      const stateDir = getStateDir();
      const sandboxes = getSandboxesDir();
      const logs = getLogsDir();

      expect(stateDir).toContain("custom");
      expect(sandboxes).toContain("custom");
      expect(logs).toContain("custom");
    });
  });
});
