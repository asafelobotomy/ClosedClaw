---
summary: "Managing trusted public keys for skill signature verification"
read_when:
  - You need to add a publisher's public key
  - You want to list or manage trusted keys
  - You need to change trust levels
title: "Trusted Keyring"
---

# Trusted Keyring

**Purpose**: The trusted keyring stores public keys of skill publishers you trust, enabling signature verification before installation.

**Location**: `~/.ClosedClaw/security/trusted-keyring.json`

Related:

- [Skill Signing](/security/skill-signing) - Signing guide
- [Security CLI](/cli/security) - Command reference
- [Gateway Security](/gateway/security) - Overall security guide

---

## Overview

The **trusted keyring** is a local database of public keys that ClosedClaw uses to verify skill signatures. When you install a signed skill, ClosedClaw checks if the signing key is in your keyring and has sufficient trust.

### Trust Model

**Trust Levels**:

- **full**: Fully trusted publisher (official skills, verified organizations)
- **marginal**: Partially trusted publisher (community contributors, individuals)

**None** (not in keyring): Untrusted, signatures will be rejected.

**Trust Hierarchy**:

```
full > marginal > (not in keyring)
```

**Configuration Controls**:

- `skills.security.minTrustLevel`: "full" or "marginal" (default)
- Install blocked if signer's trust < minimum

---

## Quick Reference

### Common Tasks

**List all trusted keys**:

```bash
ClosedClaw security keys list
```

**Add a key from file**:

```bash
ClosedClaw security keys add \
  --key-id <key-id> \
  --public-key /path/to/publisher.pub \
  --signer "Publisher Name" \
  --trust full
```

**Change trust level**:

```bash
ClosedClaw security keys trust <key-id> --trust full
```

**Remove a key**:

```bash
ClosedClaw security keys remove <key-id>
```

**Find a specific key**:

```bash
ClosedClaw security keys list --key-id <key-id>
```

---

## Key Management

### List Keys

```bash
ClosedClaw security keys list
```

**Output** (table format):

```
Key ID              Signer               Trust     Added
──────────────────  ───────────────────  ────────  ──────────────────────
dGVzdC1rZXktaWQ=    ClosedClaw Official  full      2026-02-10T12:34:56Z
YW5vdGhlci1rZXk=    Alice Williams       marginal  2026-02-09T08:15:30Z
```

**Options**:

- `--trust <level>`: Filter by trust level (full/marginal)
- `--signer <name>`: Filter by signer name
- `--key-id <id>`: Filter by key ID
- `--json`: JSON output for scripting

**Examples**:

```bash
# List only full-trust keys
ClosedClaw security keys list --trust full

# Find keys by signer
ClosedClaw security keys list --signer "Alice"

# JSON for scripting
ClosedClaw security keys list --json | jq '.keys[] | .keyId'
```

### Add Key

Add a publisher's public key to your keyring:

```bash
ClosedClaw security keys add \
  --key-id <key-id> \
  --public-key <path-or-pem> \
  --signer "Publisher Name" \
  --trust <level>
```

**Options**:

- `--key-id <id>` (required): Key identifier (from publisher)
- `--public-key <path>`: Path to public key file (PEM format)
- `--public-key <pem>`: Or inline PEM string
- `--signer <name>` (required): Publisher name
- `--trust <level>`: Trust level (full/marginal, default: marginal)
- `--comment <text>`: Optional comment/note
- `--json`: JSON output

**From file**:

```bash
ClosedClaw security keys add \
  --key-id dGVzdC1rZXktaWQ= \
  --public-key ./publisher.pub \
  --signer "ClosedClaw Official" \
  --trust full \
  --comment "Official ClosedClaw skills"
```

**Inline PEM**:

```bash
ClosedClaw security keys add \
  --key-id dGVzdC1rZXktaWQ= \
  --public-key "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----" \
  --signer "Alice Williams" \
  --trust marginal
```

**Validation**:

- Key ID format checked
- PEM format validated
- Duplicate key IDs rejected
- Key must be valid Ed25519 public key

**Error Handling**:

```bash
# Duplicate key
Error: Key dGVzdC... already exists in keyring

# Invalid PEM
Error: Invalid public key format

# Missing required field
Error: --signer is required
```

