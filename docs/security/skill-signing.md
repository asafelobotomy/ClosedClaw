---
summary: "Cryptographic signing for skills and plugins to prevent malicious or tampered code execution"
read_when:
  - You want to sign skills you distribute
  - You want to verify skill signatures before installation
  - You need to understand the trust model
title: "Skill Signing & Verification"
---

# Skill Signing & Verification

**Purpose**: Cryptographic signatures ensure that skills are authentic and haven't been tampered with before installation.

**Security Level**: Ed25519 signatures provide ~128-bit security with small key sizes and fast verification.

Related:
- [Trusted Keyring](/security/trusted-keyring) - Key management
- [Security CLI](/cli/security) - Command reference
- [Gateway Security](/gateway/security) - Overall security guide

---

## Overview

ClosedClaw supports cryptographic signing of skills using **Ed25519 digital signatures**. This allows skill publishers to sign their skills, and users to verify signatures before installation.

### Why Sign Skills?

- **Authenticity**: Verify the skill comes from a trusted publisher
- **Integrity**: Detect tampering or modification
- **Trust boundaries**: Distinguish official vs community skills
- **Audit trail**: Track who signed what

### Trust Model

Skills are signed by publishers and verified against a **trusted keyring** (`~/.ClosedClaw/security/trusted-keyring.json`).

**Trust Levels**:
- **full**: Fully trusted publisher (official ClosedClaw skills, verified organizations)
- **marginal**: Partially trusted publisher (community contributors, individual users)

**Default Policy** (backward compatible):
- Unsigned skills are **allowed** with warnings
- Prompts before installing unsigned skills
- Accepts both `full` and `marginal` trust levels

**Recommended Production Policy**:
```json5
{
  "skills": {
    "security": {
      "requireSignature": true,
      "minTrustLevel": "full"
    }
  }
}
```

---

## Quick Start

### For Skill Publishers

**1. Generate a signing key pair**:
```bash
ClosedClaw security skill keygen \
  --signer "Your Name" \
  --output ~/.ClosedClaw/keys/ \
  --add-to-keyring \
  --trust full
```

This creates:
- `~/.ClosedClaw/keys/skill-signing.key` (private key, keep secret!)
- `~/.ClosedClaw/keys/skill-signing.pub` (public key, distribute this)

**2. Sign your skill**:
```bash
ClosedClaw security skill sign \
  --skill ~/.ClosedClaw/skills/my-skill/SKILL.md \
  --key ~/.ClosedClaw/keys/skill-signing.key \
  --key-id <key-id> \
  --signer "Your Name"
```

This creates `SKILL.md.sig` alongside your skill file.

**3. Distribute**:
- Include both `SKILL.md` and `SKILL.md.sig` when sharing your skill
- Publish your public key (`skill-signing.pub`) so users can add it to their keyring

### For Skill Users

**1. Add publisher's public key**:
```bash
ClosedClaw security keys add \
  --key-id <publisher-key-id> \
  --public-key /path/to/publisher.pub \
  --signer "Publisher Name" \
  --trust full
```

**2. Configure security policy** (optional):
```bash
# Edit ~/.ClosedClaw/config.json5
{
  "skills": {
    "security": {
      "requireSignature": true,     # Block unsigned skills
      "promptOnUnsigned": true,     # Warn before installing unsigned
      "minTrustLevel": "full"       # Only accept full trust
    }
  }
}
```

**3. Install skills normally**:
```bash
ClosedClaw skills install my-skill

# Signatures are automatically verified!
# ✓ Signature verified for 'my-skill': Signed by Publisher Name (trust: full)
```

---

## Signature Format

Signature files (`.SKILL.md.sig`) use a simple text format:

```
Ed25519-SHA256
keyId: dGVzdC1rZXktaWQ=
signer: Publisher Name
timestamp: 2026-02-10T12:34:56.789Z
signature: bXkgc2lnbmF0dXJlIGRhdGE=
```

**Fields**:
- `keyId`: Base64-encoded key identifier (derived from public key)
- `signer`: Human-readable name of the publisher
- `timestamp`: ISO 8601 timestamp when signed
- `signature`: Base64-encoded Ed25519 signature

