/**
 * Tests for trusted keyring management.
 *
 * Tests cover:
 * - Load/save round-trips with temp directories
 * - Key CRUD operations (add, remove, get, list, update)
 * - Trust level checks
 * - Verification integration (getPublicKeyForVerification)
 * - Edge cases (corrupt files, missing keyring)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadKeyring,
  saveKeyring,
  addTrustedKey,
  removeTrustedKey,
  getTrustedKey,
  isKeyTrusted,
  listTrustedKeys,
  updateTrustLevel,
  getPublicKeyForVerification,
  getKeyringPath,
  type TrustedKey,
  type Keyring,
} from "./trusted-keyring.js";
import { generateSigningKeyPair } from "./skill-signing.js";

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "closedclaw-keyring-test-"));
  vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── Path ────────────────────────────────────────────────────────────────────

describe("getKeyringPath", () => {
  it("returns path under .closedclaw directory", () => {
    const keyringPath = getKeyringPath();
    expect(keyringPath).toContain(".closedclaw");
    expect(keyringPath).toContain("trusted-keys.json");
  });
});

// ─── Load / Save ─────────────────────────────────────────────────────────────

describe("loadKeyring", () => {
  it("returns empty keyring when file doesn't exist", async () => {
    const keyring = await loadKeyring();
    expect(keyring.version).toBe(1);
    expect(Object.keys(keyring.keys)).toHaveLength(0);
  });

  it("returns empty keyring for corrupt file", async () => {
    const keyringPath = getKeyringPath();
    await fs.mkdir(path.dirname(keyringPath), { recursive: true });
    await fs.writeFile(keyringPath, "not json {{{", "utf-8");

    const keyring = await loadKeyring();
    expect(keyring.version).toBe(1);
    expect(Object.keys(keyring.keys)).toHaveLength(0);
  });

  it("returns empty keyring for wrong version", async () => {
    const keyringPath = getKeyringPath();
    await fs.mkdir(path.dirname(keyringPath), { recursive: true });
    await fs.writeFile(keyringPath, JSON.stringify({ version: 99, keys: {} }), "utf-8");

    const keyring = await loadKeyring();
    expect(Object.keys(keyring.keys)).toHaveLength(0);
  });
});

describe("saveKeyring", () => {
  it("creates parent directories", async () => {
    const keyring: Keyring = { version: 1, keys: {} };
    await saveKeyring(keyring);

    const keyringPath = getKeyringPath();
    const content = await fs.readFile(keyringPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
  });

  it("round-trips key data", async () => {
    const keyPair = generateSigningKeyPair();
    const keyring: Keyring = {
      version: 1,
      keys: {
        [keyPair.keyId]: {
          name: "Alice",
          publicKeyPem: keyPair.publicKeyPem,
          trustLevel: "full",
          added: "2026-02-09",
          verifiedVia: "manual",
        },
      },
    };

    await saveKeyring(keyring);
    const loaded = await loadKeyring();

    expect(loaded.keys[keyPair.keyId]).toBeDefined();
    expect(loaded.keys[keyPair.keyId].name).toBe("Alice");
    expect(loaded.keys[keyPair.keyId].trustLevel).toBe("full");
    expect(loaded.keys[keyPair.keyId].publicKeyPem).toBe(keyPair.publicKeyPem);
  });
});

// ─── Key CRUD ────────────────────────────────────────────────────────────────

describe("addTrustedKey", () => {
  it("adds a new key to the keyring", async () => {
    const keyPair = generateSigningKeyPair();
    const key: TrustedKey = {
      name: "Bob Developer",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    };

    const result = await addTrustedKey(keyPair.keyId, key);
    expect(result.keys[keyPair.keyId]).toBeDefined();
    expect(result.keys[keyPair.keyId].name).toBe("Bob Developer");
  });

  it("overwrites existing key with same ID", async () => {
    const keyPair = generateSigningKeyPair();

    await addTrustedKey(keyPair.keyId, {
      name: "Original",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "marginal",
      added: "2026-02-01",
      verifiedVia: "manual",
    });

    await addTrustedKey(keyPair.keyId, {
      name: "Updated",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    const key = await getTrustedKey(keyPair.keyId);
    expect(key?.name).toBe("Updated");
    expect(key?.trustLevel).toBe("full");
  });

  it("preserves existing keys when adding new ones", async () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();

    await addTrustedKey(pair1.keyId, {
      name: "User 1",
      publicKeyPem: pair1.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    await addTrustedKey(pair2.keyId, {
      name: "User 2",
      publicKeyPem: pair2.publicKeyPem,
      trustLevel: "marginal",
      added: "2026-02-09",
      verifiedVia: "web-of-trust",
    });

    const key1 = await getTrustedKey(pair1.keyId);
    const key2 = await getTrustedKey(pair2.keyId);
    expect(key1?.name).toBe("User 1");
    expect(key2?.name).toBe("User 2");
  });
});

describe("removeTrustedKey", () => {
  it("removes an existing key", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Test",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    const removed = await removeTrustedKey(keyPair.keyId);
    expect(removed).toBe(true);

    const key = await getTrustedKey(keyPair.keyId);
    expect(key).toBeUndefined();
  });

  it("returns false for non-existent key", async () => {
    const removed = await removeTrustedKey("nonexistent-key-id");
    expect(removed).toBe(false);
  });
});

describe("getTrustedKey", () => {
  it("returns undefined for non-existent key", async () => {
    const key = await getTrustedKey("does-not-exist");
    expect(key).toBeUndefined();
  });
});

describe("listTrustedKeys", () => {
  it("returns empty array for empty keyring", async () => {
    const keys = await listTrustedKeys();
    expect(keys).toEqual([]);
  });

  it("returns all keys as tuples", async () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();

    await addTrustedKey(pair1.keyId, {
      name: "Alice",
      publicKeyPem: pair1.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    await addTrustedKey(pair2.keyId, {
      name: "Bob",
      publicKeyPem: pair2.publicKeyPem,
      trustLevel: "marginal",
      added: "2026-02-09",
      verifiedVia: "web-of-trust",
    });

    const keys = await listTrustedKeys();
    expect(keys).toHaveLength(2);

    const ids = keys.map(([id]) => id);
    expect(ids).toContain(pair1.keyId);
    expect(ids).toContain(pair2.keyId);
  });
});

describe("updateTrustLevel", () => {
  it("updates trust level for existing key", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Test",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "marginal",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    const updated = await updateTrustLevel(keyPair.keyId, "full");
    expect(updated).toBe(true);

    const key = await getTrustedKey(keyPair.keyId);
    expect(key?.trustLevel).toBe("full");
  });

  it("returns false for non-existent key", async () => {
    const updated = await updateTrustLevel("nonexistent", "full");
    expect(updated).toBe(false);
  });

  it("can revoke a key", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Compromised",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    await updateTrustLevel(keyPair.keyId, "none");
    const trusted = await isKeyTrusted(keyPair.keyId);
    expect(trusted).toBe(false);
  });
});

// ─── Trust Checks ────────────────────────────────────────────────────────────

describe("isKeyTrusted", () => {
  it("returns true for full trust", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Full",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });
    expect(await isKeyTrusted(keyPair.keyId)).toBe(true);
  });

  it("returns true for marginal trust", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Marginal",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "marginal",
      added: "2026-02-09",
      verifiedVia: "manual",
    });
    expect(await isKeyTrusted(keyPair.keyId)).toBe(true);
  });

  it("returns false for none (revoked) trust", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Revoked",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "none",
      added: "2026-02-09",
      verifiedVia: "manual",
    });
    expect(await isKeyTrusted(keyPair.keyId)).toBe(false);
  });

  it("returns false for unknown key", async () => {
    expect(await isKeyTrusted("unknown-key-id")).toBe(false);
  });
});

// ─── Verification Integration ────────────────────────────────────────────────

describe("getPublicKeyForVerification", () => {
  it("returns public key for fully trusted key", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Trusted",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    const pem = await getPublicKeyForVerification(keyPair.keyId);
    expect(pem).toBe(keyPair.publicKeyPem);
  });

  it("returns public key for marginally trusted key", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Marginal",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "marginal",
      added: "2026-02-09",
      verifiedVia: "web-of-trust",
    });

    const pem = await getPublicKeyForVerification(keyPair.keyId);
    expect(pem).toBe(keyPair.publicKeyPem);
  });

  it("returns null for distrusted key", async () => {
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "Distrusted",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "none",
      added: "2026-02-09",
      verifiedVia: "manual",
    });

    const pem = await getPublicKeyForVerification(keyPair.keyId);
    expect(pem).toBeNull();
  });

  it("returns null for unknown key", async () => {
    const pem = await getPublicKeyForVerification("nonexistent");
    expect(pem).toBeNull();
  });
});

// ─── End-to-End with Signing ─────────────────────────────────────────────────

describe("keyring + signing integration", () => {
  it("can add key, sign skill, and verify via keyring lookup", async () => {
    // 1. Generate key and add to keyring
    const keyPair = generateSigningKeyPair();
    await addTrustedKey(keyPair.keyId, {
      name: "trusted-developer",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: new Date().toISOString(),
      verifiedVia: "manual",
    });

    // 2. Sign a skill
    const { signSkill, verifySkillSignature } = await import("./skill-signing.js");
    const skillContent = "# Authentication Helper\n\nHandles OAuth flows.\n";
    const signature = signSkill(skillContent, keyPair.privateKeyPem, {
      name: "trusted-developer",
      keyId: keyPair.keyId,
    });

    // 3. Look up public key from keyring
    const publicKey = await getPublicKeyForVerification(signature.keyId);
    expect(publicKey).not.toBeNull();

    // 4. Verify
    const result = verifySkillSignature(skillContent, signature, publicKey!);
    expect(result.valid).toBe(true);
  });

  it("rejects skill signed by revoked key", async () => {
    const keyPair = generateSigningKeyPair();

    // Add key then revoke it
    await addTrustedKey(keyPair.keyId, {
      name: "compromised-developer",
      publicKeyPem: keyPair.publicKeyPem,
      trustLevel: "full",
      added: new Date().toISOString(),
      verifiedVia: "manual",
    });
    await updateTrustLevel(keyPair.keyId, "none");

    // Sign a skill
    const { signSkill } = await import("./skill-signing.js");
    const signature = signSkill("# Evil Skill", keyPair.privateKeyPem, {
      name: "compromised-developer",
      keyId: keyPair.keyId,
    });

    // Attempt keyring lookup — should be null (revoked)
    const publicKey = await getPublicKeyForVerification(signature.keyId);
    expect(publicKey).toBeNull();
  });
});
