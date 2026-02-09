/**
 * Cryptographic primitives for end-to-end encryption.
 *
 * Uses:
 * - ChaCha20-Poly1305 for authenticated encryption
 * - Argon2id for password-based key derivation
 * - @noble/ciphers and @noble/hashes (audited, modern crypto libraries)
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { argon2id } from "@noble/hashes/argon2";
import { utf8ToBytes } from "@noble/hashes/utils";
import type { Argon2idParams, EncryptionConfig, EncryptedPayload } from "./encryption-types.js";
import { SECURITY } from "../constants/index.js";

/**
 * Default encryption configuration.
 * Re-exported from centralized constants library.
 * @see {@link ../constants/security.ts} for implementation details
 */
export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = SECURITY.ENCRYPTION.DEFAULT_CONFIG;

/**
 * Derive encryption key from passphrase using Argon2id.
 */
export function deriveKey(params: {
  passphrase: string;
  salt: Uint8Array;
  kdfParams: Argon2idParams;
}): Uint8Array {
  const passwordBytes = utf8ToBytes(params.passphrase);

  return argon2id(passwordBytes, params.salt, {
    t: params.kdfParams.iterations,
    m: params.kdfParams.memory,
    p: params.kdfParams.parallelism,
    dkLen: params.kdfParams.keyLength,
  });
}

/**
 * Encrypt plaintext data with passphrase.
 */
export function encrypt(params: {
  plaintext: string;
  passphrase: string;
  config: EncryptionConfig;
  keyId?: string;
}): EncryptedPayload {
  if (params.config.algorithm !== "xchacha20-poly1305") {
    throw new Error(`Unsupported encryption algorithm: ${params.config.algorithm}`);
  }
  if (params.config.kdf !== "argon2id") {
    throw new Error(`Unsupported KDF: ${params.config.kdf}`);
  }

  // Generate random salt and nonce
  const salt = randomBytes(32); // 256-bit salt
  const nonce = randomBytes(24); // 192-bit nonce for XChaCha20

  // Derive encryption key from passphrase
  const key = deriveKey({
    passphrase: params.passphrase,
    salt,
    kdfParams: params.config.kdfParams,
  });

  // Encrypt with XChaCha20-Poly1305
  const cipher = xchacha20poly1305(key, nonce);
  const plaintextBytes = utf8ToBytes(params.plaintext);
  const ciphertext = cipher.encrypt(plaintextBytes);

  // Serialize KDF params
  const kdfParamsJson = JSON.stringify(params.config.kdfParams);
  const kdfParamsB64 = Buffer.from(kdfParamsJson).toString("base64");

  return {
    $encrypted: true,
    version: 1,
    algorithm: params.config.algorithm,
    kdf: params.config.kdf,
    kdfParams: kdfParamsB64,
    salt: Buffer.from(salt).toString("base64"),
    nonce: Buffer.from(nonce).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    keyId: params.keyId ?? generateKeyId(),
    keyCreatedAt: new Date().toISOString(),
  };
}

/**
 * Decrypt encrypted payload with passphrase.
 */
export function decrypt(params: { payload: EncryptedPayload; passphrase: string }): string {
  if (params.payload.version !== 1) {
    throw new Error(`Unsupported encryption version: ${params.payload.version}`);
  }
  if (params.payload.algorithm !== "xchacha20-poly1305") {
    throw new Error(`Unsupported encryption algorithm: ${params.payload.algorithm}`);
  }
  if (params.payload.kdf !== "argon2id") {
    throw new Error(`Unsupported KDF: ${params.payload.kdf}`);
  }

  // Parse KDF params
  const kdfParamsJson = Buffer.from(params.payload.kdfParams, "base64").toString("utf-8");
  const kdfParams = JSON.parse(kdfParamsJson) as Argon2idParams;

  // Decode salt and nonce
  const salt = new Uint8Array(Buffer.from(params.payload.salt, "base64"));
  const nonce = new Uint8Array(Buffer.from(params.payload.nonce, "base64"));
  const ciphertext = new Uint8Array(Buffer.from(params.payload.ciphertext, "base64"));

  // Derive decryption key
  const key = deriveKey({
    passphrase: params.passphrase,
    salt,
    kdfParams,
  });

  // Decrypt with XChaCha20-Poly1305
  const cipher = xchacha20poly1305(key, nonce);
  let plaintextBytes: Uint8Array;

  try {
    plaintextBytes = cipher.decrypt(ciphertext);
  } catch (err) {
    throw new Error(`Decryption failed: incorrect passphrase or corrupted data: ${err}`, {
      cause: err,
    });
  }

  // Convert bytes to UTF-8 string
  return Buffer.from(plaintextBytes).toString("utf-8");
}

/**
 * Check if a value looks like an encrypted payload.
 */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    obj.$encrypted === true &&
    typeof obj.version === "number" &&
    typeof obj.algorithm === "string" &&
    typeof obj.kdf === "string" &&
    typeof obj.kdfParams === "string" &&
    typeof obj.salt === "string" &&
    typeof obj.nonce === "string" &&
    typeof obj.ciphertext === "string"
  );
}

/**
 * Encrypt JSON data as a string.
 */
export function encryptJson<T>(params: {
  data: T;
  passphrase: string;
  config: EncryptionConfig;
  keyId?: string;
}): EncryptedPayload {
  const plaintext = JSON.stringify(params.data, null, 2);
  return encrypt({
    plaintext,
    passphrase: params.passphrase,
    config: params.config,
    keyId: params.keyId,
  });
}

/**
 * Decrypt JSON data from encrypted payload.
 */
export function decryptJson<T>(params: { payload: EncryptedPayload; passphrase: string }): T {
  const plaintext = decrypt({
    payload: params.payload,
    passphrase: params.passphrase,
  });
  return JSON.parse(plaintext) as T;
}

/**
 * Generate a unique key identifier for rotation tracking.
 */
export function generateKeyId(): string {
  const timestamp = Date.now().toString(36);
  const randomness = Buffer.from(randomBytes(8)).toString("base64url").slice(0, 8);
  return `key_${timestamp}_${randomness}`;
}

/**
 * Re-encrypt data with a new passphrase (key rotation).
 * Decrypts with old passphrase and encrypts with new passphrase.
 */
export function rekeyEncryptedPayload(params: {
  payload: EncryptedPayload;
  oldPassphrase: string;
  newPassphrase: string;
  config: EncryptionConfig;
}): EncryptedPayload {
  // Decrypt with old passphrase
  const plaintext = decrypt({
    payload: params.payload,
    passphrase: params.oldPassphrase,
  });

  // Encrypt with new passphrase and new key ID
  return encrypt({
    plaintext,
    passphrase: params.newPassphrase,
    config: params.config,
    keyId: generateKeyId(), // Generate new key ID for rotation tracking
  });
}

/**
 * Check if an encrypted payload needs key rotation based on age.
 * @param payload - Encrypted payload with keyCreatedAt timestamp
 * @param maxAgeMs - Maximum key age in milliseconds (default: 90 days)
 * @returns true if key is older than maxAgeMs
 */
export function needsKeyRotation(
  payload: EncryptedPayload,
  maxAgeMs: number = 90 * 24 * 60 * 60 * 1000, // 90 days default
): boolean {
  if (!payload.keyCreatedAt) {
    return false; // No timestamp means old payload, rotation not required
  }

  const createdAt = new Date(payload.keyCreatedAt);
  const ageMs = Date.now() - createdAt.getTime();

  return ageMs > maxAgeMs;
}
