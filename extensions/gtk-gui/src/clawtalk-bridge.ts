/**
 * ClawTalk Bridge for GTK GUI
 *
 * Self-contained ClawTalk integration that routes user messages to
 * specialized subagents based on intent classification.
 *
 * This bridge is self-contained (no imports from src/agents/clawtalk/)
 * to maintain plugin architecture boundaries. The full ClawTalk module
 * at src/agents/clawtalk/ is the canonical implementation for gateway-wide use.
 *
 * Pipeline:
 *   UserMessage → IntentClassification → SubagentRouting → EscalationCheck → RoutingResult
 *
 * The RoutingResult configures which system prompt, tools, session key,
 * and model to use when calling the existing Ollama execution infrastructure.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntentCategory =
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
  | "clipboard_manage"
  | "remember"
  | "recall"
  | "conversation"
  | "unknown";

interface SubagentProfile {
  id: string;
  name: string;
  systemPrompt: string;
  tools: string[];
  priority: number;
  capabilities: IntentCategory[];
}

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
  intent: IntentCategory;
  /** CT/1 wire format representation */
  wire: string;
}

interface IntentPattern {
  intent: IntentCategory;
  patterns: RegExp[];
  confidence: number;
  action: string;
}

// ---------------------------------------------------------------------------
// Subagent Profiles
// ---------------------------------------------------------------------------

const RESEARCH_AGENT: SubagentProfile = {
  id: "research",
  name: "Research Agent",
  capabilities: ["web_search", "summarize", "browse"],
  systemPrompt: [
    "You are a focused research assistant. Your speciality is finding information.",
    "",
    "Guidelines:",
    "- Search the web for accurate, up-to-date information using web_search",
    "- For specific URLs, use fetch_url to retrieve and read their content",
    "- Summarize findings concisely and clearly",
    "- Cite sources when possible",
    "- Distinguish facts from opinions",
    "- Present findings in a structured format",
    "",
    "Use web_search for broad queries, fetch_url to read specific pages,",
    "and current_time when you need to know today's date.",
  ].join("\n"),
  tools: ["web_search", "fetch_url", "current_time"],
  priority: 10,
};

const SYSTEM_AGENT: SubagentProfile = {
  id: "system",
  name: "System Agent",
  capabilities: ["read_file", "write_file", "list_directory", "run_command", "clipboard_manage"],
  systemPrompt: [
    "You are a system operations assistant running on a Linux desktop.",
    "",
    "Guidelines:",
    "- Read and write files safely",
    "- Navigate the filesystem with care",
    "- Execute shell commands carefully",
    "- Always report results clearly",
    "- Use list_directory to verify paths before file operations",
    "- For destructive operations (write, delete, run_command), explain what you will do first",
    "",
    "Available tools: read_file, write_file, list_directory, run_command, current_time, clipboard_read, clipboard_write.",
  ].join("\n"),
  tools: ["read_file", "write_file", "list_directory", "run_command", "current_time", "clipboard_read", "clipboard_write"],
  priority: 10,
};

const CODE_AGENT: SubagentProfile = {
  id: "coder",
  name: "Code Agent",
  capabilities: ["code_generate", "code_review", "code_debug", "code_refactor"],
  systemPrompt: [
    "You are an expert programmer. You write clean, idiomatic code.",
    "",
    "Guidelines:",
    "- Write complete, working code — no placeholders or stubs",
    "- Explain your design decisions briefly",
    "- For reviews: check for bugs, security issues, performance, and style",
    "- For debugging: reason methodically, check assumptions",
    "- For refactoring: preserve behavior while improving clarity",
    "- Use read_file to understand existing code before suggesting changes",
    "- Use calculator for any numeric computation",
    "",
    "Available tools: read_file, write_file, list_directory, run_command, calculator.",
  ].join("\n"),
  tools: ["read_file", "write_file", "list_directory", "run_command", "calculator"],
  priority: 10,
};

const MEMORY_AGENT: SubagentProfile = {
  id: "memory",
  name: "Memory Agent",
  capabilities: ["remember", "recall"],
  systemPrompt: [
    "You are a knowledge management assistant — the user's external memory.",
    "",
    "## Fact Types (prefix your notes):",
    "  W: – World fact (objective truth, e.g. 'W: Paris is in France')",
    "  B: – Biographical / experience (e.g. 'B: User visited Tokyo in 2024')",
    "  O(c=N): – Opinion with confidence 0-100 (e.g. 'O(c=85): Rust is the best language')",
    "  S: – Summary / synthesis (e.g. 'S: User prefers dark UI themes')",
    "",
    "## Entity Tags:",
    "  Mention entities with @Name in the note text. Examples:",
    "  'B: @Alice moved to @Berlin last month'",
    "",
    "## Guidelines:",
    "- When asked to remember: save with save_note, use a type prefix + @entity tags",
    "- When asked to recall: use recall_notes with query, entity, type, or since filters",
    "- When asked 'what do you know about X': use reflect_memory for a full entity summary",
    "- Confirm exactly what was saved or found",
    "- If recall returns nothing, say so and suggest related keywords",
    "",
    "Available tools: save_note, recall_notes, reflect_memory, current_time.",
  ].join("\n"),
  tools: ["save_note", "recall_notes", "reflect_memory", "current_time"],
  priority: 10,
};

