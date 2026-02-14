/**
 * Tests for keychain CLI commands.
 *
 * @see {@link ./keychain.ts}
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import * as keychainModule from "../security/keychain.js";
import { keychainStatusCommand, keychainMigrateCommand, keychainListCommand } from "./keychain.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock runtime that captures log output.
 */
function createMockRuntime(): RuntimeEnv & { logs: string[] } {
  const logs: string[] = [];
  return {
    log: (msg: string) => {
      logs.push(msg);
    },
    logs,
  } as RuntimeEnv & { logs: string[] };
}

/**
 * Strip ANSI color codes from a string for easier testing.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// keychainStatusCommand
// ---------------------------------------------------------------------------

describe("keychainStatusCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows backend status in human-readable format", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "macos-keychain",
      available: true,
      description: "macOS Keychain via `security` CLI",
      toolPath: "/usr/bin/security",
    });

    const runtime = createMockRuntime();
    await keychainStatusCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Keychain Status");
    expect(output).toContain("Backend:");
    expect(output).toContain("macOS Keychain");
    expect(output).toContain("Available: yes");
    expect(output).toContain("/usr/bin/security");
  });

  it("shows recommendations for each backend type", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "linux-secret-service",
      available: true,
      description: "Linux Secret Service",
    });

    const runtime = createMockRuntime();
    await keychainStatusCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Recommendations");
    expect(output).toContain("GNOME Keyring");
  });

  it("warns when using encrypted-file fallback", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    const runtime = createMockRuntime();
    await keychainStatusCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("No OS keychain detected");
    expect(output).toContain("encrypted files");
  });

  it("outputs JSON when requested", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "windows-credential",
      available: true,
      description: "Windows Credential Manager",
      toolPath: "cmdkey",
    });

    const runtime = createMockRuntime();
    await keychainStatusCommand(runtime, { json: true });

    const output = runtime.logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.backend).toBe("windows-credential");
    expect(parsed.available).toBe(true);
    expect(parsed.toolPath).toBe("cmdkey");
  });

  it("shows next steps for migration", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "macos-keychain",
      available: true,
      description: "macOS Keychain",
    });

    const runtime = createMockRuntime();
    await keychainStatusCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Next Steps");
    expect(output).toContain("closedclaw security keychain migrate");
    expect(output).toContain("closedclaw security keychain list");
  });
});

// ---------------------------------------------------------------------------
// keychainMigrateCommand
// ---------------------------------------------------------------------------

describe("keychainMigrateCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows migration results with counts", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "macos-keychain",
      available: true,
      description: "macOS Keychain",
    });

    vi.spyOn(keychainModule, "migrateCredentials").mockResolvedValue({
      migrated: 5,
      skipped: 2,
      failed: 1,
      errors: ["file.json: parse error"],
    });

    const runtime = createMockRuntime();
    await keychainMigrateCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Migration Results");
    expect(output).toContain("Migrated: 5");
    expect(output).toContain("Skipped:  2");
    expect(output).toContain("Failed:   1");
    expect(output).toContain("file.json: parse error");
  });

  it("shows message when no credentials found", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "migrateCredentials").mockResolvedValue({
      migrated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    });

    const runtime = createMockRuntime();
    await keychainMigrateCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("No credentials found");
    expect(output).toContain("~/.closedclaw/credentials/");
  });

  it("shows next steps after successful migration", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "linux-secret-service",
      available: true,
      description: "Linux Secret Service",
    });

    vi.spyOn(keychainModule, "migrateCredentials").mockResolvedValue({
      migrated: 3,
      skipped: 0,
      failed: 0,
      errors: [],
    });

    const runtime = createMockRuntime();
    await keychainMigrateCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Next Steps");
    expect(output).toContain("Original JSON files");
    expect(output).toContain("rm -rf ~/.closedclaw/credentials/*.json");
  });

  it("supports dry-run mode", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "macos-keychain",
      available: true,
      description: "macOS Keychain",
    });

    const migrateSpy = vi.spyOn(keychainModule, "migrateCredentials");

    const runtime = createMockRuntime();
    await keychainMigrateCommand(runtime, { dryRun: true, json: false });

    expect(migrateSpy).not.toHaveBeenCalled();
    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("dry-run mode");
  });

  it("outputs JSON when requested", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "windows-credential",
      available: true,
      description: "Windows Credential Manager",
    });

    vi.spyOn(keychainModule, "migrateCredentials").mockResolvedValue({
      migrated: 2,
      skipped: 1,
      failed: 0,
      errors: [],
    });

    const runtime = createMockRuntime();
    await keychainMigrateCommand(runtime, { json: true });

    const output = runtime.logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.backend).toBe("windows-credential");
    expect(parsed.result.migrated).toBe(2);
    expect(parsed.result.skipped).toBe(1);
  });

  it("shows errors with details", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "migrateCredentials").mockResolvedValue({
      migrated: 1,
      skipped: 0,
      failed: 2,
      errors: ["bad1.json: Missing namespace field", "bad2.json: Invalid JSON syntax"],
    });

    const runtime = createMockRuntime();
    await keychainMigrateCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Errors");
    expect(output).toContain("bad1.json: Missing namespace field");
    expect(output).toContain("bad2.json: Invalid JSON syntax");
  });
});

// ---------------------------------------------------------------------------
// keychainListCommand
// ---------------------------------------------------------------------------

describe("keychainListCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists credentials from file backend", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([
      { namespace: "anthropic", identifier: "api-key", storedAt: "2026-02-10T10:00:00Z" },
      { namespace: "anthropic", identifier: "oauth-token", storedAt: "2026-02-10T11:00:00Z" },
      { namespace: "openai", identifier: "api-key" },
    ]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Stored Credentials");
    expect(output).toContain("Found 3 credential(s)");
    expect(output).toContain("anthropic:");
    expect(output).toContain("api-key");
    expect(output).toContain("oauth-token");
    expect(output).toContain("openai:");
  });

  it("shows message when no credentials found", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("No credentials stored");
  });

  it("explains that native keychains don't support listing", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "macos-keychain",
      available: true,
      description: "macOS Keychain",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("keychains don't support enumeration");
    expect(output).toContain("Keychain Access.app");
  });

  it("shows Linux keychain access instructions", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "linux-secret-service",
      available: true,
      description: "Linux Secret Service",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("seahorse");
    expect(output).toContain("kwalletmanager");
  });

  it("shows Windows keychain access instructions", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "windows-credential",
      available: true,
      description: "Windows Credential Manager",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("Control Panel");
    expect(output).toContain("Credential Manager");
  });

  it("outputs JSON when requested", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([
      { namespace: "slack", identifier: "bot-token" },
    ]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: true });

    const output = runtime.logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.backend).toBe("encrypted-file");
    expect(parsed.credentials).toHaveLength(1);
    expect(parsed.credentials[0].namespace).toBe("slack");
  });

  it("groups credentials by namespace", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([
      { namespace: "github", identifier: "token1" },
      { namespace: "github", identifier: "token2" },
      { namespace: "gitlab", identifier: "token1" },
    ]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("github:");
    expect(output).toContain("token1");
    expect(output).toContain("token2");
    expect(output).toContain("gitlab:");
  });

  it("shows stored timestamps when available", async () => {
    vi.spyOn(keychainModule, "detectKeychainBackend").mockResolvedValue({
      backend: "encrypted-file",
      available: true,
      description: "Encrypted file store",
    });

    vi.spyOn(keychainModule, "listCredentials").mockResolvedValue([
      { namespace: "test", identifier: "cred1", storedAt: "2026-02-10T12:00:00Z" },
    ]);

    const runtime = createMockRuntime();
    await keychainListCommand(runtime, { json: false });

    const output = stripAnsi(runtime.logs.join("\n"));
    expect(output).toContain("stored:");
  });
});
