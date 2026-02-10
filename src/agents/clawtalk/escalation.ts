/**
 * ClawTalk Escalation
 *
 * Confidence-based escalation from local LLM to cloud API.
 * When the local model's classification confidence is too low,
 * or the task complexity exceeds local capabilities, the system
 * escalates to a more powerful cloud model.
 */

import type { EscalationDecision, IntentCategory, ClawTalkConfig } from "./types.js";

/** Intents that are more complex and benefit from larger models */
const COMPLEX_INTENTS = new Set<IntentCategory>([
  "code_generate",
  "code_review",
  "code_debug",
  "code_refactor",
]);

/** Intents that small models handle well (tools do the heavy lifting) */
const SIMPLE_INTENTS = new Set<IntentCategory>([
  "read_file",
  "list_directory",
  "run_command",
  "remember",
  "recall",
]);

/**
 * Decide whether to escalate to a cloud API model.
 *
 * Escalation triggers:
 * 1. Very low confidence score (< threshold × 0.6)
 * 2. Complex intent + below-threshold confidence
 * 3. Very long input with moderate confidence
 * 4. General below-threshold confidence
 *
 * Simple tool-based intents almost never escalate since the tool
 * does the real work regardless of model size.
 */
export function shouldEscalate(params: {
  confidence: number;
  intent: IntentCategory;
  inputLength: number;
  config: ClawTalkConfig;
}): EscalationDecision {
  const { confidence, intent, inputLength, config } = params;
  const threshold = config.escalationThreshold;

  // No escalation model configured → skip
  if (!config.escalationModel) {
    return {
      escalate: false,
      reason: "No escalation model configured",
      confidence,
    };
  }

  // Simple intents — tools do the work, small model is fine
  if (SIMPLE_INTENTS.has(intent) && confidence > 0.4) {
    return {
      escalate: false,
      reason: "Simple tool-based intent — local model sufficient",
      confidence,
    };
  }

  // Very low confidence — always escalate
  if (confidence < threshold * 0.6) {
    return {
      escalate: true,
      reason: `Very low confidence (${pct(confidence)} < ${pct(threshold * 0.6)})`,
      targetModel: config.escalationModel,
      confidence,
    };
  }

  // Complex intent with below-threshold confidence
  if (COMPLEX_INTENTS.has(intent) && confidence < threshold) {
    return {
      escalate: true,
      reason: `Complex intent "${intent}" with low confidence (${pct(confidence)})`,
      targetModel: config.escalationModel,
      confidence,
    };
  }

  // Long input — may need more reasoning capability
  if (inputLength > 500 && confidence < threshold * 1.2) {
    return {
      escalate: true,
      reason: `Long input (${inputLength} chars) with moderate confidence`,
      targetModel: config.escalationModel,
      confidence,
    };
  }

  // General below-threshold
  if (confidence < threshold) {
    return {
      escalate: true,
      reason: `Below confidence threshold (${pct(confidence)} < ${pct(threshold)})`,
      targetModel: config.escalationModel,
      confidence,
    };
  }

  return {
    escalate: false,
    reason: `Confidence ${pct(confidence)} — local model sufficient`,
    confidence,
  };
}

/** Format a 0–1 value as a percentage string */
function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
