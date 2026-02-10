/**
 * Lite Mode Tool System
 *
 * Provides tool definitions and execution for enhanced lite mode.
 * Works with Ollama's native tool calling API for models that support it,
 * with pattern-based fallback for models that don't.
 */

import { readFile, readdir, stat, appendFile, mkdir, writeFile } from "node:fs/promises";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import {
  getDatabase as getFtsDatabase,
  insertFact as ftsInsertFact,
  searchFacts as ftsSearchFacts,
  getFactsByEntity as ftsGetFactsByEntity,
  getAllEntities as ftsGetAllEntities,
  getStats as ftsGetStats,
  importFromIndex as ftsImportFromIndex,
  type StoredFact,
  type FactType as FtsFactType,
} from "./memory-fts.js";
import {
  assessRisk,
  recordExecution,
  formatRiskReport,
  type RiskAssessment,
} from "./risk-scoring.js";

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LiteTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export interface ToolCallResult {
  role: "tool";
  content: string;
  tool_name: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 4096; // 4KB truncation limit
const MAX_OUTPUT_SIZE = 8192; // 8KB command output limit
const MAX_DIR_ENTRIES = 50;
const MAX_WRITE_SIZE = 65536; // 64KB max file write
const COMMAND_TIMEOUT_MS = 30_000;
const WEB_SEARCH_TIMEOUT_MS = 10_000;
const NOTES_DIR = join(homedir(), ".closedclaw", "notes");
const NOTES_FILE = join(NOTES_DIR, "notes.txt");

// --- Structured Memory (Retain/Recall/Reflect) ---
const MEMORY_DIR = join(homedir(), ".closedclaw", "workspace", "memory");
const MEMORY_BANK_DIR = join(homedir(), ".closedclaw", "workspace", "bank");
const MEMORY_ENTITIES_DIR = join(MEMORY_BANK_DIR, "entities");
const MEMORY_INDEX_FILE = join(MEMORY_DIR, ".memory-index.json");

type FactType = "W" | "B" | "O" | "S";

interface MemoryFact {
  id: string;
  type: FactType;
  content: string;
  entities: string[];
  confidence?: number; // 0.0-1.0, only for opinions
  timestamp: string;
  source: string; // e.g. memory/2026-02-09.md
}

interface MemoryIndex {
  version: 1;
  facts: MemoryFact[];
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyMemoryPath(date?: string): string {
  return join(MEMORY_DIR, `${date ?? todayDateStr()}.md`);
}

/** Extract @entity mentions from text */
function extractEntities(text: string): string[] {
  const matches = text.match(/@[\w-]+/g);
  return matches ? [...new Set(matches.map((m) => m.slice(1)))] : [];
}

/** Detect fact type from prefix or infer from content */
function parseFact(raw: string): { type: FactType; confidence?: number; content: string } {
  // Match: "W: ...", "B: ...", "O(c=90): ...", "S: ..."
  const prefixMatch = raw.match(/^(W|B|O|S)(?:\(c=([\d.]+)\))?:\s*(.+)$/s);
  if (prefixMatch) {
    const type = prefixMatch[1] as FactType;
    const confidence = prefixMatch[2] ? Number.parseFloat(prefixMatch[2]) : undefined;
    return { type, confidence, content: prefixMatch[3] };
  }
  // Also accept without colon: "W ...", "B ...", etc.
  const nocolonMatch = raw.match(/^(W|B|O|S)(?:\(c=([\d.]+)\))?\s+(.+)$/s);
  if (nocolonMatch) {
    const type = nocolonMatch[1] as FactType;
    const confidence = nocolonMatch[2] ? Number.parseFloat(nocolonMatch[2]) : undefined;
    return { type, confidence, content: nocolonMatch[3] };
  }
  // Infer: opinions usually have "prefer", "like", "think"
  if (/\b(prefer|like|dislike|think|believe|opinion|feel)\b/i.test(raw)) {
    return { type: "O", confidence: 0.8, content: raw };
  }
  // Default to world fact
  return { type: "W", content: raw };
}

async function loadMemoryIndex(): Promise<MemoryIndex> {
  try {
    const data = await readFile(MEMORY_INDEX_FILE, "utf-8");
    return JSON.parse(data) as MemoryIndex;
  } catch {
    return { version: 1, facts: [] };
  }
}

async function saveMemoryIndex(index: MemoryIndex): Promise<void> {
  await mkdir(MEMORY_DIR, { recursive: true });
  await writeFile(MEMORY_INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}

const FACT_TYPE_LABELS: Record<FactType, string> = {
  W: "World",
  B: "Experience",
  O: "Opinion",
  S: "Summary",
};

// ═══════════════════════════════════════════════════════════════════════════
// FTS5 INTEGRATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let _ftsSeeded = false;

/** Ensure FTS5 database is seeded from JSON index (one-time migration). */
async function ensureFtsSeeded(): Promise<void> {
  if (_ftsSeeded) return;
  _ftsSeeded = true;
  const db = getFtsDatabase();
  if (!db) return;
  try {
    const index = await loadMemoryIndex();
    if (index.facts.length > 0) {
      ftsImportFromIndex(db, index.facts);
    }
  } catch {
    // Non-fatal: FTS remains available even if migration fails
  }
}

/** Insert a fact into FTS5 db (best-effort, never throws). */
function ftsInsertBestEffort(fact: {
  type: FactType;
  content: string;
  entities: string[];
  confidence?: number | null;
  timestamp?: string;
}): void {
  try {
    const db = getFtsDatabase();
    if (db) ftsInsertFact(db, fact);
  } catch {
    // Non-fatal
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════

const READ_FILE: LiteTool = {
  name: "read_file",
  description: "Read the contents of a file from the filesystem",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute path to the file to read",
      },
    },
    required: ["path"],
  },
  async execute({ path }) {
    const filePath = String(path);
    try {
      const content = await readFile(filePath, "utf-8");
      if (content.length > MAX_FILE_SIZE) {
        return content.slice(0, MAX_FILE_SIZE) + "\n\n...[truncated, file too large]";
      }
      return content;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return `Error: File not found: ${filePath}`;
      }
      if (error.code === "EACCES") {
        return `Error: Permission denied: ${filePath}`;
      }
      if (error.code === "EISDIR") {
        return `Error: Path is a directory, not a file: ${filePath}`;
      }
      return `Error reading file: ${error.message}`;
    }
  },
};

const RUN_COMMAND: LiteTool = {
  name: "run_command",
  description: "Execute a shell command and return its output",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
    },
    required: ["command"],
  },
  async execute({ command }) {
    const cmd = String(command);
    try {
      const { stdout, _stderr } = await execAsync(cmd, {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB
        shell: "/bin/bash",
      });

      let output = stdout || stderr || "(no output)";
      if (output.length > MAX_OUTPUT_SIZE) {
        output = output.slice(0, MAX_OUTPUT_SIZE) + "\n\n...[truncated, output too large]";
      }
      return output;
    } catch (err) {
      const error = err as Error & { killed?: boolean; code?: number; stderr?: string };
      if (error.killed) {
        return `Error: Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`;
      }
      if (error._stderr) {
        return `Error (exit ${error.code}): ${error.stderr.slice(0, 500)}`;
      }
      return `Error: ${error.message}`;
    }
  },
};

