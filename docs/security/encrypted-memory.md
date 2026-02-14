# End-to-End Encrypted Memory Storage

**Priority 3 of ClosedClaw Fork Roadmap** (Completed)

## Overview

ClosedClaw encrypts all data at rest in `~/.closedclaw/` with user-controlled passphrases. This protects sensitive information like session transcripts, credentials, and cron job data from unauthorized access if your disk is compromised.

## Key Features

- **XChaCha20-Poly1305** authenticated encryption (AEAD - Authenticated Encryption with Associated Data)
- **Argon2id** key derivation function with OWASP-recommended parameters:
  - Memory: 64 MB (safe for most systems)
  - Iterations: 3 (minimum recommended)
  - Parallelism: 4 (uses multiple CPU cores)
- **Transparent migration**: Reads both encrypted and plaintext files for gradual rollout
- **Atomic writes**: Prevents data corruption with temp file + rename pattern
- **Secure permissions**: Automatically sets 0o600 on sensitive files

## Getting Started

### 1. Set Your Passphrase

```bash
# Via environment variable (recommended)
export ClosedClaw_PASSPHRASE="your-secure-passphrase-here"

# Or via file
echo "your-secure-passphrase-here" > ~/.closedclaw/.passphrase
chmod 600 ~/.closedclaw/.passphrase
```

### 2. Check Encryption Status

```bash
closedclaw security encrypt --status
```

Output example:

```
Encryption Status

Plaintext stores:
  ⚠ /home/user/.closedclaw/credentials

Migrate: closedclaw security encrypt --migrate

Missing stores (not yet created):
  - /home/user/.closedclaw/sessions/sessions.json
  - /home/user/.closedclaw/cron/cron-store.json

Passphrase source:
  Environment variable: ClosedClaw_PASSPHRASE
```

### 3. Migrate Existing Data

```bash
closedclaw security encrypt --migrate
```

This encrypts all plaintext stores in place. **Backup your data first!**

## Passphrase Requirements

- **Minimum 12 characters**
- **At least 3 of**: uppercase, lowercase, numbers, special characters
- **Avoid weak patterns**: "password", "123456", "closedclaw", etc.

## Security Considerations

### ⚠️ CRITICAL: Passphrase Loss = Data Loss

If you lose your passphrase, **your encrypted data cannot be recovered**. There is no backdoor or recovery mechanism. Keep your passphrase:

- **Secure**: Store in a password manager (1Password, Bitwarden, etc.)
- **Backed up**: Write down and store in a safe place
- **Never committed**: Do not commit passphrases to git repositories

### Threat Model

**Protects Against**:

- Physical disk theft
- Unauthorized local file access
- Backup compromise (if backups are encrypted)

**Does NOT Protect Against**:

- Active memory dumps while Gateway is running (passphrase is in RAM)
- Root/admin access on a running system
- Keyloggers or malware that capture the passphrase when set

### Defense in Depth

Encryption at rest is **one layer** of security. Combine with:

- **Mandatory sandboxing** (Priority 2) - Isolates tool execution
- **Filesystem permissions** - 0o600 on all state/config files
- **DM pairing** - Requires pairing codes for unknown senders
- **Access controls** - Allowlists for channels/users
- **Audit logging** - Track suspicious activities

## Architecture

### Encryption Stack

1. **`src/security/encryption-types.ts`**: TypeScript types for encryption config and payloads
2. **`src/security/crypto.ts`**: Core crypto primitives (`encrypt()`, `decrypt()`, `deriveKey()`)
3. **`src/security/encrypted-store.ts`**: File storage abstraction (`readEncryptedStore()`, `writeEncryptedStore()`)
4. **`src/security/passphrase.ts`**: Passphrase lifecycle management (`resolvePassphrase()`, `validatePassphrase()`)

### Encrypted Payload Format

```typescript
{
  "$encrypted": true,
  "version": 1,
  "algorithm": "xchacha20-poly1305",
  "kdf": "argon2id",
  "kdfParams": "<base64-encoded-json>",
  "salt": "<base64-random-32-bytes>",
  "nonce": "<base64-random-24-bytes>",
  "ciphertext": "<base64-encrypted-data>"
}
```

### Stores Encrypted

- **Sessions**: `~/.closedclaw/sessions/sessions.json`
- **Cron jobs**: `~/.closedclaw/cron/cron-store.json`
- **Credentials**: `~/.closedclaw/credentials/*`

## CLI Reference

### `closedclaw security encrypt --status`

Check encryption status of all stores.

**Options**:

- `--json`: Output as JSON

**Example**:

```bash
closedclaw security encrypt --status --json
```

### `closedclaw security encrypt --migrate`

Migrate plaintext stores to encrypted storage.

**Requirements**:

- Passphrase must be configured (via env var or file)
- Passphrase must meet strength requirements

**Example**:

```bash
export ClosedClaw_PASSPHRASE="MySecurePassphrase123!"
closedclaw security encrypt --migrate
```

### `closedclaw security encrypt`

Show encryption setup instructions (no flags).

**Example**:

```bash
closedclaw security encrypt
```

