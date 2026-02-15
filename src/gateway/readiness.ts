/**
 * Gateway Readiness Helper
 *
 * Polls the gateway HTTP health endpoint until it responds successfully,
 * or until a timeout is reached. Used by the launch command and other
 * orchestration tooling that needs to wait for a freshly-started gateway
 * to become ready.
 */

import { request } from "node:http";

export type WaitForReadyOptions = {
  /** Gateway HTTP port (default: 18789). */
  port?: number;
  /** Host to poll (default: "127.0.0.1"). */
  host?: string;
  /** Maximum time to wait in milliseconds (default: 15 000). */
  timeoutMs?: number;
  /** Interval between polls in milliseconds (default: 500). */
  intervalMs?: number;
};

export type ReadinessResult = {
  ok: boolean;
  /** Milliseconds elapsed before the gateway became ready (or we gave up). */
  elapsedMs: number;
  error?: string;
};

/**
 * Poll `GET /health` on the gateway until it returns a 2xx response.
 */
export async function waitForGatewayReady(opts?: WaitForReadyOptions): Promise<ReadinessResult> {
  const port = opts?.port ?? 18789;
  const host = opts?.host ?? "127.0.0.1";
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const intervalMs = opts?.intervalMs ?? 500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const ok = await probeHealth(host, port);
    if (ok) {
      return { ok: true, elapsedMs: Date.now() - start };
    }
    await sleep(intervalMs);
  }

  return {
    ok: false,
    elapsedMs: Date.now() - start,
    error: `Gateway did not become ready within ${timeoutMs}ms (http://${host}:${port}/health)`,
  };
}

/**
 * Quick check whether the gateway port is already listening.
 * Attempts a TCP connect with a short timeout.
 */
export async function isGatewayRunning(
  port: number = 18789,
  host: string = "127.0.0.1",
): Promise<boolean> {
  return probeHealth(host, port);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function probeHealth(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: host,
        port,
        path: "/health",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        // Drain data so the socket closes cleanly.
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