const LIST_DIRECTORY: LiteTool = {
  name: "list_directory",
  description: "List the contents of a directory",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute path to the directory to list",
      },
    },
    required: ["path"],
  },
  async execute({ path }) {
    const dirPath = String(path);
    try {
      const entries = await readdir(dirPath);
      const limited = entries.slice(0, MAX_DIR_ENTRIES);

      const results: string[] = [];
      for (const name of limited) {
        try {
          const fullPath = join(dirPath, name);
          const s = await stat(fullPath);
          results.push(s.isDirectory() ? `${name}/` : name);
        } catch {
          results.push(name);
        }
      }

      let output = results.join("\n");
      if (entries.length > MAX_DIR_ENTRIES) {
        output += `\n\n...[${entries.length - MAX_DIR_ENTRIES} more entries not shown]`;
      }
      return output || "(empty directory)";
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return `Error: Directory not found: ${dirPath}`;
      }
      if (error.code === "EACCES") {
        return `Error: Permission denied: ${dirPath}`;
      }
      if (error.code === "ENOTDIR") {
        return `Error: Path is not a directory: ${dirPath}`;
      }
      return `Error listing directory: ${error.message}`;
    }
  },
};

const SAVE_NOTE: LiteTool = {
  name: "save_note",
  description:
    "Save a structured memory fact. Prefix with W (world fact), B (experience/biographical), " +
    "O (opinion — include confidence like O(c=0.9)), or S (summary). " +
    "Tag entities with @name. Examples: " +
    "'W @Alice lives in Berlin', 'O(c=0.85) @Peter prefers dark themes', " +
    "'B Fixed the gateway crash by restarting the service'. " +
    "If no prefix is given, the system infers the type automatically.",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The fact to remember. Optionally prefix with W/B/O/S and tag entities with @name.",
      },
    },
    required: ["content"],
  },
  async execute({ content }) {
    const raw = String(content);
    try {
      // Parse structured fact
      const { type, confidence, content: factContent } = parseFact(raw);
      const entities = extractEntities(raw);
      const timestamp = new Date().toISOString();
      const date = todayDateStr();
      const source = `memory/${date}.md`;
      const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Build display line for Markdown
      const prefix = type === "O" && confidence != null ? `${type}(c=${confidence})` : type;
      const entityTags = entities.length > 0 ? ` ${entities.map((e) => `@${e}`).join(" ")}` : "";
      const mdLine = `- ${prefix}${entityTags}: ${factContent}`;

      // 1. Append to daily Markdown log
      const dailyPath = dailyMemoryPath(date);
      await mkdir(MEMORY_DIR, { recursive: true });
      try {
        const existing = await readFile(dailyPath, "utf-8");
        if (!existing.includes("## Retain")) {
          await appendFile(dailyPath, `\n## Retain\n${mdLine}\n`, "utf-8");
        } else {
          await appendFile(dailyPath, `${mdLine}\n`, "utf-8");
        }
      } catch {
        // New daily file
        await writeFile(dailyPath, `# Memory Log — ${date}\n\n## Retain\n${mdLine}\n`, "utf-8");
      }

      // 2. Update JSON index
      const index = await loadMemoryIndex();
      const fact: MemoryFact = { id, type, content: factContent, entities, confidence, timestamp, source };
      index.facts.push(fact);
      await saveMemoryIndex(index);

      // 2b. Dual-write to FTS5 database
      ftsInsertBestEffort({ type, content: factContent, entities, confidence, timestamp });

      // 3. Legacy: also append to flat notes.txt for backward compat
      await mkdir(NOTES_DIR, { recursive: true });
      await appendFile(NOTES_FILE, `[${timestamp}] ${raw}\n`, "utf-8");

      const typeLabel = FACT_TYPE_LABELS[type];
      const parts = [`${typeLabel} fact saved`];
      if (entities.length > 0) parts.push(`entities: ${entities.map((e) => `@${e}`).join(", ")}`);
      if (confidence != null) parts.push(`confidence: ${confidence}`);
      return parts.join(" — ") + ".";
    } catch (err) {
      return `Error saving note: ${(err as Error).message}`;
    }
  },
};

