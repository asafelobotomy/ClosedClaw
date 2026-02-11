# ClosedClaw Development Plan

**Created**: February 11, 2026
**Goal**: Make ClosedClaw a fully autonomous, secured personal AI assistant — any LLM (currently Qwen3:8B via Ollama) acts as "ClosedClaw" with full tool use, inter-agent communication via ClawTalk, and .claws skill files — accessible only through GTK GUI and Android App.

---

## Current State

### What's Working Today

| Component | Status | Details |
|-----------|--------|---------|
| Gateway | Running | Port 18789, token auth, local mode |
| Ollama + Qwen3:8B | Running | 5.2GB model, RTX 4060 (8GB VRAM), ~6s response |
| GTK Messenger | Running | GTK4/Libadwaita, Unix socket IPC, dark mode |
| Auth Profiles | Fixed | `auth-profiles.json` with `AuthProfileStore` format |
| Platform Removal | Complete | Discord/WhatsApp/Telegram/Signal/Slack/iMessage stripped |
| ClawTalk Library | Built | 4,470 LOC across 17 files, not yet wired into runtime |
| .claws Parser | Built | 993 LOC, 10 block types, not yet authoring skill files |
| Security Stack | Built | XChaCha20-Poly1305, Argon2id, Keychain, Kernel Shield |
| 17+ Agent Tools | Built | Browser, exec, cron, canvas, TTS, web, memory, sessions |
| Plugin System | Built | 15 hook points, tool/channel/provider/service registration |
| Android App | Built | 63 Kotlin files, Jetpack Compose, WebSocket + mDNS |

### Hardware

- CPU: AMD Ryzen 7 5800X (8-core/16-thread)
- RAM: 32GB (22GB available)
- GPU: NVIDIA RTX 4060 (8GB VRAM), CUDA 13.1
- OS: Arch Linux

---

## Priority 1 — Critical Path (Unlocks Everything Else)

### 1.1 Wire ClawTalk Orchestrator into Agent Runtime

**Impact**: Without this, ClawTalk is dead code. With it, every message gets intent-classified, routed to specialized subagents, and processed through the token-optimized pipeline.

**Current state**:
- `src/agents/clawtalk/orchestrator.ts` (242 LOC) — full pipeline: Encode → Route → Escalate → Execute
- `src/agents/clawtalk/encoder.ts` (366 LOC) — heuristic intent classification (<1ms, no LLM call)
- `src/agents/clawtalk/directory.ts` (170 LOC) — 4 subagent profiles (Research, System, Code, Memory) + Conversation fallback
- `extensions/gtk-gui/src/clawtalk-bridge.ts` (508 LOC) — self-contained GTK intent classifier (duplicates core logic)

**Work required**:
1. Add a `before_agent_start` hook that runs the ClawTalk encoder on incoming messages
2. Use the Directory to resolve which subagent profile handles the intent
3. Inject the subagent's system prompt and tool allowlist into the agent invocation
4. Replace the GTK bridge's self-contained classifier with a call to the canonical orchestrator
5. Pass CT/1 wire format metadata through the session for downstream logging/telemetry

**Key files to modify**:
- `src/agents/openclaw-tools.ts` — tool assembly reads orchestrator config
- `src/agents/agent-runtime.ts` or equivalent agent entry point — insert orchestrator call
- `extensions/gtk-gui/src/channel.ts` — delegate to canonical orchestrator
- `src/config/types.agents.ts` — add `clawtalk` config section per agent

**Estimated effort**: 2-3 days
**Dependencies**: None

---

### 1.2 Enable Full Tool Suite for Qwen3:8B

**Impact**: Right now Qwen3 can only chat. Enabling tools gives it browser control, file operations, shell execution, web search, memory, cron, and canvas — the full OpenClaw feature set.

**Current state**:
- `extensions/gtk-gui/src/lite-tools.ts` (1,793 LOC) — simplified tools for tiny models (1B/3B): `read_file`, `run_command`, `list_directory`, `write_file`, `web_search`, `save_note`, `recall_notes`, `clipboard_read/write`
- `src/agents/openclaw-tools.ts` — `createClosedClawTools()` assembles the full 17+ tool suite
- Qwen3:8B supports function calling via Ollama's OpenAI-compatible API

