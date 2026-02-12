import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { generateKeyPair, parseSignatureFile } from "../security/skill-signing.js";
import { removeTrustedKey, getTrustedKey } from "../security/trusted-keyring.js";
import { generateKeyCommand, signSkillCommand } from "./skill-sign.js";
import type { RuntimeEnv } from "../runtime.js";

describe("skill-sign commands", () => {
  let testDir: string;
  let skillPath: string;
  let runtime: RuntimeEnv;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

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
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    runtime = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn() as unknown as RuntimeEnv["exit"],
    };

    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as typeof process.exit);
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  describe("generateKeyCommand", () => {
    it("generates key pair with JSON output", async () => {
      const outputDir = path.join(testDir, "keys-json");

      await generateKeyCommand(runtime, {
        signerName: "Test Signer",
        output: outputDir,
        addToKeyring: false,
        json: true,
      });

      expect(runtime.log).toHaveBeenCalled();
      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);

      expect(result.keyId).toBeDefined();
      expect(result.keyId.length).toBeGreaterThan(0);
      expect(result.addedToKeyring).toBe(false);
      expect(result.privateKeyPath).toBeDefined();
      expect(result.publicKeyPath).toBeDefined();
    });

    it("generates key pair with output path and writes files", async () => {
      const outputDir = path.join(testDir, "keys-files");
      await fs.mkdir(outputDir, { recursive: true });

      await generateKeyCommand(runtime, {
        signerName: "Test Signer",
        output: outputDir,
        addToKeyring: false,
        json: true,
      });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      JSON.parse(logCall);

      // Check files were created - filename includes keyId prefix
      const files = await fs.readdir(outputDir);
      const pubFile = files.find((f) => f.endsWith(".pub"));
      const pemFile = files.find((f) => f.endsWith(".pem") && !f.endsWith(".pub"));

      expect(pubFile).toBeDefined();
      expect(pemFile).toBeDefined();

      // Verify file contents are valid PEM
      const publicKeyContent = await fs.readFile(path.join(outputDir, pubFile!), "utf-8");
      const privateKeyContent = await fs.readFile(path.join(outputDir, pemFile!), "utf-8");

      expect(publicKeyContent).toContain("-----BEGIN PUBLIC KEY-----");
      expect(privateKeyContent).toContain("-----BEGIN PRIVATE KEY-----");
    });

    it("adds key to keyring when addToKeyring=true", async () => {
      const outputDir = path.join(testDir, "keys-keyring");

      await generateKeyCommand(runtime, {
        signerName: "Keyring Test Signer",
        output: outputDir,
        addToKeyring: true,
        json: true,
      });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);
      expect(result.addedToKeyring).toBe(true);

      // Verify key was added to keyring
      const addedKey = await getTrustedKey(result.keyId);

      expect(addedKey).toBeDefined();
      expect(addedKey?.name).toBe("Keyring Test Signer");
      expect(addedKey?.trustLevel).toBe("full");

      // Cleanup
      await removeTrustedKey(result.keyId);
    });

    it("uses formatted display output when json=false", async () => {
      const outputDir = path.join(testDir, "keys-display");

      await generateKeyCommand(runtime, {
        signerName: "Display Signer",
        output: outputDir,
        addToKeyring: false,
      });

      // Should produce multiple log calls for formatted output
      expect(vi.mocked(runtime.log).mock.calls.length).toBeGreaterThan(1);

      const allOutput = vi.mocked(runtime.log).mock.calls.map((c) => String(c[0])).join("\n");
      expect(allOutput).toContain("Key ID:");
    });
  });

  describe("signSkillCommand", () => {
    let testKeyPair: { publicKey: string; privateKey: string; keyId: string };
    let privateKeyPath: string;
    let publicKeyPath: string;

    beforeEach(async () => {
      // Generate a test key pair for each test
      testKeyPair = await generateKeyPair("Test Signer");

      // Save private key (.pem) and public key (.pub) to files
      // signSkillCommand expects .pem extension and derives .pub from it
      privateKeyPath = path.join(testDir, "test-signing.pem");
      publicKeyPath = path.join(testDir, "test-signing.pub");
      await fs.writeFile(privateKeyPath, testKeyPair.privateKey);
      await fs.writeFile(publicKeyPath, testKeyPair.publicKey);
    });

    it("signs skill file successfully", async () => {
      await signSkillCommand(runtime, skillPath, {
        keyPath: privateKeyPath,
        signerName: "Test Signer",
        json: true,
      });

      expect(runtime.log).toHaveBeenCalled();
      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);

      expect(result.skillPath).toBeDefined();
      expect(result.signaturePath).toBeDefined();
      expect(result.keyId).toBe(testKeyPair.keyId);
      expect(result.signer).toBe("Test Signer");

      // Verify signature file was created
      const sigPath = skillPath + ".sig";
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

    it("signs with generateKey (ephemeral key)", async () => {
      await signSkillCommand(runtime, skillPath, {
        generateKey: true,
        signerName: "Ephemeral Signer",
        json: true,
      });

      expect(runtime.log).toHaveBeenCalled();
      // Find the JSON output (last log call, after ephemeral warning)
      const allCalls = vi.mocked(runtime.log).mock.calls;
      const jsonCall = allCalls[allCalls.length - 1][0] as string;
      const result = JSON.parse(jsonCall);

      expect(result.keyId).toBeDefined();
      expect(result.signer).toBe("Ephemeral Signer");
    });

    it("exits with error for non-existent key path", async () => {
      const nonExistentKeyPath = path.join(testDir, "nonexistent.pem");

      await expect(
        signSkillCommand(runtime, skillPath, {
          keyPath: nonExistentKeyPath,
          signerName: "Test Signer",
        }),
      ).rejects.toThrow("process.exit called");

      expect(runtime.error).toHaveBeenCalledWith(
        expect.stringContaining("Key not found"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("allows signing with custom output path", async () => {
      const customSigPath = path.join(testDir, "custom-signature.sig");

      await signSkillCommand(runtime, skillPath, {
        keyPath: privateKeyPath,
        signerName: "Test Signer",
        output: customSigPath,
        json: true,
      });

      const logCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const result = JSON.parse(logCall);
      expect(result.signaturePath).toBeDefined();

      // Verify custom signature file exists
      const sigExists = await fs
        .access(customSigPath)
        .then(() => true)
        .catch(() => false);
      expect(sigExists).toBe(true);
    });

    it("overwrites existing signature file", async () => {
      // Create initial signature
      await signSkillCommand(runtime, skillPath, {
        keyPath: privateKeyPath,
        signerName: "First Signer",
      });

      const sigPath = skillPath + ".sig";
      const firstSig = await fs.readFile(sigPath, "utf-8");
      const firstParsed = parseSignatureFile(firstSig);

      vi.mocked(runtime.log).mockClear();

      // Sign again with different signer name
      await signSkillCommand(runtime, skillPath, {
        keyPath: privateKeyPath,
        signerName: "Second Signer",
      });

      const secondSig = await fs.readFile(sigPath, "utf-8");
      const secondParsed = parseSignatureFile(secondSig);

      expect(secondParsed?.signer).toBe("Second Signer");
      expect(firstParsed?.signer).toBe("First Signer");
      expect(secondParsed?.signer).not.toBe(firstParsed?.signer);
    });
  });

  describe("integration: generate + sign + verify", () => {
    it("full workflow: keygen -> sign -> verify signature", async () => {
      // 1. Generate new key pair
      const keyOutputDir = path.join(testDir, "integration-keys");

      await generateKeyCommand(runtime, {
        signerName: "Integration Test Signer",
        output: keyOutputDir,
        addToKeyring: true,
        json: true,
      });

      const keyLogCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const keyResult = JSON.parse(keyLogCall);
      expect(keyResult.keyId).toBeDefined();
      expect(keyResult.addedToKeyring).toBe(true);

      vi.mocked(runtime.log).mockClear();

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

      // 3. Sign the skill using the generated key directory
      await signSkillCommand(runtime, newSkillPath, {
        keyPath: keyOutputDir,
        signerName: "Integration Test Signer",
        json: true,
      });

      const signLogCall = vi.mocked(runtime.log).mock.calls[0][0] as string;
      const signResult = JSON.parse(signLogCall);

      expect(signResult.keyId).toBe(keyResult.keyId);
      expect(signResult.signer).toBe("Integration Test Signer");

      // 4. Verify signature file exists and is valid
      const sigPath = newSkillPath + ".sig";
      const sigContent = await fs.readFile(sigPath, "utf-8");
      const signature = parseSignatureFile(sigContent);

      expect(signature).toBeDefined();
      expect(signature?.keyId).toBe(keyResult.keyId);
      expect(signature?.signer).toBe("Integration Test Signer");

      // Cleanup
      await removeTrustedKey(keyResult.keyId);
    });
  });
});