const RECALL_NOTES: LiteTool = {
  name: "recall_notes",
  description:
    "Retrieve saved memory facts with advanced filtering. Supports: " +
    "keyword search, entity filter (@name), type filter (W/B/O/S), " +
    "and time range (e.g. '7d' for last 7 days, '2026-02-01' for specific date). " +
    "Returns structured results with source attribution.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Keyword to search for in saved facts. Leave empty to browse recent facts.",
      },
      entity: {
        type: "string",
        description:
          "Filter by entity name (without @). E.g. 'Alice' to find all facts about Alice.",
      },
      type: {
        type: "string",
        description:
          "Filter by fact type: W (world), B (experience), O (opinion), S (summary).",
      },
      since: {
        type: "string",
        description:
          "Time filter: number+d for days (e.g. '7d'), or ISO date (e.g. '2026-02-01').",
      },
    },
    required: [],
  },
  async execute({ query, entity, type, since }) {
    try {
      // Try FTS5 backend first (faster, ranked results)
      await ensureFtsSeeded();
      const ftsDb = getFtsDatabase();
      if (ftsDb) {
        const ftsResults = ftsSearchFacts(ftsDb, {
          query: query ? String(query) : undefined,
          entity: entity ? String(entity) : undefined,
          type: type ? (String(type).toUpperCase() as FactType) : undefined,
          since: since ? String(since) : undefined,
          limit: 25,
        });

        if (ftsResults.length === 0) {
          // Check total count for context
          const stats = ftsGetStats(ftsDb);
          if (stats.total === 0) {
            // Fallback to legacy notes.txt
            try {
              const legacy = await readFile(NOTES_FILE, "utf-8");
              const lines = legacy.split("\n").filter(Boolean);
              if (lines.length > 0) {
                const recent = lines.slice(-10);
                return `No structured facts found. Legacy notes (${lines.length} total):\n\n${recent.join("\n")}`;
              }
            } catch {}
            return "No facts stored yet. Use save_note to remember things.";
          }
          const filters: string[] = [];
          if (query) filters.push(`query="${query}"`);
          if (entity) filters.push(`entity=@${entity}`);
          if (type) filters.push(`type=${type}`);
          if (since) filters.push(`since=${since}`);
          return `No facts matching ${filters.join(", ")}. Total facts stored: ${stats.total}. (FTS5)`;
        }

        const lines = ftsResults.map(({ fact: f }) => {
          const prefix = f.type === "O" && f.confidence != null ? `${f.type}(c=${f.confidence})` : f.type;
          const ents = f.entities.length > 0 ? ` ${f.entities.map((e: string) => `@${e}`).join(" ")}` : "";
          const date = f.timestamp.slice(0, 10);
          return `[${date}] ${prefix}${ents}: ${f.content}`;
        });
        return `Found ${ftsResults.length} fact(s) (FTS5):\n\n${lines.join("\n")}`;
      }

      // Fallback: JSON index scanning (original path)
      const index = await loadMemoryIndex();
      if (index.facts.length === 0) {
        // Fallback: try legacy notes.txt
        try {
          const legacy = await readFile(NOTES_FILE, "utf-8");
          const lines = legacy.split("\n").filter(Boolean);
          if (lines.length > 0) {
            const recent = lines.slice(-10);
            return `No structured facts found. Legacy notes (${lines.length} total):\n\n${recent.join("\n")}`;
          }
        } catch {}
        return "No facts stored yet. Use save_note to remember things.";
      }

      let results = [...index.facts];

      // Filter by entity
      if (entity) {
        const ent = String(entity).toLowerCase();
        results = results.filter((f) => f.entities.some((e) => e.toLowerCase() === ent));
      }

      // Filter by type
      if (type) {
        const t = String(type).toUpperCase() as FactType;
        if (["W", "B", "O", "S"].includes(t)) {
          results = results.filter((f) => f.type === t);
        }
      }

      // Filter by time
      if (since) {
        const sinceStr = String(since).trim();
        let cutoff: Date;
        const daysMatch = sinceStr.match(/^(\d+)d$/);
        if (daysMatch) {
          cutoff = new Date(Date.now() - Number.parseInt(daysMatch[1], 10) * 86400000);
        } else {
          cutoff = new Date(sinceStr);
        }
        if (!Number.isNaN(cutoff.getTime())) {
          results = results.filter((f) => new Date(f.timestamp) >= cutoff);
        }
      }

      // Filter by keyword
      if (query) {
        const q = String(query).toLowerCase();
        results = results.filter((f) => f.content.toLowerCase().includes(q));
      }

      if (results.length === 0) {
        const filters: string[] = [];
        if (query) filters.push(`query="${query}"`);
        if (entity) filters.push(`entity=@${entity}`);
        if (type) filters.push(`type=${type}`);
        if (since) filters.push(`since=${since}`);
        return `No facts matching ${filters.join(", ")}. Total facts stored: ${index.facts.length}.`;
      }

      // Format results
      const limited = results.slice(-25);
      const lines = limited.map((f) => {
        const prefix = f.type === "O" && f.confidence != null ? `${f.type}(c=${f.confidence})` : f.type;
        const ents = f.entities.length > 0 ? ` ${f.entities.map((e) => `@${e}`).join(" ")}` : "";
        const date = f.timestamp.slice(0, 10);
        return `[${date}] ${prefix}${ents}: ${f.content}`;
      });

      const header =
        results.length > 25
          ? `Showing ${limited.length} of ${results.length} facts:\n\n`
          : `Found ${results.length} fact(s):\n\n`;
      return header + lines.join("\n");
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return "No facts stored yet.";
      }
      return `Error recalling facts: ${error.message}`;
    }
  },
};

