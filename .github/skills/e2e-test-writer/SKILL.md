---
name: e2e-test-writer
description: Guide for writing e2e tests for ClosedClaw gateway and channels. Use when testing multi-instance gateway behavior, WebSocket/HTTP surfaces, node pairing, agent workflows with real networking. Covers test helpers, assertion patterns, and common scenarios.
---

# E2E Test Writer

This skill helps you write end-to-end (e2e) tests for ClosedClaw. E2E tests validate multi-instance gateway behavior, WebSocket/HTTP surfaces, node pairing, and agent workflows with heavier networking.

## When to Use

- Testing gateway networking and WebSocket protocol
- Validating multi-instance gateway coordination
- Testing node pairing and discovery
- Validating RPC method implementations
- Testing agent workflows with real networking
- Debugging "gateway doesn't respond" issues
- Testing channel integration (without real provider APIs)

## Prerequisites

- Understanding of ClosedClaw Gateway architecture
- Familiarity with Vitest testing framework
- Knowledge of WebSocket/HTTP protocols
- Understanding of async/await patterns

## E2E Test Architecture

### Test Types

ClosedClaw has **five Vitest configurations**:

1. **Unit** (`vitest.unit.config.ts`): `src/**/*.test.ts` - Fast, no network
2. **Extensions** (`vitest.extensions.config.ts`): `extensions/**/*.test.ts` - Plugin tests
3. **Gateway** (`vitest.gateway.config.ts`): `src/gateway/**/*.test.ts` - Gateway control plane
4. **E2E** (`vitest.e2e.config.ts`): `src/**/*.e2e.test.ts` - Multi-instance, networking
5. **Live** (`vitest.live.config.ts`): `src/**/*.live.test.ts` - Real providers (costs money)

E2E tests use `vitest.e2e.config.ts` and are heavier than unit tests but don't require real API keys.

### Running E2E Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run specific e2e test file
pnpm test:e2e -- test/gateway.multi.e2e.test.ts

# Run specific test case
pnpm test:e2e -- test/gateway.multi.e2e.test.ts -t "pairing flow"

# Debug mode
pnpm test:e2e -- --inspect-brk test/gateway.multi.e2e.test.ts
```

## E2E Test Patterns

### Pattern 1: Multi-Instance Gateway Test

Test multiple gateway instances coordinating via pairing.

```typescript
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../src/gateway/client.js";

type GatewayInstance = {
  name: string;
  port: number;
  hookToken: string;
  gatewayToken: string;
  homeDir: string;
  stateDir: string;
  configPath: string;
  child: ChildProcessWithoutNullStreams;
  stdout: string[];
  stderr: string[];
};

const GATEWAY_START_TIMEOUT_MS = 45_000;
const E2E_TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getFreePort = async () => {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  if (!addr || typeof addr === "string") {
    srv.close();
    throw new Error("failed to bind ephemeral port");
  }
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return addr.port;
};

