---
summary: "Immutable audit logging for forensic-grade security event recording"
read_when:
  - Need to track security-relevant operations
  - Investigating suspicious activity
  - Compliance requirements for audit trails
  - Understanding tool execution history
title: "Audit Logging"
---

# Audit Logging

ClosedClaw provides **immutable append-only audit logging** for all security-relevant operations. The audit log creates a tamper-evident record of critical events with SHA-256 hash chains for integrity verification.

## Quick Start

### View Recent Events

```bash
# Show last 10 events
closedclaw security log query --limit 10 --reverse

# Show events from the last hour
closedclaw security log query --since 1h

# Show only failed tool executions
closedclaw security log query --type tool_exec --failed-only
```

### Check Log Statistics

```bash
# View audit log stats
closedclaw security log stats

# Verify integrity
closedclaw security log verify
```

### Export for Analysis

```bash
# Export to CSV for spreadsheet analysis
closedclaw security log export --output audit-report.csv --format csv

# Export to JSON for programmatic processing
closedclaw security log export --output audit-report.json --format json
```

## What Gets Logged

The audit log records these event types:

### Tool Execution (`tool_exec`)
- **Bash/shell commands** - Every command executed via tools
- **File operations** - Reads, writes, edits
- **Network requests** - HTTP fetches, API calls
- **Tool parameters** - Full context of tool invocations
- **Exit codes** - Success/failure status
- **Execution duration** - Performance tracking

###  Configuration Changes (`config_change`)
- **Config file writes** - Any modification to `~/.closedclaw/config.json5`
- **Keys modified** - Which settings changed
- **Actor** - Who made the change (CLI, Gateway, API)  

### Skill Installation (`skill_install`, `skill_uninstall`)
- **Skill ID and path**
- **Signature verification** - Whether skill was signed and verified
- **Signer identity** - Publisher who signed the skill
- **Trust level** - From trusted keyring

### Credential Access (`credential_access`)
- **Read/write/delete operations**
- **Service and account** - Which credentials accessed
- **Actor** - Agent or user requesting access

### Channel Messages (`channel_send`)
- **Outbound messages** - Destination channel and recipient
- **Message type** - Text, image, etc.
- **Session context** - Which agent sent the message

### Network Egress (`egress_blocked`, `egress_allowed`)
- **Blocked requests** - URLs denied by egress policy
- **Allowed requests** - (Optional) URLs permitted
- **Reason** - Why request was blocked

### Authentication (`auth_event`)
- **Login/logout** - OAuth flows
- **Token refresh** - Credential updates
- **Provider** - Anthropic, OpenAI, etc.

### Sessions (`session_event`)
- **Session creation** - New agent conversations
- **Session timeout** - Automatic cleanup
- **Session keys** - Full routing context

### Security Alerts (`security_alert`)
- **Sandbox escape attempts** - Path traversal, breakout attempts
- **Policy violations** - DM policy, egress policy
- **Integrity failures** - Config tampering, signature failures

### Gateway Events (`gateway_event`)
- **Start/stop** - Gateway lifecycle
- **Config reload** - SIGUSR1 hot-reload
- **Crashes** - Unexpected terminations

## Audit Log Format

### File Location
```
~/.closedclaw/audit.log
```

### Format: JSONL (JSON Lines)
One event per line for streaming reads and append-only writes:

```json
{"seq":1,"ts":"2026-02-10T15:30:00.000Z","type":"tool_exec","severity":"info","summary":"Tool: bash | Command: echo hello","details":{"tool":"bash","command":"echo hello","result":"success","exitCode":0},"actor":"agent:main","session":"agent:main:whatsapp:dm:+1234567890","prevHash":"0000000000000000000000000000000000000000000000000000000000000000","hash":"a3f2..."}
{"seq":2,"ts":"2026-02-10T15:31:00.000Z","type":"config_change","severity":"info","summary":"Config update: ~/.closedclaw/config.json5","details":{"action":"update","path":"~/.closedclaw/config.json5",keys:["gateway.port"]},"actor":"cli:configure","prevHash":"a3f2...","hash":"b4e1..."}
```

