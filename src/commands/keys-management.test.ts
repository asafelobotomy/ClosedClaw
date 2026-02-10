import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { generateKeyPair, formatPublicKeyPem } from "../security/skill-signing.js";
import {
  loadKeyring,
  addTrustedKey,
  removeTrustedKey,
  getTrustedKey,
} from "../security/trusted-keyring.js";
import {
  listKeysCommand,
  addKeyCommand,
  removeKeyCommand,
  trustKeyCommand,
} from "./keys-management.js";

describe("keys-management commands", () => {
  let testDir: string;
  let testKeyPairs: Array<{
    publicKey: string;
    privateKey: string;
    keyId: string;
    signer: string;
  }> = [];

  beforeAll(async () => {
    // Create temp directory
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
    // Clean keyring before each test
    for (const keyPair of testKeyPairs) {
      try {
        await removeTrustedKey(keyPair.keyId);
      } catch {
        // Ignore if not present
      }
    }
  });

  describe("addKeyCommand", () => {
    it("adds key from PEM string", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);

      const result = await addKeyCommand({
        keyId: keyPair.keyId,
        publicKey: publicKeyPem,
        signer: keyPair.signer,
        trustLevel: "full",
      });

      expect(result.keyId).toBe(keyPair.keyId);
      expect(result.signer).toBe(keyPair.signer);
      expect(result.trustLevel).toBe("full");
      expect(result.added).toBe(true);

      // Verify key in keyring
      const key = await getTrustedKey(keyPair.keyId);
      expect(key).toBeDefined();
      expect(key?.signer).toBe(keyPair.signer);
      expect(key?.trustLevel).toBe("full");
    });

    it("adds key from file path", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);

      // Write key to file
      const keyFilePath = path.join(testDir, "test-key.pub");
      await fs.writeFile(keyFilePath, publicKeyPem);

      const result = await addKeyCommand({
        keyId: keyPair.keyId,
        publicKeyPath: keyFilePath,
        signer: keyPair.signer,
        trustLevel: "marginal",
      });

      expect(result.added).toBe(true);
      expect(result.trustLevel).toBe("marginal");

      // Verify key in keyring
      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("marginal");
    });

    it("defaults to marginal trust level", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);

      const result = await addKeyCommand({
        keyId: keyPair.keyId,
        publicKey: publicKeyPem,
        signer: keyPair.signer,
        // No trustLevel specified
      });

      expect(result.trustLevel).toBe("marginal");

      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("marginal");
    });

    it("refuses to add duplicate key ID", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);

      // Add key first time
      await addKeyCommand({
        keyId: keyPair.keyId,
        publicKey: publicKeyPem,
        signer: keyPair.signer,
        trustLevel: "full",
      });

      // Try to add same key ID again
      await expect(
        addKeyCommand({
          keyId: keyPair.keyId,
          publicKey: publicKeyPem,
          signer: "Different Signer",
          trustLevel: "full",
        }),
      ).rejects.toThrow(/already exists/i);
    });

    it("validates public key format", async () => {
      await expect(
        addKeyCommand({
          keyId: "test-key-id",
          publicKey: "not a valid PEM key",
          signer: "Test Signer",
          trustLevel: "full",
        }),
      ).rejects.toThrow();
    });

    it("requires either publicKey or publicKeyPath", async () => {
      await expect(
        addKeyCommand({
          keyId: "test-key-id",
          signer: "Test Signer",
          trustLevel: "full",
        }),
      ).rejects.toThrow();
    });

    it("handles non-existent key file", async () => {
      await expect(
        addKeyCommand({
          keyId: "test-key-id",
          publicKeyPath: "/nonexistent/key.pub",
          signer: "Test Signer",
          trustLevel: "full",
        }),
      ).rejects.toThrow();
    });
  });

  describe("removeKeyCommand", () => {
    beforeEach(async () => {
      // Add a test key for removal
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
      await addTrustedKey({
        keyId: keyPair.keyId,
        publicKeyPem,
        signer: keyPair.signer,
        trustLevel: "full",
      });
    });

    it("removes existing key", async () => {
      const keyPair = testKeyPairs[0];

      const result = await removeKeyCommand({
        keyId: keyPair.keyId,
      });

      expect(result.removed).toBe(true);
      expect(result.keyId).toBe(keyPair.keyId);

      // Verify key is gone
      const key = await getTrustedKey(keyPair.keyId);
      expect(key).toBeUndefined();
    });

    it("handles non-existent key gracefully", async () => {
      const result = await removeKeyCommand({
        keyId: "nonexistent-key-id",
      });

      expect(result.removed).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("allows force removal of non-existent key", async () => {
      const result = await removeKeyCommand({
        keyId: "nonexistent-key-id",
        force: true,
      });

      expect(result.removed).toBe(true);
    });
  });

  describe("trustKeyCommand", () => {
    beforeEach(async () => {
      // Add test keys with different trust levels
      for (const [index, keyPair] of testKeyPairs.entries()) {
        const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
        await addTrustedKey({
          keyId: keyPair.keyId,
          publicKeyPem,
          signer: keyPair.signer,
          trustLevel: index === 0 ? "full" : "marginal",
        });
      }
    });

    it("changes trust level from marginal to full", async () => {
      const keyPair = testKeyPairs[1]; // marginal trust

      const result = await trustKeyCommand({
        keyId: keyPair.keyId,
        trustLevel: "full",
      });

      expect(result.updated).toBe(true);
      expect(result.oldTrustLevel).toBe("marginal");
      expect(result.newTrustLevel).toBe("full");

      // Verify in keyring
      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("full");
    });

    it("changes trust level from full to marginal", async () => {
      const keyPair = testKeyPairs[0]; // full trust

      const result = await trustKeyCommand({
        keyId: keyPair.keyId,
        trustLevel: "marginal",
      });

      expect(result.updated).toBe(true);
      expect(result.oldTrustLevel).toBe("full");
      expect(result.newTrustLevel).toBe("marginal");

      const key = await getTrustedKey(keyPair.keyId);
      expect(key?.trustLevel).toBe("marginal");
    });

    it("handles non-existent key", async () => {
      await expect(
        trustKeyCommand({
          keyId: "nonexistent-key-id",
          trustLevel: "full",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("is idempotent when setting same trust level", async () => {
      const keyPair = testKeyPairs[0]; // already full trust

      const result = await trustKeyCommand({
        keyId: keyPair.keyId,
        trustLevel: "full",
      });

      expect(result.updated).toBe(true);
      expect(result.oldTrustLevel).toBe("full");
      expect(result.newTrustLevel).toBe("full");
    });
  });

  describe("listKeysCommand", () => {
    beforeEach(async () => {
      // Add multiple test keys
      for (const [index, keyPair] of testKeyPairs.entries()) {
        const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);
        await addTrustedKey({
          keyId: keyPair.keyId,
          publicKeyPem,
          signer: keyPair.signer,
          trustLevel: index === 0 ? "full" : "marginal",
          comment: index === 2 ? "Test comment" : undefined,
        });
      }
    });

    it("lists all keys", async () => {
      const result = await listKeysCommand({});

      expect(result.keys.length).toBe(3);
      expect(result.keys.map((k) => k.signer)).toContain("Test Signer 1");
      expect(result.keys.map((k) => k.signer)).toContain("Test Signer 2");
      expect(result.keys.map((k) => k.signer)).toContain("Test Signer 3");
    });

    it("filters by trust level", async () => {
      const result = await listKeysCommand({
        trustLevel: "full",
      });

      expect(result.keys.length).toBe(1);
      expect(result.keys[0].signer).toBe("Test Signer 1");
      expect(result.keys[0].trustLevel).toBe("full");
    });

    it("filters by signer name", async () => {
      const result = await listKeysCommand({
        signer: "Test Signer 2",
      });

      expect(result.keys.length).toBe(1);
      expect(result.keys[0].signer).toBe("Test Signer 2");
    });

    it("filters by key ID", async () => {
      const keyPair = testKeyPairs[0];

      const result = await listKeysCommand({
        keyId: keyPair.keyId,
      });

      expect(result.keys.length).toBe(1);
      expect(result.keys[0].keyId).toBe(keyPair.keyId);
    });

    it("returns empty list when no matches", async () => {
      const result = await listKeysCommand({
        signer: "Nonexistent Signer",
      });

      expect(result.keys.length).toBe(0);
    });

    it("includes comment field when present", async () => {
      const result = await listKeysCommand({
        signer: "Test Signer 3",
      });

      expect(result.keys[0].comment).toBe("Test comment");
    });

    it("formats key list for display", async () => {
      const result = await listKeysCommand({
        format: "table",
      });

      expect(result.formatted).toBeDefined();
      expect(result.formatted).toContain("Test Signer 1");
      expect(result.formatted).toContain("full");
      expect(result.formatted).toContain("marginal");
    });
  });

  describe("integration: add + list + trust + remove", () => {
    it("full workflow", async () => {
      const keyPair = testKeyPairs[0];
      const publicKeyPem = formatPublicKeyPem(keyPair.publicKey);

      // 1. Add key
      const addResult = await addKeyCommand({
        keyId: keyPair.keyId,
        publicKey: publicKeyPem,
        signer: keyPair.signer,
        trustLevel: "marginal",
      });
      expect(addResult.added).toBe(true);

      // 2. List and verify
      let listResult = await listKeysCommand({ keyId: keyPair.keyId });
      expect(listResult.keys.length).toBe(1);
      expect(listResult.keys[0].trustLevel).toBe("marginal");

      // 3. Update trust level
      const trustResult = await trustKeyCommand({
        keyId: keyPair.keyId,
        trustLevel: "full",
      });
      expect(trustResult.updated).toBe(true);
      expect(trustResult.newTrustLevel).toBe("full");

      // 4. Verify trust change
      listResult = await listKeysCommand({ keyId: keyPair.keyId });
      expect(listResult.keys[0].trustLevel).toBe("full");

      // 5. Remove key
      const removeResult = await removeKeyCommand({ keyId: keyPair.keyId });
      expect(removeResult.removed).toBe(true);

      // 6. Verify removal
      listResult = await listKeysCommand({ keyId: keyPair.keyId });
      expect(listResult.keys.length).toBe(0);
    });
  });
});
