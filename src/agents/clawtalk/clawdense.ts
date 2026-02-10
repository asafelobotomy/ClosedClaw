/**
 * ClawDense — Token-Optimized Agent Notation
 *
 * Translates between verbose CT/1 wire format and compact ClawDense prefix notation.
 * ~60% token reduction for machine-to-machine communication.
 *
 * Prefix reference:
 *   !  Auth/Perms          !auth:chk($U, "S_RW")
 *   @  SysCall              @fs:r("/path")
 *   ?  Query                ?fs:diff("/etc", $BASELINE)
 *   >> Flow (handoff)       >>$sub(coder)
 *   << Flow (return)        <<$return(result)
 *   :: State ops            ::flush($SID)
 *   $  Variable reference   $UID
 *   #  Comment              # audit check
 */

import type { ClawTalkMessage, ClawTalkVerb } from "./types.js";
import type { ClawsLexicon } from "./claws-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// LEXICON STATE
// ═══════════════════════════════════════════════════════════════════════════

let activeLexicon: ClawsLexicon | null = null;
let lexiconExpansion: Record<string, string> = {}; // shorthand → full
let lexiconCompression: Record<string, string> = {}; // full → shorthand
let pathExpansion: Record<string, string> = {}; // short path → full
let pathCompression: Record<string, string> = {}; // full → short

/**
 * Load a lexicon (Block 8) for stenographic compression.
 * Once loaded, encode/decode will apply lexicon mappings.
 */
export function loadLexicon(lexicon: ClawsLexicon): void {
  activeLexicon = lexicon;

  // Build bidirectional maps for word mappings
  lexiconExpansion = { ...lexicon.mappings };
  lexiconCompression = {};
  for (const [short, full] of Object.entries(lexicon.mappings)) {
    lexiconCompression[full] = short;
  }

  // Build bidirectional maps for path compressions
  pathExpansion = {};
  pathCompression = {};
  if (lexicon.pathCompressions) {
    for (const [short, full] of Object.entries(lexicon.pathCompressions)) {
      pathExpansion[short] = full;
      pathCompression[full] = short;
    }
  }
}

/**
 * Clear the active lexicon (revert to base ClawDense).
 */
export function clearLexicon(): void {
  activeLexicon = null;
  lexiconExpansion = {};
  lexiconCompression = {};
  pathExpansion = {};
  pathCompression = {};
}

/**
 * Get the currently loaded lexicon (or null if none).
 */
export function getActiveLexicon(): ClawsLexicon | null {
  return activeLexicon;
}

/**
 * Apply lexicon compression to a dense-encoded string.
 * Replaces known full terms with shorthand and compresses paths.
 */
export function applyLexiconCompression(text: string): string {
  if (!activeLexicon) return text;
  let result = text;

  // Apply path compressions first (longer matches first to avoid partial)
  const sortedPaths = Object.entries(pathCompression).sort(([a], [b]) => b.length - a.length);
  for (const [full, short] of sortedPaths) {
    result = result.replaceAll(full, short);
  }

  // Apply word-level compressions (bounded by non-alphanumeric)
  for (const [full, short] of Object.entries(lexiconCompression)) {
    const escaped = full.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "g"), short);
  }

  return result;
}

/**
 * Expand lexicon shorthand in a dense string back to full terms.
 */
export function applyLexiconExpansion(text: string): string {
  if (!activeLexicon) return text;
  let result = text;

  // Apply path expansions first (longer matches first)
  const sortedPaths = Object.entries(pathExpansion).sort(([a], [b]) => b.length - a.length);
  for (const [short, full] of sortedPaths) {
    result = result.replaceAll(short, full);
  }

  // Apply word-level expansions (bounded by non-alphanumeric)
  for (const [short, full] of Object.entries(lexiconExpansion)) {
    const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "g"), full);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// OP-CODE MAPS
// ═══════════════════════════════════════════════════════════════════════════

/** Map CT/1 actions → ClawDense op-codes */
const ACTION_TO_DENSE: Record<string, string> = {
  // File system
  read_file: "@fs:r",
  write_file: "@fs:w",
  list_directory: "@fs:ls",
  search_files: "@fs:s",
  // Web/network
  web_search: "?web:s",
  fetch_url: "@net:fetch",
  // Memory
  save_note: "@mem:w",
  recall_notes: "?mem:r",
  reflect_memory: "?mem:reflect",
  // System
  run_command: "@sys:exec",
  clipboard_read: "@sys:clip:r",
  clipboard_write: "@sys:clip:w",
  screenshot: "@sys:snap",
  screenshot_region: "@sys:snap:region",
  ocr_image: "@sys:ocr",
  screenshot_ocr: "@sys:snap:ocr",
  set_reminder: "@sys:remind",
  // Code
  code_generate: "@code:gen",
  code_review: "?code:review",
  code_debug: "?code:debug",
  code_refactor: "@code:refactor",
  // Agent control
  summarize: "?ai:summarize",
  calculator: "?calc",
  current_time: "?sys:time",
  // Auth (Shield)
  auth_check: "!auth:chk",
  grant: "!grant",
  revoke: "!revoke",
  // Vault
  vault_read: "@vault:r",
  vault_write: "@vault:w",
  // Triggers
  trigger_refactor: "!trigger:refactor",
  trigger_backup: "!trigger:backup",
};