**Signature Covers**:
- Entire content of `SKILL.md` file
- SHA-256 hash of content
- Ed25519 signature of hash

---

## Key Generation

### Generate Key Pair

```bash
ClosedClaw security skill keygen --signer "Your Name"
```

**Options**:
- `--signer <name>` (required): Your name or organization
- `--output <dir>`: Save keys to directory (default: print to stdout)
- `--add-to-keyring`: Automatically add public key to your keyring
- `--trust <level>`: Trust level when adding (full/marginal, default: marginal)
- `--json`: JSON output for scripting

**Output** (if `--output` specified):
- `<dir>/skill-signing.key`: Private key (keep secret!)
- `<dir>/skill-signing.pub`: Public key (share this)
- Key ID and fingerprint printed to stdout

**Example**:
```bash
$ ClosedClaw security skill keygen \
    --signer "Alice Williams" \
    --output ~/.ClosedClaw/keys/ \
    --add-to-keyring \
    --trust full

Generated Ed25519 key pair:
Key ID: dGVzdC1rZXktaWQ=
Signer: Alice Williams

Private key: ~/.ClosedClaw/keys/skill-signing.key
Public key:  ~/.ClosedClaw/keys/skill-signing.pub

✓ Added to keyring with trust level: full
```

### Security Best Practices

**Private Key Storage**:
- ✅ Store on encrypted disk
- ✅ Back up to secure location (password manager, hardware key)
- ✅ Use file permissions: `chmod 600 skill-signing.key`
- ❌ Never commit to version control
- ❌ Never share or upload

**Public Key Distribution**:
- ✅ Publish on your website/GitHub profile
- ✅ Include in skill README
- ✅ Share via secure channels
- ✅ Include fingerprint for verification

**Key Rotation**:
- Generate new keys periodically (e.g., annually)
- Sign old skills with new key
- Transition period: both keys in keyring
- Revoke old keys after transition

---

## Signing Skills

### Sign a Skill

```bash
ClosedClaw security skill sign \
  --skill /path/to/SKILL.md \
  --key /path/to/private.key \
  --key-id <key-id> \
  --signer "Your Name"
```

**Options**:
- `--skill <path>` (required): Path to SKILL.md file
- `--key <path>` (required): Path to private key file
- `--key-id <id>` (required): Key ID from keygen
- `--signer <name>` (required): Your name or organization
- `--output <path>`: Custom signature file path (default: <skill>.sig)
- `--json`: JSON output for scripting

**Output**:
- Creates `<skill>.sig` alongside skill file
- Prints confirmation with key ID and signer

**Example**:
```bash
$ ClosedClaw security skill sign \
    --skill ~/.ClosedClaw/skills/weather/SKILL.md \
    --key ~/.ClosedClaw/keys/skill-signing.key \
    --key-id dGVzdC1rZXktaWQ= \
    --signer "Alice Williams"

✓ Signed skill: ~/.ClosedClaw/skills/weather/SKILL.md
  Signature:    ~/.ClosedClaw/skills/weather/SKILL.md.sig
  Key ID:       dGVzdC1rZXktaWQ=
  Signer:       Alice Williams
```

### Batch Signing

For repositories with multiple skills:

```bash
#!/bin/bash
KEY=~/.ClosedClaw/keys/skill-signing.key
KEY_ID="dGVzdC1rZXktaWQ="
SIGNER="Your Name"

for skill in ~/.ClosedClaw/skills/*/SKILL.md; do
  echo "Signing: $skill"
  ClosedClaw security skill sign \
    --skill "$skill" \
    --key "$KEY" \
    --key-id "$KEY_ID" \
    --signer "$SIGNER"
done
```

### Re-signing Skills

When you update a skill, re-sign it:

```bash
# Edit skill
vim ~/.ClosedClaw/skills/my-skill/SKILL.md

# Re-sign (overwrites old signature)
ClosedClaw security skill sign \
  --skill ~/.ClosedClaw/skills/my-skill/SKILL.md \
  --key ~/.ClosedClaw/keys/skill-signing.key \
  --key-id <key-id> \
  --signer "Your Name"
```

