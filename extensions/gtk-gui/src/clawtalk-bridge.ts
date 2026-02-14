/**
 * ClawTalk Bridge for GTK GUI
 *
 * Thin adapter that delegates to the canonical ClawTalk encoder + directory
 * from src/agents/clawtalk/ while preserving the GTK-specific RoutingResult
 * interface that monitor.ts depends on.
 *
 * Previously this file was 508 LOC of self-contained duplicate logic.
 * Now it delegates to the canonical implementation and only adds:
 *   - GTK-specific session key scoping (baseSessionKey:agentId)
 *   - Agent name personalization in system prompts
 *   - GTK-specific escalation heuristics for SIMPLE/COMPLEX intents
 */

import {
  clawtalkRouteMessage,
  getClawTalkDirectory,
  type ClawTalkRouting,
} from "../../../src/agents/clawtalk/index.js";

// Re-export the canonical routing type for internal use.
export type { ClawTalkRouting };

// ---------------------------------------------------------------------------
// GTK-specific routing result (consumed by monitor.ts)
// ---------------------------------------------------------------------------

export interface ClawTalkRoutingResult {
  /** Subagent that should handle this message */
  agentId: string;
  /** Display name of the subagent */
  agentName: string;
  /** System prompt for the subagent */
  systemPrompt: string;
  /** Tools the subagent is allowed to use (empty = no tools) */
  tools: string[];
  /** Session key scoped to this subagent for conversation isolation */
  sessionKey: string;
  /** Override model if escalating (undefined = use default) */
  model: string | undefined;
  /** Whether escalation to cloud API was triggered */
  escalated: boolean;
  /** Classification confidence (0.0–1.0) */
  confidence: number;
  /** Detected intent */
  intent: string;
  /** CT/1 wire format representation */
  wire: string;
  /** Risk level based on intent classification */
  riskLevel: "low" | "medium" | "high";
  /** TPC transport status — shows whether acoustic encoding is active */
  tpc?: {
    /** Whether TPC encoding is active for this message */
    active: boolean;
    /** Reason for text fallback (only set when active=false) */
    fallbackReason?: string;
  };
}

// Intents where tool execution does the work (small model is fine)
const SIMPLE_INTENTS = new Set([
  "read_file",
  "list_directory",
  "run_command",
  "clipboard_manage",
  "remember",
  "recall",
]);

// Intents that benefit from larger models
const COMPLEX_INTENTS = new Set(["code_generate", "code_review", "code_debug", "code_refactor"]);

// Risk classification by intent — used for UI indicators
const HIGH_RISK_INTENTS = new Set(["run_command", "write_file"]);
const MEDIUM_RISK_INTENTS = new Set([
  "code_generate",
  "code_refactor",
  "clipboard_manage",
  "code_debug",
  "browse",
]);

function classifyRisk(intent: string): "low" | "medium" | "high" {
  if (HIGH_RISK_INTENTS.has(intent)) {
    return "high";
  }
  if (MEDIUM_RISK_INTENTS.has(intent)) {
    return "medium";
  }
  return "low";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ClawTalkBridgeConfig {
  /** Confidence threshold for escalation (default: 0.5) */
  escalationThreshold?: number;
  /** Cloud model to escalate to (if unset, escalation is disabled) */
  escalationModel?: string;
  /** Override agent name in system prompts */
  agentName?: string;
}

/**
 * Route a user message through the ClawTalk pipeline.
 *
 * Delegates intent classification and routing to the canonical
 * encoder + directory, then layers on GTK-specific session scoping
 * and escalation heuristics.
 */
export function routeWithClawTalk(params: {
  userMessage: string;
  baseSessionKey: string;
  config?: ClawTalkBridgeConfig;
}): ClawTalkRoutingResult {
  const { userMessage, baseSessionKey, config } = params;
  const threshold = config?.escalationThreshold ?? 0.5;

  // Delegate to canonical ClawTalk encoder + directory
  const routing: ClawTalkRouting = clawtalkRouteMessage(userMessage);

  // Resolve agent display name from directory
  const directory = getClawTalkDirectory();
  const profile = directory.getProfile(routing.agentId);
  const agentName = profile?.name ?? routing.agentId;

  // Build subagent-scoped session key
  const sessionKey = `${baseSessionKey}:${routing.agentId}`;

  // Personalize system prompt
  let systemPrompt = routing.systemPrompt;
  if (config?.agentName) {
    systemPrompt = `You are ${config.agentName}, acting as the ${agentName}.\n\n${systemPrompt}`;
  }

  // GTK-specific escalation — the canonical route already computes a basic
  // escalation, but GTK applies more nuanced heuristics for lite-mode models.
  let escalated = routing.escalated;
  let model = routing.modelOverride;

  if (!escalated && config?.escalationModel) {
    if (SIMPLE_INTENTS.has(routing.intent) && routing.confidence > 0.4) {
      // Simple tool intents — local model is fine
    } else if (routing.confidence < threshold * 0.6) {
      escalated = true;
      model = config.escalationModel;
    } else if (COMPLEX_INTENTS.has(routing.intent) && routing.confidence < threshold) {
      escalated = true;
      model = config.escalationModel;
    } else if (userMessage.length > 500 && routing.confidence < threshold * 1.2) {
      escalated = true;
      model = config.escalationModel;
    } else if (routing.confidence < threshold) {
      escalated = true;
      model = config.escalationModel;
    }
  }

  return {
    agentId: routing.agentId,
    agentName,
    systemPrompt,
    tools: routing.tools,
    sessionKey,
    model,
    escalated,
    confidence: routing.confidence,
    intent: routing.intent,
    wire: routing.wire,
    riskLevel: classifyRisk(routing.intent),
    tpc: routing.tpc,
  };
}

/**
 * Get the list of all registered subagent profiles.
 * Useful for status/diagnostic displays.
 */
export function getSubagentProfiles(): Array<{ id: string; name: string; capabilities: string[] }> {
  const directory = getClawTalkDirectory();
  return directory.getProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    capabilities: [...p.capabilities],
  }));
}
