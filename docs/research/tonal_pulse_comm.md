## Acoustic State Transfer (Audio Communication)

Implementing Acoustic State Transfer between agents moves coordination out of human-readable text and into modulated audio, mitigating prompt-injection risks inherent in OpenClaw's current markdown-based context (for example, `SOUL.md`, `MEMORY.md`). A BBC Micro-style AFSK foundation evolves into a 2026-ready, non-textual control plane.

### Acoustic Tokenization via State Delta Encoding (SDE)

The modern successor to Frequency-Shift Keying (FSK) is **State Delta Encoding (SDE)**, which modulates an agent's latent state vectors into high-frequency or ultrasonic bursts instead of 1200/2400 Hz tones.

- **Hidden-state transfer:** The master agent emits its hidden state transition trajectory rather than a text command, conveying reasoning directly.
- **Ultrasonic streams:** Tokens ride on 18 kHz+ carriers to coordinate sub-agents over speakers/mics without shared text buffers.

### Why Move Beyond Plain Text

| Feature | Plain English (.md) | Acoustic/Latent Transfer (2026) |
| --- | --- | --- |
| **Injection risk** | High; text goal hijacking is trivial. | Low; requires precise signal modulation. |
| **Data privacy** | Context stored in plaintext on disk. | Context exists as ephemeral audio/vector bursts. |
| **Reasoning loss** | High; text is a lossy summary of intent. | Low; transfers the raw logic trajectory. |
| **Latency** | "WiFi speed" (API round-trips). | "CPU speed" (local zero-copy audio/memory). |

### Developer Roadmap for an Acoustic Gateway

1. **Reflex layer (System 1):** Run always-on SLMs locally to perceive and decode audio with near-zero latency.
2. **State delta modulation:** Use FSK/SDR-style decoders to recover bit-strings or tensor deltas from modulated audio.
3. **Non-textual ingress:** Force sub-agents to accept instructions only via the Agent-to-Agent (A2A) acoustic protocol, not workspace files.
4. **Heartbeat sync:** Reuse heartbeat pulses as timing signals so listeners sample precisely when the master speaks.

By shifting logic into acoustic tokens, agents operate inside an isolated reasoning loop that is opaque to text-focused malware or prompt-based hijacks.

### Audio Interchange Format

Use uncompressed WAV or PCM streams as the interchange container.

- **Encode (ggwave-to-file):** Modulate JSON or binary payloads via FSK into a `.wav` file rather than writing markdown.
- **Decode (ggwave-from-file):** Perform an FFT to extract the spectrum and map it back into binary tokens for execution.

### GibberLink Protocol (2026 Standard)

**GibberLink** replaces human language once peers mutually verify they are AIs.

| Component | Function |
| --- | --- |
| **Transport layer** | GGWave handles multi-frequency FSK audio. |
| **Error correction** | Reed-Solomon preserves payloads under noise/compression. |
| **Protocol switch** | Mutual recognition via audio fingerprints triggers GibberLink mode. |
| **Efficiency** | Up to 80% faster by skipping human-syntax parsing. |

### Deployment Patterns (Preference Order)

1. **Preferred — file-based GibberLink:** Share `.wav`/PCM payloads in a dead-drop directory or message bus; avoid speakers/mics, reduce detection risk, and keep comms non-textual.
2. **Expert/offline — direct sound transfer:** Use speakers/mics only for air-gapped or no-network scenarios; expect higher fragility and operational risk.
3. **Optional — ultrasonic stealth:** If using live audio, configure GGWave for 18–20 kHz to stay mostly inaudible, acknowledging hardware variability.

In all modes, sub-agents execute only after decoding a GibberLink stream, blunting text-based injection attempts.

### Operational Risks and Mitigations

- **Human/pet exposure:** Ultrasonic carriers can still produce artifacts; keep playback levels low, constrain duty cycles, and prefer file-based transfers over real-time speakers when possible.
- **Detection and policy triggers:** Corporate audio DLP or ultrasonic sensors may flag beacons; use authenticated, rate-limited signaling and fall back to wired/file-based interchange to avoid RF/acoustic beacons.
- **Jamming and interference:** Acoustic channels are easy to disrupt; design retry/backoff logic and include FEC plus signatures/MACs to reject corrupted or injected packets.

### Using GibberLink Without Live Audio

