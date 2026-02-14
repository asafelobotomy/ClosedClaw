/**
 * TPC Cryptographic Signer
 *
 * Ed25519 signing and verification for TPC envelopes.
 * Uses Node.js built-in crypto module (Ed25519 support since Node 15+).
 * Falls back to HMAC-SHA256 when Ed25519 keys are unavailable.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SignedTPCEnvelope, TPCEnvelope, TPCSignatureScheme } from "./types.js";

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

export interface KeyPair {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
}

/**
 * Generate a new Ed25519 keypair.
 */
export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return { privateKey, publicKey };
}

/**
 * Export a keypair to PEM files on disk.
 * Sets private key permissions to 0600 (owner-only read/write).
 */
export async function exportKeyPair(
  keyPair: KeyPair,
  privatePath: string,
  publicPath: string,
): Promise<void> {
  const privDir = path.dirname(privatePath);
  const pubDir = path.dirname(publicPath);

  fs.mkdirSync(privDir, { recursive: true, mode: 0o700 });
  if (pubDir !== privDir) {
    fs.mkdirSync(pubDir, { recursive: true, mode: 0o700 });
  }

  const privatePem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const publicPem = keyPair.publicKey.export({ type: "spki", format: "pem" }) as string;

  fs.writeFileSync(privatePath, privatePem, { mode: 0o600 });
  fs.writeFileSync(publicPath, publicPem, { mode: 0o644 });
}

/**
 * Load a keypair from PEM files. If files don't exist, generates and saves
 * a new keypair automatically.
 */
export async function loadOrCreateKeyPair(
  privatePath: string,
  publicPath: string,
): Promise<KeyPair> {
  const resolvedPrivate = resolvePath(privatePath);
  const resolvedPublic = resolvePath(publicPath);

  if (fs.existsSync(resolvedPrivate) && fs.existsSync(resolvedPublic)) {
    const privatePem = fs.readFileSync(resolvedPrivate, "utf-8");
    const publicPem = fs.readFileSync(resolvedPublic, "utf-8");
    return {
      privateKey: crypto.createPrivateKey(privatePem),
      publicKey: crypto.createPublicKey(publicPem),
    };
  }

  const keyPair = generateKeyPair();
  await exportKeyPair(keyPair, resolvedPrivate, resolvedPublic);
  return keyPair;
}

/**
 * Load only the public key (for verification-only peers).
 */
export function loadPublicKey(publicPath: string): crypto.KeyObject {
  const resolvedPublic = resolvePath(publicPath);
  const publicPem = fs.readFileSync(resolvedPublic, "utf-8");
  return crypto.createPublicKey(publicPem);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Serialize a TPC envelope to a canonical JSON string for signing.
 * Fields are sorted alphabetically to ensure deterministic serialization.
 */
export function canonicalize(envelope: TPCEnvelope): string {
  return JSON.stringify(envelope, Object.keys(envelope).sort());
}

/**
 * Sign a TPC envelope with Ed25519.
 */
export function signEnvelope(
  envelope: TPCEnvelope,
  privateKey: crypto.KeyObject,
): SignedTPCEnvelope {
  const data = Buffer.from(canonicalize(envelope), "utf-8");
  const signature = crypto.sign(null, data, privateKey);

  return {
    envelope,
    signature: signature.toString("hex"),
    scheme: "ed25519",
  };
}

/**
 * Sign a TPC envelope with HMAC-SHA256 (fallback).
 */
export function signEnvelopeHmac(
  envelope: TPCEnvelope,
  secret: Buffer,
): SignedTPCEnvelope {
  const data = canonicalize(envelope);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const signature = hmac.digest("hex");

  return {
    envelope,
    signature,
    scheme: "hmac",
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify an Ed25519-signed TPC envelope.
 */
export function verifyEnvelope(
  signed: SignedTPCEnvelope,
  publicKey: crypto.KeyObject,
): boolean {
  if (signed.scheme !== "ed25519") return false;

  const data = Buffer.from(canonicalize(signed.envelope), "utf-8");
  const signature = Buffer.from(signed.signature, "hex");

  return crypto.verify(null, data, publicKey, signature);
}

/**
 * Verify an HMAC-SHA256-signed TPC envelope.
 */
export function verifyEnvelopeHmac(
  signed: SignedTPCEnvelope,
  secret: Buffer,
): boolean {
  if (signed.scheme !== "hmac") return false;

  const data = canonicalize(signed.envelope);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const expected = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signed.signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}

/**
 * Verify a signed envelope using the appropriate scheme.
 */
export function verify(
  signed: SignedTPCEnvelope,
  publicKeyOrSecret: crypto.KeyObject | Buffer,
): boolean {
  if (signed.scheme === "ed25519") {
    return verifyEnvelope(signed, publicKeyOrSecret as crypto.KeyObject);
  }
  return verifyEnvelopeHmac(signed, publicKeyOrSecret as Buffer);
}

// ---------------------------------------------------------------------------
// Nonce generation
// ---------------------------------------------------------------------------

/**
 * Generate a 128-bit random nonce as a hex string.
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Generate a UUID v4 for message IDs.
 */
export function generateMessageId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Envelope creation
// ---------------------------------------------------------------------------

/**
 * Create a TPC envelope wrapping a CT/1 payload.
 */
export function createEnvelope(params: {
  payload: string;
  sourceAgent: string;
  targetAgent: string;
  compressionVersion?: number | null;
}): TPCEnvelope {
  return {
    version: 1,
    messageId: generateMessageId(),
    timestamp: Math.floor(Date.now() / 1000),
    nonce: generateNonce(),
    sourceAgent: params.sourceAgent,
    targetAgent: params.targetAgent,
    compressionVersion: params.compressionVersion ?? undefined,
    payload: params.payload,
  };
}

/**
 * Create and sign a TPC envelope in one step.
 */
export function createSignedEnvelope(params: {
  payload: string;
  sourceAgent: string;
  targetAgent: string;
  privateKey: crypto.KeyObject;
  scheme?: TPCSignatureScheme;
  compressionVersion?: number | null;
}): SignedTPCEnvelope {
  const envelope = createEnvelope({
    payload: params.payload,
    sourceAgent: params.sourceAgent,
    targetAgent: params.targetAgent,
    compressionVersion: params.compressionVersion,
  });

  return signEnvelope(envelope, params.privateKey);
}

// ---------------------------------------------------------------------------
// Freshness check
// ---------------------------------------------------------------------------

/**
 * Check whether a TPC envelope is within the allowed time window.
 */
export function isEnvelopeFresh(
  envelope: TPCEnvelope,
  maxAgeSeconds: number,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const age = now - envelope.timestamp;
  return age >= 0 && age <= maxAgeSeconds;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(process.env.HOME ?? "/tmp", p.slice(2));
  }
  return p;
}
