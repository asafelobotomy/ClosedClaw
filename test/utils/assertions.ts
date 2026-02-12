/**
 * Custom Assertions for ClosedClaw Tests
 * 
 * Additional assertion helpers beyond Vitest's built-in matchers.
 */

import { expect } from 'vitest';

/**
 * Assert that a value is a valid session key format
 */
export function assertValidSessionKey(sessionKey: string) {
  expect(sessionKey).toMatch(/^agent:[^:]+:[^:]+:(dm|group|thread):.+$/);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asPrimitiveString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Assert that a config object is valid
 */
export function assertValidConfig(config: unknown) {
  const cfg = asRecord(config);
  expect(config).toBeDefined();
  expect(cfg.agents).toBeDefined();
  expect(typeof cfg.agents).toBe('object');
}

/**
 * Assert that an error message contains expected text
 */
export function assertErrorContains(error: Error, expected: string) {
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain(expected);
}

/**
 * Assert that a tool result is successful
 */
export function assertToolSuccess(result: unknown) {
  const value = asRecord(result);
  expect(result).toBeDefined();
  expect(value.error).toBeUndefined();
}

/**
 * Assert that a tool result is an error
 */
export function assertToolError(result: unknown, expectedMessage?: string) {
  const value = asRecord(result);
  expect(result).toBeDefined();
  expect(value.error).toBeDefined();
  
  if (expectedMessage) {
    expect(asPrimitiveString(value.error)).toContain(expectedMessage);
  }
}

/**
 * Assert that an audit log entry is valid
 */
export function assertValidAuditEntry(entry: unknown) {
  const value = asRecord(entry);
  expect(entry).toBeDefined();
  expect(value.seq).toBeTypeOf('number');
  expect(value.ts).toBeTypeOf('string');
  expect(value.type).toBeTypeOf('string');
  expect(asPrimitiveString(value.severity)).toMatch(/^(debug|info|warn|error|critical)$/);
  expect(value.hash).toBeTypeOf('string');
}

/**
 * Assert that a signature is valid format
 */
export function assertValidSignature(signature: string) {
  expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 format
  expect(signature.length).toBeGreaterThan(0);
}

/**
 * Assert that a hash is valid SHA-256 format
 */
export function assertValidSha256Hash(hash: string) {
  expect(hash).toMatch(/^[a-f0-9]{64}$/i);
}

/**
 * Assert that an encrypted value format is valid
 */
export function assertValidEncryptedFormat(encrypted: string) {
  // Format: algorithm:iv:data
  expect(encrypted).toMatch(/^[^:]+:[^:]+:[^:]+$/);
}

/**
 * Assert that a keychain entry is valid
 */
export function assertValidKeychainEntry(entry: unknown) {
  const value = asRecord(entry);
  expect(entry).toBeDefined();
  expect(value.namespace).toBeTypeOf('string');
  expect(value.identifier).toBeTypeOf('string');
  expect(value.secret).toBeTypeOf('string');
}

/**
 * Assert that timestamps are in chronological order
 */
export function assertChronological(timestamps: number[]) {
  for (let i = 1; i < timestamps.length; i++) {
    expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
  }
}
