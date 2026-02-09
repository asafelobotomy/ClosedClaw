/**
 * Types for end-to-end encryption of ClosedClaw state.
 *
 * This module defines types for encrypting data at rest with user-controlled passphrases.
 * Encryption uses XChaCha20-Poly1305 with Argon2id key derivation.
 */

export type EncryptionAlgorithm = "xchacha20-poly1305";
export type KeyDerivationFunction = "argon2id";

/**
 * Parameters for Argon2id key derivation.
 * Defaults balance security and performance for interactive use.
 */
export type Argon2idParams = {
  /** Memory cost in kilobytes (default: 65536 = 64 MB) */
  memory: number;
  /** Number of iterations (default: 3) */
  iterations: number;
  /** Parallelism factor (default: 4) */
  parallelism: number;
  /** Output key length in bytes (default: 32) */
  keyLength: number;
};

/**
 * Encrypted payload envelope.
 * Stored in place of plaintext data with all parameters needed for decryption.
 */
export type EncryptedPayload = {
  /** Magic marker to identify encrypted payloads */
  $encrypted: true;
  /** Encryption version for future compatibility */
  version: 1;
  /** Encryption algorithm identifier */
  algorithm: EncryptionAlgorithm;
  /** Key derivation function identifier */
  kdf: KeyDerivationFunction;
  /** KDF parameters (base64-encoded) */
  kdfParams: string;
  /** Random salt for KDF (base64-encoded) */
  salt: string;
  /** Random nonce for encryption (base64-encoded) */
  nonce: string;
  /** Encrypted ciphertext with authentication tag (base64-encoded) */
  ciphertext: string;
  /** Optional key identifier for rotation tracking */
  keyId?: string;
  /** Optional key creation timestamp (ISO 8601) for rotation policy */
  keyCreatedAt?: string;
};

/**
 * Encryption configuration.
 */
export type EncryptionConfig = {
  /** Enable encryption at rest */
  enabled: boolean;
  /** Encryption algorithm (currently only xchacha20-poly1305 supported) */
  algorithm: EncryptionAlgorithm;
  /** Key derivation function (currently only argon2id supported) */
  kdf: KeyDerivationFunction;
  /** KDF parameters */
  kdfParams: Argon2idParams;
};

/**
 * Passphrase source configuration.
 * Future: expand to support OS keychain integration (Priority 7).
 */
export type PassphraseSource =
  | { type: "env"; envVar: string }
  | { type: "file"; path: string }
  | { type: "prompt" }
  | { type: "inline"; value: string }; // Only for testing
