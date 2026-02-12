/**
 * Encryption management commands for ClosedClaw.
 *
 * Allows users to:
 * - Set up encryption passphrases
 * - Check encryption status
 * - Migrate existing data to encrypted storage
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RuntimeEnv } from "../runtime.js";
import { formatCliCommand } from "../cli/command-format.js";
import { encryptAllConfigBackups } from "../config/backup-encryption.js";
import { STATE_DIR, resolveConfigPath } from "../config/paths.js";
import { DEFAULT_ENCRYPTION_CONFIG } from "../security/crypto.js";
import {
  isStoreEncrypted,
  readEncryptedStore,
  writeEncryptedStore,
} from "../security/encrypted-store.js";
import {
  autoDetectPassphraseSource,
  resolvePassphrase,
  validatePassphrase,
  DEFAULT_PASSPHRASE_ENV_VAR,
} from "../security/passphrase.js";
import { theme } from "../terminal/theme.js";

type EncryptionSetupOptions = {
  passphraseSource?: string;
  migrate?: boolean;
  status?: boolean;
  json?: boolean;
  backups?: boolean; // New option for encrypting config backups
};

/**
 * Check encryption status of ClosedClaw state stores.
 */
async function checkEncryptionStatus(_runtime: RuntimeEnv): Promise<{
  encrypted: string[];
  plaintext: string[];
  missing: string[];
}> {
  const storePaths = [
    path.join(STATE_DIR, "sessions", "sessions.json"),
    path.join(STATE_DIR, "cron", "cron-store.json"),
    path.join(STATE_DIR, "credentials"),
  ];

  const encrypted: string[] = [];
  const plaintext: string[] = [];
  const missing: string[] = [];

  for (const storePath of storePaths) {
    try {
      await fs.access(storePath);
      const isEncrypted = await isStoreEncrypted(storePath);
      if (isEncrypted) {
        encrypted.push(storePath);
      } else {
        plaintext.push(storePath);
      }
    } catch {
      missing.push(storePath);
    }
  }

  return { encrypted, plaintext, missing };
}

/**
 * Migrate a plaintext store to encrypted storage.
 */
