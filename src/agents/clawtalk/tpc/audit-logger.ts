/**
 * TPC Audit Logger
 *
 * Writes structured JSONL audit events to disk for every TPC operation.
 * Each line is a self-contained JSON object for easy ingestion by
 * log aggregators (ELK, Datadog, etc.) or offline analysis.
 *
 * Events include: encode, decode, verify, reject, fallback, rotate,
 * circuit-break, rate-limit.
 *
 * File rotation: new file per day (tpc-audit-YYYY-MM-DD.jsonl).
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type AuditSeverity = "info" | "warn" | "error" | "security";

export interface AuditLogEntry {
  /** ISO-8601 timestamp */
  ts: string;
  /** Event category */
  event: string;
  /** Severity level */
  severity: AuditSeverity;
  /** Source agent ID */
  source?: string;
  /** Target agent ID */
  target?: string;
  /** Message ID (for correlation) */
  messageId?: string;
  /** Nonce (for replay tracking) */
  nonce?: string;
  /** Transport mode used */
  transport?: "tpc" | "text" | "file";
  /** Whether signature verification passed */
  verified?: boolean;
  /** Reason for fallback/rejection */
  reason?: string;
  /** Stack trace (for error/security events) */
  stack?: string;
  /** Additional context */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AuditLoggerConfig {
  /** Directory for audit log files */
  logDir: string;
  /** Whether audit logging is enabled (default: true) */
  enabled: boolean;
  /** Max file size before rotation in bytes (default: 50 MB) */
  maxFileSizeBytes: number;
  /** Whether to also emit events to an in-memory buffer (for tests) */
  bufferEvents: boolean;
  /** Max events in memory buffer (default: 1000) */
  maxBufferSize: number;
}

const DEFAULT_AUDIT_CONFIG: AuditLoggerConfig = {
  logDir: "~/.closedclaw/tpc/audit",
  enabled: true,
  maxFileSizeBytes: 50 * 1024 * 1024,
  bufferEvents: false,
  maxBufferSize: 1000,
};

// ---------------------------------------------------------------------------
// Audit Logger
// ---------------------------------------------------------------------------

