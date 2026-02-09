# ClawTalk: Internal Agent Communication Protocol

## Overview

ClawTalk is a compact domain-specific language (DSL) for inter-agent communication within ClosedClaw. It replaces verbose natural language messages between agents with a structured, token-efficient protocol that evolves over time through agent-proposed optimizations.

## The Problem

Every inter-agent interaction today costs full natural language tokens:

```
# Current: ~55 tokens
"Search the web for the latest Node.js 22 security advisories published in the
last 30 days, filter for critical severity, return the top 5 results with CVE
identifiers, severity scores, affected versions, and recommended mitigations.
Format as a structured list."

# ClawTalk: ~15 tokens
CT/1 REQ web_search q="nodejs22 security advisory" since=30d filter=critical limit=5 fields=cve,severity,versions,mitigation
```

In a squad of 6 agents running a map-reduce strategy with dozens of exchanges, inter-agent chatter can dominate token budgets. ClawTalk reduces this by 60-70%.

## Why Not Pure Emergent Language?

The Facebook FAIR experiments (2017) showed neural RL agents converging on compressed protocols. However, this approach fails for LLMs because:

1. **No weight updates** — LLMs cannot learn new token semantics from conversation alone
2. **Distribution shift** — Novel token sequences degrade comprehension (trained on natural language)
3. **No grounding** — Arbitrary symbols become noise without shared semantics
4. **Reproducibility** — Emerged protocols are opaque and brittle

ClawTalk instead uses a **three-phase approach**: start with engineered structure, layer agent-proposed optimizations, then enable self-improvement.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Agent A (sender)                 │
│                                                   │
│  Agent thinks in natural language:                │
│  "I need to search for Node.js vulnerabilities"   │
│         │                                         │
│         ▼                                         │
│  ┌─────────────────┐                              │
│  │ ClawTalk Encoder │◄── Dictionary               │
│  │ (serialize)      │    (macros + abbreviations)  │
│  └────────┬─────────┘                             │
│           │                                       │
│           │ CT/1 REQ web_search q="nodejs22 vuln"  │
└───────────┼───────────────────────────────────────┘
            │  wire format (compact)
            ▼
