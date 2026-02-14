/**
 * TPC Key Rotation
 *
 * Supports scheduled key rotation with a grace period during which
 * both the old and new key are accepted for verification.
 *
 * Rotation lifecycle:
 *   1. New keypair is generated
 *   2. Grace period begins — both old & new keys verify messages
 *   3. Grace period expires — old key is discarded
 *   4. Next rotation is scheduled
 *
 * This prevents message loss during key transitions.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { KeyPair } from "./crypto-signer.js";
import {
  generateKeyPair,
  exportKeyPair,
  verifyEnvelope,
} from "./crypto-signer.js";
import type { SignedTPCEnvelope } from "./types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface KeyRotationConfig {
  /** Directory to store key files */
  keyDir: string;
  /** Rotation interval in ms (default: 7 days) */
  rotationIntervalMs: number;
  /** Grace period for old key acceptance in ms (default: 1 hour) */
  gracePeriodMs: number;
}

const DEFAULT_KEY_ROTATION_CONFIG: KeyRotationConfig = {
  keyDir: "~/.closedclaw/tpc/keys",
  rotationIntervalMs: 7 * 24 * 60 * 60 * 1000,
  gracePeriodMs: 60 * 60 * 1000,
};

interface KeySlot {
  keyPair: KeyPair;
  generatedAt: number;
  expiresAt: number | null; // null = currently active
}

interface KeyRotationState {
  currentKeyId: string;
  keys: Record<string, {
    generatedAt: number;
    expiresAt: number | null;
    privatePath: string;
    publicPath: string;
  }>;
}

// ---------------------------------------------------------------------------
// Key Rotation Manager
// ---------------------------------------------------------------------------

export class KeyRotationManager {
  private config: KeyRotationConfig;
  private activeSlot: KeySlot | null = null;
  private graceSlots: KeySlot[] = [];
  private rotationTimer: ReturnType<typeof setTimeout> | null = null;
  private keyDir: string;
  private onRotate?: (newPublicKey: crypto.KeyObject) => void;

  constructor(
    config: Partial<KeyRotationConfig> = {},
    opts?: { onRotate?: (newPublicKey: crypto.KeyObject) => void },
  ) {
    this.config = { ...DEFAULT_KEY_ROTATION_CONFIG, ...config };
    this.keyDir = this.resolvePath(this.config.keyDir);
    this.onRotate = opts?.onRotate;
  }

  /**
   * Initialize with an existing keypair or generate a new one.
   */
  async init(existingKeyPair?: KeyPair): Promise<KeyPair> {
    fs.mkdirSync(this.keyDir, { recursive: true, mode: 0o700 });

    if (existingKeyPair) {
      this.activeSlot = {
        keyPair: existingKeyPair,
        generatedAt: Date.now(),
        expiresAt: null,
      };
    } else {
      // Try loading from state file or generate fresh
      const state = this.loadState();
      if (state) {
        try {
          const entry = state.keys[state.currentKeyId];
          if (entry) {
            const privatePem = fs.readFileSync(entry.privatePath, "utf-8");
            const publicPem = fs.readFileSync(entry.publicPath, "utf-8");
            this.activeSlot = {
              keyPair: {
                privateKey: crypto.createPrivateKey(privatePem),
                publicKey: crypto.createPublicKey(publicPem),
              },
              generatedAt: entry.generatedAt,
              expiresAt: null,
            };
          }
        } catch {
          // State file corrupt — generate fresh
        }
      }

      if (!this.activeSlot) {
        const keyPair = await this.generateAndSave();
        this.activeSlot = {
          keyPair,
          generatedAt: Date.now(),
          expiresAt: null,
        };
      }
    }

    return this.activeSlot.keyPair;
  }

  /**
   * Get the currently active keypair for signing.
   */
  getActiveKeyPair(): KeyPair {
    if (!this.activeSlot) {
      throw new Error("KeyRotationManager not initialized");
    }
    return this.activeSlot.keyPair;
  }

