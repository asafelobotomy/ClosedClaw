/**
 * Soft Risk Scoring Module
 *
 * Implements the Risk Vector formula from the agent security research:
 *   V_r = (P_access × S_data) + (1 - T_score)
 *
 * Classifies tool actions into risk tiers and gates destructive operations.
 *
 * Risk Tiers:
 *   Low  (V_r < 0.3)  → Silent execution
 *   Med  (0.3 ≤ V_r ≤ 0.7) → Execute with logging
 *   High (V_r > 0.7)  → Require confirmation (HITL)
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type RiskTier = "low" | "medium" | "high";

export interface RiskVector {
  /** Final risk score 0.0 – 2.0 (clamped to 0..1 for tier mapping) */
  vr: number;
  /** Probability of accessing sensitive scopes */
  pAccess: number;
  /** Sensitivity of targeted data */
  sData: number;
  /** Tool's historical trust score */
  tScore: number;
  /** Risk tier classification */
  tier: RiskTier;
  /** Human-readable explanation */
  reason: string;
}

export interface RiskAssessment {
  toolName: string;
  vector: RiskVector;
  /** Whether execution should proceed */
  allow: boolean;
  /** If not allowed, reason for denial */
  denyReason?: string;
  /** Recommended action */
  action: "execute" | "log_and_execute" | "confirm_required" | "deny";
}

