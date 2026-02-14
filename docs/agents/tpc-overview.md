# TPC (Tonal Pulse Communication) Overview

This note summarizes how TPC is implemented in ClosedClaw (file transport only), including data flow, field-level details, and examples of request fulfillment.

## End-to-end Flow

```mermaid
flowchart LR
    CT1[CT/1 payload
    (text)] --> ENV[Create envelope
    {messageId, nonce,
    timestamp, source,
    target, payload}]
    ENV --> SIGN[Sign envelope
    (Ed25519/HMAC)]
    SIGN --> RS[Reed-Solomon encode
    (nsym=32 ECC bytes/block)]
    RS --> AFSK[AFSK modulate
    (Bell 202 tones)]
    AFSK --> WAV[WAV wrap
    (PCM 16-bit mono)]
    WAV --> DROP[Dead-drop inbox
    (atomic write)]
    DROP -->|watch/poll| READ[Dead-drop read
    (moves to archive)]
    READ --> WAV2[Parse WAV + PCM]
    WAV2 --> DEMOD[AFSK demodulate
    (Goertzel)]
    DEMOD --> RS2[RS decode
    + integrity checks]
    RS2 --> JSON[Parse JSON
    SignedTPCEnvelope]
    JSON --> VERIFY[Verify signature,
    freshness, nonce]
    VERIFY --> CT1_OUT[CT/1 payload
    delivered]
```

## Encode Path (with sizes)

- Input CT/1: e.g., `CT/1 REQ web_search q="rust borrow checker" filter=critical` (~70 bytes).
- Envelope fields: version, messageId (UUID), timestamp (seconds), nonce (16-byte hex), sourceAgent, targetAgent, payload. JSON typically ~180–220 bytes.
- Reed-Solomon: nsym=32 (max data per block 223 bytes). For ~200-byte JSON: 1 block => 200 data + 32 parity = 232 bytes. Framing adds 2-byte block count + 1-byte length => ~235 bytes total.
- AFSK framing: 10 bits per byte (start + 8 data + stop) plus ~24 bits pre/postamble. Bits ~ 24 + 235\*10 = 2,374 bits.
- Samples: baud 300, sampleRate 44,100 => 147 samples/bit => ~349k samples.
- WAV size: 44-byte header + samples\*2 bytes ≈ 0.7 MB. Use `estimateWavSize(payloadBytes)` for exact values.

## Decode Path (validation)

1. Read WAV from dead-drop (moves to archive). Size cap 5 MB; ID/path/extension checks.
2. Parse WAV header: PCM, expected channels/rate/bits, chunk bounds.
3. Extract PCM; Goertzel demodulate AFSK to bits/bytes.
4. Reed-Solomon decode with block-count/size/truncation guards; fail on uncorrectable errors.
5. JSON parse and shape-check `SignedTPCEnvelope`.
6. Verify signature (Ed25519/HMAC), freshness (timestamp window), nonce uniqueness (replay protection). Deliver CT/1 payload.

## Security and Robustness

- Enforcement: with `enforceForAgentToAgent`, agent-to-agent messages never downgrade to text, even if `tpc=false` is present.
- Transport guardrails: only `mode="file"` supported; unsupported modes throw. Dead-drop validates IDs, paths, extensions, sizes (5 MB cap) before read/write.
- FEC guardrails: validates nsym, block counts (<=1024), data lengths, trailing bytes.
- WAV guardrails: header and size validation before demodulation.
- Replay/freshness: nonce store and max message age checks.

## Examples (ClosedClaw fulfillment via TPC)

1. **Web search request**: Agent A sends CT/1 search to Agent B → encode/sign/FEC/AFSK/WAV → write to B inbox → B decodes, verifies, runs search, replies via TPC.
2. **Summary with enforcement**: Agent A sends CT/1 summary with `tpc=false`; enforcement blocks fallback → WAV delivered; B verifies signature/freshness/nonce; on failure raises security error; on success replies via TPC.
3. **Two-step workflow**: Turn 1 analysis, turn 2 action. Each turn sent as TPC WAV; dead-drop ordering plus nonce uniqueness prevent replay; RS covers bit errors; WAV validation prevents malformed input.

## Key Files

- Runtime and policy: [src/agents/clawtalk/tpc/index.ts](../src/agents/clawtalk/tpc/index.ts)
- Dead drop transport: [src/agents/clawtalk/tpc/dead-drop.ts](../src/agents/clawtalk/tpc/dead-drop.ts)
- Reed-Solomon FEC: [src/agents/clawtalk/tpc/reed-solomon.ts](../src/agents/clawtalk/tpc/reed-solomon.ts)
- Waveform encode: [src/agents/clawtalk/tpc/waveform-encoder.ts](../src/agents/clawtalk/tpc/waveform-encoder.ts)
- Waveform decode: [src/agents/clawtalk/tpc/waveform-decoder.ts](../src/agents/clawtalk/tpc/waveform-decoder.ts)
