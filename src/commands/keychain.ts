/**
 * CLI commands for keychain management and credential migration.
 *
 * Provides user-facing commands for:
 * - Checking keychain backend status
 * - Migrating credentials from JSON files to OS keychain
 * - Listing stored credentials (file backend only)
 *
 * @see {@link ../security/keychain.ts Keychain Module}
 * @see {@link ../cli/security-cli.ts Security CLI}
 */

import type { RuntimeEnv } from "../runtime.js";
import { isRich, theme } from "../terminal/theme.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  detectKeychainBackend,
  migrateCredentials,
  listCredentials,
  type KeychainBackend,
} from "../security/keychain.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeychainStatusOptions {
  json?: boolean;
}

export interface KeychainMigrateOptions {
  dryRun?: boolean;
  json?: boolean;
}

export interface KeychainListOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Backend description helpers
// ---------------------------------------------------------------------------

/**
 * Get a human-readable description of a keychain backend.
 */
function getBackendDescription(backend: KeychainBackend): string {
  switch (backend) {
    case "macos-keychain":
      return "macOS Keychain (via `security` CLI)";
    case "linux-secret-service":
      return "Linux Secret Service (via `secret-tool` CLI)";
    case "windows-credential":
      return "Windows Credential Manager (via `cmdkey` CLI)";
    case "encrypted-file":
      return "Encrypted file store (no OS keychain available)";
  }
}

/**
 * Get security recommendations for each backend type.
 */