export class AuditLogger {
  private config: AuditLoggerConfig;
  private logDir: string;
  private currentFile: string | null = null;
  private currentDate: string | null = null;
  private fd: number | null = null;
  private buffer: AuditLogEntry[] = [];

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.logDir = this.resolvePath(this.config.logDir);
  }

  /**
   * Initialize the logger (create directories, open file handle).
   */
  init(): void {
    if (!this.config.enabled) {
      return;
    }
    fs.mkdirSync(this.logDir, { recursive: true, mode: 0o700 });
    this.rotateFileIfNeeded();
  }

  /**
   * Log a TPC encode event.
   */
  logEncode(params: {
    source: string;
    target: string;
    messageId: string;
    nonce: string;
    transport: "tpc" | "file";
  }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.encode",
      severity: "info",
      source: params.source,
      target: params.target,
      messageId: params.messageId,
      nonce: params.nonce,
      transport: params.transport,
    });
  }

  /**
   * Log a TPC decode event.
   */
  logDecode(params: {
    source: string;
    target: string;
    messageId: string;
    nonce: string;
    verified: boolean;
    transport: "tpc" | "file";
  }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.decode",
      severity: params.verified ? "info" : "security",
      source: params.source,
      target: params.target,
      messageId: params.messageId,
      nonce: params.nonce,
      verified: params.verified,
      transport: params.transport,
    });
  }

  /**
   * Log a signature verification failure.
   */
  logVerifyFailed(params: {
    source?: string;
    target?: string;
    messageId?: string;
    reason: string;
  }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.verify_failed",
      severity: "security",
      source: params.source,
      target: params.target,
      messageId: params.messageId,
      verified: false,
      reason: params.reason,
    });
  }

  /**
   * Log a replay attack detection.
   */
  logReplayDetected(params: {
    source?: string;
    target?: string;
    messageId?: string;
    nonce: string;
  }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.replay_detected",
      severity: "security",
      source: params.source,
      target: params.target,
      messageId: params.messageId,
      nonce: params.nonce,
      reason: "duplicate nonce",
    });
  }

  /**
   * Log a text fallback event (agent-to-agent message sent as text).
   */
  logFallback(params: { source?: string; target?: string; reason: string; stack?: string }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.fallback",
      severity: "warn",
      source: params.source,
      target: params.target,
      transport: "text",
      reason: params.reason,
      stack: params.stack,
    });
  }

  /**
   * Log a key rotation event.
   */
  logKeyRotation(params: { source: string; details?: Record<string, unknown> }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.key_rotation",
      severity: "info",
      source: params.source,
      details: params.details,
    });
  }

  /**
   * Log a circuit breaker state change.
   */
  logCircuitBreaker(params: {
    state: string;
    reason: string;
    details?: Record<string, unknown>;
  }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.circuit_breaker",
      severity: params.state === "open" ? "error" : "info",
      reason: params.reason,
      details: { state: params.state, ...params.details },
    });
  }

  /**
   * Log a rate limit event.
   */
  logRateLimited(params: {
    source: string;
    target?: string;
    details?: Record<string, unknown>;
  }): void {
    this.write({
      ts: new Date().toISOString(),
      event: "tpc.rate_limited",
      severity: "warn",
      source: params.source,
      target: params.target,
      reason: "rate limit exceeded",
      details: params.details,
    });
  }

  /**
   * Get buffered events (only available when bufferEvents=true).
   */
  getBufferedEvents(): readonly AuditLogEntry[] {
    return this.buffer;
  }

  /**
   * Clear the in-memory buffer.
   */
  clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * Shutdown the logger (flush and close file handle).
   */
  shutdown(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // best effort
      }
      this.fd = null;
    }
    this.currentFile = null;
    this.currentDate = null;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private write(entry: AuditLogEntry): void {
    // In-memory buffer (for tests/diagnostics)
    if (this.config.bufferEvents) {
      this.buffer.push(entry);
      if (this.buffer.length > this.config.maxBufferSize) {
        this.buffer.shift();
      }
    }

    if (!this.config.enabled) {
      return;
    }

    this.rotateFileIfNeeded();

    if (this.fd === null) {
      return;
    }

    try {
      const line = JSON.stringify(entry) + "\n";
      fs.writeSync(this.fd, line);
    } catch {
      // Audit logging failure is non-fatal
    }
  }

  private rotateFileIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    if (this.currentDate === today && this.fd !== null) {
      // Check file size
      try {
        const stats = fs.fstatSync(this.fd);
        if (stats.size < this.config.maxFileSizeBytes) {
          return; // Current file is fine
        }
      } catch {
        // Fall through to create new file
      }
    }

    // Close old file
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // best effort
      }
    }

    // Open new file
    this.currentDate = today;

    // Find next available filename (handles size-based rotation within a day)
    let suffix = 0;
    let filename: string;
    do {
      filename = suffix === 0 ? `tpc-audit-${today}.jsonl` : `tpc-audit-${today}.${suffix}.jsonl`;
      this.currentFile = path.join(this.logDir, filename);
      suffix++;

      if (!fs.existsSync(this.currentFile)) {
        break;
      }

      try {
        const stats = fs.statSync(this.currentFile);
        if (stats.size < this.config.maxFileSizeBytes) {
          break;
        }
      } catch {
        break;
      }
    } while (suffix < 100); // Safety limit

    try {
      this.fd = fs.openSync(this.currentFile, "a", 0o600);
    } catch {
      this.fd = null;
    }
  }

  private resolvePath(p: string): string {
    if (p.startsWith("~/")) {
      return path.join(process.env.HOME ?? "/tmp", p.slice(2));
    }
    return p;
  }
}