### Entry Schema

| Field | Type | Description |
|-------|------|-------------|
| `seq` | number | Monotonically increasing sequence number |
| `ts` | string | ISO 8601 timestamp |
| `type` | string | Event type (see above) |
| `severity` | string | `info`, `warn`, `error`, or `critical` |
| `summary` | string | Human-readable one-line description |
| `details` | object | Type-specific structured data |
| `actor` | string | Who triggered the event (optional) |
| `session` | string | Session key (optional) |
| `channel` | string | Channel name (optional) |
| `prevHash` | string | SHA-256 hash of previous entry |
| `hash` | string | SHA-256 hash of this entry |

## Hash Chain Integrity

Each log entry includes:
- **`prevHash`**: SHA-256 of the previous entry
- **`hash`**: SHA-256 of this entry (computed from all other fields)

This creates a **tamper-evident blockchain-style chain**:
```
Entry 1 (genesis) → Entry 2 → Entry 3 → Entry 4 → ...
   hash: a3f2        ↑         ↑          ↑
                  prevHash   prevHash   prevHash
```

**Detection**: If any entry is modified or deleted, the hash chain breaks and verification fails.

**Verification**:
```bash
closedclaw security log verify
```

Output:
```
✓ Audit log integrity verified
All hash chains are valid. No tampering detected.
```

## Querying the Audit Log

### Filter by Event Type

```bash
# Show only tool executions
closedclaw security log query --type tool_exec

# Show config changes and skill installs
closedclaw security log query --type config_change skill_install
```

**Available types**: `tool_exec`, `config_change`, `skill_install`, `skill_uninstall`, `credential_access`, `channel_send`, `egress_blocked`, `egress_allowed`, `auth_event`, `session_event`, `security_alert`, `gateway_event`, `upstream_sync`

### Filter by Severity

```bash
# Show only critical and error events
closedclaw security log query --severity critical error

# Show warnings and above
closedclaw security log query --severity warn error critical
```

### Filter by Time Range

**Relative time** (recommended for recent events):
```bash
# Last hour
closedclaw security log query --since 1h

# Last 30 minutes
closedclaw security log query --since 30m

# Last 7 days
closedclaw security log query --since 7d

# Between 1 hour ago and 30 minutes ago
closedclaw security log query --since 1h --until 30m
```

**Absolute time** (ISO 8601):
```bash
closedclaw security log query --since 2026-02-10T00:00:00Z
closedclaw security log query --until 2026-02-11T00:00:00Z
```

### Filter by Actor

```bash
# Show events from specific agent
closedclaw security log query --actor agent:main

# Show CLI commands
closedclaw security log query --actor cli:configure
```

### Filter by Session

```bash
# Show events from specific session
closedclaw security log query --session "agent:main:whatsapp:dm:+1234567890"
```

### Text Search

```bash
# Grep for specific commands
closedclaw security log query --grep "rm -rf"

# Search for URLs
closedclaw security log query --grep "https://example.com"
```

### Failed Events Only

```bash
# Show only failures
closedclaw security log query --failed-only

# Failed tool executions in the last hour
closedclaw security log query --type tool_exec --failed-only --since 1h
```

### Limit and Order

```bash
# Show last 10 events (newest first)
closedclaw security log query --limit 10 --reverse

# Show first 50 events
closedclaw security log query --limit 50
```

### JSON Output

```bash
# Machine-readable output
closedclaw security log query --since 1h --json
```

## Statistics and Analysis

### View Statistics

```bash
closedclaw security log stats
```

Output:
```
Audit Log Statistics

Log path:      ~/.closedclaw/audit.log
Total entries: 1,234
File size:     512.3 KB
First entry:   2026-02-01 10:00:00
Last entry:    2026-02-10 15:30:00

By Event Type
tool_exec               842
config_change            23
skill_install            15
credential_access        89
...

By Severity
critical                  2
error                     8
warn                     45
info                  1,179

Integrity check: ✓ OK
```

### Verify Integrity

```bash
closedclaw security log verify
```

Checks the entire hash chain for tampering. Exits with code 1 if verification fails.

