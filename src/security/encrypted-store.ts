/**
 * Transparent encryption layer for file-based stores.
 *
 * Provides read/write methods that automatically encrypt/decrypt JSON data.
 * Used by session store, cron store, and other sensitive data stores.
 */

import JSON5 from "json5";
import fs from "node:fs/promises";
import path from "node:path";
import type { EncryptionConfig } from "./encryption-types.js";
import {
  decrypt,
  decryptJson,
  DEFAULT_ENCRYPTION_CONFIG,
  encrypt,
  encryptJson,
  isEncryptedPayload,
} from "./crypto.js";

export type EncryptedStoreOptions = {
  /** Path to the encrypted store file */
  filePath: string;
  /** Passphrase for encryption/decryption */
  passphrase: string;
  /** Encryption configuration (defaults to DEFAULT_ENCRYPTION_CONFIG) */
  config?: EncryptionConfig;
  /** Create parent directories if they don't exist */
  ensureDir?: boolean;
};

/**
 * Read and decrypt JSON data from file.
 * Handles both encrypted and plaintext files for migration.
 */
export async function readEncryptedStore<T>(options: EncryptedStoreOptions): Promise<T | null> {
  try {
    const raw = await fs.readFile(options.filePath, "utf-8");

    // Try parsing as JSON5 first (handles both JSON and JSON5)
    const parsed = JSON5.parse(raw);

    // Check if it's encrypted
    if (isEncryptedPayload(parsed)) {
      return decryptJson<T>({
        payload: parsed,
        passphrase: options.passphrase,
      });
    }

    // Return plaintext data (for migration)
    return parsed as T;
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Encrypt and write JSON data to file.
 */
export async function writeEncryptedStore<T>(
  options: EncryptedStoreOptions,
  data: T,
): Promise<void> {
  const config = options.config ?? DEFAULT_ENCRYPTION_CONFIG;

  if (!config.enabled) {
    // Write plaintext if encryption is disabled
    const json = JSON.stringify(data, null, 2);
    await ensureDir(options.filePath, options.ensureDir);
    await atomicWrite(options.filePath, json);
    return;
  }

  // Encrypt the data
  const encrypted = encryptJson({
    data,
    passphrase: options.passphrase,
    config,
  });

  // Write encrypted payload as JSON
  const json = JSON.stringify(encrypted, null, 2);
  await ensureDir(options.filePath, options.ensureDir);
  await atomicWrite(options.filePath, json);
}

/**
 * Encrypt and write string data to file.
 */
export async function writeEncryptedString(
  options: EncryptedStoreOptions,
  plaintext: string,
): Promise<void> {
  const config = options.config ?? DEFAULT_ENCRYPTION_CONFIG;

  if (!config.enabled) {
    await ensureDir(options.filePath, options.ensureDir);
    await atomicWrite(options.filePath, plaintext);
    return;
  }

  const encrypted = encrypt({
    plaintext,
    passphrase: options.passphrase,
    config,
  });

  const json = JSON.stringify(encrypted, null, 2);
  await ensureDir(options.filePath, options.ensureDir);
  await atomicWrite(options.filePath, json);
}

/**
 * Read and decrypt string data from file.
 */
export async function readEncryptedString(options: EncryptedStoreOptions): Promise<string | null> {
  try {
    const raw = await fs.readFile(options.filePath, "utf-8");

    let parsed: unknown;
    try {
      parsed = JSON5.parse(raw);
    } catch {
      // Not JSON, return raw string
      return raw;
    }

    if (isEncryptedPayload(parsed)) {
      return decrypt({
        payload: parsed,
        passphrase: options.passphrase,
      });
    }

    // Return plaintext for migration
    return raw;
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Check if a store file exists and is encrypted.
 */
export async function isStoreEncrypted(filePath: string): Promise<boolean | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON5.parse(raw);
    return isEncryptedPayload(parsed);
  } catch {
    return null; // File doesn't exist or can't be parsed
  }
}

/**
 * Atomic write using temp file + rename.
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, content, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tmp, filePath);

    // Best-effort backup
    try {
      await fs.copyFile(filePath, `${filePath}.bak`);
    } catch {
      // Ignore backup failures
    }
  } catch (err) {
    // Clean up temp file on error
    try {
      await fs.unlink(tmp);
    } catch {
      // Ignore cleanup failures
    }
    throw err;
  }
}

/**
 * Ensure parent directory exists.
 */
async function ensureDir(filePath: string, create?: boolean): Promise<void> {
  if (!create) {
    return;
  }
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}
