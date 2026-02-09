/**
 * Agent Profile Registry — Load, manage, and resolve agent profiles
 *
 * Profiles bridge the gap between:
 * - **Squad templates** (built-in, code-defined agent archetypes)
 * - **User profiles** (markdown files in ~/.closedclaw/agents/)
 * - **Agent config** (JSON5 agent definitions in config)
 *
 * The registry provides:
 * - Discovery: Scan profile directories for .md files
 * - Parsing: Extract structured data from markdown frontmatter + content
 * - Resolution: Merge template defaults with user customizations
 * - Validation: Ensure profiles have required fields and valid tool references
 *
 * @module agents/profiles/registry
 */

import type {
  AgentProfile,
  ProfileLoadError,
  ProfileRegistryConfig,
  ProfileRegistrySnapshot,
  ProfileSchedule,
  ProfileToolAccess,
} from "./types.js";
import {
  AGENT_TEMPLATES,
  type AgentTemplate,
} from "../squad/templates.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TOKEN_BUDGET = 50_000;
const DEFAULT_EXTENSIONS = [".md"];
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

// ─── Markdown Profile Parser ────────────────────────────────────────────────

/**
 * Parsed result from a markdown profile file.
 */
interface ParsedProfile {
  frontmatter: Record<string, unknown>;
  content: string;
}

/**
 * Parse a markdown profile file into frontmatter + content.
 *
 * Supports YAML-like frontmatter delimited by `---`:
 * ```markdown
 * ---
 * name: DevOps Agent
 * model: claude-opus-4
 * tools: [read, exec, grep_search]
 * ---
 *
 * # System Prompt
 * You are a DevOps specialist...
 * ```
 */
export function parseProfileMarkdown(raw: string): ParsedProfile {
  const match = raw.match(FRONTMATTER_REGEX);

  if (!match) {
    // No frontmatter — entire content is the system prompt
    return { frontmatter: {}, content: raw.trim() };
  }

  const [, frontmatterRaw, content] = match;
  const frontmatter = parseSimpleYaml(frontmatterRaw);

  return { frontmatter, content: content.trim() };
}

/**
 * Parse simple YAML-like key-value pairs from frontmatter.
 *
 * Supports:
 * - `key: value` (string values)
 * - `key: [a, b, c]` (arrays)
 * - `key: 123` (numbers)
 * - `key: true/false` (booleans)
 *
 * Does NOT support nested objects, multi-line values, etc.
 */
export function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {continue;}

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {continue;}

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (!key) {continue;}
    result[key] = parseYamlValue(rawValue);
  }

  return result;
}

/**
 * Parse a single YAML value (string, number, boolean, or array).
 */
function parseYamlValue(raw: string): unknown {
  // Boolean
  if (raw === "true") {return true;}
  if (raw === "false") {return false;}

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {return Number(raw);}

  // Array: [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) {return [];}
    return inner.split(",").map((s) => {
      const trimmed = s.trim();
      // Strip quotes
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    });
  }

  // Strip quotes from string values
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  return raw;
}

// ─── Template → Profile Conversion ──────────────────────────────────────────

/**
 * Convert a built-in squad template to an AgentProfile.
 */
export function templateToProfile(template: AgentTemplate): AgentProfile {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    source: "template",
    systemPrompt: template.systemPrompt,
    tools: { allow: [...template.tools] },
    model: template.suggestedModel,
    tokenBudget: template.defaultTokenBudget,
    capabilities: [...template.capabilities],
    loadedAt: Date.now(),
  };
}

/**
 * Convert all built-in templates to profiles.
 */
export function builtinProfiles(): AgentProfile[] {
  return Object.values(AGENT_TEMPLATES).map(templateToProfile);
}

// ─── File → Profile Conversion ──────────────────────────────────────────────

/**
 * Create an AgentProfile from a parsed markdown file.
 *
 * @param id - Profile ID (derived from filename)
 * @param parsed - Parsed frontmatter + content
 * @param filePath - Source file path
 */
export function fileToProfile(
  id: string,
  parsed: ParsedProfile,
  filePath: string,
): AgentProfile {
  const fm = parsed.frontmatter;

  // Extract name from frontmatter or first heading
  const name = extractString(fm, "name") ?? extractHeading(parsed.content) ?? id;

  // Extract tools
  const toolsRaw = fm.tools;
  const tools: ProfileToolAccess = Array.isArray(toolsRaw)
    ? { allow: toolsRaw.map(String) }
    : { allow: [] };

  // Check for deny list
  const denyRaw = fm.deny_tools ?? fm.denyTools;
  if (Array.isArray(denyRaw)) {
    tools.deny = denyRaw.map(String);
  }

  // Extract capabilities
  const capsRaw = fm.capabilities;
  const capabilities = Array.isArray(capsRaw) ? capsRaw.map(String) : [id];

  // Extract fallbacks
  const fallbacksRaw = fm.fallbacks ?? fm.fallbackModels;
  const fallbackModels = Array.isArray(fallbacksRaw)
    ? fallbacksRaw.map(String)
    : undefined;

  // Extract schedules
  const schedulesRaw = fm.schedules;
  const schedules = Array.isArray(schedulesRaw)
    ? schedulesRaw
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map(parseSchedule)
        .filter((s): s is ProfileSchedule => s !== null)
    : undefined;

  return {
    id,
    name,
    description: extractString(fm, "description") ?? `${name} agent profile`,
    source: "file",
    systemPrompt: parsed.content,
    tools,
    model: extractString(fm, "model"),
    fallbackModels,
    tokenBudget: extractNumber(fm, "tokenBudget") ?? extractNumber(fm, "token_budget") ?? DEFAULT_TOKEN_BUDGET,
    capabilities,
    schedules,
    metadata: fm,
    filePath,
    loadedAt: Date.now(),
  };
}