┌──────────────────────────────────────────────────┐
│  Transport Layer                                  │
│  (IPC / sessions_send / gateway RPC)             │
│                                                   │
│  Metadata attached:                               │
│  x-clawtalk-version: 1                           │
│  x-clawtalk-dict-version: 3                      │
│  x-clawtalk-encoding: plain                      │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────┐
│                  Agent B (receiver)               │
│  ┌─────────────────┐                              │
│  │ ClawTalk Decoder │◄── Same dictionary          │
│  │ (deserialize)    │                             │
│  └────────┬─────────┘                             │
│           │                                       │
│           ▼                                       │
│  Expanded to natural language for LLM context:    │
│  "Search the web for Node.js 22 vulnerabilities"  │
│                                                   │
└──────────────────────────────────────────────────┘
```

**Key design decision**: In Phase 1-2, the LLM **never sees the wire format**. ClawTalk is a transport optimization layer between agents. Agents think in natural language; the encoder/decoder transparently compresses/expands.

## Phase 1: Structured Protocol DSL

### Grammar

```
message     = header SP body
header      = "CT/" version SP verb
version     = "1"
verb        = "REQ" | "RES" | "TASK" | "STATUS" | "NOOP" | "ERR" | "ACK" | "MULTI"
body        = param*
param       = key "=" value
key         = ALPHA (ALPHA | DIGIT | "_")*
value       = quoted_string | token_string | number | array
quoted_string = DQUOTE <any char except DQUOTE, escaped with backslash> DQUOTE
token_string  = (ALPHA | DIGIT | "-" | "_" | "." | "/" | ":")+
array       = value ("," value)*
number      = ["-"] DIGIT+ ["." DIGIT+]
```

### Verb Semantics

| Verb | Direction | Purpose | Example |
|---|---|---|---|
| `REQ` | Sender → Receiver | Request an action | `CT/1 REQ web_search q="nodejs vuln" limit=5` |
| `RES` | Receiver → Sender | Response to request | `CT/1 RES ok items=5 tokens=1.2k` |
| `TASK` | Coordinator → Worker | Delegate a task | `CT/1 TASK audit target=src/security scope=crypto` |
| `STATUS` | Worker → Coordinator | Report progress | `CT/1 STATUS run=a3f progress=0.7 phase=research` |
| `ERR` | Any → Any | Error report | `CT/1 ERR code=timeout tool=web_search elapsed=30s` |
| `ACK` | Receiver → Sender | Acknowledge receipt | `CT/1 ACK ref=msg-uuid-123` |
| `NOOP` | Any → Any | No action needed | `CT/1 NOOP reason="already_completed"` |
| `MULTI` | Any → Any | Batch of messages | `CT/1 MULTI count=3 [sub-messages]` |

### Common Parameter Keys

| Key | Type | Meaning |
|---|---|---|
| `q` | string | Query / search term |
| `target` | string | File/directory/resource target |
| `scope` | string | Comma-separated scope limiters |
| `limit` | number | Result count limit |
| `since` | duration | Time window (e.g., 30d, 24h, 1w) |
| `filter` | string | Filter expression |
| `fields` | string | Comma-separated output fields |
| `model` | string | Model to use |
| `timeout` | duration | Timeout duration |
| `priority` | string | high/normal/low |
| `ref` | string | Reference to prior message |
| `run` | string | Run/task identifier |
| `ok` | flag | Success indicator (presence = true) |
| `progress` | number | 0.0 to 1.0 completion ratio |
| `tokens` | string | Token count (supports k/M suffixes) |

### Payload Attachment

For messages requiring structured data beyond key-value params, a payload block follows the header:

```
CT/1 RES ok items=3
---
[
  {"cve": "CVE-2026-1234", "severity": "critical", "affected": ">=22.0.0 <22.3.1"},
  {"cve": "CVE-2026-1235", "severity": "high", "affected": ">=22.0.0 <22.2.0"},
  {"cve": "CVE-2026-1236", "severity": "critical", "affected": ">=22.1.0 <22.3.1"}
]
```

The `---` delimiter separates the header from a JSON payload. The payload is passed through without compression.

## Phase 2: Learned Shorthand Dictionary

### Dictionary Structure

```json5
// clawtalk-dictionary.json5
{
  "version": 1,
  "updated": "2026-02-09T14:30:00Z",
  "macros": {
    // Expand macro name → full ClawTalk message
    "SECAUDIT": {
      "expansion": "CT/1 TASK audit target=src/security scope=crypto,permissions,auth,sandbox",
      "description": "Standard security audit of core security module",
      "addedBy": "operator",
      "addedAt": "2026-02-09",
      "usageCount": 0
    },
    "VULNSCAN": {
      "expansion": "CT/1 REQ web_search q=\"{target} vulnerability CVE\" filter=critical since={window}",
      "description": "Search for vulnerabilities by target name",
      "params": ["target", "window"],
      "addedBy": "operator",
      "addedAt": "2026-02-09",
      "usageCount": 0
    },
    "QREVIEW": {
      "expansion": "CT/1 TASK review target={file} checks=types,errors,style,security",
      "description": "Quick code review of a file",
      "params": ["file"],
      "addedBy": "operator",
      "addedAt": "2026-02-09",
      "usageCount": 0
    },
    "DEPSCAN": {
      "expansion": "CT/1 REQ exec cmd=\"npm audit --json\" parse=vulnerabilities",
      "description": "NPM dependency vulnerability scan",
      "addedBy": "operator",
      "addedAt": "2026-02-09",
      "usageCount": 0
    },
    "HEALTHCHK": {
      "expansion": "CT/1 MULTI gateway.ping sessions.stats memory.usage",
      "description": "Combined health check of core systems",
      "addedBy": "operator",
      "addedAt": "2026-02-09",
      "usageCount": 0
    }
  },
  "abbreviations": {
    // Short form → expanded form (for path/term compression)
    "src/sec": "src/security",
    "src/ag": "src/agents",
    "src/gw": "src/gateway",
    "src/cfg": "src/config",
    "src/rt": "src/routing",
    "ext/": "extensions/",
    "crit": "critical",
    "tok": "tokens",
    "sess": "session",
    "cfg": "config",
    "gw": "gateway"
  },
  "proposed": [
    // Proposed by agents, awaiting approval
    {
      "name": "LOGCHECK",
      "expansion": "CT/1 REQ exec cmd=\"tail -100 ~/.closedclaw/logs/gateway-latest.log\" parse=errors",
      "proposedBy": "mirror-agent",
      "proposedAt": "2026-02-15",
      "reason": "Observed 47 times in 30 days as a natural language request variant",
      "estimatedSavings": "~30 tokens/use"
    }
  ]
}
```

### Dictionary Resolution

```
Macro invocation:  VULNSCAN(target="nodejs22", window="30d")
                            │
                            ▼
