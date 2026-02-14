# OS Keychain Integration

ClosedClaw integrates with your operating system's native keychain to securely store credentials (API keys, OAuth tokens, passwords) instead of plaintext JSON files. This provides better security, leverages OS-level encryption, and integrates with platform security features like screen lock.

---

## Quick Start

```bash
# Check your keychain backend
closedclaw security keychain status

# Migrate existing credentials from JSON files
closedclaw security keychain migrate

# List stored credentials (file backend only)
closedclaw security keychain list
```

---

## Supported Platforms

### macOS

- **Backend**: Keychain.app
- **CLI Tool**: `/usr/bin/security`
- **Protection**: Protected by login password, locked with screen lock
- **Access**: View via Keychain Access.app (search for "ClosedClaw")

### Linux

- **Backend**: Secret Service API (GNOME Keyring, KWallet)
- **CLI Tool**: `secret-tool` (from `libsecret-tools` package)
- **Protection**: Protected by keyring password
- **Access**: `seahorse` (GNOME) or `kwalletmanager` (KDE)
- **Installation**: `sudo apt install libsecret-tools` (Debian/Ubuntu)

### Windows

- **Backend**: Credential Manager
- **CLI Tool**: `cmdkey` (built-in)
- **Protection**: Protected by Windows user account
- **Access**: Control Panel → Credential Manager

### Fallback (All Platforms)

- **Backend**: Encrypted file store
- **Location**: `~/.closedclaw/credentials/`
- **Protection**: Files encrypted at rest (Priority 3)
- **When Used**: No OS keychain detected or headless environment

---

## Command Reference

### `closedclaw security keychain status`

Check which keychain backend is being used and whether it's available.

**Options**:

- `--json` - Output as JSON

**Example**:

```bash
$ closedclaw security keychain status
Keychain Status

Backend: macOS Keychain (via `security` CLI)
Available: yes
Tool: /usr/bin/security

Recommendations
  • Credentials are stored in macOS Keychain.app
  • Protected by your login password
  • Automatically locked when screen is locked

Next Steps
Migrate credentials: closedclaw security keychain migrate
List credentials: closedclaw security keychain list
```

**JSON Output**:

```json
{
  "backend": "macos-keychain",
  "available": true,
  "description": "macOS Keychain via `security` CLI",
  "toolPath": "/usr/bin/security"
}
```

---

### `closedclaw security keychain migrate`

Migrate credentials from plaintext JSON files in `~/.closedclaw/credentials/` to the OS keychain (or encrypted file store).

**Options**:

- `--dry-run` - Show what would be migrated without making changes
- `--json` - Output as JSON

**Expected JSON Format**:
Plaintext credential files should have this structure:

```json
{
  "namespace": "anthropic",
  "identifier": "api-key",
  "secret": "sk-ant-..."
}
```

**Example**:

```bash
$ closedclaw security keychain migrate
Keychain Migration

Backend: macOS Keychain (via `security` CLI)

Migration Results

✓ Migrated: 5 credential(s)
○ Skipped:  1 credential(s) (malformed or missing fields)
✗ Failed:   0 credential(s)

Credentials successfully migrated to macOS Keychain (via `security` CLI)

Next Steps
Original JSON files are still in ~/.closedclaw/credentials/
Consider removing them once you've verified migration worked:
  rm -rf ~/.closedclaw/credentials/*.json
```

**Dry Run**:

```bash
$ closedclaw security keychain migrate --dry-run
Running in dry-run mode (no files will be modified)
```

---

### `closedclaw security keychain list`

List stored credentials. Only works with the encrypted-file backend; native OS keychains don't support credential enumeration via CLI.

**Options**:

- `--json` - Output as JSON

**Example (File Backend)**:

```bash
$ closedclaw security keychain list
Stored Credentials

Backend: Encrypted file store (no OS keychain available)

Found 3 credential(s):

anthropic:
  • api-key (stored: 2/10/2026, 10:00:00 AM)
  • oauth-token (stored: 2/10/2026, 11:00:00 AM)

openai:
  • api-key (stored: 2/9/2026, 3:45:00 PM)
```

**Example (Native Keychain)**:

```bash
$ closedclaw security keychain list
Stored Credentials

Backend: macOS Keychain (via `security` CLI)

⚠️  Native keychains don't support enumeration.
Credentials are stored securely but cannot be listed via CLI.

To view credentials on macOS: open Keychain Access.app → search 'ClosedClaw'
To view credentials on Linux: seahorse (GNOME) or kwalletmanager (KDE)
To view credentials on Windows: Control Panel → Credential Manager
```

