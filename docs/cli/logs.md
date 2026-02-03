---
summary: "CLI reference for `ClosedClaw logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `ClosedClaw logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
ClosedClaw logs
ClosedClaw logs --follow
ClosedClaw logs --json
ClosedClaw logs --limit 500
```
