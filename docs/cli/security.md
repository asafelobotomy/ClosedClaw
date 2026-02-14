---
summary: "CLI reference for `ClosedClaw security` (audit, skill signing, and key management)"
read_when:
  - You want to run a quick security audit on config/state
  - You want to sign or verify skills
  - You need to manage trusted keys
title: "security"
---

# `ClosedClaw security`

Security tools (audit, skill signing, and key management).

Related:

- Security guide: [Security](/gateway/security)
- Skill signing guide: [Skill Signing](/security/skill-signing)
- Key management guide: [Trusted Keyring](/security/trusted-keyring)

---

## Audit

```bash
ClosedClaw security audit
ClosedClaw security audit --deep
ClosedClaw security audit --fix
```

The audit warns when multiple DM senders share the main session and recommends `session.dmScope="per-channel-peer"` (or `per-account-channel-peer` for multi-account channels) for shared inboxes.
It also warns when small models (`<=300B`) are used without sandboxing and with web/browser tools enabled.

---

## Audit Log

Query and analyze the immutable audit log. Full guide: [Audit Logging](/security/audit-logging)

### Query Events

```bash
closedclaw security log query
closedclaw security log query --since 1h
closedclaw security log query --type tool_exec --failed-only
```

**Options**:

- `--type <types...>`: Filter by event type(s) (tool_exec, config_change, skill_install, etc.)
- `--severity <lvls...>`: Filter by severity (info, warn, error, critical)
- `--since <time>`: Start time (ISO or relative: 1h, 30m, 2d)
- `--until <time>`: End time (ISO or relative)
- `--actor <actor>`: Filter by actor (agent:main, cli:configure, etc.)
- `--session <session>`: Filter by session key pattern
- `--grep <pattern>`: Text search in summary/details
- `--failed-only`: Show only failed/blocked events
- `--limit <n>`: Maximum entries to return
- `--reverse`: Newest first
- `--json`: JSON output

### Statistics

```bash
closedclaw security log stats
closedclaw security log stats --verify
```

**Options**:

- `--verify`: Verify hash chain integrity
- `--json`: JSON output

### Export

```bash
closedclaw security log export --output audit.csv
closedclaw security log export --output audit.json --format json
```

**Options**:

- `--output <path>` (required): Output file path
- `--format <format>`: csv or json (default: csv)
- `--type <types...>`: Filter by event type(s)
- `--since <time>`: Start time
- `--until <time>`: End time

### Verify Integrity

```bash
closedclaw security log verify
```

Verifies the SHA-256 hash chain for tampering. Exits with code 1 if verification fails.

**Options**:

- `--json`: JSON output

---

## Keychain

Manage OS keychain integration for credential storage. Full guide: [Keychain](/security/keychain)

### Status

```bash
closedclaw security keychain status
closedclaw security keychain status --json
```

Check which keychain backend is active (macOS Keychain, Linux Secret Service, Windows Credential Manager, or encrypted-file fallback).

**Options**:

- `--json`: JSON output

**Example Output**:

```
Backend: macOS Keychain (via `security` CLI)
Available: yes
Tool: /usr/bin/security

Recommendations
  • Credentials are stored in macOS Keychain.app
  • Protected by your login password
  • Automatically locked when screen is locked
```

### Migrate

```bash
closedclaw security keychain migrate
closedclaw security keychain migrate --dry-run
```

Migrate credentials from JSON files in `~/.closedclaw/credentials/` to OS keychain.

**Options**:

- `--dry-run`: Show what would be migrated without making changes
- `--json`: JSON output

**Example Output**:

```
Migration Results

✓ Migrated: 5 credential(s)
○ Skipped:  1 credential(s) (malformed or missing fields)
✗ Failed:   0 credential(s)

Credentials successfully migrated to macOS Keychain
```

### List

```bash
closedclaw security keychain list
closedclaw security keychain list --json
```

List stored credentials. Only works with encrypted-file backend; native keychains don't support enumeration.

**Options**:

- `--json`: JSON output

**Example Output (File Backend)**:

```
Found 3 credential(s):

anthropic:
  • api-key (stored: 2/10/2026, 10:00:00 AM)
  • oauth-token

openai:
  • api-key
```