---

## Programmatic Usage

### Store a Credential

```typescript
import { storeCredential } from "closedclaw/security/keychain";

await storeCredential("anthropic", "api-key", "sk-ant-...");
```

### Retrieve a Credential

```typescript
import { getCredential } from "closedclaw/security/keychain";

const apiKey = await getCredential("anthropic", "api-key");
if (apiKey) {
  console.log("Found API key");
} else {
  console.log("No API key stored");
}
```

### Delete a Credential

```typescript
import { deleteCredential } from "closedclaw/security/keychain";

const deleted = await deleteCredential("anthropic", "api-key");
console.log(deleted ? "Deleted" : "Not found");
```

### Detect Backend

```typescript
import { detectKeychainBackend } from "closedclaw/security/keychain";

const info = await detectKeychainBackend();
console.log(`Using: ${info.backend}`);
console.log(`Available: ${info.available}`);
```

### Migrate Credentials

```typescript
import { migrateCredentials } from "closedclaw/security/keychain";

const result = await migrateCredentials();
console.log(`Migrated: ${result.migrated}`);
console.log(`Failed: ${result.failed}`);
if (result.errors.length > 0) {
  console.error("Errors:", result.errors);
}
```

---

## Security Considerations

### macOS Keychain

- **Access Control**: Credentials are protected by macOS access control lists (ACLs)
- **User Consent**: First access may prompt for user consent
- **Screen Lock**: Keychain locks automatically when screen is locked
- **Recovery**: Lost password = lost credentials (no recovery possible)

### Linux Secret Service

- **Keyring Password**: Separate from login password (set on first use)
- **Auto-unlock**: Can be configured to unlock on login
- **Backend Variety**: GNOME Keyring, KWallet, etc. (depends on desktop environment)
- **Headless**: May not work in SSH sessions without X11 forwarding

### Windows Credential Manager

- **User-Specific**: Credentials tied to Windows user account
- **Domain Integration**: Can sync with Active Directory in enterprise environments
- **BitLocker**: Enhanced protection when BitLocker is enabled
- **Admin Access**: Local administrators can access other users' credentials

### Encrypted File Fallback

- **Encryption**: AES-256-GCM (from Priority 3)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **File Permissions**: chmod 600 (readable only by owner)
- **Location**: `~/.closedclaw/credentials/`

---

## Design Decisions

### Why CLI Tools Instead of Native Bindings?

ClosedClaw uses native CLI tools (`security`, `secret-tool`, `cmdkey`) instead of native Node.js bindings (e.g., `keytar`, `@napi-rs/keyring`) for several reasons:

1. **No Native Compilation**: Avoids platform-specific build dependencies and native module compilation
2. **Simpler Installation**: Works with any Node.js installation without node-gyp or Rust toolchain
3. **Stability**: CLI tools are part of the OS and rarely change APIs
4. **Security Auditing**: Easier to audit shell commands than FFI calls
5. **Fallback Simplicity**: Graceful degradation to encrypted files when tools are missing

**Trade-off**: Slightly slower (process spawning overhead) but negligible for credential operations.

### Service Name Format

All ClosedClaw credentials use the service prefix `ClosedClaw` and account format `<namespace>:<identifier>`:

- **Service**: `ClosedClaw:anthropic`
- **Account**: `api-key`

This makes credentials easy to find in native keychain UIs (search for "ClosedClaw").

### Encrypted File Fallback

The fallback to encrypted files ensures ClosedClaw works in:

- **Headless servers**: No window system, no keychain daemon
- **Docker containers**: Isolated environments without host keychain access
- **CI/CD pipelines**: Automated environments where keychains aren't available
- **Missing dependencies**: Linux systems without `libsecret-tools` installed

Files are encrypted using the same infrastructure as Priority 3 (Memory Storage Encryption).

---

## Migration Workflow

### Step 1: Check Current Backend

```bash
closedclaw security keychain status
```

If using encrypted-file on a desktop, consider installing OS keychain tools:

- **Linux**: `sudo apt install libsecret-tools`
- **macOS**: Built-in (always available)
- **Windows**: Built-in (always available)

### Step 2: Dry Run (Optional)

```bash
closedclaw security keychain migrate --dry-run
```

This shows what would be migrated without making changes.

### Step 3: Migrate

```bash
closedclaw security keychain migrate
```

Review the output. Credentials are copied to the keychain; original JSON files remain.

### Step 4: Verify

Test that ClosedClaw still works:

```bash
closedclaw doctor
closedclaw channels status
```

If everything works, the migration succeeded.