const waitForPortOpen = async (
  proc: ChildProcessWithoutNullStreams,
  chunksOut: string[],
  chunksErr: string[],
  port: number,
  timeoutMs: number,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (proc.exitCode !== null) {
      const stdout = chunksOut.join("");
      const stderr = chunksErr.join("");
      throw new Error(
        `gateway exited before listening (code=${String(proc.exitCode)} signal=${String(proc.signalCode)})\n` +
          `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
      );
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", (err) => {
          socket.destroy();
          reject(err);
        });
      });
      return;
    } catch {
      // keep polling
    }

    await sleep(25);
  }
  const stdout = chunksOut.join("");
  const stderr = chunksErr.join("");
  throw new Error(
    `timeout waiting for gateway to listen on port ${port}\n` +
      `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
  );
};

const spawnGatewayInstance = async (name: string): Promise<GatewayInstance> => {
  const port = await getFreePort();
  const hookToken = `token-${name}-${randomUUID()}`;
  const gatewayToken = `gateway-${name}-${randomUUID()}`;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), `ClosedClaw-e2e-${name}-`));
  const configDir = path.join(homeDir, ".ClosedClaw");
  await fs.mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, "ClosedClaw.json");
  const stateDir = path.join(configDir, "state");

  const config = {
    gateway: { port, auth: { mode: "token", token: gatewayToken } },
    hooks: { enabled: true, token: hookToken, path: "/hooks" },
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

  const stdout: string[] = [];
  const stderr: string[] = [];
  let child: ChildProcessWithoutNullStreams | null = null;

  try {
    child = spawn(
      "node",
      [
        "dist/index.js",
        "gateway",
        "--port",
        String(port),
        "--bind",
        "loopback",
        "--allow-unconfigured",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: homeDir,
          ClosedClaw_CONFIG_PATH: configPath,
          ClosedClaw_STATE_DIR: stateDir,
          ClosedClaw_GATEWAY_TOKEN: "",
          ClosedClaw_GATEWAY_PASSWORD: "",
          ClosedClaw_SKIP_CHANNELS: "1",
          ClosedClaw_SKIP_BROWSER_CONTROL_SERVER: "1",
          ClosedClaw_SKIP_CANVAS_HOST: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d) => stdout.push(String(d)));
    child.stderr?.on("data", (d) => stderr.push(String(d)));

    await waitForPortOpen(child, stdout, stderr, port, GATEWAY_START_TIMEOUT_MS);

    return {
      name,
      port,
      hookToken,
      gatewayToken,
      homeDir,
      stateDir,
      configPath,
      child,
      stdout,
      stderr,
    };
  } catch (err) {
    if (child && child.exitCode === null && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    await fs.rm(homeDir, { recursive: true, force: true });
    throw err;
  }
};

const stopGatewayInstance = async (inst: GatewayInstance) => {
  if (inst.child.exitCode === null && !inst.child.killed) {
    try {
      inst.child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      if (inst.child.exitCode !== null) {
        return resolve(true);
      }
      inst.child.once("exit", () => resolve(true));
    }),
    sleep(5_000).then(() => false),
  ]);
  if (!exited && inst.child.exitCode === null && !inst.child.killed) {
    try {
      inst.child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
  await fs.rm(inst.homeDir, { recursive: true, force: true });
};

describe("multi-instance gateway", () => {
  it(
    "pairs two gateway instances",
    async () => {
      const primary = await spawnGatewayInstance("primary");
      const secondary = await spawnGatewayInstance("secondary");

      try {
        // Connect clients
        const primaryClient = new GatewayClient({
          url: `ws://127.0.0.1:${primary.port}`,
          token: primary.gatewayToken,
        });
        await primaryClient.connect();

        const secondaryClient = new GatewayClient({
          url: `ws://127.0.0.1:${secondary.port}`,
          token: secondary.gatewayToken,
        });
        await secondaryClient.connect();

        // Initiate pairing
        const pairingCode = await primaryClient.call("node:generatePairingCode", {});
        expect(pairingCode).toHaveProperty("code");
        expect(pairingCode.code).toMatch(/^\d{6}$/);

        // Secondary pairs with primary
        await secondaryClient.call("node:pair", { code: pairingCode.code });

        // Verify paired status
        const primaryNodes = await primaryClient.call("node:list", {});
        expect(primaryNodes.nodes).toHaveLength(1);
        expect(primaryNodes.nodes[0]).toMatchObject({
          connected: true,
          paired: true,
        });

        await primaryClient.disconnect();
        await secondaryClient.disconnect();
      } finally {
        await stopGatewayInstance(primary);
        await stopGatewayInstance(secondary);
      }
    },
    E2E_TIMEOUT_MS,
  );
});
```

### Pattern 2: Agent Workflow Test (Mock Model)

Test agent workflows with mocked model responses.

```typescript
import fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempHome } from "../../test/helpers/temp-home.js";

// Mock embedded agent
vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  compactEmbeddedPiSession: vi.fn(),
  runEmbeddedPiAgent: vi.fn(),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

