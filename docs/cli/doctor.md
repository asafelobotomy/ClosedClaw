---
summary: "CLI reference for `ClosedClaw doctor` (health checks + guided repairs)"
read_when:
  - You have connectivity/auth issues and want guided fixes
  - You updated and want a sanity check
title: "doctor"
---

# `ClosedClaw doctor`

Health checks + quick fixes for the gateway and channels.

Related:

- Troubleshooting: [Troubleshooting](/gateway/troubleshooting)
- Security audit: [Security](/gateway/security)

## Examples

```bash
ClosedClaw doctor
ClosedClaw doctor --repair
ClosedClaw doctor --deep
```

Notes:

- Interactive prompts (like keychain/OAuth fixes) only run when stdin is a TTY and `--non-interactive` is **not** set. Headless runs (cron, Telegram, no terminal) will skip prompts.
- `--fix` (alias for `--repair`) writes a backup to `~/.ClosedClaw/ClosedClaw.json.bak` and drops unknown config keys, listing each removal.

## macOS: `launchctl` env overrides

If you previously ran `launchctl setenv ClosedClaw_GATEWAY_TOKEN ...` (or `...PASSWORD`), that value overrides your config file and can cause persistent “unauthorized” errors.

```bash
launchctl getenv ClosedClaw_GATEWAY_TOKEN
launchctl getenv ClosedClaw_GATEWAY_PASSWORD

launchctl unsetenv ClosedClaw_GATEWAY_TOKEN
launchctl unsetenv ClosedClaw_GATEWAY_PASSWORD
```