async function migrateStore(
  storePath: string,
  passphrase: string,
  runtime: RuntimeEnv,
): Promise<boolean> {
  try {
    // Check if already encrypted
    if (await isStoreEncrypted(storePath)) {
      runtime.log(theme.muted(`  ${storePath}: already encrypted, skipping`));
      return true;
    }

    // Read plaintext data
    const data = await readEncryptedStore<unknown>({
      filePath: storePath,
      passphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    // Write back encrypted
    await writeEncryptedStore(
      {
        filePath: storePath,
        passphrase,
        config: { ...DEFAULT_ENCRYPTION_CONFIG, enabled: true },
      },
      data,
    );

    runtime.log(theme.success(`  ${storePath}: encrypted`));
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    runtime.error(`  ${storePath}: migration failed - ${detail}`);
    return false;
  }
}

/**
 * Security encrypt command for setting up and managing encryption.
 */
export async function securityEncryptCommand(
  runtime: RuntimeEnv,
  options: EncryptionSetupOptions,
): Promise<void> {
  // Handle config backup encryption
  if (options.backups) {
    runtime.log(theme.heading("Encrypting Config Backups"));
    runtime.log("");

    const configPath = resolveConfigPath();
    const encryptedCount = await encryptAllConfigBackups(configPath, DEFAULT_ENCRYPTION_CONFIG);

    if (encryptedCount > 0) {
      runtime.log(theme.success(`✓ Encrypted ${encryptedCount} config backup file(s).`));
      runtime.log(`  Run ${formatCliCommand("closedclaw doctor")} to verify encryption status.`);
    } else {
      runtime.log("No unencrypted backups found (or encryption is disabled).");
    }

    return;
  }

  // Status check
  if (options.status) {
    const status = await checkEncryptionStatus(runtime);

    if (options.json) {
      runtime.log(JSON.stringify(status, null, 2));
      return;
    }

    runtime.log(theme.heading("Encryption Status"));
    runtime.log("");

    if (status.encrypted.length > 0) {
      runtime.log(theme.success("Encrypted stores:"));
      for (const store of status.encrypted) {
        runtime.log(`  ${theme.muted("✓")} ${store}`);
      }
      runtime.log("");
    }

    if (status.plaintext.length > 0) {
      runtime.log(theme.warn("Plaintext stores:"));
      for (const store of status.plaintext) {
        runtime.log(`  ${theme.warn("⚠")} ${store}`);
      }
      runtime.log("");
      runtime.log(
        theme.muted(`Migrate: ${formatCliCommand("closedclaw security encrypt --migrate")}`),
      );
      runtime.log("");
    }

    if (status.missing.length > 0) {
      runtime.log(theme.muted("Missing stores (not yet created):"));
      for (const store of status.missing) {
        runtime.log(`  ${theme.muted("-")} ${store}`);
      }
      runtime.log("");
    }

    // Show passphrase source
    const passphraseSource = autoDetectPassphraseSource();
    if (passphraseSource) {
      runtime.log(theme.muted("Passphrase source:"));
      if (passphraseSource.type === "env") {
        runtime.log(`  Environment variable: ${passphraseSource.envVar}`);
      } else if (passphraseSource.type === "file") {
        runtime.log(`  File: ${passphraseSource.path}`);
      }
    } else {
      runtime.log(theme.warn("No passphrase configured"));
      runtime.log(
        theme.muted(`Set: export ${DEFAULT_PASSPHRASE_ENV_VAR}="your-secure-passphrase"`),
      );
    }

    return;
  }

  // Migration
  if (options.migrate) {
    runtime.log(theme.heading("Migrating stores to encrypted storage"));
    runtime.log("");

    // Resolve passphrase
    const passphraseSource = autoDetectPassphraseSource();
    if (!passphraseSource) {
      runtime.error(
        `No passphrase configured. Set ${DEFAULT_PASSPHRASE_ENV_VAR} environment variable.`,
      );
      runtime.error(`Example: export ${DEFAULT_PASSPHRASE_ENV_VAR}="your-secure-passphrase"`);
      return;
    }

    let passphrase: string;
    try {
      passphrase = await resolvePassphrase({ source: passphraseSource, cache: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      runtime.error(`Failed to resolve passphrase: ${detail}`);
      return;
    }

    // Validate passphrase strength
    const validationError = validatePassphrase(passphrase);
    if (validationError) {
      runtime.error("Passphrase is too weak:");
      runtime.error(`  ${validationError}`);
      return;
    }

    // Get stores to migrate
    const status = await checkEncryptionStatus(runtime);
    if (status.plaintext.length === 0) {
      runtime.log(theme.success("All stores are already encrypted!"));
      return;
    }

    // Migrate each store
    let successCount = 0;
    for (const storePath of status.plaintext) {
      const success = await migrateStore(storePath, passphrase, runtime);
      if (success) {
        successCount++;
      }
    }

    runtime.log("");
    if (successCount === status.plaintext.length) {
      runtime.log(theme.success(`Successfully encrypted ${successCount} store(s)`));
    } else {
      runtime.error(`Encrypted ${successCount}/${status.plaintext.length} store(s)`);
    }

    return;
  }

  // Setup passphrase
  runtime.log(theme.heading("Encryption Setup"));
  runtime.log("");
  runtime.log("ClosedClaw can encrypt all data at rest with a passphrase you control.");
  runtime.log("");
  runtime.log(theme.warn("IMPORTANT: If you lose your passphrase, your data cannot be recovered!"));
  runtime.log("");
  runtime.log(`Set your passphrase: export ${DEFAULT_PASSPHRASE_ENV_VAR}="your-secure-passphrase"`);
  runtime.log("");
  runtime.log("Passphrase requirements:");
  runtime.log("  • At least 12 characters");
  runtime.log("  • Mix of uppercase, lowercase, numbers, and symbols");
  runtime.log("  • Avoid weak patterns (e.g., 'password', '123456')");
  runtime.log("");
  runtime.log(
    theme.muted(`Check status: ${formatCliCommand("closedclaw security encrypt --status")}`),
  );
  runtime.log(
    theme.muted(`Migrate data: ${formatCliCommand("closedclaw security encrypt --migrate")}`),
  );
}
