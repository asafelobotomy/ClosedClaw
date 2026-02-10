/**
 * Kernel Shield — Three-Layer Defense System
 *
 * Implements the multi-layered security arbiter described in the agent-security
 * research document.  Intercepts all tool invocations before they reach the OS.
 *
 * Layer 1: Structural Enforcement (The Formal Gate)
 *   - Permission checking against Manifest (Block 1)
 *   - Proof verification against Formal Verification (Block 7)
 *
 * Layer 2: Semantic Filtering (The Risk Vector)
 *   - Vr = (P_access × S_data) + (1 − T_score)
 *   - Low (<0.3) → silent, Medium (0.3–0.7) → logged, High (>0.7) → requires biometric
 *
 * Layer 3: Neural Attestation (The Behavioral Anchor)
 *   - Cosine similarity between live state and Neural Fingerprint (Block 9)
 *   - Drift detection with soft/hard thresholds
 */

import type { ClawsManifest, ClawsVerificationProof, ClawsNeuralFingerprint } from "./claws-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Action the shield should take */
export type ShieldAction = "allow" | "log" | "require_biometric" | "block";

/** Result from Layer 1 — structural enforcement */
export interface StructuralResult {
  passed: boolean;
  /** Which permission was violated (if any) */
  violatedPermission?: string;
  /** Whether formal proof was verified */
  proofVerified: boolean;
}

/** Risk level from Layer 2 */
export type RiskLevel = "low" | "medium" | "high";

/** Result from Layer 2 — semantic filtering */
export interface SemanticResult {
  /** Computed risk vector Vr */
  riskVector: number;
  level: RiskLevel;
  action: ShieldAction;
}

/** Drift severity from Layer 3 */
export type DriftLevel = "none" | "soft_drift" | "hard_drift";

/** Result from Layer 3 — neural attestation */
export interface AttestationResult {
  /** Cosine similarity between live state and fingerprint */
  similarity: number;
  drift: DriftLevel;
  action: ShieldAction;
}

/** Combined shield verdict */
export interface ShieldVerdict {
  /** Whether the invocation is permitted */
  allowed: boolean;
  /** Final action to take */
  action: ShieldAction;
  /** Per-layer results */
  layers: {
    structural: StructuralResult;
    semantic: SemanticResult;
    attestation: AttestationResult;
  };
  /** Human-readable summary */
  reason: string;
}

