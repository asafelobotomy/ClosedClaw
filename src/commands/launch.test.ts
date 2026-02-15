import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => "");
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockOpenSync = vi.fn(() => 3);
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    openSync: (...args: unknown[]) => mockOpenSync(...args),
  };
});

const mockSpawn = vi.fn(() => ({
  pid: 12345,
  unref: vi.fn(),
  on: vi.fn(),
  kill: vi.fn(),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
  };
});

const mockReadConfigFileSnapshot = vi.fn(async () => ({
  valid: true,
  config: {},
  issues: [],
  legacyIssues: [],
  path: "/tmp/cfg.json5",
}));
const mockResolveGatewayPort = vi.fn(() => 18789);
const mockResolveStateDir = vi.fn(() => "/tmp/test-state");
vi.mock("../config/config.js", () => ({
  readConfigFileSnapshot: (...args: unknown[]) => mockReadConfigFileSnapshot(...args),
  resolveGatewayPort: (...args: unknown[]) => mockResolveGatewayPort(...args),
  resolveStateDir: (...args: unknown[]) => mockResolveStateDir(...args),
}));

const mockIsGatewayRunning = vi.fn(async () => false);
const mockWaitForGatewayReady = vi.fn(async () => ({ ok: true, elapsedMs: 150 }));
vi.mock("../gateway/readiness.js", () => ({
  isGatewayRunning: (...args: unknown[]) => mockIsGatewayRunning(...args),
  waitForGatewayReady: (...args: unknown[]) => mockWaitForGatewayReady(...args),
}));

const mockEnsureGatewayToken = vi.fn(async () => ({
  token: "test-token-abc",
  source: "config" as const,
}));
vi.mock("./token.js", () => ({
  ensureGatewayToken: (...args: unknown[]) => mockEnsureGatewayToken(...args),
}));

import { launchCommand, type LaunchOptions } from "./launch.js";
import type { RuntimeEnv } from "../runtime.js";

function makeRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    env: {},
  } as unknown as RuntimeEnv;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("launchCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    // Default: no existing files
    mockExistsSync.mockReturnValue(false);
    // Default mock behaviors
    mockReadConfigFileSnapshot.mockResolvedValue({
      valid: true,
      config: {},
      issues: [],
      legacyIssues: [],
      path: "/tmp/cfg.json5",
    });
    mockResolveGatewayPort.mockReturnValue(18789);
    mockResolveStateDir.mockReturnValue("/tmp/test-state");
    mockEnsureGatewayToken.mockResolvedValue({
      token: "test-token-abc",
      source: "config" as const,
    });
    mockIsGatewayRunning.mockResolvedValue(false);
    mockWaitForGatewayReady.mockResolvedValue({ ok: true, elapsedMs: 150 });
    mockSpawn.mockReturnValue({
      pid: 12345,
      unref: vi.fn(),
      on: vi.fn(),
      kill: vi.fn(),
    });
  });

  it("ensures a token before anything else", async () => {
    const rt = makeRuntime();
    // guiOnly + gateway already running => minimal path but token must be called
    mockIsGatewayRunning.mockResolvedValueOnce(true);
    // GUI not found → will error, but token should have been called first
    await launchCommand(rt, { gatewayOnly: true });
    expect(mockEnsureGatewayToken).toHaveBeenCalledTimes(1);
  });

  it("skips gateway start when gateway is already running", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(true);
    await launchCommand(rt, { gatewayOnly: true });
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("already running"));
    // spawn should NOT have been called for the gateway
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("starts gateway and waits for readiness", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(false);
    // Let existsSync find the gateway entry script
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === "string" && String(p).endsWith("closedclaw.mjs"),
    );
    await launchCommand(rt, { gatewayOnly: true, verbose: true });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockWaitForGatewayReady).toHaveBeenCalledTimes(1);
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("Gateway ready"));
  });

  it("exits with error when gateway does not become ready", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(false);
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === "string" && String(p).endsWith("closedclaw.mjs"),
    );
    mockWaitForGatewayReady.mockResolvedValueOnce({
      ok: false,
      elapsedMs: 15000,
      error: "Timed out",
    });
    await launchCommand(rt, { gatewayOnly: true });
    expect(rt.error).toHaveBeenCalledWith(expect.stringContaining("Timed out"));
    expect(rt.exit).toHaveBeenCalledWith(1);
  });

  it("errors if GUI script not found", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(false);
    await launchCommand(rt, { guiOnly: true });
    expect(rt.error).toHaveBeenCalledWith(expect.stringContaining("GTK GUI script not found"));
    expect(rt.exit).toHaveBeenCalledWith(1);
  });

  it("launches GTK GUI with correct env vars when script exists", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(true);
    // The first call is for gui path resolution; make one candidate match
    mockExistsSync.mockImplementation((p: unknown) => {
      return typeof p === "string" && String(p).includes("closedclaw_messenger.py");
    });
    await launchCommand(rt, { guiOnly: true, port: 19000 });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnCall = mockSpawn.mock.calls[0];
    expect(spawnCall[0]).toBe("python3");
    const envArg = (spawnCall[2] as any).env as Record<string, string>;
    expect(envArg.ClosedClaw_GATEWAY_PORT).toBe("19000");
    expect(envArg.ClosedClaw_GATEWAY_TOKEN).toBe("test-token-abc");
    expect(envArg.GSK_RENDERER).toBe("cairo");
  });

  it("uses custom port from options", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(true);
    await launchCommand(rt, { gatewayOnly: true, port: 19001 });
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("19001"));
  });

  it("verbose mode logs token source", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(true);
    await launchCommand(rt, { gatewayOnly: true, verbose: true });
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("Token source"));
  });

  it("verbose mode logs PID when starting gateway", async () => {
    const rt = makeRuntime();
    mockIsGatewayRunning.mockResolvedValueOnce(false);
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === "string" && String(p).endsWith("closedclaw.mjs"),
    );
    await launchCommand(rt, { gatewayOnly: true, verbose: true });
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("Gateway PID"));
  });
});