### Remove Key

Remove a key from your keyring:

```bash
ClosedClaw security keys remove <key-id>
```

**Options**:

- `--force`: Don't fail if key doesn't exist
- `--json`: JSON output

**Examples**:

```bash
# Remove by key ID
ClosedClaw security keys remove dGVzdC1rZXktaWQ=

# Force removal (no error if missing)
ClosedClaw security keys remove dGVzdC1rZXktaWQ= --force
```

**Safety**:

- Removing a key doesn't uninstall skills signed by that key
- Skills signed by removed keys will fail verification on next install/update
- You can re-add the same key later

**Confirmation**:

```
✓ Removed key: dGVzdC1rZXktaWQ=
  Signer: Alice Williams
```

### Change Trust Level

Update the trust level of an existing key:

```bash
ClosedClaw security keys trust <key-id> --trust <level>
```

**Options**:

- `--trust <level>` (required): New trust level (full/marginal)
- `--json`: JSON output

**Examples**:

```bash
# Upgrade to full trust
ClosedClaw security keys trust dGVzdC1rZXktaWQ= --trust full

# Downgrade to marginal
ClosedClaw security keys trust dGVzdC1rZXktaWQ= --trust marginal
```

**Use Cases**:

- Publisher proves trustworthiness → upgrade to `full`
- Concerns about publisher → downgrade to `marginal`
- Temporary trust adjustment for testing

**Output**:

```
✓ Updated trust level for key: dGVzdC1rZXktaWQ=
  Signer: Alice Williams
  Old trust: marginal
  New trust: full
```

---

## Keyring File Format

**Location**: `~/.ClosedClaw/security/trusted-keyring.json`

**Format** (JSON):

```json
{
  "version": 1,
  "keys": [
    {
      "keyId": "dGVzdC1rZXktaWQ=",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
      "signer": "ClosedClaw Official",
      "trustLevel": "full",
      "addedAt": "2026-02-10T12:34:56.789Z",
      "comment": "Official ClosedClaw skills"
    },
    {
      "keyId": "YW5vdGhlci1rZXk=",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
      "signer": "Alice Williams",
      "trustLevel": "marginal",
      "addedAt": "2026-02-09T08:15:30.123Z"
    }
  ]
}
```

**Fields**:

- `version`: Schema version (currently 1)
- `keys[]`: Array of trusted keys
  - `keyId`: Base64-encoded key identifier
  - `publicKeyPem`: Ed25519 public key in PEM format
  - `signer`: Human-readable publisher name
  - `trustLevel`: "full" or "marginal"
  - `addedAt`: ISO 8601 timestamp
  - `comment` (optional): User note

**Permissions**:

```bash
# Should be user-only read/write
chmod 600 ~/.ClosedClaw/security/trusted-keyring.json
```

**Manual Editing**:

- ⚠️ Not recommended (use CLI commands instead)
- If needed, validate JSON after editing
- Restart gateway to reload: `ClosedClaw gateway --reset`

---

## Trust Management

### When to Use "full" Trust

**Full Trust** means:

- You completely trust this publisher
- Skills from this publisher can have elevated privileges
- You'd run their code with minimal review

**Grant "full" trust to**:

- Official ClosedClaw project skills
- Verified organizations (with public audit trail)
- Well-known open-source projects
- Publishers you personally know and trust

**Example Policy**:

```json5
{
  skills: {
    security: {
      minTrustLevel: "full", // Only full-trust publishers allowed
    },
  },
}
```

### When to Use "marginal" Trust

**Marginal Trust** means:

- You cautiously trust this publisher
- Skills should be reviewed before installation
- You trust them for specific use cases

**Grant "marginal" trust to**:

- Community contributors
- Individual developers
- New or unverified publishers
- Skills you want to test

**Example Policy**:

```json5
{
  skills: {
    security: {
      minTrustLevel: "marginal", // Accept marginal or full (default)
    },
  },
}
```

### Trust Level Transitions

**Upgrade** (marginal → full):

```bash
ClosedClaw security keys trust <key-id> --trust full
```

**Reasons to upgrade**:

- Publisher demonstrates reliability over time
- Skills pass security audits
- Publisher gains community reputation
- Organization becomes verified