**Work required**:
1. Determine Qwen3:8B's tool-calling reliability — run targeted tests with the full tool suite
2. If reliable: configure the GTK channel to use `createClosedClawTools()` instead of lite-tools
3. If partially reliable: create a "medium" tool tier that includes the most robust tools (exec, read_file, web_search, memory) and excludes fragile ones (browser, canvas)
4. Add tool-tier config to `agents.defaults` or per-agent config: `tools.tier: "full" | "medium" | "lite"`
5. Wire the `exec` tool with sandbox defaults for safety (the sandbox config already exists in `types.sandbox.ts`)

**Key files to modify**:
- `extensions/gtk-gui/src/channel.ts` — tool tier selection
- `src/config/types.tools.ts` — add `tier` option
- `src/agents/openclaw-tools.ts` — tier-based filtering

**Estimated effort**: 1-2 days
**Dependencies**: None (can be done in parallel with 1.1)

---

### 1.3 Activate ClawDense for Token Efficiency

**Impact**: ~60% token reduction on inter-agent communication. Critical for Qwen3:8B's 32K context window — every saved token means longer conversations before compaction.

**Current state**:
- `src/agents/clawtalk/clawdense.ts` (514 LOC) — complete implementation
- Prefix notation: `!` Auth, `@` SysCall, `?` Query, `>>` Flow handoff, `<<` Return, `::` State, `$` Variable, `#` Comment
- Lexicon system loads Block 8 from `.claws` files for stenographic compression
- Built-in macros: `WEBSRCH`, `READFILE`, `LSDIR`, `RUNCMD`, `CODEGEN`

**Work required**:
1. Add `clawtalk.compression` config option: `"off" | "transport" | "hybrid" | "native"`
   - `transport`: ClawDense only for subagent-to-subagent messages (invisible to user)
   - `hybrid`: ClawDense for system/tool messages, natural language for user-facing
   - `native`: All internal communication in ClawDense (maximum efficiency)
2. Insert compression/decompression in the orchestrator pipeline
3. Add context window tracking to trigger ClawDense automatically when approaching limits
4. Load default lexicon on gateway startup

**Key files to modify**:
- `src/agents/clawtalk/orchestrator.ts` — add compression step
- `src/agents/clawtalk/types.ts` — `ClawTalkConfig.compression` already defined
- `src/config/types.agents.ts` — expose in agent config

**Estimated effort**: 1 day
**Dependencies**: 1.1 (orchestrator must be wired first)

---

## Priority 2 — Core Feature Enablement

### 2.1 Author .claws Skill Files for Core Capabilities

**Impact**: Defines the behavioral contracts, allowed tools, risk profiles, and stenographic lexicons for each subagent. Without these, the Kernel Shield has no manifest to enforce.

**Current state**:
- `src/agents/clawtalk/claws-parser.ts` (993 LOC) — full parser for all 10 blocks
- `createClawsTemplate()` — generates skeleton .claws files
- `scanSkillsDirectory()` — auto-discovers .claws files
- `validatePermissions()` — enforces Block 1 manifest permissions

**10-block .claws structure**:

| Block | Name | Purpose |
|-------|------|---------|
| 0 | Cryptographic Identity | Hardware-bound SHA-256 signing |
| 1 | Manifest | Permissions, runtime, memory strategy, integrity hash |
| 2 | The Vibe | Purpose, trigger, tone, constraints (markdown) |
| 3 | CLAW-IDL | Interface definition for tool schemas |
| 4 | Engine | Execution engine configuration |
| 5 | Telemetry | Stats, success rate, latency, errors, refactor history |
| 6 | State | State checkpoints |
| 7 | Verification | Formal proofs |
| 8 | The Lexicon | Stenographic shorthand mappings |
| 9 | Neural Fingerprint | Activation vectors for behavioral attestation |

**Skill files to create**:
1. `research.claws` — Web search, URL fetch, summarization
2. `system.claws` — File I/O, directory listing, shell execution
3. `code.claws` — Code generation, review, debugging, refactoring
4. `memory.claws` — Save/recall/search with entity tagging
5. `browser.claws` — Playwright automation, screenshots, navigation
6. `automation.claws` — Cron scheduling, reminders, wake tasks
7. `conversation.claws` — General chat fallback, TTS output