const REFLECT_MEMORY: LiteTool = {
  name: "reflect_memory",
  description:
    "Generate a summary of what's known about a specific entity or topic. " +
    "Aggregates all facts, shows opinion confidence levels, and identifies gaps. " +
    "Use this when the user asks 'tell me about X' or 'what do you know about X'.",
  parameters: {
    type: "object",
    properties: {
      entity: {
        type: "string",
        description:
          "Entity name (without @) to reflect on. E.g. 'Alice', 'Castle', 'Rust'.",
      },
    },
    required: ["entity"],
  },
  async execute({ entity }) {
    const entityName = String(entity).trim();
    if (!entityName) return "Provide an entity name to reflect on.";
    try {
      const index = await loadMemoryIndex();
      const entityLower = entityName.toLowerCase();
      const facts = index.facts.filter((f) =>
        f.entities.some((e) => e.toLowerCase() === entityLower) ||
        f.content.toLowerCase().includes(entityLower),
      );

      if (facts.length === 0) {
        return `No facts known about "${entityName}". Try saving some facts first with save_note.`;
      }

      // Group by type
      const grouped: Record<FactType, MemoryFact[]> = { W: [], B: [], O: [], S: [] };
      for (const f of facts) grouped[f.type].push(f);

      const sections: string[] = [`# What I know about @${entityName}\n`];
      sections.push(`**Total facts:** ${facts.length}`);
      const dateRange = `${facts[0].timestamp.slice(0, 10)} — ${facts[facts.length - 1].timestamp.slice(0, 10)}`;
      sections.push(`**Date range:** ${dateRange}\n`);

      if (grouped.W.length > 0) {
        sections.push("## World Facts");
        for (const f of grouped.W) sections.push(`- ${f.content} *(${f.timestamp.slice(0, 10)})*`);
        sections.push("");
      }
      if (grouped.B.length > 0) {
        sections.push("## Experiences");
        for (const f of grouped.B) sections.push(`- ${f.content} *(${f.timestamp.slice(0, 10)})*`);
        sections.push("");
      }
      if (grouped.O.length > 0) {
        sections.push("## Opinions & Preferences");
        for (const f of grouped.O) {
          const conf = f.confidence != null ? ` [confidence: ${f.confidence}]` : "";
          sections.push(`- ${f.content}${conf} *(${f.timestamp.slice(0, 10)})*`);
        }
        sections.push("");
      }
      if (grouped.S.length > 0) {
        sections.push("## Summaries");
        for (const f of grouped.S) sections.push(`- ${f.content} *(${f.timestamp.slice(0, 10)})*`);
        sections.push("");
      }

      // Related entities
      const relatedEntities = new Set<string>();
      for (const f of facts) {
        for (const e of f.entities) {
          if (e.toLowerCase() !== entityLower) relatedEntities.add(e);
        }
      }
      if (relatedEntities.size > 0) {
        sections.push(`## Related Entities`);
        sections.push([...relatedEntities].map((e) => `@${e}`).join(", "));
      }

      // Optionally persist entity summary to bank
      try {
        await mkdir(MEMORY_ENTITIES_DIR, { recursive: true });
        const entityFile = join(MEMORY_ENTITIES_DIR, `${entityName.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`);
        await writeFile(entityFile, sections.join("\n") + "\n", "utf-8");
      } catch {
        // Non-critical — summary display still works
      }

      return sections.join("\n");
    } catch (err) {
      return `Error reflecting on "${entityName}": ${(err as Error).message}`;
    }
  },
};

const CURRENT_TIME: LiteTool = {
  name: "current_time",
  description: "Get the current date and time",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    const now = new Date();
    return now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  },
};

const WRITE_FILE: LiteTool = {
  name: "write_file",
  description: "Write content to a file. Creates the file if it doesn't exist, or overwrites if it does.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute path to the file to write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  },
  async execute({ path, content }) {
    const filePath = String(path);
    const fileContent = String(content);

    // Safety checks
    if (fileContent.length > MAX_WRITE_SIZE) {
      return `Error: Content too large (${fileContent.length} bytes). Maximum is ${MAX_WRITE_SIZE} bytes.`;
    }

    // Prevent writing to sensitive system paths
    const dangerousPaths = ["/etc", "/bin", "/sbin", "/usr", "/boot", "/lib", "/root"];
    if (dangerousPaths.some((p) => filePath.startsWith(p))) {
      return `Error: Cannot write to system directory: ${filePath}`;
    }

    try {
      // Create parent directory if needed
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, fileContent, "utf-8");
      return `Successfully wrote ${fileContent.length} bytes to ${filePath}`;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "EACCES") {
        return `Error: Permission denied: ${filePath}`;
      }
      if (error.code === "EISDIR") {
        return `Error: Path is a directory: ${filePath}`;
      }
      return `Error writing file: ${error.message}`;
    }
  },
};

const WEB_SEARCH: LiteTool = {
  name: "web_search",
  description: "Search the web using DuckDuckGo and return the top results",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
  async execute({ query }) {
    const searchQuery = String(query);
    const encodedQuery = encodeURIComponent(searchQuery);

    try {
      // Use DuckDuckGo HTML interface (no API key needed)
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return `Error: Search failed with status ${response.status}`;
      }

      const html = await response.text();

      // Parse results from DuckDuckGo HTML
      const results: string[] = [];

      // Match result blocks - DuckDuckGo uses class="result__a" for titles
      // The href is a redirect URL, actual URL is in uddg param
      const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

      const titles: Array<{ url: string; title: string }> = [];
      let match: RegExpExecArray | null;

      while ((match = titleRegex.exec(html)) !== null && titles.length < 5) {
        let rawUrl = match[1];
        // Clean HTML tags from title
        const title = match[2].replace(/<[^>]*>/g, "").trim();
        
        // Extract actual URL from DDG redirect (uddg param)
        let url = rawUrl;
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            url = decodeURIComponent(uddgMatch[1]);
          } catch {
            url = uddgMatch[1];
          }
        }
        
        if (title && url) {
          titles.push({ url, title });
        }
      }

      const snippets: string[] = [];
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
        const snippet = match[1].replace(/<[^>]*>/g, "").trim();
        if (snippet) {
          snippets.push(snippet);
        }
      }

      // Combine results
      for (let i = 0; i < titles.length; i++) {
        const { url, title } = titles[i];
        const snippet = snippets[i] || "";
        results.push(`${i + 1}. **${title}**\n   ${url}\n   ${snippet}`);
      }

      if (results.length === 0) {
        return `No results found for: ${searchQuery}`;
      }

      return `Search results for "${searchQuery}":\n\n${results.join("\n\n")}`;
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") {
        return `Error: Search timed out after ${WEB_SEARCH_TIMEOUT_MS / 1000}s`;
      }
      return `Error searching: ${error.message}`;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// P2 TOOLS: Clipboard, Calculator, Reminders, URL Fetching
// ═══════════════════════════════════════════════════════════════════════════