// Mock model catalog
const modelCatalogMocks = vi.hoisted(() => ({
  loadModelCatalog: vi.fn().mockResolvedValue([
    {
      provider: "anthropic",
      id: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      contextWindow: 200000,
    },
  ]),
  resetModelCatalogCacheForTest: vi.fn(),
}));

vi.mock("../agents/model-catalog.js", () => modelCatalogMocks);

import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { getReplyFromConfig } from "./reply.js";

const MAIN_SESSION_KEY = "agent:main:main";

function makeCfg(home: string) {
  return {
    agents: {
      defaults: {
        model: "anthropic/claude-opus-4-5",
        workspace: join(home, "ClosedClaw"),
      },
    },
    channels: {
      whatsapp: {
        allowFrom: ["*"],
      },
    },
    session: { store: join(home, "sessions.json") },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent workflow", () => {
  it("processes message and calls runEmbeddedPiAgent", async () => {
    await withTempHome(async (home) => {
      const cfg = makeCfg(home);

      // Mock agent run
      vi.mocked(runEmbeddedPiAgent).mockResolvedValueOnce({
        blocks: [{ type: "text", text: "Hello from agent!" }],
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      // Simulate incoming message
      const reply = await getReplyFromConfig(
        {
          channel: "whatsapp",
          peerId: "+1234567890",
          text: "Hello",
        },
        cfg,
      );

      // Assertions
      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionKey: MAIN_SESSION_KEY,
          userMessage: "Hello",
        }),
      );
      expect(reply).toContain("Hello from agent!");
    });
  });
});
```

### Pattern 3: WebSocket RPC Test

Test gateway RPC methods via WebSocket.

```typescript
import { describe, expect, it } from "vitest";
import { GatewayClient } from "../src/gateway/client.js";

describe("gateway RPC", () => {
  it("calls health endpoint", async () => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      token: process.env.ClosedClaw_GATEWAY_TOKEN || "",
    });

    try {
      await client.connect();
      const health = await client.call("health", {});
      expect(health).toMatchObject({ ok: true });
    } finally {
      await client.disconnect();
    }
  });

  it("lists models", async () => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      token: process.env.ClosedClaw_GATEWAY_TOKEN || "",
    });

    try {
      await client.connect();
      const models = await client.call("models:list", {});
      expect(models).toHaveProperty("models");
      expect(Array.isArray(models.models)).toBe(true);
      expect(models.models.length).toBeGreaterThan(0);
    } finally {
      await client.disconnect();
    }
  });
});
```

## Test Helpers & Utilities

### Temp Home Helper

Create isolated test environment with temp home directory:

```typescript
import { withTempHome } from "../../test/helpers/temp-home.js";

await withTempHome(async (home) => {
  // home is a temp directory
  const configPath = join(home, ".ClosedClaw", "config.json");
  // ... test logic

  // Cleanup happens automatically
});
```

### Gateway Client

Connect to gateway via WebSocket:

```typescript
import { GatewayClient } from "../src/gateway/client.js";

const client = new GatewayClient({
  url: `ws://127.0.0.1:${port}`,
  token: "gateway-token-here",
});

await client.connect();

// Call RPC method
const result = await client.call("method:name", { param: "value" });

// Listen for events
client.on("event:name", (payload) => {
  console.log("Event received:", payload);
});

await client.disconnect();
```

### Port Management

Get free port for test gateway:

```typescript
import net from "node:net";

const getFreePort = async () => {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  if (!addr || typeof addr === "string") {
    srv.close();
    throw new Error("failed to bind ephemeral port");
  }
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return addr.port;
};

const port = await getFreePort();
```

### Sleep Utility

Wait for async conditions:

```typescript
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Wait for condition
while (condition !== true) {
  await sleep(25);
  // check condition
}
```

## Mocking Patterns

### Mock Embedded Agent

```typescript
vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  compactEmbeddedPiSession: vi.fn(),
  runEmbeddedPiAgent: vi.fn(),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";