**Location**: `~/.closedclaw/skills/` (scanned by `scanSkillsDirectory()`)

**Estimated effort**: 2-3 days
**Dependencies**: 1.1 (orchestrator needs to load and enforce skill files)

---

### 2.2 Kernel Shield Configuration & Enforcement

**Impact**: Three-layer security enforcement on every tool invocation. Without config, it runs in permissive mode.

**Current state**:
- `src/agents/clawtalk/kernel-shield.ts` (299 LOC) — complete implementation
- Layer 1: Structural — permission check against .claws Manifest + formal proof verification
- Layer 2: Semantic — risk vector $V_r = (P_{access} \times S_{data}) + (1 - T_{score})$; thresholds at 0.3 (log) and 0.7 (block/biometric)
- Layer 3: Neural Attestation — cosine similarity against Block 9 fingerprint, drift detection

**Work required**:
1. Add `security.kernelShield` config section:
   ```json5
   security: {
     kernelShield: {
       enabled: true,
       riskThresholds: { low: 0.3, high: 0.7 },
       attestation: { enabled: true, driftThreshold: 0.85 },
       enforcement: "strict" | "permissive" | "audit-only"
     }
   }
   ```
2. Wire `evaluateShield()` into the `before_tool_call` hook
3. Log shield verdicts to the security audit system (`src/security/audit.ts`)
4. Add GTK GUI notification for blocked/escalated actions

**Key files to modify**:
- `src/config/types.base.ts` — add `KernelShieldConfig`
- `src/config/zod-schema.ts` — validation
- `src/plugins/hooks.ts` — register `before_tool_call` handler
- `extensions/gtk-gui/src/channel.ts` — shield verdict display

**Estimated effort**: 1-2 days
**Dependencies**: 2.1 (needs .claws manifests to enforce against)

---

### 2.3 Connect Shadow Factory to Tool Registry

**Impact**: Enables ClosedClaw to autonomously identify capability gaps and propose new tools.

**Current state**:
- `src/agents/clawtalk/shadow-factory.ts` (372 LOC) — complete pipeline:
  - Step A: Reconnaissance — scan environment for interaction gaps
  - Step B: Drafting — generate .claws file in air-gapped sandbox + fuzz testing
  - Step C: Optimization — telemetry monitoring, auto-rewrite on poor performance
- `analyzeGaps()`, `generateDraft()`, `recordFuzzResults()`, `evaluateOptimization()`, `createShadowTool()`, `advancePhase()`

**Work required**:
1. Create a periodic task (cron or idle hook) that runs `analyzeGaps()` against recent session history
2. Route gap results to `generateDraft()` which produces a candidate .claws file
3. Run candidate in sandboxed environment with `recordFuzzResults()`
4. If pass rate > threshold, present to user in GTK GUI for approval
5. On approval, install to skills directory and reload tool registry

**Safety guardrails**:
- All generated tools run in Docker sandbox first (existing sandbox infrastructure)
- User must explicitly approve before installation
- Generated .claws files include Block 7 (Verification) with test results
- Rate limit: max 1 tool proposal per day initially

**Estimated effort**: 3-4 days
**Dependencies**: 2.1 (.claws authoring patterns established first)

---

## Priority 3 — Channel Hardening

### 3.1 Android App Local-Only Enforcement

**Impact**: Ensures the Android app can only connect over LAN/Tailscale, never exposed to public internet.

**Current state**:
- `apps/android/` — 63 Kotlin files, Jetpack Compose, WebSocket + mDNS discovery
- `SecurePrefs.kt` — encrypted local preferences
- Node pairing flow exists (`closedclaw nodes pending` → `approve`)
- Gateway supports Tailscale serve/funnel

**Work required**:
1. Add `gateway.exposure` config: `"local" | "tailscale" | "public"` (default: `"local"`)
2. When `"local"`: bind only to 127.0.0.1 and LAN interfaces, reject connections from non-private IPs
3. When `"tailscale"`: allow Tailscale IP range only, auto-configure `tailscale serve`
4. Android app: enforce certificate pinning for gateway TLS
5. Add connection security indicator in Android UI (green shield = local, yellow = tailscale)

