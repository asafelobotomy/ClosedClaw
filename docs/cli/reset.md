---
summary: "CLI reference for `ClosedClaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `ClosedClaw reset`

Reset local config/state (keeps the CLI installed).

```bash
ClosedClaw reset
ClosedClaw reset --dry-run
ClosedClaw reset --scope config+creds+sessions --yes --non-interactive
```
