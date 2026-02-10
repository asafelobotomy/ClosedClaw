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

/** Dictionary macro definition */
export interface ClawTalkMacro {
  /** Full ClawTalk expansion */
  expansion: string;
  /** Human description */
  description: string;
  /** Parameter names for substitution */
  params?: string[];
  /** Who added this macro */
  addedBy: string;
  /** When it was added */
  addedAt: string;
  /** Times used */
  usageCount: number;
}

/** Macro proposal awaiting approval */
export interface ClawTalkProposal {
  name: string;
  expansion: string;
  proposedBy: string;
  proposedAt: string;
  reason: string;
  estimatedSavings?: string;
}

/** Full dictionary structure */
export interface ClawTalkDictionary {
  version: number;
  updated: string;
  macros: Record<string, ClawTalkMacro>;
  abbreviations: Record<string, string>;
  proposed: ClawTalkProposal[];
}

/** Metrics snapshot */
export interface ClawTalkMetrics {
  totalEncoded: number;
  totalDecoded: number;
  avgCompressionRatio: number;
  comprehensionRate: number;
  tokensSaved: number;
  macroUsage: Record<string, number>;
  intentCounts: Record<string, number>;
  escalationCount: number;
  periodStart: string;
}

/** Orchestrator configuration */
export interface ClawTalkConfig {
  enabled: boolean;
  version: ClawTalkVersion;
  dictionaryPath?: string;
  compressionLevel: "transport" | "hybrid" | "native";
  autoPropose: boolean;
  autoApproveThreshold: number;
  maxDictionarySize: number;
  metrics: boolean;
  fallbackOnError: boolean;
  /** Confidence threshold for escalation (0.0-1.0) */
  escalationThreshold: number;
  /** Cloud model for escalation */
  escalationModel?: string;
  /** Local model for normal processing */
  localModel?: string;
}

/** Default configuration */
export const DEFAULT_CONFIG: ClawTalkConfig = {
  enabled: true,
  version: 1,
  compressionLevel: "transport",
  autoPropose: true,
  autoApproveThreshold: 50,
  maxDictionarySize: 500,
  metrics: true,
  fallbackOnError: true,
  escalationThreshold: 0.5,
};

/** Orchestrator result */
export interface OrchestratorResult {
  /** Response text for the user */
  text: string | null;
  /** Error message if failed */
  error?: string;
  /** Which subagent(s) handled the request */
  handledBy: string[];
  /** Whether escalation was used */
  escalated: boolean;
  /** ClawTalk wire messages exchanged */
  wireLog: string[];
  /** Execution time in ms */
  durationMs: number;
}
