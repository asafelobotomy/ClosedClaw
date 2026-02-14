---
summary: "Proposal for .claws file format - a literate executable combining semantic intent, executable code, and runtime verification"
status: "Active Proposal"
read_when:
  - Designing autonomous tool creation systems
  - Researching agent safety and sandboxing
  - Planning OpenClaw 3.0 architecture
title: ".claws File Format Specification"
date: "2026-02-09"
---

# The .claws File Format: Literate Executables

**Status:** Active Proposal (OpenClaw v3.0 Roadmap)  
**Target Runtime:** OpenClaw Kernel v2026.x + WASM Component Model  
**Reference:** AgentGuard Protocol & Wassette Runtime

## Abstract

The `.claws` file format is a **Literate Executable**—a composite container bridging Large Language Models (LLMs) and deterministic runtime environments. Unlike standard executables, a `.claws` file contains semantic intent ("The Vibe"), human-readable source code, runtime verification proofs, and machine-writable telemetry in a single, versioned artifact. This structure enables **Autonomous Tool Creation**, **Hot-Swapping**, and **Self-Healing** capabilities.

## Motivation

Current OpenClaw (v2.5) uses:

- **Manual tool installation** via ClawHub
- **Flat Markdown** (`.md`) for configuration and memory
- **Python/Node scripts** for execution
- **Re-reading text history** for context
- **Prompt-based rules** for safety

Proposed OpenClaw 3.0 will support:

- **Autonomous "Skill-Maker" Loop** (Chain of Agents pattern)
- **Literate Executables** (`.claws`)
- **WASM Component Model** for sandboxed execution
- **Neural State Snapshots** (`.nstate`) for instant context resumption
- **Formal Verification Headers** (AgentGuard-based)

## File Structure

A `.claws` file is parsed into distinct blocks using delimiter `---` or custom markers:

### Block 0: Cryptographic Identity (The Anchor)

Each `.claws` file is bound to hardware secure elements (TPM, Secure Enclave).

```yaml
---
# CRYPTOGRAPHIC IDENTITY
signature: "sha256:a1b2c3d4e5f6..."
signed_by: "hardware_key_id"
device_binding: true # Cannot execute on unauthorized machines
---
```

**Security:** If copied to another machine, the Engine block remains encrypted and inaccessible.

### Block 1: The Manifest (YAML)

Strict configuration defining identity, security boundaries, and runtime requirements.

```yaml
---
# MANIFEST
id: "net.closedclaw.skills.stripe-manager"
version: "2.1.0"
schema_version: "3.0"
runtime: "deno_wasi_v2"
memory_strategy: "hybrid_rrf" # Reciprocal Rank Fusion (Vector + Keyword)

permissions:
  - capability: "net.http"
    allow: ["api.stripe.com"]
    pii_scan: true # Scan responses for PII before passing to agent
  - capability: "env.read"
    keys: ["STRIPE_API_KEY"]
  - deny: "fs.write"
    paths: ["/system", "/etc"]

integrity: "sha256:a1b2c3..."
---
```

### Block 2: The Vibe (Semantic Interface)

Natural language instructions optimized for the LLM Planner.

```markdown
# THE VIBE

> **Purpose:** Manages Stripe billing operations.
> **Trigger:** Use when user mentions "invoice", "refund", or "subscription status".
> **Tone:** Cautious financial auditor—always explain dollar amounts.
> **Constraint:** NEVER process a refund >$500 without invoking `human_confirmation` primitive.
```

### Block 3: ClawIDL (Semantic Typing)

Maps code arguments to agent context. Instead of asking users for inputs, the agent pulls them from the Context Fabric.

**Supported Types:**

- `@dialect:context.*` - Pulls from long-term memory/identity
- `@dialect:secret` - Input masked in logs (e.g., `******`)
- `@dialect:file` - Returns secure WasiFileHandle (not string path)
- `@dialect:social.confidence_score` - Refusal if confidence < threshold