**Note**: Old signature will be overwritten. The new signature covers the updated content.

---

## Verification

### Automatic Verification

Signatures are automatically verified during skill installation:

```bash
ClosedClaw skills install my-skill
```

**Verification Steps**:
1. Check if `.sig` file exists alongside `SKILL.md`
2. Parse signature file
3. Look up public key in trusted keyring
4. Verify trust level meets minimum requirement
5. Cryptographically verify signature
6. Allow or block installation based on policy

**Success**:
```
✓ Signature verified for 'my-skill': Signed by Publisher Name (trust: full)
Installing my-skill...
```

**Unsigned** (with `promptOnUnsigned=true`):
```
⚠ Installing unsigned skill 'my-skill' (signatures not enforced)
Continue? (y/N)
```

**Blocked** (with `requireSignature=true`):
```
✗ Skill installation blocked: Signature required but not found. Install blocked by security policy.
```

**Untrusted Key**:
```
✗ Skill installation blocked: Signing key dGVzdC... not found in trusted keyring.
  Add with: ClosedClaw security keys add dGVzdC... <public-key-path>
```

**Insufficient Trust**:
```
✗ Skill installation blocked: Key trust level 'marginal' does not meet minimum 'full'.
  Update with: ClosedClaw security keys trust dGVzdC... --trust full
```

**Invalid Signature**:
```
✗ Skill installation blocked: Signature verification failed: Invalid signature
```

### Manual Verification

For debugging or auditing:

```bash
# Check keyring
ClosedClaw security keys list

# Verify specific key is trusted
ClosedClaw security keys list --key-id <key-id>

# Check signature file manually
cat ~/.ClosedClaw/skills/my-skill/SKILL.md.sig
```

---

## Configuration

Configure security policy in `~/.ClosedClaw/config.json5`:

```json5
{
  "skills": {
    "security": {
      // Block installation of unsigned skills
      "requireSignature": false,  // default
      
      // Prompt before installing unsigned skills (if requireSignature=false)
      "promptOnUnsigned": true,   // default
      
      // Minimum trust level required ("full" or "marginal")
      "minTrustLevel": "marginal" // default
    }
  }
}
```

### Security Policies

**Level 1: Permissive** (default for backward compatibility):
```json5
{
  "skills": { "security": {
    "requireSignature": false,
    "promptOnUnsigned": true,
    "minTrustLevel": "marginal"
  }}
}
```
- Allows unsigned skills with warning
- Accepts marginal or full trust
- Good for: development, personal use

**Level 2: Balanced**:
```json5
{
  "skills": { "security": {
    "requireSignature": false,
    "promptOnUnsigned": true,
    "minTrustLevel": "full"
  }}
}
```
- Allows unsigned with confirmation
- Requires full trust for signed skills
- Good for: mixed environments, gradual adoption

**Level 3: Strict** (recommended for production):
```json5
{
  "skills": { "security": {
    "requireSignature": true,
    "minTrustLevel": "full"
  }}
}
```
- Blocks unsigned skills
- Requires full trust
- Good for: production, enterprise, shared systems

**Level 4: Lockdown**:
```json5
{
  "skills": { "security": {
    "requireSignature": true,
    "minTrustLevel": "full"
  }}
}
```
Plus maintain minimal keyring (only essential publishers).

---

## Troubleshooting

### "Signature required but not found"

**Cause**: Skill is unsigned and `requireSignature=true`.

**Fix**:
1. Contact skill publisher for signed version
2. Or temporarily disable: `requireSignature: false`
3. Or sign it yourself if you trust the source

### "Signing key not found in trusted keyring"

**Cause**: Publisher's public key not in your keyring.

**Fix**:
```bash
# Get publisher's public key
# Then add to keyring:
ClosedClaw security keys add \
  --key-id <key-id-from-signature> \
  --public-key /path/to/publisher.pub \
  --signer "Publisher Name" \
  --trust full
```

### "Key trust level does not meet minimum"

**Cause**: Key is `marginal` but config requires `full`.

**Fix** (if you trust the publisher):
```bash
ClosedClaw security keys trust <key-id> --trust full
```

### "Signature verification failed"