### Export for Analysis

**CSV format** (Excel, Google Sheets):
```bash
closedclaw security log export --output audit-report.csv --format csv
```

**JSON format** (scripts, data analysis):
```bash
closedclaw security log export --output audit-report.json --format json
```

**Filtered exports**:
```bash
# Export only critical events
closedclaw security log export --output critical.csv --type security_alert --severity critical

# Export recent tool executions
closedclaw security log export --output tools-today.json --type tool_exec --since 1d
```

## Integration with Other Systems

### SIEM Integration

Export to JSON and ingest into your SIEM:
```bash
# Daily export cron job
0 0 * * * closedclaw security log export --output /var/log/closedclaw/audit-$(date +\%Y-\%m-\%d).json --since 1d
```

### Compliance Reporting

Generate compliance reports for auditors:
```bash
# Last 30 days of security events
closedclaw security log export --output compliance-report.csv --since 30d --type security_alert credential_access
```

### Monitoring and Alerts

Check for critical events:
```bash
#!/bin/bash
# Alert on critical severity events in last 5 minutes
CRITICAL=$(closedclaw security log query --severity critical --since 5m --json | jq '. | length')
if [ "$CRITICAL" -gt 0 ]; then
  echo "ALERT: $CRITICAL critical security events detected"
  # Send notification
fi
```

## Security Considerations

### Log Integrity

- **Hash chain** prevents undetected tampering
- **Append-only** prevents deletion of individual entries
- **Sequence numbers** detect missing entries
- **Timestamps** provide chronological ordering

### Log Tampering Detection

If someone modifies the log file:
1. Hash chain breaks at the modified entry
2. `closedclaw security log verify` fails
3. Alerts you to potential compromise

**Example**: If entry #100 is modified, entries #101+ will have invalid `prevHash` values.

### Log Rotation

Audit logs can grow large over time. Implement rotation:

```bash
# Logrotate configuration example
cp ~/.closedclaw/audit.log ~/.closedclaw/audit-$(date +%Y-%m-%d).log
> ~/.closedclaw/audit.log  # Truncate but keep file
```

**Note**: Rotating breaks the hash chain between files. Keep old logs immutable for integrity.

### Access Control

Protect audit logs with restrictive permissions:
```bash
chmod 600 ~/.closedclaw/audit.log
```

Only the ClosedClaw process user should have write access.

### Encryption at Rest

Audit logs currently store plaintextin JSONL format. For sensitive environments:

1. **Filesystem encryption** - Use encrypted home directory or LUKS
2. **Encrypted backup** - Tar + GPG before backup:
   ```bash
   tar czf - ~/.closedclaw/audit*.log | gpg -e -r your@email.com > audit-backup.tar.gz.gpg
   ```

## Best Practices

### Regular Verification

Add to your monitoring:
```bash
# Cron: verify integrity daily
0 2 * * * closedclaw security log verify || echo "ALERT: Audit log integrity failure"
```

### Retention Policy

Define how long to keep audit logs:
```bash
# Keep 90 days, rotate monthly
0 0 1 * * find ~/.closedclaw/audit-*.log -mtime +90 -delete
```

### Investigation Workflow

When investigating incidents:

1. **Identify time window**:
   ```bash
   closedclaw security log query --since "2026-02-10T15:00:00Z" --until "2026-02-10T16:00:00Z"
   ```

2. **Filter by severity**:
   ```bash
   closedclaw security log query --severity critical error --since 1h
   ```

3. **Trace session**:
   ```bash
   closedclaw security log query --session "agent:main:whatsapp:dm:+1234567890"
   ```

4. **Export for deep analysis**:
   ```bash
   closedclaw security log export --output incident.json --since 2h
   ```

### Performance Impact

Audit logging is designed for minimal overhead:
- **Async writes** - Non-blocking log appends
- **Buffered I/O** - Batch writes to disk
- **Sequential access** - No random seeks

Typical overhead: **< 1ms per event**.

## Troubleshooting

### Audit Log Not Found

```
Audit log not found: ~/.closedclaw/audit.log
No audit events have been recorded yet.
```

