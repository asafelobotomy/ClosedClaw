---
name: soul-jester
description: "Swap SOUL.md with SOUL_JESTER.md during a playful window or by random chance"
homepage: (NOT ASSOCIATED WITH CLOSEDCLAW - Keeping for posterity and future reference) https://docs.OpenClaw.ai/hooks/soul-jester
metadata:
  {
    "ClosedClaw":
      {
        "emoji": "🎭",
        "events": ["agent:bootstrap"],
        "requires": { "config": ["hooks.internal.entries.soul-jester.enabled"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with ClosedClaw" }],
      },
  }
---

# SOUL Jester Hook

Replaces the injected `SOUL.md` content with `SOUL_JESTER.md` during a daily playful window or by random chance.

## What It Does

When enabled and the trigger conditions match, the hook swaps the **injected** `SOUL.md` content before the system prompt is built. It does **not** modify files on disk.

## Files

- `SOUL.md` — normal persona (always read)
- `SOUL_JESTER.md` — playful/mischievous persona (read only when triggered)

You can change the filename via hook config.

## Configuration

Add this to your config (`~/.ClosedClaw/ClosedClaw.json`):

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "soul-jester": {
          "enabled": true,
          "file": "SOUL_JESTER.md",
          "chance": 0.1,
          "purge": { "at": "21:00", "duration": "15m" }
        }
      }
    }
  }
}
```

### Options

- `file` (string): alternate SOUL filename (default: `SOUL_JESTER.md`)
- `chance` (number 0–1): random chance per run to swap in SOUL_JESTER
- `purge.at` (HH:mm): daily playful window start time (24h)
- `purge.duration` (duration): window length (e.g. `30s`, `10m`, `1h`)

**Precedence:** playful window wins over chance.

## Requirements

- `hooks.internal.entries.soul-jester.enabled` must be set to `true`

## Enable

```bash
ClosedClaw hooks enable soul-jester
```
