/**
 * Config backup encryption.
 *
 * Encrypts config backups to prevent plaintext sensitive data leakage.
 * Uses the same encryption as session/state stores.
 */

import fs from "node:fs/promises";
import type { EncryptionConfig } from "../security/encryption-types.js";
import { encrypt, DEFAULT_ENCRYPTION_CONFIG, isEncryptedPayload } from "../security/crypto.js";

/**
 * Get encryption passphrase, with fallback to env var.
 */
async function getPassphraseForBackups(): Promise<string | null> {
  // Try environment variable first (avoids import cycle)
  const envPassphrase = process.env.ClosedClaw_ENCRYPTION_PASSPHRASE;
  if (envPassphrase && envPassphrase.trim().length >= 12) {
    return envPassphrase.trim();
  }

  // If no env var, passphrase must be set up separately
  return null;
}

/**
 * Encrypt a config backup file if encryption is enabled.
 *
 * @param backupPath - Path to the backup file to encrypt
 * @param config - Encryption configuration (defaults to DEFAULT_ENCRYPTION_CONFIG)
 * @returns true if encrypted, false if encryption disabled or already encrypted
 */
export async function encryptConfigBackup(
  backupPath: string,
  config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG,
): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  try {
    // Read the backup file
    const content = await fs.readFile(backupPath, "utf-8");

    // Check if already encrypted
    try {
      const parsed = JSON.parse(content);
      if (isEncryptedPayload(parsed)) {
        return false; // Already encrypted
      }
    } catch {
      // Not JSON or not encrypted, proceed to encrypt
    }

    // Get encryption passphrase
    const passphrase = await getPassphraseForBackups();
    if (!passphrase) {
      return false; // No passphrase available
    }

    // Encrypt the content
    const encrypted = encrypt({
      plaintext: content,
      passphrase,
      config,
    });

    // Write encrypted payload back
    const json = JSON.stringify(encrypted, null, 2);
    await fs.writeFile(backupPath, json, { encoding: "utf-8", mode: 0o600 });

    return true;
  } catch (err) {
    // Best-effort encryption - don't fail if encryption fails
    console.error(`Failed to encrypt config backup at ${backupPath}:`, err);
    return false;
  }
}

/**
 * Encrypt all config backup files in a directory.
 *
 * @param configPath - Path to the main config file
 * @param config - Encryption configuration
 */
export async function encryptAllConfigBackups(
  configPath: string,
  config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG,
): Promise<number> {
  if (!config.enabled) {
    return 0;
  }

  let encrypted = 0;
  const backupBase = `${configPath}.bak`;

  try {
    // Encrypt immediate backup
    if (await encryptConfigBackup(backupBase, config)) {
      encrypted += 1;
    }

    // Encrypt numbered backups (.bak.1, .bak.2, etc.)
    for (let i = 1; i <= 5; i++) {
      const backupPath = `${backupBase}.${i}`;
      try {
        await fs.access(backupPath);
        if (await encryptConfigBackup(backupPath, config)) {
          encrypted += 1;
        }
      } catch {
        // Backup doesn't exist, skip
      }
    }
  } catch (err) {
    console.error(`Failed to encrypt config backups:`, err);
  }

  return encrypted;
}
