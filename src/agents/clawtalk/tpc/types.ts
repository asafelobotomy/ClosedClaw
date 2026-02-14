/**
 * TPC (Tonal Pulse Communication) Type Definitions
 *
 * Core types for the acoustic/non-textual agent-to-agent protocol.
 * TPC is the default communication protocol for all inter-agent messages.
 * Text-based ClawTalk is the fallback, used only for human-facing I/O.
 */

// ---------------------------------------------------------------------------
// Transport modes
// ---------------------------------------------------------------------------

/** Supported TPC transport modes, ordered by preference */
export type TPCTransportMode = "file" | "ultrasonic" | "audible" | "auto";

/** FEC schemes for error correction */
export type TPCFecScheme = "reed-solomon" | "crc32";

/** Signature scheme for authentication */
export type TPCSignatureScheme = "ed25519" | "hmac";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TPCConfig {
  /** Whether TPC is enabled (default: true — secure by default) */
  enabled: boolean;
  /** Transport mode (default: "file") */
  mode: TPCTransportMode;
  /** Path to dead-drop directory for file-based transport */
  deadDropPath: string;
  /** Run hardware probe on startup for ultrasonic mode */
  hardwareProbeOnStart?: boolean;
  /** FEC scheme (default: "reed-solomon") */
  fecScheme: TPCFecScheme;
  /** Signature scheme (default: "ed25519") */
  signatureScheme: TPCSignatureScheme;
  /** Path to Ed25519 private key */
  keyPath: string;
  /** Path to Ed25519 public key */
  publicKeyPath: string;
  /** Path to nonce store for replay prevention */
  nonceStorePath: string;
  /** Maximum message age in seconds (default: 300) */
  maxMessageAge: number;
  /** Dead-drop polling interval in ms (default: 1000) */
  pollingInterval: number;
  /** Enforce TPC for all agent-to-agent messages (default: true) */
  enforceForAgentToAgent: boolean;
  /** Allow text fallback in emergencies (default: false) */
  allowTextFallback: boolean;
  /** Key rotation period in days (default: 30) */
  keyRotationDays: number;
  /** Rate limit: max messages per minute per agent (default: 100) */
  maxMessagesPerMinute: number;
}

/** Default TPC configuration — secure by default */
export const DEFAULT_TPC_CONFIG: TPCConfig = {
  enabled: true,
  mode: "file",
  deadDropPath: "~/.closedclaw/tpc/dead-drop",
  hardwareProbeOnStart: false,
  fecScheme: "reed-solomon",
  signatureScheme: "ed25519",
  keyPath: "~/.closedclaw/tpc/keys/private.pem",
  publicKeyPath: "~/.closedclaw/tpc/keys/public.pem",
  nonceStorePath: "~/.closedclaw/tpc/nonce.json",
  maxMessageAge: 300,
  pollingInterval: 1000,
  enforceForAgentToAgent: true,
  allowTextFallback: false,
  keyRotationDays: 30,
  maxMessagesPerMinute: 100,
};

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

/** A TPC envelope wrapping a CT/1 message for acoustic transport */
export interface TPCEnvelope {
  /** Protocol version */
  version: 1;
  /** Message identifier (UUID) */
  messageId: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** 128-bit random nonce (hex string) */
  nonce: string;
  /** Source agent identifier */
  sourceAgent: string;
  /** Target agent identifier */
  targetAgent: string;
  /** Optional compression dictionary version applied to payload */
  compressionVersion?: number;
  /** The CT/1 wire format payload being transported */
  payload: string;
}

/** A signed TPC envelope ready for modulation */
export interface SignedTPCEnvelope {
  /** The envelope data */
  envelope: TPCEnvelope;
  /** Ed25519 or HMAC signature over the envelope (hex string) */
  signature: string;
  /** Signature scheme used */
  scheme: TPCSignatureScheme;
}

/** Result of encoding a message to TPC format */
export interface TPCEncodeResult {
  /** Path to the WAV/PCM file written to dead-drop */
  filePath: string;
  /** Message ID for tracking */
  messageId: string;
  /** Size of the WAV file in bytes */
  fileSize: number;
  /** Encoding latency in milliseconds */
  encodingMs: number;
}

/** Result of decoding a TPC message */
export interface TPCDecodeResult {
  /** The validated CT/1 payload */
  payload: string;
  /** The full envelope metadata */
  envelope: TPCEnvelope;
  /** Whether signature verification passed */
  signatureValid: boolean;
  /** Whether the message is fresh (within maxMessageAge) */
  fresh: boolean;
  /** Whether the nonce is unique (not replayed) */
  nonceUnique: boolean;
  /** Decoding latency in milliseconds */
  decodingMs: number;
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export type TPCAuditEventType =
  | "tpc_encode"
  | "tpc_decode"
  | "text_fallback"
  | "signature_failure"
  | "nonce_replay"
  | "message_expired"
  | "rate_limited"
  | "key_rotation"
  | "dead_drop_error";

export interface TPCAuditEvent {
  /** Event type */
  event: TPCAuditEventType;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Message ID (if applicable) */
  messageId?: string;
  /** Source agent */
  sourceAgent?: string;
  /** Target agent */
  targetAgent?: string;
  /** Reason for the event */
  reason?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// FSK modulation parameters
// ---------------------------------------------------------------------------

/** AFSK modulation parameters for file-based TPC */
export interface AFSKParams {
  /** Frequency for binary 0 (Hz) — default: 1200 */
  freq0: number;
  /** Frequency for binary 1 (Hz) — default: 2400 */
  freq1: number;
  /** Sample rate (Hz) — default: 44100 */
  sampleRate: number;
  /** Baud rate (bits/sec) — default: 300 */
  baudRate: number;
  /** Bits per sample in WAV output — default: 16 */
  bitsPerSample: number;
  /** Number of audio channels — default: 1 (mono) */
  channels: number;
}

/** Default AFSK parameters (Bell 202 compatible — audible fallback) */
export const DEFAULT_AFSK_PARAMS: AFSKParams = {
  freq0: 1200,
  freq1: 2400,
  sampleRate: 44100,
  baudRate: 300,
  bitsPerSample: 16,
  channels: 1,
};

/** Ultrasonic AFSK parameters (18/20 kHz carriers, inaudible to most humans) */
export const ULTRASONIC_AFSK_PARAMS: AFSKParams = {
  freq0: 18000,
  freq1: 20000,
  sampleRate: 48000,
  baudRate: 150, // Lower baud for ultrasonic reliability
  bitsPerSample: 16,
  channels: 1,
};

// ---------------------------------------------------------------------------
// Hardware probe
// ---------------------------------------------------------------------------

export interface HardwareProfile {
  /** Whether ultrasonic mode is supported */
  ultrasonicSupported: boolean;
  /** Selected transport mode based on probe */
  selectedMode: TPCTransportMode;
  /** Best carrier frequencies (Hz) */
  carrierFrequencies?: number[];
  /** Signal-to-noise ratio (dB) */
  snrDb?: number;
  /** Packet error rate from calibration */
  packetErrorRate?: number;
}