### Step 5: Cleanup (Optional)

Remove original JSON files:

```bash
rm -rf ~/.closedclaw/credentials/*.json
```

**Warning**: Ensure migration succeeded before deleting. Once deleted, credentials cannot be recovered from files.

---

## Troubleshooting

### Problem: `secret-tool` not found (Linux)

**Symptom**:

```
Backend: Encrypted file store (no OS keychain available)
```

**Solution**:
Install `libsecret-tools`:

```bash
# Debian/Ubuntu
sudo apt install libsecret-tools

# Fedora
sudo dnf install libsecret

# Arch
sudo pacman -S libsecret
```

After installation, re-run status check:

```bash
closedclaw security keychain status
```

---

### Problem: macOS keychain prompts repeatedly

**Symptom**: macOS asks for keychain password on every credential access.

**Solution**:

1. Open Keychain Access.app
2. Find "ClosedClaw" entries
3. Double-click → Access Control tab
4. Add `/usr/local/bin/node` (or wherever Node.js is installed) to allowed applications
5. Check "Always allow access by these applications"

---

### Problem: Migration shows "skipped" or "failed"

**Symptom**:

```
○ Skipped:  3 credential(s) (malformed or missing fields)
```

**Cause**: JSON files don't have required fields (`namespace`, `identifier`, `secret`).

**Solution**:
Check file structure. Example of correct format:

```json
{
  "namespace": "anthropic",
  "identifier": "api-key",
  "secret": "sk-ant-..."
}
```

Files must be valid JSON with all three fields.

---

### Problem: Cannot list credentials on native keychain

**Symptom**:

```
⚠️  Native keychains don't support enumeration.
```

**Cause**: This is expected behavior. macOS Keychain, Linux Secret Service, and Windows Credential Manager don't expose CLI-based credential listing (for security reasons).

**Solution**: Use native GUI tools:

- **macOS**: Keychain Access.app → search "ClosedClaw"
- **Linux**: `seahorse` (GNOME) or `kwalletmanager` (KDE)
- **Windows**: Control Panel → Credential Manager → Generic Credentials

---

### Problem: Headless server can't access keychain

**Symptom**: Keychain operations fail in SSH session or Docker container.

**Cause**: No keychain daemon running in headless environment.

**Solution**: This is expected. ClosedClaw automatically falls back to encrypted-file backend. Verify:

```bash
closedclaw security keychain status
# Should show: Backend: Encrypted file store
```

No action needed; encrypted files provide security in headless environments.

---

## Best Practices

### 1. Migrate Early

Run migration immediately after installing ClosedClaw:

```bash
closedclaw security keychain migrate
```

This moves credentials to the most secure storage available on your platform.

### 2. Use Native Keychains on Desktops

Encrypted files are secure, but native keychains provide:

- Integration with screen lock
- OS-level access control
- Biometric unlock (Touch ID, Windows Hello)
- Centralized credential management

### 3. Verify After Migration

Always test ClosedClaw functionality after migrating:

```bash
closedclaw doctor
closedclaw channels status
```

If tests fail, credentials may not have migrated correctly.

### 4. Don't Mix Backends

Avoid manually editing `~/.closedclaw/credentials/` JSON files after migrating to native keychain. ClosedClaw checks keychain first; leftover files may cause confusion.

### 5. Backup Keychain (macOS)

macOS keychains are backed up to Time Machine. If using FileVault, keychain is encrypted. No additional backup needed.

### 6. Set Keyring Password (Linux)

On first use, Linux Secret Service will prompt for a keyring password. Use a strong password; it protects all secrets.

### 7. Headless Servers: Use Encrypted Files

Don't try to force native keychains in Docker/SSH. The encrypted-file backend is designed for headless environments and provides adequate security.

---

## Platform-Specific Notes

### macOS

**Inode Exhaustion (Old Keychains)**:
Very old macOS systems (pre-10.15) may have inode limits on keychain files. Modern systems (10.15+) don't have this issue.

**Touch ID Integration**:
ClosedClaw doesn't directly use Touch ID, but macOS Keychain can be configured to require Touch ID for credential access (System Settings → Touch ID & Password).

**Multiple Keychains**:
ClosedClaw stores credentials in the login keychain (default). If you use multiple keychains, credentials go to the active login keychain.

### Linux

**Desktop Environment Dependency**:

- **GNOME**: Uses GNOME Keyring (automatic)
- **KDE**: Uses KWallet (automatic)
- **Other DEs**: May need manual keyring daemon setup

**SSH Sessions**:
Secret Service requires a graphical session. In SSH:

