/**
 * ClawTalk Type Definitions
 *
 * Core types for the ClawTalk inter-agent communication protocol.
 * See docs/concepts/clawtalk.md for the full specification.
 */

/** Supported ClawTalk verbs */
export type ClawTalkVerb = "REQ" | "RES" | "TASK" | "STATUS" | "NOOP" | "ERR" | "ACK" | "MULTI";

/** Supported protocol versions */
export type ClawTalkVersion = 1;

/** Parsed ClawTalk message */
export interface ClawTalkMessage {
  /** Protocol version */
  version: ClawTalkVersion;
  /** Message verb (REQ, RES, TASK, etc.) */
  verb: ClawTalkVerb;
  /** Action identifier (e.g., "web_search", "audit") — first positional param */
  action?: string;
  /** Key-value parameters */
  params: Record<string, string | number | boolean | string[]>;
  /** JSON payload (content after --- delimiter) */
  payload?: unknown;
  /** Original wire format string */
  raw?: string;
}

/** Encoder result with confidence metadata */
export interface EncodedMessage {
  /** The encoded ClawTalk message */
  message: ClawTalkMessage;
  /** Wire format string */
  wire: string;
  /** Classification confidence (0.0 to 1.0) */
  confidence: number;
  /** Detected intent category */
  intent: IntentCategory;
  /** Whether escalation to cloud API is recommended */
  shouldEscalate: boolean;
}

/** High-level intent categories */
export type IntentCategory =
  | "web_search"
  | "summarize"
  | "browse"
  | "read_file"
  | "write_file"
  | "list_directory"
  | "run_command"
  | "code_generate"
  | "code_review"
  | "code_debug"
  | "code_refactor"
  | "remember"
  | "recall"
  | "clipboard_manage"
  | "browser_automate"
  | "schedule_task"
  | "conversation"
  | "unknown";

/** Subagent capability profile */
export interface SubagentProfile {
  /** Unique subagent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of capabilities */
  description: string;
  /** Intent categories this subagent handles */
  capabilities: IntentCategory[];
  /** System prompt for the subagent */
  systemPrompt: string;
  /** Allowed tools */
  tools: string[];
  /** Preferred model (null = use default) */
  preferredModel?: string;
  /** Priority when multiple agents match (higher = preferred) */
  priority: number;
}

/** Escalation decision */
export interface EscalationDecision {
  /** Whether to escalate */
  escalate: boolean;
  /** Reason for decision */
  reason: string;
  /** Recommended model if escalating */
  targetModel?: string;
  /** Original confidence score */
  confidence: number;
}

/** Orchestrator configuration */
export interface ClawTalkConfig {
  enabled: boolean;
  version: ClawTalkVersion;
  compressionLevel: "off" | "transport";
  /** Confidence threshold for escalation (0.0-1.0) */
  escalationThreshold: number;
  /** Cloud model for escalation */
  escalationModel?: string;
  /** Local model for normal processing */
  localModel?: string;
  /**
   * Ordered model fallback chain for hot-swap failover.
   * When a model fails (rate limit, down, auth error), the next model
  * in the chain is tried automatically. Uses circuit breaker + cooldown.
   */
  fallbackChain?: string[];
  /** Cooldown in ms before retrying a failed model (default: 60000) */
  fallbackCooldownMs?: number;
}

/** Default configuration */
export const DEFAULT_CONFIG: ClawTalkConfig = {
  enabled: true,
  version: 1,
  compressionLevel: "transport",
  escalationThreshold: 0.5,
};
