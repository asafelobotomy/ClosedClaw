import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import { generateKeyPair, formatPublicKeyPem } from "../security/skill-signing.js";
import { addTrustedKey, removeTrustedKey, getTrustedKey } from "../security/trusted-keyring.js";
import {
  listKeysCommand,
  addKeyCommand,
  removeKeyCommand,
  trustKeyCommand,
} from "./keys-management.js";

describe("keys-management commands", () => {
  let testDir: string;
  let runtime: RuntimeEnv;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let testKeyPairs: Array<{
    publicKey: string;
    privateKey: string;
    keyId: string;
    signer: string;
  }> = [];

  beforeAll(async () => {
    // Create temp directory for key files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "keys-mgmt-test-"));

    // Generate test key pairs
    for (let i = 0; i < 3; i++) {
      const keyPair = await generateKeyPair(`Test Signer ${i + 1}`);
      testKeyPairs.push({
        ...keyPair,
        signer: `Test Signer ${i + 1}`,
      });
    }
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clean up test keys from keyring
    for (const keyPair of testKeyPairs) {
      try {
        await removeTrustedKey(keyPair.keyId);
      } catch {
        // Ignore if not present
      }
    }
  });

  beforeEach(async () => {
    // Create mock runtime
    runtime = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn() as unknown as RuntimeEnv["exit"],
    };

    // Mock process.exit to prevent test termination
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as typeof process.exit);

    // Clean keyring before each test
    for (const keyPair of testKeyPairs) {
      try {
        await removeTrustedKey(keyPair.keyId);
      } catch {
        // Ignore if not present
      }
    }
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  /** Write a PEM string to a temp file and return the file path. */
  async function writeKeyFile(keyPem: string, filename = "test-key.pub"): Promise<string> {
    const keyFilePath = path.join(testDir, filename);
    await fs.writeFile(keyFilePath, keyPem);
    return keyFilePath;
  }

  describe("addKeyCommand", () => {
    it("adds key from PEM file", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      const keyFilePath = await writeKeyFile(publicKeyPem);

      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: keyPair.signer,
        trust: "full",
      });

      // Verify key in keyring
      const key = await getTrustedKey(keyPair.keyId);
      expect(key).toBeDefined();
      expect(key?.name).toBe(keyPair.signer);
      expect(key?.trustLevel).toBe("full");
      expect(runtime.log).toHaveBeenCalled();
    });

    it("adds key from file path with marginal trust", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      const keyFilePath = await writeKeyFile(publicKeyPem, "marginal-key.pub");

      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: keyPair.signer,
        trust: "marginal",
      });

      // Verify key in keyring
      const key = await getTrustedKey(keyPair.keyId);
      expect(key).toBeDefined();
      expect(key?.trustLevel).toBe("marginal");
    });

    it("defaults to marginal trust level", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      const keyFilePath = await writeKeyFile(publicKeyPem);

      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: keyPair.signer,
        // No trust specified — should default to marginal
      });

      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("marginal");
    });

    it("overwrites existing key with same ID", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      const keyFilePath = await writeKeyFile(publicKeyPem);

      // Add key first time
      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: keyPair.signer,
        trust: "full",
      });

      // Add same key again with different name/trust
      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: "Different Signer",
        trust: "marginal",
      });

      // Should be overwritten
      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.name).toBe("Different Signer");
      expect(key?.trustLevel).toBe("marginal");
    });

    it("validates public key format", async () => {
      const keyFilePath = await writeKeyFile("not a valid PEM key", "bad-key.pub");

      // fingerprintPublicKey will throw on invalid PEM content
      await expect(
        addKeyCommand(runtime, "test-key-id", keyFilePath, {
          name: "Test Signer",
          trust: "full",
        }),
      ).rejects.toThrow();
    });

    it("outputs JSON when requested", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      const keyFilePath = await writeKeyFile(publicKeyPem);

      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: keyPair.signer,
        trust: "full",
        json: true,
      });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);
      expect(result.keyId).toBe(keyPair.keyId);
      expect(result.trustLevel).toBe("full");
      expect(result.added).toBe(true);
    });

    it("handles non-existent key file", async () => {
      await expect(
        addKeyCommand(runtime, "test-key-id", "/nonexistent/key.pub", {
          name: "Test Signer",
          trust: "full",
        }),
      ).rejects.toThrow("process.exit called");

      expect(runtime.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read public key"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("removeKeyCommand", () => {
    beforeEach(async () => {
      // Add a test key for removal
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      await addTrustedKey(keyPair.keyId, {
        name: keyPair.signer,
        publicKeyPem,
        trustLevel: "full",
        added: new Date().toISOString(),
        verifiedVia: "manual",
      });
    });

    it("removes existing key", async () => {
      const keyPair = testKeyPairs[0];

      await removeKeyCommand(runtime, keyPair.keyId, {});

      expect(runtime.log).toHaveBeenCalled();

      // Verify key is gone
      const key = await getTrustedKey(keyPair.keyId);
      expect(key).toBeUndefined();
    });

    it("outputs JSON when removing", async () => {
      const keyPair = testKeyPairs[0];

      await removeKeyCommand(runtime, keyPair.keyId, { json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);
      expect(result.removed).toBe(true);
      expect(result.keyId).toBe(keyPair.keyId);
    });

    it("exits with error for non-existent key", async () => {
      await expect(removeKeyCommand(runtime, "nonexistent-key-id", {})).rejects.toThrow(
        "process.exit called",
      );

      expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("Key not found"));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("trustKeyCommand", () => {
    beforeEach(async () => {
      // Add test keys with different trust levels
      for (const [index, keyPair] of testKeyPairs.entries()) {
        const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
        await addTrustedKey(keyPair.keyId, {
          name: keyPair.signer,
          publicKeyPem,
          trustLevel: index === 0 ? "full" : "marginal",
          added: new Date().toISOString(),
          verifiedVia: "manual",
        });
      }
    });

    it("changes trust level from marginal to full", async () => {
      const keyPair = testKeyPairs[1]; // marginal trust

      await trustKeyCommand(runtime, keyPair.keyId, { trust: "full" });

      // Verify in keyring
      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("full");
      expect(runtime.log).toHaveBeenCalled();
    });

    it("changes trust level from full to marginal", async () => {
      const keyPair = testKeyPairs[0]; // full trust

      await trustKeyCommand(runtime, keyPair.keyId, { trust: "marginal" });

      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("marginal");
    });

    it("outputs JSON when requested", async () => {
      const keyPair = testKeyPairs[1];

      await trustKeyCommand(runtime, keyPair.keyId, { trust: "full", json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);
      expect(result.updated).toBe(true);
      expect(result.trustLevel).toBe("full");
      expect(result.keyId).toBe(keyPair.keyId);
    });

    it("exits with error for non-existent key", async () => {
      await expect(
        trustKeyCommand(runtime, "nonexistent-key-id", { trust: "full" }),
      ).rejects.toThrow("process.exit called");

      expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("Key not found"));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("is idempotent when setting same trust level", async () => {
      const keyPair = testKeyPairs[0]; // already full trust

      await trustKeyCommand(runtime, keyPair.keyId, { trust: "full" });

      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("full");
    });

    it("exits with error for invalid trust level", async () => {
      const keyPair = testKeyPairs[0];

      await expect(trustKeyCommand(runtime, keyPair.keyId, { trust: "invalid" })).rejects.toThrow(
        "process.exit called",
      );

      expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("Invalid trust level"));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("listKeysCommand", () => {
    beforeEach(async () => {
      // Add multiple test keys
      for (const [index, keyPair] of testKeyPairs.entries()) {
        const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
        await addTrustedKey(keyPair.keyId, {
          name: keyPair.signer,
          publicKeyPem,
          trustLevel: index === 0 ? "full" : "marginal",
          added: new Date().toISOString(),
          verifiedVia: "manual",
          notes: index === 2 ? "Test comment" : undefined,
        });
      }
    });

    it("lists all keys in JSON", async () => {
      await listKeysCommand(runtime, { json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keysMap = JSON.parse(logCall) as Record<string, { name?: string }>;
      expect(Object.keys(keysMap)).toHaveLength(3);

      const names = Object.values(keysMap).map((k) => k.name);
      expect(names).toContain("Test Signer 1");
      expect(names).toContain("Test Signer 2");
      expect(names).toContain("Test Signer 3");
    });

    it("filters by trust level", async () => {
      await listKeysCommand(runtime, { trustLevel: "full", json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keysMap = JSON.parse(logCall) as Record<string, { name?: string; trustLevel?: string }>;
      expect(Object.keys(keysMap)).toHaveLength(1);

      const key = Object.values(keysMap)[0];
      expect(key.name).toBe("Test Signer 1");
      expect(key.trustLevel).toBe("full");
    });

    it("filters marginal trust keys", async () => {
      await listKeysCommand(runtime, { trustLevel: "marginal", json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keysMap = JSON.parse(logCall);
      expect(Object.keys(keysMap)).toHaveLength(2);

      for (const key of Object.values(keysMap)) {
        expect(key.trustLevel).toBe("marginal");
      }
    });

    it("lists keys in formatted display", async () => {
      await listKeysCommand(runtime, {});

      // Multiple log calls for formatted output (heading, key entries, etc.)
      expect(vi.mocked(runtime.log).mock.calls.length).toBeGreaterThan(1);

      // Verify key name appears in output
      const allOutput = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(allOutput).toContain("Test Signer 1");
    });

    it("shows empty message when no keys match filter", async () => {
      // No keys have trust level "none"
      await listKeysCommand(runtime, { trustLevel: "none" });

      const allOutput = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(allOutput).toContain("No trusted keys found");
    });

    it("returns empty JSON object when no keys match filter", async () => {
      await listKeysCommand(runtime, { trustLevel: "none", json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keysMap = JSON.parse(logCall);
      expect(Object.keys(keysMap)).toHaveLength(0);
    });

    it("includes notes when present", async () => {
      await listKeysCommand(runtime, { json: true });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keysMap = JSON.parse(logCall) as Record<string, { name?: string; notes?: string }>;

      // Find the key that has notes (Test Signer 3)
      const keyWithNotes = Object.values(keysMap).find((k) => k.name === "Test Signer 3");
      expect(keyWithNotes).toBeDefined();
      expect(keyWithNotes.notes).toBe("Test comment");
    });

    it("shows notes in formatted display", async () => {
      await listKeysCommand(runtime, {});

      const allOutput = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(allOutput).toContain("Test comment");
    });
  });

  describe("integration: add + list + trust + remove", () => {
    it("full workflow", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      const keyFilePath = await writeKeyFile(publicKeyPem, "workflow-key.pub");

      // 1. Add key
      await addKeyCommand(runtime, keyPair.keyId, keyFilePath, {
        name: keyPair.signer,
        trust: "marginal",
        json: true,
      });

      const addLog = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const addResult = JSON.parse(addLog);
      expect(addResult.added).toBe(true);
      vi.mocked(runtime.log).mockClear();

      // 2. List and verify
      await listKeysCommand(runtime, { json: true });
      const listLog = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keysMap = JSON.parse(listLog);
      expect(keysMap[keyPair.keyId]).toBeDefined();
      expect(keysMap[keyPair.keyId].trustLevel).toBe("marginal");
      vi.mocked(runtime.log).mockClear();

      // 3. Update trust level
      await trustKeyCommand(runtime, keyPair.keyId, { trust: "full", json: true });
      const trustLog = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const trustResult = JSON.parse(trustLog);
      expect(trustResult.updated).toBe(true);
      expect(trustResult.trustLevel).toBe("full");

      // 4. Verify trust change directly
      const updatedKey = await getTrustedKey(keyPair.keyId);
      expect(updatedKey?.trustLevel).toBe("full");
      vi.mocked(runtime.log).mockClear();

      // 5. Remove key
      await removeKeyCommand(runtime, keyPair.keyId, { json: true });
      const removeLog = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const removeResult = JSON.parse(removeLog);
      expect(removeResult.removed).toBe(true);

      // 6. Verify removal
      const removedKey = await getTrustedKey(keyPair.keyId);
      expect(removedKey).toBeUndefined();
    });
  });
});
