/**
 * Tests for skill/plugin signing and verification.
 *
 * Tests cover:
 * - Key pair generation
 * - Skill signing and verification (happy path)
 * - Signature file format (serialize/parse round-trip)
 * - Tampered content detection
 * - Wrong key detection
 * - Edge cases (empty content, malformed signatures)
 */

import { describe, it, expect, _vi, beforeEach } from "vitest";
import {
  generateSigningKeyPair,
  signSkill,
  verifySkillSignature,
  formatSignatureFile,
  parseSignatureFile,
  fingerprintPublicKey,
  getSignatureFilePath,
  type SignerInfo,
  type SkillSignature,
} from "./skill-signing.js";

// ─── Key Generation ──────────────────────────────────────────────────────────

describe("generateSigningKeyPair", () => {
  it("generates valid Ed25519 key pair", () => {
    const pair = generateSigningKeyPair();
    expect(pair.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(pair.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(pair.keyId).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("generates unique key pairs", () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    expect(pair1.keyId).not.toBe(pair2.keyId);
    expect(pair1.privateKeyPem).not.toBe(pair2.privateKeyPem);
  });
});

// ─── Fingerprinting ──────────────────────────────────────────────────────────

describe("fingerprintPublicKey", () => {
  it("produces consistent fingerprint for same key", () => {
    const pair = generateSigningKeyPair();
    const fp1 = fingerprintPublicKey(pair.publicKeyPem);
    const fp2 = fingerprintPublicKey(pair.publicKeyPem);
    expect(fp1).toBe(fp2);
  });

  it("produces different fingerprints for different keys", () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    expect(fingerprintPublicKey(pair1.publicKeyPem)).not.toBe(
      fingerprintPublicKey(pair2.publicKeyPem),
    );
  });

  it("returns hex SHA-256 digest", () => {
    const pair = generateSigningKeyPair();
    const fp = fingerprintPublicKey(pair.publicKeyPem);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });
});

// ─── Sign + Verify ───────────────────────────────────────────────────────────

describe("signSkill + verifySkillSignature", () => {
  const sampleSkill = `# My Skill

This is a sample skill for testing.

## Instructions
Do something useful.
`;

  let signerInfo: SignerInfo;
  let keyPair: ReturnType<typeof generateSigningKeyPair>;

  beforeEach(() => {
    keyPair = generateSigningKeyPair();
    signerInfo = { name: "alice@closedclaw.dev", keyId: keyPair.keyId };
  });

  it("signs and verifies valid skill content", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    const result = verifySkillSignature(sampleSkill, signature, keyPair.publicKeyPem);

    expect(result.valid).toBe(true);
    expect(result.signer).toBe("alice@closedclaw.dev");
    expect(result.keyId).toBe(keyPair.keyId);
    expect(result.error).toBeUndefined();
  });

  it("detects tampered content", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    const tampered = sampleSkill + "\n# Malicious addition";
    const result = verifySkillSignature(tampered, signature, keyPair.publicKeyPem);

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("detects wrong public key", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    const otherKeyPair = generateSigningKeyPair();
    const result = verifySkillSignature(sampleSkill, signature, otherKeyPair.publicKeyPem);

    expect(result.valid).toBe(false);
  });

  it("returns signature metadata", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    expect(signature.algorithm).toBe("ed25519");
    expect(signature.signer).toBe("alice@closedclaw.dev");
    expect(signature.keyId).toBe(keyPair.keyId);
    expect(signature.timestamp).toBeDefined();
    expect(signature.signatureBase64).toBeTruthy();
  });

  it("signs empty content", () => {
    const signature = signSkill("", keyPair.privateKeyPem, signerInfo);
    const result = verifySkillSignature("", signature, keyPair.publicKeyPem);
    expect(result.valid).toBe(true);
  });

  it("handles unicode content", () => {
    const unicode = "# 技能说明\n\n这是一个测试技能。🦀";
    const signature = signSkill(unicode, keyPair.privateKeyPem, signerInfo);
    const result = verifySkillSignature(unicode, signature, keyPair.publicKeyPem);
    expect(result.valid).toBe(true);
  });

  it("handles large content", () => {
    const large = "x".repeat(1_000_000);
    const signature = signSkill(large, keyPair.privateKeyPem, signerInfo);
    const result = verifySkillSignature(large, signature, keyPair.publicKeyPem);
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported algorithm", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    const badSig: SkillSignature = { ...signature, algorithm: "rsa-sha256" as "ed25519" };
    const result = verifySkillSignature(sampleSkill, badSig, keyPair.publicKeyPem);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported algorithm");
  });

  it("handles corrupt base64 signature gracefully", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    const badSig: SkillSignature = { ...signature, signatureBase64: "not-valid-base64!!!" };
    const result = verifySkillSignature(sampleSkill, badSig, keyPair.publicKeyPem);

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles invalid PEM public key gracefully", () => {
    const signature = signSkill(sampleSkill, keyPair.privateKeyPem, signerInfo);
    const result = verifySkillSignature(sampleSkill, signature, "not-a-pem-key");

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── Signature File Format ───────────────────────────────────────────────────

describe("signature file format", () => {
  let keyPair: ReturnType<typeof generateSigningKeyPair>;
  let sampleSignature: SkillSignature;

  beforeEach(() => {
    keyPair = generateSigningKeyPair();
    sampleSignature = signSkill("test content", keyPair.privateKeyPem, {
      name: "bob@example.com",
      keyId: keyPair.keyId,
    });
  });

  describe("formatSignatureFile", () => {
    it("produces valid PEM-like format", () => {
      const output = formatSignatureFile(sampleSignature);
      expect(output).toContain("-----BEGIN CLOSEDCLAW SKILL SIGNATURE-----");
      expect(output).toContain("-----END CLOSEDCLAW SKILL SIGNATURE-----");
      expect(output).toContain("Algorithm: ed25519");
      expect(output).toContain(`Signer: bob@example.com`);
      expect(output).toContain(`Key-ID: ${keyPair.keyId}`);
      expect(output).toContain(`Timestamp: ${sampleSignature.timestamp}`);
      expect(output).toContain(sampleSignature.signatureBase64);
    });
  });

  describe("parseSignatureFile", () => {
    it("round-trips through format/parse", () => {
      const formatted = formatSignatureFile(sampleSignature);
      const parsed = parseSignatureFile(formatted);

      expect(parsed).not.toBeNull();
      expect(parsed!.algorithm).toBe("ed25519");
      expect(parsed!.signer).toBe("bob@example.com");
      expect(parsed!.keyId).toBe(keyPair.keyId);
      expect(parsed!.timestamp).toBe(sampleSignature.timestamp);
      expect(parsed!.signatureBase64).toBe(sampleSignature.signatureBase64);
    });

    it("verifies after round-trip", () => {
      const formatted = formatSignatureFile(sampleSignature);
      const parsed = parseSignatureFile(formatted);
      const result = verifySkillSignature("test content", parsed!, keyPair.publicKeyPem);
      expect(result.valid).toBe(true);
    });

    it("returns null for empty input", () => {
      expect(parseSignatureFile("")).toBeNull();
    });

    it("returns null for missing BEGIN marker", () => {
      const bad = `Algorithm: ed25519\nSigner: test\nKey-ID: abc\n\nsig==\n-----END CLOSEDCLAW SKILL SIGNATURE-----`;
      expect(parseSignatureFile(bad)).toBeNull();
    });

    it("returns null for missing END marker", () => {
      const bad = `-----BEGIN CLOSEDCLAW SKILL SIGNATURE-----\nAlgorithm: ed25519\nSigner: test\nKey-ID: abc\n\nsig==`;
      expect(parseSignatureFile(bad)).toBeNull();
    });

    it("returns null for missing required headers", () => {
      const bad = [
        "-----BEGIN CLOSEDCLAW SKILL SIGNATURE-----",
        "Algorithm: ed25519",
        // Missing Signer and Key-ID
        "",
        "sig==",
        "-----END CLOSEDCLAW SKILL SIGNATURE-----",
      ].join("\n");
      expect(parseSignatureFile(bad)).toBeNull();
    });

    it("returns null for unsupported algorithm", () => {
      const bad = [
        "-----BEGIN CLOSEDCLAW SKILL SIGNATURE-----",
        "Algorithm: rsa-sha256",
        "Signer: test",
        "Key-ID: abc",
        "",
        "sig==",
        "-----END CLOSEDCLAW SKILL SIGNATURE-----",
      ].join("\n");
      expect(parseSignatureFile(bad)).toBeNull();
    });

    it("handles extra whitespace in input", () => {
      const formatted = formatSignatureFile(sampleSignature);
      const withSpaces = formatted
        .split("\n")
        .map((l) => `  ${l}  `)
        .join("\n");
      const parsed = parseSignatureFile(withSpaces);
      expect(parsed).not.toBeNull();
      expect(parsed!.signer).toBe("bob@example.com");
    });
  });
});

// ─── End-to-End Workflow ─────────────────────────────────────────────────────

describe("end-to-end signing workflow", () => {
  it("complete sign → format → parse → verify workflow", () => {
    const keyPair = generateSigningKeyPair();
    const skillContent = "# My Skill\n\nDo the thing.\n";

    // Sign
    const signature = signSkill(skillContent, keyPair.privateKeyPem, {
      name: "test@closedclaw.dev",
      keyId: keyPair.keyId,
    });

    // Format to .sig file
    const sigFile = formatSignatureFile(signature);

    // Parse back from .sig file
    const parsed = parseSignatureFile(sigFile);
    expect(parsed).not.toBeNull();

    // Verify
    const result = verifySkillSignature(skillContent, parsed!, keyPair.publicKeyPem);
    expect(result.valid).toBe(true);
    expect(result.signer).toBe("test@closedclaw.dev");
  });

  it("detects tampering after format/parse", () => {
    const keyPair = generateSigningKeyPair();
    const skillContent = "# Original Skill\n";

    const signature = signSkill(skillContent, keyPair.privateKeyPem, {
      name: "test",
      keyId: keyPair.keyId,
    });

    const sigFile = formatSignatureFile(signature);
    const parsed = parseSignatureFile(sigFile);

    // Verify against tampered content
    const result = verifySkillSignature("# Tampered Skill\n", parsed!, keyPair.publicKeyPem);
    expect(result.valid).toBe(false);
  });
});

// ─── Utility ─────────────────────────────────────────────────────────────────

describe("getSignatureFilePath", () => {
  it("appends .sig to skill path", () => {
    expect(getSignatureFilePath("/path/to/skill.md")).toBe("/path/to/skill.md.sig");
  });

  it("handles relative paths", () => {
    expect(getSignatureFilePath("./skills/web-search.md")).toBe("./skills/web-search.md.sig");
  });

  it("handles paths without extension", () => {
    expect(getSignatureFilePath("my-skill")).toBe("my-skill.sig");
  });
});
