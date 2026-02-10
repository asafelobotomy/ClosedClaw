/**
 * ClawTalk Abbreviation Engine
 *
 * Compresses and expands abbreviations in ClawTalk wire messages.
 */

import type { ClawTalkDictionary } from "./types.js";

/**
 * Compress a string using abbreviations from the dictionary.
 * Replaces known long forms with their short forms.
 */
export function compress(input: string, dict: ClawTalkDictionary): string {
  let result = input;
  // Sort by length (longest full form first) to avoid partial replacements
  const sorted = Object.entries(dict.abbreviations).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [short, long] of sorted) {
    result = result.replaceAll(long, short);
  }
  return result;
}

/**
 * Expand a string by replacing abbreviations with their full forms.
 */
export function expand(input: string, dict: ClawTalkDictionary): string {
  let result = input;
  // Sort by length (longest short form first) to avoid partial expansions
  const sorted = Object.entries(dict.abbreviations).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [short, long] of sorted) {
    result = result.replaceAll(short, long);
  }
  return result;
}
