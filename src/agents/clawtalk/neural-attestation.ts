/**
 * Neural Fingerprint Runtime — Real-time Behavioral Attestation
 *
 * Implements the runtime attestation loop described in the agent-security
 * research document.  Monitors LLM activation patterns during tool invocations,
 * compares against the stored Neural Fingerprint (Block 9), and detects drift.
 *
 * Flow per tool invocation:
 *   1. Capture live activation state
 *   2. Compare against stored fingerprint via cosine similarity
 *   3. Drift detection → none / soft_drift / hard_drift
 *   4. Response: allow / throttle+log / INTEGRITY_SHUTDOWN
 *
 * Re-fingerprinting:
 *   When code is modified (self-healing), the old fingerprint is deprecated
 *   and a new calibration must be performed before reactivation.
 */

import { cosineSimilarity } from "./kernel-shield.js";
import type { ClawsNeuralFingerprint } from "./claws-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Drift severity levels */
export type DriftSeverity = "none" | "soft_drift" | "hard_drift";

/** Result of a single attestation check */
export interface AttestationCheck {
  /** Cosine similarity [0..1] */
  similarity: number;
  /** Detected drift level */
  drift: DriftSeverity;
  /** Whether execution should proceed */
  allow: boolean;
  /** Whether a throttle/warning is recommended */
  throttle: boolean;
  /** Whether an integrity shutdown was triggered */
  shutdown: boolean;
  /** Human-readable message */
  message: string;
}

/** A recorded drift event for audit */
export interface DriftEvent {
  /** When the drift was detected (epoch ms) */
  timestamp: number;
  /** Tool that triggered the check */
  toolName: string;
  /** Measured similarity */
  similarity: number;
  /** Drift severity */
  drift: DriftSeverity;
  /** Action taken */
  action: "allow" | "throttle" | "shutdown";
}

/** Configuration for the attestation monitor */
export interface AttestationConfig {
  /** Threshold above which execution is normal (default 0.94) */
  softDriftThreshold: number;
  /** Threshold below which execution is blocked (default 0.85) */
  hardDriftThreshold: number;
  /** Max drift events retained in history (default 100) */
  maxHistorySize: number;
  /** Whether to auto-quarantine on hard drift (default true) */
  autoQuarantine: boolean;
}

/** Possible states for a fingerprint lifecycle */
export type FingerprintState = "active" | "deprecated" | "calibrating" | "quarantined";

