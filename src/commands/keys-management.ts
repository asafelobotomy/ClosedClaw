/**
 * Trusted keyring management commands.
 *
 * Allows users to manage their trusted key ring for skill signature verification.
 */

import * as fs from "node:fs/promises";
import type { RuntimeEnv } from "../runtime.js";
import { formatCliCommand } from "../cli/command-format.js";
import { fingerprintPublicKey } from "../security/skill-signing.js";
import {
  loadKeyring,
  addTrustedKey,
  removeTrustedKey,
  getTrustedKey,
  getKeyringPath,
  type TrustLevel,
  type VerificationMethod,
} from "../security/trusted-keyring.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";

type KeysListOptions = {
  json?: boolean;
  trustLevel?: string;
};

type KeysAddOptions = {
  name?: string;
  trust?: string;
  verifiedVia?: string;
  notes?: string;
  json?: boolean;
};

type KeysRemoveOptions = {
  json?: boolean;
};

type KeysTrustOptions = {
  trust: string;
  json?: boolean;
};

/**
 * List all keys in the trusted keyring.
 */
export async function listKeysCommand(
  runtime: RuntimeEnv,
  options: KeysListOptions,
): Promise<void> {
  const keyring = await loadKeyring();
  const entries = Object.entries(keyring.keys);

  // Filter by trust level if specified
  const filtered =
    options.trustLevel && ["full", "marginal", "none"].includes(options.trustLevel)
      ? entries.filter(([_, key]) => key.trustLevel === options.trustLevel)
      : entries;

  if (options.json) {
    runtime.log(JSON.stringify(Object.fromEntries(filtered), null, 2));
    return;
  }

  if (filtered.length === 0) {
    runtime.log(theme.muted("No trusted keys found."));
    runtime.log("");
    runtime.log(
      `Add a key: ${formatCliCommand("closedclaw keys add <keyId> <publicKeyPath> --trust full")}`,
    );
    return;
  }

  runtime.log(theme.heading("Trusted Keyring"));
  runtime.log("");
  runtime.log(`${entries.length} key(s) total`);
  runtime.log(`${theme.muted("Location:")} ${shortenHomePath(getKeyringPath())}`);
  runtime.log("");

  for (const [keyId, key] of filtered) {
    const trustColor =
      key.trustLevel === "full"
        ? theme.success
        : key.trustLevel === "marginal"
          ? theme.warn
          : theme.error;

    runtime.log(
      `${theme.accent("●")} ${keyId.slice(0, 16)}... ${trustColor(`[${key.trustLevel}]`)}`,
    );
    runtime.log(`  ${theme.muted("Name:")} ${key.name}`);
    runtime.log(`  ${theme.muted("Added:")} ${key.added.split("T")[0]}`);
    runtime.log(`  ${theme.muted("Verified via:")} ${key.verifiedVia}`);
    if (key.notes) {
      runtime.log(`  ${theme.muted("Notes:")} ${key.notes}`);
    }
    runtime.log("");
  }

  runtime.log(theme.muted(`Filter by trust: --trust-level full|marginal|none`));
}

/**
 * Add a trusted key to the keyring.
 */
export async function addKeyCommand(
  runtime: RuntimeEnv,
  keyIdOrPath: string,
  publicKeyPath: string,
  options: KeysAddOptions,
): Promise<void> {
  // Read public key
  let publicKeyPem: string;
  try {
    publicKeyPem = await fs.readFile(publicKeyPath, "utf-8");
  } catch {
    runtime.error(`Failed to read public key: ${shortenHomePath(publicKeyPath)}`);
    process.exit(1);
  }

  // Derive or validate key ID
  const derivedKeyId = fingerprintPublicKey(publicKeyPem);
  const keyId = keyIdOrPath === derivedKeyId ? derivedKeyId : derivedKeyId; // Always use derived

  // Validate trust level
  const trustLevel = (options.trust || "marginal") as TrustLevel;
  if (!["full", "marginal", "none"].includes(trustLevel)) {
    runtime.error(`Invalid trust level: ${trustLevel}`);
    runtime.log("Must be one of: full, marginal, none");
    process.exit(1);
  }

  // Validate verification method
  const verifiedVia = (options.verifiedVia || "manual") as VerificationMethod;
  if (!["manual", "web-of-trust", "certificate", "self"].includes(verifiedVia)) {
    runtime.error(`Invalid verification method: ${verifiedVia}`);
    runtime.log("Must be one of: manual, web-of-trust, certificate, self");
    process.exit(1);
  }

  // Add to keyring
  await addTrustedKey(keyId, {
    name: options.name || "Unknown",
    publicKeyPem,
    trustLevel,
    added: new Date().toISOString(),
    verifiedVia,
    notes: options.notes,
  });

  if (options.json) {
    runtime.log(JSON.stringify({ keyId, trustLevel, added: true }, null, 2));
    return;
  }

  runtime.log(theme.success("✓ Key added to trusted keyring"));
  runtime.log("");
  runtime.log(`${theme.muted("Key ID:")} ${keyId}`);
  runtime.log(`${theme.muted("Name:")} ${options.name || "Unknown"}`);
  runtime.log(`${theme.muted("Trust:")} ${trustLevel}`);
  runtime.log(`${theme.muted("Verified via:")} ${verifiedVia}`);
  runtime.log("");
  runtime.log(`Keyring: ${shortenHomePath(getKeyringPath())}`);
}

/**
 * Remove a key from the trusted keyring.
 */
export async function removeKeyCommand(
  runtime: RuntimeEnv,
  keyId: string,
  options: KeysRemoveOptions,
): Promise<void> {
  // Check if key exists
  const key = await getTrustedKey(keyId);
  if (!key) {
    runtime.error(`Key not found: ${keyId}`);
    runtime.log(`List keys: ${formatCliCommand("closedclaw keys list")}`);
    process.exit(1);
  }

  // Remove
  const removed = await removeTrustedKey(keyId);

  if (options.json) {
    runtime.log(JSON.stringify({ keyId, removed }, null, 2));
    return;
  }

  runtime.log(theme.success(`✓ Removed key: ${key.name} (${keyId.slice(0, 16)}...)`));
}

/**
 * Change the trust level of a key.
 */
export async function trustKeyCommand(
  runtime: RuntimeEnv,
  keyId: string,
  options: KeysTrustOptions,
): Promise<void> {
  // Validate trust level
  const trustLevel = options.trust as TrustLevel;
  if (!["full", "marginal", "none"].includes(trustLevel)) {
    runtime.error(`Invalid trust level: ${trustLevel}`);
    runtime.log("Must be one of: full, marginal, none");
    process.exit(1);
  }

  // Get existing key
  const key = await getTrustedKey(keyId);
  if (!key) {
    runtime.error(`Key not found: ${keyId}`);
    runtime.log(`List keys: ${formatCliCommand("closedclaw keys list")}`);
    process.exit(1);
  }

  // Update trust level
  await addTrustedKey(keyId, {
    ...key,
    trustLevel,
  });

  if (options.json) {
    runtime.log(JSON.stringify({ keyId, trustLevel, updated: true }, null, 2));
    return;
  }

  runtime.log(theme.success(`✓ Updated trust level: ${key.name} → ${trustLevel}`));
}