**Key files to modify**:
- `src/config/types.gateway.ts` — `exposure` field
- `src/gateway/server.ts` — IP filtering
- `apps/android/` — cert pinning + UI indicator

**Estimated effort**: 1-2 days
**Dependencies**: None

---

### 3.2 GTK GUI Security Hardening

**Impact**: The GTK Unix socket is currently unauthenticated. Any local process can connect.

**Current state**:
- Socket at `/tmp/closedclaw-gtk.sock`
- No authentication on socket connection
- `extensions/gtk-gui/src/ipc.ts` — `GtkIpcBridge` class
- `extensions/gtk-gui/src/risk-scoring.ts` — command risk assessment exists

**Work required**:
1. Move socket to `~/.closedclaw/gtk.sock` (user-only directory, not world-readable /tmp)
2. Add Unix socket peer credential check (`SO_PEERCRED`) — reject connections from other UIDs
3. Add session token handshake on connect (GTK app must present token from config)
4. Enforce file permissions: socket 0600, directory 0700
5. Risk scoring integration: display risk level in GTK before executing high-risk commands

**Key files to modify**:
- `extensions/gtk-gui/src/ipc.ts` — socket location, auth handshake, peer cred check
- `apps/gtk-gui/closedclaw_messenger.py` — token handshake on connect
- `extensions/gtk-gui/src/channel.ts` — risk score display

**Estimated effort**: 1 day
**Dependencies**: None

---

## Priority 4 — Intelligence & Optimization

### 4.1 Neural Attestation Live Monitoring

**Impact**: Runtime behavioral monitoring detects if the model is drifting from expected patterns (prompt injection, jailbreak, degradation).

**Current state**:
- `src/agents/clawtalk/neural-attestation.ts` (305 LOC) — complete
- `AttestationMonitor` class with drift detection: `none` → `soft_drift` → `hard_drift` → `INTEGRITY_SHUTDOWN`
- Re-fingerprinting required after code modifications

**Work required**:
1. Capture tool invocation pattern vectors during normal operation to establish baseline fingerprint
2. Store fingerprint in .claws Block 9 (Neural Fingerprint)
3. Run `AttestationMonitor` as a gateway service (via plugin `registerService()`)
4. On drift detection: log to security audit, notify via GTK, optionally pause agent
5. Dashboard: Add attestation status to GTK GUI sidebar or status bar

**Estimated effort**: 2-3 days
**Dependencies**: 2.1, 2.2 (needs .claws files with Block 9 and shield config)

---

### 4.2 Context Window Management with ClawDense

**Impact**: Qwen3:8B has 32K context. Without management, long conversations hit the limit and lose context.

**Current state**:
- Compaction hooks exist: `before_compaction`, `after_compaction`
- ClawDense achieves ~60% token reduction
- `estimateTokens()` and `estimateDenseTokens()` functions available

**Work required**:
1. Track token usage per session with `estimateTokens()`
2. At 70% capacity: auto-switch internal messages to ClawDense format
3. At 85% capacity: trigger compaction (summarize older messages)
4. At 95% capacity: aggressive compaction + session archival to memory
5. Display token usage in GTK GUI (progress bar in header)

**Key files to modify**:
- `src/agents/clawtalk/orchestrator.ts` — token tracking
- `extensions/gtk-gui/src/channel.ts` — token usage display
- `apps/gtk-gui/closedclaw_messenger.py` — progress bar UI element

**Estimated effort**: 2 days
**Dependencies**: 1.3 (ClawDense must be activated)

---

### 4.3 Model Hot-Swap & Fallback

**Impact**: Allow switching between local models (Qwen3:8B, Llama, Mistral) or falling back to cloud APIs for complex tasks.

**Current state**:
- `src/agents/failover-error.ts` — failover error handling exists
- `src/agents/model-selection.ts` — model selection/normalization
- Escalation logic in `src/agents/clawtalk/escalation.ts` (118 LOC)
- Config supports `model.fallbacks` array

