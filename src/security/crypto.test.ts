/**
 * Tests for encryption/decryption layer.
 */

import { describe, expect, it } from "vitest";
import {
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  isEncryptedPayload,
  DEFAULT_ENCRYPTION_CONFIG,
} from "./crypto.js";

describe("crypto", () => {
  const testPassphrase = "Test-Passphrase-2026!";
  const testPlaintext = "Hello, World!";
  const testData = { foo: "bar", nested: { value: 42 } };

  it("should encrypt and decrypt plaintext", () => {
    const encrypted = encrypt({
      plaintext: testPlaintext,
      passphrase: testPassphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    expect(encrypted.$encrypted).toBe(true);
    expect(encrypted.version).toBe(1);
    expect(encrypted.algorithm).toBe("xchacha20-poly1305");
    expect(encrypted.kdf).toBe("argon2id");

    const decrypted = decrypt({
      payload: encrypted,
      passphrase: testPassphrase,
    });

    expect(decrypted).toBe(testPlaintext);
  });

  it("should encrypt and decrypt JSON data", () => {
    const encrypted = encryptJson({
      data: testData,
      passphrase: testPassphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    expect(isEncryptedPayload(encrypted)).toBe(true);

    const decrypted = decryptJson({
      payload: encrypted,
      passphrase: testPassphrase,
    });

    expect(decrypted).toEqual(testData);
  });

  it("should fail decryption with wrong passphrase", () => {
    const encrypted = encrypt({
      plaintext: testPlaintext,
      passphrase: testPassphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    expect(() => {
      decrypt({
        payload: encrypted,
        passphrase: "wrong-passphrase",
      });
    }).toThrow(/Decryption failed/);
  });

  it("should detect encrypted payloads", () => {
    const encrypted = encryptJson({
      data: testData,
      passphrase: testPassphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    expect(isEncryptedPayload(encrypted)).toBe(true);
    expect(isEncryptedPayload(testData)).toBe(false);
    expect(isEncryptedPayload(null)).toBe(false);
    expect(isEncryptedPayload("string")).toBe(false);
  });

  it("should produce different ciphertexts for same plaintext", () => {
    const encrypted1 = encrypt({
      plaintext: testPlaintext,
      passphrase: testPassphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    const encrypted2 = encrypt({
      plaintext: testPlaintext,
      passphrase: testPassphrase,
      config: DEFAULT_ENCRYPTION_CONFIG,
    });

    // Different salts and nonces mean different ciphertexts
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.salt).not.toBe(encrypted2.salt);
    expect(encrypted1.nonce).not.toBe(encrypted2.nonce);

    // But both decrypt to same plaintext
    expect(decrypt({ payload: encrypted1, passphrase: testPassphrase })).toBe(testPlaintext);
    expect(decrypt({ payload: encrypted2, passphrase: testPassphrase })).toBe(testPlaintext);
  });
});