const FETCH_URL: LiteTool = {
  name: "fetch_url",
  description:
    "Fetch a webpage URL and return its text content (HTML stripped). Useful for reading articles, documentation, or any web page.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch (must start with http:// or https://)",
      },
    },
    required: ["url"],
  },
  async execute({ url }) {
    const rawUrl = String(url).trim();
    if (!/^https?:\/\//i.test(rawUrl)) {
      return `Error: URL must start with http:// or https://`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);

      const response = await fetch(rawUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain,application/json",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await response.text();

      // If JSON, return formatted
      if (contentType.includes("json")) {
        try {
          const parsed = JSON.parse(raw);
          const json = JSON.stringify(parsed, null, 2);
          return json.length > MAX_OUTPUT_SIZE
            ? json.slice(0, MAX_OUTPUT_SIZE) + "\n\n...[truncated]"
            : json;
        } catch {
          // Not valid JSON, fall through to text processing
        }
      }

      // If plain text, return directly
      if (contentType.includes("text/plain")) {
        return raw.length > MAX_OUTPUT_SIZE
          ? raw.slice(0, MAX_OUTPUT_SIZE) + "\n\n...[truncated]"
          : raw;
      }

      // HTML → extract text: strip tags, scripts, styles, collapse whitespace
      let text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, " ")
        .trim();

      // Condense runs of blank lines
      text = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
        .join("\n");

      if (!text) {
        return `Fetched ${rawUrl} but could not extract text content.`;
      }

      if (text.length > MAX_OUTPUT_SIZE) {
        return `Content from ${rawUrl}:\n\n${text.slice(0, MAX_OUTPUT_SIZE)}\n\n...[truncated, ${text.length} chars total]`;
      }

      return `Content from ${rawUrl}:\n\n${text}`;
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") {
        return `Error: Request timed out after ${WEB_SEARCH_TIMEOUT_MS / 1000}s for ${rawUrl}`;
      }
      return `Error fetching URL: ${error.message}`;
    }
  },
};

const CLIPBOARD_READ: LiteTool = {
  name: "clipboard_read",
  description: "Read the current contents of the system clipboard",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      // Try Wayland first (wl-paste), then X11 (xclip)
      try {
        const { stdout } = await execAsync("wl-paste 2>/dev/null", {
          timeout: 5000,
          maxBuffer: MAX_OUTPUT_SIZE,
        });
        return stdout.trim() || "(clipboard is empty)";
      } catch {
        // Fall back to X11
        const { stdout } = await execAsync("xclip -selection clipboard -o 2>/dev/null", {
          timeout: 5000,
          maxBuffer: MAX_OUTPUT_SIZE,
        });
        return stdout.trim() || "(clipboard is empty)";
      }
    } catch (err) {
      return `Error reading clipboard: ${(err as Error).message}`;
    }
  },
};

const CLIPBOARD_WRITE: LiteTool = {
  name: "clipboard_write",
  description: "Write text to the system clipboard",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to copy to the clipboard",
      },
    },
    required: ["text"],
  },
  async execute({ text }) {
    const content = String(text);
    if (content.length > MAX_OUTPUT_SIZE) {
      return `Error: Text too large for clipboard (max ${MAX_OUTPUT_SIZE} bytes)`;
    }

    /**
     * Write to clipboard using spawn + stdin to avoid shell injection.
     * Previously used exec() with JSON.stringify template interpolation
     * which was not fully shell-safe for all edge cases.
     */
    function spawnWrite(cmd: string, args: string[]): Promise<void> {
      return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"], timeout: 5000 });
        proc.on("error", reject);
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
        proc.stdin.end(content);
      });
    }

    try {
      // Try Wayland first (wl-copy), then X11 (xclip)
      try {
        await spawnWrite("wl-copy", []);
        return `Copied ${content.length} characters to clipboard`;
      } catch {
        // Fall back to X11
        await spawnWrite("xclip", ["-selection", "clipboard"]);
        return `Copied ${content.length} characters to clipboard`;
      }
    } catch (err) {
      return `Error writing to clipboard: ${(err as Error).message}`;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SAFE MATH EVALUATOR — Recursive-descent parser (no eval/Function)
// ═══════════════════════════════════════════════════════════════════════════

/** Supported math constants. */
const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

/** Supported math functions (name → implementation). */
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  pow: Math.pow,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: (...args: number[]) => Math.min(...args),
  max: (...args: number[]) => Math.max(...args),
};

/**
 * Safely evaluate a mathematical expression using a recursive-descent parser.
 * No eval(), new Function(), or code generation — only whitelisted math ops.
 *
 * Grammar:
 *   expr   = term (('+' | '-') term)*
 *   term   = factor (('*' | '/' | '%') factor)*
 *   factor = base ('^' factor)?          // right-associative
 *   base   = '-' base | atom
 *   atom   = number | constant | func '(' arglist ')' | '(' expr ')'
 */