// In test
vi.mocked(runEmbeddedPiAgent).mockResolvedValueOnce({
  blocks: [{ type: "text", text: "Response" }],
  usage: { inputTokens: 10, outputTokens: 5 },
});
```

### Mock Model Catalog

```typescript
const modelCatalogMocks = vi.hoisted(() => ({
  loadModelCatalog: vi.fn().mockResolvedValue([
    {
      provider: "anthropic",
      id: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      contextWindow: 200000,
    },
  ]),
  resetModelCatalogCacheForTest: vi.fn(),
}));

vi.mock("../agents/model-catalog.js", () => modelCatalogMocks);
```

### Mock Usage Tracking

```typescript
const usageMocks = vi.hoisted(() => ({
  loadProviderUsageSummary: vi.fn().mockResolvedValue({
    updatedAt: 0,
    providers: [],
  }),
  formatUsageSummaryLine: vi.fn().mockReturnValue("📊 Usage: Claude 80% left"),
  resolveUsageProviderId: vi.fn((provider: string) => provider.split("/")[0]),
}));

vi.mock("../infra/provider-usage.js", () => usageMocks);
```

## Common Test Scenarios

### Scenario 1: Gateway Pairing

Test two gateway instances pairing via code:

```typescript
it("pairs successfully", async () => {
  const primary = await spawnGatewayInstance("primary");
  const secondary = await spawnGatewayInstance("secondary");

  try {
    const primaryClient = new GatewayClient({
      url: `ws://127.0.0.1:${primary.port}`,
      token: primary.gatewayToken,
    });
    await primaryClient.connect();

    const secondaryClient = new GatewayClient({
      url: `ws://127.0.0.1:${secondary.port}`,
      token: secondary.gatewayToken,
    });
    await secondaryClient.connect();

    // Generate pairing code
    const { code } = await primaryClient.call("node:generatePairingCode", {});

    // Secondary pairs with code
    await secondaryClient.call("node:pair", { code });

    // Verify pairing
    const { nodes } = await primaryClient.call("node:list", {});
    expect(nodes[0]).toMatchObject({ paired: true, connected: true });

    await primaryClient.disconnect();
    await secondaryClient.disconnect();
  } finally {
    await stopGatewayInstance(primary);
    await stopGatewayInstance(secondary);
  }
});
```

### Scenario 2: Agent Session Management

Test session creation and state:

```typescript
it("creates agent session", async () => {
  await withTempHome(async (home) => {
    const cfg = makeCfg(home);
    const sessionStore = join(home, "sessions.json");

    // First message creates session
    await getReplyFromConfig({ channel: "whatsapp", peerId: "+1234", text: "Hello" }, cfg);

    // Verify session created
    const sessions = JSON.parse(await fs.readFile(sessionStore, "utf8"));
    const sessionKey = "agent:main:whatsapp:peer:+1234";
    expect(sessions[sessionKey]).toBeDefined();
    expect(sessions[sessionKey].agentId).toBe("main");
  });
});
```

### Scenario 3: RPC Method Validation

Test RPC method parameter validation:

```typescript
it("validates RPC parameters", async () => {
  const client = new GatewayClient({
    url: `ws://127.0.0.1:${port}`,
    token: gatewayToken,
  });

  try {
    await client.connect();

    // Missing required parameter
    await expect(client.call("agent:send", {})).rejects.toThrow("Missing required parameter");

    // Invalid parameter type
    await expect(client.call("agent:send", { message: 123 })).rejects.toThrow(
      "Invalid parameter type",
    );
  } finally {
    await client.disconnect();
  }
});
```

## Timeout Management

E2E tests may take longer than unit tests:

```typescript
const GATEWAY_START_TIMEOUT_MS = 45_000; // Gateway startup
const E2E_TIMEOUT_MS = 120_000; // Entire test

