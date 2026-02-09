/**
 * Trusted Keyring for Skill/Plugin Signing
 *
 * Manages a local keyring of trusted Ed25519 public keys used to verify
 * skill signatures. Stored at `~/.closedclaw/trusted-keys.json`.
 *
 * **Trust levels**:
 * - `full`: Unconditionally trusted (e.g., your own keys, core team)
 * - `marginal`: Trusted with caution (community contributors)
 * - `none`: Explicitly distrusted (revoked/compromised keys)
 *
 * @module security/trusted-keyring
 */

import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Trust level for a key in the keyring. */
export type TrustLevel = "full" | "marginal" | "none";

/** How the key was verified and added to the keyring. */
export type VerificationMethod = "manual" | "web-of-trust" | "certificate" | "self";

/** A single trusted key entry. */
export interface TrustedKey {
  /** Display name of the key owner. */
  name: string;
  /** PEM-encoded SPKI public key. */
  publicKeyPem: string;
  /** Trust level. */
  trustLevel: TrustLevel;
  /** ISO 8601 date when the key was added. */
  added: string;
  /** How the key's authenticity was verified. */
  verifiedVia: VerificationMethod;
  /** Optional notes about the key (e.g., organization, role). */
  notes?: string;
}

/** The full keyring file structure. */
export interface Keyring {
  /** Schema version for future migration. */
  version: 1;
  /** Map of key ID → key entry. */
  keys: Record<string, TrustedKey>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KEYRING_FILENAME = "trusted-keys.json";
const CLOSEDCLAW_DIR = ".closedclaw";
const DEFAULT_KEYRING: Keyring = { version: 1, keys: {} };

// ─── Path Resolution ─────────────────────────────────────────────────────────

/**
 * Get the absolute path to the trusted keyring file.
 */
export function getKeyringPath(): string {
  return path.join(homedir(), CLOSEDCLAW_DIR, KEYRING_FILENAME);
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

/**
 * Load the trusted keyring from disk.
 * Returns an empty keyring if the file doesn't exist or is corrupt.
 */
export async function loadKeyring(): Promise<Keyring> {
  try {
    const keyringPath = getKeyringPath();
    const content = await fs.readFile(keyringPath, "utf-8");
    const parsed = JSON.parse(content) as Keyring;

    if (parsed?.version !== 1 || typeof parsed.keys !== "object") {
      return { ...DEFAULT_KEYRING };
    }

    return parsed;
  } catch {
    return { ...DEFAULT_KEYRING };
  }
}

/**
 * Save the keyring to disk with restricted permissions.
 */
export async function saveKeyring(keyring: Keyring): Promise<void> {
  const keyringPath = getKeyringPath();
  await fs.mkdir(path.dirname(keyringPath), { recursive: true });
  await fs.writeFile(keyringPath, JSON.stringify(keyring, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600, // owner read/write only
  });
}

// ─── Key Management ──────────────────────────────────────────────────────────

/**
 * Add a trusted key to the keyring.
 *
 * @param keyId - The key's fingerprint/ID.
 * @param key - Key metadata and public key PEM.
 * @returns The updated keyring.
 */
export async function addTrustedKey(keyId: string, key: TrustedKey): Promise<Keyring> {
  const keyring = await loadKeyring();
  keyring.keys[keyId] = key;
  await saveKeyring(keyring);
  return keyring;
}

/**
 * Remove a key from the keyring.
 *
 * @param keyId - The key ID to remove.
 * @returns True if the key existed and was removed, false otherwise.
 */
export async function removeTrustedKey(keyId: string): Promise<boolean> {
  const keyring = await loadKeyring();
  if (!(keyId in keyring.keys)) {
    return false;
  }
  delete keyring.keys[keyId];
  await saveKeyring(keyring);
  return true;
}

/**
 * Get a trusted key by its ID.
 *
 * @param keyId - The key ID to look up.
 * @returns The key entry, or undefined if not found.
 */
export async function getTrustedKey(keyId: string): Promise<TrustedKey | undefined> {
  const keyring = await loadKeyring();
  return keyring.keys[keyId];
}

/**
 * Check if a key is trusted (trust level is "full" or "marginal").
 *
 * @param keyId - The key ID to check.
 * @returns True if the key exists and has at least marginal trust.
 */
export async function isKeyTrusted(keyId: string): Promise<boolean> {
  const key = await getTrustedKey(keyId);
  if (!key) return false;
  return key.trustLevel === "full" || key.trustLevel === "marginal";
}

/**
 * List all keys in the keyring.
 *
 * @returns Array of [keyId, key] tuples.
 */
export async function listTrustedKeys(): Promise<Array<[string, TrustedKey]>> {
  const keyring = await loadKeyring();
  return Object.entries(keyring.keys);
}

/**
 * Update the trust level of an existing key.
 *
 * @param keyId - The key ID to update.
 * @param trustLevel - The new trust level.
 * @returns True if the key was found and updated, false otherwise.
 */
export async function updateTrustLevel(keyId: string, trustLevel: TrustLevel): Promise<boolean> {
  const keyring = await loadKeyring();
  if (!(keyId in keyring.keys)) {
    return false;
  }
  keyring.keys[keyId].trustLevel = trustLevel;
  await saveKeyring(keyring);
  return true;
}

// ─── Verification Integration ────────────────────────────────────────────────

/**
 * Look up a public key PEM from the keyring for signature verification.
 * Only returns keys with "full" or "marginal" trust.
 *
 * @param keyId - The key ID from the signature.
 * @returns The PEM-encoded public key, or null if not trusted.
 */
export async function getPublicKeyForVerification(keyId: string): Promise<string | null> {
  const key = await getTrustedKey(keyId);
  if (!key) return null;
  if (key.trustLevel === "none") return null;
  return key.publicKeyPem;
}