const CONVERSATION_AGENT: SubagentProfile = {
  id: "conversation",
  name: "Assistant",
  capabilities: ["conversation", "unknown"],
  systemPrompt: [
    "You are a helpful AI assistant running on a Linux desktop.",
    "Answer questions clearly and concisely.",
    "Use Markdown for formatting when appropriate.",
    "",
    "You can help with general questions, explanations, brainstorming, writing, and more.",
    "You have basic tools available: web_search for quick lookups, calculator for math,",
    "and current_time for the current date. Use them when helpful.",
  ].join("\n"),
  tools: ["web_search", "calculator", "current_time"],
  priority: 1,
};

const ALL_AGENTS = [RESEARCH_AGENT, SYSTEM_AGENT, CODE_AGENT, MEMORY_AGENT, CONVERSATION_AGENT];

// ---------------------------------------------------------------------------
// Intent Classification Patterns
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "web_search",
    patterns: [
      /\b(?:search|google|look\s*up|find)\b.*\b(?:web|internet|online|for)\b/i,
      /\b(?:search|find|look)\b.*\b(?:information|articles?|news|results?)\b/i,
      /\bwhat (?:is|are|was|were)\b/i,
      /\bwho (?:is|are|was|were)\b/i,
      /\bwhen (?:did|was|is|will)\b/i,
      /\bsearch for\b/i,
      /\blook up\b/i,
    ],
    confidence: 0.75,
    action: "web_search",
  },
  {
    intent: "summarize",
    patterns: [
      /\bsummari[sz]e\b/i,
      /\btl;?dr\b/i,
      /\bgive\s+(?:me\s+)?(?:a\s+)?summary\b/i,
    ],
    confidence: 0.8,
    action: "summarize",
  },
  {
    intent: "browse",
    patterns: [
      /\b(?:open|visit|browse|go\s+to|check)\b.*\bhttps?:\/\//i,
      /\bhttps?:\/\/\S+/i,
    ],
    confidence: 0.85,
    action: "browse",
  },
  {
    intent: "read_file",
    patterns: [
      /\bread\b.*\bfile\b/i,
      /\bshow\b.*\b(?:contents?|file)\b/i,
      /\bcat\b\s+\S/i,
      /\bopen\b.*\bfile\b/i,
      /\bwhat(?:'s| is) in\b.*\b(?:file|\/)\b/i,
    ],
    confidence: 0.85,
    action: "read_file",
  },
  {
    intent: "write_file",
    patterns: [
      /\b(?:write|save|create)\b.*\bfile\b/i,
      /\bwrite\b.*\bto\b/i,
      /\bsave\b.*\b(?:to|as)\b/i,
    ],
    confidence: 0.8,
    action: "write_file",
  },
  {
    intent: "list_directory",
    patterns: [
      /\b(?:list|ls|show|what)\b.*\b(?:files?|directory|folder|dir)\b/i,
      /\b(?:what's|what is)\b.*\bin\b.*\b(?:directory|folder|\/)\b/i,
      /\bls\b\s/i,
    ],
    confidence: 0.85,
    action: "list_directory",
  },
  {
    intent: "run_command",
    patterns: [
      /\b(?:run|execute|exec)\b.*\b(?:command|script|shell)\b/i,
      /\brun\b\s+`[^`]+`/i,
      /\bexecute\b\s/i,
    ],
    confidence: 0.8,
    action: "exec",
  },
  {
    intent: "code_generate",
    patterns: [
      /\b(?:write|create|generate|build|implement|make)\b.*\b(?:code|function|class|script|program|component|module)\b/i,
      /\b(?:code|implement|program)\b.*\bthat\b/i,
      /\bcreate\b.*\b(?:typescript|python|javascript|html|css|rust|go)\b/i,
    ],
    confidence: 0.75,
    action: "code_generate",
  },
  {
    intent: "code_review",
    patterns: [
      /\b(?:review|check|audit|analyze|inspect)\b.*\b(?:code|file|module|function)\b/i,
      /\bcode\s+review\b/i,
    ],
    confidence: 0.8,
    action: "review",
  },
  {
    intent: "code_debug",
    patterns: [
      /\b(?:debug|fix|troubleshoot|diagnose)\b/i,
      /\bwhy\b.*\b(?:not working|failing|error|broken|crash)\b/i,
    ],
    confidence: 0.75,
    action: "debug",
  },
  {
    intent: "code_refactor",
    patterns: [
      /\b(?:refactor|restructure|reorganize|clean\s*up|improve)\b.*\b(?:code|file|module)\b/i,
    ],
    confidence: 0.8,
    action: "refactor",
  },
  {
    intent: "clipboard_manage",
    patterns: [
      /\b(?:copy|paste|clipboard)\b/i,
      /\b(?:copy|put|save)\b.*\bclipboard\b/i,
      /\bclipboard\b.*\b(?:read|get|show|write|set)\b/i,
      /\bpaste\b.*\bfrom\b/i,
    ],
    confidence: 0.85,
    action: "clipboard",
  },
  {
    intent: "remember",
    patterns: [
      /\b(?:remember|store|note|jot|record)\b/i,
      /\bkeep\s+(?:a\s+)?note\b/i,
      /\bdon't\s+forget\b/i,
      /\bmake\s+a\s+note\b/i,
    ],
    confidence: 0.85,
    action: "save_note",
  },
  {
    intent: "recall",
    patterns: [
      /\b(?:recall|retrieve|what\s+did\s+I|do\s+you\s+remember)\b/i,
      /\b(?:my|the)\s+notes?\b/i,
      /\bsearch\b.*\bnotes?\b/i,
      /\bshow\b.*\bnotes?\b/i,
    ],
    confidence: 0.85,
    action: "recall_notes",
  },
];

// Intents where tool execution does the work (small model is fine)
const SIMPLE_INTENTS = new Set<IntentCategory>([
  "read_file",
  "list_directory",
  "run_command",
  "clipboard_manage",
  "remember",
  "recall",
]);

// Intents that benefit from larger models
const COMPLEX_INTENTS = new Set<IntentCategory>([
  "code_generate",
  "code_review",
  "code_debug",
  "code_refactor",
]);

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classifyIntent(text: string): { intent: IntentCategory; confidence: number; action: string } {
  if (!text.trim()) {
    return { intent: "conversation", confidence: 0.9, action: "chat" };
  }

  let bestMatch: { pattern: IntentPattern; score: number } | null = null;

  for (const ip of INTENT_PATTERNS) {
    let matchCount = 0;
    for (const regex of ip.patterns) {
      if (regex.test(text)) matchCount++;
    }
    if (matchCount > 0) {
      const score = ip.confidence + Math.min((matchCount - 1) * 0.05, 0.15);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { pattern: ip, score };
      }
    }
  }

  if (!bestMatch) {
    return { intent: "conversation", confidence: 0.4, action: "chat" };
  }

  return {
    intent: bestMatch.pattern.intent,
    confidence: Math.min(bestMatch.score, 1.0),
    action: bestMatch.pattern.action,
  };
}

function findAgent(intent: IntentCategory): SubagentProfile {
  const match = ALL_AGENTS.find((a) => a.capabilities.includes(intent));
  return match ?? CONVERSATION_AGENT;
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
 * Returns a routing result that tells the caller:
 * - Which subagent should handle the message
 * - What system prompt and tools to use
 * - What session key to use (subagent-scoped)
 * - Whether to escalate to a cloud model
 *
 * The caller (monitor.ts) then uses this to configure the Ollama call.
 */
export function routeWithClawTalk(params: {
  userMessage: string;
  baseSessionKey: string;
  config?: ClawTalkBridgeConfig;
}): ClawTalkRoutingResult {
  const { userMessage, baseSessionKey, config } = params;
  const threshold = config?.escalationThreshold ?? 0.5;

  // Step 1: Classify intent
  const { intent, confidence, action } = classifyIntent(userMessage);

  // Step 2: Route to subagent
  const agent = findAgent(intent);

  // Step 3: Build subagent-scoped session key
  const sessionKey = `${baseSessionKey}:${agent.id}`;

  // Step 4: Personalize system prompt
  let systemPrompt = agent.systemPrompt;
  if (config?.agentName) {
    systemPrompt = `You are ${config.agentName}, acting as the ${agent.name}.\n\n${systemPrompt}`;
  }

  // Step 5: Escalation check
  let escalated = false;
  let model: string | undefined;

  if (config?.escalationModel) {
    // No escalation model → skip
    if (SIMPLE_INTENTS.has(intent) && confidence > 0.4) {
      // Simple tool intents — local model is fine
    } else if (confidence < threshold * 0.6) {
      // Very low confidence → escalate
      escalated = true;
      model = config.escalationModel;
    } else if (COMPLEX_INTENTS.has(intent) && confidence < threshold) {
      // Complex intent with low confidence → escalate
      escalated = true;
      model = config.escalationModel;
    } else if (userMessage.length > 500 && confidence < threshold * 1.2) {
      // Long input with moderate confidence → escalate
      escalated = true;
      model = config.escalationModel;
    } else if (confidence < threshold) {
      // General below-threshold → escalate
      escalated = true;
      model = config.escalationModel;
    }
  }

  // Step 6: Build CT/1 wire representation
  const wire = `CT/1 REQ ${action} q="${userMessage.slice(0, 80).replace(/"/g, '\\"')}"`;

  return {
    agentId: agent.id,
    agentName: agent.name,
    systemPrompt,
    tools: agent.tools,
    sessionKey,
    model,
    escalated,
    confidence,
    intent,
    wire,
  };
}

/**
 * Get the list of all registered subagent profiles.
 * Useful for status/diagnostic displays.
 */
export function getSubagentProfiles(): Array<{ id: string; name: string; capabilities: string[] }> {
  return ALL_AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: [...a.capabilities],
  }));
}
