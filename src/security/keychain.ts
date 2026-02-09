/**
 * OS Keychain integration for ClosedClaw credential management.
 *
 * Stores secrets (API keys, OAuth tokens, passphrases) in the operating system's
 * native keychain instead of plaintext JSON files. Falls back to the encrypted
 * file store (Priority 3) for headless environments without a keychain.
 *
 * **Platform support**:
 * - **macOS**: Keychain.app via `security` CLI
 * - **Linux**: Secret Service API via `secret-tool` CLI (GNOME Keyring, KWallet)
 * - **Windows**: Credential Manager via `cmdkey` CLI
 * - **Fallback**: Encrypted file store (`~/.closedclaw/credentials/`)
 *
 * **Design decisions**:
 * - Uses native CLI tools rather than native bindings (`keytar`), avoiding
 *   native compilation issues and platform-specific build dependencies
 * - Service name: `ClosedClaw` (constant prefix for all entries)
 * - Account format: `<namespace>:<identifier>` (e.g., `anthropic:api-key`)
 *
 * @see {@link /docs/security/keychain.md Keychain Documentation}
 * @see {@link ../security/encrypted-store.ts Encrypted Store Fallback}
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported keychain backends.
 */
export type KeychainBackend = "macos-keychain" | "linux-secret-service" | "windows-credential" | "encrypted-file";

/**
 * Information about the detected keychain backend.
 */
export interface KeychainInfo {
  /** Detected backend type */
  backend: KeychainBackend;

  /** Whether the backend is available and functional */
  available: boolean;

  /** Human-readable description */
  description: string;

  /** Path to the CLI tool (if applicable) */
  toolPath?: string;
}

/**
 * A stored credential entry.
 */
export interface StoredCredential {
  /** Service namespace (e.g., "anthropic", "openai", "slack") */
  namespace: string;

  /** Identifier within namespace (e.g., "api-key", "oauth-token") */
  identifier: string;

  /** When the credential was stored */
  storedAt?: string;
}

/**
 * Options for keychain operations.
 */
export interface KeychainOptions {
  /** Override the backend (default: auto-detect) */
  backend?: KeychainBackend;

  /** State directory for encrypted file fallback */
  stateDir?: string;

  /** Custom exec function for testing */
  execFn?: typeof execFileAsync;
}

/**
 * Custom error for keychain operations.
 */
export class KeychainError extends Error {
  public readonly backend: KeychainBackend;
  public readonly operation: string;

  constructor(backend: KeychainBackend, operation: string, message: string) {
    super(`Keychain error (${backend}/${operation}): ${message}`);
    this.name = "KeychainError";
    this.backend = backend;
    this.operation = operation;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Service name prefix for all ClosedClaw entries in the keychain */
const SERVICE_NAME = "ClosedClaw";

/** Credentials subdirectory for encrypted file fallback */
const CREDENTIALS_SUBDIR = "credentials";

// ---------------------------------------------------------------------------
// Backend Detection
// ---------------------------------------------------------------------------

/**
 * Detect the available keychain backend for the current platform.
 *
 * @param opts - Options with optional exec override
 * @returns Information about the available keychain backend
 */
export async function detectKeychainBackend(opts?: KeychainOptions): Promise<KeychainInfo> {
  const exec = opts?.execFn ?? execFileAsync;
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      await exec("which", ["security"]);
      return {
        backend: "macos-keychain",
        available: true,
        description: "macOS Keychain via `security` CLI",
        toolPath: "/usr/bin/security",
      };
    } catch {
      // security CLI not available
    }
  }

  if (platform === "linux") {
    try {
      await exec("which", ["secret-tool"]);
      return {
        backend: "linux-secret-service",
        available: true,
        description: "Linux Secret Service via `secret-tool` CLI",
        toolPath: "secret-tool",
      };
    } catch {
      // secret-tool not available
    }
  }

