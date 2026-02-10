import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  ENV_CLOSEDCLAW_STATE_DIR,
  ENV_ANTHROPIC_API_KEY,
  ENV_VITEST,
  ENV_CI,
  isCI,
  isTest,
  isLiveTest,
  getRunnerOS,
  isWindows,
  isMacOS,
  isLinux,
  ENV_CLOSEDCLAW_LIVE_TEST,
  ENV_GITHUB_ACTIONS,
  ENV_RUNNER_OS,
  ENV_NODE_ENV,
} from "./env-constants.js";

describe("env-constants", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constant definitions", () => {
    it("should define core environment variable names", () => {
      expect(ENV_CLOSEDCLAW_GATEWAY_PORT).toBe("ClosedClaw_GATEWAY_PORT");
      expect(ENV_CLOSEDCLAW_STATE_DIR).toBe("ClosedClaw_STATE_DIR");
    });

    it("should define provider API key names", () => {
      expect(ENV_ANTHROPIC_API_KEY).toBe("ANTHROPIC_API_KEY");
    });

    it("should define testing environment variable names", () => {
      expect(ENV_VITEST).toBe("VITEST");
      expect(ENV_CI).toBe("CI");
    });
  });

  describe("isCI()", () => {
    it("should return true when CI=true", () => {
      process.env[ENV_CI] = "true";
      expect(isCI()).toBe(true);
    });

    it("should return true when GITHUB_ACTIONS=true", () => {
      delete process.env[ENV_CI];
      process.env[ENV_GITHUB_ACTIONS] = "true";
      expect(isCI()).toBe(true);
    });

    it("should return false when neither CI nor GITHUB_ACTIONS is set", () => {
      delete process.env[ENV_CI];
      delete process.env[ENV_GITHUB_ACTIONS];
      expect(isCI()).toBe(false);
    });
  });

  describe("isTest()", () => {
    it("should return true when VITEST is set", () => {
      process.env[ENV_VITEST] = "true";
      expect(isTest()).toBe(true);
    });

    it("should return true when NODE_ENV=test", () => {
      delete process.env[ENV_VITEST];
      process.env[ENV_NODE_ENV] = "test";
      expect(isTest()).toBe(true);
    });

    it("should return false when neither VITEST nor NODE_ENV=test", () => {
      delete process.env[ENV_VITEST];
      process.env[ENV_NODE_ENV] = "development";
      expect(isTest()).toBe(false);
    });
  });

  describe("isLiveTest()", () => {
    it("should return true when ClosedClaw_LIVE_TEST is set", () => {
      process.env[ENV_CLOSEDCLAW_LIVE_TEST] = "1";
      expect(isLiveTest()).toBe(true);
    });

    it("should return false when ClosedClaw_LIVE_TEST is not set", () => {
      delete process.env[ENV_CLOSEDCLAW_LIVE_TEST];
      expect(isLiveTest()).toBe(false);
    });
  });

  describe("getRunnerOS()", () => {
    it("should return macOS when RUNNER_OS=macOS", () => {
      process.env[ENV_RUNNER_OS] = "macOS";
      expect(getRunnerOS()).toBe("macOS");
    });

    it("should return Windows when RUNNER_OS=Windows", () => {
      process.env[ENV_RUNNER_OS] = "Windows";
      expect(getRunnerOS()).toBe("Windows");
    });

    it("should return Linux when RUNNER_OS=Linux", () => {
      process.env[ENV_RUNNER_OS] = "Linux";
      expect(getRunnerOS()).toBe("Linux");
    });

    it("should fallback to platform detection when RUNNER_OS is not set", () => {
      delete process.env[ENV_RUNNER_OS];
      const result = getRunnerOS();
      expect(["macOS", "Windows", "Linux", "unknown"]).toContain(result);
    });
  });

  describe("platform detection", () => {
    it("should have consistent isWindows() result", () => {
      const result = isWindows();
      expect(typeof result).toBe("boolean");
    });

    it("should have consistent isMacOS() result", () => {
      const result = isMacOS();
      expect(typeof result).toBe("boolean");
    });

    it("should have consistent isLinux() result", () => {
      const result = isLinux();
      expect(typeof result).toBe("boolean");
    });

    it("should have exactly one platform as true", () => {
      const platforms = [isWindows(), isMacOS(), isLinux()];
      const trueCount = platforms.filter(Boolean).length;
      expect(trueCount).toBe(1);
    });
  });

  describe("type safety", () => {
    it("should have constant string literal types", () => {
      // TypeScript should enforce these as literal types, not just string
      const port: "ClosedClaw_GATEWAY_PORT" = ENV_CLOSEDCLAW_GATEWAY_PORT;
      expect(port).toBe("ClosedClaw_GATEWAY_PORT");
    });

    it("should work with process.env access", () => {
      process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] = "12345";
      expect(process.env[ENV_CLOSEDCLAW_GATEWAY_PORT]).toBe("12345");
    });
  });
});
