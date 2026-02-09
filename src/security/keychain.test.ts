/**
 * Tests for OS keychain integration.
 *
 * @see {@link ../keychain.ts}
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  detectKeychainBackend,
  storeCredential,
  getCredential,
  deleteCredential,
  listCredentials,
  migrateCredentials,
  KeychainError,
  type KeychainBackend,
  type KeychainOptions,
} from "./keychain.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "keychain-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Create a mock exec function that simulates CLI tools.
 */
function createMockExec(responses: Record<string, { stdout: string; stderr?: string }> = {}) {
  return vi.fn(async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;

    // Check for specific responses
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) {
        return response;
      }
    }

    // Default: simulate "not found" for which/where
    if (cmd === "which" || cmd === "where") {
      throw new Error("not found");
    }

    return { stdout: "", stderr: "" };
  }) as any;
}

// ---------------------------------------------------------------------------
// detectKeychainBackend
// ---------------------------------------------------------------------------

describe("detectKeychainBackend", () => {
  it("falls back to encrypted-file when no CLI tools available", async () => {
    const mockExec = createMockExec();
    const info = await detectKeychainBackend({ execFn: mockExec });
    expect(info.backend).toBe("encrypted-file");
    expect(info.available).toBe(true);
    expect(info.description).toContain("Encrypted file");
  });

  it("detects macOS keychain when security CLI is available", async () => {
    const platform = os.platform();
    if (platform !== "darwin") {
      // Mock for non-macOS
      const origPlatform = Object.getOwnPropertyDescriptor(os, "platform");
      vi.spyOn(os, "platform").mockReturnValue("darwin");
      const mockExec = createMockExec({ "which security": { stdout: "/usr/bin/security" } });
      const info = await detectKeychainBackend({ execFn: mockExec });
      expect(info.backend).toBe("macos-keychain");
      expect(info.available).toBe(true);
      vi.restoreAllMocks();
    }
  });

  it("detects Linux secret service when secret-tool is available", async () => {
    const origPlatform = os.platform();
    vi.spyOn(os, "platform").mockReturnValue("linux");
    const mockExec = createMockExec({ "which secret-tool": { stdout: "/usr/bin/secret-tool" } });
    const info = await detectKeychainBackend({ execFn: mockExec });
    expect(info.backend).toBe("linux-secret-service");
    expect(info.available).toBe(true);
    vi.restoreAllMocks();
  });

  it("detects Windows credential manager when cmdkey is available", async () => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    const mockExec = createMockExec({ "where cmdkey": { stdout: "C:\\windows\\cmdkey.exe" } });
    const info = await detectKeychainBackend({ execFn: mockExec });
    expect(info.backend).toBe("windows-credential");
    expect(info.available).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Encrypted file backend (always available, primary test target)
// ---------------------------------------------------------------------------

describe("encrypted-file backend", () => {
  const opts: KeychainOptions = {
    backend: "encrypted-file",
    stateDir: "", // Will be set in beforeEach
  };

  beforeEach(() => {
    opts.stateDir = tmpDir;
  });

  describe("storeCredential", () => {
    it("stores a credential as JSON file", async () => {
      await storeCredential("anthropic", "api-key", "sk-test-123", opts);

      const credDir = path.join(tmpDir, "credentials");
      const files = await fs.readdir(credDir);
      expect(files.length).toBe(1);
      expect(files[0]).toContain("anthropic");
    });

    it("creates credentials directory if needed", async () => {
      const subDir = path.join(tmpDir, "subdir");
      await storeCredential("openai", "api-key", "sk-test", { ...opts, stateDir: subDir });

      const stat = await fs.stat(path.join(subDir, "credentials"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("overwrites existing credential", async () => {
      await storeCredential("anthropic", "api-key", "old-value", opts);
      await storeCredential("anthropic", "api-key", "new-value", opts);

      const result = await getCredential("anthropic", "api-key", opts);
      expect(result).toBe("new-value");
    });
  });

  describe("getCredential", () => {
    it("retrieves stored credential", async () => {
      await storeCredential("anthropic", "api-key", "sk-test-123", opts);
      const result = await getCredential("anthropic", "api-key", opts);
      expect(result).toBe("sk-test-123");
    });

    it("returns null for non-existent credential", async () => {
      const result = await getCredential("nonexistent", "missing", opts);
      expect(result).toBeNull();
    });

    it("handles unicode secrets", async () => {
      const unicodeSecret = "密码🔑パスワード";
      await storeCredential("test", "unicode", unicodeSecret, opts);
      const result = await getCredential("test", "unicode", opts);
      expect(result).toBe(unicodeSecret);
    });

    it("handles secrets with special characters", async () => {
      const specialSecret = 'sk-ant-api03-foo_bar/baz+qux=';
      await storeCredential("test", "special", specialSecret, opts);
      const result = await getCredential("test", "special", opts);
      expect(result).toBe(specialSecret);
    });
  });

  describe("deleteCredential", () => {
    it("deletes existing credential", async () => {
      await storeCredential("anthropic", "api-key", "sk-test", opts);
      const deleted = await deleteCredential("anthropic", "api-key", opts);
      expect(deleted).toBe(true);

      const result = await getCredential("anthropic", "api-key", opts);
      expect(result).toBeNull();
    });

    it("returns false for non-existent credential", async () => {
      const deleted = await deleteCredential("nonexistent", "missing", opts);
      expect(deleted).toBe(false);
    });
  });

  describe("listCredentials", () => {
    it("returns empty list when no credentials exist", async () => {
      const creds = await listCredentials(opts);
      expect(creds).toEqual([]);
    });

    it("lists all stored credentials", async () => {
      await storeCredential("anthropic", "api-key", "sk-1", opts);
      await storeCredential("openai", "api-key", "sk-2", opts);
      await storeCredential("slack", "oauth-token", "xoxb-3", opts);

      const creds = await listCredentials(opts);
      expect(creds).toHaveLength(3);

      const namespaces = creds.map((c) => c.namespace).toSorted();
      expect(namespaces).toEqual(["anthropic", "openai", "slack"]);
    });

    it("includes storedAt timestamp", async () => {
      await storeCredential("test", "key", "value", opts);
      const creds = await listCredentials(opts);
      expect(creds[0].storedAt).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// macOS keychain backend (mocked)
// ---------------------------------------------------------------------------

describe("macOS keychain backend (mocked)", () => {
  const stored = new Map<string, string>();

  const mockExec = vi.fn(async (cmd: string, args: string[]) => {
    if (cmd === "security" && args[0] === "add-generic-password") {
      const serviceIdx = args.indexOf("-s");
      const accountIdx = args.indexOf("-a");
      const passwordIdx = args.indexOf("-w");
      if (serviceIdx >= 0 && accountIdx >= 0 && passwordIdx >= 0) {
        const key = `${args[serviceIdx + 1]}:${args[accountIdx + 1]}`;
        stored.set(key, args[passwordIdx + 1]);
      }
      return { stdout: "" };
    }

    if (cmd === "security" && args[0] === "find-generic-password") {
      const serviceIdx = args.indexOf("-s");
      const accountIdx = args.indexOf("-a");
      if (serviceIdx >= 0 && accountIdx >= 0) {
        const key = `${args[serviceIdx + 1]}:${args[accountIdx + 1]}`;
        const value = stored.get(key);
        if (value) {return { stdout: value + "\n" };}
      }
      throw new Error("SecKeychainSearchCopyNext: The specified item could not be found");
    }

    if (cmd === "security" && args[0] === "delete-generic-password") {
      const serviceIdx = args.indexOf("-s");
      const accountIdx = args.indexOf("-a");
      if (serviceIdx >= 0 && accountIdx >= 0) {
        const key = `${args[serviceIdx + 1]}:${args[accountIdx + 1]}`;
        if (stored.has(key)) {
          stored.delete(key);
          return { stdout: "" };
        }
      }
      throw new Error("SecKeychainSearchCopyNext: The specified item could not be found");
    }

    return { stdout: "" };
  }) as any;

  const opts: KeychainOptions = { backend: "macos-keychain", execFn: mockExec };

  beforeEach(() => {
    stored.clear();
    mockExec.mockClear();
  });

  it("stores and retrieves a credential", async () => {
    await storeCredential("anthropic", "api-key", "sk-test-mac", opts);
    const result = await getCredential("anthropic", "api-key", opts);
    expect(result).toBe("sk-test-mac");
  });

  it("returns null for missing credential", async () => {
    const result = await getCredential("nonexistent", "key", opts);
    expect(result).toBeNull();
  });

  it("deletes a credential", async () => {
    await storeCredential("anthropic", "api-key", "sk-test", opts);
    const deleted = await deleteCredential("anthropic", "api-key", opts);
    expect(deleted).toBe(true);

    const result = await getCredential("anthropic", "api-key", opts);
    expect(result).toBeNull();
  });

  it("returns false when deleting non-existent credential", async () => {
    const deleted = await deleteCredential("nonexistent", "key", opts);
    expect(deleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// migrateCredentials
// ---------------------------------------------------------------------------

describe("migrateCredentials", () => {
  it("returns zero counts when no credentials directory exists", async () => {
    const result = await migrateCredentials({
      backend: "encrypted-file",
      stateDir: path.join(tmpDir, "empty"),
    });
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("migrates valid credential files", async () => {
    const credDir = path.join(tmpDir, "credentials");
    await fs.mkdir(credDir, { recursive: true });

    // Write a credential file
    await fs.writeFile(
      path.join(credDir, "anthropic--api-key.json"),
      JSON.stringify({
        namespace: "anthropic",
        identifier: "api-key",
        secret: "sk-migrate-test",
      }),
    );

    // Migrate to a different directory
    const targetDir = path.join(tmpDir, "target");
    const result = await migrateCredentials({
      backend: "encrypted-file",
      stateDir: targetDir,
    });

    // Migration reads from stateDir, but credential was in tmpDir
    // Need to set stateDir to tmpDir for source
    const result2 = await migrateCredentials({
      backend: "encrypted-file",
      stateDir: tmpDir,
    });
    expect(result2.migrated).toBe(1);
  });

  it("skips files without required fields", async () => {
    const credDir = path.join(tmpDir, "credentials");
    await fs.mkdir(credDir, { recursive: true });

    await fs.writeFile(
      path.join(credDir, "incomplete.json"),
      JSON.stringify({ namespace: "test" }), // Missing identifier and secret
    );

    const result = await migrateCredentials({
      backend: "encrypted-file",
      stateDir: tmpDir,
    });
    expect(result.skipped).toBe(1);
  });

  it("handles corrupt files gracefully", async () => {
    const credDir = path.join(tmpDir, "credentials");
    await fs.mkdir(credDir, { recursive: true });

    await fs.writeFile(path.join(credDir, "corrupt.json"), "NOT JSON");

    const result = await migrateCredentials({
      backend: "encrypted-file",
      stateDir: tmpDir,
    });
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// KeychainError
// ---------------------------------------------------------------------------

describe("KeychainError", () => {
  it("includes backend and operation", () => {
    const err = new KeychainError("macos-keychain", "store", "Something failed");
    expect(err.backend).toBe("macos-keychain");
    expect(err.operation).toBe("store");
    expect(err.name).toBe("KeychainError");
    expect(err.message).toContain("macos-keychain");
    expect(err.message).toContain("store");
    expect(err.message).toContain("Something failed");
  });
});

// ---------------------------------------------------------------------------
// Integration: store → get → delete cycle
// ---------------------------------------------------------------------------

describe("full credential lifecycle (encrypted-file)", () => {
  it("store → get → list → delete → get returns null", async () => {
    const opts: KeychainOptions = { backend: "encrypted-file", stateDir: tmpDir };

    // Store
    await storeCredential("provider", "token", "secret-value", opts);

    // Get
    const value = await getCredential("provider", "token", opts);
    expect(value).toBe("secret-value");

    // List
    const creds = await listCredentials(opts);
    expect(creds).toHaveLength(1);
    expect(creds[0].namespace).toBe("provider");
    expect(creds[0].identifier).toBe("token");

    // Delete
    const deleted = await deleteCredential("provider", "token", opts);
    expect(deleted).toBe(true);

    // Get again
    const gone = await getCredential("provider", "token", opts);
    expect(gone).toBeNull();

    // List again
    const empty = await listCredentials(opts);
    expect(empty).toHaveLength(0);
  });

  it("handles multiple credentials for same namespace", async () => {
    const opts: KeychainOptions = { backend: "encrypted-file", stateDir: tmpDir };

    await storeCredential("anthropic", "api-key", "sk-1", opts);
    await storeCredential("anthropic", "oauth-token", "xoxb-2", opts);

    const key = await getCredential("anthropic", "api-key", opts);
    expect(key).toBe("sk-1");

    const token = await getCredential("anthropic", "oauth-token", opts);
    expect(token).toBe("xoxb-2");

    const creds = await listCredentials(opts);
    expect(creds).toHaveLength(2);
  });
});
