---
summary: "RPC adapters for external CLIs (archived platforms documented for reference)"
read_when:
  - Understanding RPC integration patterns (Signal and iMessage platforms were removed in v2026.2.12)
  - Historical reference for external CLI integration
title: "RPC Adapters (Archive)"
---

# RPC adapters

ClosedClaw previously integrated external CLIs via JSON-RPC. These patterns are documented for historical reference.

> **Note**: Signal and iMessage platforms were removed in v2026.2.12. The following RPC patterns are archived.

## Pattern A: HTTP daemon (signal-cli) — Archive

- `signal-cli` runs as a daemon with JSON-RPC over HTTP.
- Event stream is SSE (`/api/v1/events`).
- Health probe: `/api/v1/check`.
- ClosedClaw owns lifecycle when `channels.signal.autoStart=true`.

See archive documentation for setup and endpoints.

## Pattern B: stdio child process (imsg) — Archive

- ClosedClaw spawned `imsg rpc` as a child process.
- JSON-RPC is line-delimited over stdin/stdout (one JSON object per line).
- No TCP port, no daemon required.

Core methods used:

- `watch.subscribe` → notifications (`method: "message"`)
- `watch.unsubscribe`
- `send`
- `chats.list` (probe/diagnostics)

See [iMessage](/channels/imessage) for setup and addressing (`chat_id` preferred).

## Adapter guidelines

- Gateway owns the process (start/stop tied to provider lifecycle).
- Keep RPC clients resilient: timeouts, restart on exit.
- Prefer stable IDs (e.g., `chat_id`) over display strings.
