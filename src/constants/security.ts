/**
 * Security-related constants for ClosedClaw.
 *
 * This module centralizes all security configuration defaults:
 * - Encryption algorithms and parameters
 * - Passphrase requirements and sources
 * - Sandbox configuration
 * - Authentication timeouts
 * - Security limits
 *
 * All values are informed by OWASP guidelines and industry best practices.
 */

import type { Argon2idParams, EncryptionConfig } from "../security/encryption-types.js";

/**
 * Encryption constants for end-to-end encrypted storage.
 *
 * **Algorithm**: XChaCha20-Poly1305 (authenticated encryption with extended nonce)
 * - Key size: 256 bits
 * - Nonce size: 192 bits (extended from ChaCha20's 96 bits)
 * - Tag size: 128 bits (Poly1305 authentication tag)
 *
 * **KDF**: Argon2id (OWASP recommended password-based key derivation)
 * - Memory: 64 MB (safe for most systems, resistant to GPU attacks)
 * - Iterations: 3 (OWASP minimum)
 * - Parallelism: 4 (utilize multiple cores)
 * - Key length: 32 bytes (256-bit key for XChaCha20)
 *
 * @see {@link https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html OWASP Password Storage}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8439 RFC 8439 - ChaCha20-Poly1305}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc9106 RFC 9106 - Argon2}
 */
export const SECURITY_ENCRYPTION = {
  /** Encryption algorithm identifier */
  ALGORITHM: "xchacha20-poly1305" as const,

  /** Key derivation function identifier */
  KDF: "argon2id" as const,

  /** Argon2id parameters (OWASP recommended) */
  KDF_PARAMS: {
    memory: 65536, // 64 MB - balances security and performance
    iterations: 3, // OWASP minimum (2022 guidance)
    parallelism: 4, // Use multiple CPU cores
    keyLength: 32, // 256-bit key for XChaCha20
  } satisfies Argon2idParams,

  /** Default encryption config (opt-in for now, will become default) */
  DEFAULT_CONFIG: {
    enabled: false, // Opt-in initially; will default to true after proven stable
    algorithm: "xchacha20-poly1305",
    kdf: "argon2id",
    kdfParams: {
      memory: 65536,
      iterations: 3,
      parallelism: 4,
      keyLength: 32,
    },
  } satisfies EncryptionConfig,

  /** Encrypted payload version (for future migration) */
  VERSION: 1,

  /** Magic marker for encrypted payloads */
  MARKER: "$encrypted: true",
} as const;

/**
 * Passphrase requirements and sources.
 *
 * **Requirements** (enforced by validation):
 * - Minimum length: 12 characters (NIST recommends 8+, we exceed this)
 * - Character diversity: At least 3 of 4 types (lowercase, uppercase, digits, special)
 * - Weak pattern detection: Rejects common passwords (password123, 12345678)
 *
 * **Sources** (priority order):
 * 1. Environment variable: `ClosedClaw_PASSPHRASE`
 * 2. File: `~/.closedclaw/.passphrase` (0o600 permissions enforced)
 * 3. OS Keychain: (Priority 7 - not yet implemented)
 * 4. Interactive prompt: (fallback when no source configured)
 *
 * @see {@link https://pages.nist.gov/800-63-3/sp800-63b.html NIST SP 800-63B Digital Identity Guidelines}
 */
export const SECURITY_PASSPHRASE = {
  /** Environment variable name for passphrase */
  ENV_VAR: "ClosedClaw_PASSPHRASE",

  /** Minimum passphrase length (characters) */
  MIN_LENGTH: 12,

  /** Required number of character types (lowercase, uppercase, digits, special) */
  REQUIRED_CHAR_TYPES: 3,

  /** Weak patterns to reject (case-insensitive substring match) */
  WEAK_PATTERNS: [
    "password",
    "closedclaw",
    "openclaw",
    "admin",
    "123456",
    "qwerty",
    "letmein",
  ] as const,

  /** File permissions for passphrase file (owner read/write only) */
  FILE_MODE: 0o600,
} as const;

/**
 * Sandbox constants for code execution isolation.
 *
 * Sandboxing is **mandatory** by default (Priority 2 completed).
 *
 * **Modes**:
 * - `all`: Sandbox all code execution (default, most secure)
 * - `unsafe-only`: Sandbox only user-provided code (built-in skills trusted)
 * - `off`: No sandboxing (legacy mode, not recommended)
 *
 * **Resource limits** (Docker container):
 * - Timeout: 5 minutes (300 seconds)
 * - Memory: 512 MB (prevent DoS)
 * - CPU: 1.0 core (fair scheduling)
 * - Network: Controlled via egress allowlist (Priority 5)
 *
 * @see {@link /docs/security/sandboxing.md Sandboxing Documentation}
 */
export const SECURITY_SANDBOX = {
  /** Default sandbox mode */
  MODE: "all" as const,

  /** Default timeout (seconds) */
  TIMEOUT_SEC: 300, // 5 minutes

  /** Default memory limit (MB) */
  MEMORY_MB: 512,

  /** Default CPU limit (cores) */
  CPU_LIMIT: 1.0,

  /** Safe binaries allowed without approval (read-only tools) */
  SAFE_BINS: [
    "jq",
    "grep",
    "cut",
    "sort",
    "uniq",
    "head",
    "tail",
    "tr",
    "wc",
    "awk",
    "sed",
  ] as const,
} as const;

/**
 * Authentication and session constants.
 *
 * **OAuth warning threshold**: 24 hours before expiration
 * - Proactive notification prevents service interruption
 * - User has time to re-authenticate
 *
 * **Handshake timeout**: 10 seconds
 * - Gateway WebSocket handshake must complete within this window
 * - Prevents stale connections blocking resources
 */
export const SECURITY_AUTH = {
  /** OAuth token expiration warning (milliseconds) */
  OAUTH_WARN_MS: 24 * 60 * 60 * 1000, // 24 hours

  /** Gateway handshake timeout (milliseconds) */
  HANDSHAKE_TIMEOUT_MS: 10_000, // 10 seconds
} as const;

/**
 * Audit and logging constants.
 *
 * **Default log directory**: `/tmp/ClosedClaw` (or `$ClosedClaw_STATE_DIR/logs`)
 * - Structured JSON logs for parsing
 * - Rotation and retention TBD (Priority 6)
 */
export const SECURITY_AUDIT = {
  /** Default log directory (ephemeral) */
  DEFAULT_LOG_DIR: "/tmp/ClosedClaw",
} as const;

/**
 * Master security configuration export.
 * Namespaced for IDE autocomplete and easy refactoring.
 */
export const SECURITY = {
  ENCRYPTION: SECURITY_ENCRYPTION,
  PASSPHRASE: SECURITY_PASSPHRASE,
  SANDBOX: SECURITY_SANDBOX,
  AUTH: SECURITY_AUTH,
  AUDIT: SECURITY_AUDIT,
} as const;
