/**
 * Skill/Plugin Signing & Verification
 *
 * Provides cryptographic signing for ClosedClaw skills using Ed25519.
 * Skills can be signed by developers and verified before installation
 * to prevent supply chain attacks.
 *
 * **Signature format**: PEM-like block with metadata header
 * **Algorithm**: Ed25519 (RFC 8032) — fast, deterministic, small signatures
 * **Key format**: PKCS#8 PEM (private), SPKI PEM (public)
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8032 RFC 8032 - Edwards-Curve Digital Signature Algorithm}
 * @module security/skill-signing
 */

import crypto from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Information about the entity signing a skill. */
export interface SignerInfo {
  /** Signer identifier (e.g., email or handle). */
  name: string;
  /** Hex-encoded key ID derived from public key fingerprint. */
  keyId: string;
}

/** Parsed representation of a skill signature. */
export interface SkillSignature {
  /** Signing algorithm (always "ed25519"). */
  algorithm: "ed25519";
  /** Signer display name. */
  signer: string;
  /** Key ID for lookup in trusted keyring. */
  keyId: string;
  /** ISO 8601 timestamp of signing. */
  timestamp: string;
  /** Base64-encoded Ed25519 signature over the skill content. */
  signatureBase64: string;
}

/** Result of signature verification. */
export interface VerificationResult {
  /** Whether the signature is cryptographically valid. */
  valid: boolean;
  /** Signer name from the signature (if parseable). */
  signer?: string;
  /** Key ID from the signature (if parseable). */
  keyId?: string;
  /** Timestamp from the signature (if parseable). */
  timestamp?: string;
  /** Human-readable error message on failure. */
  error?: string;
}

/** An Ed25519 key pair for skill signing. */
export interface SigningKeyPair {
  /** PEM-encoded public key (SPKI format). */
  publicKeyPem: string;
  /** PEM-encoded private key (PKCS#8 format). */
  privateKeyPem: string;
  /** Hex-encoded SHA-256 fingerprint of the public key. */
  keyId: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SIGNATURE_BEGIN = "-----BEGIN CLOSEDCLAW SKILL SIGNATURE-----";
const SIGNATURE_END = "-----END CLOSEDCLAW SKILL SIGNATURE-----";

/** Ed25519 SPKI DER prefix (12 bytes) for raw key extraction. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 key pair for skill signing.
 *
 * @returns A key pair with PEM-encoded keys and a hex key ID.
 */
export function generateSigningKeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const keyId = fingerprintPublicKey(publicKeyPem);

  return { publicKeyPem, privateKeyPem, keyId };
}

/**
 * Backwards-compatible wrapper for tests and CLI helpers.
 */
export async function generateKeyPair(signerName: string): Promise<{
  publicKey: string;
  privateKey: string;
  keyId: string;
  signer: string;
}> {
  const { publicKeyPem, privateKeyPem, keyId } = generateSigningKeyPair();
  return {
    publicKey: publicKeyPem,
    privateKey: privateKeyPem,
    keyId,
    signer: signerName,
  };
}

/**
 * Ensure a public key is PEM-encoded.
 */
export function formatPublicKeyPem(publicKey: string): string {
  const trimmed = publicKey.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed + "\n";
  }
  return ["-----BEGIN PUBLIC KEY-----", trimmed, "-----END PUBLIC KEY-----", ""].join("\n");
}

/**
 * Derive a hex key ID (SHA-256 fingerprint) from a PEM public key.
 *
 * @param publicKeyPem - PEM-encoded SPKI public key.
 * @returns Hex-encoded SHA-256 digest of the raw key bytes.
 */
export function fingerprintPublicKey(publicKeyPem: string): string {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" }) as Buffer;

  // Extract raw 32-byte key from SPKI container
  const raw =
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
      ? spki.subarray(ED25519_SPKI_PREFIX.length)
      : spki;

  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign skill content with an Ed25519 private key.
 *
 * @param skillContent - The full text content of the skill file.
 * @param privateKeyPem - PEM-encoded PKCS#8 private key.
 * @param signerInfo - Metadata about the signer.
 * @returns A structured signature object.
 */
export function signSkill(
  skillContent: string,
  privateKeyPem: string,
  signerInfo: SignerInfo,
): SkillSignature;
export function signSkill(
  skillContent: string,
  privateKeyPem: string,
  keyId: string,
  signerName: string,
): SkillSignature;
export function signSkill(
  skillContent: string,
  privateKeyPem: string,
  signerOrKeyId: SignerInfo | string,
  signerName?: string,
): SkillSignature {
  const signerInfo: SignerInfo =
    typeof signerOrKeyId === "string"
      ? { name: signerName ?? "Unknown Signer", keyId: signerOrKeyId }
      : signerOrKeyId;
  const key = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(skillContent, "utf-8"), key);

  return {
    algorithm: "ed25519",
    signer: signerInfo.name,
    keyId: signerInfo.keyId,
    timestamp: new Date().toISOString(),
    signatureBase64: signature.toString("base64"),
  };
}

