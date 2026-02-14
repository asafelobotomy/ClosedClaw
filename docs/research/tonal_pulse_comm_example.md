## Acoustic Control Plane: Working Example and Comparison

This note sketches a minimal file-based GibberLink flow (GGWave/libquiet) and compares it to plain-English markdown control.

### Minimal File-Based Flow (WAV/PCM)

1. **Payload:** JSON command, e.g. `{ "cmd": "ping", "ts": 1739486400, "nonce": "abc123" }`.
2. **Sign + FEC:** Add Ed25519/HMAC signature; apply Reed-Solomon/LDPC.
3. **Encode to WAV:** Modulate with GGWave (or libquiet) to `out.wav` (ultrasonic profile optional).
4. **Dead drop:** Copy `out.wav` to shared folder (no speakers/mics used).
5. **Decode:** Demodulate to JSON, verify signature/MAC, run FEC, enforce freshness (ts/nonce).
6. **Dispatch:** Route only allowlisted commands via the A2A executor.

Example commands (GGWave CLI placeholder; swap for your binding):

```bash
ggwave-cli encode --text "$(cat payload.json)" \
  --protocol ultrasonic --fec rs --out out.wav

# Drop file to shared folder (e.g. /tmp/a2a/drop)
ggwave-cli decode --in /tmp/a2a/drop/out.wav --out decoded.json
python verify_and_dispatch.py decoded.json
```

`verify_and_dispatch.py` should verify signature, check nonce/timestamp, validate schema, and dispatch only approved commands.

### Optional Probe for Ultrasonic Profile

```bash
python sweep.py --start 17000 --end 22000 --seconds 5 --out sweep.wav
python record.py --seconds 5 --out capture.wav
python analyze.py --ref sweep.wav --rec capture.wav --out bins.json
python send.py --bins bins.json --profile ultrasonic --fec rs --sign ed25519 --out cal.wav
python recv.py --in cal.wav --verify ed25519 --fec rs --per --out per.json
python decide.py --per-threshold 0.05 --in per.json --fallback file
```

Stay on file-based GGWave if PER is high; only enable ultrasonic if SNR/roll-off is acceptable.

### Plain English vs Acoustic Control (Theoretical)

| Dimension          | Plain English (.md)          | Acoustic (GibberLink/GGWave)                               |
| ------------------ | ---------------------------- | ---------------------------------------------------------- |
| Injection surface  | High; text goal hijacks easy | Lower; requires crafted modulated signal + valid signature |
| Storage visibility | Cleartext on disk            | Encoded WAV/PCM; opaque without demodulation               |
| Reasoning fidelity | Lossy summaries              | Closer to raw intent tokens (small payloads)               |
| Throughput         | High over IPC/HTTP           | Low (tokens/commands only)                                 |
| Latency            | API/IO-bound                 | Modulation/FFT adds 100s ms; still low for small packets   |
| Stealth            | Readable by humans/tools     | Non-text; ultrasonic optional (hardware-dependent)         |
| Robustness         | Strong (if networked)        | Susceptible to SNR, jamming; mitigated by FEC/signatures   |
| AuthN/Z            | Depends on app               | Mandatory signing/MAC recommended; A2A allowlist           |

### Key Takeaways

- Prefer file-based encoded WAV/PCM for most cases; keep live audio as expert/offline only.
- Always sign, apply FEC, enforce nonces/timestamps, and allowlist commands.
- Run a hardware probe before using ultrasonic; fall back to file/audible if SNR is weak.

See also: `docs/research/tonal_pulse_comm.md` for the broader design and risk notes.
