/**
 * Tests for future .claws blocks (0, 3, 4, 6, 7), Kernel Shield,
 * Neural Attestation runtime, and Shadow Factory scaffolding.
 */
import { describe, it, expect } from "vitest";
import {
  parseClawsFile,
  splitBlocks,
  type ClawsIdentity,
  type ClawsIdl,
  type ClawsEngine,
  type ClawsStateCheckpoint,
  type ClawsVerificationProof,
} from "../src/agents/clawtalk/claws-parser.js";
import {
  checkStructural,
  computeRiskVector,
  checkAttestation,
  cosineSimilarity,
  evaluateShield,
  type ToolInvocationContext,
} from "../src/agents/clawtalk/kernel-shield.js";
import {
  AttestationMonitor,
  parseDigest,
} from "../src/agents/clawtalk/neural-attestation.js";
import {
  analyzeGaps,
  generateDraft,
  recordFuzzResults,
  evaluateOptimization,
  createShadowTool,
  advancePhase,
} from "../src/agents/clawtalk/shadow-factory.js";

// ═══════════════════════════════════════════════════════════════════════════
// Block 0: Cryptographic Identity
// ═══════════════════════════════════════════════════════════════════════════

describe("Block 0 — Cryptographic Identity", () => {
  const IDENTITY_DOC = `---
# CRYPTOGRAPHIC IDENTITY
signature: "sha256:a1b2c3d4e5f6"
signed_by: "hardware_key_id"
device_binding: true
---
# MANIFEST
id: "signed_tool"
version: "1.0.0"
permissions:
  []
---
# THE VIBE
> **Purpose:** A signed tool
> **Trigger:** test
`;

  it("parses identity block with all fields", () => {
    const file = parseClawsFile(IDENTITY_DOC);
    expect(file.identity).not.toBeNull();
    const id = file.identity!;
    expect(id.signature).toBe("sha256:a1b2c3d4e5f6");
    expect(id.signedBy).toBe("hardware_key_id");
    expect(id.deviceBinding).toBe(true);
  });

  it("returns null identity when block is missing", () => {
    const noId = `---\n# MANIFEST\nid: "x"\nversion: "1.0"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(noId);
    expect(file.identity).toBeNull();
  });

  it("handles device_binding=false", () => {
    const doc = `---\n# CRYPTOGRAPHIC IDENTITY\nsignature: "sha256:abc"\nsigned_by: "tpm_2"\ndevice_binding: false\n---\n# MANIFEST\nid: "t"\nversion: "1.0"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.identity!.deviceBinding).toBe(false);
  });

  it("returns null when signature is missing", () => {
    const doc = `---\n# CRYPTOGRAPHIC IDENTITY\nsigned_by: "tpm"\ndevice_binding: true\n---\n# MANIFEST\nid: "t"\nversion: "1.0"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.identity).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 3: Claw-IDL
// ═══════════════════════════════════════════════════════════════════════════

describe("Block 3 — Claw-IDL", () => {
  const IDL_DOC = `---
# MANIFEST
id: "idl_tool"
version: "1.0.0"
permissions:
  []
---
# THE VIBE
> **Purpose:** IDL demo
> **Trigger:** test
---
# CLAW-IDL INTERFACE
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
`;

  it("parses interface name", () => {
    const file = parseClawsFile(IDL_DOC);
    expect(file.idl).not.toBeNull();
    expect(file.idl!.interfaceName).toBe("InvoiceArgs");
  });

  it("parses all fields with correct types", () => {
    const file = parseClawsFile(IDL_DOC);
    const fields = file.idl!.fields;
    expect(fields.length).toBe(4);
    expect(fields[0]).toMatchObject({ name: "amount", type: "number", optional: false });
    expect(fields[1]).toMatchObject({ name: "email", type: "string", optional: false });
    expect(fields[2]).toMatchObject({ name: "confidence", type: "float", optional: false });
    expect(fields[3]).toMatchObject({ name: "admin_token", type: "string", optional: true });
  });

  it("parses @dialect annotations", () => {
    const file = parseClawsFile(IDL_DOC);
    const fields = file.idl!.fields;
    expect(fields[0].dialect).toBe("context.financial.currency");
    expect(fields[1].dialect).toBe("context.user.email");
    expect(fields[2].dialect).toBe("social.confidence_score");
    expect(fields[3].dialect).toBe("secret");
  });

  it("returns null when no interface is found", () => {
    const doc = `---\n# CLAW-IDL\nno interface here\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.idl).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 4: Engine
// ═══════════════════════════════════════════════════════════════════════════

describe("Block 4 — Engine", () => {
  const ENGINE_DOC = `---
# MANIFEST
id: "engine_tool"
version: "1.0.0"
permissions:
  []
---
# THE VIBE
> **Purpose:** Engine test
> **Trigger:** test
---
# ENGINE
<script lang="typescript">
import { Http, Env, Log } from "@closedclaw/std";

export async function create_invoice(args: InvoiceArgs) {
  const key = Env.get("STRIPE_API_KEY");
  if (args.amount > 500) {
    throw new Error("SafetyLimitExceeded");
  }
  return Http.post("https://api.stripe.com/v1/invoices", {});
}
</script>
`;

  it("parses engine lang", () => {
    const file = parseClawsFile(ENGINE_DOC);
    expect(file.engine).not.toBeNull();
    expect(file.engine!.lang).toBe("typescript");
  });

  it("extracts exports", () => {
    const file = parseClawsFile(ENGINE_DOC);
    expect(file.engine!.exports).toContain("create_invoice");
  });

  it("extracts imports", () => {
    const file = parseClawsFile(ENGINE_DOC);
    expect(file.engine!.imports).toContain("@closedclaw/std");
  });

  it("generates a source hash", () => {
    const file = parseClawsFile(ENGINE_DOC);
    expect(file.engine!.sourceHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("parses engine without <script> tags as fallback", () => {
    const doc = `---\n# ENGINE\nexport function hello() { return "hi"; }\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.engine).not.toBeNull();
    expect(file.engine!.exports).toContain("hello");
    expect(file.engine!.lang).toBe("typescript"); // default
  });

  it("returns null for empty engine block", () => {
    const doc = `---\n# ENGINE\n\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.engine).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 6: State Hydration
// ═══════════════════════════════════════════════════════════════════════════

describe("Block 6 — State Hydration", () => {
  const STATE_DOC = `---
# MANIFEST
id: "state_tool"
version: "1.0.0"
permissions:
  []
---
# THE VIBE
> **Purpose:** State test
> **Trigger:** test
---
/* STATE CHECKPOINT */
{
  "checkpoint_id": "chk_20260209_1420",
  "kv_cache_fragment": "base64encodedstate",
  "context_window_used": 42000,
  "last_execution_variables": {
    "current_record": 1042300,
    "total_records": 2100000
  }
}
`;

  it("parses checkpoint ID", () => {
    const file = parseClawsFile(STATE_DOC);
    expect(file.stateCheckpoint).not.toBeNull();
    expect(file.stateCheckpoint!.checkpointId).toBe("chk_20260209_1420");
  });

  it("parses kv cache fragment", () => {
    const file = parseClawsFile(STATE_DOC);
    expect(file.stateCheckpoint!.kvCacheFragment).toBe("base64encodedstate");
  });

  it("parses context window used", () => {
    const file = parseClawsFile(STATE_DOC);
    expect(file.stateCheckpoint!.contextWindowUsed).toBe(42000);
  });

  it("parses last execution variables", () => {
    const file = parseClawsFile(STATE_DOC);
    const vars = file.stateCheckpoint!.lastExecutionVariables;
    expect(vars.current_record).toBe(1042300);
    expect(vars.total_records).toBe(2100000);
  });

  it("returns null for invalid JSON", () => {
    const doc = `---\n/* STATE CHECKPOINT */\nnot json\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.stateCheckpoint).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 7: Formal Verification
// ═══════════════════════════════════════════════════════════════════════════

describe("Block 7 — Formal Verification", () => {
  const VERIFY_DOC = `---
# MANIFEST
id: "verified_tool"
version: "1.0.0"
permissions:
  []
---
# THE VIBE
> **Purpose:** Verification test
> **Trigger:** test
---
# FORMAL VERIFICATION PROOF
Theorem: create_invoice_memory_safe
  All execution paths in create_invoice:
    accessed_memory ⊆ declared_permissions(manifest)

Proof: [Generated by Z3 SMT Solver]
  - Analysis: 47 execution paths
  - Memory access: BOUNDED to heap allocation
  - Network calls: RESTRICTED to api.stripe.com
  - File system: NONE
  Status: VERIFIED ✓
  Timestamp: 2026-02-08T14:00:00Z
`;

  it("parses theorem name", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification).not.toBeNull();
    expect(file.verification!.theorem).toBe("create_invoice_memory_safe");
  });

  it("parses paths analysed", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.pathsAnalysed).toBe(47);
  });

  it("parses memory access", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.memoryAccess).toBe("BOUNDED to heap allocation");
  });

  it("parses network calls", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.networkCalls).toBe("RESTRICTED to api.stripe.com");
  });

  it("parses file system", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.fileSystem).toBe("NONE");
  });

  it("parses VERIFIED status", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.status).toBe("VERIFIED");
  });

  it("parses timestamp", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.timestamp).toBe("2026-02-08T14:00:00Z");
  });

  it("parses solver", () => {
    const file = parseClawsFile(VERIFY_DOC);
    expect(file.verification!.solver).toBe("Z3 SMT Solver");
  });

  it("parses FAILED status", () => {
    const doc = `---\n# FORMAL VERIFICATION PROOF\nTheorem: broken_test\nStatus: FAILED\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.verification!.status).toBe("FAILED");
  });

  it("defaults to PENDING when no status", () => {
    const doc = `---\n# FORMAL VERIFICATION PROOF\nTheorem: pending_test\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.verification!.status).toBe("PENDING");
  });

  it("returns null when no theorem is found", () => {
    const doc = `---\n# FORMAL VERIFICATION PROOF\nno theorem here\n---\n# MANIFEST\nid: "t"\nversion: "1"\npermissions:\n  []\n---\n# THE VIBE\ntest`;
    const file = parseClawsFile(doc);
    expect(file.verification).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Full .claws with all blocks
// ═══════════════════════════════════════════════════════════════════════════

describe("Full .claws with all 10 blocks", () => {
  const FULL_DOC = `---
# CRYPTOGRAPHIC IDENTITY
signature: "sha256:full_test"
signed_by: "enclave_1"
device_binding: true
---
# MANIFEST
id: "full_tool"
version: "2.0.0"
schema_version: "3.0"
runtime: "deno_wasi_v2"
permissions:
  - capability: "net.http"
    allow: ["api.example.com"]
---
# THE VIBE
> **Purpose:** Full integration test
> **Trigger:** When user says "full test"
---
# CLAW-IDL INTERFACE
interface TestArgs {
  // @dialect:context.user.name
  name: string;
  count?: number;
}
---
# ENGINE
<script lang="typescript">
export async function run(args: TestArgs) {
  return { greeting: "Hello " + args.name };
}
</script>
---
/* TELEMETRY */
{
  "execution_count": 42,
  "success_rate": 0.95,
  "avg_latency_ms": 120,
  "errors": []
}
---
/* STATE CHECKPOINT */
{
  "checkpoint_id": "chk_full_test",
  "context_window_used": 1000,
  "last_execution_variables": { "step": 5 }
}
---
# FORMAL VERIFICATION PROOF
Theorem: run_safe
  - Analysis: 3 execution paths
  - Memory access: BOUNDED
  - Network calls: RESTRICTED to api.example.com
  - File system: NONE
  Status: VERIFIED
  Timestamp: 2026-02-09T10:00:00Z
---
/* THE LEXICON */
{
  "mode": "hybrid_stenography",
  "mappings": { ">>$": "invoke subagent" }
}
---
/* NEURAL FINGERPRINT */
{
  "signature_version": "1.0",
  "neural_digest": "0.5,0.3,0.8,0.1",
  "drift_thresholds": { "soft_drift": 0.94, "hard_drift": 0.85 }
}
`;

  it("parses all 10 blocks from a complete .claws file", () => {
    const file = parseClawsFile(FULL_DOC);
    expect(file.identity).not.toBeNull();
    expect(file.manifest.id).toBe("full_tool");
    expect(file.vibe.purpose).toBe("Full integration test");
    expect(file.idl?.interfaceName).toBe("TestArgs");
    expect(file.engine?.exports).toContain("run");
    expect(file.telemetry?.executionCount).toBe(42);
    expect(file.stateCheckpoint?.checkpointId).toBe("chk_full_test");
    expect(file.verification?.status).toBe("VERIFIED");
    expect(file.lexicon?.mode).toBe("hybrid_stenography");
    expect(file.fingerprint?.neuralDigest).toBe("0.5,0.3,0.8,0.1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kernel Shield
// ═══════════════════════════════════════════════════════════════════════════

describe("Kernel Shield — Layer 1 (Structural)", () => {
  const manifest = {
    id: "test",
    version: "1.0",
    permissions: [
      { capability: "net.http", allow: ["api.example.com"] },
      { capability: "fs.read" },
    ],
    raw: "",
  };

  it("passes when all capabilities are permitted", () => {
    const ctx: ToolInvocationContext = {
      toolName: "test_tool",
      requestedCapabilities: ["net.http"],
      accessProbability: 0.1,
      dataSensitivity: 0.1,
      trustScore: 0.9,
    };
    const result = checkStructural(manifest, null, ctx);
    expect(result.passed).toBe(true);
  });

  it("fails when a capability is not in manifest", () => {
    const ctx: ToolInvocationContext = {
      toolName: "test_tool",
      requestedCapabilities: ["env.write"],
      accessProbability: 0.1,
      dataSensitivity: 0.1,
      trustScore: 0.9,
    };
    const result = checkStructural(manifest, null, ctx);
    expect(result.passed).toBe(false);
    expect(result.violatedPermission).toBe("env.write");
  });

  it("marks proof verified when proof is VERIFIED", () => {
    const proof: ClawsVerificationProof = {
      theorem: "test", status: "VERIFIED", raw: "",
    };
    const ctx: ToolInvocationContext = {
      toolName: "t", requestedCapabilities: ["fs.read"],
      accessProbability: 0, dataSensitivity: 0, trustScore: 1,
    };
    const result = checkStructural(manifest, proof, ctx);
    expect(result.proofVerified).toBe(true);
  });

  it("marks proof not verified when status is FAILED", () => {
    const proof: ClawsVerificationProof = {
      theorem: "test", status: "FAILED", raw: "",
    };
    const ctx: ToolInvocationContext = {
      toolName: "t", requestedCapabilities: ["fs.read"],
      accessProbability: 0, dataSensitivity: 0, trustScore: 1,
    };
    const result = checkStructural(manifest, proof, ctx);
    expect(result.proofVerified).toBe(false);
  });
});

describe("Kernel Shield — Layer 2 (Semantic)", () => {
  it("returns low risk for trusted tool with low access", () => {
    const result = computeRiskVector({
      toolName: "t", requestedCapabilities: [],
      accessProbability: 0.1, dataSensitivity: 0.1, trustScore: 0.9,
    });
    expect(result.level).toBe("low");
    expect(result.action).toBe("allow");
    // Vr = 0.1*0.1 + (1-0.9) = 0.01 + 0.1 = 0.11
    expect(result.riskVector).toBeCloseTo(0.11, 2);
  });

  it("returns medium risk for moderate scenario", () => {
    const result = computeRiskVector({
      toolName: "t", requestedCapabilities: [],
      accessProbability: 0.5, dataSensitivity: 0.5, trustScore: 0.7,
    });
    // Vr = 0.5*0.5 + (1-0.7) = 0.25 + 0.3 = 0.55
    expect(result.level).toBe("medium");
    expect(result.action).toBe("log");
  });

  it("returns high risk for untrusted tool with sensitive data", () => {
    const result = computeRiskVector({
      toolName: "t", requestedCapabilities: [],
      accessProbability: 0.9, dataSensitivity: 0.9, trustScore: 0.1,
    });
    // Vr = 0.9*0.9 + (1-0.1) = 0.81 + 0.9 = 1.71
    expect(result.level).toBe("high");
    expect(result.action).toBe("require_biometric");
  });
});

describe("Kernel Shield — Layer 3 (Attestation)", () => {
  const fingerprint = {
    signatureVersion: "1.0",
    neuralDigest: "1.0,0.0,0.0",
    driftThresholds: { softDrift: 0.94, hardDrift: 0.85 },
    raw: "",
  };

  it("returns no drift for identical vector", () => {
    const result = checkAttestation(fingerprint, [1.0, 0.0, 0.0]);
    expect(result.drift).toBe("none");
    expect(result.similarity).toBe(1.0);
    expect(result.action).toBe("allow");
  });

  it("returns soft drift for slightly different vector", () => {
    // cosine([1,0,0],[0.9,0.3,0.2]) ≈ 0.928 → soft drift (0.85–0.94)
    const result = checkAttestation(fingerprint, [0.9, 0.3, 0.2]);
    expect(result.drift).toBe("soft_drift");
    expect(result.action).toBe("log");
  });

  it("returns hard drift for very different vector", () => {
    const result = checkAttestation(fingerprint, [0.0, 1.0, 0.0]);
    expect(result.drift).toBe("hard_drift");
    expect(result.similarity).toBe(0);
    expect(result.action).toBe("block");
  });

  it("allows when no fingerprint provided", () => {
    const result = checkAttestation(null, [1, 0, 0]);
    expect(result.drift).toBe("none");
    expect(result.action).toBe("allow");
  });
});

describe("Kernel Shield — Combined evaluateShield", () => {
  const manifest = {
    id: "test", version: "1.0",
    permissions: [{ capability: "net.http" }],
    raw: "",
  };
  const proof: ClawsVerificationProof = {
    theorem: "test", status: "VERIFIED" as const, raw: "",
  };
  const fingerprint = {
    signatureVersion: "1.0",
    neuralDigest: "1.0,0.0,0.0",
    driftThresholds: { softDrift: 0.94, hardDrift: 0.85 },
    raw: "",
  };

  it("allows a fully passing invocation", () => {
    const verdict = evaluateShield(manifest, proof, fingerprint, {
      toolName: "t",
      requestedCapabilities: ["net.http"],
      accessProbability: 0.1,
      dataSensitivity: 0.1,
      trustScore: 0.9,
      liveActivation: [1.0, 0.0, 0.0],
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.action).toBe("allow");
  });

  it("blocks when structural check fails", () => {
    const verdict = evaluateShield(manifest, proof, fingerprint, {
      toolName: "t",
      requestedCapabilities: ["fs.write"],
      accessProbability: 0.1,
      dataSensitivity: 0.1,
      trustScore: 0.9,
      liveActivation: [1.0, 0.0, 0.0],
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.action).toBe("block");
  });

  it("blocks on hard drift even with good risk score", () => {
    const verdict = evaluateShield(manifest, proof, fingerprint, {
      toolName: "t",
      requestedCapabilities: ["net.http"],
      accessProbability: 0.1,
      dataSensitivity: 0.1,
      trustScore: 0.9,
      liveActivation: [0.0, 1.0, 0.0],
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.action).toBe("block");
  });

  it("requires biometric on high risk vector", () => {
    const verdict = evaluateShield(manifest, proof, fingerprint, {
      toolName: "t",
      requestedCapabilities: ["net.http"],
      accessProbability: 0.9,
      dataSensitivity: 0.9,
      trustScore: 0.1,
      liveActivation: [1.0, 0.0, 0.0],
    });
    expect(verdict.action).toBe("require_biometric");
    // require_biometric is not "allowed" strictly — it's pending approval
    expect(verdict.allowed).toBe(false);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Neural Attestation Runtime
// ═══════════════════════════════════════════════════════════════════════════

describe("AttestationMonitor", () => {
  const fingerprint = {
    signatureVersion: "1.0",
    neuralDigest: "1.0,0.0,0.0,0.0",
    driftThresholds: { softDrift: 0.94, hardDrift: 0.85 },
    raw: "",
  };

  it("allows when activation matches baseline", () => {
    const monitor = new AttestationMonitor(fingerprint);
    const result = monitor.check("test_tool", [1.0, 0.0, 0.0, 0.0]);
    expect(result.allow).toBe(true);
    expect(result.drift).toBe("none");
  });

  it("throttles on soft drift", () => {
    const monitor = new AttestationMonitor(fingerprint);
    // cosine([1,0,0,0],[0.9,0.3,0.2,0.1]) ≈ 0.923 → soft drift
    const result = monitor.check("test_tool", [0.9, 0.3, 0.2, 0.1]);
    expect(result.throttle).toBe(true);
    expect(result.drift).toBe("soft_drift");
    expect(result.allow).toBe(true);
  });

  it("shuts down on hard drift and quarantines tool", () => {
    const monitor = new AttestationMonitor(fingerprint);
    const result = monitor.check("danger_tool", [0.0, 1.0, 0.0, 0.0]);
    expect(result.shutdown).toBe(true);
    expect(result.drift).toBe("hard_drift");
    expect(result.allow).toBe(false);
    expect(monitor.quarantinedTools.has("danger_tool")).toBe(true);
  });

  it("blocks quarantined tools immediately", () => {
    const monitor = new AttestationMonitor(fingerprint);
    monitor.quarantineTool("blocked_tool");
    const result = monitor.check("blocked_tool", [1.0, 0.0, 0.0, 0.0]);
    expect(result.allow).toBe(false);
    expect(result.message).toContain("quarantined");
  });

  it("records drift events in history", () => {
    const monitor = new AttestationMonitor(fingerprint);
    monitor.check("tool_a", [1.0, 0.0, 0.0, 0.0]);
    monitor.check("tool_b", [0.0, 1.0, 0.0, 0.0]);
    expect(monitor.driftHistory.length).toBe(2);
    expect(monitor.driftHistory[0].toolName).toBe("tool_b"); // newest first
  });

  it("handles re-fingerprinting lifecycle", () => {
    const monitor = new AttestationMonitor(fingerprint);
    expect(monitor.state).toBe("active");

    // Deprecate
    const req = monitor.requestRefingerprint("Code was self-healed");
    expect(monitor.state).toBe("deprecated");
    expect(req.calibrationRuns).toBe(100);

    // While deprecated, execution is blocked
    const blocked = monitor.check("tool", [1.0, 0.0, 0.0, 0.0]);
    expect(blocked.allow).toBe(false);

    // Complete with new fingerprint
    monitor.completeRefingerprint({
      signatureVersion: "2.0",
      neuralDigest: "0.0,1.0,0.0,0.0",
      raw: "",
    });
    expect(monitor.state).toBe("active");

    // New baseline is [0,1,0,0], so [0,1,0,0] should pass
    const pass = monitor.check("tool", [0.0, 1.0, 0.0, 0.0]);
    expect(pass.allow).toBe(true);
  });

  it("releases tools from quarantine", () => {
    const monitor = new AttestationMonitor(fingerprint);
    monitor.quarantineTool("risky");
    expect(monitor.quarantinedTools.has("risky")).toBe(true);
    monitor.releaseTool("risky");
    expect(monitor.quarantinedTools.has("risky")).toBe(false);
  });
});

describe("parseDigest", () => {
  it("parses comma-separated floats", () => {
    expect(parseDigest("0.5, 0.3, 0.8, 0.1")).toEqual([0.5, 0.3, 0.8, 0.1]);
  });

  it("returns empty for non-comma string", () => {
    expect(parseDigest("single_value")).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(parseDigest("")).toEqual([]);
  });

  it("filters NaN values", () => {
    expect(parseDigest("0.5, abc, 0.3")).toEqual([0.5, 0.3]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Shadow Factory
// ═══════════════════════════════════════════════════════════════════════════

describe("Shadow Factory — analyzeGaps", () => {
  it("identifies a gap when no existing tool matches", () => {
    const result = analyzeGaps(
      "Generate invoice from Stripe data",
      ["web_search", "calculator"],
      { cliTools: [], apis: ["stripe.com"], databases: [], repositories: [] },
    );
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].name).toContain("generate_invoice");
  });

  it("reports no gaps when existing tool names overlap", () => {
    const result = analyzeGaps(
      "Use web search to find recipes",
      ["web_search", "calculator"],
      { cliTools: [], apis: [], databases: [], repositories: [] },
    );
    expect(result.gaps.length).toBe(0);
  });

  it("estimates complexity based on data sources", () => {
    const result = analyzeGaps(
      "Complex multi-step data pipeline integrating multiple services and orchestrating transforms",
      [],
      { cliTools: ["kubectl"], apis: ["api1.com", "api2.com", "api3.com", "api4.com"], databases: ["pg", "redis"], repositories: ["repo1"] },
    );
    expect(result.gaps[0].complexity).toBe("complex");
  });
});

describe("Shadow Factory — generateDraft", () => {
  it("generates a .claws template from a gap", () => {
    const gap = {
      name: "stripe_invoice",
      intent: "Create Stripe invoices",
      dataSources: ["stripe.com"],
      reason: "No tool for this",
      complexity: "simple" as const,
    };
    const draft = generateDraft(gap);
    expect(draft.clawsContent).toContain("stripe_invoice");
    expect(draft.clawsContent).toContain("Create Stripe invoices");
    expect(draft.fuzzPassed).toBe(false);
  });

  it("records fuzz results", () => {
    const gap = {
      name: "test_tool", intent: "test", dataSources: [],
      reason: "test", complexity: "simple" as const,
    };
    let draft = generateDraft(gap);
    draft = recordFuzzResults(draft, 1000, 1000, []);
    expect(draft.fuzzPassed).toBe(true);
    expect(draft.fuzzStats.totalRuns).toBe(1000);
  });

  it("marks fuzz as failed when not all pass", () => {
    const gap = {
      name: "test_tool", intent: "test", dataSources: [],
      reason: "test", complexity: "simple" as const,
    };
    let draft = generateDraft(gap);
    draft = recordFuzzResults(draft, 1000, 990, ["null input crash"]);
    expect(draft.fuzzPassed).toBe(false);
    expect(draft.fuzzStats.edgeCasesFound).toContain("null input crash");
  });
});

describe("Shadow Factory — evaluateOptimization", () => {
  it("recommends no rewrite when metrics are good", () => {
    const signal = evaluateOptimization(0.95, 0.1, 200);
    expect(signal.rewriteRecommended).toBe(false);
  });

  it("recommends rewrite on low success rate", () => {
    const signal = evaluateOptimization(0.70, 0.1, 200);
    expect(signal.rewriteRecommended).toBe(true);
    expect(signal.reason).toContain("success rate");
  });

  it("recommends rewrite on high correction rate (poor vibe)", () => {
    const signal = evaluateOptimization(0.95, 0.5, 200);
    expect(signal.rewriteRecommended).toBe(true);
    expect(signal.reason).toContain("poor vibe");
  });

  it("recommends rewrite on high latency", () => {
    const signal = evaluateOptimization(0.95, 0.1, 8000);
    expect(signal.rewriteRecommended).toBe(true);
    expect(signal.reason).toContain("latency");
  });
});

describe("Shadow Factory — lifecycle", () => {
  it("creates a tool in reconnaissance phase", () => {
    const tool = createShadowTool("my_tool");
    expect(tool.phase).toBe("reconnaissance");
    expect(tool.phaseHistory).toHaveLength(0);
  });

  it("advances through valid phases", () => {
    let tool = createShadowTool("my_tool");
    tool = advancePhase(tool, "drafting", "Gaps found");
    expect(tool.phase).toBe("drafting");
    tool = advancePhase(tool, "sandbox_testing", "Draft ready");
    expect(tool.phase).toBe("sandbox_testing");
    tool = advancePhase(tool, "verification", "Tests passed");
    expect(tool.phase).toBe("verification");
    tool = advancePhase(tool, "deployment", "Proof verified");
    expect(tool.phase).toBe("deployment");
    tool = advancePhase(tool, "monitoring", "Deployed");
    expect(tool.phase).toBe("monitoring");
    expect(tool.phaseHistory).toHaveLength(5);
  });

  it("rejects invalid phase transitions", () => {
    const tool = createShadowTool("my_tool");
    expect(() => advancePhase(tool, "deployment", "skip")).toThrow("Invalid phase transition");
  });

  it("allows failed → reconnaissance restart", () => {
    let tool = createShadowTool("my_tool");
    tool = advancePhase(tool, "failed", "Something broke");
    tool = advancePhase(tool, "reconnaissance", "Restart");
    expect(tool.phase).toBe("reconnaissance");
  });

  it("allows sandbox_testing → drafting (back to fix)", () => {
    let tool = createShadowTool("my_tool");
    tool = advancePhase(tool, "drafting", "Start");
    tool = advancePhase(tool, "sandbox_testing", "Draft done");
    tool = advancePhase(tool, "drafting", "Tests failed, re-draft");
    expect(tool.phase).toBe("drafting");
  });
});