// ─── Verification ────────────────────────────────────────────────────────────

/**
 * Verify a skill signature against the skill content and a public key.
 *
 * @param skillContent - The original skill file content that was signed.
 * @param signature - The parsed skill signature to verify.
 * @param publicKeyPem - PEM-encoded SPKI public key of the expected signer.
 * @returns Verification result with validity flag and error details.
 */
export function verifySkillSignature(
  skillContent: string,
  signature: SkillSignature,
  publicKeyPem: string,
): VerificationResult {
  try {
    if (signature.algorithm !== "ed25519") {
      return {
        valid: false,
        signer: signature.signer,
        keyId: signature.keyId,
        error: "Unsupported algorithm",
      };
    }

    const key = crypto.createPublicKey(publicKeyPem);
    const sigBytes = Buffer.from(signature.signatureBase64, "base64");
    const contentBytes = Buffer.from(skillContent, "utf-8");

    const valid = crypto.verify(null, contentBytes, key, sigBytes);

    return {
      valid,
      signer: signature.signer,
      keyId: signature.keyId,
      timestamp: signature.timestamp,
      error: valid ? undefined : "Signature does not match content",
    };
  } catch (error) {
    return {
      valid: false,
      signer: signature.signer,
      keyId: signature.keyId,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Signature File Format ───────────────────────────────────────────────────

/**
 * Format a skill signature into the PEM-like `.sig` file format.
 *
 * @example
 * ```
 * -----BEGIN CLOSEDCLAW SKILL SIGNATURE-----
 * Algorithm: ed25519
 * Signer: alice@closedclaw.dev
 * Key-ID: a3f8b9...
 * Timestamp: 2026-02-09T12:00:00.000Z
 *
 * [base64-encoded signature]
 * -----END CLOSEDCLAW SKILL SIGNATURE-----
 * ```
 */
export function formatSignatureFile(signature: SkillSignature): string {
  const lines = [
    SIGNATURE_BEGIN,
    `Algorithm: ${signature.algorithm}`,
    `Signer: ${signature.signer}`,
    `Key-ID: ${signature.keyId}`,
    `Timestamp: ${signature.timestamp}`,
    "",
    signature.signatureBase64,
    SIGNATURE_END,
    "", // trailing newline
  ];
  return lines.join("\n");
}

/**
 * Parse a `.sig` file into a structured SkillSignature.
 *
 * @param sigContent - The raw text content of the `.sig` file.
 * @returns The parsed signature, or null if the format is invalid.
 */
export function parseSignatureFile(sigContent: string): SkillSignature | null {
  try {
    const lines = sigContent
      .trim()
      .split("\n")
      .map((l) => l.trim());

    // Validate envelope
    const beginIdx = lines.indexOf(SIGNATURE_BEGIN);
    const endIdx = lines.indexOf(SIGNATURE_END);
    if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
      return null;
    }

    const headerAndBody = lines.slice(beginIdx + 1, endIdx);

    // Parse headers (key: value lines)
    const headers: Record<string, string> = {};
    let bodyStartIdx = 0;

    for (let i = 0; i < headerAndBody.length; i++) {
      const line = headerAndBody[i];
      if (line === "") {
        // Empty line separates headers from body
        bodyStartIdx = i + 1;
        break;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) {
        bodyStartIdx = i;
        break;
      }
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      headers[key] = value;
    }

    // Extract body (base64 signature)
    const bodyLines = headerAndBody.slice(bodyStartIdx).filter((l) => l.length > 0);
    const signatureBase64 = bodyLines.join("");

    // Validate required fields
    const algorithm = headers["algorithm"];
    const signer = headers["signer"];
    const keyId = headers["key-id"];
    const timestamp = headers["timestamp"];

    if (!algorithm || !signer || !keyId || !signatureBase64) {
      return null;
    }

    if (algorithm !== "ed25519") {
      return null;
    }

    return {
      algorithm: "ed25519",
      signer,
      keyId,
      timestamp: timestamp || new Date().toISOString(),
      signatureBase64,
    };
  } catch {
    return null;
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Check if a skill file has an accompanying signature file.
 * The convention is `<skillPath>.sig`.
 *
 * @param skillPath - Path to the skill file.
 * @returns The expected signature file path.
 */
export function getSignatureFilePath(skillPath: string): string {
  return `${skillPath}.sig`;
}
