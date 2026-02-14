/**
 * TPC (Tonal Pulse Communication) — Public API
 *
 * The default protocol for all agent-to-agent communication in ClosedClaw.
 * Text-based ClawTalk is the fallback, used only for human-facing I/O
 * or when TPC infrastructure is unavailable (logged as security event).
 *
 * Pipeline:
 *   Encode: CT/1 text → TPC envelope → sign → FEC → AFSK → WAV → dead-drop
 *   Decode: dead-drop → WAV → AFSK demod → FEC → verify → TPC envelope → CT/1 text
 */

import type {
  TPCConfig,
  TPCEncodeResult,
  TPCDecodeResult,
  TPCAuditEvent,
  SignedTPCEnvelope,
} from "./types.js";
import { DEFAULT_TPC_CONFIG } from "./types.js";
import {
  createEnvelope,
  signEnvelope,
  verify,
  isEnvelopeFresh,
  loadOrCreateKeyPair,
  loadPublicKey,
  generateMessageId,
  type KeyPair,
} from "./crypto-signer.js";
import { encodeToWav } from "./waveform-encoder.js";
import { decodeFromWav, WaveformDecodeError } from "./waveform-decoder.js";
import { DeadDropManager, type DeadDropConfig } from "./dead-drop.js";
import { NonceStore, type NonceStoreConfig } from "./nonce-store.js";

import type crypto from "node:crypto";

// ---------------------------------------------------------------------------
// TPC Runtime
// ---------------------------------------------------------------------------

/**
 * The TPC runtime manages the full encode/decode pipeline and
 * coordinates the dead-drop transport, nonce store, and cryptographic
 * signing for all agent-to-agent communication.
 */
export class TPCRuntime {
  private readonly config: TPCConfig;
  private keyPair: KeyPair | null = null;
  private deadDrop: DeadDropManager | null = null;
  private nonceStore: NonceStore | null = null;
  private auditLog: TPCAuditEvent[] = [];
  private initialized = false;

  constructor(config: Partial<TPCConfig> = {}) {
    this.config = { ...DEFAULT_TPC_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the TPC runtime: load keys, start dead-drop, open nonce store.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.mode !== "file") {
      throw new TPCUnsupportedTransportError(
        `Unsupported TPC transport: ${this.config.mode}. Only file transport is implemented.`,
      );
    }

    // Load or generate Ed25519 keypair
    this.keyPair = await loadOrCreateKeyPair(
      this.config.keyPath,
      this.config.publicKeyPath,
    );

    // Initialize dead-drop manager
    this.deadDrop = new DeadDropManager({
      basePath: this.config.deadDropPath,
      pollingInterval: this.config.pollingInterval,
      archiveTtlMs: 24 * 60 * 60 * 1000, // 24 hours
      cleanupIntervalMs: 60 * 60 * 1000,   // 1 hour
    });
    await this.deadDrop.start();

    // Initialize nonce store
    this.nonceStore = new NonceStore({
      storePath: this.config.nonceStorePath,
      nonceTtlSeconds: 3600, // 1 hour
      maxEntries: 10000,
    });

    this.initialized = true;
  }

  /**
   * Shut down the TPC runtime gracefully.
   */
  async shutdown(): Promise<void> {
    if (this.deadDrop) {
      await this.deadDrop.stop();
      this.deadDrop = null;
    }
    if (this.nonceStore) {
      await this.nonceStore.close();
      this.nonceStore = null;
    }
    this.initialized = false;
  }

  /**
   * Check if the TPC runtime is initialized and ready.
   */
  isReady(): boolean {
    return this.initialized && this.keyPair !== null;
  }

  // -------------------------------------------------------------------------
  // Encode (CT/1 → WAV → dead-drop)
  // -------------------------------------------------------------------------

