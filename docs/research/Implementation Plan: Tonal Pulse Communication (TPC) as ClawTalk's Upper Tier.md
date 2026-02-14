# Implementation Plan: Tonal Pulse Communication (TPC) as ClawTalk's Default Protocol

## Executive Summary

This plan implements **Tonal Pulse Communication (TPC)** as the **default communication protocol** for ClosedClaw, with text-based ClawTalk as the fallback. TPC uses acoustic/non-textual encoding (GibberLink protocol) to move ALL agent coordination out of human-readable text and into modulated audio/binary streams, eliminating prompt-injection risks that are inherent in text-based communication.

### The Two-Tier Architecture: Secure by Default

- **Primary Protocol (TPC/GibberLink)**: Acoustic/non-textual encoding for ALL agent ↔ agent communication - **enabled by default**
- **Fallback Protocol (ClawTalk 2.1)**: Text-based compressed protocol (CT/1 wire format + telegraphic English) - used only when TPC unavailable or for human-facing communication

## 1. Architectural Relationship

### 1.1 Current State: ClawTalk 2.1

ClawTalk provides efficient text-based communication:
- **CT/1 wire protocol**: Structured command format (REQ/RES/TASK/STATUS/ERR/ACK/MULTI)
- **Telegraphic English**: Compressed natural language for content
- **Subagent routing**: Directory-based agent selection with skill compilation
- **Security**: Kernel Shield with 3-layer defense (structural, semantic, neural attestation)

**Key limitation**: All communication is text-based, vulnerable to prompt injection attacks embedded in user messages, external data sources, or compromised contexts.

### 1.2 Proposed Upper Tier: TPC/GibberLink

TPC adds a non-textual communication layer:
- **State Delta Encoding (SDE)**: Modulates agent state transitions into audio signals
- **GibberLink protocol**: FSK/GGWave-based encoding with Reed-Solomon FEC and Ed25519 signatures
- **Transport modes**:
  - **Primary**: File-based WAV/PCM (dead-drop directory exchange)
  - **Secondary**: Ultrasonic live audio (18-20 kHz for air-gapped scenarios)
  - **Fallback**: Audible AFSK (1200/2400 Hz for maximum compatibility)

**Key benefit**: Agent coordination becomes opaque to text-focused attacks, with authentication and integrity verification built into the protocol.

### 1.3 Protocol Selection: TPC by Default

**Core principle**: TPC is the default for all agent-to-agent communication. Text is used ONLY when necessary.

| Scenario | Protocol | Rationale |
|----------|----------|-----------|
| User → Master Agent | **Text (fallback)** | Human writes natural language; must be readable by LLM |
| Master Agent → User | **Text (fallback)** | Human must read response; no security risk in final output |
| Master Agent → SubAgent | **TPC (default)** | ALL directives acoustic-encoded to prevent injection |
| SubAgent → SubAgent | **TPC (default)** | Inter-agent coordination uses secure channel |
| SubAgent → Master Agent | **TPC (default)** | Results encoded acoustically, decoded only after validation |
| Master Agent → SubAgent (emergency) | **Text (fallback)** | TPC infrastructure failure; logged as security event |

**Default policy**:
- **TPC ALWAYS** for agent-to-agent communication
- **Text ONLY** for human-facing I/O or when TPC infrastructure fails
- Text fallback triggers security audit log entry