function safeEvaluateMath(input: string): number {
  let pos = 0;
  const src = input.trim();

  function peek(): string {
    skipWhitespace();
    return src[pos] ?? "";
  }

  function skipWhitespace(): void {
    while (pos < src.length && src[pos] === " ") pos++;
  }

  function consume(expected: string): void {
    skipWhitespace();
    if (src[pos] !== expected) {
      throw new Error(`Expected '${expected}' at position ${pos}, got '${src[pos] ?? "end"}'`);
    }
    pos++;
  }

  function parseNumber(): number {
    skipWhitespace();
    const start = pos;
    if (src[pos] === "." || (src[pos] >= "0" && src[pos] <= "9")) {
      while (pos < src.length && src[pos] >= "0" && src[pos] <= "9") pos++;
      if (pos < src.length && src[pos] === ".") {
        pos++;
        while (pos < src.length && src[pos] >= "0" && src[pos] <= "9") pos++;
      }
      // Scientific notation: 1e5, 2.3e-4
      if (pos < src.length && (src[pos] === "e" || src[pos] === "E")) {
        pos++;
        if (pos < src.length && (src[pos] === "+" || src[pos] === "-")) pos++;
        while (pos < src.length && src[pos] >= "0" && src[pos] <= "9") pos++;
      }
      return Number(src.slice(start, pos));
    }
    throw new Error(`Expected number at position ${pos}`);
  }

  function parseIdentifier(): string {
    skipWhitespace();
    const start = pos;
    while (pos < src.length && /[a-zA-Z0-9_]/.test(src[pos])) pos++;
    return src.slice(start, pos).toLowerCase();
  }

  function parseAtom(): number {
    skipWhitespace();
    const ch = src[pos] ?? "";

    // Parenthesized sub-expression
    if (ch === "(") {
      consume("(");
      const val = parseExpr();
      consume(")");
      return val;
    }

    // Number literal
    if (ch === "." || (ch >= "0" && ch <= "9")) {
      return parseNumber();
    }

    // Identifier: constant or function call
    if (/[a-zA-Z]/.test(ch)) {
      const name = parseIdentifier();

      // Check for function call
      if (peek() === "(") {
        const fn = MATH_FUNCTIONS[name];
        if (!fn) throw new Error(`Unknown function: ${name}`);
        consume("(");
        const args: number[] = [parseExpr()];
        while (peek() === ",") {
          consume(",");
          args.push(parseExpr());
        }
        consume(")");
        return fn(...args);
      }

      // Constant
      const constant = MATH_CONSTANTS[name];
      if (constant !== undefined) return constant;

      throw new Error(`Unknown identifier: ${name}`);
    }

    throw new Error(`Unexpected character '${ch}' at position ${pos}`);
  }

  function parseBase(): number {
    skipWhitespace();
    // Unary minus
    if (src[pos] === "-") {
      pos++;
      return -parseBase();
    }
    // Unary plus (just consume)
    if (src[pos] === "+") {
      pos++;
      return parseBase();
    }
    return parseAtom();
  }

  function parseFactor(): number {
    let left = parseBase();
    skipWhitespace();
    if (src[pos] === "^") {
      pos++;
      left = left ** parseFactor(); // right-associative
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (true) {
      const op = peek();
      if (op === "*") {
        pos++;
        left *= parseFactor();
      } else if (op === "/") {
        pos++;
        left /= parseFactor();
      } else if (op === "%") {
        pos++;
        left %= parseFactor();
      } else {
        break;
      }
    }
    return left;
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (true) {
      const op = peek();
      if (op === "+") {
        pos++;
        left += parseTerm();
      } else if (op === "-") {
        pos++;
        left -= parseTerm();
      } else {
        break;
      }
    }
    return left;
  }

  const result = parseExpr();
  skipWhitespace();
  if (pos < src.length) {
    throw new Error(`Unexpected character '${src[pos]}' at position ${pos}`);
  }
  return result;
}

const CALCULATOR: LiteTool = {
  name: "calculator",
  description: "Evaluate a mathematical expression. Supports basic arithmetic, Math functions (sin, cos, sqrt, pow, etc.), and constants (PI, E).",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(PI/2)')",
      },
    },
    required: ["expression"],
  },
  async execute({ expression }) {
    const expr = String(expression);
    try {
      const result = safeEvaluateMath(expr);
      if (typeof result !== "number" || !Number.isFinite(result)) {
        return `Error: Result is not a valid number (got ${result})`;
      }
      const formatted = Number.isInteger(result) ? result.toString() : result.toPrecision(10).replace(/\.?0+$/, "");
      return `${expr} = ${formatted}`;
    } catch (err) {
      return `Error evaluating expression: ${(err as Error).message}`;
    }
  },
};

const SET_REMINDER: LiteTool = {
  name: "set_reminder",
  description: "Set a reminder that will show a desktop notification after a specified delay",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The reminder message to display",
      },
      delay_minutes: {
        type: "number",
        description: "Number of minutes from now to show the reminder",
      },
    },
    required: ["message", "delay_minutes"],
  },
  async execute({ message, delay_minutes }) {
    const msg = String(message);
    const minutes = Number(delay_minutes);

    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
      return `Error: Delay must be between 1 and 1440 minutes (24 hours)`;
    }

    if (msg.length > 500) {
      return `Error: Message too long (max 500 characters)`;
    }

    try {
      // Calculate when to fire
      const delaySeconds = Math.round(minutes * 60);

      // Use shell background process with sleep and notify-send
      // This survives even if the gateway restarts
      const escapedMsg = msg.replace(/'/g, "'\"'\"'");
      const cmd = `(sleep ${delaySeconds} && notify-send "ClosedClaw Reminder" '${escapedMsg}' --urgency=normal) &`;

      await execAsync(cmd, { timeout: 5000 });

      const triggerTime = new Date(Date.now() + delaySeconds * 1000);
      const timeStr = triggerTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      return `Reminder set for ${timeStr} (in ${minutes} minute${minutes === 1 ? "" : "s"}): "${msg}"`;
    } catch (err) {
      return `Error setting reminder: ${(err as Error).message}`;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// P3 TOOLS: Screenshot, OCR
// ═══════════════════════════════════════════════════════════════════════════

const SCREENSHOTS_DIR = join(homedir(), ".closedclaw", "screenshots");
const OCR_TIMEOUT_MS = 30_000;

const SCREENSHOT: LiteTool = {
  name: "screenshot",
  description: "Take a screenshot of the entire screen and save it. Returns the path to the saved image.",
  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Optional filename for the screenshot (without extension). Defaults to timestamp.",
      },
    },
    required: [],
  },
  async execute({ filename }) {
    try {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });

      const name = filename ? String(filename).replace(/[^a-zA-Z0-9_-]/g, "_") : `screenshot_${Date.now()}`;
      const filepath = join(SCREENSHOTS_DIR, `${name}.png`);

      // Use grim for Wayland screenshot (full screen)
      const { _stderr } = await execAsync(`grim "${filepath}"`, {
        timeout: 10_000,
      });

      if (_stderr && _stderr.trim()) {
        return `Screenshot taken but with warning: ${stderr.trim()}\nSaved to: ${filepath}`;
      }

      return `Screenshot saved to: ${filepath}`;
    } catch (err) {
      const error = err as Error;
      // Check if grim is available
      if (error.message.includes("not found") || error.message.includes("command not found")) {
        return `Error: grim not installed. Install with: sudo pacman -S grim`;
      }
      return `Error taking screenshot: ${error.message}`;
    }
  },
};

const SCREENSHOT_REGION: LiteTool = {
  name: "screenshot_region",
  description: "Take a screenshot of a user-selected screen region. The user will be prompted to select an area.",
  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Optional filename for the screenshot (without extension). Defaults to timestamp.",
      },
    },
    required: [],
  },
  async execute({ filename }) {
    try {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });

      const name = filename ? String(filename).replace(/[^a-zA-Z0-9_-]/g, "_") : `region_${Date.now()}`;
      const filepath = join(SCREENSHOTS_DIR, `${name}.png`);

      // Use slurp to select region, then grim to capture
      const { _stderr } = await execAsync(`grim -g "$(slurp)" "${filepath}"`, {
        timeout: 60_000, // Give user time to select
      });

      if (_stderr && _stderr.trim()) {
        return `Screenshot taken but with warning: ${stderr.trim()}\nSaved to: ${filepath}`;
      }

      return `Region screenshot saved to: ${filepath}`;
    } catch (err) {
      const error = err as Error;
      if (error.message.includes("selection cancelled") || error.message.includes("aborted")) {
        return `Screenshot cancelled by user`;
      }
      if (error.message.includes("not found")) {
        return `Error: grim and slurp required. Install with: sudo pacman -S grim slurp`;
      }
      return `Error taking screenshot: ${error.message}`;
    }
  },
};