  /**
   * Encode a CT/1 message as a TPC WAV file and write to the target
   * agent's dead-drop inbox.
   *
   * This is the primary encoding path used for all agent-to-agent
   * communication by default.
   */
  async encode(params: {
    payload: string;
    sourceAgent: string;
    targetAgent: string;
  }): Promise<TPCEncodeResult> {
    this.ensureReady();
    const start = performance.now();

    // 1. Create TPC envelope
    const envelope = createEnvelope({
      payload: params.payload,
      sourceAgent: params.sourceAgent,
      targetAgent: params.targetAgent,
    });

    // 2. Sign the envelope
    const signed = signEnvelope(envelope, this.keyPair!.privateKey);

    // 3. Encode to WAV (serialization → FEC → AFSK → WAV)
    const wavData = encodeToWav(signed);

    // 4. Write to dead-drop inbox
    const filePath = await this.deadDrop!.writeMessage({
      targetAgent: params.targetAgent,
      wavData,
      messageId: envelope.messageId,
    });

    const encodingMs = performance.now() - start;

    // 5. Audit log
    this.logAudit({
      event: "tpc_encode",
      timestamp: Date.now(),
      messageId: envelope.messageId,
      sourceAgent: params.sourceAgent,
      targetAgent: params.targetAgent,
      metadata: { filePath, fileSize: wavData.length, encodingMs },
    });

    return {
      filePath,
      messageId: envelope.messageId,
      fileSize: wavData.length,
      encodingMs,
    };
  }

  /**
   * Encode a CT/1 message to a WAV buffer without writing to disk.
   * Useful for testing or custom transport.
   */
  encodeToBuffer(params: {
    payload: string;
    sourceAgent: string;
    targetAgent: string;
  }): { wavData: Buffer; signed: SignedTPCEnvelope } {
    this.ensureReady();

    const envelope = createEnvelope({
      payload: params.payload,
      sourceAgent: params.sourceAgent,
      targetAgent: params.targetAgent,
    });

    const signed = signEnvelope(envelope, this.keyPair!.privateKey);
    const wavData = encodeToWav(signed);

    return { wavData, signed };
  }

  // -------------------------------------------------------------------------
  // Decode (dead-drop → WAV → CT/1)
  // -------------------------------------------------------------------------

  /**
   * Decode a TPC WAV file from the dead-drop, verifying signature,
   * freshness, and nonce uniqueness.
   *
   * Returns the validated CT/1 payload or throws on failure.
   */
  async decode(params: {
    filePath: string;
  }): Promise<TPCDecodeResult> {
    this.ensureReady();
    const start = performance.now();

    // 1. Read WAV from dead-drop (moves to archive)
    const wavData = await this.deadDrop!.readMessage(params.filePath);

    // 2. Decode WAV → SignedTPCEnvelope
    let signed: SignedTPCEnvelope;
    try {
      signed = decodeFromWav(wavData);
    } catch (e) {
      const reason = e instanceof WaveformDecodeError ? e.message : String(e);
      this.logAudit({
        event: "dead_drop_error",
        timestamp: Date.now(),
        reason: `Decode failed: ${reason}`,
        metadata: { filePath: params.filePath },
      });
      throw e;
    }

    // 3. Verify signature
    const signatureValid = verify(signed, this.keyPair!.publicKey);
    if (!signatureValid) {
      this.logAudit({
        event: "signature_failure",
        timestamp: Date.now(),
        messageId: signed.envelope.messageId,
        sourceAgent: signed.envelope.sourceAgent,
        targetAgent: signed.envelope.targetAgent,
        reason: "Ed25519 signature verification failed",
      });
      throw new TPCSecurityError("Signature verification failed");
    }

    // 4. Check freshness
    const fresh = isEnvelopeFresh(signed.envelope, this.config.maxMessageAge);
    if (!fresh) {
      this.logAudit({
        event: "message_expired",
        timestamp: Date.now(),
        messageId: signed.envelope.messageId,
        reason: `Message age exceeds ${this.config.maxMessageAge}s`,
      });
      throw new TPCSecurityError("Message expired");
    }

    // 5. Check nonce uniqueness
    const nonceUnique = this.nonceStore!.checkAndRecord(signed.envelope.nonce);
    if (!nonceUnique) {
      this.logAudit({
        event: "nonce_replay",
        timestamp: Date.now(),
        messageId: signed.envelope.messageId,
        reason: `Nonce replay detected: ${signed.envelope.nonce}`,
      });
      throw new TPCSecurityError("Replay attack detected: nonce already seen");
    }

    const decodingMs = performance.now() - start;

    // 6. Audit log
    this.logAudit({
      event: "tpc_decode",
      timestamp: Date.now(),
      messageId: signed.envelope.messageId,
      sourceAgent: signed.envelope.sourceAgent,
      targetAgent: signed.envelope.targetAgent,
      metadata: { signatureValid, fresh, nonceUnique, decodingMs },
    });

    return {
      payload: signed.envelope.payload,
      envelope: signed.envelope,
      signatureValid,
      fresh,
      nonceUnique,
      decodingMs,
    };
  }