/**
 * Merge a file-based profile with a matching built-in template.
 *
 * File overrides take precedence; missing fields fall back to template.
 */
export function mergeWithTemplate(
  fileProfile: AgentProfile,
  template: AgentTemplate,
): AgentProfile {
  return {
    ...fileProfile,
    source: "composite",
    // Merge tools: file overrides, template fills gaps
    tools: {
      allow: fileProfile.tools.allow.length > 0
        ? fileProfile.tools.allow
        : [...template.tools],
      deny: fileProfile.tools.deny,
    },
    // Merge capabilities
    capabilities: fileProfile.capabilities.length > 1 || fileProfile.capabilities[0] !== fileProfile.id
      ? fileProfile.capabilities
      : [...template.capabilities],
    // Use file model or fall back to template
    model: fileProfile.model ?? template.suggestedModel,
    // Use file budget or template budget
    tokenBudget: fileProfile.tokenBudget !== DEFAULT_TOKEN_BUDGET
      ? fileProfile.tokenBudget
      : template.defaultTokenBudget,
  };
}

// ─── Profile Registry ────────────────────────────────────────────────────────

/**
 * Load profiles from a directory and merge with built-in templates.
 *
 * @param config - Registry configuration
 * @param readDir - Directory listing function (path → filenames)
 * @param readFile - File reading function (path → contents)
 * @returns Snapshot of all loaded profiles
 */
export async function loadProfileRegistry(
  config: ProfileRegistryConfig,
  readDir: (path: string) => Promise<string[]>,
  readFile: (path: string) => Promise<string>,
): Promise<ProfileRegistrySnapshot> {
  const profiles: AgentProfile[] = [];
  const errors: ProfileLoadError[] = [];
  const extensions = config.extensions ?? DEFAULT_EXTENSIONS;

  // Start with built-in templates
  const templateProfiles = config.includeBuiltins !== false
    ? builtinProfiles()
    : [];

  const templateMap = new Map<string, AgentProfile>();
  for (const tp of templateProfiles) {
    templateMap.set(tp.id, tp);
  }

  // Scan directory for profile files
  let files: string[] = [];
  try {
    files = await readDir(config.profileDir);
  } catch {
    // Directory might not exist — that's fine, just use templates
  }

  const profileFiles = files.filter((f) =>
    extensions.some((ext) => f.endsWith(ext)),
  );

  // Load each profile file
  for (const filename of profileFiles) {
    const filePath = `${config.profileDir}/${filename}`;
    const id = filename.replace(/\.[^.]+$/, ""); // Strip extension

    try {
      const raw = await readFile(filePath);
      const parsed = parseProfileMarkdown(raw);
      let profile = fileToProfile(id, parsed, filePath);

      // If a matching template exists, merge
      const matchingTemplate = AGENT_TEMPLATES[id];
      if (matchingTemplate) {
        profile = mergeWithTemplate(profile, matchingTemplate);
        templateMap.delete(id); // Template is now merged, don't duplicate
      }

      profiles.push(profile);
    } catch (err) {
      errors.push({
        filePath,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
    }
  }

  // Add remaining templates that weren't overridden by files
  for (const tp of templateMap.values()) {
    profiles.push(tp);
  }

  return {
    profiles,
    loadedAt: Date.now(),
    errors,
  };
}

/**
 * Resolve a profile by ID from a registry snapshot.
 */
export function resolveProfile(
  snapshot: ProfileRegistrySnapshot,
  id: string,
): AgentProfile | undefined {
  return snapshot.profiles.find((p) => p.id === id);
}

/**
 * Find profiles matching capability requirements.
 */
export function findProfilesByCapability(
  snapshot: ProfileRegistrySnapshot,
  capabilities: string[],
): AgentProfile[] {
  return snapshot.profiles.filter((p) =>
    capabilities.some((cap) => p.capabilities.includes(cap)),
  );
}

/**
 * Validate that a profile has minimum required fields.
 */
export function validateProfile(profile: AgentProfile): string[] {
  const issues: string[] = [];

  if (!profile.id) {issues.push("Missing profile ID");}
  if (!profile.name) {issues.push("Missing profile name");}
  if (!profile.systemPrompt) {issues.push("Missing system prompt");}
  if (profile.tools.allow.length === 0) {
    issues.push("No tools allowed — agent will be unable to perform actions");
  }
  if (profile.tokenBudget <= 0) {
    issues.push(`Invalid token budget: ${profile.tokenBudget}`);
  }

  return issues;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
}

function extractNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const val = obj[key];
  return typeof val === "number" ? val : undefined;
}

function extractHeading(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)/m);
  return match?.[1]?.trim();
}

function parseSchedule(obj: Record<string, unknown>): ProfileSchedule | null {
  const expression = typeof obj.expression === "string"
    ? obj.expression
    : typeof obj.cron === "string"
      ? obj.cron
      : null;

  const task = typeof obj.task === "string" ? obj.task : null;

  if (!expression || !task) {return null;}

  return {
    expression,
    task,
    timezone: typeof obj.timezone === "string" ? obj.timezone : undefined,
    model: typeof obj.model === "string" ? obj.model : undefined,
    timeoutSeconds: typeof obj.timeoutSeconds === "number" ? obj.timeoutSeconds : undefined,
  };
}