export interface ToolRiskProfile {
  /** Inherent access sensitivity of this tool (0.0 – 1.0) */
  pAccess: number;
  /** Data sensitivity this tool typically handles (0.0 – 1.0) */
  sData: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL RISK PROFILES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-defined risk profiles for known lite-mode tools.
 * P_access: likelihood the tool accesses sensitive scopes.
 * S_data: sensitivity of the data the tool typically touches.
 */
const TOOL_PROFILES: Record<string, ToolRiskProfile> = {
  // Safe / read-only
  current_time: { pAccess: 0.0, sData: 0.0 },
  calculator: { pAccess: 0.0, sData: 0.0 },
  recall_notes: { pAccess: 0.1, sData: 0.2 },
  list_directory: { pAccess: 0.1, sData: 0.1 },
  read_file: { pAccess: 0.2, sData: 0.3 },
  web_search: { pAccess: 0.1, sData: 0.1 },
  fetch_url: { pAccess: 0.2, sData: 0.2 },

  // Moderate
  save_note: { pAccess: 0.2, sData: 0.3 },
  reflect_memory: { pAccess: 0.2, sData: 0.3 },
  write_file: { pAccess: 0.5, sData: 0.5 },
  set_reminder: { pAccess: 0.1, sData: 0.2 },
  screenshot: { pAccess: 0.3, sData: 0.4 },
  screenshot_region: { pAccess: 0.3, sData: 0.4 },
  screenshot_ocr: { pAccess: 0.3, sData: 0.4 },
  ocr_image: { pAccess: 0.2, sData: 0.3 },

  // Higher risk
  run_command: { pAccess: 0.7, sData: 0.6 },
  clipboard_read: { pAccess: 0.4, sData: 0.6 },
  clipboard_write: { pAccess: 0.3, sData: 0.3 },
};

/**
 * Patterns in command arguments that increase data sensitivity.
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; boost: number; reason: string }> = [
  { pattern: /\b(rm|rmdir|del)\b.*(-rf?|--force|--recursive)/i, boost: 0.4, reason: "destructive delete with force/recursive" },
  { pattern: /\brm\s+-/i, boost: 0.3, reason: "delete command with flags" },
  { pattern: /\b(sudo|doas)\b/i, boost: 0.3, reason: "elevated privilege command" },
  { pattern: /\b(passwd|shadow|credential|secret|token|key|password)\b/i, boost: 0.3, reason: "accessing credentials/secrets" },
  { pattern: /\b(curl|wget)\b.*\|\s*(sh|bash)/i, boost: 0.5, reason: "piping remote script to shell" },
  { pattern: /\/(etc|root|boot|sys|proc)\//i, boost: 0.2, reason: "accessing system directories" },
  { pattern: /\b(chmod|chown)\b/i, boost: 0.2, reason: "changing file permissions" },
  { pattern: /\b(kill|pkill|killall)\b/i, boost: 0.2, reason: "process termination" },
  { pattern: />\s*\/dev\/sd/i, boost: 0.5, reason: "writing to block device" },
  { pattern: /\bdd\b.*\bof=/i, boost: 0.4, reason: "raw disk write" },
  { pattern: /\.(ssh|gpg|pem|key|crt|cert)/i, boost: 0.3, reason: "accessing cryptographic material" },
];

// ═══════════════════════════════════════════════════════════════════════════
// TRUST TRACKER
// ═══════════════════════════════════════════════════════════════════════════

interface ToolTrustRecord {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastUsed: number;
}

const trustStore: Map<string, ToolTrustRecord> = new Map();

/**
 * Get the trust score for a tool (0.0 – 1.0).
 * New/unknown tools start at 0.0 (untrusted).
 * Score evolves based on execution history per the trust evolution spec:
 *   0-10 uses  → 0.0-0.2 (full sandbox + manual approval)
 *   11-50 uses → 0.2-0.6 (sandbox + automated risk check)
 *   51-100 uses → 0.6-0.8 (reduced overhead, spot checks)
 *   100+ uses  → 0.8-1.0 (fast path, periodic audits)
 *
 * Degradation: failures drop score by 0.1; three consecutive failures reset to 0.0.
 */
export function getTrustScore(toolName: string): number {
  const record = trustStore.get(toolName);
  if (!record) return 0.0; // Unknown tool — untrusted

  // Three consecutive failures → hard reset
  if (record.consecutiveFailures >= 3) return 0.0;

  const total = record.successes + record.failures;
  if (total === 0) return 0.0;

  // Tier-based ceiling from total execution count
  let tierFloor: number;
  let tierCeiling: number;
  let tierStart: number;
  let tierSpan: number;

  if (total <= 10) {
    tierFloor = 0.0; tierCeiling = 0.2;
    tierStart = 0; tierSpan = 10;
  } else if (total <= 50) {
    tierFloor = 0.2; tierCeiling = 0.6;
    tierStart = 10; tierSpan = 40;
  } else if (total <= 100) {
    tierFloor = 0.6; tierCeiling = 0.8;
    tierStart = 50; tierSpan = 50;
  } else {
    tierFloor = 0.8; tierCeiling = 1.0;
    tierStart = 100; tierSpan = 100; // reaches 1.0 at 200 executions
  }

  // Linear interpolation within tier
  const progress = Math.min((total - tierStart) / tierSpan, 1.0);
  const baseTrust = tierFloor + progress * (tierCeiling - tierFloor);

  // Weight by success ratio within the tier
  const successRatio = record.successes / total;
  return Math.max(0.0, Math.min(1.0, baseTrust * successRatio));
}

/**
 * Record a tool execution result to update trust.
 * Tracks consecutive failures for degradation (3 consecutive → reset to 0.0).
 */
export function recordExecution(toolName: string, success: boolean): void {
  const record = trustStore.get(toolName) ?? { successes: 0, failures: 0, consecutiveFailures: 0, lastUsed: 0 };
  if (success) {
    record.successes++;
    record.consecutiveFailures = 0; // Reset consecutive failure counter
  } else {
    record.failures++;
    record.consecutiveFailures++;
  }
  record.lastUsed = Date.now();
  trustStore.set(toolName, record);
}

/**
 * Reset trust for a tool (for testing or after security incident).
 */
export function resetTrust(toolName?: string): void {
  if (toolName) {
    trustStore.delete(toolName);
  } else {
    trustStore.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate the risk vector for a tool call.
 */
export function calculateRisk(
  toolName: string,
  params?: Record<string, unknown>,
): RiskVector {
  // Get base profile
  const profile = TOOL_PROFILES[toolName] ?? { pAccess: 0.3, sData: 0.3 };
  let pAccess = profile.pAccess;
  let sData = profile.sData;

  // Context-sensitive boosting based on parameters
  const reasons: string[] = [];

  if (params) {
    const paramStr = JSON.stringify(params).toLowerCase();

    for (const { pattern, boost, reason } of SENSITIVE_PATTERNS) {
      if (pattern.test(paramStr)) {
        sData = Math.min(1.0, sData + boost);
        reasons.push(reason);
      }
    }

    // Special handling for write_file to sensitive paths
    if (toolName === "write_file" && typeof params.path === "string") {
      const path = params.path.toLowerCase();
      if (/\/(etc|root|boot|sys)\//i.test(path)) {
        pAccess = Math.min(1.0, pAccess + 0.3);
        reasons.push("writing to system directory");
      }
      if (/\.(sh|bash|zsh|env|conf|cfg|ini|pem|key)/i.test(path)) {
        sData = Math.min(1.0, sData + 0.2);
        reasons.push("writing to config/script file");
      }
    }
  }

  const tScore = getTrustScore(toolName);
  // Modified formula: weight trust penalty by inherent risk so zero-risk tools stay zero
  // V_r = (P_access × S_data) + max(P_access, S_data) × (1 - T_score)
  const inherentRisk = Math.max(pAccess, sData);
  const vr = Math.min(2.0, (pAccess * sData) + inherentRisk * (1 - tScore));
  const clampedVr = Math.min(1.0, vr);
  const tier: RiskTier = clampedVr <= 0.3 ? "low" : clampedVr <= 0.7 ? "medium" : "high";

  const reason = reasons.length > 0
    ? `${tier} risk (V_r=${clampedVr.toFixed(2)}): ${reasons.join(", ")}`
    : `${tier} risk (V_r=${clampedVr.toFixed(2)})`;

  return { vr: clampedVr, pAccess, sData, tScore, tier, reason };
}

/**
 * Assess whether a tool call should be allowed, logged, or confirmed.
 */
export function assessRisk(
  toolName: string,
  params?: Record<string, unknown>,
): RiskAssessment {
  const vector = calculateRisk(toolName, params);

  let action: RiskAssessment["action"];
  let allow = true;
  let denyReason: string | undefined;

  switch (vector.tier) {
    case "low":
      action = "execute";
      break;
    case "medium":
      action = "log_and_execute";
      break;
    case "high":
      action = "confirm_required";
      // For extremely high risk (piping to shell, raw disk write), deny outright
      if (vector.vr >= 0.95) {
        action = "deny";
        allow = false;
        denyReason = `Extremely high risk (V_r=${vector.vr.toFixed(2)}): ${vector.reason}`;
      }
      break;
  }

  return { toolName, vector, allow, denyReason, action };
}

/**
 * Format a risk assessment for human-readable logging.
 */
export function formatRiskReport(assessment: RiskAssessment): string {
  const { toolName, vector, action } = assessment;
  const tierEmoji = vector.tier === "low" ? "🟢" : vector.tier === "medium" ? "🟡" : "🔴";
  const lines = [
    `${tierEmoji} Risk Assessment: ${toolName}`,
    `  V_r = ${vector.vr.toFixed(3)} (P=${vector.pAccess.toFixed(2)} × S=${vector.sData.toFixed(2)}) + (1 - T=${vector.tScore.toFixed(2)})`,
    `  Tier: ${vector.tier.toUpperCase()}`,
    `  Action: ${action}`,
  ];
  if (assessment.denyReason) {
    lines.push(`  DENIED: ${assessment.denyReason}`);
  }
  return lines.join("\n");
}
