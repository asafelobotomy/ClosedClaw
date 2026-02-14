---
summary: "CLI reference for `ClosedClaw onboard` (interactive onboarding wizard)"
read_when:
  - You want guided setup for gateway, workspace, auth, channels, and skills
title: "onboard"
---

# `ClosedClaw onboard`

Interactive onboarding wizard (local or remote Gateway setup).

Related:

- Wizard guide: [Onboarding](/start/onboarding)

## Examples

```bash
ClosedClaw onboard
ClosedClaw onboard --flow quickstart
ClosedClaw onboard --flow express
ClosedClaw onboard --flow manual
ClosedClaw onboard --mode remote --remote-url ws://gateway-host:18789
ClosedClaw onboard --dry-run            # simulate without writing config
```

Flow notes:

- `express`: fastest path; keeps gateway defaults, skips channels/skills/hooks/shell completion, still asks for auth + hatch.
- `quickstart`: minimal prompts, auto-generates a gateway token.
- `manual`: full prompts for port/bind/auth (alias of `advanced`).
- Fastest first chat: `ClosedClaw dashboard` (Control UI, no channel setup).