**Downgrade** (full → marginal):

```bash
ClosedClaw security keys trust <key-id> --trust marginal
```

**Reasons to downgrade**:

- Security concerns arise
- Publisher behavior changes
- Temporary caution during investigation

**Remove** (any → none):

```bash
ClosedClaw security keys remove <key-id>
```

**Reasons to remove**:

- Key compromised
- Publisher no longer trusted
- Cleaning up unused keys

---

## Security Best Practices

### Key Verification

**Always verify key fingerprints** when adding new keys:

1. Publisher announces key via trusted channel (website, GitHub, etc.)
2. Publisher includes key fingerprint/hash
3. You compute fingerprint:
   ```bash
   # SHA-256 of public key
   sha256sum publisher.pub
   ```
4. Compare hashes match
5. Add to keyring if match

**Verification Channels** (in order of preference):

1. In-person exchange (strongest)
2. Video call with screen share
3. Publisher's verified website (HTTPS + known domain)
4. GitHub profile (verified account)
5. Signed email (PGP/S/MIME)
6. Public announcement (Twitter, Discord, etc.)

### Regular Audits

**Monthly Review**:

```bash
ClosedClaw security keys list
```

**Questions to ask**:

- Do I still trust these publishers?
- Are there unused keys to remove?
- Should any trust levels change?
- Are there new publishers to add?

**Automation**:

```bash
# List keys older than 1 year
ClosedClaw security keys list --json | \
  jq '.keys[] | select(
    (now - (.addedAt | fromdateiso8601)) > 31536000
  )'
```

### Minimal Keyring

**Principle**: Only trust what you need.

**Good**:

- 5-10 keys (official + essential community)
- All keys actively used
- Clear trust level rationale

**Bad**:

- 50+ keys "just in case"
- Blindly adding keys without verification
- Full trust for everyone

**Cleanup**:

```bash
# Find unused keys (no skills from this signer)
for key in $(ClosedClaw security keys list --json | jq -r '.keys[].keyId'); do
  signer=$(ClosedClaw security keys list --key-id "$key" --json | jq -r '.keys[0].signer')
  count=$(find ~/.ClosedClaw/skills -name "*.sig" -exec grep -l "signer: $signer" {} \; | wc -l)
  if [ $count -eq 0 ]; then
    echo "Unused key: $key ($signer)"
  fi
done
```

### Backup and Restore

**Backup keyring**:

```bash
cp ~/.ClosedClaw/security/trusted-keyring.json \
   ~/backups/keyring-$(date +%Y%m%d).json
```

**Restore keyring**:

```bash
cp ~/backups/keyring-20260210.json \
   ~/.ClosedClaw/security/trusted-keyring.json
ClosedClaw gateway --reset  # Reload
```

**Sync across devices**:

```bash
# Device 1 -> Device 2
scp user@device1:~/.ClosedClaw/security/trusted-keyring.json \
    ~/.ClosedClaw/security/trusted-keyring.json
```

**Version Control** (for teams):

```bash
# Create team keyring repo
git init team-keyring
cd team-keyring
cp ~/.ClosedClaw/security/trusted-keyring.json .
git add trusted-keyring.json
git commit -m "Initial keyring"
git push

# Team members clone and use
git clone https://github.com/team/team-keyring.git
cp team-keyring/trusted-keyring.json ~/.ClosedClaw/security/
```

---

## Troubleshooting

### "Key already exists in keyring"

**Cause**: Trying to add a key ID that's already present.

**Fix**:

```bash
# Check existing key
ClosedClaw security keys list --key-id <key-id>

# Remove and re-add
ClosedClaw security keys remove <key-id>
ClosedClaw security keys add ...

# Or update trust level instead
ClosedClaw security keys trust <key-id> --trust full
```

### "Invalid public key format"

**Cause**: Public key file is not valid PEM format.

**Fix**:

```bash
# Verify PEM format
cat publisher.pub
# Should start with: -----BEGIN PUBLIC KEY-----
# Should end with:   -----END PUBLIC KEY-----

# Re-export from private key if you have it
openssl pkey -in private.key -pubout -out public.pub

# Or ask publisher for correct format
```

### "Key not found in trusted keyring"

**Cause**: Signature references a key ID that's not in your keyring.