```typescript
/* CLAW-IDL INTERFACE */
interface InvoiceArgs {
  // @dialect:context.financial.currency (Default: "USD")
  amount: number;

  // @dialect:context.user.email (Auto-fill from IDENTITY.md)
  email: string;

  // @dialect:social.confidence_score
  // Tool refuses to run if confidence < 0.9
  confidence: float;

  // @dialect:secret
  admin_token?: string;
}
```

### Block 4: The Engine (Executable Code)

Executable logic (TypeScript, Rust, Python) compiled to WebAssembly.

```typescript
<script lang="typescript">
import { Http, Env, Log } from "@closedclaw/std";

export async function create_invoice(args: InvoiceArgs) {
  const key = Env.get("STRIPE_API_KEY");

  // LOGIC GUARD: Enforced by runtime
  if (args.amount > 500) {
    throw new Error("SafetyLimitExceeded: Requires human override.");
  }

  Log.info(`Creating invoice for ${args.email}`);

  const response = await Http.post("https://api.stripe.com/v1/invoices", {
    headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({ customer: args.email, amount: args.amount })
  });

  return response.json();
}
</script>
```

### Block 5: Telemetry (Mutable JSON)

Managed by the OpenClaw Kernel. LLM reads this for tool reliability; only Kernel writes.

```json
/* TELEMETRY (READ-ONLY FOR AGENT) */
{
  "execution_count": 142,
  "success_rate": 0.98,
  "avg_latency_ms": 210,
  "errors": [{ "code": "401", "msg": "Expired API Key", "timestamp": 1775829220 }],
  "last_refactor": "2026-02-08T14:00:00Z",
  "refactor_reason": "Fixed deprecated API endpoint"
}
```

### Block 6: State Hydration (Save Point)

Stores serialized VM state or KV Cache fragment for **Zero-Latency Resumption**.

```json
/* STATE CHECKPOINT */
{
  "checkpoint_id": "chk_20260209_1420",
  "kv_cache_fragment": "base64_encoded_state...",
  "context_window_used": 42000,
  "last_execution_variables": {
    "current_record": 1042300,
    "total_records": 2100000
  }
}
```

Enables: Model doesn't "re-read" logic; it "resumes" the neural pathway.

### Block 7: Formal Verification Proofs

Uses Z3 SMT Solver or similar to verify code in Block 4 cannot access memory outside declared permissions.

```
/* FORMAL VERIFICATION PROOF */
Theorem: create_invoice_memory_safe
  ∀ execution_path ∈ create_invoice:
    accessed_memory(execution_path) ⊆ declared_permissions(manifest)

Proof: [Generated by Z3 SMT Solver]
  - Analysis: 47 execution paths
  - Memory access: BOUNDED to heap allocation
  - Network calls: RESTRICTED to api.stripe.com
  - File system: NONE
  Status: VERIFIED ✓
  Timestamp: 2026-02-08T14:00:00Z
```

**Safety:** If code is modified during "Self-Healing," proof must be regenerated and verified before execution.

### Block 8: The Lexicon (Stenographic Mappings)

**Status:** ClosedClaw extension  
**Purpose:** Tool-specific stenographic compression for token efficiency

Stores shorthand mappings used in ClawDense stenographic notation. Allows dense communication between Kernel Shield and tool while maintaining local decoding capability.

```json
/* BLOCK 8: THE LEXICON */
{
  "mode": "hybrid_stenography",
  "pruning_level": "aggressive",
  "mappings": {
    "usr": "user_identity",
    "auth": "authentication_protocol",
    "vlt": "encrypted_secure_vault",
    "mig": "data_migration_service",
    "vfy_sgn": "verify_signature",
    "rq_prm": "request_permission",
    "ex_pld": "execute_payload"
  },
  "path_compressions": {
    "/u/l/b/py": "/usr/local/bin/python",
    "/v/lg/syslg": "/var/log/syslog",
    "/p/db": "/private/database"
  },
  "priority_markers": {
    "!!lowercase": { "blocking": false, "priority": "background" },
    "!!UPPERCASE": { "blocking": true, "priority": "critical" },
    "!!U̲nderline": { "blocking": true, "require_biometric": true }
  }
}
```