## 2. Implementation Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    TPC Communication Stack                   │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Layer 5: TPC Acoustic Transport (NEW)                       │
│ ═══════════════════════════════════════                      │
│ Location: src/agents/clawtalk/tpc/                          │
│                                                              │
│ Components:                                                  │
│ - waveform-encoder.ts → CT/1 to WAV/PCM via GGWave         │
│ - waveform-decoder.ts → WAV/PCM to CT/1 with verification  │
│ - reed-solomon.ts → FEC encoding/decoding                   │
│ - crypto-signer.ts → Ed25519 signing and MAC verification  │
│ - profile-selector.ts → Hardware probe and mode selection   │
│ - dead-drop.ts → File-based exchange manager                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                               ↕
┌──────────────────────────────────────────────────────────────┐
│ Layer 4: ClawTalk 2.1 Protocol (EXISTING)                   │
│ ═══════════════════════════════════                          │
│ Location: src/agents/clawtalk/                              │
│                                                              │
│ Components:                                                  │
│ - parser.ts → CT/1 parsing and serialization ✓             │
│ - encoder.ts → Intent classification ✓                      │
│ - directory.ts → Subagent routing ✓                         │
│ - kernel-shield.ts → Security arbiter ✓                     │
│ - clawtalk-hook.ts → Plugin integration ✓                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 File-Based GibberLink Flow (Primary Transport)

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Master Agent Encodes Directive                      │
│ ─────────────────────────────────────────                    │
│ Input: CT/1 message (text)                                   │
│   "CT/1 REQ web_search q=\"...\" filter=critical"           │
│                                                              │
│ Process:                                                     │
│ 1. Serialize to JSON payload                                │
│ 2. Add timestamp + nonce (replay protection)                │
│ 3. Sign with Ed25519 (master agent private key)             │
│ 4. Apply Reed-Solomon FEC (10% redundancy)                  │
│ 5. Modulate via GGWave → WAV/PCM                            │
│                                                              │
│ Output: signed_directive_a3f2b8.wav (written to dead-drop)  │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Dead Drop Manager                                   │
│ ─────────────────────────────────────────────                │
│ Location: ~/.closedclaw/tpc/dead-drop/                      │
│ Structure:                                                   │
│   inbox/  → SubAgents poll for new directives               │
│   outbox/ → SubAgents write completed results               │
│   archive/ → Processed messages (TTL: 24h)                  │
│                                                              │
│ Watcher: inotify on inbox/ for new .wav files               │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: SubAgent Decodes Directive                          │
│ ─────────────────────────────────────────────                │
│ Input: signed_directive_a3f2.wav (from inbox/)              │
│                                                              │
│ Process:                                                     │
│ 1. Read WAV/PCM file                                         │
│ 2. Demodulate via GGWave → binary payload                   │
│ 3. Apply Reed-Solomon error correction                      │
│ 4. Verify Ed25519 signature (master public key)             │
│ 5. Check timestamp freshness (<5 min)                       │
│ 6. Check nonce uniqueness (replay prevention)               │
│ 7. Parse JSON → CT/1 message                                │
│                                                              │
│ Output: Validated CT/1 directive for execution              │
│ Side effect: Move .wav to archive/                          │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: SubAgent Executes + Returns Result                  │
│ ─────────────────────────────────────────────                │
│ Execution: Follow standard ClawTalk flow                     │
│ Result encoding:                                             │
│   Option A: Text (if result needs human review)             │
│   Option B: TPC/Acoustic (if sensitive or chaining agents)  │
│                                                              │
│ Write to: outbox/result_a3f2b8.wav or result_a3f2b8.json    │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Integration with Existing ClawTalk Hooks

#### 2.3.1 Before-Agent-Start Hook Extension

Location: `src/agents/clawtalk/clawtalk-hook.ts`