**Cause**: No events logged yet. 
**Solution**: Run some commands to generate events, or check that you're using the correct state directory.

### Integrity Verification Failed

```
✗ Audit log integrity failure
Audit log integrity failure at entry #123: expected hash a3f2…, got b4e1…
```

**Causes**:
- Manual modification of audit log
- Filesystem corruption
- Incomplete writes

**Investigation**:
1. Check file permissions: `ls -l ~/.closedclaw/audit.log`
2. Review system logs for disk errors
3. If tampered, consider system compromise

### Performance Issues

If audit logging slows down the system:
1. Check disk I/O: `iostat -x 1`
2. Verify file system not full: `df -h`
3. Consider SSD for state directory
4. Implement log rotation

## Programmatic Access

### Node.js Example

```typescript
import { AuditLogger, readAuditLog, queryAuditLog } from "closedclaw/security/audit-logger";

// Read all entries
const entries = await readAuditLog("~/.closedclaw/audit.log");

// Query with filters
const recentTools = await queryAuditLog("~/.closedclaw/audit.log", {
  types: ["tool_exec"],
  since: new Date(Date.now() - 3600_000), // Last hour
  limit: 100,
});

// Iterate and process
for (const entry of recentTools) {
  console.log(`[${entry.ts}] ${entry.summary}`);
  if (entry.severity === "critical") {
    // Alert on critical events
  }
}
```

### Python Example

```python
import json
from datetime import datetime, timedelta

# Read JSONL audit log
def read_audit_log(path):
    with open(path, 'r') as f:
        for line in f:
            yield json.loads(line)

# Query recent failures
cutoff = datetime.now() - timedelta(hours=1)
for entry in read_audit_log("~/.closedclaw/audit.log"):
    ts = datetime.fromisoformat(entry['ts'].replace('Z', '+00:00'))
    if ts > cutoff and entry.get('details', {}).get('result') == 'failure':
        print(f"Failed: {entry['summary']}")
```

## Configuration

Audit logging is **always enabled** and requires no configuration. It automatically:
- Creates `~/.closedclaw/audit.log` on first event
- Initializes hash chain with genesis entry
- Maintains integrity across restarts

Future configuration options (*not yet implemented*):
- `audit.retention.days` - Auto-delete old entries
- `audit.rotation.sizeMb` - Rotate at file size
- `audit.verbosity` - Control event types logged

## See Also

- [Security Overview](/gateway/security) - Broader security model
- [Skill Signing](/security/skill-signing) - Cryptographic skill verification  
- [Trusted Keyring](/security/trusted-keyring) - Key management for signatures
- [Security Audit](/cli/security) - Config/state security audit
- [Doctor Command](/gateway/doctor) - System diagnostics

## FAQ

**Q: Can I disable audit logging?**  
A: No. Audit logging is a core security feature and cannot be disabled. It's designed for minimal overhead (< 1ms per event).

**Q: How much disk space does the audit log use?**  
A: Typical usage: ~50-100 KB per 1000 events. A busy system might use 1-2 MB/day. Implement log rotation for long-term use.

**Q: Are credentials logged?**  
A: No. Only the fact that credentials were accessed (service/account name), never the actual secret values.

**Q: Can I delete specific entries?**  
A: No. The log is append-only. Deleting entries breaks the hash chain and is detectable via verification.

**Q: What if the disk fills up?**  
A: Audit logging will fail gracefully and log errors, but won't crash the Gateway. Monitor disk space and implement rotation.

**Q: How long should I keep audit logs?**  
A: Depends on compliance requirements. Common: 90 days (operational), 1 year (compliance), 7 years (financial).

**Q: Can I encrypt the audit log?**  
A: Not currently built-in. Use filesystem-level encryption (LUKS, encrypted home directory) or encrypt backups with GPG.

**Q: How do I share logs with auditors?**  
A: Export to CSV for readability:
```bash
closedclaw security log export --output audit-report.csv --since 30d
```

**Q: What if I suspect tampering?**  
A: Run `closedclaw security log verify`. If it fails, treat as potential compromise and investigate immediately.