**Example Output (Native Keychain)**:

```
⚠️  Native keychains don't support enumeration.
Credentials are stored securely but cannot be listed via CLI.

To view credentials on macOS: open Keychain Access.app → search 'ClosedClaw'
```

---

## Skill Signing

Cryptographically sign skills using Ed25519 signatures.

### Generate Key Pair

```bash
ClosedClaw security skill keygen --signer "Your Name"
```

**Options**:

- `--signer <name>` (required): Your name or organization
- `--output <dir>`: Save keys to directory (prints to stdout if omitted)
- `--add-to-keyring`: Automatically add public key to your keyring
- `--trust <level>`: Trust level when adding (full/marginal, default: marginal)
- `--json`: JSON output for scripting

**Output** (with `--output`):

- `<dir>/skill-signing.key`: Private key (keep secret!)
- `<dir>/skill-signing.pub`: Public key (distribute this)

**Example**:

```bash
ClosedClaw security skill keygen \
  --signer "Alice Williams" \
  --output ~/.ClosedClaw/keys/ \
  --add-to-keyring \
  --trust full
```

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

**Example**:

```bash
ClosedClaw security skill sign \
  --skill ~/.ClosedClaw/skills/weather/SKILL.md \
  --key ~/.ClosedClaw/keys/skill-signing.key \
  --key-id dGVzdC1rZXktaWQ= \
  --signer "Alice Williams"
```

### Signature Verification

Signatures are automatically verified during `ClosedClaw skills install`.

**Success** (signed + trusted):

```
✓ Signature verified for 'my-skill': Signed by Publisher Name (trust: full)
```

**Warning** (unsigned):

```
⚠ Installing unsigned skill 'my-skill' (signatures not enforced)
```

**Blocked** (untrusted or invalid):

```
✗ Skill installation blocked: Signing key not found in trusted keyring
```

See [Skill Signing Guide](/security/skill-signing) for full documentation.

---

## Key Management

Manage trusted public keys for skill signature verification.

### List Keys

```bash
ClosedClaw security keys list
```

**Options**:

- `--trust <level>`: Filter by trust level (full/marginal)
- `--signer <name>`: Filter by signer name
- `--key-id <id>`: Filter by key ID
- `--json`: JSON output for scripting

**Example Output**:

```
Key ID              Signer               Trust     Added
──────────────────  ───────────────────  ────────  ──────────────────────
dGVzdC1rZXktaWQ=    ClosedClaw Official  full      2026-02-10T12:34:56Z
YW5vdGhlci1rZXk=    Alice Williams       marginal  2026-02-09T08:15:30Z
```

### Add Key

```bash
ClosedClaw security keys add \
  --key-id <key-id> \
  --public-key <path-or-pem> \
  --signer "Publisher Name" \
  --trust <level>
```

**Options**:

- `--key-id <id>` (required): Key identifier from publisher
- `--public-key <path>`: Path to public key file (PEM format)
- `--signer <name>` (required): Publisher name
- `--trust <level>`: Trust level (full/marginal, default: marginal)
- `--comment <text>`: Optional comment/note
- `--json`: JSON output

**Example**:

```bash
ClosedClaw security keys add \
  --key-id dGVzdC1rZXktaWQ= \
  --public-key ./publisher.pub \
  --signer "ClosedClaw Official" \
  --trust full
```

### Remove Key

```bash
ClosedClaw security keys remove <key-id>
```

### Change Trust Level

```bash
ClosedClaw security keys trust <key-id> --trust <level>
```

**Examples**:

```bash
# Upgrade to full trust
ClosedClaw security keys trust dGVzdC1rZXktaWQ= --trust full

# Downgrade to marginal
ClosedClaw security keys trust dGVzdC1rZXktaWQ= --trust marginal
```

See [Trusted Keyring Guide](/security/trusted-keyring) for full documentation.

---

## See Also

- [Skill Signing Guide](/security/skill-signing) - Complete signing workflow
- [Trusted Keyring Guide](/security/trusted-keyring) - Key management details
- [Gateway Security](/gateway/security) - Overall security architecture
- [Configuration](/gateway/configuration#skills-security) - Security config options