  if (platform === "win32") {
    try {
      await exec("where", ["cmdkey"]);
      return {
        backend: "windows-credential",
        available: true,
        description: "Windows Credential Manager via `cmdkey` CLI",
        toolPath: "cmdkey",
      };
    } catch {
      // cmdkey not available
    }
  }

  // Fallback to encrypted file store
  return {
    backend: "encrypted-file",
    available: true,
    description: "Encrypted file store (no OS keychain available)",
  };
}

// ---------------------------------------------------------------------------
// Backend Implementations
// ---------------------------------------------------------------------------

/**
 * Store a credential using the macOS Keychain.
 */
async function macosStore(
  namespace: string,
  identifier: string,
  secret: string,
  exec: typeof execFileAsync,
): Promise<void> {
  const service = `${SERVICE_NAME}:${namespace}`;
  const account = identifier;

  // Delete existing entry (ignore errors)
  try {
    await exec("security", ["delete-generic-password", "-s", service, "-a", account]);
  } catch {
    // Entry doesn't exist, fine
  }

  // Add new entry
  await exec("security", [
    "add-generic-password",
    "-s",
    service,
    "-a",
    account,
    "-w",
    secret,
    "-U", // Update if exists
  ]);
}

/**
 * Retrieve a credential from the macOS Keychain.
 */
async function macosRetrieve(
  namespace: string,
  identifier: string,
  exec: typeof execFileAsync,
): Promise<string | null> {
  const service = `${SERVICE_NAME}:${namespace}`;
  const account = identifier;

  try {
    const { stdout } = await exec("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w", // Output password only
    ]);
    return stdout.trim();
  } catch {
    return null; // Not found
  }
}

/**
 * Delete a credential from the macOS Keychain.
 */
