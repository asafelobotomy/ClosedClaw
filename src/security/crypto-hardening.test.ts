/**
 * Tests for encryption hardening features:
 * - Key rotation with metadata
 * - Backup encryption
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { EncryptedPayload } from "./encryption-types.js";
import { encryptConfigBackup, encryptAllConfigBackups } from "../config/backup-encryption.js";
import {
  encrypt,
  decrypt,
  generateKeyId,
  rekeyEncryptedPayload,
  needsKeyRotation,
  DEFAULT_ENCRYPTION_CONFIG,
} from "./crypto.js";

describe("Key rotation", () => {
  it("generates unique key IDs", () => {
    const id1 = generateKeyId();
    const id2 = generateKeyId();

    expect(id1).toMatch(/^key_[a-z0-9]+_[A-Za-z0-9_-]{8}$/);
    expect(id2).toMatch(/^key_[a-z0-9]+_[A-Za-z0-9_-]{8}$/);
    expect(id1).not.toBe(id2);
  });

  it("includes key metadata in encrypted payloads", () => {
    const encrypted = encrypt({
      plaintext: "sensitive data",
      passphrase: "test-passphrase-123",
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    expect(encrypted.keyId).toMatch(/^key_/);
    expect(encrypted.keyCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves custom key ID", () => {
    const customKeyId = "key_custom_12345678";
    const encrypted = encrypt({
      plaintext: "data",
      passphrase: "passphrase",
      config: DEFAULT_ENCRYPTION_CONFIG,
      keyId: customKeyId,
    });

    expect(encrypted.keyId).toBe(customKeyId);
  });

  it("successfully re-keys encrypted payload", () => {
    const original = encrypt({
      plaintext: "secret message",
      passphrase: "old-passphrase",
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    const rekeyed = rekeyEncryptedPayload({
      payload: original,
      oldPassphrase: "old-passphrase",
      newPassphrase: "new-passphrase",
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    // Verify decryption works with new passphrase
    const decrypted = decrypt({
      payload: rekeyed,
      passphrase: "new-passphrase",
    });

    expect(decrypted).toBe("secret message");

    // Verify key ID changed
    expect(rekeyed.keyId).not.toBe(original.keyId);

    // Verify old passphrase no longer works
    expect(() => {
      decrypt({ payload: rekeyed, passphrase: "old-passphrase" });
    }).toThrow();
  });

  it("detects keys needing rotation based on age", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

    const freshPayload: EncryptedPayload = {
      $encrypted: true,
      version: 1,
      algorithm: "xchacha20-poly1305",
      kdf: "argon2id",
      kdfParams: "e30=",
      salt: "aGVsbG8=",
      nonce: "aGVsbG8=",
      ciphertext: "aGVsbG8=",
      keyId: "key_123",
      keyCreatedAt: now.toISOString(),
    };

    const oldPayload: EncryptedPayload = {
      ...freshPayload,
      keyCreatedAt: old.toISOString(),
    };

    expect(needsKeyRotation(freshPayload, 90 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(needsKeyRotation(oldPayload, 90 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it("handles payloads without timestamps gracefully", () => {
    const legacyPayload: EncryptedPayload = {
      $encrypted: true,
      version: 1,
      algorithm: "xchacha20-poly1305",
      kdf: "argon2id",
      kdfParams: "e30=",
      salt: "aGVsbG8=",
      nonce: "aGVsbG8=",
      ciphertext: "aGVsbG8=",
    };

    // Should not require rotation for legacy payloads without timestamps
    expect(needsKeyRotation(legacyPayload)).toBe(false);
  });
});

describe("Config backup encryption", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "encrypt-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("encrypts plaintext config backup", async () => {
    const backupPath = path.join(tempDir, "config.json.bak");
    const plaintext = JSON.stringify({ apiKey: "secret-key-123" }, null, 2);

    await fs.writeFile(backupPath, plaintext, "utf-8");

    // Mock encryption enabled
    const config = { ...DEFAULT_ENCRYPTION_CONFIG, enabled: true };

    // Set temporary passphrase
    process.env.ClosedClaw_ENCRYPTION_PASSPHRASE = "test-secure-passphrase";

    const encrypted = await encryptConfigBackup(backupPath, config);

    expect(encrypted).toBe(true);

    // Verify file is now encrypted
    const content = await fs.readFile(backupPath, "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.$encrypted).toBe(true);
    expect(parsed.ciphertext).toBeDefined();

    // Cleanup
    delete process.env.ClosedClaw_ENCRYPTION_PASSPHRASE;
  });

  it("skips already-encrypted backups", async () => {
    const backupPath = path.join(tempDir, "config.json.bak");

    const encryptedPayload = encrypt({
      plaintext: JSON.stringify({ data: "test" }),
      passphrase: "test-passphrase",
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    await fs.writeFile(backupPath, JSON.stringify(encryptedPayload), "utf-8");

    const config = { ...DEFAULT_ENCRYPTION_CONFIG, enabled: true };
    process.env.ClosedClaw_ENCRYPTION_PASSPHRASE = "test-passphrase";

    const result = await encryptConfigBackup(backupPath, config);

    expect(result).toBe(false); // Already encrypted

    delete process.env.ClosedClaw_ENCRYPTION_PASSPHRASE;
  });

  it("encrypts multiple backup files", async () => {
    const configPath = path.join(tempDir, "config.json");

    // Create backups
    await fs.writeFile(`${configPath}.bak`, '{"key1": "val1"}', "utf-8");
    await fs.writeFile(`${configPath}.bak.1`, '{"key2": "val2"}', "utf-8");
    await fs.writeFile(`${configPath}.bak.2`, '{"key3": "val3"}', "utf-8");

    const config = { ...DEFAULT_ENCRYPTION_CONFIG, enabled: true };
    process.env.ClosedClaw_ENCRYPTION_PASSPHRASE = "test-passphrase";

    const count = await encryptAllConfigBackups(configPath, config);

    expect(count).toBe(3);

    // Verify all are encrypted
    const bak = JSON.parse(await fs.readFile(`${configPath}.bak`, "utf-8"));
    const bak1 = JSON.parse(await fs.readFile(`${configPath}.bak.1`, "utf-8"));
    const bak2 = JSON.parse(await fs.readFile(`${configPath}.bak.2`, "utf-8"));

    expect(bak.$encrypted).toBe(true);
    expect(bak1.$encrypted).toBe(true);
    expect(bak2.$encrypted).toBe(true);

    delete process.env.ClosedClaw_ENCRYPTION_PASSPHRASE;
  });

  it("returns 0 when encryption is disabled", async () => {
    const configPath = path.join(tempDir, "config.json");
    await fs.writeFile(`${configPath}.bak`, '{"test": "data"}', "utf-8");

    const config = { ...DEFAULT_ENCRYPTION_CONFIG, enabled: false };

    const count = await encryptAllConfigBackups(configPath, config);

    expect(count).toBe(0);
  });
});
