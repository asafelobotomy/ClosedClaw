/**
 * Skill signing command implementation.
 *
 * Allows developers to cryptographically sign skill files to establish trust.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RuntimeEnv } from "../runtime.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  generateSigningKeyPair,
  signSkill,
  formatSignatureFile,
  fingerprintPublicKey,
  getSignatureFilePath,
} from "../security/skill-signing.js";
import { addTrustedKey } from "../security/trusted-keyring.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";

type SkillSignOptions = {
  keyPath?: string;
  generateKey?: boolean;
  signerName?: string;
  output?: string;
  json?: boolean;
};

type KeygenOptions = {
  output?: string;
  signerName?: string;
  addToKeyring?: boolean;
  json?: boolean;
};

/**
 * Generate a new signing key pair.
 */
export async function generateKeyCommand(
  runtime: RuntimeEnv,
  options: KeygenOptions,
): Promise<void> {
  const signerName = options.signerName || "unknown";
  const outputDir = options.output || path.join(process.env.HOME || "~", ".closedclaw", "keys");

  // Generate key pair
  const keyPair = generateSigningKeyPair();

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });

  // Write keys to disk
  const privateKeyPath = path.join(outputDir, `signing-key-${keyPair.keyId.slice(0, 8)}.pem`);
  const publicKeyPath = path.join(outputDir, `signing-key-${keyPair.keyId.slice(0, 8)}.pub`);

  await fs.writeFile(privateKeyPath, keyPair.privateKeyPem, { mode: 0o600 });
  await fs.writeFile(publicKeyPath, keyPair.publicKeyPem, { mode: 0o644 });

  // Optionally add to keyring
  if (options.addToKeyring) {
    await addTrustedKey(keyPair.keyId, {
      name: signerName,
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: new Date().toISOString(),
      verifiedVia: "self",
      notes: "Self-generated signing key",
    });
  }

  if (options.json) {
    runtime.log(
      JSON.stringify(
        {
          keyId: keyPair.keyId,
          privateKeyPath: shortenHomePath(privateKeyPath),
          publicKeyPath: shortenHomePath(publicKeyPath),
          addedToKeyring: Boolean(options.addToKeyring),
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(theme.heading("Generated Signing Key Pair"));
  runtime.log("");
  runtime.log(`${theme.muted("Key ID:")} ${keyPair.keyId}`);
  runtime.log(`${theme.muted("Private key:")} ${shortenHomePath(privateKeyPath)}`);
  runtime.log(`${theme.muted("Public key:")} ${shortenHomePath(publicKeyPath)}`);
  runtime.log("");
  runtime.log(theme.warn("⚠️  Keep the private key secure. Never share it."));

  if (options.addToKeyring) {
    runtime.log(theme.success("✓ Added to trusted keyring"));
  } else {
    runtime.log("");
    runtime.log(
      `To add to keyring: ${formatCliCommand(`closedclaw keys add ${keyPair.keyId} ${shortenHomePath(publicKeyPath)} --trust full`)}`,
    );
  }
}

/**
 * Sign a skill file.
 */
export async function signSkillCommand(
  runtime: RuntimeEnv,
  skillPath: string,
  options: SkillSignOptions,
): Promise<void> {
  // Load private key
  let privateKeyPem: string;
  let keyId: string;

  if (options.generateKey) {
    // Generate ephemeral key for one-time signing
    const keyPair = generateSigningKeyPair();
    privateKeyPem = keyPair.privateKeyPem;
    keyId = keyPair.keyId;

    runtime.log(theme.warn("⚠️  Using ephemeral key (not saved to disk)"));
    runtime.log("");
  } else {
    // Load from file
    const keyPath = options.keyPath || path.join(process.env.HOME || "~", ".closedclaw", "keys");
    let resolvedKeyPath = keyPath;

    try {
      const stat = await fs.stat(resolvedKeyPath);
      if (stat.isDirectory()) {
        // Find first .pem file in directory
        const files = await fs.readdir(resolvedKeyPath);
        const pemFile = files.find((f) => f.endsWith(".pem") && !f.endsWith(".pub"));
        if (!pemFile) {
          runtime.error(`No private key (.pem) found in ${shortenHomePath(resolvedKeyPath)}`);
          runtime.log(
            `Generate a key: ${formatCliCommand("closedclaw skill keygen --add-to-keyring")}`,
          );
          process.exit(1);
        }
        resolvedKeyPath = path.join(resolvedKeyPath, pemFile);
      }
    } catch {
      runtime.error(`Key not found: ${shortenHomePath(resolvedKeyPath)}`);
      runtime.log(
        `Generate a key: ${formatCliCommand("closedclaw skill keygen --add-to-keyring")}`,
      );
      process.exit(1);
    }

    privateKeyPem = await fs.readFile(resolvedKeyPath, "utf-8");

    // Derive key ID from corresponding public key
    const publicKeyPath = resolvedKeyPath.replace(/\.pem$/, ".pub");
    try {
      const publicKeyPem = await fs.readFile(publicKeyPath, "utf-8");
      keyId = fingerprintPublicKey(publicKeyPem);
    } catch {
      runtime.error(`Public key not found: ${shortenHomePath(publicKeyPath)}`);
      runtime.log("Private and public keys must be in the same directory.");
      process.exit(1);
    }
  }

  // Read skill content
  const skillContent = await fs.readFile(skillPath, "utf-8");

  // Sign
  const signerName = options.signerName || process.env.USER || "unknown";
  const signature = signSkill(skillContent, privateKeyPem, {
    name: signerName,
    keyId,
  });

  // Format and write signature file
  const sigContent = formatSignatureFile(signature);
  const sigPath = options.output || getSignatureFilePath(skillPath);

  await fs.writeFile(sigPath, sigContent, { mode: 0o644 });

  if (options.json) {
    runtime.log(
      JSON.stringify(
        {
          skillPath: shortenHomePath(skillPath),
          signaturePath: shortenHomePath(sigPath),
          keyId: signature.keyId,
          signer: signature.signer,
          timestamp: signature.timestamp,
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(theme.heading("Skill Signed"));
  runtime.log("");
  runtime.log(`${theme.muted("Skill:")} ${shortenHomePath(skillPath)}`);
  runtime.log(`${theme.muted("Signature:")} ${shortenHomePath(sigPath)}`);
  runtime.log(`${theme.muted("Signer:")} ${signature.signer}`);
  runtime.log(`${theme.muted("Key ID:")} ${signature.keyId}`);
  runtime.log(`${theme.muted("Timestamp:")} ${signature.timestamp}`);
  runtime.log("");
  runtime.log(theme.success("✓ Signature file created"));
  runtime.log("");
  runtime.log(`Distribute both files to users:`);
  runtime.log(`  • ${path.basename(skillPath)}`);
  runtime.log(`  • ${path.basename(sigPath)}`);
}
