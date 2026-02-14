/**
 * TPC Security Hardening Tests
 *
 * Tests for Phase 5 security components:
 * - Circuit breaker (dead-drop health monitoring)
 * - Key rotation (scheduled replacement with grace period)
 * - Rate limiter (per-agent sliding window)
 * - Audit logger (JSONL structured event logging)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AuditLogger } from "./audit-logger.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { generateKeyPair, createEnvelope, signEnvelope } from "./crypto-signer.js";
import { KeyRotationManager } from "./key-rotation.js";
import { RateLimiter } from "./rate-limiter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tpc-security-test-"));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

describe("circuit-breaker", () => {
  it("starts in closed state", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("closed");
    expect(cb.isAllowed()).toBe(true);
  });

  it("remains closed under failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe("closed");
    expect(cb.isAllowed()).toBe(true);
  });

  it("trips to open state after exceeding failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    expect(cb.isAllowed()).toBe(false);
  });

  it("transitions to half-open after recovery timeout", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(1001);
    expect(cb.getState()).toBe("half-open");
    expect(cb.isAllowed()).toBe(true);

    vi.useRealTimers();
  });

  it("closes after consecutive successes in half-open", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(1001);
    expect(cb.getState()).toBe("half-open");

    cb.recordSuccess();
    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("re-trips immediately on failure during half-open", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(1001);
    expect(cb.getState()).toBe("half-open");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("resets to closed state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");
    expect(cb.isAllowed()).toBe(true);
  });

  it("prunes old failures outside the failure window", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      failureWindowMs: 1000,
    });

    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(1100); // Failures now stale
    cb.recordFailure();

    // Only 1 recent failure — should stay closed
    expect(cb.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("getStats returns diagnostic info", () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    cb.recordFailure();
    cb.recordFailure();

    const stats = cb.getStats();
    expect(stats.state).toBe("closed");
    expect(stats.recentFailures).toBe(2);
    expect(stats.config.failureThreshold).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Key Rotation
// ---------------------------------------------------------------------------

describe("key-rotation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it("initializes with a generated keypair", async () => {
    const km = new KeyRotationManager({ keyDir: tmpDir });
    const keyPair = await km.init();

    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toBeDefined();
    expect(km.getAcceptedKeyCount()).toBe(1);
  });

  it("initializes with an existing keypair", async () => {
    const existing = generateKeyPair();
    const km = new KeyRotationManager({ keyDir: tmpDir });
    const keyPair = await km.init(existing);

    expect(keyPair.publicKey).toBe(existing.publicKey);
    expect(km.getAcceptedKeyCount()).toBe(1);
  });

  it("rotates to a new key and keeps old in grace period", async () => {
    const km = new KeyRotationManager({
      keyDir: tmpDir,
      gracePeriodMs: 60_000,
    });
    await km.init();
    const oldPub = km.getActivePublicKey();

    await km.rotate();
    const newPub = km.getActivePublicKey();

    // New key is different from old key
    const oldPem = oldPub.export({ type: "spki", format: "pem" });
    const newPem = newPub.export({ type: "spki", format: "pem" });
    expect(newPem).not.toBe(oldPem);

    // Both keys should be accepted now
    expect(km.getAcceptedKeyCount()).toBe(2);
  });

  it("verifies signatures from old key during grace period", async () => {
    const km = new KeyRotationManager({
      keyDir: tmpDir,
      gracePeriodMs: 60_000,
    });
    const oldKeyPair = await km.init();

    // Sign a message with the old key
    const envelope = createEnvelope({
      payload: "REQ ping",
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });
    const signed = signEnvelope(envelope, oldKeyPair.privateKey);

    // Rotate
    await km.rotate();

    // Old signature should still verify
    expect(km.verifyWithRotation(signed)).toBe(true);
  });

  it("rejects signatures after grace period expires", async () => {
    vi.useFakeTimers();

    const km = new KeyRotationManager({
      keyDir: tmpDir,
      gracePeriodMs: 1000,
    });
    const oldKeyPair = await km.init();

    const envelope = createEnvelope({
      payload: "REQ ping",
      sourceAgent: "agent-a",
      targetAgent: "agent-b",
    });
    const signed = signEnvelope(envelope, oldKeyPair.privateKey);

    await km.rotate();

    // Advance past grace period
    vi.advanceTimersByTime(1100);

    // Old signature should now be rejected
    expect(km.verifyWithRotation(signed)).toBe(false);

    vi.useRealTimers();
  });

  it("calls onRotate callback on rotation", async () => {
    const onRotate = vi.fn();
    const km = new KeyRotationManager({ keyDir: tmpDir }, { onRotate });
    await km.init();

    await km.rotate();

    expect(onRotate).toHaveBeenCalledOnce();
    expect(onRotate).toHaveBeenCalledWith(expect.anything());
  });

  it("shutdown clears state", async () => {
    const km = new KeyRotationManager({ keyDir: tmpDir });
    await km.init();

    km.shutdown();
    expect(km.getAcceptedKeyCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

describe("rate-limiter", () => {
  it("allows messages under the limit", () => {
    const rl = new RateLimiter({ maxPerWindow: 5, windowMs: 1000 });

    for (let i = 0; i < 5; i++) {
      expect(rl.record("agent-a")).toBe(true);
    }
  });

  it("rejects messages over the limit", () => {
    const rl = new RateLimiter({ maxPerWindow: 3, windowMs: 60_000 });

    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(false);
  });

  it("tracks agents independently", () => {
    const rl = new RateLimiter({ maxPerWindow: 2, windowMs: 60_000 });

    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(false);

    // Agent B should not be affected
    expect(rl.record("agent-b")).toBe(true);
    expect(rl.record("agent-b")).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    const rl = new RateLimiter({ maxPerWindow: 2, windowMs: 1000 });

    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(true);
    expect(rl.record("agent-a")).toBe(false);

    vi.advanceTimersByTime(2001); // 2 full windows pass

    expect(rl.record("agent-a")).toBe(true);
    vi.useRealTimers();
  });

  it("remaining() returns correct capacity", () => {
    const rl = new RateLimiter({ maxPerWindow: 10, windowMs: 60_000 });

    expect(rl.remaining("agent-a")).toBe(10);
    rl.record("agent-a");
    expect(rl.remaining("agent-a")).toBe(9);
  });

  it("isAllowed() does not consume a slot", () => {
    const rl = new RateLimiter({ maxPerWindow: 1, windowMs: 60_000 });

    expect(rl.isAllowed("agent-a")).toBe(true);
    expect(rl.isAllowed("agent-a")).toBe(true); // Still true — not consumed

    expect(rl.record("agent-a")).toBe(true);
    expect(rl.isAllowed("agent-a")).toBe(false);
  });

  it("resetAgent() clears only that agent", () => {
    const rl = new RateLimiter({ maxPerWindow: 1, windowMs: 60_000 });

    rl.record("agent-a");
    rl.record("agent-b");

    rl.resetAgent("agent-a");
    expect(rl.isAllowed("agent-a")).toBe(true);
    expect(rl.isAllowed("agent-b")).toBe(false);
  });

  it("resetAll() clears everything", () => {
    const rl = new RateLimiter({ maxPerWindow: 1, windowMs: 60_000 });

    rl.record("agent-a");
    rl.record("agent-b");
    rl.resetAll();

    expect(rl.isAllowed("agent-a")).toBe(true);
    expect(rl.isAllowed("agent-b")).toBe(true);
  });

  it("getStats() returns per-agent info", () => {
    const rl = new RateLimiter({ maxPerWindow: 5, windowMs: 60_000 });
    rl.record("agent-a");
    rl.record("agent-a");
    rl.record("agent-b");

    const stats = rl.getStats();
    expect(stats).toHaveLength(2);

    const agentA = stats.find((s) => s.agentId === "agent-a");
    expect(agentA?.remaining).toBe(3);
    expect(agentA?.limited).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Audit Logger
// ---------------------------------------------------------------------------

describe("audit-logger", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it("initializes and creates log directory", () => {
    const logger = new AuditLogger({ logDir: tmpDir, enabled: true });
    logger.init();
    expect(fs.existsSync(tmpDir)).toBe(true);
    logger.shutdown();
  });

  it("writes JSONL audit events to disk", () => {
    const logger = new AuditLogger({ logDir: tmpDir, enabled: true });
    logger.init();

    logger.logEncode({
      source: "agent-a",
      target: "agent-b",
      messageId: "msg-001",
      nonce: "abc123",
      transport: "tpc",
    });

    logger.shutdown();

    // Find the audit file
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBeGreaterThan(0);

    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.event).toBe("tpc.encode");
    expect(entry.source).toBe("agent-a");
    expect(entry.target).toBe("agent-b");
    expect(entry.messageId).toBe("msg-001");
  });

  it("buffers events in memory when bufferEvents=true", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logFallback({
      source: "agent-a",
      reason: "no audio device",
    });

    const events = logger.getBufferedEvents();
    expect(events.length).toBe(1);
    expect(events[0].event).toBe("tpc.fallback");
    expect(events[0].severity).toBe("warn");
    expect(events[0].reason).toBe("no audio device");

    logger.shutdown();
  });

  it("logs security events for verification failure", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logVerifyFailed({
      source: "agent-x",
      messageId: "msg-bad",
      reason: "invalid signature",
    });

    const events = logger.getBufferedEvents();
    expect(events[0].severity).toBe("security");
    expect(events[0].event).toBe("tpc.verify_failed");

    logger.shutdown();
  });

  it("logs replay detection events", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logReplayDetected({
      source: "agent-a",
      nonce: "duplicate-nonce",
    });

    const events = logger.getBufferedEvents();
    expect(events[0].severity).toBe("security");
    expect(events[0].event).toBe("tpc.replay_detected");
    expect(events[0].nonce).toBe("duplicate-nonce");

    logger.shutdown();
  });

  it("logs key rotation events", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logKeyRotation({
      source: "agent-a",
      details: { oldKeyAge: 7200 },
    });

    const events = logger.getBufferedEvents();
    expect(events[0].event).toBe("tpc.key_rotation");
    expect(events[0].severity).toBe("info");

    logger.shutdown();
  });

  it("logs circuit breaker events", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logCircuitBreaker({ state: "open", reason: "5 consecutive failures" });
    logger.logCircuitBreaker({ state: "closed", reason: "recovery successful" });

    const events = logger.getBufferedEvents();
    expect(events[0].severity).toBe("error");
    expect(events[1].severity).toBe("info");

    logger.shutdown();
  });

  it("logs rate limit events", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logRateLimited({
      source: "agent-runaway",
      details: { count: 101, limit: 100 },
    });

    const events = logger.getBufferedEvents();
    expect(events[0].event).toBe("tpc.rate_limited");
    expect(events[0].severity).toBe("warn");

    logger.shutdown();
  });

  it("respects maxBufferSize", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
      maxBufferSize: 3,
    });
    logger.init();

    for (let i = 0; i < 5; i++) {
      logger.logEncode({
        source: "agent-a",
        target: "agent-b",
        messageId: `msg-${i}`,
        nonce: `nonce-${i}`,
        transport: "tpc",
      });
    }

    expect(logger.getBufferedEvents().length).toBe(3);
    // Should keep the most recent 3
    expect(logger.getBufferedEvents()[0].messageId).toBe("msg-2");

    logger.shutdown();
  });

  it("clearBuffer() empties the buffer", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: true,
      bufferEvents: true,
    });
    logger.init();

    logger.logEncode({
      source: "a",
      target: "b",
      messageId: "m",
      nonce: "n",
      transport: "tpc",
    });
    expect(logger.getBufferedEvents().length).toBe(1);

    logger.clearBuffer();
    expect(logger.getBufferedEvents().length).toBe(0);

    logger.shutdown();
  });

  it("does nothing when enabled=false", () => {
    const logger = new AuditLogger({
      logDir: tmpDir,
      enabled: false,
      bufferEvents: true,
    });
    logger.init();

    logger.logEncode({
      source: "a",
      target: "b",
      messageId: "m",
      nonce: "n",
      transport: "tpc",
    });

    // bufferEvents still works (it's independent of file writing)
    expect(logger.getBufferedEvents().length).toBe(1);

    // But no files should be written
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBe(0);

    logger.shutdown();
  });
});