```typescript
// NEW: Check if we should fallback to text (TPC is default)
function shouldFallbackToText(params: {
  routing: ClawTalkRouting;
  config: ClosedClawConfig;
  securityContext: SecurityContext;
  isAgentToAgent: boolean;
}): boolean {
  const tpcConfig = config.clawtalk?.tpc;

  // If TPC disabled globally, fallback to text
  if (!tpcConfig?.enabled) return true;

  // Never use TPC for human-facing communication
  if (!params.isAgentToAgent) return true;

  // Fallback to text ONLY if:
  // 1. TPC infrastructure unavailable (dead-drop directory missing)
  // 2. Explicit text-only override in CT/1 envelope (tpc=false)
  // 3. SubAgent manifest explicitly allows text-only (allowTextFallback: true)

  return (
    !tpcConfig.deadDropPath ||
    params.routing.wire.includes("tpc=false") ||
    params.routing.agentProfile.allowTextFallback === true
  );
}

// MODIFIED: Route ALL agent-to-agent through TPC by default
export async function beforeAgentStart(ctx: BeforeAgentStartContext) {
  const routing = clawtalkRouteMessage(ctx.prompt);
  const kernelShield = evaluateKernelShield(routing, ctx.config);

  if (kernelShield.verdict === "BLOCK") {
    // Existing security handling
    return { block: true, reason: kernelShield.reason };
  }

  // Determine if this is agent-to-agent communication
  const isAgentToAgent = ctx.source === "agent" || ctx.agentInitiated === true;

  // SECURE BY DEFAULT: Use TPC unless we must fallback to text
  if (!shouldFallbackToText({ routing, config: ctx.config, securityContext: kernelShield, isAgentToAgent })) {
    const encoded = await encodeTPC({
      message: routing.wire,
      signingKey: await resolveSigningKey(ctx.config),
      deadDropPath: ctx.config.clawtalk.tpc.deadDropPath,
    });

    // Log TPC usage
    await logAudit({
      event: "tpc_encode",
      agentId: routing.agentId,
      messageId: encoded.messageId,
      timestamp: Date.now(),
    });

    return {
      tpcMode: true,
      deadDropFile: encoded.filePath,
      routing: routing.agentId,
    };
  }

  // TEXT FALLBACK (logged as security event)
  await logAudit({
    event: "text_fallback",
    agentId: routing.agentId,
    reason: "TPC unavailable or human-facing",
    timestamp: Date.now(),
  });

  return {
    agentId: routing.agentId,
    systemPrompt: routing.systemPrompt,
    tools: routing.tools,
    modelOverride: routing.modelOverride,
    tpcMode: false, // Explicit marker
  };
}
```

## 3. Critical Files and Modifications

### 3.1 New Directories

```
src/agents/clawtalk/tpc/
├── waveform-encoder.ts     # GGWave wrapper for CT/1 → audio
├── waveform-decoder.ts     # GGWave wrapper for audio → CT/1
├── reed-solomon.ts         # FEC encoding/decoding
├── crypto-signer.ts        # Ed25519 signing + HMAC verification
├── profile-selector.ts     # Hardware capability detection
├── dead-drop.ts            # File-based transport manager
├── nonce-store.ts          # Replay attack prevention
└── index.ts                # Public API

src/agents/clawtalk/tpc/probes/
├── sweep.py                # Frequency sweep for ultrasonic calibration
├── analyze.py              # SNR analysis from sweep results
├── send.py                 # Calibration packet transmission
├── recv.py                 # Calibration packet reception + PER
└── decide.py               # Mode selection based on PER threshold
```

### 3.2 Modified Files

#### `src/agents/clawtalk/clawtalk-hook.ts`
- Add `shouldFallbackToText()` decision logic (inverted from original plan)
- Add `encodeTPC()` call for ALL agent-to-agent dispatch
- Add `decodeTPC()` for inbound acoustic payloads
- Add audit logging for TPC usage and text fallbacks

#### `src/agents/clawtalk/directory.ts`
- Add `allowTextFallback: boolean` field to `SubagentProfile` (default: false)
- Parse `.claws` manifest Block 1 for text fallback permission
- Mark legacy/debug agents that explicitly allow text

#### `src/agents/clawtalk/kernel-shield.ts`
- Add TPC as default transport in security layer
- Log text fallbacks as security events
- Emit `isAgentToAgent` flag in security context

#### `src/config/types.clawtalk.ts`
- Add TPC configuration schema

```typescript
export interface ClawTalkTPCConfig {
  enabled: boolean; // Default: true (TPC is secure by default)
  mode: "file" | "ultrasonic" | "audible" | "auto"; // Default: "file"
  deadDropPath: string; // Default: "~/.closedclaw/tpc/dead-drop"
  hardwareProbeOnStart?: boolean; // Default: false
  fecScheme: "reed-solomon" | "ldpc"; // Default: "reed-solomon"
  signatureScheme: "ed25519" | "hmac"; // Default: "ed25519"
  keyPath: string; // Default: "~/.closedclaw/tpc/keys/private.pem"
  publicKeyPath: string; // Default: "~/.closedclaw/tpc/keys/public.pem"
  nonceStorePath: string; // Default: "~/.closedclaw/tpc/nonce.db"
  maxMessageAge: number; // Seconds, default 300 (5 min)
  pollingInterval: number; // ms, default 1000
  enforceForAgentToAgent: boolean; // Default: true - block text routing
  keyRotationDays: number; // Default: 30
  maxMessagesPerMinute: number; // Default: 100
  allowTextFallback: boolean; // Default: false - only for emergency
}
```

