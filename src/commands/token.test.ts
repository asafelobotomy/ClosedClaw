import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWriteConfigFile = vi.fn(async () => {});
const mockReadConfigFileSnapshot = vi.fn(async () => ({
  valid: true,
  config: {},
  issues: [],
  legacyIssues: [],
  path: "/tmp/test-config.json5",
}));
const mockLoadConfig = vi.fn(() => ({}));

vi.mock("../config/config.js", () => ({
  writeConfigFile: (...args: unknown[]) => mockWriteConfigFile(...args),
  readConfigFileSnapshot: (...args: unknown[]) => mockReadConfigFileSnapshot(...args),
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

import {
  generateGatewayToken,
  resolveCurrentToken,
  ensureGatewayToken,
  tokenGetCommand,
  tokenGenerateCommand,
  tokenSetCommand,
} from "./token.js";

function makeRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    env: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateGatewayToken", () => {
  it("returns a 64-char hex string", () => {
    const token = generateGatewayToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces unique tokens", () => {
    const a = generateGatewayToken();
    const b = generateGatewayToken();
    expect(a).not.toBe(b);
  });
});

describe("resolveCurrentToken", () => {
  it("prefers env variable over config", () => {
    const result = resolveCurrentToken(
      { gateway: { auth: { token: "cfg-tok" } } },
      { ClosedClaw_GATEWAY_TOKEN: "env-tok" } as unknown as NodeJS.ProcessEnv,
    );
    expect(result).toEqual({ token: "env-tok", source: "env" });
  });

  it("falls back to legacy env var", () => {
    const result = resolveCurrentToken(
      {},
      { CLAWDBOT_GATEWAY_TOKEN: "legacy-tok" } as unknown as NodeJS.ProcessEnv,
    );
    expect(result).toEqual({ token: "legacy-tok", source: "env" });
  });

  it("reads token from config if env is empty", () => {
    const result = resolveCurrentToken(
      { gateway: { auth: { token: "cfg-tok" } } },
      {} as NodeJS.ProcessEnv,
    );
    expect(result).toEqual({ token: "cfg-tok", source: "config" });
  });

  it("returns null when no token is configured", () => {
    mockLoadConfig.mockReturnValue({});
    const result = resolveCurrentToken(undefined, {} as NodeJS.ProcessEnv);
    expect(result).toBeNull();
  });

  it("trims whitespace from tokens", () => {
    const result = resolveCurrentToken(
      {},
      { ClosedClaw_GATEWAY_TOKEN: "  spaced  " } as unknown as NodeJS.ProcessEnv,
    );
    expect(result?.token).toBe("spaced");
  });

  it("ignores empty string tokens", () => {
    const result = resolveCurrentToken(
      { gateway: { auth: { token: "" } } },
      { ClosedClaw_GATEWAY_TOKEN: "" } as unknown as NodeJS.ProcessEnv,
    );
    expect(result).toBeNull();
  });
});

describe("ensureGatewayToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing env token without writing config", async () => {
    const result = await ensureGatewayToken({
      ClosedClaw_GATEWAY_TOKEN: "existing-tok",
    } as unknown as NodeJS.ProcessEnv);
    expect(result).toEqual({ token: "existing-tok", source: "env" });
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it("returns existing config token without writing config", async () => {
    mockReadConfigFileSnapshot.mockResolvedValueOnce({
      valid: true,
      config: { gateway: { auth: { token: "cfg-tok" } } },
      issues: [],
      legacyIssues: [],
      path: "/tmp/cfg.json5",
    });
    const result = await ensureGatewayToken({} as NodeJS.ProcessEnv);
    expect(result).toEqual({ token: "cfg-tok", source: "config" });
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it("generates and persists a new token when none exists", async () => {
    mockReadConfigFileSnapshot.mockResolvedValueOnce({
      valid: true,
      config: {},
      issues: [],
      legacyIssues: [],
      path: "/tmp/cfg.json5",
    });
    const result = await ensureGatewayToken({} as NodeJS.ProcessEnv);
    expect(result.source).toBe("config");
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(mockWriteConfigFile).toHaveBeenCalledTimes(1);
    const written = mockWriteConfigFile.mock.calls[0][0] as Record<string, unknown>;
    expect((written as any).gateway.auth.token).toBe(result.token);
  });
});

describe("tokenGetCommand", () => {
  it("logs token when configured", async () => {
    const rt = makeRuntime();
    mockLoadConfig.mockReturnValue({ gateway: { auth: { token: "test-tok" } } });
    await tokenGetCommand(rt as any);
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("test-tok"));
  });

  it("logs help when no token", async () => {
    const rt = makeRuntime();
    mockLoadConfig.mockReturnValue({});
    await tokenGetCommand(rt as any);
    expect(rt.log).toHaveBeenCalledWith(expect.stringContaining("No gateway token"));
  });
});

describe("tokenGenerateCommand", () => {
  beforeEach(() => vi.clearAllMocks());

  it("outputs the generated token", async () => {
    const rt = makeRuntime();
    mockReadConfigFileSnapshot.mockResolvedValueOnce({
      valid: true,
      config: {},
      issues: [],
      legacyIssues: [],
      path: "/tmp/cfg.json5",
    });
    await tokenGenerateCommand(rt as any);
    expect(rt.log).toHaveBeenCalledWith(expect.stringMatching(/[a-f0-9]{64}/));
  });
});

describe("tokenSetCommand", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes provided token to config", async () => {
    const rt = makeRuntime();
    mockReadConfigFileSnapshot.mockResolvedValueOnce({
      valid: true,
      config: {},
      issues: [],
      legacyIssues: [],
      path: "/tmp/cfg.json5",
    });
    await tokenSetCommand(rt as any, "my-custom-token");
    expect(mockWriteConfigFile).toHaveBeenCalledTimes(1);
    const written = mockWriteConfigFile.mock.calls[0][0] as any;
    expect(written.gateway.auth.token).toBe("my-custom-token");
  });

  it("rejects empty token", async () => {
    const rt = makeRuntime();
    await tokenSetCommand(rt as any, "  ");
    expect(rt.error).toHaveBeenCalledWith(expect.stringContaining("empty"));
    expect(rt.exit).toHaveBeenCalledWith(1);
  });
});