**Fix**:

```bash
# Extract key ID from signature
cat skill/SKILL.md.sig | grep keyId

# Contact publisher for their public key
# Then add to keyring
ClosedClaw security keys add \
  --key-id <key-id-from-signature> \
  --public-key <publisher-key> \
  --signer "Publisher Name" \
  --trust marginal
```

### Keyring File Missing

**Cause**: First time using signatures, or keyring deleted.

**Fix**:

```bash
# Create security directory
mkdir -p ~/.ClosedClaw/security

# Add first key (creates keyring automatically)
ClosedClaw security keys add ...
```

### Keyring Permissions Error

**Cause**: File permissions too open.

**Fix**:

```bash
chmod 600 ~/.ClosedClaw/security/trusted-keyring.json
chmod 700 ~/.ClosedClaw/security
```

---

## Advanced Topics

### Programmatic Access

**Read keyring** (JSON):

```bash
ClosedClaw security keys list --json
```

**Output Schema**:

```json
{
  "keys": [
    {
      "keyId": "string",
      "signer": "string",
      "trustLevel": "full" | "marginal",
      "addedAt": "ISO-8601",
      "comment": "string (optional)"
    }
  ]
}
```

**Example** (find all full-trust keys):

```bash
ClosedClaw security keys list --json | \
  jq '.keys[] | select(.trustLevel == "full") | .keyId'
```

### Migration from Old Keyring

If you have keys in a different format:

```bash
#!/bin/bash
# migrate-keyring.sh

# Assume old format: one key per file in ~/.ClosedClaw/keys/trusted/
for pubkey in ~/.ClosedClaw/keys/trusted/*.pub; do
  keyid=$(basename "$pubkey" .pub)
  signer=$(cat "$pubkey.info" 2>/dev/null || echo "Unknown")

  ClosedClaw security keys add \
    --key-id "$keyid" \
    --public-key "$pubkey" \
    --signer "$signer" \
    --trust marginal
done
```

### Team Keyring Management

For teams sharing a keyring:

**Setup** (team admin):

```bash
# Create team keyring
mkdir team-keyring
cd team-keyring

# Add team-approved publishers
ClosedClaw security keys add --key-id ... --trust full ...

# Export
cp ~/.ClosedClaw/security/trusted-keyring.json ./trusted-keyring.json

# Commit
git init
git add trusted-keyring.json
git commit -m "Team keyring v1"
git remote add origin git@github.com:team/keyring.git
git push -u origin main
```

**Usage** (team members):

```bash
# Clone team keyring
git clone git@github.com:team/keyring.git ~/team-keyring

# Install
cp ~/team-keyring/trusted-keyring.json \
   ~/.ClosedClaw/security/trusted-keyring.json

# Update periodically
cd ~/team-keyring
git pull
cp trusted-keyring.json ~/.ClosedClaw/security/
ClosedClaw gateway --reset
```

---

## FAQ

**Q: Can I have multiple keyrings?**  
A: No, only one keyring per installation. Use trust levels to differentiate publishers.

**Q: What happens if I accidentally remove a key?**  
A: Installed skills still work, but you can't verify signatures for future installs/updates. Re-add the key if needed.

**Q: Can I export individual keys?**  
A: Use `--json` and `jq`:

```bash
ClosedClaw security keys list --key-id <id> --json | \
  jq '.keys[0]'
```

**Q: How do I share my keyring with someone?**  
A: Copy `~/.ClosedClaw/security/trusted-keyring.json` to them. They should verify key fingerprints.

**Q: Can I add expired keys?**  
A: Keys don't have expiration dates currently. This may change in future versions.

**Q: What if a key is compromised?**  
A: Remove it immediately: `ClosedClaw security keys remove <key-id>`. Contact publisher for new key.

**Q: Can I import keys from GPG/SSH?**  
A: Not directly. ClosedClaw uses Ed25519 keys in specific format. Convert if possible or use publisher's official key.

---

## See Also

- [Skill Signing](/security/skill-signing) - How to sign and verify skills
- [Security CLI](/cli/security) - Full command reference
- [Gateway Security](/gateway/security) - Overall security architecture
- [Configuration](/gateway/configuration#skills-security) - Security config options