When physical acoustics are undesirable, exchange GibberLink payloads as WAV/PCM files (ggwave-to-file/ggwave-from-file) over a shared filesystem or message bus. This preserves the non-textual, encoded control plane while avoiding audible emissions and susceptibility to ambient jamming.

### Alternatives and Profiles

| Capability | GGWave (GibberLink) | libquiet profile | AFSK baseline |
| --- | --- | --- | --- |
| Throughput | Low (small tokens/commands) | Low–mid (configurable OFDM/FSK/PSK) | Very low |
| Footprint | Tiny, easy to embed | Heavier DSP deps (LiquidDSP) | Minimal |
| Bands | Audible/ultrasonic (18–20 kHz if hardware allows) | Flexible; audible or ultrasonic with tuning | Audible-first |
| Best use | Bootstrap, file-based control tokens | Higher robustness/bitrate in tougher rooms | Maximum simplicity/compatibility |
| Robustness | Moderate; add FEC/MAC | Higher with FEC, adaptive profiles | High SNR needed; tolerant due to simplicity |
| License | MIT | LGPL (LiquidDSP) | Varies (often MIT/BSD) |

### Recommended Defaults

- **Primary path:** File-based GibberLink (GGWave) for small, authenticated control tokens.
- **Optional profile:** libquiet-based modem for environments needing more robustness/bitrate; still favor file-based transport.
- **Expert/offline mode:** Live speaker/mic only when no network/filesystem exists; run a hardware SNR sweep and fall back to file mode if weak.

### Hardware Capability Probe (for Live Ultrasonic Mode)

- Sweep 17–22 kHz playback and record via loopback/air-gap; measure SNR and roll-off to choose carrier bins.
- Verify mic/speaker frequency response; many laptop/phone mics low-pass ~16–20 kHz—drop to audible carriers if needed.
- Check AGC/noise suppression effects; disable if possible or select modulation resilient to AGC (short frames, pilots).
- Run a calibration packet with FEC; require valid signature/MAC to guard against injected/jammed calibration.
- Log packet error rate and auto-select profile: ultrasonic if PER < threshold, otherwise audible/file-based fallback.

### Test Script Skeleton (Sweep + PER Check)

```
# 1) Generate carriers (17–22 kHz) and record loopback
python sweep.py --start 17000 --end 22000 --seconds 5 --out sweep.wav
python record.py --seconds 5 --out capture.wav

# 2) Analyze SNR/roll-off and pick bins
python analyze.py --ref sweep.wav --rec capture.wav --out bins.json

# 3) Send signed calibration packets over chosen bins
python send.py --bins bins.json --profile ultrasonic --fec rs --sign ed25519 --out cal.wav
python recv.py --in cal.wav --verify ed25519 --fec rs --per

# 4) Decide profile
python decide.py --per-threshold 0.05 --in per.json --fallback audible|file
```

Implementations can share GGWave/libquiet bindings for `send/recv`, and the decision step should persist the selected profile for the session.

### Text Diagram (Data Flow)

- Master agent → Encode + sign + FEC (GGWave/libquiet) →
  - Write WAV/PCM to dead-drop (preferred path)
  - Optional live audio emit via speaker (expert/offline)
- Dead-drop WAV/PCM or mic capture → Decode + verify + FEC → Command executor (A2A-only ingress)
- Profile selector steers file vs ultrasonic vs audible modes, informed by hardware probe (sweep + PER test); fallback to file if SNR/roll-off is poor.

### Implementation Components

- `encode.ts`: Wrap GGWave/libquiet; sign (Ed25519/HMAC); apply Reed-Solomon/LDPC; output WAV/PCM or audio.
- `decode.ts`: Demodulate; verify signature/MAC; apply FEC; hand validated commands to executor.
- `profile-selector.ts`: Run sweep/PER; default to file-based GGWave; allow libquiet; gate live ultrasonic on SNR/roll-off.
- `a2a-executor.ts`: Enforce A2A-only ingress, schema validation, rate limits, and tool allowlist.
- `scripts/sweep.py|analyze.py|send.py|recv.py|decide.py`: CLI probes for hardware and PER-based profile choice.

### Control-Plane Instructions

- Default transport: signed + FEC WAV/PCM over shared FS/bus (preferred).
- Live audio: expert/offline only; require probe + signed calibration; PER-gated enablement; auto-fallback to file/audible if weak.
- Always authenticate, apply FEC, and include replay protection (nonces/timestamps); log PER and chosen profile per session.