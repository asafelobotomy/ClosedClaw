---
summary: "RPC adapters for external CLIs (archived platforms documented for reference)"
read_when:
  - Historical reference for external CLI integration (legacy platforms removed in v2026.2.12)
title: "RPC Adapters (Archive)"
---

# RPC adapters

ClosedClaw previously integrated external CLIs via JSON-RPC. These patterns are documented for historical reference only; the corresponding platforms were removed in v2026.2.12.

## Pattern A: HTTP daemon — Archive

- Legacy daemon exposed JSON-RPC over HTTP (with SSE events and health checks).
- ClosedClaw owned lifecycle when enabled.

## Pattern B: stdio child process — Archive

- Legacy child process emitted line-delimited JSON-RPC over stdin/stdout.
- No TCP port, no daemon required.

Core methods used (historical): `watch.subscribe`, `watch.unsubscribe`, `send`, `chats.list`.

## Adapter guidelines

- Gateway owns the process (start/stop tied to provider lifecycle).
- Keep RPC clients resilient: timeouts, restart on exit.
- Prefer stable IDs (e.g., `chat_id`) over display strings.