function getBackendRecommendations(backend: KeychainBackend): string[] {
  switch (backend) {
    case "macos-keychain":
      return [
        "Credentials are stored in macOS Keychain.app",
        "Protected by your login password",
        "Automatically locked when screen is locked",
      ];
    case "linux-secret-service":
      return [
        "Credentials stored in GNOME Keyring or KWallet",
        "Protected by your keyring password",
        "Install `libsecret-tools` if secret-tool is missing",
      ];
    case "windows-credential":
      return [
        "Credentials stored in Windows Credential Manager",
        "Protected by Windows user account",
        "Access via Control Panel → Credential Manager",
      ];
    case "encrypted-file":
      return [
        "Credentials stored in ~/.closedclaw/credentials/",
        "Files are encrypted at rest (Priority 3)",
        "Consider installing OS keychain for better security",
        "Linux: `sudo apt install libsecret-tools`",
        "macOS: keychain is built-in",
      ];
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Check keychain backend status and availability.
 *
 * Shows which backend is being used, whether it's available, and
 * provides recommendations for security best practices.
 *
 * @param runtime - Runtime context
 * @param opts - Command options
 */
export async function keychainStatusCommand(
  runtime: RuntimeEnv,
  opts: KeychainStatusOptions,
): Promise<void> {
  const info = await detectKeychainBackend();

  if (opts.json) {
    runtime.log(JSON.stringify(info, null, 2));
    return;
  }

  const rich = isRich();
  const heading = (text: string) => (rich ? theme.heading(text) : text);
  const muted = (text: string) => (rich ? theme.muted(text) : text);
  const success = (text: string) => (rich ? theme.success(text) : text);
  const warn = (text: string) => (rich ? theme.warn(text) : text);

  const lines: string[] = [];
  lines.push(heading("Keychain Status"));
  lines.push("");
  lines.push(`Backend: ${success(getBackendDescription(info.backend))}`);
  lines.push(`Available: ${info.available ? success("yes") : warn("no")}`);

  if (info.toolPath) {
    lines.push(`Tool: ${muted(info.toolPath)}`);
  }

  lines.push("");
  lines.push(heading("Recommendations"));
  const recommendations = getBackendRecommendations(info.backend);
  for (const rec of recommendations) {
    lines.push(`  • ${muted(rec)}`);
  }

  // Show migration hint if using encrypted-file
  if (info.backend === "encrypted-file") {
    lines.push("");
    lines.push(
      warn(
        "⚠️  No OS keychain detected. Credentials are stored in encrypted files.",
      ),
    );
    lines.push(
      muted(
        "Consider installing OS keychain tools for better security integration.",
      ),
    );
  }

  lines.push("");
  lines.push(heading("Next Steps"));
  lines.push(
    muted(`Migrate credentials: ${formatCliCommand("closedclaw security keychain migrate")}`),
  );
  lines.push(
    muted(`List credentials: ${formatCliCommand("closedclaw security keychain list")}`),
  );

  runtime.log(lines.join("\n"));
}

/**
 * Migrate credentials from plaintext JSON files to the keychain.
 *
 * Scans ~/.closedclaw/credentials/ for JSON files and stores them in
 * the OS keychain (or encrypted file store if no keychain is available).
 *
 * @param runtime - Runtime context
 * @param opts - Command options
 */
export async function keychainMigrateCommand(
  runtime: RuntimeEnv,
  opts: KeychainMigrateOptions,
): Promise<void> {
  const rich = isRich();
  const heading = (text: string) => (rich ? theme.heading(text) : text);
  const muted = (text: string) => (rich ? theme.muted(text) : text);
  const success = (text: string) => (rich ? theme.success(text) : text);
  const error = (text: string) => (rich ? theme.error(text) : text);
  const warn = (text: string) => (rich ? theme.warn(text) : text);

  // Show backend info first
  const info = await detectKeychainBackend();

  if (!opts.json) {
    runtime.log(heading("Keychain Migration"));
    runtime.log("");
    runtime.log(`Backend: ${muted(getBackendDescription(info.backend))}`);
    runtime.log("");
  }

  // Dry run warning
  if (opts.dryRun && !opts.json) {
    runtime.log(warn("Running in dry-run mode (no files will be modified)"));
    runtime.log("");
  }

  // Perform migration (or dry run)
  const result = opts.dryRun
    ? { migrated: 0, skipped: 0, failed: 0, errors: [] }
    : await migrateCredentials();

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          backend: info.backend,
          dryRun: opts.dryRun ?? false,
          result,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Show results
  const lines: string[] = [];
  lines.push(heading("Migration Results"));
  lines.push("");

  if (result.migrated > 0) {
    lines.push(success(`✓ Migrated: ${result.migrated} credential(s)`));
  }
  if (result.skipped > 0) {
    lines.push(muted(`○ Skipped:  ${result.skipped} credential(s) (malformed or missing fields)`));
  }
  if (result.failed > 0) {
    lines.push(error(`✗ Failed:   ${result.failed} credential(s)`));
  }

  if (result.migrated === 0 && result.skipped === 0 && result.failed === 0) {
    lines.push(muted("No credentials found to migrate."));
    lines.push("");
    lines.push(
      muted(
        "Credentials should be stored as JSON files in ~/.closedclaw/credentials/",
      ),
    );
    lines.push(
      muted(
        "with fields: { namespace: string, identifier: string, secret: string }",
      ),
    );
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push(heading("Errors"));
    for (const err of result.errors) {
      lines.push(error(`  • ${err}`));
    }
  }

  if (result.migrated > 0 && !opts.dryRun) {
    lines.push("");
    lines.push(
      success(
        `Credentials successfully migrated to ${getBackendDescription(info.backend)}`,
      ),
    );
    lines.push("");
    lines.push(heading("Next Steps"));
    lines.push(
      muted(
        "Original JSON files are still in ~/.closedclaw/credentials/",
      ),
    );
    lines.push(
      muted(
        "Consider removing them once you've verified migration worked:",
      ),
    );
    lines.push(muted(`  rm -rf ~/.closedclaw/credentials/*.json`));
  }

  runtime.log(lines.join("\n"));
}

/**
 * List stored credentials (file backend only).
 *
 * Native keychains don't support enumeration, so this only works
 * with the encrypted-file backend.
 *
 * @param runtime - Runtime context
 * @param opts - Command options
 */
export async function keychainListCommand(
  runtime: RuntimeEnv,
  opts: KeychainListOptions,
): Promise<void> {
  const info = await detectKeychainBackend();
  const credentials = await listCredentials();

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          backend: info.backend,
          credentials,
        },
        null,
        2,
      ),
    );
    return;
  }

  const rich = isRich();
  const heading = (text: string) => (rich ? theme.heading(text) : text);
  const muted = (text: string) => (rich ? theme.muted(text) : text);
  const accent = (text: string) => (rich ? theme.accent(text) : text);

  const lines: string[] = [];
  lines.push(heading("Stored Credentials"));
  lines.push("");
  lines.push(`Backend: ${muted(getBackendDescription(info.backend))}`);
  lines.push("");

  if (info.backend !== "encrypted-file") {
    lines.push(
      muted(
        "⚠️  Native keychains don't support enumeration.",
      ),
    );
    lines.push(
      muted(
        "Credentials are stored securely but cannot be listed via CLI.",
      ),
    );
    lines.push("");
    lines.push(
      muted(
        "To view credentials on macOS: open Keychain Access.app → search 'ClosedClaw'",
      ),
    );
    lines.push(
      muted(
        "To view credentials on Linux: seahorse (GNOME) or kwalletmanager (KDE)",
      ),
    );
    lines.push(
      muted(
        "To view credentials on Windows: Control Panel → Credential Manager",
      ),
    );
    runtime.log(lines.join("\n"));
    return;
  }

  if (credentials.length === 0) {
    lines.push(muted("No credentials stored."));
    runtime.log(lines.join("\n"));
    return;
  }

  lines.push(
    `Found ${accent(String(credentials.length))} credential(s):\n`,
  );

  // Group by namespace
  const byNamespace = new Map<string, typeof credentials>();
  for (const cred of credentials) {
    const existing = byNamespace.get(cred.namespace) ?? [];
    existing.push(cred);
    byNamespace.set(cred.namespace, existing);
  }

  for (const [namespace, creds] of byNamespace.entries()) {
    lines.push(accent(`${namespace}:`));
    for (const cred of creds) {
      const stored = cred.storedAt
        ? muted(` (stored: ${new Date(cred.storedAt).toLocaleString()})`)
        : "";
      lines.push(`  • ${cred.identifier}${stored}`);
    }
    lines.push("");
  }

  runtime.log(lines.join("\n"));
}