  /**
   * Decode a WAV buffer directly (without dead-drop filesystem).
   * Performs full verification (signature, freshness, nonce).
   */
  decodeFromBuffer(wavData: Buffer): TPCDecodeResult {
    this.ensureReady();
    const start = performance.now();

    const signed = decodeFromWav(wavData);
    const signatureValid = verify(signed, this.keyPair!.publicKey);
    const fresh = isEnvelopeFresh(signed.envelope, this.config.maxMessageAge);
    const nonceUnique = this.nonceStore!.checkAndRecord(signed.envelope.nonce);

    return {
      payload: signed.envelope.payload,
      envelope: signed.envelope,
      signatureValid,
      fresh,
      nonceUnique,
      decodingMs: performance.now() - start,
    };
  }

  // -------------------------------------------------------------------------
  // Dead-drop access
  // -------------------------------------------------------------------------

  /**
   * Get the dead-drop manager for direct access.
   */
  getDeadDrop(): DeadDropManager {
    this.ensureReady();
    return this.deadDrop!;
  }

  /**
   * List pending messages for a specific agent.
   */
  listPendingMessages(agentId: string) {
    this.ensureReady();
    return this.deadDrop!.listMessages(agentId);
  }

  // -------------------------------------------------------------------------
  // Decision logic: should we fallback to text?
  // -------------------------------------------------------------------------

  /**
   * Determine if a message should fallback to text-based ClawTalk.
   *
   * TPC is the default for ALL agent-to-agent messages.
   * Text fallback only occurs when:
   *   1. TPC is globally disabled
   *   2. Communication is human-facing (not agent-to-agent)
   *   3. Dead-drop infrastructure is unavailable
   *   4. Explicit text override in CT/1 wire (tpc=false)
   */
  shouldFallbackToText(params: {
    isAgentToAgent: boolean;
    wire?: string;
    allowTextFallback?: boolean;
  }): boolean {
    const transportSupported = this.config.mode === "file";

    // Enforced mode: do not permit text fallback for agent-to-agent traffic.
    if (params.isAgentToAgent && this.config.enforceForAgentToAgent) {
      if (!this.config.enabled) {
        this.logAudit({
          event: "text_fallback",
          timestamp: Date.now(),
          reason: "TPC disabled but enforcement is on; refusing text fallback",
        });
      } else if (!transportSupported) {
        this.logAudit({
          event: "text_fallback",
          timestamp: Date.now(),
          reason: `Unsupported transport ${this.config.mode}; enforcement blocks fallback`,
        });
      } else if (!this.initialized) {
        this.logAudit({
          event: "text_fallback",
          timestamp: Date.now(),
          reason: "Enforced TPC is not initialized; refusing text fallback",
        });
      }
      return false;
    }

    // TPC disabled globally → always text
    if (!this.config.enabled) return true;

    // Unsupported transport → text fallback allowed for non-enforced paths
    if (!transportSupported) {
      this.logAudit({
        event: "text_fallback",
        timestamp: Date.now(),
        reason: `Unsupported transport mode: ${this.config.mode}`,
      });
      return true;
    }

    // Human-facing → text (can't encode to acoustic for user readability)
    if (!params.isAgentToAgent) return true;

    // TPC not initialized → emergency text fallback
    if (!this.initialized) {
      this.logAudit({
        event: "text_fallback",
        timestamp: Date.now(),
        reason: "TPC runtime not initialized",
      });
      return true;
    }

    // Explicit text override in wire format
    if (params.wire?.includes("tpc=false")) {
      this.logAudit({
        event: "text_fallback",
        timestamp: Date.now(),
        reason: "Explicit tpc=false in wire",
      });
      return true;
    }

    // Agent explicitly allows text fallback
    if (params.allowTextFallback && this.config.allowTextFallback) {
      this.logAudit({
        event: "text_fallback",
        timestamp: Date.now(),
        reason: "Agent allowTextFallback + config allows",
      });
      return true;
    }

    // Default: use TPC (do NOT fallback to text)
    return false;
  }

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  /**
   * Get recent audit events (in-memory buffer).
   */
  getAuditLog(): readonly TPCAuditEvent[] {
    return this.auditLog;
  }