Expansion:         CT/1 REQ web_search q="nodejs22 vulnerability CVE" filter=critical since=30d
                            │
                            ▼
Abbreviation pass: (no abbreviations apply in this case)
                            │
                            ▼
Wire format:       CT/1 REQ web_search q="nodejs22 vulnerability CVE" filter=critical since=30d
```

### Agent-Proposed Macros

Agents (particularly the self_mirror) can propose new macros via a `protocol_propose` tool:

```typescript
// Tool: protocol_propose
{
  name: "LOGCHECK",
  expansion: "CT/1 REQ exec cmd=\"tail -100 ~/.closedclaw/logs/gateway-latest.log\" parse=errors",
  reason: "Seen 47 times in 30 days as a natural language request variant",
  estimatedSavings: "~30 tokens/use"
}
```

Proposals go into the `proposed` array. Approval workflow:

1. **Auto-approve**: If usage count > threshold (e.g., 50) and error rate < 1%, auto-promote
2. **Operator approve**: `/clawtalk approve LOGCHECK` command
3. **Reject**: `/clawtalk reject LOGCHECK` — removes from proposals

### Dictionary Versioning

- Dictionary is **append-only** with tombstones for removed entries
- Version number increments on every change
- All agents check `x-clawtalk-dict-version` header and reload if stale
- Breaking changes (macro semantics change) require version bump + migration

## Phase 3: Self-Optimizing Protocol

### Optimization Loop

The self_mirror drives protocol optimization through observation:

```
                    ┌─────────────────────┐
                    │   self_mirror        │
                    │   observes IPC       │
                    │   traffic            │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Frequency Analysis  │
                    │  - Message patterns  │
                    │  - Repeated phrases  │
                    │  - Common sequences  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Entropy Measurement │
                    │  - Info density/msg  │
                    │  - Redundancy ratio  │
                    │  - Compression gain  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Propose Compression │
                    │  - New macros        │
                    │  - New abbreviations │
                    │  - Deprecations      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Verify Comprehension│
                    │  - Test decode       │
                    │  - Measure error rate│
                    │  - A/B comparison    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Commit or Reject    │
                    │  - Update dictionary │
                    │  - Log decision      │
                    │  - Monitor drift     │
                    └─────────────────────┘
```

### Optimization Metrics

| Metric | Definition | Target |
|---|---|---|
| **Compression ratio** | wire_tokens / natural_language_tokens | < 0.4 (60%+ savings) |
| **Comprehension rate** | successful_decodes / total_messages | > 0.99 |
| **Dictionary utilization** | used_macros / total_macros | > 0.5 (prune unused) |
| **Proposal acceptance rate** | approved / proposed | Track, no target |
| **Token savings/month** | Σ (natural_tokens - wire_tokens) per message | Maximize |

### Gradual LLM Exposure (Phase 3 Only)

Once macros are well-established (high usage, zero comprehension errors), the encoder can optionally **stop expanding** them for the receiving LLM:

```
# Phase 1-2: LLM sees expanded natural language
"Run a security audit of the security module focusing on cryptographic implementation"

