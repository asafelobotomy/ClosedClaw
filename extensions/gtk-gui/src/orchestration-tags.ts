/**
 * Orchestration Tag Parser
 *
 * Post-processes model output to detect and act on structured XML-style
 * orchestration tags (Layer 2 of the OpenClaw Orchestration Dialect).
 *
 * Tags processed:
 *   <thought>...</thought>    — Internal reasoning (stripped from user output)
 *   <plan>...</plan>          — Step list (stripped, logged)
 *   <reflection>...</reflection> — Self-critique (stripped, logged)
 *   <memory_write>...</memory_write> — Triggers save_note side-effect
 *   <safety_check>...</safety_check> — Logged for audit
 *   <handoff target="..." />  — Agent transfer signal (logged)
 *   <stream>...</stream>      — Long-running output marker (passed through)
 *   <call:skill ...>...</call:skill> — Skill invocation (triggers tool execution)
 *   <safety_block>...</safety_block> — Blocked command audit (hidden, logged)
 */

import { executeTool } from "./lite-tools.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OrchestrationTag {
  /** Tag name (thought, plan, memory_write, call, safety_block, etc.) */
  tag: string;
  /** Inner content of the tag */
  content: string;
  /** Attributes from the tag (e.g., target="research_agent") */
  attrs: Record<string, string>;
  /** For <call:skill> tags — the skill name after the colon */
  skillName?: string;
  /** Position in original text */
  start: number;
  end: number;
}

export interface TagProcessingResult {
  /** Cleaned text with internal tags stripped (user-facing) */
  cleanText: string;
  /** Extracted tags with metadata */
  tags: OrchestrationTag[];
  /** Side-effects that were executed (e.g., memory writes) */
  sideEffects: string[];
  /** Whether a handoff was requested */
  handoff?: { target: string; context?: string };
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/** Tags that are always stripped from user-visible output */
const HIDDEN_TAGS = new Set(["thought", "plan", "reflection", "safety_check", "safety_block"]);

/** Tags that trigger side-effects */
const SIDE_EFFECT_TAGS = new Set(["memory_write", "call"]);

/**
 * Regex to match XML-style tags (opening + closing) or self-closing.
 * Captures:
 *   1: tag name (including call:skillname)
 *   2: attributes string
 *   3: inner content (for non-self-closing)
 */
const TAG_REGEX =
  /<(thought|plan|reflection|memory_write|safety_check|safety_block|handoff|stream|call:\w+)(\s+[^>]*)?\s*(?:\/>|>([\s\S]*?)<\/\1>)/gi;

/** Parse attributes from a tag attribute string */
function parseAttrs(attrStr: string | undefined): Record<string, string> {
  if (!attrStr) {
    return {};
  }
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * Extract all orchestration tags from model output.
 */
export function extractTags(text: string): OrchestrationTag[] {
  const tags: OrchestrationTag[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  TAG_REGEX.lastIndex = 0;

  while ((match = TAG_REGEX.exec(text)) !== null) {
    const rawTag = match[1].toLowerCase();
    // For <call:skill_name>, separate the tag kind and skill name
    let tagName = rawTag;
    let skillName: string | undefined;
    if (rawTag.startsWith("call:")) {
      skillName = rawTag.slice(5);
      tagName = "call";
    }

    tags.push({
      tag: tagName,
      content: (match[3] ?? "").trim(),
      attrs: parseAttrs(match[2]),
      skillName,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return tags;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process model output: extract tags, execute side-effects, strip hidden tags.
 *
 * @param text Raw model output
 * @param log Optional logger
 * @returns Processed result with clean text and tag metadata
 */
export async function processOrchestrationTags(
  text: string,
  log?: {
    debug?: (msg: string) => void;
    info?: (msg: string) => void;
    error?: (msg: string) => void;
  },
): Promise<TagProcessingResult> {
  const tags = extractTags(text);
  const sideEffects: string[] = [];
  let handoff: TagProcessingResult["handoff"];

  // Process side-effects
  for (const tag of tags) {
    switch (tag.tag) {
      case "thought":
        log?.debug?.(`[orch] <thought> ${tag.content.slice(0, 120)}`);
        break;

      case "plan":
        log?.debug?.(`[orch] <plan> ${tag.content.slice(0, 200)}`);
        break;

      case "reflection":
        log?.info?.(`[orch] <reflection> ${tag.content.slice(0, 200)}`);
        break;

      case "safety_check":
        log?.info?.(`[orch] <safety_check> ${tag.content.slice(0, 200)}`);
        break;

      case "memory_write": {
        if (tag.content) {
          log?.info?.(`[orch] <memory_write> Saving: ${tag.content.slice(0, 80)}`);
          try {
            const result = await executeTool("save_note", { content: tag.content });
            sideEffects.push(`memory_write: ${result.slice(0, 100)}`);
          } catch (err) {
            log?.error?.(`[orch] memory_write failed: ${(err as Error).message}`);
          }
        }
        break;
      }

      case "handoff": {
        const target = tag.attrs.target ?? tag.content;
        if (target) {
          log?.info?.(`[orch] <handoff> target=${target} context=${tag.attrs.context ?? "none"}`);
          handoff = { target, context: tag.attrs.context };
        }
        break;
      }

      case "stream":
        // Stream tags pass through — no special processing
        log?.debug?.(`[orch] <stream> type=${tag.attrs.type ?? "default"}`);
        break;

      case "call": {
        // <call:skill_name param="value">content</call:skill_name>
        const skill = tag.skillName ?? tag.attrs.skill;
        if (skill) {
          log?.info?.(`[orch] <call:${skill}> ${tag.content.slice(0, 80)}`);
          try {
            const callParams: Record<string, string> = { ...tag.attrs };
            if (tag.content) {
              callParams.content = tag.content;
            }
            delete callParams.skill; // Don't pass skill as param
            const result = await executeTool(skill, callParams);
            sideEffects.push(`call:${skill}: ${result.slice(0, 100)}`);
          } catch (err) {
            log?.error?.(`[orch] call:${skill} failed: ${(err as Error).message}`);
          }
        }
        break;
      }

      case "safety_block": {
        // <safety_block> — blocked command audit log
        log?.info?.(`[orch] <safety_block> BLOCKED: ${tag.content.slice(0, 200)}`);
        const violatedRule = tag.attrs.violated_rule ?? tag.attrs.violatedRule;
        const riskLevel = tag.attrs.risk_level ?? tag.attrs.riskLevel;
        if (violatedRule) {
          log?.info?.(`[orch]   Rule: ${violatedRule}, Risk: ${riskLevel ?? "unknown"}`);
        }
        sideEffects.push(`safety_block: ${tag.content.slice(0, 100)}`);
        break;
      }
    }
  }

  // Build clean text by removing hidden tags
  let cleanText = text;
  // Process in reverse order to maintain correct positions
  const sortedTags = [...tags].toSorted((a, b) => b.start - a.start);
  for (const tag of sortedTags) {
    if (HIDDEN_TAGS.has(tag.tag) || SIDE_EFFECT_TAGS.has(tag.tag)) {
      cleanText = cleanText.slice(0, tag.start) + cleanText.slice(tag.end);
    }
  }

  // Clean up any resulting multi-newlines
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanText, tags, sideEffects, handoff };
}

/**
 * Quick check if text contains any orchestration tags (fast pre-check).
 */
export function hasOrchestrationTags(text: string): boolean {
  return /<(?:thought|plan|reflection|memory_write|safety_check|safety_block|handoff|stream|call:\w+)[\s>/]/i.test(
    text,
  );
}