  /**
   * Clear the in-memory audit buffer.
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  private logAudit(event: TPCAuditEvent): void {
    this.auditLog.push(event);

    // Keep in-memory buffer bounded
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private ensureReady(): void {
    if (!this.config.enabled) {
      throw new TPCDisabledError("TPC is disabled by configuration");
    }
    if (this.config.mode !== "file") {
      throw new TPCUnsupportedTransportError(
        `Unsupported TPC transport: ${this.config.mode}. Only file transport is implemented.`,
      );
    }
    if (!this.initialized) {
      throw new TPCNotInitializedError(
        "TPC runtime not initialized. Call initialize() first.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TPCSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TPCSecurityError";
  }
}

export class TPCNotInitializedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TPCNotInitializedError";
  }
}

export class TPCUnsupportedTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TPCUnsupportedTransportError";
  }
}

export class TPCDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TPCDisabledError";
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

// Types
export type {
  TPCConfig,
  TPCEncodeResult,
  TPCDecodeResult,
  TPCAuditEvent,
  TPCAuditEventType,
  TPCEnvelope,
  SignedTPCEnvelope,
  TPCTransportMode,
  TPCFecScheme,
  TPCSignatureScheme,
  AFSKParams,
  HardwareProfile,
} from "./types.js";
export { DEFAULT_TPC_CONFIG, DEFAULT_AFSK_PARAMS, ULTRASONIC_AFSK_PARAMS } from "./types.js";

// Crypto
export {
  generateKeyPair,
  exportKeyPair,
  loadOrCreateKeyPair,
  loadPublicKey,
  createEnvelope,
  createSignedEnvelope,
  signEnvelope,
  verify,
  verifyEnvelope,
  verifyEnvelopeHmac,
  isEnvelopeFresh,
  generateNonce,
  generateMessageId,
  canonicalize,
} from "./crypto-signer.js";

// Waveform
export { encodeToWav, estimateWavSize } from "./waveform-encoder.js";
export { decodeFromWav, WaveformDecodeError } from "./waveform-decoder.js";

// Reed-Solomon
export {
  rsEncode,
  rsDecode,
  rsEncodePayload,
  rsDecodePayload,
  ReedSolomonError,
} from "./reed-solomon.js";

// Dead-drop
export {
  DeadDropManager,
  type DeadDropConfig,
  type DeadDropMessage,
} from "./dead-drop.js";

// Nonce store
export {
  NonceStore,
  type NonceStoreConfig,
} from "./nonce-store.js";

// Profile selector (hardware probe + mode selection)
export {
  selectProfile,
  checkAudioDevices,
  getAFSKParamsForMode,
  invalidateCache,
  ULTRASONIC_AFSK_PARAMS as ULTRASONIC_PARAMS,
  AUDIBLE_AFSK_PARAMS,
} from "./profile-selector.js";

// Circuit breaker (dead-drop health monitoring)
export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitState,
} from "./circuit-breaker.js";

// Key rotation (scheduled key replacement with grace period)
export {
  KeyRotationManager,
  type KeyRotationConfig,
} from "./key-rotation.js";

// Rate limiter (per-agent sliding window)
export {
  RateLimiter,
  type RateLimiterConfig,
} from "./rate-limiter.js";

// Audit logger (JSONL structured event logging)
export {
  AuditLogger,
  type AuditLoggerConfig,
  type AuditLogEntry,
  type AuditSeverity,
} from "./audit-logger.js";
