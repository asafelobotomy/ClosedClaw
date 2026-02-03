/**
 * Lite Mode Tool System
 *
 * Provides tool definitions and execution for enhanced lite mode.
 * Works with Ollama's native tool calling API for models that support it,
 * with pattern-based fallback for models that don't.
 */

import { readFile, readdir, stat, appendFile, mkdir, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

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
      const { stdout, stderr } = await execAsync(cmd, {
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
      if (error.stderr) {
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
  description: "Save a note for later recall. Use this to remember things the user asks you to remember.",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The note content to save",
      },
    },
    required: ["content"],
  },
  async execute({ content }) {
    const noteContent = String(content);
    try {
      await mkdir(NOTES_DIR, { recursive: true });
      const timestamp = new Date().toISOString();
      await appendFile(NOTES_FILE, `[${timestamp}] ${noteContent}\n`, "utf-8");
      return "Note saved successfully.";
    } catch (err) {
      return `Error saving note: ${(err as Error).message}`;
    }
  },
};

const RECALL_NOTES: LiteTool = {
  name: "recall_notes",
  description: "Retrieve previously saved notes",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const content = await readFile(NOTES_FILE, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      if (lines.length === 0) {
        return "No notes found.";
      }
      // Return last 10 notes
      const recent = lines.slice(-10);
      return recent.join("\n");
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return "No notes found.";
      }
      return `Error recalling notes: ${error.message}`;
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
// TOOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const LITE_TOOLS: LiteTool[] = [
  READ_FILE,
  WRITE_FILE,
  RUN_COMMAND,
  LIST_DIRECTORY,
  SAVE_NOTE,
  RECALL_NOTES,
  CURRENT_TIME,
  WEB_SEARCH,
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

  try {
    return await tool.execute(params);
  } catch (err) {
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
];

// Special pattern for WRITE (multiline content between tags)
const WRITE_PATTERN = /\[WRITE:\s*([^\]]+)\]([\s\S]*?)\[\/WRITE\]/g;

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
  if (WRITE_PATTERN.test(text)) return true;

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
 * Minimal system prompt for native tool calling (~50 tokens)
 */
export function getNativeToolSystemPrompt(agentName: string): string {
  return `You are ${agentName}, a helpful assistant running on Linux.
Be concise and friendly. Use the available tools when needed to help the user.`;
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

Examples:
User: What's my hostname?
You: [EXEC: hostname]

User: Search for Linux kernel news
You: [SEARCH: Linux kernel latest news]

Be concise. Only use patterns when an action is needed.`;
}
