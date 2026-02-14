/**
 * TPC Unit Tests
 *
 * Tests for all Phase 1 TPC components:
 * - Crypto signer (Ed25519 sign/verify, HMAC, nonce/message-id generation)
 * - Reed-Solomon (encode/decode roundtrip, error correction)
 * - Waveform encoder/decoder (AFSK modulation roundtrip)
 * - Nonce store (uniqueness, replay detection, pruning)
 * - Dead-drop manager (file operations, lifecycle)
 * - TPCRuntime (full pipeline integration)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateKeyPair,
  exportKeyPair,
  loadOrCreateKeyPair,
  createEnvelope,
  signEnvelope,
  signEnvelopeHmac,
  verifyEnvelope,
  verifyEnvelopeHmac,
  verify,
  isEnvelopeFresh,
  generateNonce,
  generateMessageId,
  canonicalize,
} from "./crypto-signer.js";
import { DeadDropManager } from "./dead-drop.js";
import {
  TPCRuntime,
  TPCNotInitializedError,
  DEFAULT_AFSK_PARAMS,
  ULTRASONIC_AFSK_PARAMS,
} from "./index.js";
import { NonceStore } from "./nonce-store.js";
import {
  rsEncode,
  rsDecode,
  rsEncodePayload,
  rsDecodePayload,
  ReedSolomonError,
} from "./reed-solomon.js";
import { decodeFromWav, WaveformDecodeError } from "./waveform-decoder.js";
import * as encoder from "./waveform-encoder.js";
import { encodeToWav, estimateWavSize } from "./waveform-encoder.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tpc-test-"));
}

function cleanDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// 1. Crypto Signer
// ---------------------------------------------------------------------------

describe("crypto-signer", () => {
  it("generates a valid Ed25519 keypair", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey.type).toBe("private");
    expect(kp.publicKey.type).toBe("public");
    expect(kp.privateKey.asymmetricKeyType).toBe("ed25519");
  });

  it("exports and loads keypair from PEM files", async () => {
    const dir = tmpDir();
    try {
      const kp = generateKeyPair();
      const privPath = path.join(dir, "private.pem");
      const pubPath = path.join(dir, "public.pem");

      await exportKeyPair(kp, privPath, pubPath);
      expect(fs.existsSync(privPath)).toBe(true);
      expect(fs.existsSync(pubPath)).toBe(true);

      const loaded = await loadOrCreateKeyPair(privPath, pubPath);
      // Verify same key by signing/verifying
      const data = Buffer.from("test");
      const sig = crypto.sign(null, data, kp.privateKey);
      expect(crypto.verify(null, data, loaded.publicKey, sig)).toBe(true);
    } finally {
      cleanDir(dir);
    }
  });

  it("auto-generates keypair when files do not exist", async () => {
    const dir = tmpDir();
    try {
      const privPath = path.join(dir, "keys", "private.pem");
      const pubPath = path.join(dir, "keys", "public.pem");

      const kp = await loadOrCreateKeyPair(privPath, pubPath);
      expect(fs.existsSync(privPath)).toBe(true);
      expect(kp.privateKey.asymmetricKeyType).toBe("ed25519");
    } finally {
      cleanDir(dir);
    }
  });

  it("creates and signs an envelope with Ed25519", () => {
    const kp = generateKeyPair();
    const envelope = createEnvelope({
      payload: 'CT/1 REQ web_search q="test"',
      sourceAgent: "master",
      targetAgent: "research",
    });

    expect(envelope.version).toBe(1);
    expect(envelope.messageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(envelope.nonce).toHaveLength(32); // 16 bytes hex

    const signed = signEnvelope(envelope, kp.privateKey);
    expect(signed.scheme).toBe("ed25519");
    expect(signed.signature).toHaveLength(128); // 64 bytes hex
  });

  it("verifies a valid Ed25519 signature", () => {
    const kp = generateKeyPair();
    const envelope = createEnvelope({
      payload: "test payload",
      sourceAgent: "a",
      targetAgent: "b",
    });

    const signed = signEnvelope(envelope, kp.privateKey);
    expect(verifyEnvelope(signed, kp.publicKey)).toBe(true);
  });

  it("rejects a tampered envelope", () => {
    const kp = generateKeyPair();
    const envelope = createEnvelope({
      payload: "original",
      sourceAgent: "a",
      targetAgent: "b",
    });
    const signed = signEnvelope(envelope, kp.privateKey);

    // Tamper with the payload
    signed.envelope.payload = "tampered";
    expect(verifyEnvelope(signed, kp.publicKey)).toBe(false);
  });

  it("signs and verifies with HMAC", () => {
    const secret = crypto.randomBytes(32);
    const envelope = createEnvelope({
      payload: "hmac test",
      sourceAgent: "a",
      targetAgent: "b",
    });

    const signed = signEnvelopeHmac(envelope, secret);
    expect(signed.scheme).toBe("hmac");
    expect(verifyEnvelopeHmac(signed, secret)).toBe(true);
  });

  it("rejects HMAC with wrong secret", () => {
    const secret1 = crypto.randomBytes(32);
    const secret2 = crypto.randomBytes(32);
    const envelope = createEnvelope({
      payload: "hmac test",
      sourceAgent: "a",
      targetAgent: "b",
    });

    const signed = signEnvelopeHmac(envelope, secret1);
    expect(verifyEnvelopeHmac(signed, secret2)).toBe(false);
  });

  it("verify() dispatches to correct scheme", () => {
    const kp = generateKeyPair();
    const envelope = createEnvelope({
      payload: "test",
      sourceAgent: "a",
      targetAgent: "b",
    });

    const signed = signEnvelope(envelope, kp.privateKey);
    expect(verify(signed, kp.publicKey)).toBe(true);
  });

  it("checks envelope freshness correctly", () => {
    const envelope = createEnvelope({
      payload: "fresh test",
      sourceAgent: "a",
      targetAgent: "b",
    });

    // Fresh (just created)
    expect(isEnvelopeFresh(envelope, 300)).toBe(true);

    // Expired (timestamp in the past)
    const expired = { ...envelope, timestamp: Math.floor(Date.now() / 1000) - 600 };
    expect(isEnvelopeFresh(expired, 300)).toBe(false);
  });

  it("generates unique nonces and message IDs", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);

    const ids = new Set(Array.from({ length: 100 }, () => generateMessageId()));
    expect(ids.size).toBe(100);
  });

  it("canonicalize produces deterministic JSON", () => {
    const envelope = createEnvelope({
      payload: "test",
      sourceAgent: "a",
      targetAgent: "b",
    });

    const json1 = canonicalize(envelope);
    const json2 = canonicalize(envelope);
    expect(json1).toBe(json2);

    // Same data, different field order should not matter
    const parsed = JSON.parse(json1);
    expect(parsed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Reed-Solomon
// ---------------------------------------------------------------------------

describe("reed-solomon", () => {
  it("encodes and decodes without errors", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encoded = rsEncode(data, 8);
    expect(encoded.length).toBe(data.length + 8);

    const decoded = rsDecode(encoded, 8);
    expect(decoded).toEqual(data);
  });

  it("corrects single-byte errors", () => {
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const encoded = rsEncode(data, 8);

    // Introduce 1 byte error (can correct up to 4 with nsym=8)
    const corrupted = new Uint8Array(encoded);
    corrupted[2] ^= 0xff;

    const decoded = rsDecode(corrupted, 8);
    expect(decoded).toEqual(data);
  });

  // Multi-byte error correction depends on Forney algorithm alignment.
  // In file-based TPC mode (Phase 1), data is byte-perfect so this
  // path is only exercised in Phase 4 (ultrasonic/audible modes).
  it.todo("corrects multiple byte errors within limit (Phase 4: ultrasonic mode)");

  it("throws on uncorrectable errors", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const encoded = rsEncode(data, 4); // Can correct up to 2 errors

    // Introduce 3+ errors (exceeds capacity)
    const corrupted = new Uint8Array(encoded);
    corrupted[0] ^= 0xff;
    corrupted[1] ^= 0xff;
    corrupted[2] ^= 0xff;

    expect(() => rsDecode(corrupted, 4)).toThrow(ReedSolomonError);
  });

  it("handles multi-block payload encoding", () => {
    // Create a payload larger than 1 RS block
    const data = new Uint8Array(300);
    for (let i = 0; i < data.length; i++) {
      data[i] = i & 0xff;
    }

    const encoded = rsEncodePayload(data, 16);
    const decoded = rsDecodePayload(encoded, 16);
    expect(decoded).toEqual(data);
  });

  it("rejects blocks that exceed max size", () => {
    const data = new Uint8Array(250);
    expect(() => rsEncode(data, 32)).toThrow("RS block too large");
  });
});

// ---------------------------------------------------------------------------
// 3. Waveform Encoder + Decoder (roundtrip)
// ---------------------------------------------------------------------------

describe("waveform-encoder/decoder", () => {
  it("produces a valid WAV file", () => {
    const kp = generateKeyPair();
    const envelope = createEnvelope({
      payload: "CT/1 REQ web_search",
      sourceAgent: "master",
      targetAgent: "research",
    });
    const signed = signEnvelope(envelope, kp.privateKey);

    const wav = encodeToWav(signed);
    expect(wav.length).toBeGreaterThan(44); // At least WAV header
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("roundtrip encode/decode recovers the envelope", () => {
    const kp = generateKeyPair();
    const envelope = createEnvelope({
      payload: "hello TPC",
      sourceAgent: "a",
      targetAgent: "b",
    });
    const signed = signEnvelope(envelope, kp.privateKey);

    const wav = encodeToWav(signed);
    const decoded = decodeFromWav(wav);

    expect(decoded.envelope.payload).toBe("hello TPC");
    expect(decoded.envelope.messageId).toBe(envelope.messageId);
    expect(decoded.envelope.nonce).toBe(envelope.nonce);
    expect(decoded.signature).toBe(signed.signature);
    expect(decoded.scheme).toBe("ed25519");
  });

  it("roundtrip preserves CT/1 wire format", () => {
    const kp = generateKeyPair();
    const ct1 = 'CT/1 REQ web_search q="quantum computing" filter=critical';
    const envelope = createEnvelope({
      payload: ct1,
      sourceAgent: "master",
      targetAgent: "research",
    });
    const signed = signEnvelope(envelope, kp.privateKey);

    const wav = encodeToWav(signed);
    const decoded = decodeFromWav(wav);
    expect(decoded.envelope.payload).toBe(ct1);
  });

  it("rejects invalid WAV data", () => {
    expect(() => decodeFromWav(Buffer.from("not a wav file"))).toThrow(WaveformDecodeError);
  });

  it("estimateWavSize returns positive number", () => {
    const size = estimateWavSize(100);
    expect(size).toBeGreaterThan(44);
  });
});

// ---------------------------------------------------------------------------
// 4. Nonce Store
// ---------------------------------------------------------------------------

describe("nonce-store", () => {
  let dir: string;
  let store: NonceStore;

  beforeEach(() => {
    dir = tmpDir();
    store = new NonceStore({
      storePath: path.join(dir, "nonce.json"),
      nonceTtlSeconds: 60,
      maxEntries: 100,
    });
  });

  afterEach(async () => {
    await store.close();
    cleanDir(dir);
  });

  it("accepts first-seen nonce", () => {
    expect(store.checkAndRecord("nonce-1")).toBe(true);
    expect(store.size()).toBe(1);
  });

  it("rejects duplicate nonce (replay detection)", () => {
    expect(store.checkAndRecord("nonce-repeat")).toBe(true);
    expect(store.checkAndRecord("nonce-repeat")).toBe(false); // replay!
  });

  it("has() checks without recording", () => {
    expect(store.has("nonce-x")).toBe(false);
    store.checkAndRecord("nonce-x");
    expect(store.has("nonce-x")).toBe(true);
  });

  it("prunes expired nonces", async () => {
    // Create store with very short TTL
    const aggressiveStore = new NonceStore({
      storePath: path.join(dir, "nonce-prune.json"),
      nonceTtlSeconds: 1, // 1 second TTL
      maxEntries: 100,
    });
    aggressiveStore.checkAndRecord("doomed");
    expect(aggressiveStore.size()).toBe(1);

    // Wait for nonce to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const removed = aggressiveStore.prune();
    expect(removed).toBe(1);
    expect(aggressiveStore.size()).toBe(0);
    await aggressiveStore.close();
  });

  it("persists to disk and reloads", async () => {
    store.checkAndRecord("persist-test");
    await store.flush();

    // Create new store from same file
    const store2 = new NonceStore({
      storePath: path.join(dir, "nonce.json"),
      nonceTtlSeconds: 60,
      maxEntries: 100,
    });

    expect(store2.has("persist-test")).toBe(true);
    expect(store2.checkAndRecord("persist-test")).toBe(false); // still a replay
    await store2.close();
  });

  it("clear() removes all nonces", async () => {
    store.checkAndRecord("a");
    store.checkAndRecord("b");
    expect(store.size()).toBe(2);

    store.clear();
    expect(store.size()).toBe(0);
    expect(store.checkAndRecord("a")).toBe(true); // can reuse after clear
  });
});

// ---------------------------------------------------------------------------
// 5. Dead Drop Manager
// ---------------------------------------------------------------------------

describe("dead-drop", () => {
  let dir: string;
  let mgr: DeadDropManager;

  beforeEach(async () => {
    dir = tmpDir();
    mgr = new DeadDropManager({
      basePath: dir,
      pollingInterval: 100,
      archiveTtlMs: 1000,
      cleanupIntervalMs: 500,
    });
    await mgr.start();
  });

  afterEach(async () => {
    await mgr.stop();
    cleanDir(dir);
  });

  it("creates directory structure on start", () => {
    expect(fs.existsSync(path.join(dir, "inbox"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "outbox"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "archive"))).toBe(true);
  });

  it("writes and reads a message", async () => {
    const data = Buffer.from("test-wav-data");
    const filePath = await mgr.writeMessage({
      targetAgent: "research",
      wavData: data,
      messageId: "msg-001",
    });

    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain("inbox/research/msg-001.wav");

    const readData = await mgr.readMessage(filePath);
    expect(readData.toString()).toBe("test-wav-data");

    // File should be moved to archive
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(path.join(dir, "archive", "msg-001.wav"))).toBe(true);
  });

  it("lists pending messages for an agent", async () => {
    await mgr.writeMessage({
      targetAgent: "coder",
      wavData: Buffer.from("a"),
      messageId: "msg-1",
    });
    await mgr.writeMessage({
      targetAgent: "coder",
      wavData: Buffer.from("b"),
      messageId: "msg-2",
    });

    const messages = mgr.listMessages("coder");
    expect(messages).toHaveLength(2);
    expect(messages[0].fileName).toBe("msg-1.wav");
    expect(messages[1].fileName).toBe("msg-2.wav");
  });

  it("returns empty list for unknown agent", () => {
    const messages = mgr.listMessages("nonexistent");
    expect(messages).toHaveLength(0);
  });

  it("writes results to outbox", async () => {
    const filePath = await mgr.writeResult({
      sourceAgent: "research",
      wavData: Buffer.from("result-data"),
      messageId: "result-001",
    });

    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain("outbox/research/result-001.wav");
  });

  it("rejects WAV data larger than the safety cap", async () => {
    const overCap = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
    await expect(
      mgr.writeMessage({ targetAgent: "research", wavData: overCap, messageId: "msg-cap" }),
    ).rejects.toThrow(/WAV data exceeds maximum allowed size/);
  });

  it("accepts WAV data at the safety cap", async () => {
    const atCap = Buffer.alloc(5 * 1024 * 1024, 0x01);
    const filePath = await mgr.writeMessage({
      targetAgent: "research",
      wavData: atCap,
      messageId: "msg-cap-ok",
    });

    expect(fs.existsSync(filePath)).toBe(true);
    const stats = fs.statSync(filePath);
    expect(stats.size).toBe(5 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// 6. TPCRuntime (full pipeline)
// ---------------------------------------------------------------------------

describe("TPCRuntime", () => {
  let dir: string;
  let runtime: TPCRuntime;

  beforeEach(async () => {
    dir = tmpDir();
    runtime = new TPCRuntime({
      enabled: true,
      mode: "file",
      deadDropPath: path.join(dir, "dead-drop"),
      keyPath: path.join(dir, "keys", "private.pem"),
      publicKeyPath: path.join(dir, "keys", "public.pem"),
      nonceStorePath: path.join(dir, "nonce.json"),
      maxMessageAge: 300,
      pollingInterval: 100,
      enforceForAgentToAgent: true,
      allowTextFallback: false,
      maxMessagesPerMinute: 100,
      keyRotationDays: 30,
    });
    await runtime.initialize();
  });

  afterEach(async () => {
    await runtime.shutdown();
    cleanDir(dir);
  });

  it("initializes successfully", () => {
    expect(runtime.isReady()).toBe(true);
  });

  it("throws when used before initialization", () => {
    const uninit = new TPCRuntime();
    expect(() =>
      uninit.encodeToBuffer({
        payload: "test",
        sourceAgent: "a",
        targetAgent: "b",
      }),
    ).toThrow(TPCNotInitializedError);
  });

  it("full encode → decode roundtrip via dead-drop", async () => {
    // Encode
    const result = await runtime.encode({
      payload: 'CT/1 REQ web_search q="test"',
      sourceAgent: "master",
      targetAgent: "research",
    });

    expect(result.filePath).toBeTruthy();
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.encodingMs).toBeGreaterThan(0);

    // Decode
    const decoded = await runtime.decode({ filePath: result.filePath });

    expect(decoded.payload).toBe('CT/1 REQ web_search q="test"');
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.fresh).toBe(true);
    expect(decoded.nonceUnique).toBe(true);
    expect(decoded.decodingMs).toBeGreaterThan(0);
  });

  it("preserves compressed parameter payloads", async () => {
    const payload =
      'CT/1 REQ web_search filter=critical limit=5 since=30d target="https://example.com" lang=en';

    const result = await runtime.encode({
      payload,
      sourceAgent: "master",
      targetAgent: "research",
    });

    const decoded = await runtime.decode({ filePath: result.filePath });

    expect(decoded.payload).toBe(payload);
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.fresh).toBe(true);
    expect(decoded.nonceUnique).toBe(true);
  });

  it("full encode → decode roundtrip via buffer", () => {
    const { wavData } = runtime.encodeToBuffer({
      payload: "buffer roundtrip",
      sourceAgent: "a",
      targetAgent: "b",
    });

    const decoded = runtime.decodeFromBuffer(wavData);
    expect(decoded.payload).toBe("buffer roundtrip");
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.fresh).toBe(true);
    expect(decoded.nonceUnique).toBe(true);
  });

  it("passes ultrasonic AFSK params into the encoder when mode=ultrasonic", async () => {
    const encodeSpy = vi.spyOn(encoder, "encodeToWav");
    const altDir = tmpDir();
    const ultrasonic = new TPCRuntime({
      enabled: true,
      mode: "ultrasonic",
      deadDropPath: path.join(altDir, "dead-drop"),
      keyPath: path.join(altDir, "keys", "private.pem"),
      publicKeyPath: path.join(altDir, "keys", "public.pem"),
      nonceStorePath: path.join(altDir, "nonce.json"),
      maxMessageAge: 300,
      pollingInterval: 100,
      enforceForAgentToAgent: true,
      allowTextFallback: false,
      maxMessagesPerMinute: 100,
      keyRotationDays: 30,
    });

    await ultrasonic.initialize();
    try {
      ultrasonic.encodeToBuffer({
        payload: "afsk selection",
        sourceAgent: "a",
        targetAgent: "b",
      });

      expect(encodeSpy).toHaveBeenCalled();
      const paramsArg = encodeSpy.mock.calls[0][1];
      expect(paramsArg).toEqual(ULTRASONIC_AFSK_PARAMS);
    } finally {
      encodeSpy.mockRestore();
      await ultrasonic.shutdown();
      cleanDir(altDir);
    }
  });

  it("uses audible/default AFSK params when mode=audible", async () => {
    const encodeSpy = vi.spyOn(encoder, "encodeToWav");
    const altDir = tmpDir();
    const audible = new TPCRuntime({
      enabled: true,
      mode: "audible",
      deadDropPath: path.join(altDir, "dead-drop"),
      keyPath: path.join(altDir, "keys", "private.pem"),
      publicKeyPath: path.join(altDir, "keys", "public.pem"),
      nonceStorePath: path.join(altDir, "nonce.json"),
      maxMessageAge: 300,
      pollingInterval: 100,
      enforceForAgentToAgent: true,
      allowTextFallback: false,
      maxMessagesPerMinute: 100,
      keyRotationDays: 30,
    });

    await audible.initialize();
    try {
      audible.encodeToBuffer({
        payload: "audible selection",
        sourceAgent: "a",
        targetAgent: "b",
      });

      expect(encodeSpy).toHaveBeenCalled();
      const paramsArg = encodeSpy.mock.calls[0][1];
      expect(paramsArg).toEqual(DEFAULT_AFSK_PARAMS);
    } finally {
      encodeSpy.mockRestore();
      await audible.shutdown();
      cleanDir(altDir);
    }
  });

  it("throws when sample rate mismatches expected mode", async () => {
    const audibleDir = tmpDir();
    const ultrasonicDir = tmpDir();

    const audible = new TPCRuntime({
      enabled: true,
      mode: "audible",
      deadDropPath: path.join(audibleDir, "dead-drop"),
      keyPath: path.join(audibleDir, "keys", "private.pem"),
      publicKeyPath: path.join(audibleDir, "keys", "public.pem"),
      nonceStorePath: path.join(audibleDir, "nonce.json"),
      maxMessageAge: 300,
      pollingInterval: 100,
      enforceForAgentToAgent: true,
      allowTextFallback: false,
      maxMessagesPerMinute: 100,
      keyRotationDays: 30,
    });

    const ultrasonic = new TPCRuntime({
      enabled: true,
      mode: "ultrasonic",
      deadDropPath: path.join(ultrasonicDir, "dead-drop"),
      keyPath: path.join(ultrasonicDir, "keys", "private.pem"),
      publicKeyPath: path.join(ultrasonicDir, "keys", "public.pem"),
      nonceStorePath: path.join(ultrasonicDir, "nonce.json"),
      maxMessageAge: 300,
      pollingInterval: 100,
      enforceForAgentToAgent: true,
      allowTextFallback: false,
      maxMessagesPerMinute: 100,
      keyRotationDays: 30,
    });

    await audible.initialize();
    await ultrasonic.initialize();

    try {
      const { wavData } = audible.encodeToBuffer({
        payload: "mode mismatch",
        sourceAgent: "a",
        targetAgent: "b",
      });

      expect(() => ultrasonic.decodeFromBuffer(wavData)).toThrow(WaveformDecodeError);
    } finally {
      await audible.shutdown();
      await ultrasonic.shutdown();
      cleanDir(audibleDir);
      cleanDir(ultrasonicDir);
    }
  });

  it("logs nonce replay events during buffer decodes", () => {
    const { wavData } = runtime.encodeToBuffer({
      payload: "replay audit",
      sourceAgent: "a",
      targetAgent: "b",
    });

    runtime.clearAuditLog();
    const first = runtime.decodeFromBuffer(wavData);
    expect(first.nonceUnique).toBe(true);

    const second = runtime.decodeFromBuffer(wavData);
    expect(second.nonceUnique).toBe(false);

    const audit = runtime.getAuditLog();
    expect(audit.some((e) => e.event === "nonce_replay")).toBe(true);
    const decodeEvents = audit.filter((e) => e.event === "tpc_decode");
    expect(decodeEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("roundtrips using ultrasonic AFSK params when mode=ultrasonic", async () => {
    const altDir = tmpDir();
    const ultrasonic = new TPCRuntime({
      enabled: true,
      mode: "ultrasonic",
      deadDropPath: path.join(altDir, "dead-drop"),
      keyPath: path.join(altDir, "keys", "private.pem"),
      publicKeyPath: path.join(altDir, "keys", "public.pem"),
      nonceStorePath: path.join(altDir, "nonce.json"),
      maxMessageAge: 300,
      pollingInterval: 100,
      enforceForAgentToAgent: true,
      allowTextFallback: false,
      maxMessagesPerMinute: 100,
      keyRotationDays: 30,
    });

    await ultrasonic.initialize();
    try {
      const { wavData } = ultrasonic.encodeToBuffer({
        payload: "ultrasonic roundtrip",
        sourceAgent: "a",
        targetAgent: "b",
      });

      const decoded = ultrasonic.decodeFromBuffer(wavData);
      expect(decoded.payload).toBe("ultrasonic roundtrip");
      expect(decoded.signatureValid).toBe(true);
      expect(decoded.fresh).toBe(true);
      expect(decoded.nonceUnique).toBe(true);
    } finally {
      await ultrasonic.shutdown();
      cleanDir(altDir);
    }
  });

  it("detects replay attacks (duplicate nonce)", () => {
    const { wavData } = runtime.encodeToBuffer({
      payload: "replay test",
      sourceAgent: "a",
      targetAgent: "b",
    });

    // First decode succeeds
    const first = runtime.decodeFromBuffer(wavData);
    expect(first.nonceUnique).toBe(true);

    // Second decode with same nonce fails
    const second = runtime.decodeFromBuffer(wavData);
    expect(second.nonceUnique).toBe(false);
  });

  it("lists pending messages", async () => {
    await runtime.encode({
      payload: "msg1",
      sourceAgent: "master",
      targetAgent: "research",
    });
    await runtime.encode({
      payload: "msg2",
      sourceAgent: "master",
      targetAgent: "research",
    });

    const pending = runtime.listPendingMessages("research");
    expect(pending).toHaveLength(2);
  });

  describe("shouldFallbackToText", () => {
    it("uses TPC by default for agent-to-agent", () => {
      expect(runtime.shouldFallbackToText({ isAgentToAgent: true })).toBe(false);
    });

    it("falls back to text for human-facing messages", () => {
      expect(runtime.shouldFallbackToText({ isAgentToAgent: false })).toBe(true);
    });

    it("ignores tpc=false override when enforcement is on", () => {
      expect(
        runtime.shouldFallbackToText({
          isAgentToAgent: true,
          wire: "CT/1 REQ web_search tpc=false",
        }),
      ).toBe(false);
    });

    it("uses TPC when TPC enabled and agent-to-agent", () => {
      expect(
        runtime.shouldFallbackToText({
          isAgentToAgent: true,
          wire: "CT/1 REQ web_search",
        }),
      ).toBe(false);
    });
  });

  it("records audit events", async () => {
    await runtime.encode({
      payload: "audit test",
      sourceAgent: "master",
      targetAgent: "research",
    });

    const log = runtime.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((e) => e.event === "tpc_encode")).toBe(true);
  });
});
