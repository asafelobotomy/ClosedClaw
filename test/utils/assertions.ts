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

/**
 * Assert that a config object is valid
 */
export function assertValidConfig(config: any) {
  expect(config).toBeDefined();
  expect(config.agents).toBeDefined();
  expect(typeof config.agents).toBe('object');
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
export function assertToolSuccess(result: any) {
  expect(result).toBeDefined();
  expect(result.error).toBeUndefined();
}

/**
 * Assert that a tool result is an error
 */
export function assertToolError(result: any, expectedMessage?: string) {
  expect(result).toBeDefined();
  expect(result.error).toBeDefined();
  
  if (expectedMessage) {
    expect(result.error).toContain(expectedMessage);
  }
}

/**
 * Assert that an audit log entry is valid
 */
export function assertValidAuditEntry(entry: any) {
  expect(entry).toBeDefined();
  expect(entry.seq).toBeTypeOf('number');
  expect(entry.ts).toBeTypeOf('string');
  expect(entry.type).toBeTypeOf('string');
  expect(entry.severity).toMatch(/^(debug|info|warn|error|critical)$/);
  expect(entry.hash).toBeTypeOf('string');
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
export function assertValidKeychainEntry(entry: any) {
  expect(entry).toBeDefined();
  expect(entry.namespace).toBeTypeOf('string');
  expect(entry.identifier).toBeTypeOf('string');
  expect(entry.secret).toBeTypeOf('string');
}

/**
 * Assert that timestamps are in chronological order
 */
export function assertChronological(timestamps: number[]) {
  for (let i = 1; i < timestamps.length; i++) {
    expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
  }
}