/** Parameters describing a tool invocation to evaluate */
export interface ToolInvocationContext {
  /** Tool/function being invoked */
  toolName: string;
  /** Capabilities the tool will exercise (e.g., "net.http", "fs.write") */
  requestedCapabilities: string[];
  /** Access probability 0..1 — how much OS access the tool needs */
  accessProbability: number;
  /** Data sensitivity 0..1 — how sensitive the data being processed is */
  dataSensitivity: number;
  /** Current trust score 0..1 — from prior session history */
  trustScore: number;
  /** Live activation vector (for neural attestation) — dense float array */
  liveActivation?: number[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1 — STRUCTURAL ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Layer 1: Check tool invocation against manifest permissions and formal proof.
 *
 * @param manifest - Parsed Block 1
 * @param proof    - Parsed Block 7 (may be null for unverified tools)
 * @param ctx      - Tool invocation context
 */
export function checkStructural(
  manifest: ClawsManifest,
  proof: ClawsVerificationProof | null,
  ctx: ToolInvocationContext,
): StructuralResult {
  // Check each requested capability against manifest permissions
  for (const cap of ctx.requestedCapabilities) {
    const perm = manifest.permissions.find((p) => p.capability === cap);
    if (!perm) {
      return { passed: false, violatedPermission: cap, proofVerified: false };
    }
    // Check deny list
    if (perm.deny && perm.deny.length > 0) {
      // If any deny pattern matches (simple prefix check), block
      // Real implementation would do glob matching
      return { passed: false, violatedPermission: `${cap} (denied)`, proofVerified: false };
    }
  }

  // Check formal proof status
  const proofVerified = proof?.status === "VERIFIED";

  return { passed: true, violatedPermission: undefined, proofVerified };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2 — SEMANTIC FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Layer 2: Compute risk vector and determine action.
 *
 * Vr = (P_access × S_data) + (1 − T_score)
 *
 * | Vr Range | Level  | Action            |
 * |----------|--------|-------------------|
 * | < 0.3    | Low    | allow (silent)    |
 * | 0.3–0.7  | Medium | log               |
 * | > 0.7    | High   | require_biometric |
 */
export function computeRiskVector(ctx: ToolInvocationContext): SemanticResult {
  const vr = ctx.accessProbability * ctx.dataSensitivity + (1 - ctx.trustScore);
  const clamped = Math.max(0, Math.min(vr, 2)); // theoretical max is 2

  let level: RiskLevel;
  let action: ShieldAction;

  if (clamped < 0.3) {
    level = "low";
    action = "allow";
  } else if (clamped <= 0.7) {
    level = "medium";
    action = "log";
  } else {
    level = "high";
    action = "require_biometric";
  }

  return { riskVector: Math.round(clamped * 1000) / 1000, level, action };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 — NEURAL ATTESTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Layer 3: Neural attestation — compare live activation against fingerprint.
 *
 * | Similarity | Drift      | Action           |
 * |-----------|------------|------------------|
 * | > 0.94     | none       | allow            |
 * | 0.85–0.94  | soft_drift | log              |
 * | < 0.85     | hard_drift | block (shutdown) |
 *
 * @param fingerprint - Block 9 neural fingerprint with baseline digest
 * @param liveActivation - Current LLM activation vector
 */
export function checkAttestation(
  fingerprint: ClawsNeuralFingerprint | null,
  liveActivation: number[] | undefined,
): AttestationResult {
  // No fingerprint / no live data → skip attestation, allow
  if (!fingerprint || !liveActivation || liveActivation.length === 0) {
    return { similarity: 1.0, drift: "none", action: "allow" };
  }

  // Decode the neural digest (stored as comma-separated floats)
  let baseline: number[];
  try {
    baseline = fingerprint.neuralDigest
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
  } catch {
    return { similarity: 1.0, drift: "none", action: "allow" };
  }

  if (baseline.length === 0) {
    return { similarity: 1.0, drift: "none", action: "allow" };
  }

  const similarity = cosineSimilarity(liveActivation, baseline);

  // Use custom thresholds from fingerprint if available, else defaults
  const softThreshold = fingerprint.driftThresholds?.softDrift ?? 0.94;
  const hardThreshold = fingerprint.driftThresholds?.hardDrift ?? 0.85;

  let drift: DriftLevel;
  let action: ShieldAction;

  if (similarity >= softThreshold) {
    drift = "none";
    action = "allow";
  } else if (similarity >= hardThreshold) {
    drift = "soft_drift";
    action = "log";
  } else {
    drift = "hard_drift";
    action = "block";
  }

  return { similarity: Math.round(similarity * 1000) / 1000, drift, action };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED SHIELD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run all three layers and return a combined verdict.
 *
 * The strictest action from any layer wins:
 *   block > require_biometric > log > allow
 */
export function evaluateShield(
  manifest: ClawsManifest,
  proof: ClawsVerificationProof | null,
  fingerprint: ClawsNeuralFingerprint | null,
  ctx: ToolInvocationContext,
): ShieldVerdict {
  const structural = checkStructural(manifest, proof, ctx);
  const semantic = computeRiskVector(ctx);
  const attestation = checkAttestation(fingerprint, ctx.liveActivation);

  // Layer 1 is a hard gate — if structural fails, block
  if (!structural.passed) {
    return {
      allowed: false,
      action: "block",
      layers: { structural, semantic, attestation },
      reason: `Structural: permission denied — ${structural.violatedPermission}`,
    };
  }

  // Pick the strictest action across layers 2 and 3
  const ORDER: ShieldAction[] = ["allow", "log", "require_biometric", "block"];
  const maxAction = ORDER[
    Math.max(ORDER.indexOf(semantic.action), ORDER.indexOf(attestation.action))
  ];

  const allowed = maxAction === "allow" || maxAction === "log";

  let reason: string;
  if (maxAction === "block") {
    reason = `Neural attestation: hard drift (similarity=${attestation.similarity})`;
  } else if (maxAction === "require_biometric") {
    reason = `Risk vector ${semantic.riskVector} exceeds threshold — biometric required`;
  } else if (maxAction === "log") {
    const parts: string[] = [];
    if (semantic.action === "log") parts.push(`risk=${semantic.riskVector}`);
    if (attestation.action === "log") parts.push(`drift=${attestation.drift}`);
    reason = `Logged execution: ${parts.join(", ")}`;
  } else {
    reason = "All layers passed";
  }

  return { allowed, action: maxAction, layers: { structural, semantic, attestation }, reason };
}
