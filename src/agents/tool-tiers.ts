/**
 * Tool Tier Definitions
 *
 * Defines which tools are available at each tier level:
 *   - **lite**:   Minimal safe tools for small local models (e.g., Qwen3:8B).
 *                 File I/O, search, basic shell execution. No orchestration.
 *   - **medium**: Coding workflow tools + research. Adds editing, browser,
 *                 memory, TTS. Excludes multi-agent orchestration.
 *   - **full**:   All tools available (no filtering applied).
 *
 * The tier is set via `agents.list.<agent>.tools.tier` in config.
 * When tier is "full" (or unset), `filterToolsByTier` is a no-op.
 *
 * Tool names cover both the main gateway agent pipeline (e.g. "read", "exec")
 * and the GTK lite-tools pipeline (e.g. "read_file", "run_command").
 */

import type { AnyAgentTool } from "./tools/common.js";

export type ToolTier = "lite" | "medium" | "full";

// ---------------------------------------------------------------------------
// Tier allowlists
// ---------------------------------------------------------------------------

/**
 * Lite tier — safe, fast tools that small models handle well.
 * These are mostly "do one thing and return" tools.
 */
const LITE_TOOL_NAMES = new Set([
  // --- Main agent pipeline (pi-tools / openclaw-tools) ---
  "read",
  "write",
  "find",
  "grep",
  "ls",
  "exec",
  "web_search",
  "web_fetch",

  // --- GTK lite-tools pipeline ---
  "read_file",
  "write_file",
  "list_directory",
  "run_command",
  "fetch_url",
  "clipboard_read",
  "clipboard_write",
  "calculator",
  "current_time",
  "screenshot",
]);

/**
 * Medium tier — adds coding workflow, research, and memory tools.
 * Includes lite tools plus tools that benefit from moderate reasoning.
 */
const MEDIUM_TOOL_NAMES = new Set([
  // Everything in lite
  ...LITE_TOOL_NAMES,

  // --- Main agent pipeline additions ---
  "edit",
  "process",
  "apply_patch",
  "browser",
  "image",
  "tts",
  "memory_search",
  "memory_get",
  "canvas",

  // --- Plugin tools (commonly enabled) ---
  "memory_recall",
  "memory_store",
  "memory_forget",

  // --- GTK lite-tools additions ---
  "save_note",
  "recall_notes",
  "reflect_memory",
  "set_reminder",
  "screenshot_region",
  "ocr_image",
  "screenshot_ocr",
]);

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

const TIER_SETS: Record<ToolTier, Set<string> | null> = {
  lite: LITE_TOOL_NAMES,
  medium: MEDIUM_TOOL_NAMES,
  full: null, // No filtering
};

/**
 * Filter a tool array down to tools allowed at the given tier.
 *
 * - `"full"` (or undefined): returns tools unchanged.
 * - `"medium"`: keeps LITE + MEDIUM tools.
 * - `"lite"`: keeps only LITE tools.
 *
 * This runs AFTER the existing policy chain in pi-tools.ts, so it is
 * an additional restriction, never a permission grant.
 */
export function filterToolsByTier(
  tools: AnyAgentTool[],
  tier: ToolTier | undefined,
): AnyAgentTool[] {
  if (!tier || tier === "full") {
    return tools;
  }

  const allowSet = TIER_SETS[tier];
  if (!allowSet) {
    return tools;
  }

  return tools.filter((tool) => allowSet.has(tool.name));
}

/**
 * Get the tool names allowed at a given tier.
 * Useful for diagnostics and the GTK monitor status display.
 */
export function getTierAllowlist(tier: ToolTier): ReadonlySet<string> | null {
  return TIER_SETS[tier] ?? null;
}

/**
 * Check if a specific tool name is allowed at a given tier.
 */
export function isToolAllowedAtTier(toolName: string, tier: ToolTier | undefined): boolean {
  if (!tier || tier === "full") {
    return true;
  }
  const allowSet = TIER_SETS[tier];
  return allowSet ? allowSet.has(toolName) : true;
}
