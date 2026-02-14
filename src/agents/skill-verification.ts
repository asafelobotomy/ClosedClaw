/**
 * Skill signature verification for installation security.
 *
 * Validates skill signatures against trusted keyring before installation.
 */

import * as fs from "node:fs/promises";
import type { ClosedClawConfig } from "../config/config.js";
import {
  parseSignatureFile,
  verifySkillSignature,
  getSignatureFilePath,
} from "../security/skill-signing.js";
import { getTrustedKey, type TrustLevel } from "../security/trusted-keyring.js";

export type VerificationConfig = {
  /** Require cryptographic signatures for installation. */
  requireSignature: boolean;
  /** Prompt user when installing unsigned skills (if requireSignature=false). */
  promptOnUnsigned: boolean;
  /** Minimum trust level required for signatures. */
  minTrustLevel: "full" | "marginal";
};

export type VerificationResult = {
  /** Whether the skill signature is valid and meets requirements. */
  allowed: boolean;
  /** Whether a signature was found. */
  hasSignature: boolean;
  /** Whether the signature is cryptographically valid. */
  signatureValid: boolean;
  /** Key ID from signature (if present). */
  keyId?: string;
  /** Signer name from signature (if present). */
  signer?: string;
  /** Trust level of the signing key (if found in keyring). */
  trustLevel?: TrustLevel;
  /** Human-readable message explaining the result. */
  message: string;
  /** Whether user confirmation is needed. */
  requiresConfirmation: boolean;
};

/**
 * Extract security configuration from skills config.
 */
export function getVerificationConfig(config?: ClosedClawConfig): VerificationConfig {
  const security = config?.skills?.security;
  return {
    requireSignature: security?.requireSignature ?? false,
    promptOnUnsigned: security?.promptOnUnsigned ?? true,
    minTrustLevel: security?.minTrustLevel ?? "marginal",
  };
}

/**
 * Check if a trust level meets the minimum requirement.
 */
function meetsMinTrustLevel(actual: TrustLevel, minimum: "full" | "marginal"): boolean {
  if (minimum === "full") {
    return actual === "full";
  }
  // marginal accepts both full and marginal
  return actual === "full" || actual === "marginal";
}

/**
 * Verify skill signature against trusted keyring.
 *
 * @param skillPath - Path to the skill file.
 * @param config - ClosedClaw configuration for security settings.
 * @returns Verification result with allow/deny decision.
 */
export async function verifySkillSignatureForInstall(
  skillPath: string,
  config?: ClosedClawConfig,
): Promise<VerificationResult> {
  const verificationConfig = getVerificationConfig(config);
  const sigPath = getSignatureFilePath(skillPath);

  // Check if signature file exists
  let signatureExists = false;
  try {
    await fs.access(sigPath);
    signatureExists = true;
  } catch {
    // Signature file not found
  }

  // Handle unsigned skills
  if (!signatureExists) {
    if (verificationConfig.requireSignature) {
      return {
        allowed: false,
        hasSignature: false,
        signatureValid: false,
        message: `Signature required but not found. Install blocked by security policy.`,
        requiresConfirmation: false,
      };
    }

    if (verificationConfig.promptOnUnsigned) {
      return {
        allowed: false, // Will be allowed after confirmation
        hasSignature: false,
        signatureValid: false,
        message: `Skill is unsigned. Installation requires confirmation.`,
        requiresConfirmation: true,
      };
    }

    // Allow unsigned skills when not required and no prompt needed
    return {
      allowed: true,
      hasSignature: false,
      signatureValid: false,
      message: `Skill is unsigned (signatures not enforced).`,
      requiresConfirmation: false,
    };
  }

  // Read and parse signature
  const sigContent = await fs.readFile(sigPath, "utf-8");
  const signature = parseSignatureFile(sigContent);

  if (!signature) {
    return {
      allowed: false,
      hasSignature: true,
      signatureValid: false,
      message: `Signature file is malformed or invalid.`,
      requiresConfirmation: false,
    };
  }

  // Look up public key in trusted keyring
  const trustedKey = await getTrustedKey(signature.keyId);

  if (!trustedKey) {
    return {
      allowed: false,
      hasSignature: true,
      signatureValid: false,
      keyId: signature.keyId,
      signer: signature.signer,
      message: `Signing key ${signature.keyId.slice(0, 16)}... not found in trusted keyring. Add with: closedclaw keys add ${signature.keyId} <public-key-path>`,
      requiresConfirmation: false,
    };
  }

  // Check trust level
  if (!meetsMinTrustLevel(trustedKey.trustLevel, verificationConfig.minTrustLevel)) {
    return {
      allowed: false,
      hasSignature: true,
      signatureValid: false,
      keyId: signature.keyId,
      signer: signature.signer,
      trustLevel: trustedKey.trustLevel,
      message: `Key trust level '${trustedKey.trustLevel}' does not meet minimum '${verificationConfig.minTrustLevel}'. Update with: closedclaw keys trust ${signature.keyId} --trust ${verificationConfig.minTrustLevel}`,
      requiresConfirmation: false,
    };
  }

  // Verify cryptographic signature
  const skillContent = await fs.readFile(skillPath, "utf-8");
  const verifyResult = verifySkillSignature(skillContent, signature, trustedKey.publicKeyPem);

  if (!verifyResult.valid) {
    return {
      allowed: false,
      hasSignature: true,
      signatureValid: false,
      keyId: signature.keyId,
      signer: signature.signer,
      trustLevel: trustedKey.trustLevel,
      message: `Signature verification failed: ${verifyResult.error || "Invalid signature"}`,
      requiresConfirmation: false,
    };
  }

  // All checks passed
  return {
    allowed: true,
    hasSignature: true,
    signatureValid: true,
    keyId: signature.keyId,
    signer: signature.signer,
    trustLevel: trustedKey.trustLevel,
    message: `Signature valid. Signed by ${signature.signer} (trust: ${trustedKey.trustLevel})`,
    requiresConfirmation: false,
  };
}

/**
 * Check if skill installation should be allowed based on signature verification.
 * This is a convenience wrapper that returns a simple boolean.
 *
 * @param skillPath - Path to the skill file.
 * @param config - ClosedClaw configuration.
 * @returns True if installation should proceed, false otherwise.
 */
export async function shouldAllowSkillInstall(
  skillPath: string,
  config?: ClosedClawConfig,
): Promise<{ allowed: boolean; message: string }> {
  const result = await verifySkillSignatureForInstall(skillPath, config);
  return {
    allowed: result.allowed,
    message: result.message,
  };
}