const OCR_IMAGE: LiteTool = {
  name: "ocr_image",
  description: "Extract text from an image file using OCR (Optical Character Recognition)",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the image file (PNG, JPG, etc.)",
      },
      language: {
        type: "string",
        description: "Language code for OCR (default: eng). Use 'eng+deu' for multiple languages.",
      },
    },
    required: ["path"],
  },
  async execute({ path, language }) {
    const imagePath = String(path).startsWith("~") 
      ? String(path).replace("~", homedir()) 
      : String(path);
    const lang = language ? String(language) : "eng";

    try {
      // Check if file exists
      await stat(imagePath);

      // Run tesseract OCR
      const { stdout, _stderr } = await execAsync(
        `tesseract "${imagePath}" stdout -l ${lang} 2>/dev/null`,
        {
          timeout: OCR_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_SIZE * 2,
        }
      );

      const text = stdout.trim();
      if (!text) {
        return `No text found in image: ${imagePath}`;
      }

      // Truncate if too long
      if (text.length > MAX_OUTPUT_SIZE) {
        return `OCR text from ${imagePath}:\n\n${text.slice(0, MAX_OUTPUT_SIZE)}\n\n...[truncated, ${text.length - MAX_OUTPUT_SIZE} more characters]`;
      }

      return `OCR text from ${imagePath}:\n\n${text}`;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return `Error: Image file not found: ${imagePath}`;
      }
      if (error.message?.includes("not found") || error.message?.includes("command not found")) {
        return `Error: tesseract not installed. Install with: sudo pacman -S tesseract tesseract-data-eng`;
      }
      return `Error running OCR: ${(err as Error).message}`;
    }
  },
};

const SCREENSHOT_OCR: LiteTool = {
  name: "screenshot_ocr",
  description: "Take a screenshot and immediately extract text from it using OCR. Useful for reading text from the screen.",
  parameters: {
    type: "object",
    properties: {
      region: {
        type: "boolean",
        description: "If true, let user select a region. If false, capture full screen.",
      },
    },
    required: [],
  },
  async execute({ region }) {
    try {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });

      const filepath = join(SCREENSHOTS_DIR, `ocr_temp_${Date.now()}.png`);
      const selectRegion = region === true;

      // Take screenshot
      const screenshotCmd = selectRegion 
        ? `grim -g "$(slurp)" "${filepath}"`
        : `grim "${filepath}"`;

      await execAsync(screenshotCmd, {
        timeout: selectRegion ? 60_000 : 10_000,
      });

      // Run OCR on the screenshot
      const { stdout } = await execAsync(
        `tesseract "${filepath}" stdout -l eng 2>/dev/null`,
        {
          timeout: OCR_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_SIZE * 2,
        }
      );

      // Clean up temp file
      await execAsync(`rm -f "${filepath}"`).catch(() => {});

      const text = stdout.trim();
      if (!text) {
        return `No text found in the ${selectRegion ? "selected region" : "screenshot"}`;
      }

      if (text.length > MAX_OUTPUT_SIZE) {
        return `Text from screen:\n\n${text.slice(0, MAX_OUTPUT_SIZE)}\n\n...[truncated]`;
      }

      return `Text from screen:\n\n${text}`;
    } catch (err) {
      const error = err as Error;
      if (error.message.includes("selection cancelled") || error.message.includes("aborted")) {
        return `Screenshot cancelled by user`;
      }
      return `Error: ${error.message}`;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const LITE_TOOLS: LiteTool[] = [
  READ_FILE,
  WRITE_FILE,
  RUN_COMMAND,
  LIST_DIRECTORY,
  SAVE_NOTE,
  RECALL_NOTES,
  REFLECT_MEMORY,
  CURRENT_TIME,
  WEB_SEARCH,
  FETCH_URL,
  CLIPBOARD_READ,
  CLIPBOARD_WRITE,
  CALCULATOR,
  SET_REMINDER,
  SCREENSHOT,
  SCREENSHOT_REGION,
  OCR_IMAGE,
  SCREENSHOT_OCR,
];

// ═══════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert lite tools to Ollama tool format
 */
export function getOllamaTools(): OllamaTool[] {
  return LITE_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Execute a tool by name with given parameters
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
): Promise<string> {
  const tool = LITE_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return `Error: Unknown tool "${name}"`;
  }

  // Risk assessment gate
  const risk = assessRisk(name, params);
  if (!risk.allow) {
    return `⛔ Tool "${name}" blocked: ${risk.denyReason ?? "high risk"}\n${formatRiskReport(risk)}`;
  }
  if (risk.vector.tier === "medium" || risk.vector.tier === "high") {
    // Log medium/high risk executions (non-blocking)
    console.log(`[risk] ${formatRiskReport(risk)}`);
  }

  try {
    const result = await tool.execute(params);
    recordExecution(name, true);
    return result;
  } catch (err) {
    recordExecution(name, false);
    return `Error executing ${name}: ${(err as Error).message}`;
  }
}

/**
 * Get tool by name
 */
