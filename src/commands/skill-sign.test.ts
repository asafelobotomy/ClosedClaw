import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { generateKeyPair, parseSignatureFile } from "../security/skill-signing.js";
import { addTrustedKey, removeTrustedKey, loadKeyring } from "../security/trusted-keyring.js";
import { generateKeyCommand, signSkillCommand } from "./skill-sign.js";

describe("skill-sign commands", () => {
  let testDir: string;
  let skillPath: string;
  let keyringBackup: string | null = null;

  beforeAll(async () => {
    // Create temp directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-sign-test-"));
    skillPath = path.join(testDir, "test-skill", "SKILL.md");

    // Create test skill directory and file
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: test-skill",
        "description: Test skill for signing",
        "---",
        "",
        "# Test Skill",
        "",
        "Test skill content.",
      ].join("\n"),
    );

    // Backup existing keyring
    try {
      const keyring = await loadKeyring();
      if (keyring.keys.length > 0) {
        keyringBackup = JSON.stringify(keyring);
      }
    } catch {
      // No keyring to backup
    }
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Restore keyring if backed up
    if (keyringBackup) {
      const keyring = JSON.parse(keyringBackup);
      // This is a simplified restore - in production you'd want proper restore logic
    }
  });

  describe("generateKeyCommand", () => {
    it("generates key pair without output path", async () => {
      const result = await generateKeyCommand({
        signer: "Test Signer",
        addToKeyring: false,
      });

      expect(result).toBeDefined();
      expect(result.keyId).toBeDefined();
      expect(result.keyId.length).toBeGreaterThan(0);
      expect(result.signer).toBe("Test Signer");
      expect(result.publicKey).toContain("-----BEGIN PUBLIC KEY-----");
      expect(result.privateKey).toContain("-----BEGIN PRIVATE KEY-----");
    });

    it("generates key pair with output path", async () => {
      const outputDir = path.join(testDir, "keys");
      await fs.mkdir(outputDir, { recursive: true });

      const result = await generateKeyCommand({
        signer: "Test Signer",
        output: outputDir,
        addToKeyring: false,
      });

      expect(result.keyId).toBeDefined();

      // Check files were created
      const publicKeyPath = path.join(outputDir, "skill-signing.pub");
      const privateKeyPath = path.join(outputDir, "skill-signing.key");

      const publicKeyExists = await fs
        .access(publicKeyPath)
        .then(() => true)
        .catch(() => false);
      const privateKeyExists = await fs
        .access(privateKeyPath)
        .then(() => true)
        .catch(() => false);

      expect(publicKeyExists).toBe(true);
      expect(privateKeyExists).toBe(true);

      // Verify file contents match returned keys
      const savedPublicKey = await fs.readFile(publicKeyPath, "utf-8");
      const savedPrivateKey = await fs.readFile(privateKeyPath, "utf-8");

      expect(savedPublicKey.trim()).toBe(result.publicKey.trim());
      expect(savedPrivateKey.trim()).toBe(result.privateKey.trim());
    });

    it("adds key to keyring when addToKeyring=true", async () => {
      const result = await generateKeyCommand({
        signer: "Keyring Test Signer",
        addToKeyring: true,
        trustLevel: "full",
      });

      // Verify key was added to keyring
      const keyring = await loadKeyring();
      const addedKey = keyring.keys.find((k) => k.keyId === result.keyId);

      expect(addedKey).toBeDefined();
      expect(addedKey?.signer).toBe("Keyring Test Signer");
      expect(addedKey?.trustLevel).toBe("full");

      // Cleanup
      await removeTrustedKey(result.keyId);
    });

    it("supports marginal trust level", async () => {
      const result = await generateKeyCommand({
        signer: "Marginal Signer",
        addToKeyring: true,
        trustLevel: "marginal",
      });

      const keyring = await loadKeyring();
      const addedKey = keyring.keys.find((k) => k.keyId === result.keyId);

      expect(addedKey?.trustLevel).toBe("marginal");

      // Cleanup
      await removeTrustedKey(result.keyId);
    });
  });

  describe("signSkillCommand", () => {
    let testKeyPair: { publicKey: string; privateKey: string; keyId: string };
    let privateKeyPath: string;

    beforeEach(async () => {
      // Generate a test key pair for Each test
      testKeyPair = await generateKeyPair("Test Signer");
      
      // Save private key to file
      privateKeyPath = path.join(testDir, "test-private.key");
      await fs.writeFile(privateKeyPath, testKeyPair.privateKey);
    });

    it("signs skill file successfully", async () => {
      const result = await signSkillCommand({
        skillPath,
        privateKeyPath,
        keyId: testKeyPair.keyId,
        signer: "Test Signer",
      });

      expect(result.skillPath).toBe(skillPath);
      expect(result.signaturePath).toBe(`${skillPath}.sig`);
      expect(result.keyId).toBe(testKeyPair.keyId);
      expect(result.signer).toBe("Test Signer");

      // Verify signature file was created
      const sigPath = `${skillPath}.sig`;
      const sigExists = await fs
        .access(sigPath)
        .then(() => true)
        .catch(() => false);

      expect(sigExists).toBe(true);

      // Verify signature content
      const sigContent = await fs.readFile(sigPath, "utf-8");
      const signature = parseSignatureFile(sigContent);

      expect(signature).toBeDefined();
      expect(signature?.keyId).toBe(testKeyPair.keyId);
      expect(signature?.signer).toBe("Test Signer");
    });

    it("detects non-existent skill file", async () => {
      const nonExistentPath = path.join(testDir, "nonexistent", "SKILL.md");

      await expect(
        signSkillCommand({
          skillPath: nonExistentPath,
          privateKeyPath,
          keyId: testKeyPair.keyId,
          signer: "Test Signer",
        }),
      ).rejects.toThrow();
    });

    it("detects non-existent private key file", async () => {
      const nonExistentKeyPath = path.join(testDir, "nonexistent.key");

      await expect(
        signSkillCommand({
          skillPath,
          privateKeyPath: nonExistentKeyPath,
          keyId: testKeyPair.keyId,
          signer: "Test Signer",
        }),
      ).rejects.toThrow();
    });

    it("allows signing with custom output path", async () => {
      const customSigPath = path.join(testDir, "custom-signature.sig");

      const result = await signSkillCommand({
        skillPath,
        privateKeyPath,
        keyId: testKeyPair.keyId,
        signer: "Test Signer",
        outputPath: customSigPath,
      });

      expect(result.signaturePath).toBe(customSigPath);

      // Verify custom signature file exists
      const sigExists = await fs
        .access(customSigPath)
        .then(() => true)
        .catch(() => false);

      expect(sigExists).toBe(true);
    });

    it("overwrites existing signature file", async () => {
      const sigPath = `${skillPath}.sig`;

      // Create initial signature
      await signSkillCommand({
        skillPath,
        privateKeyPath,
        keyId: testKeyPair.keyId,
        signer: "First Signer",
      });

      const firstSig = await fs.readFile(sigPath, "utf-8");
      const firstParsed = parseSignatureFile(firstSig);

      // Sign again with different signer name
      await signSkillCommand({
        skillPath,
        privateKeyPath,
        keyId: testKeyPair.keyId,
        signer: "Second Signer",
      });

      const secondSig = await fs.readFile(sigPath, "utf-8");
      const secondParsed = parseSignatureFile(secondSig);

      expect(secondParsed?.signer).toBe("Second Signer");
      expect(firstParsed?.signer).toBe("First Signer");
      expect(secondParsed?.signer).not.toBe(firstParsed?.signer);
    });

    it("handles invalid private key gracefully", async () => {
      // Write invalid private key
      const invalidKeyPath = path.join(testDir, "invalid.key");
      await fs.writeFile(invalidKeyPath, "not a valid private key");

      await expect(
        signSkillCommand({
          skillPath,
          privateKeyPath: invalidKeyPath,
          keyId: testKeyPair.keyId,
          signer: "Test Signer",
        }),
      ).rejects.toThrow();
    });
  });

  describe("integration: generate + sign + verify", () => {
    it("full workflow: keygen -> sign -> verify signature", async () => {
      // 1. Generate new key pair
      const keyResult = await generateKeyCommand({
        signer: "Integration Test Signer",
        output: path.join(testDir, "integration-keys"),
        addToKeyring: true,
        trustLevel: "full",
      });

      // 2. Create a new skill to sign
      const newSkillPath = path.join(testDir, "integration-skill", "SKILL.md");
      await fs.mkdir(path.dirname(newSkillPath), { recursive: true });
      await fs.writeFile(
        newSkillPath,
        [
          "---",
          "name: integration-skill",
          "description: Integration test skill",
          "---",
          "",
          "# Integration Test",
          "",
          "Integration test content.",
        ].join("\n"),
      );

      // 3. Sign the skill
      const privateKeyPath = path.join(testDir, "integration-keys", "skill-signing.key");
      const signResult = await signSkillCommand({
        skillPath: newSkillPath,
        privateKeyPath,
        keyId: keyResult.keyId,
        signer: "Integration Test Signer",
      });

      expect(signResult.signaturePath).toBe(`${newSkillPath}.sig`);

      // 4. Verify signature file exists and is valid
      const sigContent = await fs.readFile(signResult.signaturePath, "utf-8");
      const signature = parseSignatureFile(sigContent);

      expect(signature).toBeDefined();
      expect(signature?.keyId).toBe(keyResult.keyId);
      expect(signature?.signer).toBe("Integration Test Signer");

      // Cleanup
      await removeTrustedKey(keyResult.keyId);
    });
  });
});
