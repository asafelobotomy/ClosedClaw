# TPC Implementation Notes

Technical implementation details, design decisions, and threat model for Tonal Pulse Communication.

## Design Decisions

### Why AFSK over modern digital modulation?

Bell 202 AFSK was chosen because:

- **Simplicity**: Two tones (1200/2400 Hz) with standard UART framing. No complex DSP stack.
- **Robustness**: 50+ years of proven reliability in telephony, packet radio, and fax.
- **Hardware-agnostic**: Works with any speaker/microphone capable of audible frequencies.
- **Goertzel demodulation**: Single-frequency power detection is computationally trivial.

The ultrasonic variant (18/20 kHz) trades audibility for stealth while keeping the same modulation scheme.

### Why dead-drop over direct RPC?

File-based message exchange (dead-drop) was chosen over direct IPC because:

- **Security boundary**: No shared memory or sockets between agents.
- **Auditable**: Every message is a WAV file that can be archived and forensically analyzed.
- **Process isolation**: Agents can run in different containers/VMs.
- **Resilience**: Messages persist across agent restarts — no lost-in-flight.
- **Simplicity**: No connection management, heartbeat, or reconnection logic.

### Why default-on TPC (inverted security model)?

The user directive was: "TPC should be the default communication, all other communication being a fallback."

This means `shouldFallbackToText()` is the decision function (not `shouldUseTPC()`). The security model is fail-closed:

- Agent-to-agent messages default to TPC (acoustic/file)
- Text-based CT/1 requires explicit `allowTextFallback: true` in the agent profile
- Human-facing agents (conversation) explicitly opt into text fallback
- The circuit breaker blocks messages rather than silently degrading to text

## Threat Model

### Threats mitigated by TPC

| Threat                                   | Mitigation                                                  |
| ---------------------------------------- | ----------------------------------------------------------- |
| Prompt injection via shared text context | CT/1 payloads are AFSK-encoded, not stored as readable text |
| Message tampering                        | Ed25519 signatures on every envelope                        |
| Replay attacks                           | 128-bit random nonces tracked in persistent store           |
| Stale/delayed messages                   | Timestamp freshness check (configurable window)             |
| Silent text degradation                  | Circuit breaker blocks rather than falls back               |
| Key compromise                           | Automatic key rotation with grace period                    |
| Agent flooding                           | Per-agent sliding window rate limiter                       |
| Forensic gaps                            | JSONL audit logging of every TPC operation                  |

### Threats NOT mitigated by TPC

| Threat                             | Status                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| Side-channel timing analysis       | Not addressed (future work)                                    |
| Physical audio eavesdropping       | Ultrasonic mode reduces risk but not eliminated                |
| Compromised Node.js runtime        | Out of scope (OS-level concern)                                |
| Disk access to dead-drop directory | Mitigated by file permissions (0700) but not encrypted at rest |

## Performance Characteristics

### Encoding pipeline

| Stage                           | Time (typical) | Notes                         |
| ------------------------------- | -------------- | ----------------------------- |
| JSON serialization              | <1 ms          | Small CT/1 payloads           |
| Ed25519 signing                 | <1 ms          | Node.js native crypto         |
| Reed-Solomon FEC (32 ECC bytes) | ~2 ms          | GF(2^8) polynomial arithmetic |
| AFSK modulation                 | ~5-15 ms       | Depends on payload size       |
| WAV file write                  | ~1-5 ms        | Sequential I/O                |

### Decoding pipeline

| Stage                   | Time (typical) | Notes                       |
| ----------------------- | -------------- | --------------------------- |
| WAV file read           | ~1-5 ms        | Sequential I/O              |
| Goertzel demodulation   | ~5-15 ms       | Per-bit frequency detection |
| Reed-Solomon correction | ~2-5 ms        | Berlekamp-Massey + Forney   |
| Ed25519 verification    | <1 ms          | Node.js native crypto       |
| Nonce + freshness check | <1 ms          | In-memory lookup            |

### File sizes

A typical CT/1 message (~200 bytes payload) produces:

- ~45 KB WAV file at audible (300 baud, 44.1 kHz)
- ~90 KB WAV file at ultrasonic (150 baud, 48 kHz)

### Reed-Solomon error correction

- **ECC symbols**: 32 (default) — corrects up to 16 symbol errors per block
- **Block size**: 255 bytes max (223 data + 32 ECC)
- **Multi-block**: Payloads >223 bytes automatically split into blocks
- **Galois Field**: GF(2^8) with primitive polynomial 0x11D

## File Structure

```
src/agents/clawtalk/tpc/
  types.ts              # Type definitions, AFSK params, config interfaces
  crypto-signer.ts      # Ed25519 signing/verification, envelope creation
  reed-solomon.ts       # GF(2^8) RS codec (BM decoder, Chien search, Forney)
  waveform-encoder.ts   # AFSK modulation → WAV
  waveform-decoder.ts   # WAV → Goertzel demodulation
  nonce-store.ts        # Replay prevention (JSON-backed)
  dead-drop.ts          # File-based message exchange
  index.ts              # TPCRuntime (full pipeline) + public API
  circuit-breaker.ts    # Dead-drop health monitoring
  key-rotation.ts       # Scheduled key replacement with grace period
  rate-limiter.ts       # Per-agent sliding window
  audit-logger.ts       # JSONL structured event logging
  profile-selector.ts   # Hardware probe integration + mode selection
  probes/               # Python CLI probes for hardware detection
    sweep.py            # 17-22 kHz frequency sweep
    analyze.py          # SNR measurement
    send.py             # Calibration packet transmitter
    recv.py             # Calibration packet receiver + PER
    decide.py           # Mode decision engine
  tpc.test.ts           # Core TPC tests (45 tests)
  profile-selector.test.ts  # Hardware probe tests (16 tests)
  security.test.ts      # Security hardening tests (36 tests)
```

## Future Extensions

1. **Multi-byte Reed-Solomon error correction** — the BM decoder supports it; test coverage is the remaining todo
2. **Live audio transport** — direct speaker/microphone streaming instead of file-based dead-drop
3. **State Delta Encoding (SDE)** — modulate agent hidden state vectors instead of text payloads
4. **Encrypted-at-rest dead-drop** — AES-256-GCM encryption of WAV files on disk
5. **Hardware security module (HSM) key storage** — move Ed25519 keys into TPM/HSM
6. **Multi-agent key distribution** — PKI for agent-to-agent key exchange