# Phase 3 (proven macros only): LLM sees ClawTalk directly
"SECAUDIT — focus on crypto implementation weaknesses"
```

This only works for macros with:
- 100+ successful uses
- 0 comprehension errors in last 50 uses
- Verified via A/B test (expanded vs compact, same quality)

The LLM gradually learns established protocol through in-context examples, not weight updates.

## Module Structure

```
src/agents/clawtalk/
├── index.ts              # Public API: encode(), decode(), dictionary
├── encoder.ts            # Natural language → CT/1 wire format
├── decoder.ts            # CT/1 wire format → natural language
├── parser.ts             # CT/1 grammar parser
├── dictionary.ts         # Dictionary load/save/versioning
├── macros.ts             # Macro expansion with parameter substitution
├── abbreviations.ts      # Abbreviation expansion/compression
├── metrics.ts            # Compression ratio, comprehension tracking
├── proposal.ts           # Agent-proposed macro management
└── clawtalk.test.ts      # Unit tests
```

## Wire Format Examples

### Task Delegation

```
# Natural language (~45 tokens):
"Audit the security module for cryptographic implementation weaknesses.
Focus on encryption parameters, key derivation, and file permissions.
Use the Claude Opus model and allow up to 5 minutes."

# ClawTalk (~18 tokens):
CT/1 TASK audit target=src/sec scope=crypto,kdf,permissions model=opus timeout=5m
```

### Status Report

```
# Natural language (~35 tokens):
"The security audit is approximately 70% complete. Currently in the research
phase, examining CVE databases. Found 3 findings so far, used 4200 input
tokens and 1800 output tokens."

# ClawTalk (~15 tokens):
CT/1 STATUS run=a3f progress=0.7 phase=research findings=3 tok=4.2k/1.8k
```

### Error Report

```
# Natural language (~30 tokens):
"The web search tool timed out after 30 seconds while searching for
Node.js vulnerability information. Will retry with a more focused query."

# ClawTalk (~12 tokens):
CT/1 ERR code=timeout tool=web_search q="nodejs vuln" elapsed=30s retry=true
```

### Multi-Operation

```
# Natural language (~50 tokens):
"I've completed the audit. Here's the summary: 3 critical findings,
2 warnings, took 4 minutes 32 seconds, used 12,400 tokens total,
estimated cost $0.18. The full report is attached below."

