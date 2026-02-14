/**
 * ClawTalk Encoder
 *
 * Translates natural language messages into CT/1 wire format.
 * Uses heuristic pattern matching for fast, deterministic intent classification.
 * No LLM call needed — runs in under 1ms.
 */

import type { ClawTalkMessage, EncodedMessage, IntentCategory } from "./types.js";
import { serialize } from "./parser.js";

/** Pattern definition for intent classification */
interface IntentPattern {
  intent: IntentCategory;
  patterns: RegExp[];
  /** Base confidence when pattern matches */
  confidence: number;
  /** Default CT verb for this intent */
  verb: "REQ" | "TASK";
  /** Default CT action */
  action: string;
  /** Parameter extraction rules */
  extractors?: ParamExtractor[];
}

interface ParamExtractor {
  key: string;
  pattern: RegExp;
  group?: number;
  transform?: (value: string) => string | number;
}

// --- Intent classification patterns ---

const INTENT_PATTERNS: IntentPattern[] = [
  // Web search & research
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
    verb: "REQ",
    action: "web_search",
    extractors: [
      {
        key: "since",
        pattern: /\b(?:last|past|recent)\s+(\d+\s*(?:days?|weeks?|months?|hours?))\b/i,
        group: 1,
      },
      { key: "limit", pattern: /\b(?:top|first|limit)\s+(\d+)\b/i, group: 1, transform: Number },
    ],
  },

  // Summarize
  {
    intent: "summarize",
    patterns: [
      /\bsummari[sz]e\b/i,
      /\btl;?dr\b/i,
      /\bgive\s+(?:me\s+)?(?:a\s+)?summary\b/i,
      /\bbrief(?:ly)?\b.*\b(?:explain|describe|overview)\b/i,
    ],
    confidence: 0.8,
    verb: "REQ",
    action: "summarize",
    extractors: [{ key: "target", pattern: /(https?:\/\/\S+)/i, group: 1 }],
  },

  // Browse URL
  {
    intent: "browse",
    patterns: [/\b(?:open|visit|browse|go\s+to|check)\b.*\bhttps?:\/\//i, /\bhttps?:\/\/\S+/i],
    confidence: 0.85,
    verb: "REQ",
    action: "browse",
    extractors: [{ key: "url", pattern: /(https?:\/\/\S+)/i, group: 1 }],
  },

  // Read file
  {
    intent: "read_file",
    patterns: [
      /\bread\b.*\bfile\b/i,
      /\bshow\b.*\b(?:contents?|file)\b/i,
      /\bcat\b\s+\S/i,
      /\bopen\b.*\bfile\b/i,
      /\bwhat(?:'s| is) in\b.*\b(?:file|\/)\b/i,
      /\bdisplay\b.*\bfile\b/i,
    ],
    confidence: 0.85,
    verb: "REQ",
    action: "read_file",
    extractors: [
      {
        key: "target",
        pattern: /(?:(?:file|read|cat|open|show)\s+)?([/~][\w\-./]+(?:\.\w+)?)/i,
        group: 1,
      },
      { key: "target", pattern: /"([^"]+\.\w+)"/i, group: 1 },
    ],
  },

  // Write file
  {
    intent: "write_file",
    patterns: [
      /\b(?:write|save|create)\b.*\bfile\b/i,
      /\bwrite\b.*\bto\b/i,
      /\bsave\b.*\b(?:to|as)\b/i,
    ],
    confidence: 0.8,
    verb: "REQ",
    action: "write_file",
    extractors: [
      { key: "target", pattern: /(?:to|as|file)\s+([/~][\w\-./]+(?:\.\w+)?)/i, group: 1 },
    ],
  },

  // List directory
  {
    intent: "list_directory",
    patterns: [
      /\b(?:list|ls|show|what)\b.*\b(?:files?|directory|folder|dir)\b/i,
      /\b(?:what's|what is)\b.*\bin\b.*\b(?:directory|folder|\/)\b/i,
      /\bls\b\s/i,
    ],
    confidence: 0.85,
    verb: "REQ",
    action: "list_directory",
    extractors: [
      { key: "target", pattern: /(?:in|of|directory|folder|ls)\s+([/~][\w\-./]+)/i, group: 1 },
    ],
  },

  // Run command
  {
    intent: "run_command",
    patterns: [
      /\b(?:run|execute|exec)\b.*\b(?:command|script|shell)\b/i,
      /\brun\b\s+`[^`]+`/i,
      /\bexecute\b\s/i,
      /\b(?:run|exec)\b\s+\S/i,
    ],
    confidence: 0.8,
    verb: "REQ",
    action: "exec",
    extractors: [
      { key: "cmd", pattern: /`([^`]+)`/i, group: 1 },
      { key: "cmd", pattern: /(?:run|execute|exec)\s+(.+)/i, group: 1 },
    ],
  },

  // Code generation
  {
    intent: "code_generate",
    patterns: [
      /\b(?:write|create|generate|build|implement|make)\b.*\b(?:code|function|class|script|program|component|module)\b/i,
      /\b(?:code|implement|program)\b.*\bthat\b/i,
      /\bcreate\b.*\b(?:typescript|python|javascript|html|css|rust|go)\b/i,
    ],
    confidence: 0.75,
    verb: "TASK",
    action: "code_generate",
    extractors: [
      {
        key: "lang",
        pattern:
          /\b(typescript|python|javascript|html|css|rust|go|java|c\+\+|ruby|php|swift|kotlin)\b/i,
        group: 1,
      },
    ],
  },

  // Code review
  {
    intent: "code_review",
    patterns: [
      /\b(?:review|check|audit|analyze|inspect)\b.*\b(?:code|file|module|function)\b/i,
      /\bcode\s+review\b/i,
      /\bfind\b.*\b(?:bugs?|issues?|problems?|errors?)\b.*\b(?:in|code)\b/i,
    ],
    confidence: 0.8,
    verb: "TASK",
    action: "review",
  },

  // Code debug
  {
    intent: "code_debug",
    patterns: [
      /\b(?:debug|fix|troubleshoot|diagnose)\b/i,
      /\bwhy\b.*\b(?:not working|failing|error|broken|crash)\b/i,
      /\b(?:not working|doesn't work|won't work|broken)\b/i,
    ],
    confidence: 0.75,
    verb: "TASK",
    action: "debug",
  },

  // Code refactor
  {
    intent: "code_refactor",
    patterns: [
      /\b(?:refactor|restructure|reorganize|clean\s*up|improve)\b.*\b(?:code|file|module)\b/i,
      /\b(?:simplify|optimize)\b.*\b(?:code|function|module)\b/i,
    ],
    confidence: 0.8,
    verb: "TASK",
    action: "refactor",
  },

  // Memory — remember
  {
    intent: "remember",
    patterns: [
      /\b(?:remember|save|store|note|jot|record)\b/i,
      /\bkeep\s+(?:a\s+)?note\b/i,
      /\bdon't\s+forget\b/i,
      /\bmake\s+a\s+note\b/i,
    ],
    confidence: 0.85,
    verb: "REQ",
    action: "save_note",
  },

  // Memory — recall
  {
    intent: "recall",
    patterns: [
      /\b(?:recall|retrieve|what\s+did\s+I|do\s+you\s+remember)\b/i,
      /\b(?:my|the)\s+notes?\b/i,
      /\bsearch\b.*\bnotes?\b/i,
      /\bshow\b.*\bnotes?\b/i,
    ],
    confidence: 0.85,
    verb: "REQ",
    action: "recall_notes",
  },

  // Clipboard management
  {
    intent: "clipboard_manage",
    patterns: [
      /\b(?:copy|paste|clipboard)\b/i,
      /\b(?:copy|put)\b.*\bclipboard\b/i,
      /\bclipboard\b.*\b(?:contents?|read|get|show)\b/i,
      /\bpaste\b.*\b(?:from|what)\b/i,
    ],
    confidence: 0.8,
    verb: "REQ",
    action: "clipboard",
  },

  // Browser automation
  {
    intent: "browser_automate",
    patterns: [
      /\b(?:automate|scrape|crawl|fill|click|navigate)\b.*\b(?:page|site|website|browser|form)\b/i,
      /\b(?:take|capture)\b.*\bscreenshot\b/i,
      /\bplaywright\b/i,
      /\b(?:open|go to)\b.*\b(?:page|site|website)\b.*\b(?:and|then)\b/i,
      /\bfill\b.*\bform\b/i,
      /\bextract\b.*\b(?:data|text|content)\b.*\b(?:from|page|site|website)\b/i,
    ],
    confidence: 0.8,
    verb: "TASK",
    action: "browser_automate",
  },

  // Scheduling / automation
  {
    intent: "schedule_task",
    patterns: [
      /\b(?:schedule|remind|set\s+(?:a\s+)?reminder|cron|alarm|timer|wake)\b/i,
      /\b(?:every|at|in)\b.*\b(?:minutes?|hours?|days?|am|pm|\d{1,2}:\d{2})\b/i,
      /\b(?:run|execute|do)\b.*\b(?:later|tomorrow|tonight|daily|weekly|hourly)\b/i,
      /\bautomatically\b.*\b(?:run|check|update|send)\b/i,
    ],
    confidence: 0.8,
    verb: "REQ",
    action: "schedule",
  },
];

/**
 * Encode a natural language message into ClawTalk format.
 */
export function encode(naturalLanguage: string): EncodedMessage {
  const text = naturalLanguage.trim();
  if (!text) {
    return makeConversationResult(text, 0.9);
  }

  // Try each intent pattern
  let bestMatch: { pattern: IntentPattern; score: number; matchedPatterns: number } | null = null;

  for (const intentPattern of INTENT_PATTERNS) {
    let matchCount = 0;
    for (const regex of intentPattern.patterns) {
      if (regex.test(text)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Score = base confidence + bonus for multiple pattern matches
      const multiMatchBonus = Math.min((matchCount - 1) * 0.05, 0.15);
      const score = intentPattern.confidence + multiMatchBonus;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { pattern: intentPattern, score, matchedPatterns: matchCount };
      }
    }
  }

  // No pattern matched → conversation intent
  if (!bestMatch) {
    return makeConversationResult(text, 0.4);
  }

  const { pattern, score } = bestMatch;

  // Extract parameters
  const params: Record<string, string | number | boolean | string[]> = {};
  if (pattern.extractors) {
    for (const extractor of pattern.extractors) {
      if (params[extractor.key] !== undefined) {
        continue; // First match wins
      }
      const match = text.match(extractor.pattern);
      if (match) {
        const raw = match[extractor.group ?? 0];
        params[extractor.key] = extractor.transform ? extractor.transform(raw) : raw;
      }
    }
  }

  // Extract main query for search-like intents
  if (pattern.intent === "web_search" && !params.q) {
    params.q = extractSearchQuery(text);
  }

  // For summarize intent, use original text as query if no target
  if (pattern.intent === "summarize" && !params.target) {
    params.q = text;
  }

  // Build the CT message
  const message: ClawTalkMessage = {
    version: 1,
    verb: pattern.verb,
    action: pattern.action,
    params,
  };

  const wire = serialize(message);

  return {
    message,
    wire,
    confidence: Math.min(score, 1.0),
    intent: pattern.intent,
    shouldEscalate: score < 0.5,
  };
}

/**
 * Extract the core search query from a natural language message.
 */
function extractSearchQuery(text: string): string {
  let query = text
    .replace(
      /^(?:please\s+)?(?:can you\s+)?(?:search|find|look up|google)\s+(?:for\s+)?(?:me\s+)?/i,
      "",
    )
    .replace(
      /^(?:what|who|when|where|how|why)\s+(?:is|are|was|were|did|does|do|will|would|can|could)\s+/i,
      "",
    )
    .replace(/\s*\?+\s*$/, "")
    .trim();

  // Remove trailing instructional phrases
  query = query
    .replace(/\s+and\s+(?:give|show|return|list|provide)\b.*/i, "")
    .replace(/\s+(?:please|thanks?|thank you)\s*$/i, "")
    .trim();

  return query || text;
}

/**
 * Create a conversation (passthrough) result.
 */
function makeConversationResult(text: string, confidence: number): EncodedMessage {
  const message: ClawTalkMessage = {
    version: 1,
    verb: "REQ",
    action: "chat",
    params: { q: text },
  };

  return {
    message,
    wire: serialize(message),
    confidence,
    intent: "conversation",
    shouldEscalate: false,
  };
}

/**
 * Estimate token count for a string (rough: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