```bash
export $(dbus-launch)
```

This starts a D-Bus session for Secret Service, but may still fail without X11.

**Snap/Flatpak**:
Containerized apps may not access Secret Service. Use encrypted-file fallback.

### Windows

**Roaming Profiles**:
In enterprise environments with roaming profiles, credentials sync across machines (potential security risk if network is untrusted).

**Credential Backup**:
Windows Credential Manager is not backed up by default. Use `cmdkey /export` or third-party tools.

**UAC Prompts**:
First-time credential storage may trigger User Account Control (UAC) prompts.

---

## Credential Format

### Namespace

The `namespace` groups related credentials. Common namespaces:

- `anthropic` - Anthropic API keys and tokens
- `openai` - OpenAI API keys
- `github` - GitHub tokens
- `slack` - Slack bot tokens
- `telegram` - Telegram bot tokens
- `discord` - Discord tokens

Use lowercase, dash-separated names: `my-service`, not `My Service`.

### Identifier

The `identifier` distinguishes multiple credentials within a namespace:

- `api-key` - Primary API key
- `oauth-token` - OAuth access token
- `refresh-token` - OAuth refresh token
- `bot-token` - Bot authentication token

Use lowercase, dash-separated names.

### Secret

The actual credential value. Can be:

- API keys: `sk-ant-...`, `sk-...`
- OAuth tokens: `xoxb-...`, `Bearer ...`
- Passwords: Any string
- JSON blobs: Stringified JSON (e.g., `{"access":"...","refresh":"..."}`)

**Max Length**: Typically 4096 bytes (varies by backend). Long JSON blobs may hit limits.

---

## FAQ

### Q: Can I use multiple backends simultaneously?

**A**: No. ClosedClaw auto-detects and uses one backend per platform. You can override via programmatic API (`opts.backend`), but mixing backends is not recommended.

### Q: What happens if I delete credentials from the OS keychain manually?

**A**: ClosedClaw will behave as if credentials were never stored. You'll need to re-authenticate or provide API keys again.

### Q: Are credentials shared between ClosedClaw instances?

**A**: Yes, if running under the same OS user account. All ClosedClaw instances (CLI, Gateway, macOS app) share the same keychain credentials.

### Q: Can I export credentials for backup?

**A**: Native keychains don't expose export. For backup:

- **macOS**: Time Machine backs up keychains automatically
- **Linux**: Backup `~/.local/share/keyrings/` or use `secret-tool` to extract
- **Windows**: Use `cmdkey /list` + `cmdkey /export`
- **File Backend**: Copy `~/.closedclaw/credentials/` (encrypted files)

### Q: What if I forget my keyring password (Linux)?

**A**: You'll lose access to all secrets in that keyring. Consider setting keyring to auto-unlock on login (security trade-off) or keep separate keyring for ClosedClaw.

### Q: Can I disable keychain and force file storage?

**A**: Yes, via programmatic API:

```typescript
await storeCredential("ns", "id", "secret", { backend: "encrypted-file" });
```

But no CLI flag exists (by design; use OS keychain when available).

### Q: Does migration delete original JSON files?

**A**: No. Migration copies credentials to keychain; original files remain. You must manually delete them (`rm ~/.closedclaw/credentials/*.json`) after verifying migration succeeded.

### Q: What's the overhead of keychain operations?

**A**: ~5-20ms per operation (process spawn + CLI execution). Negligible for typical use (hundreds of ops/day). For high-frequency access, cache credentials in memory.

### Q: Can I use ClosedClaw without keychain on macOS/Windows?

**A**: Yes. Set environment variable to force fallback (not officially supported):

```bash
export CLOSEDCLAW_KEYCHAIN_BACKEND=encrypted-file
```

---

## Related Documentation

- [Security Overview](/gateway/security) - Broader security model
- [Encryption (Priority 3)](/security/encryption) - Encrypted file store details
- [Audit Logging (Priority 6)](/security/audit-logging) - Credential access logging
- [CLI Security Reference](/cli/security) - All security commands

---

## Summary

ClosedClaw's OS keychain integration provides:

- ✅ **Native Security**: Leverages platform keychains (macOS, Linux, Windows)
- ✅ **Automatic Fallback**: Gracefully degrades to encrypted files
- ✅ **Simple Migration**: One-command migration from JSON files
- ✅ **Cross-Platform**: Works consistently across all platforms
- ✅ **No Native Compilation**: Uses CLI tools, not native bindings

**Get Started**:

```bash
closedclaw security keychain status
closedclaw security keychain migrate
```

Your credentials are now stored in the most secure location available on your platform.