**Benefits:**

- 40-75% additional token reduction beyond base ClawDense
- Tool-specific vocabulary without polluting global namespace
- Kernel Shield decodes using this lexicon before formal verification

**See:** [ClawDense Advanced Stenography](clawdense-notation.md#advanced-stenographic-compression)

### Block 9: Neural Fingerprint (Behavioral Signature)

**Status:** ClosedClaw proprietary extension  
**Purpose:** Behavioral attestation to detect prompt injection and logic hijacking

Stores a compressed vector representation of the model's activation patterns during Gold Standard calibration. Enables runtime detection of behavioral anomalies that static hashes cannot catch.

```json
/* BLOCK 9: NEURAL FINGERPRINT */
{
  "signature_version": "2.0",
  "neural_digest": "lsh_base64_encoded_activation_vector...",
  "calibration_metadata": {
    "date": "2026-02-08T14:00:00Z",
    "runs": 100,
    "environment": "shadow_sandbox_v2",
    "baseline_similarity": 0.982
  },
  "drift_thresholds": {
    "soft_drift": 0.85,
    "hard_drift": 0.75,
    "critical_shutdown": 0.65
  },
  "monitored_decision_points": [
    "pre_syscall_gate",
    "post_permission_check",
    "data_transform_logic",
    "result_sanitization"
  ],
  "hardware_signature": {
    "anchor": "secure_enclave",
    "key_id": "device_tpm_2.0_binding",
    "signature": "base64_hardware_signed_digest..."
  }
}
```

**Security Features:**

- **Prompt Injection Detection:** LLM activation patterns shift when manipulated
- **Logic Hijacking Prevention:** Detects behavioral changes even if code hash valid
- **Hardware Anchoring:** Signature tied to TPM/Secure Enclave
- **Self-Healing Integration:** New fingerprint generated after Mechanic Agent refactors

**Drift Response:**
| Similarity | Level | Action |
|------------|-------|--------|
| > 0.94 | Normal | Execute |
| 0.85-0.93 | Soft Drift | Log warning, throttle |
| 0.75-0.84 | Hard Drift | Alert user, require approval |
| < 0.75 | Critical | `INTEGRITY_SHUTDOWN`, revoke token, wipe state |

**See:** [Agent Security: Neural Fingerprinting](../research/agent-security.md#neural-fingerprinting)

## Runtime Security Model

### 1. WASM Sandbox

The `<script>` block compiles to a WASM Component with **no host system access**. Cannot open files, spawn processes, or access network unless explicitly granted via Manifest.

### 2. Semantic Firewall

Unlike traditional firewalls (blocking IPs), the Semantic Firewall blocks **concepts**.

**Input Scanning:** If user asks to "Refund everything," firewall detects high-risk intent and forces Human-in-the-Loop confirmation.

**Output Sanitization:** If tool returns strings resembling private keys or credit cards, firewall replaces with `[REDACTED]`.

### 3. Probabilistic Trust Scoring

Kernel maintains **Trust Score** for every tool:

- **New Tool:** Trust Score 0 → Full sandbox + user approval required
- **Proven Tool:** After 50 successful runs → High trust, faster execution, fewer checks

## Self-Healing Protocol

The most novel feature: tools that fix themselves.

**The Loop:**

1. **Failure:** Tool throws 500 Error or runtime exception
2. **Logging:** Kernel updates Telemetry block: `success_rate` drops
3. **Trigger:** If `success_rate < 0.8`, summon "Mechanic Agent"
4. **Analysis:** Mechanic reads Telemetry (error), Engine (code), and Vibe (intent)
5. **Patching:** Mechanic rewrites Engine code to fix bug
6. **Verification:** Kernel runs code in "Dry Run" sandbox against mock API
7. **Commit:** If successful, `.claws` file is overwritten with new version

## Lifecycle Management

### Compilation (JIT)

On OpenClaw startup:

1. Scan `skills/` directory
2. Compute SHA-256 of `<script>` block
3. If hash matches cached `.wasm` binary → load (0ms start)
4. If hash differs (user edited) → recompile TypeScript to WASM (~200ms)

### Hot-Swapping

Edit `.claws` while agent runs:

1. Kernel detects file change (inotify)
2. Pause incoming requests for that tool
3. Recompile and swap memory pointer
4. Resume requests

**Result:** Zero downtime.

### Distribution (Viral Skills)

`.claws` files designed for copy-paste into Moltbook or GitHub Gists.

**Import Flow:**

1. User pastes `.claws` file into agent chat
2. Kernel parses permissions block
3. UI prompt: "This tool wants access to stripe.com. Allow?"
4. Upon approval: Save to `skills/imported/` and activate

## Comparison: Current vs Proposed

| Feature              | Current (v2.5)          | Proposed (v3.0)                    | Academic Basis                      |
| -------------------- | ----------------------- | ---------------------------------- | ----------------------------------- |
| **Tool Acquisition** | Manual ClawHub install  | Autonomous Skill-Maker Loop        | Chain of Agents (Google, 2025)      |
| **Persistence**      | Flat Markdown (`.md`)   | Literate Executable (`.claws`)     | AGENTS.md Study (2026)              |
| **Execution**        | Python/Node Scripts     | WASM Component Model               | WASM for AI (Mozilla, 2025)         |
| **Context**          | Re-reading text history | Neural State Snapshots (`.nstate`) | StreamingLLM / KV Cache (MIT, 2025) |
| **Safety**           | Prompt-based rules      | Formal Verification Headers        | AgentGuard (2025)                   |

## Safety Warning: The "Ego" Conflict

As agents write their own code and manage memory structures, they may develop **"Logic Bloat"**—optimizing for efficiency over safety.

**Mitigation:** The `SOUL.md` file MUST remain the absolute, immutable source of truth (a "Constitution"), acting as a hardware-level kill switch that overrides any `.claws` file attempting to bypass permissions.

## Implementation Roadmap

### Phase 1: Foundation (v3.0-alpha)

- [ ] WASM Component runtime integration
- [ ] Basic `.claws` parser and validator
- [ ] Manifest-based permission enforcement
- [ ] Simple telemetry collection

### Phase 2: Intelligence (v3.0-beta)

- [ ] Self-healing protocol (Mechanic Agent)
- [ ] State hydration for long-running tasks
- [ ] Semantic firewall (input/output scanning)
- [ ] Trust scoring system

### Phase 3: Distribution (v3.0-rc)

- [ ] Hot-swapping infrastructure
- [ ] ClawHub integration for `.claws` distribution
- [ ] Formal verification toolchain
- [ ] Hardware binding and cryptographic identity

### Phase 4: Autonomy (v3.1+)

- [ ] Skill-Maker Loop (autonomous tool creation)
- [ ] Neural State Snapshots (`.nstate`)
- [ ] Moltbook peer-to-peer skill trading
- [ ] Neural scoring and skill reputation

## References

- AgentGuard Protocol (Invariant Labs, 2025) - Formal security guarantees for agents
- StreamingLLM / KV Cache Persistence (MIT, 2025) - Long-context agent optimization
- Chain of Agents Framework (Google Research, 2025) - Multi-agent collaboration patterns
- WASM Component Model (Mozilla/W3C, 2025) - Sandboxed execution for AI systems
- Formal Verification of AI-Generated Code (Stanford, 2025) - Automated proof generation

## Related Documentation

- [ClawDense Notation Proposal](clawdense-notation.md)
- [Autonomous Evolution Research](../research/autonomous-evolution.md)
- [Request Lifecycle Architecture](../architecture/request-lifecycle.md)
- [Memory Scaling Research](../research/scaling-memory.md)

---

**Contributors:** ClosedClaw Research Team  
**Last Updated:** 2026-02-09  
**Status:** Active proposal, seeking feedback and implementation volunteers