  /**
   * Get the active public key.
   */
  getActivePublicKey(): crypto.KeyObject {
    return this.getActiveKeyPair().publicKey;
  }

  /**
   * Verify a signed envelope against active + grace period keys.
   * Returns true if any accepted key validates the signature.
   */
  verifyWithRotation(signed: SignedTPCEnvelope): boolean {
    // Try active key first
    if (this.activeSlot && verifyEnvelope(signed, this.activeSlot.keyPair.publicKey)) {
      return true;
    }

    // Try grace period keys
    const now = Date.now();
    for (const slot of this.graceSlots) {
      if (slot.expiresAt !== null && slot.expiresAt < now) {
        continue; // Expired grace slot
      }
      if (verifyEnvelope(signed, slot.keyPair.publicKey)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Trigger an immediate key rotation.
   */
  async rotate(): Promise<KeyPair> {
    const oldSlot = this.activeSlot;

    // Generate new key
    const newKeyPair = await this.generateAndSave();
    this.activeSlot = {
      keyPair: newKeyPair,
      generatedAt: Date.now(),
      expiresAt: null,
    };

    // Move old key to grace period
    if (oldSlot) {
      oldSlot.expiresAt = Date.now() + this.config.gracePeriodMs;
      this.graceSlots.push(oldSlot);
    }

    // Prune expired grace slots
    this.pruneGraceSlots();

    // Persist state
    this.saveState();

    // Notify callback
    this.onRotate?.(newKeyPair.publicKey);

    return newKeyPair;
  }

  /**
   * Start automatic rotation on a timer.
   */
  startAutoRotation(): void {
    this.stopAutoRotation();
    this.rotationTimer = setInterval(
      () => void this.rotate(),
      this.config.rotationIntervalMs,
    );
    // Let Node exit if this is the only thing keeping it alive
    if (this.rotationTimer.unref) {
      this.rotationTimer.unref();
    }
  }

  /**
   * Stop automatic rotation.
   */
  stopAutoRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
   * Get the number of keys currently accepted (active + grace).
   */
  getAcceptedKeyCount(): number {
    this.pruneGraceSlots();
    return (this.activeSlot ? 1 : 0) + this.graceSlots.length;
  }

  /**
   * Shutdown — stop timers, clear keys from memory.
   */
  shutdown(): void {
    this.stopAutoRotation();
    this.activeSlot = null;
    this.graceSlots = [];
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async generateAndSave(): Promise<KeyPair> {
    const keyPair = generateKeyPair();
    const id = crypto.randomBytes(8).toString("hex");
    const privatePath = path.join(this.keyDir, `tpc-${id}.key`);
    const publicPath = path.join(this.keyDir, `tpc-${id}.pub`);
    await exportKeyPair(keyPair, privatePath, publicPath);
    return keyPair;
  }

  private pruneGraceSlots(): void {
    const now = Date.now();
    this.graceSlots = this.graceSlots.filter(
      (s) => s.expiresAt === null || s.expiresAt > now,
    );
  }

  private loadState(): KeyRotationState | null {
    const stateFile = path.join(this.keyDir, "rotation-state.json");
    try {
      const raw = fs.readFileSync(stateFile, "utf-8");
      return JSON.parse(raw) as KeyRotationState;
    } catch {
      return null;
    }
  }

  private saveState(): void {
    if (!this.activeSlot) return;

    const stateFile = path.join(this.keyDir, "rotation-state.json");
    const keyId = crypto.randomBytes(8).toString("hex");
    const state: KeyRotationState = {
      currentKeyId: keyId,
      keys: {
        [keyId]: {
          generatedAt: this.activeSlot.generatedAt,
          expiresAt: null,
          privatePath: "", // Keys are already on disk
          publicPath: "",
        },
      },
    };

    try {
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    } catch {
      // Non-fatal
    }
  }

  private resolvePath(p: string): string {
    if (p.startsWith("~/")) {
      return path.join(process.env.HOME ?? "/tmp", p.slice(2));
    }
    return p;
  }
}