/** Reverse map: ClawDense op-code → CT/1 action */
const DENSE_TO_ACTION: Record<string, string> = {};
for (const [action, dense] of Object.entries(ACTION_TO_DENSE)) {
  DENSE_TO_ACTION[dense] = action;
}

/** Map CT/1 verbs → dense verb sigils */
const VERB_SIGILS: Record<ClawTalkVerb, string> = {
  REQ: "",      // Implicit (most common)
  RES: "<=",
  TASK: ">>",
  STATUS: "~",
  NOOP: ".",
  ERR: "!!",
  ACK: "ok",
  MULTI: "[]",
};

/** Reverse: sigil → verb */
const SIGIL_TO_VERB: Record<string, ClawTalkVerb> = {
  "<=": "RES",
  ">>": "TASK",
  "~": "STATUS",
  ".": "NOOP",
  "!!": "ERR",
  "ok": "ACK",
  "[]": "MULTI",
};

// ═══════════════════════════════════════════════════════════════════════════
// ENCODER (CT/1 → ClawDense)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encode a CT/1 message to ClawDense notation.
 *
 * Example:
 *   CT/1 REQ web_search q="nodejs vuln" limit=5
 *   → ?web:s("nodejs vuln", limit=5)
 */
export function toDense(msg: ClawTalkMessage): string {
  const parts: string[] = [];

  // Verb prefix (REQ is implicit)
  const sigil = VERB_SIGILS[msg.verb] ?? "";
  if (sigil) parts.push(sigil);

  // Action → op-code
  const action = msg.action ?? "";
  const opcode = ACTION_TO_DENSE[action] ?? action;

  // Format parameters
  const paramEntries = Object.entries(msg.params);
  if (paramEntries.length === 0 && !msg.payload) {
    parts.push(opcode);
    return parts.join(" ").trim();
  }

  // Build function-style call: opcode(args)
  const args: string[] = [];

  // Special handling for common param patterns
  const q = msg.params.q ?? msg.params.query ?? msg.params.content;
  if (q !== undefined) {
    args.push(formatDenseValue(q));
  }

  // Remaining params as key=value
  for (const [key, value] of paramEntries) {
    if (key === "q" || key === "query" || key === "content") continue;
    if (typeof value === "boolean" && value) {
      args.push(key);
    } else {
      args.push(`${key}=${formatDenseValue(value)}`);
    }
  }

  parts.push(`${opcode}(${args.join(", ")})`);

  // Payload (compact JSON on same line with -> )
  if (msg.payload !== undefined) {
    parts.push(`-> ${JSON.stringify(msg.payload)}`);
  }

  return parts.join(" ").trim();
}

/**
 * Encode multiple CT/1 messages into a ClawDense block.
 * Each message becomes one line.
 */