describe("slow test", () => {
  it(
    "completes within timeout",
    async () => {
      // Test logic
    },
    E2E_TIMEOUT_MS,
  ); // Per-test timeout
});
```

## Assertion Patterns

### Assert Gateway Health

```typescript
const health = await client.call("health", {});
expect(health).toMatchObject({ ok: true });
```

### Assert Node Status

```typescript
const { nodes } = await client.call("node:list", {});
expect(nodes).toHaveLength(1);
expect(nodes[0]).toMatchObject({
  nodeId: expect.any(String),
  connected: true,
  paired: true,
});
```

### Assert Agent Response

```typescript
vi.mocked(runEmbeddedPiAgent).mockResolvedValueOnce({
  blocks: [{ type: "text", text: "Expected response" }],
  usage: { inputTokens: 100, outputTokens: 50 },
});

const reply = await getReplyFromConfig(message, cfg);
expect(reply).toContain("Expected response");
expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
  expect.objectContaining({
    sessionKey: "agent:main:whatsapp:peer:+1234",
    userMessage: "Hello",
  }),
);
```

## Troubleshooting E2E Tests

### Gateway Won't Start

**Symptom**: Test times out waiting for gateway

**Diagnosis**:

```typescript
// Check stdout/stderr in test output
const { stdout, stderr } = inst;
console.log("Gateway stdout:", stdout.join(""));
console.log("Gateway stderr:", stderr.join(""));
```

**Solutions**:

- Check port already in use: `lsof -i :PORT`
- Verify `dist/index.js` exists: `pnpm build`
- Check environment variables in `spawnGatewayInstance`

### WebSocket Connection Fails

**Symptom**: `client.connect()` throws error

**Diagnosis**:

```typescript
client.on("error", (err) => {
  console.error("WebSocket error:", err);
});
```

**Solutions**:

- Verify gateway is listening: `nc -zv 127.0.0.1 PORT`
- Check gateway token matches
- Ensure gateway started successfully

### Test Cleanup Issues

**Symptom**: Tests leave processes running

**Solution**:

```typescript
afterAll(async () => {
  // Always cleanup in afterAll
  await stopGatewayInstance(primary);
  await stopGatewayInstance(secondary);
});
```

### Mock Not Working

**Symptom**: Real function called instead of mock

**Solution**:

```typescript
// Use vi.hoisted for top-level mocks
const mocks = vi.hoisted(() => ({
  fn: vi.fn(),
}));

vi.mock("../module.js", () => mocks);

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
```

## Best Practices

1. **Test isolation**: Each test should spawn its own gateway instances
2. **Cleanup**: Always stop spawned processes in `afterAll`
3. **Timeouts**: Use appropriate timeouts for network operations
4. **Mocking**: Mock external dependencies (models, providers)
5. **Assertions**: Be specific about expected behavior
6. **Flakiness**: Avoid timing-dependent assertions
7. **Ports**: Use `getFreePort()` to avoid conflicts
8. **Logs**: Capture stdout/stderr for debugging
9. **Temp dirs**: Use temp home directories for isolation
10. **Error messages**: Include diagnostic info in error messages

## Checklist

- [ ] Test file named `*.e2e.test.ts`
- [ ] Located in appropriate directory (e.g., `test/` or `src/gateway/`)
- [ ] Uses appropriate timeout (default: 120s)
- [ ] Spawns isolated gateway instances
- [ ] Cleans up processes in `afterAll`
- [ ] Uses `getFreePort()` for port allocation
- [ ] Captures stdout/stderr for diagnostics
- [ ] Mocks external dependencies
- [ ] Uses temp home directories
- [ ] Tests successfully with `pnpm test:e2e`

## Related Files

- `test/gateway.multi.e2e.test.ts` - Multi-instance gateway tests
- `src/auto-reply/*.e2e.test.ts` - Agent workflow tests
- `test/helpers/temp-home.ts` - Temp home helper
- `src/gateway/client.ts` - Gateway WebSocket client
- `vitest.e2e.config.ts` - E2E test configuration
- `docs/testing.md` - Comprehensive testing guide
