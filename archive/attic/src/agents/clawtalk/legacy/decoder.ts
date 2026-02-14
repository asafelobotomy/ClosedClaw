/**
 * ClawTalk Decoder
 *
 * Translates CT/1 wire format messages back into natural language.
 * Used to present agent responses to the user in readable form.
 */

import type { ClawTalkMessage } from "./types.js";

function formatParam(value: ClawTalkMessage["params"][string] | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

/** Decode templates for common action types */
const ACTION_TEMPLATES: Record<string, (msg: ClawTalkMessage) => string> = {
  web_search: (msg) => {
    const q = formatParam(msg.params.q) || "unknown";
    const limit = msg.params.limit !== undefined ? ` (top ${formatParam(msg.params.limit)})` : "";
    const since =
      msg.params.since !== undefined ? ` from the last ${formatParam(msg.params.since)}` : "";
    return `Search the web for "${q}"${since}${limit}`;
  },
  summarize: (msg) => {
    const target = formatParam(msg.params.target ?? msg.params.url) || "the content";
    return `Summarize ${target}`;
  },
  browse: (msg) => {
    const url = formatParam(msg.params.url) || "the URL";
    return `Browse ${url}`;
  },
  read_file: (msg) => {
    const target = formatParam(msg.params.target) || "the file";
    return `Read file ${target}`;
  },
  write_file: (msg) => {
    const target = formatParam(msg.params.target) || "the file";
    return `Write to ${target}`;
  },
  list_directory: (msg) => {
    const target = formatParam(msg.params.target) || ".";
    return `List contents of ${target}`;
  },
  exec: (msg) => {
    const cmd = formatParam(msg.params.cmd) || "the command";
    return `Run command: ${cmd}`;
  },
  code_generate: (msg) => {
    const lang = msg.params.lang !== undefined ? ` in ${formatParam(msg.params.lang)}` : "";
    const q = formatParam(msg.params.q) || "the requested code";
    return `Generate code${lang}: ${q}`;
  },
  review: (msg) => {
    const target = formatParam(msg.params.target) || "the code";
    return `Review ${target}`;
  },
  debug: (msg) => {
    const target = formatParam(msg.params.target) || "the issue";
    return `Debug ${target}`;
  },
  refactor: (msg) => {
    const target = formatParam(msg.params.target) || "the code";
    return `Refactor ${target}`;
  },
  save_note: (msg) => {
    const content = msg.params.q ?? msg.params.content ?? "";
    const str = typeof content === "string" ? content : String(content);
    return `Save note: ${str.slice(0, 100)}`;
  },
  recall_notes: (msg) => {
    const q = msg.params.q !== undefined ? ` matching "${formatParam(msg.params.q)}"` : "";
    return `Recall notes${q}`;
  },
  chat: (msg) => String(msg.params.q ?? ""),
  audit: (msg) => {
    const target = formatParam(msg.params.target) || "the target";
    const scope =
      msg.params.scope !== undefined ? ` (scope: ${formatParam(msg.params.scope)})` : "";
    return `Audit ${target}${scope}`;
  },
};

/**
 * Decode a ClawTalk message back to human-readable text.
 */
export function decode(msg: ClawTalkMessage): string {
  if (msg.verb === "RES") {
    return decodeResponse(msg);
  }
  if (msg.verb === "ERR") {
    return decodeError(msg);
  }
  if (msg.verb === "STATUS") {
    return decodeStatus(msg);
  }

  if (msg.verb === "ACK") {
    return `Acknowledged${msg.params.ref !== undefined ? ` (ref: ${formatParam(msg.params.ref)})` : ""}`;
  }

  if (msg.verb === "NOOP") {
    return msg.params.reason !== undefined
      ? `No action needed: ${formatParam(msg.params.reason)}`
      : "No action needed";
  }

  // REQ/TASK — use action templates
  const action = msg.action ?? "";
  const template = ACTION_TEMPLATES[action];
  if (template) {
    return template(msg);
  }

  // Fallback: reconstruct from parts
  const parts: string[] = [msg.verb];
  if (msg.action) {
    parts.push(msg.action);
  }
  for (const [k, v] of Object.entries(msg.params)) {
    parts.push(`${k}=${formatParam(v)}`);
  }
  return parts.join(" ");
}

/** Decode a RES message */
function decodeResponse(msg: ClawTalkMessage): string {
  if (typeof msg.params.text === "string") {
    return msg.params.text;
  }

  if (msg.payload) {
    if (typeof msg.payload === "string") {
      return msg.payload;
    }
    if (Array.isArray(msg.payload)) {
      return msg.payload.map((item, i) => `${i + 1}. ${formatPayloadItem(item)}`).join("\n");
    }
    return JSON.stringify(msg.payload, null, 2);
  }

  if (msg.params.ok) {
    const items = msg.params.items !== undefined ? ` (${formatParam(msg.params.items)} items)` : "";
    return `Completed successfully${items}`;
  }

  return "Response received";
}

/** Decode an ERR message */
function decodeError(msg: ClawTalkMessage): string {
  const code = formatParam(msg.params.code) || "unknown";
  const tool = msg.params.tool !== undefined ? ` in ${formatParam(msg.params.tool)}` : "";
  const elapsed =
    msg.params.elapsed !== undefined ? ` after ${formatParam(msg.params.elapsed)}` : "";
  const retry = msg.params.retry ? " (will retry)" : "";
  return `Error: ${code}${tool}${elapsed}${retry}`;
}

/** Decode a STATUS message */
function decodeStatus(msg: ClawTalkMessage): string {
  const progress = msg.params.progress;
  const phase = msg.params.phase !== undefined ? ` — ${formatParam(msg.params.phase)}` : "";
  const findings =
    msg.params.findings !== undefined ? `, ${formatParam(msg.params.findings)} finding(s)` : "";

  if (typeof progress === "number") {
    const pct = Math.round(Number(progress) * 100);
    return `Progress: ${pct}%${phase}${findings}`;
  }
  return `Status update${phase}${findings}`;
}

/** Format a single payload item for display */
function formatPayloadItem(item: unknown): string {
  if (typeof item === "string") {
    return item;
  }
  if (typeof item !== "object" || item === null) {
    return String(item);
  }

  const obj = item as Record<string, unknown>;
  const title = obj.title ?? obj.name ?? obj.label ?? obj.id;
  const desc = obj.description ?? obj.summary ?? obj.text;

  const titleText = title == null ? "" : formatUnknown(title);
  const descText = desc == null ? "" : formatUnknown(desc);

  if (titleText && descText) {
    return `**${titleText}**: ${descText}`;
  }
  if (titleText) {
    return titleText;
  }
  if (descText) {
    return descText;
  }

  return JSON.stringify(item);
}