**Work required**:
1. Define escalation criteria: token limits, repeated tool failures, confidence below threshold
2. Configure fallback chain: `ollama/qwen3:8b` → `ollama/qwen3:32b` (if upgraded) → cloud API (if configured)
3. Wire `shouldEscalate()` from escalation.ts into the orchestrator
4. GTK notification when escalating: "Switching to [model] for this task"
5. Cost tracking for cloud fallbacks

**Estimated effort**: 1-2 days
**Dependencies**: 1.1 (orchestrator integration)

---

## Priority 5 — Polish & Extended Features

### 5.1 GTK GUI Enhancements

- Tool call visualization (show which tools the agent is using)
- Markdown rendering improvements (code blocks, tables, images)
- File drag-and-drop for media understanding
- Session management sidebar (list, switch, delete sessions)
- Token usage display
- Shield verdict notifications
- Settings panel (model selection, tool tier, compression, security)

### 5.2 Voice Integration

- TTS output through GTK (ElevenLabs/Edge TTS already built in `src/agents/tools/tts-tool.ts`)
- Speech-to-text input (Whisper via Ollama or local binary)
- Wake word detection (Android already has `VoiceWakeManager.kt`)

### 5.3 Memory System Tuning

- Configure memory-core + memory-lancedb extensions for Qwen3
- Entity extraction and knowledge graph building
- Session-to-memory archival on compaction
- Memory search exposed as conversational recall

### 5.4 Upstream Sync Strategy

- `closedclaw upstream` command suite exists for tracking OpenClaw
- Define merge policy: security patches yes, new channels no
- Track divergence points for manual review

---

## Implementation Order (Timeline)

```
Week 1:
  ├── 1.1  Wire ClawTalk into Agent Runtime          [2-3 days]
  ├── 1.2  Enable Full Tools for Qwen3:8B            [1-2 days] (parallel)
  └── 3.2  GTK Socket Security Hardening              [1 day]   (parallel)

Week 2:
  ├── 1.3  Activate ClawDense                         [1 day]
  ├── 2.1  Author .claws Skill Files                  [2-3 days]
  └── 2.2  Kernel Shield Config                       [1-2 days]

Week 3:
  ├── 2.3  Shadow Factory → Tool Registry             [3-4 days]
  ├── 3.1  Android Local-Only Enforcement             [1-2 days] (parallel)
  └── 4.3  Model Hot-Swap & Fallback                  [1-2 days] (parallel)

Week 4:
  ├── 4.1  Neural Attestation Monitoring              [2-3 days]
  ├── 4.2  Context Window Management                  [2 days]
  └── 5.x  Polish & Extended Features                 [ongoing]
```

---

## Architecture Reference

### Message Flow (Target State)

```
User types in GTK/Android
  → Unix Socket / WebSocket
    → Gateway receives message
      → ClawTalk Encoder (intent classification, <1ms)
        → Directory (subagent routing)
          → Kernel Shield (permission check against .claws manifest)
            → ClawDense compression (if enabled)
              → Qwen3:8B via Ollama (tool calls if needed)
                → Neural Attestation (drift check)
                  → ClawDense decompression
                    → Response streamed back to GTK/Android
```

### Key File Map

| Area | Primary Files |
|------|---------------|
| Agent Runtime | `src/agents/openclaw-tools.ts`, `src/agents/agent-runtime.ts` |
| ClawTalk Core | `src/agents/clawtalk/` (17 files, 4,470 LOC) |
| GTK Channel | `extensions/gtk-gui/` (8 files), `apps/gtk-gui/closedclaw_messenger.py` |
| Android | `apps/android/` (63 files) |
| Security | `src/security/` (11 files) |
| Config | `src/config/types.*.ts` (24+ files), `src/config/zod-schema.ts` |
| Plugins | `src/plugins/` (20+ files) |
| Tools | `src/agents/tools/` (17+ tool files) |
| Memory | `extensions/memory-core/`, `extensions/memory-lancedb/` |

### Config Location

- Main: `~/.closedclaw/config.json5`
- Auth: `~/.closedclaw/agents/main/agent/auth-profiles.json`
- Models: `~/.closedclaw/agents/main/agent/models.json`
- Skills: `~/.closedclaw/skills/*.claws`
- Logs: `/tmp/ClosedClaw/ClosedClaw-YYYY-MM-DD.log`