/** Re-fingerprinting request */
export interface RefingerprintRequest {
  /** Reason for re-fingerprinting */
  reason: string;
  /** Old fingerprint (now deprecated) */
  oldFingerprint: ClawsNeuralFingerprint;
  /** Calibration runs needed (default 100) */
  calibrationRuns: number;
  /** Current lifecycle state */
  state: FingerprintState;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: AttestationConfig = {
  softDriftThreshold: 0.94,
  hardDriftThreshold: 0.85,
  maxHistorySize: 100,
  autoQuarantine: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// ATTESTATION MONITOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AttestationMonitor — stateful runtime monitor for a single fingerprint.
 *
 * Create one per agent/tool and call `check()` before every tool invocation.
 */
export class AttestationMonitor {
  private config: AttestationConfig;
  private baseline: number[];
  private history: DriftEvent[] = [];
  private _state: FingerprintState = "active";
  private _quarantinedTools: Set<string> = new Set();

  constructor(
    fingerprint: ClawsNeuralFingerprint,
    config?: Partial<AttestationConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Override thresholds from fingerprint if available
    if (fingerprint.driftThresholds) {
      this.config.softDriftThreshold =
        fingerprint.driftThresholds.softDrift ?? this.config.softDriftThreshold;
      this.config.hardDriftThreshold =
        fingerprint.driftThresholds.hardDrift ?? this.config.hardDriftThreshold;
    }

    // Parse baseline digest
    this.baseline = parseDigest(fingerprint.neuralDigest);
  }

  /** Current fingerprint lifecycle state */
  get state(): FingerprintState {
    return this._state;
  }

  /** Drift event history (newest first) */
  get driftHistory(): readonly DriftEvent[] {
    return this.history;
  }

  /** Set of tools currently quarantined */
  get quarantinedTools(): ReadonlySet<string> {
    return this._quarantinedTools;
  }

  /**
   * Check a live activation vector against the stored fingerprint.
   *
   * @param toolName - Name of tool being invoked
   * @param liveActivation - Current LLM hidden-state vector
   * @returns AttestationCheck with verdict
   */
  check(toolName: string, liveActivation: number[]): AttestationCheck {
    // If fingerprint is not active, block
    if (this._state !== "active") {
      return {
        similarity: 0,
        drift: "hard_drift",
        allow: false,
        throttle: false,
        shutdown: false,
        message: `Fingerprint is ${this._state} — execution suspended`,
      };
    }

    // If tool is quarantined, block
    if (this._quarantinedTools.has(toolName)) {
      return {
        similarity: 0,
        drift: "hard_drift",
        allow: false,
        throttle: false,
        shutdown: false,
        message: `Tool "${toolName}" is quarantined — manual inspection required`,
      };
    }

    // If no baseline, skip attestation (allow)
    if (this.baseline.length === 0) {
      return {
        similarity: 1.0,
        drift: "none",
        allow: true,
        throttle: false,
        shutdown: false,
        message: "No baseline — attestation skipped",
      };
    }

    const similarity = cosineSimilarity(liveActivation, this.baseline);
    let drift: DriftSeverity;
    let allow: boolean;
    let throttle = false;
    let shutdown = false;
    let message: string;
    let action: "allow" | "throttle" | "shutdown";

    if (similarity >= this.config.softDriftThreshold) {
      drift = "none";
      allow = true;
      message = "Attestation passed";
      action = "allow";
    } else if (similarity >= this.config.hardDriftThreshold) {
      drift = "soft_drift";
      allow = true;
      throttle = true;
      message = `Vibe Mismatch: similarity=${round(similarity)} — throttle + log`;
      action = "throttle";
    } else {
      drift = "hard_drift";
      allow = false;
      shutdown = true;
      message = `!!INTEGRITY_SHUTDOWN: similarity=${round(similarity)} — tool blocked`;
      action = "shutdown";

      // Auto-quarantine on hard drift
      if (this.config.autoQuarantine) {
        this._quarantinedTools.add(toolName);
      }
    }

    // Record event
    this.recordEvent({ timestamp: Date.now(), toolName, similarity: round(similarity), drift, action });

    return { similarity: round(similarity), drift, allow, throttle, shutdown, message };
  }

  /**
   * Initiate re-fingerprinting after a code modification (self-healing).
   * Deprecates the current fingerprint and returns a request object.
   */
  requestRefingerprint(reason: string): RefingerprintRequest {
    this._state = "deprecated";

    return {
      reason,
      oldFingerprint: {
        signatureVersion: "deprecated",
        neuralDigest: this.baseline.join(","),
        raw: "",
      },
      calibrationRuns: 100,
      state: "calibrating",
    };
  }

  /**
   * Complete re-fingerprinting with a new baseline.
   * Reactivates the monitor with the new fingerprint.
   */
  completeRefingerprint(newFingerprint: ClawsNeuralFingerprint): void {
    this.baseline = parseDigest(newFingerprint.neuralDigest);
    this._state = "active";
    this._quarantinedTools.clear();

    // Update thresholds if new fingerprint has them
    if (newFingerprint.driftThresholds) {
      this.config.softDriftThreshold =
        newFingerprint.driftThresholds.softDrift ?? this.config.softDriftThreshold;
      this.config.hardDriftThreshold =
        newFingerprint.driftThresholds.hardDrift ?? this.config.hardDriftThreshold;
    }
  }

  /**
   * Manually quarantine a tool.
   */
  quarantineTool(toolName: string): void {
    this._quarantinedTools.add(toolName);
  }

  /**
   * Release a tool from quarantine after manual inspection.
   */
  releaseTool(toolName: string): void {
    this._quarantinedTools.delete(toolName);
  }

  private recordEvent(event: DriftEvent): void {
    this.history.unshift(event);
    if (this.history.length > this.config.maxHistorySize) {
      this.history.length = this.config.maxHistorySize;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a neural digest string (comma-separated floats) into a number array.
 */
export function parseDigest(digest: string): number[] {
  if (!digest || !digest.includes(",")) {return [];}
  return digest
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
