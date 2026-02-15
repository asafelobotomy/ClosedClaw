import { describe, expect, it, vi } from "vitest";

import { waitForGatewayReady, isGatewayRunning } from "./readiness.js";

// We don't mock node:http — instead use a port that isn't listening to get
// quick connection-refused, keeping the tests fast.

const UNUSED_PORT = 19999;

describe("waitForGatewayReady", () => {
  it("returns ok: false when gateway is not running", async () => {
    const result = await waitForGatewayReady({
      port: UNUSED_PORT,
      timeoutMs: 1500,
      intervalMs: 200,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("did not become ready");
    expect(result.elapsedMs).toBeGreaterThan(0);
  });

  it("respects short timeout", async () => {
    const start = Date.now();
    const result = await waitForGatewayReady({
      port: UNUSED_PORT,
      timeoutMs: 500,
      intervalMs: 100,
    });
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("isGatewayRunning", () => {
  it("returns false for a port that is not listening", async () => {
    const result = await isGatewayRunning(UNUSED_PORT);
    expect(result).toBe(false);
  });
});

describe("waitForGatewayReady with mock server", () => {
  it("returns ok when health endpoint responds 200", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };

    try {
      const result = await waitForGatewayReady({
        port: addr.port,
        timeoutMs: 5000,
        intervalMs: 100,
      });
      expect(result.ok).toBe(true);
      expect(result.elapsedMs).toBeLessThan(5000);
    } finally {
      server.close();
    }
  });
});
