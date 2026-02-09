---
summary: "SOUL Jester hook (swap SOUL.md with SOUL_JESTER.md)"
read_when:
  - You want to enable or tune the SOUL Jester hook
  - You want a playful window or random-chance persona swap
title: "SOUL Jester Hook"
---

# SOUL Jester Hook

The SOUL Jester hook swaps the **injected** `SOUL.md` content with `SOUL_JESTER.md` during
a playful window or by random chance. It does **not** modify files on disk.

## How It Works

When `agent:bootstrap` runs, the hook can replace the `SOUL.md` content in memory
before the system prompt is assembled. If `SOUL_JESTER.md` is missing or empty,
ClosedClaw logs a warning and keeps the normal `SOUL.md`.

Sub-agent runs do **not** include `SOUL.md` in their bootstrap files, so this hook
has no effect on sub-agents.

## Enable

```bash
ClosedClaw hooks enable soul-jester
```

Then set the config:

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

Create `SOUL_JESTER.md` in the agent workspace root (next to `SOUL.md`).

## Options

- `file` (string): alternate SOUL filename (default: `SOUL_JESTER.md`)
- `chance` (number 0–1): random chance per run to use `SOUL_JESTER.md`
- `purge.at` (HH:mm): daily playful window start (24-hour clock)
- `purge.duration` (duration): window length (e.g. `30s`, `10m`, `1h`)

**Precedence:** playful window wins over chance.

**Timezone:** uses `agents.defaults.userTimezone` when set; otherwise host timezone.

## Notes

- No files are written or modified on disk.
- If `SOUL.md` is not in the bootstrap list, the hook does nothing.
- Use this for testing playful/mischievous personas or A/B testing agent personalities.

## See Also

- [Hooks](/hooks)
