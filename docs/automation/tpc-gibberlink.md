---
summary: "TPC (Tonal Pulse Communication) architecture and configuration"
read_when:
  - Working with TPC or acoustic agent-to-agent transport
  - Configuring ClawTalk 2.1 transport modes
  - Debugging TPC fallback to text
title: "TPC (GibberLink-style Acoustic Transport)"
---

# TPC: Tonal Pulse Communication

TPC is ClawTalk's default agent-to-agent transport layer. It encodes CT/1 wire-format messages into AFSK-modulated audio (WAV files), signs them with Ed25519, and exchanges them through a dead-drop file system. Text-based ClawTalk is the **fallback**, not the default.

## Architecture

```
Agent A                               Agent B
  │                                      │
  ├─ CT/1 payload (REQ/RES/TASK/...)     │
  ├─ TPC Envelope (nonce, timestamp)     │
  ├─ Ed25519 signature                   │
  ├─ Reed-Solomon FEC (GF(2^8))          │
  ├─ AFSK modulation (Bell 202)          │
  ├─ WAV file                            │
  ├────► dead-drop/inbox/agent-b/ ───────►│
  │                                      ├─ WAV decode (Goertzel)
  │                                      ├─ RS error correction
  │                                      ├─ Signature verification
  │                                      ├─ Nonce replay check
  │                                      ├─ Freshness check
  │                                      └─ CT/1 dispatch
```

### Transport Modes

| Mode | Carriers | Baud | Use Case |
|------|----------|------|----------|
| `ultrasonic` | 18/20 kHz | 150 | Inaudible; hardware-dependent |
| `audible` | 1.2/2.4 kHz | 300 | Bell 202; works everywhere |
| `file` | N/A | N/A | Dead-drop only; no audio I/O |
| `auto` | Probe-selected | Varies | Hardware detection at startup |

### Security Layers

1. **Ed25519 signing** — every envelope is cryptographically signed
2. **Nonce-based replay prevention** — 128-bit random nonces tracked in a JSON store
3. **Freshness check** — envelopes expire after a configurable window (default: 5 min)
4. **HMAC-SHA256 fallback** — when Ed25519 keys are unavailable
5. **Circuit breaker** — dead-drop failures trip to BLOCKED state (not silent text fallback)
6. **Key rotation** — scheduled rotation with grace period for old+new keys
7. **Per-agent rate limiting** — sliding window counters prevent flooding
8. **JSONL audit logging** — every operation recorded for forensic analysis

## Configuration

Add TPC settings to your ClawTalk config:

```json5
{
  "clawtalk": {
    "tpc": {
      "enabled": true,
      "mode": "auto",                    // "auto" | "ultrasonic" | "audible" | "file"
      "enforceForAgentToAgent": true,     // Block agent-to-agent text; TPC only
      "allowTextFallback": false,         // Global text fallback toggle
      "deadDropPath": "~/.closedclaw/tpc/dead-drop",
      "maxMessageAge": 300                // Seconds before envelope expires
    }
  }
}
```

### Per-Agent Text Fallback

Individual agent profiles can override the global setting:

```json5
{
  "agents": {
    "conversation": {
      "allowTextFallback": true    // Human-facing agent uses text
    },
    "research": {
      "allowTextFallback": false   // Agent-to-agent: TPC only
    }
  }
}
```

## Hardware Detection

On startup with `mode: "auto"`, TPC runs Python probes to detect audio hardware:

1. **sweep.py** — generates 17-22 kHz chirp, measures loopback SNR
2. **analyze.py** — detailed frequency response and noise floor analysis
3. **send.py** — transmits calibration packets via speaker
4. **recv.py** — receives via microphone, computes Packet Error Rate (PER)
5. **decide.py** — selects mode based on SNR/PER thresholds

### Decision Thresholds

| Condition | Mode Selected |
|-----------|--------------|
| SNR >= 20 dB AND PER <= 5% | `ultrasonic` |
| SNR >= 10 dB AND PER <= 20% | `audible` |
| Otherwise | `file` |

Results are cached for 24 hours at `~/.closedclaw/tpc/hardware-profile.json`.

**Dependencies**: `pip install numpy sounddevice` (optional; file mode works without them).

## Dead-Drop Transport

Messages are exchanged via the filesystem:

```
~/.closedclaw/tpc/dead-drop/
  inbox/
    agent-a/       # Messages waiting for agent-a
    agent-b/
  outbox/
    agent-a/       # Messages sent by agent-a
  archive/         # Processed messages
```

Each message is a WAV file containing the AFSK-encoded signed envelope.

## Circuit Breaker

The circuit breaker prevents silent degradation to text when the dead-drop fails:

- **CLOSED** — normal operation, messages flow through dead-drop
- **OPEN** — dead-drop failing; messages are **blocked** (NOT silently sent as text)
- **HALF-OPEN** — recovery probe; next message attempts dead-drop

Thresholds: 5 consecutive failures within 60s trips the breaker. Recovery after 30s.

## Audit Logging

TPC writes structured JSONL logs to `~/.closedclaw/tpc/audit/tpc-audit-YYYY-MM-DD.jsonl`:

```json
{"ts":"2026-02-14T10:30:00.000Z","event":"tpc.encode","severity":"info","source":"agent-a","target":"agent-b","messageId":"...","nonce":"...","transport":"tpc"}
{"ts":"2026-02-14T10:30:01.000Z","event":"tpc.decode","severity":"info","source":"agent-a","target":"agent-b","verified":true,"transport":"tpc"}
{"ts":"2026-02-14T10:30:02.000Z","event":"tpc.replay_detected","severity":"security","nonce":"duplicate-nonce"}
```

## Troubleshooting

### TPC not activating for agent-to-agent messages

1. Check `clawtalk.tpc.enabled` is `true` in config
2. Check `mode` is not `"file"` if you expect audio
3. Run `python3 src/agents/clawtalk/tpc/probes/sweep.py --check-only` to verify audio devices
4. Check `~/.closedclaw/tpc/audit/` logs for `tpc.fallback` events

### Circuit breaker tripped (messages blocked)

1. Check dead-drop directory permissions: `ls -la ~/.closedclaw/tpc/dead-drop/`
2. Check disk space: `df -h ~/.closedclaw/`
3. Check audit logs for `tpc.circuit_breaker` events with `state: "open"`
4. Manually reset by restarting the gateway

### Signature verification failing

1. Check key files exist: `ls ~/.closedclaw/tpc/keys/`
2. Verify key rotation state: `cat ~/.closedclaw/tpc/keys/rotation-state.json`
3. Check audit logs for `tpc.verify_failed` events
4. If keys are corrupted, delete the keys directory and restart (new keys will be generated)
