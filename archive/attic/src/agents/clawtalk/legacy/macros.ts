/**
 * ClawTalk Macro Expansion
 *
 * Handles parameterized macro expansion from dictionary macros
 * into full ClawTalk wire format messages.
 */

import type { ClawTalkDictionary, ClawTalkMessage } from "./types.js";
import { parse } from "./parser.js";

/**
 * Expand a macro invocation into a ClawTalkMessage.
 *
 * @param name - Macro name (e.g., "WEBSRCH")
 * @param args - Parameter values (e.g., { query: "nodejs", limit: "5" })
 * @param dict - The dictionary containing macro definitions
 * @returns The expanded message, or null if macro not found
 */
export function expandMacro(
  name: string,
  args: Record<string, string>,
  dict: ClawTalkDictionary,
): ClawTalkMessage | null {
  const macro = dict.macros[name.toUpperCase()];
  if (!macro) {
    return null;
  }

  let expanded = macro.expansion;

  // Substitute {param} placeholders with provided args
  for (const [key, value] of Object.entries(args)) {
    expanded = expanded.replaceAll(`{${key}}`, value);
  }

  // Remove any un-substituted placeholders
  expanded = expanded.replace(/\{[^}]+\}/g, "");

  // Clean up double spaces from removed placeholders
  expanded = expanded.replace(/\s{2,}/g, " ").trim();

  return parse(expanded);
}

/**
 * Check if a string looks like a macro invocation.
 * Format: MACRONAME or MACRONAME(param1="value", param2="value")
 */
export function isMacroInvocation(input: string): boolean {
  return /^[A-Z_]{2,}(?:\(.*\))?$/.test(input.trim());
}

/**
 * Parse a macro invocation string.
 *
 * Formats:
 *   "WEBSRCH" → { name: "WEBSRCH", args: {} }
 *   'WEBSRCH(query="nodejs", limit="5")' → { name: "WEBSRCH", args: { query: "nodejs", limit: "5" } }
 */
export function parseMacroInvocation(
  input: string,
): { name: string; args: Record<string, string> } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^([A-Z_]{2,})(?:\((.+)\))?$/);
  if (!match) {
    return null;
  }

  const name = match[1];
  const args: Record<string, string> = {};

  if (match[2]) {
    const argRegex = /(\w+)\s*=\s*(?:"([^"]*)"|([\w./-]+))/g;
    let argMatch: RegExpExecArray | null;
    while ((argMatch = argRegex.exec(match[2])) !== null) {
      args[argMatch[1]] = argMatch[2] ?? argMatch[3];
    }
  }

  return { name, args };
}
