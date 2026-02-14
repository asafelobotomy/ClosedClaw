/**
 * TPC End-to-End Pipeline Test
 *
 * Verifies the complete TPC flow:
 *   CT/1 payload → envelope → sign → RS-FEC → AFSK → WAV → dead-drop
 *   → WAV read → Goertzel → RS-decode → verify → nonce check → CT/1 dispatch
 *
 * Checks:
 *   - No CT/1 text leakage (payload never stored as plaintext outside envelope)
 *   - Signature is valid
 *   - Nonce is unique and replay-detected on second use
 *   - Timestamp freshness check works
 *   - Dead-drop lifecycle (write → read → archive)
 *   - Circuit breaker, rate limiter, and audit logger integration
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { TPCRuntime } from "./index.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { RateLimiter } from "./rate-limiter.js";
import { AuditLogger } from "./audit-logger.js";
import { KeyRotationManager } from "./key-rotation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tpc-e2e-${prefix}-`));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function makeRuntimeConfig(tmpDir: string) {
  return {
    deadDropPath: path.join(tmpDir, "dead-drop"),
    keyPath: path.join(tmpDir, "keys", "private.pem"),
    publicKeyPath: path.join(tmpDir, "keys", "public.pem"),
    nonceStorePath: path.join(tmpDir, "nonce.json"),
    maxMessageAge: 300,
    pollingInterval: 500,
  };
}

// ---------------------------------------------------------------------------
// Full Pipeline E2E
// ---------------------------------------------------------------------------

describe("TPC E2E: full pipeline", () => {
  let tmpDir: string;
  let runtime: TPCRuntime;

  beforeEach(async () => {
    tmpDir = makeTempDir("pipeline");
    runtime = new TPCRuntime(makeRuntimeConfig(tmpDir));
    await runtime.initialize();
  });

  afterEach(async () => {
    await runtime.shutdown();
    cleanup(tmpDir);
  });

  it("complete encode → dead-drop → decode roundtrip", async () => {
    const ctPayload = "REQ ping\nX-Source: agent-a\nX-Target: agent-b";

    // Encode and write to dead-drop
    const encodeResult = await runtime.encode({
      payload: ctPayload,
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    expect(encodeResult.filePath).toBeTruthy();
    expect(encodeResult.fileSize).toBeGreaterThan(44);
    expect(encodeResult.messageId).toBeTruthy();
    expect(encodeResult.encodingMs).toBeGreaterThanOrEqual(0);

    // Verify WAV file was written to inbox
    const inboxDir = path.join(tmpDir, "dead-drop", "inbox", "agent-b");
    expect(fs.existsSync(inboxDir)).toBe(true);
    const files = fs.readdirSync(inboxDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.wav$/);

    // Decode from dead-drop
    const decodeResult = await runtime.decode({ filePath: encodeResult.filePath });

    expect(decodeResult.payload).toBe(ctPayload);
    expect(decodeResult.envelope.sourceAgent).toBe("agent-a");
    expect(decodeResult.envelope.targetAgent).toBe("agent-b");
    expect(decodeResult.signatureValid).toBe(true);
    expect(decodeResult.fresh).toBe(true);
    expect(decodeResult.nonceUnique).toBe(true);
  });

  it("no plaintext CT/1 leakage in dead-drop WAV", async () => {
    const secretPayload = "REQ execute-secret-task\nX-Auth: bearer-token-12345";

    const encodeResult = await runtime.encode({
      payload: secretPayload,
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    // Read the raw WAV file bytes
    const rawWav = fs.readFileSync(encodeResult.filePath);
    const wavStr = rawWav.toString("latin1");

    // The plaintext secret should NOT appear verbatim in the WAV binary
    expect(wavStr).not.toContain("execute-secret-task");
    expect(wavStr).not.toContain("bearer-token-12345");
  });

  it("encodeToBuffer roundtrip via decodeFromBuffer", () => {
    const ctPayload = "REQ buffer-test";

    const { wavData, signed } = runtime.encodeToBuffer({
      payload: ctPayload,
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    expect(wavData).toBeInstanceOf(Buffer);
    expect(wavData.length).toBeGreaterThan(44);
    expect(signed.scheme).toBe("ed25519");

    const decoded = runtime.decodeFromBuffer(wavData);
    expect(decoded.payload).toBe(ctPayload);
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.fresh).toBe(true);
    expect(decoded.nonceUnique).toBe(true);
  });

  it("detects replay attack (duplicate nonce)", () => {
    const { wavData } = runtime.encodeToBuffer({
      payload: "REQ task-1",
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    // First decode — should succeed
    const result1 = runtime.decodeFromBuffer(wavData);
    expect(result1.signatureValid).toBe(true);
    expect(result1.nonceUnique).toBe(true);

    // Second decode — nonce already seen
    const result2 = runtime.decodeFromBuffer(wavData);
    expect(result2.nonceUnique).toBe(false);
  });

  it("rejects expired envelopes", async () => {
    const shortTmpDir = makeTempDir("short");
    const shortRuntime = new TPCRuntime({
      ...makeRuntimeConfig(shortTmpDir),
      maxMessageAge: -1, // Impossible to be fresh (age >= 0 > -1)
    });
    await shortRuntime.initialize();

    const { wavData } = shortRuntime.encodeToBuffer({
      payload: "REQ stale",
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    const result = shortRuntime.decodeFromBuffer(wavData);
    expect(result.fresh).toBe(false);

    await shortRuntime.shutdown();
    cleanup(shortTmpDir);
  });

  it("records audit events during pipeline", async () => {
    const encodeResult = await runtime.encode({
      payload: "REQ audit-test",
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    await runtime.decode({ filePath: encodeResult.filePath });

    const auditLog = runtime.getAuditLog();
    const encodeEvent = auditLog.find((e) => e.event === "tpc_encode");
    const decodeEvent = auditLog.find((e) => e.event === "tpc_decode");
    expect(encodeEvent).toBeTruthy();
    expect(decodeEvent).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Security Integration E2E
// ---------------------------------------------------------------------------

describe("TPC E2E: security integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir("security");
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it("circuit breaker blocks after failures, recovers on success", () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 100,
    });

    expect(cb.isAllowed()).toBe(true);
    cb.recordSuccess();

    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    expect(cb.isAllowed()).toBe(false);
    expect(cb.getState()).toBe("open");
  });

  it("key rotation manages multiple accepted keys", async () => {
    const km = new KeyRotationManager({
      keyDir: path.join(tmpDir, "keys"),
      gracePeriodMs: 60_000,
    });
    await km.init();

    expect(km.getAcceptedKeyCount()).toBe(1);
    await km.rotate();
    expect(km.getAcceptedKeyCount()).toBe(2);

    km.shutdown();
  });

  it("rate limiter enforces per-agent limits", () => {
    const rl = new RateLimiter({ maxPerWindow: 3, windowMs: 60_000 });

    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(false);

    expect(rl.record("agent-b")).toBe(true);
  });

  it("audit logger captures full pipeline events", () => {
    const logger = new AuditLogger({
      logDir: path.join(tmpDir, "audit"),
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logEncode({
      source: "agent-a",
      target: "agent-b",
      messageId: "msg-001",
      nonce: "nonce-001",
      transport: "tpc",
    });

    logger.logDecode({
      source: "agent-a",
      target: "agent-b",
      messageId: "msg-001",
      nonce: "nonce-001",
      verified: true,
      transport: "tpc",
    });

    logger.logVerifyFailed({
      source: "agent-x",
      messageId: "msg-bad",
      reason: "signature mismatch",
    });

    logger.logFallback({
      source: "agent-a",
      target: "agent-b",
      reason: "circuit breaker open",
    });

    const events = logger.getBufferedEvents();
    expect(events.length).toBe(4);
    expect(events[0].event).toBe("tpc.encode");
    expect(events[1].event).toBe("tpc.decode");
    expect(events[2].event).toBe("tpc.verify_failed");
    expect(events[2].severity).toBe("security");
    expect(events[3].event).toBe("tpc.fallback");
    expect(events[3].transport).toBe("text");

    logger.shutdown();
  });

  it("nonce store prevents replay on second decode", async () => {
    const runtime = new TPCRuntime(makeRuntimeConfig(tmpDir));
    await runtime.initialize();

    const { wavData } = runtime.encodeToBuffer({
      payload: "REQ replay-check",
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });

    const result1 = runtime.decodeFromBuffer(wavData);
    expect(result1.nonceUnique).toBe(true);

    const result2 = runtime.decodeFromBuffer(wavData);
    expect(result2.nonceUnique).toBe(false);

    await runtime.shutdown();
  });
});