Output:

```
Encryption Setup

ClosedClaw can encrypt all data at rest with a passphrase you control.

IMPORTANT: If you lose your passphrase, your data cannot be recovered!

Set your passphrase: export ClosedClaw_PASSPHRASE="your-secure-passphrase"

Passphrase requirements:
  • At least 12 characters
  • Mix of uppercase, lowercase, numbers, and symbols
  • Avoid weak patterns (e.g., 'password', '123456')

Check status: closedclaw security encrypt --status
Migrate data: closedclaw security encrypt --migrate
```

## Key Management & Hardening

### Key Rotation

**Automatic Key Metadata Tracking**: Every encrypted payload now includes:

- `keyId`: Unique identifier (format: `key_<timestamp36>_<random8>`)
- `keyCreatedAt`: ISO 8601 timestamp for rotation policy enforcement

**Check Key Age**:

```typescript
import { needsKeyRotation } from "./crypto.js";

const payload = await encryptedStore.readLatest("my-file.enc");
if (needsKeyRotation(payload, 90)) {
  console.log("Key rotation recommended (>90 days old)");
}
```

**Rotate Keys**:

```typescript
import { rekeyEncryptedPayload } from "./crypto.js";

// Re-encrypt with new passphrase
const oldPassphrase = process.env.ClosedClaw_OLD_PASSPHRASE;
const newPassphrase = process.env.ClosedClaw_PASSPHRASE;

const rekeyed = await rekeyEncryptedPayload(encryptedPayload, oldPassphrase, newPassphrase);
```

**Best Practices**:

- Rotate keys every **90 days** (default policy)
- Use unique passphrases for each rotation
- Keep old passphrases for 30 days to decrypt backups

### Config Backup Encryption

**Automatic Protection**: Config backups (`.bak`, `.bak.1`, etc.) are **automatically encrypted** on every write to prevent plaintext API key leakage.

**Manual Encryption**:

```bash
# Encrypt all existing unencrypted backups
closedclaw security encrypt --backups
```

**Diagnostics**:

```bash
# Check backup encryption status
closedclaw doctor

# Output example:
# ⚠ 3 config backups are unencrypted
# Fix: closedclaw security encrypt --backups
```

**Implementation Details**:

- Backups encrypted with same passphrase as main config
- Best-effort encryption: logs errors but doesn't fail writes
- Already-encrypted backups are skipped
- Files proven valid JSON5/JSON before encryption

## Future Enhancements

- **OS Keychain Integration** (Priority 7): Store passphrases in macOS Keychain, Windows Credential Manager, GNOME Keyring
- **Hardware Security Modules (HSM)**: Support for YubiKey, TPM 2.0
- **Remote KMS**: AWS KMS, HashiCorp Vault integration
- **Automated Key Rotation**: Scheduled re-encryption via cron jobs
- **Key Rotation Reminders**: Warnings when keys approach 90-day threshold

## Testing

Encryption implementation includes comprehensive test coverage:

```bash
# Unit tests (crypto primitives)
pnpm test src/security/crypto.test.ts

# Hardening tests (key rotation, backup encryption)
pnpm test src/security/crypto-hardening.test.ts

# Build verification
pnpm build

# All tests
pnpm test
```

Test coverage:

- **crypto.test.ts** (61 tests): Core encryption/decryption, key derivation, validation
- **crypto-hardening.test.ts** (10 tests): Key rotation, re-keying, backup encryption, legacy compatibility

## Dependencies

- **[@noble/ciphers](https://github.com/paulmillr/noble-ciphers)** v0.6.0: Audited, modern encryption library
- **[@noble/hashes](https://github.com/paulmillr/noble-hashes)** v1.5.0: Audited hashing library (Argon2id)

Both libraries are:

- Actively maintained by [@paulmillr](https://github.com/paulmillr)
- Audited by security researchers
- Used in production by major projects
- ESM-native with TypeScript support

## Troubleshooting

### Migration Fails

```
Error: Failed to resolve passphrase
```

**Solution**: Ensure `ClosedClaw_PASSPHRASE` is set:

```bash
export ClosedClaw_PASSPHRASE="your-passphrase"
closedclaw security encrypt --migrate
```

### Weak Passphrase Error

```
Passphrase is too weak:
  Passphrase should contain at least 3 of: lowercase, uppercase, digits, special characters
```

**Solution**: Use a stronger passphrase:

```bash
export ClosedClaw_PASSPHRASE="MyM0re$ecurePa55phrase!"
```

### Decryption Fails After Migration

```
Decryption failed: incorrect passphrase or corrupted data
```

**Solution**:

1. Verify passphrase is correct
2. Check backup files (`*.bak`) in same directory
3. Restore from backup if available

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 7539: ChaCha20-Poly1305](https://datatracker.ietf.org/doc/html/rfc7539)
- [RFC 9106: Argon2 Memory-Hard Function](https://datatracker.ietf.org/doc/html/rfc9106)
- [Fork Roadmap: Priority 3](/docs/refactor/closedclaw-fork-roadmap.md#priority-3-end-to-end-encrypted-memory-storage)
