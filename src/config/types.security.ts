/**
 * Kernel Shield Configuration Types
 *
 * Three-layer security enforcement on every tool invocation:
 * - Layer 1: Structural — permission check against .claws manifest
 * - Layer 2: Semantic — risk vector thresholds
 * - Layer 3: Neural Attestation — behavioral drift detection
 */

/** Enforcement mode for the Kernel Shield */
export type KernelShieldEnforcement = "strict" | "permissive" | "audit-only";

/** Risk threshold configuration */
export type KernelShieldRiskThresholds = {
  /** Below this value: silent allow (default: 0.3) */
  low?: number;
  /** Above this value: require biometric / block (default: 0.7) */
  high?: number;
};

/** Neural attestation configuration */
export type KernelShieldAttestationConfig = {
  /** Enable neural attestation layer (default: true) */
  enabled?: boolean;
  /** Cosine similarity threshold for soft drift detection (default: 0.94) */
  softDriftThreshold?: number;
  /** Cosine similarity threshold for hard drift / shutdown (default: 0.85) */
  hardDriftThreshold?: number;
};

/** Full Kernel Shield configuration */
export type KernelShieldConfig = {
  /** Enable the Kernel Shield (default: false) */
  enabled?: boolean;
  /** Enforcement mode: strict blocks, permissive logs, audit-only records (default: "permissive") */
  enforcement?: KernelShieldEnforcement;
  /** Risk vector thresholds for Layer 2 semantic filtering */
  riskThresholds?: KernelShieldRiskThresholds;
  /** Neural attestation (Layer 3) settings */
  attestation?: KernelShieldAttestationConfig;
  /** Log all shield verdicts to the security audit system (default: true) */
  auditLog?: boolean;
  /** Notify via GTK/Android when a tool call is blocked or escalated (default: true) */
  notifyOnBlock?: boolean;
};