#### `extensions/gtk-gui/src/monitor.ts`
- Add TPC indicator in risk display
- Show "Acoustic Transport" badge when TPC active

### 3.3 New Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@noble/ed25519": "^2.1.0",
    "ggwave-js": "^1.0.0",
    "reed-solomon": "^3.0.0",
    "chokidar": "^3.5.3"
  }
}
```

**Note**: `ggwave-js` is a JavaScript/TypeScript wrapper for the GGWave C++ library. If unavailable, we'll use Node.js child_process to shell out to `ggwave-cli` binary.

## 4. Implementation Phases

### Phase 1: Core TPC Infrastructure (Days 1-3)

**Goal**: Build foundational TPC encoding/decoding without live audio.

- [ ] Implement `waveform-encoder.ts` using ggwave-js or ggwave-cli subprocess
  - CT/1 text → JSON → binary → GGWave modulation → WAV/PCM
  - Support file output only (no live audio yet)
  - Unit tests: roundtrip encode→decode produces identical text

- [ ] Implement `waveform-decoder.ts`
  - WAV/PCM → GGWave demodulation → binary → JSON → CT/1 text
  - Support file input only
  - Unit tests: decode known test vectors

- [ ] Implement `crypto-signer.ts`
  - Ed25519 key generation, signing, verification
  - HMAC as fallback option
  - Timestamp + nonce attachment
  - Unit tests: sign/verify roundtrip

- [ ] Implement `reed-solomon.ts`
  - Encode with 10% redundancy
  - Decode with error correction
  - Unit tests: correct up to 5% bit errors

- [ ] Implement `dead-drop.ts`
  - File write/read/move operations
  - Inbox/outbox/archive directory structure
  - inotify/chokidar watcher for new files
  - Cleanup job for archive (TTL: 24h)
  - Unit tests: file lifecycle

- [ ] Implement `nonce-store.ts`
  - SQLite or JSON-based nonce tracking
  - Check uniqueness, reject duplicates
  - Prune old entries (TTL: 1h)
  - Unit tests: concurrent nonce checks

**Verification**:
```bash
pnpm test -- src/agents/clawtalk/tpc
```

### Phase 2: ClawTalk Integration (Days 4-5)

**Goal**: Wire TPC as the default protocol for all agent-to-agent communication.

- [ ] Extend `clawtalk-hook.ts` with **inverted** decision logic
  - Add `shouldFallbackToText()` function (TPC is default, text is exception)
  - Add `encodeTPC()` / `decodeTPC()` calls for all agent-to-agent messages
  - Add audit logging for TPC encode/decode and text fallbacks
  - Integration tests: agent-to-agent messages use TPC by default

- [ ] Add TPC config schema to `src/config/types.clawtalk.ts`
  - Zod schema validation with TPC enabled by default
  - Default values: enabled=true, mode="file", enforceForAgentToAgent=true
  - Config tests: valid/invalid configs, ensure defaults work

- [ ] Extend `directory.ts` to parse `.claws` text fallback permission
  - Read Block 1 manifest `allowTextFallback: boolean` field (default: false)
  - Mark SubagentProfile accordingly
  - Unit tests: .claws with/without text fallback permission

- [ ] Extend `kernel-shield.ts` for TPC-first security
  - Add `isAgentToAgent` boolean to SecurityContext
  - Log text fallbacks as security events
  - Unit tests: agent-to-agent flag detection

**Verification**:
```bash
pnpm test -- src/agents/clawtalk
pnpm test -- src/config/types.clawtalk.test.ts
```

### Phase 3: GTK GUI Integration (Days 6-7)

**Goal**: Expose TPC status in GTK GUI - show when DEFAULT (TPC) vs FALLBACK (text).

- [ ] Extend `extensions/gtk-gui/src/monitor.ts`
  - Detect TPC mode from routing result
  - Show "🔒 Acoustic Transport (Default)" badge for TPC messages
  - Show "⚠️ Text Fallback" warning badge for text messages (with explanation)
  - Add tooltip: "TPC is active - secure by default"
  - UI tests: badges appear correctly for both modes

- [ ] Add TPC stats to status reporting
  - Count TPC encoded/decoded messages (should be majority)
  - Count text fallbacks (should be rare, logged as security events)
  - Report dead-drop file sizes and queue depth
  - Display in /api/status endpoint
  - Integration test: stats accumulate correctly

**Verification**:
```bash
pnpm test -- extensions/gtk-gui
```

### Phase 4: Hardware Probe (Ultrasonic Mode) (Days 8-9)

**Goal**: Optional ultrasonic mode with automatic fallback.

- [ ] Implement Python CLI probes in `src/agents/clawtalk/tpc/probes/`
  - `sweep.py`: Generate 17-22 kHz test tones
  - `analyze.py`: Measure SNR and frequency response
  - `send.py`: Transmit signed calibration packet via speaker
  - `recv.py`: Receive via microphone, compute PER
  - `decide.py`: Select mode based on PER threshold

- [ ] Implement `profile-selector.ts`
  - Shell out to Python probes
  - Parse JSON results
  - Cache hardware profile in config
  - Fallback to file mode if SNR < threshold
  - Unit tests: mock Python probe results

- [ ] Add live audio support to encoder/decoder
  - GGWave emit via speakers (optional)
  - GGWave receive via microphone (optional)
  - Only enable if hardware probe passes
  - Integration tests: loopback audio test

**Verification**:
```bash
python3 src/agents/clawtalk/tpc/probes/sweep.py --start 17000 --end 22000
python3 src/agents/clawtalk/tpc/probes/analyze.py --ref sweep.wav --rec capture.wav
pnpm test -- src/agents/clawtalk/tpc/profile-selector.test.ts
```

### Phase 5: Security Hardening (Days 10-11)

**Goal**: Ensure TPC cannot be bypassed and add operational security features.

- [ ] Verify TPC enforcement (already default, add safeguards)
  - Ensure `enforceForAgentToAgent: true` prevents text bypass
  - Add circuit breaker: if dead-drop fails repeatedly, fail-closed (not open)
  - Tests: attempt to bypass TPC with various exploits, all rejected
  - Tests: dead-drop failure blocks agent-to-agent messages (no silent fallback)

- [ ] Add key rotation support
  - Generate new Ed25519 keypair on schedule
  - Gradual rollover (accept old + new for grace period)
  - Config: `tpc.keyRotationDays: 30` (default)
  - Automatic rotation daemon or SIGUSR2 trigger
  - Tests: old/new keys accepted during rollover

- [ ] Enhance audit logging (extend Phase 2 logging)
  - Log every TPC encode/decode operation with full context
  - Include: timestamp, message ID, agent IDs, signature verification result
  - Log text fallbacks with stack trace showing why
  - Store in: `~/.closedclaw/logs/tpc-audit.jsonl`
  - Tests: audit entries written with complete data

- [ ] Add rate limiting per agent
  - Prevent TPC flooding attacks
  - Config: `tpc.maxMessagesPerMinute: 100` (default)
  - Per-agent counters with sliding window
  - Tests: rate limit enforcement, burst handling

**Verification**:
```bash
pnpm test -- src/agents/clawtalk/tpc/security.test.ts
```

### Phase 6: Documentation + End-to-End Testing (Days 12-13)

**Goal**: Document TPC architecture and verify full pipeline.

- [ ] Create `docs/automation/tpc-gibberlink.md`
  - Architecture overview
  - Configuration guide
  - Security model explanation
  - Troubleshooting guide

- [ ] Create `docs/research/TPC-IMPLEMENTATION.md`
  - Design decisions
  - Threat model analysis
  - Performance characteristics
  - Future extensions

- [ ] E2E test: Full TPC pipeline
  - User message → GTK GUI → TPC encode → dead-drop → SubAgent decode → execution → result
  - Verify: no CT/1 text leakage, signature valid, nonce unique, timing correct
  - Test file: `src/agents/clawtalk/tpc/tpc.e2e.test.ts`

- [ ] E2E test: Fallback to text mode
  - Disable TPC config
  - Verify: same messages work via text routing
  - Test file: `src/agents/clawtalk/tpc/fallback.e2e.test.ts`

**Verification**:
```bash
pnpm test -- src/agents/clawtalk/tpc/tpc.e2e.test.ts
pnpm test -- src/agents/clawtalk/tpc/fallback.e2e.test.ts
pnpm build
```

## 5. Configuration Example

`~/.closedclaw/config.json5`:

```json5
{
  "clawtalk": {
    "enabled": true,
    "tpc": {
      // SECURE BY DEFAULT: TPC enabled for all agent-to-agent communication
      "enabled": true, // Set false ONLY for debugging or testing

      "mode": "file", // "file" | "ultrasonic" | "audible" | "auto"
      "deadDropPath": "~/.closedclaw/tpc/dead-drop",
      "hardwareProbeOnStart": false, // Set true to test ultrasonic on startup

      // Cryptography settings
      "fecScheme": "reed-solomon", // Error correction
      "signatureScheme": "ed25519", // Authentication
      "keyPath": "~/.closedclaw/tpc/keys/private.pem",
      "publicKeyPath": "~/.closedclaw/tpc/keys/public.pem",

      // Security policies
      "enforceForAgentToAgent": true, // Block text routing for agent-to-agent
      "allowTextFallback": false, // Emergency override to allow text (logged)
      "maxMessageAge": 300, // 5 minutes - reject older messages
      "keyRotationDays": 30, // Automatic key rotation

      // Performance tuning
      "pollingInterval": 1000, // Check dead-drop every 1 second
      "maxMessagesPerMinute": 100, // Rate limiting per agent

      // Replay attack prevention
      "nonceStorePath": "~/.closedclaw/tpc/nonce.db"
    }
  }
}
```

**Important notes**:
- **TPC is enabled by default** - this is intentional for security
- Text fallback only occurs for human-facing I/O or emergency scenarios
- All text fallbacks are logged as security events in `~/.closedclaw/logs/tpc-audit.jsonl`
- To temporarily disable TPC for debugging: set `"enabled": false` (not recommended for production)

## 6. Testing Strategy

### 6.1 Unit Tests

- **Encoder/Decoder**: Roundtrip encode→decode produces identical text
- **Crypto**: Sign/verify with various key sizes, timestamp validation
- **FEC**: Error correction up to theoretical limit
- **Dead-drop**: File operations, watchers, cleanup
- **Nonce store**: Uniqueness, replay prevention, pruning

### 6.2 Integration Tests

- **Hook integration**: TPC triggered for high-risk messages
- **Directory parsing**: .claws files with TPC requirements
- **Kernel Shield**: Untrusted input flag propagation
- **GTK GUI**: TPC badge display

### 6.3 E2E Tests

- **Full pipeline**: User → GTK → TPC encode → dead-drop → decode → SubAgent → result
- **Fallback**: TPC disabled, messages still work via text
- **Security**: Bypass attempts rejected, audit logs written

### 6.4 Performance Tests

- **Encoding latency**: CT/1 → WAV/PCM < 100ms
- **Decoding latency**: WAV/PCM → CT/1 < 100ms
- **File I/O**: Dead-drop polling < 10ms overhead
- **Signature verification**: < 5ms

## 7. Security Considerations

### 7.1 Threat Model

**Threats mitigated by TPC**:
1. **Prompt injection in user messages**: Acoustic encoding prevents LLM from parsing injected instructions
2. **Context pollution from external data**: Web scraping results encoded acoustically before reaching SubAgent
3. **Multi-agent coordination attacks**: Inter-agent handoffs use authenticated acoustic channels
4. **Text-based exfiltration**: Sensitive data not visible in text logs or context windows

**Threats NOT mitigated** (require other defenses):
1. **Local filesystem access**: Attacker with access to dead-drop directory can read/write files (mitigated by file permissions)
2. **Key compromise**: Stolen Ed25519 key allows signature forgery (mitigated by key rotation)
3. **DoS via TPC flooding**: Rate limiting required
4. **Acoustic jamming**: Live ultrasonic mode vulnerable (fallback to file mode)

### 7.2 Key Management

- **Generation**: Ed25519 keypair generated on first startup via `@noble/ed25519`
- **Storage**: Private key stored with 0600 permissions at `~/.closedclaw/tpc/keys/private.pem`
- **Rotation**: Automatic rotation every 30 days (configurable)
- **Backup**: User responsible for backing up private key
- **Revocation**: Delete key and regenerate; all pending dead-drop messages rejected

### 7.3 Replay Attack Prevention

- **Nonce**: 128-bit random value attached to every message
- **Timestamp**: Unix timestamp with 5-minute validity window
- **Store**: SQLite database tracks seen nonces, prunes after 1 hour
- **Verification**: Decoder rejects messages with duplicate nonces or expired timestamps

## 8. Performance Characteristics

### 8.1 Latency Overhead

| Operation | Latency | Notes |
|-----------|---------|-------|
| CT/1 → WAV encoding | ~50ms | GGWave modulation |
| WAV → CT/1 decoding | ~50ms | GGWave demodulation |
| Reed-Solomon FEC | ~10ms | 10% redundancy |
| Ed25519 signing | ~2ms | Fast curve |
| Ed25519 verification | ~3ms | Fast curve |
| File I/O (write) | ~5ms | SSD assumed |
| File I/O (read) | ~5ms | SSD assumed |
| Dead-drop polling | ~10ms | inotify/chokidar |
| **Total roundtrip** | **~135ms** | Encode + write + poll + read + decode |

**Comparison to text routing**: ~10ms (no encoding overhead)

**Acceptable trade-off**: 125ms latency for elimination of prompt injection risk.

### 8.2 Throughput

- **File mode**: Limited by filesystem, ~100 messages/sec theoretical
- **Ultrasonic mode**: Limited by audio bandwidth, ~5 messages/sec (GGWave default)
- **Audible mode**: Limited by audio bandwidth, ~2 messages/sec (lower bitrate)

**Recommended**: File mode for production, ultrasonic for air-gapped demos.

### 8.3 Storage

- **WAV file size**: ~50KB per message (depends on length, FEC overhead)
- **Dead-drop retention**: Archive cleaned after 24h
- **Typical usage**: 100 messages/day = 5MB daily, auto-pruned
- **Nonce database**: ~100KB for 10K entries

## 9. Future Extensions

### 9.1 TPC 2.0: State Delta Encoding

The current implementation encodes full CT/1 messages. Future versions could encode:
- **Latent state deltas**: Agent hidden state transitions instead of text
- **Tensor diffs**: Only changed weights in small models
- **Ultrasonic streaming**: Real-time coordination over 18+ kHz carriers

**Benefit**: Even more compact, truly non-textual reasoning transfer.

### 9.2 Multi-Agent Cryptographic Identity

- **Hardware TPM binding**: Cryptographic identity tied to device TPM
- **Attestation chains**: Each SubAgent proves its identity via chain of trust
- **Block 0 .claws integration**: Cryptographic Identity block already defined in spec

**Benefit**: Prevent agent impersonation attacks.

### 9.3 MCP-over-TPC

- **Acoustic MCP transport**: Encode MCP tool invocations acoustically
- **Tool result validation**: Verify tool outputs via acoustic signatures
- **Mixed mode**: MCP for trusted internal tools, TPC for untrusted external APIs

**Benefit**: Unified security model across tool invocations.

## 10. Success Criteria

### 10.1 Functional

- [ ] TPC encoding produces valid WAV/PCM files
- [ ] TPC decoding recovers original CT/1 message with 100% accuracy
- [ ] Signature verification rejects tampered messages
- [ ] Replay attacks detected and rejected
- [ ] Dead-drop file lifecycle correct (inbox → archive)
- [ ] High-risk messages automatically route via TPC
- [ ] GTK GUI shows TPC status indicator

### 10.2 Performance

- [ ] Encoding latency < 100ms
- [ ] Decoding latency < 100ms
- [ ] Dead-drop polling overhead < 10ms
- [ ] File mode throughput > 50 messages/sec
- [ ] Storage < 10MB/day for typical usage

### 10.3 Security

- [ ] Text-based prompt injection attacks fail when TPC enabled
- [ ] Audit logs capture all TPC operations
- [ ] Rate limiting prevents DoS
- [ ] Key rotation works without downtime
- [ ] Nonce store prevents replay attacks

### 10.4 Documentation

- [ ] User guide explains when TPC activates
- [ ] Operator guide covers configuration and troubleshooting
- [ ] Developer docs explain architecture and extension points
- [ ] Threat model documented with mitigations

## 11. Verification Plan

### Post-Implementation Checklist

```bash
# Unit tests
pnpm test -- src/agents/clawtalk/tpc