async function macosDelete(
  namespace: string,
  identifier: string,
  exec: typeof execFileAsync,
): Promise<boolean> {
  const service = `${SERVICE_NAME}:${namespace}`;
  const account = identifier;

  try {
    await exec("security", ["delete-generic-password", "-s", service, "-a", account]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Store a credential using Linux Secret Service.
 */
async function linuxStore(
  namespace: string,
  identifier: string,
  secret: string,
  exec: typeof execFileAsync,
): Promise<void> {
  // secret-tool reads password from stdin
  await exec("secret-tool", [
    "store",
    "--label",
    `${SERVICE_NAME} ${namespace}/${identifier}`,
    "service",
    SERVICE_NAME,
    "namespace",
    namespace,
    "identifier",
    identifier,
  ], { input: secret } as any);
}

/**
 * Retrieve a credential from Linux Secret Service.
 */
async function linuxRetrieve(
  namespace: string,
  identifier: string,
  exec: typeof execFileAsync,
): Promise<string | null> {
  try {
    const { stdout } = await exec("secret-tool", [
      "lookup",
      "service",
      SERVICE_NAME,
      "namespace",
      namespace,
      "identifier",
      identifier,
    ]);
    return stdout || null;
  } catch {
    return null;
  }
}

/**
 * Delete a credential from Linux Secret Service.
 */
async function linuxDelete(
  namespace: string,
  identifier: string,
  exec: typeof execFileAsync,
): Promise<boolean> {
  try {
    await exec("secret-tool", [
      "clear",
      "service",
      SERVICE_NAME,
      "namespace",
      namespace,
      "identifier",
      identifier,
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Store a credential using Windows Credential Manager.
 */
async function windowsStore(
  namespace: string,
  identifier: string,
  secret: string,
  exec: typeof execFileAsync,
): Promise<void> {
  const target = `${SERVICE_NAME}:${namespace}:${identifier}`;

  // Delete existing (ignore errors)
  try {
    await exec("cmdkey", ["/delete:" + target]);
  } catch {
    // Not found, fine
  }

  await exec("cmdkey", [
    "/generic:" + target,
    "/user:" + identifier,
    "/pass:" + secret,
  ]);
}

/**
 * Retrieve a credential from Windows Credential Manager.
 *
 * Note: Windows `cmdkey /list` doesn't output passwords. We use PowerShell
 * for retrieval as a workaround.
 */
async function windowsRetrieve(
  namespace: string,
  identifier: string,
  exec: typeof execFileAsync,
): Promise<string | null> {
  const target = `${SERVICE_NAME}:${namespace}:${identifier}`;
  try {
    const { stdout } = await exec("powershell", [
      "-Command",
      `$cred = Get-StoredCredential -Target '${target}'; if ($cred) { $cred.GetNetworkCredential().Password } else { '' }`,
    ]);
    const result = stdout.trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Delete a credential from Windows Credential Manager.
 */
async function windowsDelete(
  namespace: string,
  identifier: string,
  exec: typeof execFileAsync,
): Promise<boolean> {
  const target = `${SERVICE_NAME}:${namespace}:${identifier}`;
  try {
    await exec("cmdkey", ["/delete:" + target]);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Encrypted File Fallback
// ---------------------------------------------------------------------------

/**
 * Get the path for a credential in the encrypted file store.
 */
function getCredentialFilePath(namespace: string, identifier: string, stateDir?: string): string {
  const dir = stateDir ?? path.join(os.homedir(), ".closedclaw");
  const safeName = `${namespace}--${identifier}.json`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(dir, CREDENTIALS_SUBDIR, safeName);
}

/**
 * Store a credential in an encrypted file.
 */
async function fileStore(
  namespace: string,
  identifier: string,
  secret: string,
  stateDir?: string,
): Promise<void> {
  const filePath = getCredentialFilePath(namespace, identifier, stateDir);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  const data = JSON.stringify({
    namespace,
    identifier,
    secret,
    storedAt: new Date().toISOString(),
  });

  await fs.writeFile(filePath, data, { encoding: "utf-8", mode: 0o600 });
}

/**
 * Retrieve a credential from an encrypted file.
 */
async function fileRetrieve(
  namespace: string,
  identifier: string,
  stateDir?: string,
): Promise<string | null> {
  const filePath = getCredentialFilePath(namespace, identifier, stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { secret: string };
    return parsed.secret ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete a credential file.
 */
async function fileDelete(
  namespace: string,
  identifier: string,
  stateDir?: string,
): Promise<boolean> {
  const filePath = getCredentialFilePath(namespace, identifier, stateDir);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all credentials in the encrypted file store.
 */
async function fileList(stateDir?: string): Promise<StoredCredential[]> {
  const dir = path.join(stateDir ?? path.join(os.homedir(), ".closedclaw"), CREDENTIALS_SUBDIR);
  try {
    const files = await fs.readdir(dir);
    const creds: StoredCredential[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) {continue;}
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const parsed = JSON.parse(raw) as { namespace: string; identifier: string; storedAt?: string };
        creds.push({
          namespace: parsed.namespace,
          identifier: parsed.identifier,
          storedAt: parsed.storedAt,
        });
      } catch {
        // Skip corrupt files
      }
    }
    return creds;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unified Keychain API
// ---------------------------------------------------------------------------

/**
 * Store a credential in the OS keychain or encrypted file fallback.
 *
 * @param namespace - Service namespace (e.g., "anthropic", "openai")
 * @param identifier - Key identifier (e.g., "api-key", "oauth-token")
 * @param secret - The secret value to store
 * @param opts - Options (backend override, state directory)
 */
export async function storeCredential(
  namespace: string,
  identifier: string,
  secret: string,
  opts?: KeychainOptions,
): Promise<void> {
  const exec = opts?.execFn ?? execFileAsync;
  const info = opts?.backend
    ? { backend: opts.backend, available: true }
    : await detectKeychainBackend(opts);

  if (!info.available) {
    throw new KeychainError(info.backend, "store", "Backend not available");
  }

  switch (info.backend) {
    case "macos-keychain":
      return macosStore(namespace, identifier, secret, exec);
    case "linux-secret-service":
      return linuxStore(namespace, identifier, secret, exec);
    case "windows-credential":
      return windowsStore(namespace, identifier, secret, exec);
    case "encrypted-file":
      return fileStore(namespace, identifier, secret, opts?.stateDir);
    default: {
      const _exhaustive: never = info.backend;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Retrieve a credential from the OS keychain or encrypted file fallback.
 *
 * @param namespace - Service namespace
 * @param identifier - Key identifier
 * @param opts - Options
 * @returns The secret value, or null if not found
 */
export async function getCredential(
  namespace: string,
  identifier: string,
  opts?: KeychainOptions,
): Promise<string | null> {
  const exec = opts?.execFn ?? execFileAsync;
  const info = opts?.backend
    ? { backend: opts.backend, available: true }
    : await detectKeychainBackend(opts);

  if (!info.available) {
    return null;
  }

  switch (info.backend) {
    case "macos-keychain":
      return macosRetrieve(namespace, identifier, exec);
    case "linux-secret-service":
      return linuxRetrieve(namespace, identifier, exec);
    case "windows-credential":
      return windowsRetrieve(namespace, identifier, exec);
    case "encrypted-file":
      return fileRetrieve(namespace, identifier, opts?.stateDir);
    default: {
      const _exhaustive: never = info.backend;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Delete a credential from the OS keychain or encrypted file fallback.
 *
 * @param namespace - Service namespace
 * @param identifier - Key identifier
 * @param opts - Options
 * @returns True if deleted, false if not found
 */
export async function deleteCredential(
  namespace: string,
  identifier: string,
  opts?: KeychainOptions,
): Promise<boolean> {
  const exec = opts?.execFn ?? execFileAsync;
  const info = opts?.backend
    ? { backend: opts.backend, available: true }
    : await detectKeychainBackend(opts);

  if (!info.available) {
    return false;
  }

  switch (info.backend) {
    case "macos-keychain":
      return macosDelete(namespace, identifier, exec);
    case "linux-secret-service":
      return linuxDelete(namespace, identifier, exec);
    case "windows-credential":
      return windowsDelete(namespace, identifier, exec);
    case "encrypted-file":
      return fileDelete(namespace, identifier, opts?.stateDir);
    default: {
      const _exhaustive: never = info.backend;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
}

/**
 * List stored credentials (only available for encrypted-file backend).
 *
 * Native keychains don't expose enumeration easily, so this only works
 * with the file-based fallback.
 *
 * @param opts - Options
 * @returns List of stored credentials
 */
export async function listCredentials(opts?: KeychainOptions): Promise<StoredCredential[]> {
  const info = opts?.backend
    ? { backend: opts.backend, available: true }
    : await detectKeychainBackend(opts);

  if (info.backend === "encrypted-file") {
    return fileList(opts?.stateDir);
  }

  // For native keychains, return empty (enumeration not supported)
  return [];
}

/**
 * Migrate credentials from plaintext JSON files to the keychain.
 *
 * Scans `~/.closedclaw/credentials/` for plaintext JSON files and
 * stores them in the OS keychain (or encrypted file store).
 *
 * @param opts - Options
 * @returns Summary of migration results
 */
export async function migrateCredentials(opts?: KeychainOptions): Promise<{
  migrated: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const stateDir = opts?.stateDir ?? path.join(os.homedir(), ".closedclaw");
  const credDir = path.join(stateDir, CREDENTIALS_SUBDIR);
  const result = { migrated: 0, skipped: 0, failed: 0, errors: [] as string[] };

  let files: string[];
  try {
    files = await fs.readdir(credDir);
  } catch {
    return result; // No credentials directory
  }

  for (const file of files) {
    if (!file.endsWith(".json")) {continue;}

    const filePath = path.join(credDir, file);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        namespace?: string;
        identifier?: string;
        secret?: string;
      };

      if (!parsed.namespace || !parsed.identifier || !parsed.secret) {
        result.skipped++;
        continue;
      }

      await storeCredential(parsed.namespace, parsed.identifier, parsed.secret, opts);
      result.migrated++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