export function toDenseBlock(messages: ClawTalkMessage[]): string {
  return messages.map(toDense).join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// DECODER (ClawDense → CT/1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decode a single ClawDense line into a CT/1 message.
 *
 * Example:
 *   ?web:s("nodejs vuln", limit=5)
 *   → { version: 1, verb: "REQ", action: "web_search", params: { q: "nodejs vuln", limit: 5 } }
 */
export function fromDense(line: string): ClawTalkMessage {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return { version: 1, verb: "NOOP", params: {}, raw: line };
  }

  // Check for payload arrow
  let mainPart = trimmed;
  let payload: unknown | undefined;
  const arrowIdx = trimmed.indexOf(" -> ");
  if (arrowIdx !== -1) {
    mainPart = trimmed.slice(0, arrowIdx).trim();
    try {
      payload = JSON.parse(trimmed.slice(arrowIdx + 4).trim());
    } catch {
      // Payload not valid JSON — treat as string param
      payload = trimmed.slice(arrowIdx + 4).trim();
    }
  }

  // Detect verb sigil
  let verb: ClawTalkVerb = "REQ";

  // Special: >>$sub(...) — detect handoff sigil first
  if (mainPart.startsWith(">>$sub(") || mainPart.startsWith(">> $sub(")) {
    verb = "TASK";
    mainPart = mainPart.slice(2).trim();
  } else if (mainPart.startsWith("<<$return(") || mainPart.startsWith("<< $return(")) {
    verb = "RES";
    mainPart = mainPart.slice(2).trim();
  } else {
    for (const [sigil, v] of Object.entries(SIGIL_TO_VERB)) {
      if (mainPart.startsWith(sigil + " ") || mainPart.startsWith(sigil + "(")) {
        verb = v;
        mainPart = mainPart.slice(sigil.length).trim();
        break;
      }
      if (mainPart === sigil) {
        return { version: 1, verb: v, params: {}, raw: line };
      }
    }
  }

  // Special: subagent handoff >>$sub(name) [state]
  const subMatch = mainPart.match(/^\$sub\((\w+)\)(?:\s+\[(\w+)\])?$/);
  if (subMatch || (verb === "TASK" && mainPart.startsWith("$sub("))) {
    const m = mainPart.match(/\$sub\((\w+)\)(?:\s+\[(\w+)\])?$/);
    if (m) {
      const params: Record<string, string | number | boolean | string[]> = { target: m[1] };
      if (m[2]) params.state = m[2];
      return { version: 1, verb: "TASK", action: "subagent_handoff", params, raw: line };
    }
  }

  // Special: return <<$return(result)
  if (mainPart.startsWith("$return(")) {
    const inner = mainPart.slice(8, -1);
    return { version: 1, verb: "RES", action: "subagent_return", params: { result: inner }, raw: line };
  }

  // Special: state ops ::hyd(), ::save(), ::flush()
  if (mainPart.startsWith("::")) {
    const stateMatch = mainPart.match(/^::(\w+)\(([^)]*)\)$/);
    if (stateMatch) {
      return {
        version: 1,
        verb: "REQ",
        action: `state_${stateMatch[1]}`,
        params: stateMatch[2] ? { id: stateMatch[2].replace(/^\$/, "") } : {},
        raw: line,
      };
    }
  }

  // Parse opcode(args) format
  const parenIdx = mainPart.indexOf("(");
  let opcode: string;
  let argsStr = "";

  if (parenIdx !== -1 && mainPart.endsWith(")")) {
    opcode = mainPart.slice(0, parenIdx);
    argsStr = mainPart.slice(parenIdx + 1, -1);
  } else {
    // No parentheses — bare opcode
    opcode = mainPart;
  }

  // Resolve opcode → CT/1 action
  const action = DENSE_TO_ACTION[opcode] ?? opcode;

  // Parse arguments
  const params: Record<string, string | number | boolean | string[]> = {};
  if (argsStr) {
    const argTokens = tokenizeDenseArgs(argsStr);
    let positionalIndex = 0;

    for (const token of argTokens) {
      const eqIdx = token.indexOf("=");
      if (eqIdx !== -1 && !token.startsWith('"') && !token.startsWith("'")) {
        const key = token.slice(0, eqIdx);
        params[key] = parseDenseValue(token.slice(eqIdx + 1));
      } else {
        // Positional argument
        const value = parseDenseValue(token);
        if (positionalIndex === 0) {
          // First positional → "q" or "path" depending on action
          const key = action.includes("file") || action.includes("directory") ? "path" : "q";
          params[key] = value;
        } else {
          params[`arg${positionalIndex}`] = value;
        }
        positionalIndex++;
      }
    }
  }

  return { version: 1, verb, action, params, payload, raw: line };
}

/**
 * Decode a multi-line ClawDense block into CT/1 messages.
 * Skips blank lines and comments (#).
 */
export function fromDenseBlock(block: string): ClawTalkMessage[] {
  return block
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map(fromDense);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate token count for a string (rough cl100k_base approximation).
 * ~4 chars per token on average for English text with code symbols.
 */
export function estimateDenseTokens(text: string): number {
  // Symbols count as individual tokens
  const symbolCount = (text.match(/[!@?$#:()=\[\]{}><]/g) ?? []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.replace(/\s/g, "").length;
  return Math.ceil(symbolCount * 0.7 + wordCount * 0.8 + charCount / 5);
}

/**
 * Calculate compression ratio: dense tokens / verbose tokens.
 * Lower is better (more compression).
 */
export function compressionRatio(verbose: string, dense: string): number {
  const vTokens = estimateDenseTokens(verbose);
  const dTokens = estimateDenseTokens(dense);
  return vTokens > 0 ? dTokens / vTokens : 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatDenseValue(value: unknown): string {
  if (typeof value === "string") {
    // Variables pass through unquoted
    if (value.startsWith("$")) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatDenseValue).join(",")}]`;
  }
  return JSON.stringify(value);
}

function parseDenseValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  // Strip quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") return num;
  // Variable or bare string
  return trimmed;
}

/**
 * Tokenize ClawDense function arguments, respecting quotes and nested parens.
 * Splits on commas that are not inside quotes or parentheses.
 */
function tokenizeDenseArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuote) {
      current += ch;
      if (ch === inQuote && input[i - 1] !== "\\") inQuote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth--;
      current += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      const t = current.trim();
      if (t) tokens.push(t);
      current = "";
      continue;
    }

    current += ch;
  }

  const last = current.trim();
  if (last) tokens.push(last);

  return tokens;
}