# Integration tests
pnpm test -- src/agents/clawtalk
pnpm test -- src/config

# E2E tests
pnpm test -- src/agents/clawtalk/tpc/*.e2e.test.ts

# Build
pnpm check && pnpm build

# Manual verification
# 1. Start gateway with TPC enabled
pnpm start:gateway --config ~/.closedclaw/config-tpc.json5

# 2. Send high-risk message via GTK GUI
# Expected: TPC badge appears, message routed via dead-drop

# 3. Check dead-drop directory
ls -la ~/.closedclaw/tpc/dead-drop/inbox/
ls -la ~/.closedclaw/tpc/dead-drop/archive/

# 4. Check audit log
tail -f ~/.closedclaw/logs/tpc-audit.jsonl

# 5. Verify signature
# Expected: All messages have valid signatures

# 6. Test replay attack
# Copy old .wav file back to inbox
# Expected: Rejected due to duplicate nonce

# 7. Test ultrasonic mode (if hardware supports)
python3 src/agents/clawtalk/tpc/probes/sweep.py --start 17000 --end 22000
python3 src/agents/clawtalk/tpc/probes/analyze.py --ref sweep.wav --rec capture.wav
# Expected: SNR analysis and mode recommendation

# 8. Performance test
# Send 100 messages, measure latency
# Expected: <100ms encode/decode, <10ms polling overhead
```

## 12. Risk Mitigation

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| GGWave dependency unavailable | High | Fallback to ggwave-cli subprocess; document installation | Dev |
| Ultrasonic mode unreliable | Low | Default to file mode; ultrasonic optional | Dev |
| Key loss/corruption | Medium | Document backup procedure; auto-regenerate | Ops |
| Dead-drop directory permissions | High | Enforce 0700 at startup; fail loudly if wrong | Dev |
| Users disable TPC for convenience | High | Loud warnings in logs; audit text fallbacks; educate on security benefits | Ops/Docs |
| TPC infrastructure failure causes deadlock | High | Circuit breaker with fail-closed behavior; alert on repeated failures | Dev |
| Compatibility with existing .claws | Low | TPC is transparent; all existing skills work without changes | Dev |

---

## Summary

This plan implements **Tonal Pulse Communication (TPC) as the default protocol for ClosedClaw**, with text-based ClawTalk as an emergency fallback. By encoding ALL agent-to-agent messages acoustically (via GibberLink/GGWave), we eliminate text-based prompt injection vulnerabilities by design — **secure by default**.

**Core philosophy**: TPC is not optional security — it IS the security model. Text communication exists only for human-facing I/O.

**Key deliverables**:
1. New TPC encoding/decoding modules in `src/agents/clawtalk/tpc/`
2. Integration with ClawTalk hooks for **default TPC routing** (text fallback only for human I/O)
3. Dead-drop file-based transport (primary mode, no audio hardware required)
4. Ed25519 cryptographic signing and replay prevention for all agent-to-agent messages
5. Optional ultrasonic/audible modes with hardware probes (air-gapped scenarios)
6. GTK GUI integration showing TPC as default with text fallback warnings
7. Comprehensive test suite (unit, integration, E2E) validating secure-by-default behavior
8. Documentation emphasizing TPC as the primary protocol, not an add-on

**Security model**:
- **Agent → Agent**: TPC always (enforced)
- **Human → Agent**: Text (necessary for LLM parsing)
- **Agent → Human**: Text (necessary for human readability)
- **Text fallback**: Emergency only, logged as security event

**Estimated effort**: 13 days (Phases 1-6)

**Next step**: Implement Phase 1 (Core TPC Infrastructure) and validate with roundtrip encoding tests.