# ClawTalk (~20 tokens):
CT/1 RES ok findings=3/2/0 duration=4m32s tok=12.4k cost=$0.18
---
{ "report": [...] }
```

## Configuration

```json5
{
  agents: {
    defaults: {
      clawtalk: {
        enabled: false,                    // opt-in
        version: 1,                        // protocol version
        dictionaryPath: null,              // path to dictionary file, null = default
        compressionLevel: "transport",     // "transport" | "hybrid" | "native"
        // "transport": LLM never sees CT format (Phase 1-2)
        // "hybrid": proven macros shown to LLM (Phase 3)
        // "native": LLM communicates in CT format (experimental)
        autoPropose: true,                 // agents can propose new macros
        autoApproveThreshold: 50,          // auto-approve after N successful uses
        maxDictionarySize: 500,            // max macros before LRU eviction
        metrics: true,                     // track compression/comprehension metrics
        fallbackOnError: true              // fall back to natural language on parse error
      }
    }
  }
}
```

## Fallback Behavior

ClawTalk always falls back gracefully:

1. **Parse error**: If a CT/1 message can't be parsed, pass through as-is (natural language)
2. **Unknown macro**: If a macro isn't in the dictionary, expand to `CT/1 ERR unknown_macro name=X`
3. **Version mismatch**: If receiver has older dictionary, sender re-sends in natural language
4. **Disabled**: If ClawTalk is disabled on either end, all communication is natural language

This means ClawTalk can be enabled/disabled per-agent without breaking anything.

## Commands

| Command | Description |
|---|---|
| `/clawtalk status` | Show protocol version, dictionary version, compression stats |
| `/clawtalk dict` | List all macros and abbreviations |
| `/clawtalk propose <name> <expansion>` | Manually propose a macro |
| `/clawtalk approve <name>` | Approve a proposed macro |
| `/clawtalk reject <name>` | Reject a proposed macro |
| `/clawtalk test <message>` | Encode a natural language message and show CT format |
| `/clawtalk metrics [days]` | Show compression ratio, savings, error rate |
| `/clawtalk reset` | Reset dictionary to defaults |

## Implementation Checklist

### Phase 1: Structured Protocol DSL (3-4 days)
- [ ] Define CT/1 grammar (parser.ts)
- [ ] Implement encoder (natural language → CT/1)
- [ ] Implement decoder (CT/1 → natural language)
- [ ] Implement payload block handling (--- delimiter)
- [ ] Integrate with squad IPC (transparent middleware)
- [ ] Integrate with sessions_send tool (transparent middleware)
- [ ] Add x-clawtalk-* metadata headers
- [ ] Add fallback behavior (parse error → passthrough)
- [ ] Write parser + encoder + decoder tests
- [ ] Add config schema (agents.defaults.clawtalk.*)

### Phase 2: Learned Dictionary (2-3 days)
- [ ] Implement dictionary store (load/save/version)
- [ ] Implement macro expansion with parameter substitution
- [ ] Implement abbreviation compression/expansion
- [ ] Build proposal workflow (propose/approve/reject/auto-approve)
- [ ] Add `/clawtalk` command handler
- [ ] Create default dictionary with initial macros
- [ ] Add usage tracking per macro
- [ ] Implement LRU eviction for unused macros

### Phase 3: Self-Optimization (2-3 days)
- [ ] Integrate with self_mirror for pattern observation
- [ ] Implement frequency analysis of IPC traffic
- [ ] Implement entropy measurement per message
- [ ] Build compression ratio tracking
- [ ] Build comprehension verification (decode success rate)
- [ ] Implement A/B testing for hybrid mode
- [ ] Add gradual LLM exposure for proven macros
- [ ] Add deprecation workflow for underused macros

## Estimated Total Effort

| Phase | Effort | Dependencies |
|---|---|---|
| Phase 1: Structured DSL | 3-4 days | None (standalone) |
| Phase 2: Learned Dictionary | 2-3 days | Phase 1 complete; self_mirror for proposals |
| Phase 3: Self-Optimization | 2-3 days | Phase 2 + self_mirror + entropy metrics |
| **Total** | **7-10 days** | |

## Cost Impact

### Savings Model

Assuming a squad of 4 agents with 20 inter-agent messages per task:

| Communication | Natural language | ClawTalk | Savings |
|---|---|---|---|
| Per message | ~40 tokens | ~15 tokens | 62% |
| Per task (20 msgs) | ~800 tokens | ~300 tokens | 500 tokens |
| Per day (10 tasks) | ~8,000 tokens | ~3,000 tokens | 5,000 tokens |
| Per month | ~240k tokens | ~90k tokens | 150k tokens |

At $3/M tokens (mid-range model): **~$0.45/month savings**.

Savings grow with squad size and task complexity. For intensive multi-agent workflows (50+ messages/task), savings can reach **$2-5/month**.

### Overhead

ClawTalk itself has minimal overhead:
- Dictionary in memory: <10KB
- Encode/decode: <1ms per message
- Metrics tracking: ~100 bytes per message

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Debugging opacity | All CT messages logged in both compressed and expanded form; `--verbose` shows wire format |
| Protocol drift | Version pinning (CT/1); dictionary append-only with tombstones; breaking changes require version bump |
| Dictionary bloat | Max 500 macros; LRU eviction; mirror proposes deprecations |
| Comprehension errors | Decoder validates against grammar; fallback to plain text on error; error rate per macro |
| Premature optimization | Phase 1 is pure engineering; Phase 2+ waits for sufficient volume |
| Vendor lock-in | CT format is simple text — any LLM can learn to parse it with few-shot examples |

## Synergies

- **self_mirror**: Primary driver of Phase 3 optimization; observes communication patterns and proposes compressions
- **Internal consciousness**: Security audits use CT macros for common scan patterns, reducing cost
- **Entropy**: Information-theoretic metrics (Shannon entropy, mutual information) measure protocol efficiency
- **Squad system**: Largest beneficiary — squad coordinator-worker exchanges are the highest-volume communication channel