export function getTool(name: string): LiteTool | undefined {
  return LITE_TOOLS.find((t) => t.name === name);
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN-BASED PARSING (FALLBACK FOR NON-TOOL MODELS)
// ═══════════════════════════════════════════════════════════════════════════

interface PatternDef {
  regex: RegExp;
  tool: string;
  paramKey: string | null;
  multiParam?: boolean; // For patterns with multiple capture groups
}

const PATTERNS: PatternDef[] = [
  { regex: /\[READ:\s*([^\]]+)\]/g, tool: "read_file", paramKey: "path" },
  { regex: /\[EXEC:\s*([^\]]+)\]/g, tool: "run_command", paramKey: "command" },
  { regex: /\[LIST:\s*([^\]]+)\]/g, tool: "list_directory", paramKey: "path" },
  { regex: /\[NOTE:\s*([^\]]+)\]/g, tool: "save_note", paramKey: "content" },
  { regex: /\[RECALL\]/g, tool: "recall_notes", paramKey: null },
  { regex: /\[TIME\]/g, tool: "current_time", paramKey: null },
  { regex: /\[SEARCH:\s*([^\]]+)\]/g, tool: "web_search", paramKey: "query" },
  { regex: /\[FETCH:\s*([^\]]+)\]/g, tool: "fetch_url", paramKey: "url" },
  { regex: /\[CLIPBOARD\]/g, tool: "clipboard_read", paramKey: null },
  { regex: /\[COPY:\s*([^\]]+)\]/g, tool: "clipboard_write", paramKey: "text" },
  { regex: /\[CALC:\s*([^\]]+)\]/g, tool: "calculator", paramKey: "expression" },
  { regex: /\[SCREENSHOT\]/g, tool: "screenshot", paramKey: null },
  { regex: /\[SCREENSHOT_REGION\]/g, tool: "screenshot_region", paramKey: null },
  { regex: /\[OCR:\s*([^\]]+)\]/g, tool: "ocr_image", paramKey: "path" },
  { regex: /\[SCREEN_OCR\]/g, tool: "screenshot_ocr", paramKey: null },
  { regex: /\[SCREEN_OCR_REGION\]/g, tool: "screenshot_ocr", paramKey: null },
];

// Special pattern for WRITE (multiline content between tags)
const WRITE_PATTERN = /\[WRITE:\s*([^\]]+)\]([\s\S]*?)\[\/WRITE\]/g;

// Special pattern for REMIND: [REMIND: 5m] message or [REMIND: 30] message
const REMIND_PATTERN = /\[REMIND:\s*(\d+)m?\]\s*(.+?)(?=\n|$)/g;

/**
 * Parse and execute inline patterns like [READ: /path/to/file]
 * Returns the text with patterns replaced by tool outputs
 */
export async function executePatterns(text: string): Promise<string> {
  let result = text;

  // Handle WRITE pattern first (special case with content block)
  WRITE_PATTERN.lastIndex = 0;
  const writeMatches = [...text.matchAll(WRITE_PATTERN)];
  for (const match of writeMatches) {
    const path = match[1]?.trim();
    const content = match[2]?.trim();
    const output = await executeTool("write_file", { path, content });
    result = result.replace(match[0], `\n\`\`\`\n${output}\n\`\`\`\n`);
  }

  // Handle REMIND pattern (special case with minutes + message)
  REMIND_PATTERN.lastIndex = 0;
  const remindMatches = [...result.matchAll(REMIND_PATTERN)];
  for (const match of remindMatches) {
    const minutes = parseInt(match[1], 10);
    const message = match[2]?.trim();
    const output = await executeTool("set_reminder", { message, delay_minutes: minutes });
    result = result.replace(match[0], `\n\`\`\`\n${output}\n\`\`\`\n`);
  }

  // Handle simple patterns
  for (const { regex, tool, paramKey } of PATTERNS) {
    // Reset regex state
    regex.lastIndex = 0;
    const matches = [...result.matchAll(regex)];

    for (const match of matches) {
      const params = paramKey ? { [paramKey]: match[1]?.trim() } : {};
      const output = await executeTool(tool, params);
      result = result.replace(match[0], `\n\`\`\`\n${output}\n\`\`\`\n`);
    }
  }

  return result;
}

/**
 * Check if text contains any tool patterns
 */
export function hasPatterns(text: string): boolean {
  // Check WRITE pattern
  WRITE_PATTERN.lastIndex = 0;
  if (WRITE_PATTERN.test(text)) {return true;}

  // Check REMIND pattern
  REMIND_PATTERN.lastIndex = 0;
  if (REMIND_PATTERN.test(text)) {return true;}

  return PATTERNS.some(({ regex }) => {
    regex.lastIndex = 0;
    return regex.test(text);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL CAPABILITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Models known to support native Ollama tool calling
 */
const TOOL_CAPABLE_MODELS = [
  "qwen3",
  "qwen2.5",
  "llama3.1",
  "llama3.2",
  "llama3.3",
  "mistral",
  "mixtral",
  "command-r",
  "granite",
  "cogito",
  "nemotron",
  "firefunction",
  "hermes",
];

/**
 * Check if a model supports native tool calling
 */
export function modelSupportsTools(model: string): boolean {
  const modelBase = model.split(":")[0].toLowerCase();
  return TOOL_CAPABLE_MODELS.some((tm) => modelBase.includes(tm));
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal system prompt for native tool calling with ReAct reasoning (~100 tokens)
 */
export function getNativeToolSystemPrompt(agentName: string): string {
  return `You are ${agentName}, a helpful assistant running on Linux.
Be concise and friendly. Use the available tools when needed to help the user.

For complex tasks, break them into steps:
1. Think about what information or actions you need
2. Use a tool to get information or perform an action
3. Process the result and decide if more steps are needed
4. When you have everything, provide your final answer

You can call multiple tools in sequence to complete multi-step tasks.`;
}

/**
 * Pattern-based system prompt for non-tool models (~200 tokens)
 */
export function getPatternSystemPrompt(agentName: string): string {
  return `You are ${agentName}, a helpful assistant running on Linux.

To perform actions, use these exact patterns in your response:
[READ: /path/to/file] - Read a file's contents
[WRITE: /path/to/file]content here[/WRITE] - Write content to a file
[EXEC: command] - Run a shell command
[LIST: /path/to/dir] - List directory contents
[NOTE: text] - Save a note for later
[RECALL] - Show saved notes
[TIME] - Get current date/time
[SEARCH: query] - Search the web
[FETCH: url] - Fetch and read a web page
[CLIPBOARD] - Read clipboard contents
[COPY: text] - Copy text to clipboard
[CALC: expression] - Calculate math (e.g., sqrt(16), 2^10)
[REMIND: 5] message - Set reminder for 5 minutes
[SCREENSHOT] - Take a full screen screenshot
[SCREENSHOT_REGION] - Take a screenshot of a selected region
[OCR: /path/to/image.png] - Extract text from an image
[SCREEN_OCR] - Take screenshot and extract text from it

Examples:
User: What's 25 * 48?
You: [CALC: 25 * 48]

User: Read the text from this screenshot
You: [SCREEN_OCR]

Be concise. Only use patterns when an action is needed.`;
}
