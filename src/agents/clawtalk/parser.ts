/**
 * ClawTalk Parser
 *
 * Parses CT/1 wire format messages into structured ClawTalkMessage objects.
 * Grammar: CT/<version> <VERB> [action] [key=value]* [\n---\n<json_payload>]
 */

import type { ClawTalkMessage, ClawTalkVerb, ClawTalkVersion } from "./types.js";

const VALID_VERBS = new Set<ClawTalkVerb>([
  "REQ",
  "RES",
  "TASK",
  "STATUS",
  "NOOP",
  "ERR",
  "ACK",
  "MULTI",
]);

/** Parse error with context */
export class ClawTalkParseError extends Error {
  constructor(
    message: string,
    public readonly input: string,
    public readonly position?: number,
  ) {
    super(`ClawTalk parse error: ${message}`);
    this.name = "ClawTalkParseError";
  }
}

/**
 * Parse a CT/1 wire format string into a ClawTalkMessage.
 *
 * Examples:
 *   "CT/1 REQ web_search q=\"nodejs vuln\" limit=5"
 *   "CT/1 RES ok items=3\n---\n[{...}]"
 *   "CT/1 ERR code=timeout tool=web_search"
 */
export function parse(input: string): ClawTalkMessage {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ClawTalkParseError("Empty input", input);
  }

  // Split payload from header+params
  let headerSection: string;
  let payload: unknown | undefined;
  const delimiterIndex = trimmed.indexOf("\n---\n");
  if (delimiterIndex !== -1) {
    headerSection = trimmed.slice(0, delimiterIndex).trim();
    const payloadStr = trimmed.slice(delimiterIndex + 5).trim();
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      throw new ClawTalkParseError(`Invalid JSON payload: ${payloadStr.slice(0, 100)}`, input);
    }
  } else {
    headerSection = trimmed;
  }

  // Tokenize the header section
  const tokens = tokenize(headerSection);
  if (tokens.length < 2) {
    throw new ClawTalkParseError("Expected at least protocol header and verb", input);
  }

  // Parse protocol header: CT/<version>
  const header = tokens[0];
  const versionMatch = header.match(/^CT\/(\d+)$/);
  if (!versionMatch) {
    throw new ClawTalkParseError(
      `Invalid protocol header: "${header}" (expected CT/<version>)`,
      input,
    );
  }
  const parsedVersion = Number.parseInt(versionMatch[1], 10);
  if (parsedVersion !== 1) {
    throw new ClawTalkParseError(`Unsupported protocol version: ${parsedVersion}`, input);
  }
  const version: ClawTalkVersion = 1;

  // Parse verb
  const verbStr = tokens[1].toUpperCase();
  if (!VALID_VERBS.has(verbStr as ClawTalkVerb)) {
    throw new ClawTalkParseError(`Unknown verb: "${verbStr}"`, input);
  }
  const verb = verbStr as ClawTalkVerb;

  // Parse remaining tokens as action + params
  let action: string | undefined;
  const params: Record<string, string | number | boolean | string[]> = {};

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];
    const eqIndex = token.indexOf("=");
    if (eqIndex === -1) {
      // Positional token — first one is the action, rest are flags
      if (!action) {
        action = token;
      } else {
        params[token] = true;
      }
    } else {
      const key = token.slice(0, eqIndex);
      const rawValue = token.slice(eqIndex + 1);
      params[key] = parseValue(rawValue);
    }
  }

  return { version, verb, action, params, payload, raw: input };
}

/**
 * Serialize a ClawTalkMessage back to wire format.
 */
export function serialize(msg: ClawTalkMessage): string {
  const parts: string[] = [`CT/${msg.version}`, msg.verb];

  if (msg.action) {
    parts.push(msg.action);
  }

  for (const [key, value] of Object.entries(msg.params)) {
    if (value === true) {
      parts.push(key);
    } else if (Array.isArray(value)) {
      parts.push(`${key}=${value.join(",")}`);
    } else if (typeof value === "string" && (value.includes(" ") || value.includes('"'))) {
      parts.push(`${key}="${value.replace(/"/g, '\\"')}"`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  let wire = parts.join(" ");
  if (msg.payload !== undefined) {
    wire += `\n---\n${JSON.stringify(msg.payload, null, 2)}`;
  }

  return wire;
}

/**
 * Check if a string looks like a ClawTalk wire message.
 */
export function isClawTalkMessage(input: string): boolean {
  return /^CT\/\d+\s+(REQ|RES|TASK|STATUS|NOOP|ERR|ACK|MULTI)\b/i.test(input.trim());
}

// --- Internal helpers ---

/**
 * Tokenize a ClawTalk header line, respecting quoted strings.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let escape = false;

  for (const ch of input) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (!inQuote && (ch === " " || ch === "\t")) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Parse a parameter value string into a typed value.
 */
function parseValue(raw: string): string | number | boolean | string[] {
  let value = raw;

  // Strip surrounding quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\"/g, '"');
  }

  // Boolean
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  // Duration suffix (30d, 24h, 1w) → keep as string
  if (/^\d+[smhdwMy]$/.test(value)) {
    return value;
  }

  // Token count suffix (4.2k, 12M) → keep as string
  if (/^\d+(\.\d+)?[kKmM]$/.test(value)) {
    return value;
  }

  // Comma-separated array
  if (value.includes(",") && !value.includes(" ")) {
    return value.split(",");
  }

  return value;
}
