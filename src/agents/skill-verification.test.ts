import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  verifySkillSignatureForInstall,
  getVerificationConfig,
  type VerificationConfig,
} from "./skill-verification.js";
import {
  formatPublicKeyPem,
  formatSignatureFile,
  generateKeyPair,
  signSkill,
} from "../security/skill-signing.js";
import { addTrustedKey, removeTrustedKey } from "../security/trusted-keyring.js";
import type { ClosedClawConfig } from "../config/config.js";

describe("skill-verification", () => {
  let testDir: string;
  let skillPath: string;
  let testKeyPair: { publicKey: string; privateKey: string; keyId: string };

  beforeAll(async () => {
    // Create temp directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-verification-test-"));
    skillPath = path.join(testDir, "SKILL.md");

    // Create test skill file
    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: test-skill",
        "description: Test skill for signature verification",
        "---",
        "",
        "# Test Skill",
        "",
        "This is a test skill.",
      ].join("\n"),
    );

    // Generate test key pair
    testKeyPair = await generateKeyPair("Test Signer");
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Remove test key from keyring
    try {
      await removeTrustedKey(testKeyPair.keyId);
    } catch {
      // Ignore if not present
    }
  });

  describe("getVerificationConfig", () => {
    it("returns default config when no config provided", () => {
      const config = getVerificationConfig();
      expect(config).toEqual({
        requireSignature: false,
        promptOnUnsigned: true,
        minTrustLevel: "marginal",
      });
    });

    it("extracts security config from ClosedClawConfig", () => {
      const testConfig: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
            promptOnUnsigned: false,
            minTrustLevel: "full",
          },
        },
      } as ClosedClawConfig;

      const config = getVerificationConfig(testConfig);
      expect(config).toEqual({
        requireSignature: true,
        promptOnUnsigned: false,
        minTrustLevel: "full",
      });
    });

    it("uses defaults for missing properties", () => {
      const testConfig: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
          },
        },
      } as ClosedClawConfig;

      const config = getVerificationConfig(testConfig);
      expect(config.requireSignature).toBe(true);
      expect(config.promptOnUnsigned).toBe(true);
      expect(config.minTrustLevel).toBe("marginal");
    });
  });

  describe("verifySkillSignatureForInstall - unsigned skills", () => {
    it("allows unsigned skills when signatures not required", async () => {
      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: false,
            promptOnUnsigned: false,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(true);
      expect(result.hasSignature).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.message).toContain("unsigned");
    });

    it("requires confirmation for unsigned skills when promptOnUnsigned=true", async () => {
      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: false,
            promptOnUnsigned: true,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.hasSignature).toBe(false);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.message).toContain("unsigned");
    });

    it("blocks unsigned skills when signatures required", async () => {
      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.hasSignature).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.message).toContain("Signature required");
    });
  });

  describe("verifySkillSignatureForInstall - signed skills", () => {
    beforeAll(async () => {
      // Sign the test skill
      const skillContent = await fs.readFile(skillPath, "utf-8");
      const signature = signSkill(skillContent, testKeyPair.privateKey, {
        name: "Test Signer",
        keyId: testKeyPair.keyId,
      });

      // Write signature file
      const sigPath = `${skillPath}.sig`;
      await fs.writeFile(sigPath, formatSignatureFile(signature));

      // Add key to trusted keyring
      const publicKeyPem = formatPublicKeyPem(testKeyPair.publicKey);
      await addTrustedKey(testKeyPair.keyId, {
        name: "Test Signer",
        publicKeyPem,
        trustLevel: "full",
        added: new Date().toISOString(),
        verifiedVia: "manual",
      });
    });

    it("allows signed skills with trusted key", async () => {
      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(true);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.keyId).toBe(testKeyPair.keyId);
      expect(result.signer).toBe("Test Signer");
      expect(result.trustLevel).toBe("full");
      expect(result.requiresConfirmation).toBe(false);
    });

    it("blocks signed skills when trust level insufficient", async () => {
      // Lower trust level
      await removeTrustedKey(testKeyPair.keyId);
      const publicKeyPem = formatPublicKeyPem(testKeyPair.publicKey);
      await addTrustedKey(testKeyPair.keyId, {
        name: "Test Signer",
        publicKeyPem,
        trustLevel: "marginal",
        added: new Date().toISOString(),
        verifiedVia: "manual",
      });

      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
            minTrustLevel: "full",
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureValid).toBe(false);
      expect(result.trustLevel).toBe("marginal");
      expect(result.message).toContain("trust level");
    });

    it("blocks signed skills with untrusted key", async () => {
      // Remove key from keyring
      await removeTrustedKey(testKeyPair.keyId);

      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureValid).toBe(false);
      expect(result.keyId).toBe(testKeyPair.keyId);
      expect(result.message).toContain("not found in trusted keyring");
    });

    it("blocks signed skills with invalid signature", async () => {
      // Re-add key to keyring
      const publicKeyPem = formatPublicKeyPem(testKeyPair.publicKey);
      await addTrustedKey({
        keyId: testKeyPair.keyId,
        publicKeyPem,
        signer: "Test Signer",
        trustLevel: "full",
      });

      // Modify skill content (invalidates signature)
      const skillContent = await fs.readFile(skillPath, "utf-8");
      await fs.writeFile(skillPath, skillContent + "\n\nModified content!");

      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureValid).toBe(false);
      expect(result.message).toContain("verification failed");
    });

    it("handles malformed signature files", async () => {
      // Write malformed signature
      const sigPath = `${skillPath}.sig`;
      await fs.writeFile(sigPath, "not a valid signature format");

      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureValid).toBe(false);
      expect(result.message).toContain("malformed");
    });
  });

  describe("trust level requirements", () => {
    it("accepts full trust when minTrustLevel=marginal", async () => {
      // Reset skill and signature
      const skillContent = await fs.readFile(skillPath, "utf-8");
      const signature = signSkill(skillContent, testKeyPair.privateKey, {
        name: "Test Signer",
        keyId: testKeyPair.keyId,
      });
      await fs.writeFile(`${skillPath}.sig`, formatSignatureFile(signature));

      // Set trust to full
      await removeTrustedKey(testKeyPair.keyId);
      const publicKeyPem = formatPublicKeyPem(testKeyPair.publicKey);
      await addTrustedKey(testKeyPair.keyId, {
        name: "Test Signer",
        publicKeyPem,
        trustLevel: "full",
        added: new Date().toISOString(),
        verifiedVia: "manual",
      });

      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
            minTrustLevel: "marginal",
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(true);
      expect(result.trustLevel).toBe("full");
    });

    it("accepts marginal trust when minTrustLevel=marginal", async () => {
      // Set trust to marginal
      await removeTrustedKey(testKeyPair.keyId);
      const publicKeyPem = formatPublicKeyPem(testKeyPair.publicKey);
      await addTrustedKey(testKeyPair.keyId, {
        name: "Test Signer",
        publicKeyPem,
        trustLevel: "marginal",
        added: new Date().toISOString(),
        verifiedVia: "manual",
      });

      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
            minTrustLevel: "marginal",
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(true);
      expect(result.trustLevel).toBe("marginal");
    });

    it("rejects marginal trust when minTrustLevel=full", async () => {
      const config: ClosedClawConfig = {
        skills: {
          security: {
            requireSignature: true,
            minTrustLevel: "full",
          },
        },
      } as ClosedClawConfig;

      const result = await verifySkillSignatureForInstall(skillPath, config);

      expect(result.allowed).toBe(false);
      expect(result.trustLevel).toBe("marginal");
      expect(result.message).toContain("does not meet minimum");
    });
  });
});