**Causes**:
- Skill was modified after signing (tampering or accident)
- Signature file corrupted
- Wrong public key in keyring

**Fix**:
1. Re-download skill and signature from trusted source
2. Verify key ID matches signature
3. Contact publisher if problem persists

### "Skill installed but no verification log"

**Cause**: Signature verification skipped (config or missing .sig).

**Check**:
```bash
# Verify signature file exists
ls ~/.ClosedClaw/skills/my-skill/SKILL.md.sig

# Check config
cat ~/.ClosedClaw/config.json5 | grep -A3 security
```

---

## Advanced Topics

### Custom Signature Locations

```bash
# Sign with custom output path
ClosedClaw security skill sign \
  --skill my-skill/SKILL.md \
  --output my-skill/custom.sig \
  ...
```

**Note**: Verification expects `<skill>.sig` by default. Custom paths require manual verification.

### JSON Output for Automation

All commands support `--json` for scripting:

```bash
# Keygen
result=$(ClosedClaw security skill keygen --signer "Bot" --json)
key_id=$(echo "$result" | jq -r '.keyId')

# Sign
ClosedClaw security skill sign \
  --skill SKILL.md \
  --key bot.key \
  --key-id "$key_id" \
  --signer "Bot" \
  --json
```

### CI/CD Integration

```yaml
# .github/workflows/sign-skills.yml
name: Sign Skills

on:
  push:
    branches: [main]

jobs:
  sign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install ClosedClaw
        run: npm install -g ClosedClaw
      
      - name: Import signing key
        run: echo "${{ secrets.SKILL_SIGNING_KEY }}" > signing.key
      
      - name: Sign skills
        run: |
          for skill in skills/*/SKILL.md; do
            ClosedClaw security skill sign \
              --skill "$skill" \
              --key signing.key \
              --key-id "${{ secrets.KEY_ID }}" \
              --signer "${{ secrets.SIGNER }}"
          done
      
      - name: Commit signatures
        run: |
          git config user.name "CI Bot"
          git config user.email "bot@example.com"
          git add skills/**/*.sig
          git commit -m "Update skill signatures" || true
          git push
```

---

## FAQ

**Q: What if I lose my private key?**  
A: Generate a new key pair, re-sign all skills, distribute new public key. Old signatures become invalid.

**Q: Can I have multiple signing keys?**  
A: Yes. Use different keys for different purposes (e.g., personal vs organization). Users can add multiple public keys to their keyring.

**Q: How do I revoke a compromised key?**  
A: 1) Generate new key, 2) Re-sign all skills with new key, 3) Announce compromise, 4) Users remove old key from keyring.

**Q: Do signatures expire?**  
A: Not currently. Signatures remain valid indefinitely. Future versions may add expiration support.

**Q: What about skill dependencies?**  
A: Each skill is verified independently. If skill A depends on skill B, both need valid signatures.

**Q: Can I verify signatures without installing?**  
A: Manual verification isn't exposed as a command yet. File an issue if you need this feature.

**Q: Performance impact?**  
A: Negligible (~3-5ms per skill). Ed25519 verification is very fast.

---

## Security Considerations

**Threat Model**:

✅ **Protected Against**:
- Malicious unsigned skills
- Skill tampering/modification
- Untrusted publishers
- Impersonation attacks

❌ **Not Protected Against** (by design):
- Compromised signing keys (user must revoke)
- Social engineering (user adds malicious keys)
- Time-of-check-time-of-use races (skills are static files)
- Malicious signed skills (trust model assumes publisher is trustworthy)

**Best Practices**:
- Keep private keys secure (encrypted storage, backups)
- Verify key fingerprints when adding to keyring
- Use `full` trust sparingly (only for known-good publishers)
- Review skills before installation (signatures prove authenticity, not safety)
- Monitor keyring: `ClosedClaw security keys list`
- Enable strict policy for production: `requireSignature: true`

---

## See Also

- [Trusted Keyring](/security/trusted-keyring) - Key management guide
- [Security CLI](/cli/security) - Command reference
- [Gateway Security](/gateway/security) - Overall security
- [Skills Configuration](/gateway/configuration#skills) - Config reference
