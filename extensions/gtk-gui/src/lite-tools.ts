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
// P2 TOOLS: Clipboard, Calculator, Reminders
// ═══════════════════════════════════════════════════════════════════════════

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

    try {
      // Try Wayland first (wl-copy), then X11 (xclip)
      try {
        await execAsync(`echo -n ${JSON.stringify(content)} | wl-copy`, {
          timeout: 5000,
        });
        return `Copied ${content.length} characters to clipboard`;
      } catch {
        // Fall back to X11
        await execAsync(`echo -n ${JSON.stringify(content)} | xclip -selection clipboard`, {
          timeout: 5000,
        });
        return `Copied ${content.length} characters to clipboard`;
      }
    } catch (err) {
      return `Error writing to clipboard: ${(err as Error).message}`;
    }
  },
};

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

    // Sanitize: only allow safe math characters and functions
    const _safePattern = /^[\d\s+\-*/().,%^]+$|^[\d\s+\-*/().,%^]*(sqrt|pow|sin|cos|tan|asin|acos|atan|log|log10|exp|abs|floor|ceil|round|min|max|PI|E|Math\.)+[\d\s+\-*/().,%^()\w]*$/i;

    // More permissive pattern for math expressions
    const allowedChars = /^[0-9\s+\-*/().^,a-zA-Z]+$/;
    if (!allowedChars.test(expr)) {
      return `Error: Expression contains invalid characters`;
    }

    // Block dangerous patterns
    const dangerousPatterns = [
      /\beval\b/i,
      /\bFunction\b/i,
      /\bimport\b/i,
      /\brequire\b/i,
      /\bprocess\b/i,
      /\bglobal\b/i,
      /\bwindow\b/i,
      /\bdocument\b/i,
      /\b__\w+__\b/,
      /\bconstructor\b/i,
      /\bprototype\b/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expr)) {
        return `Error: Expression contains disallowed pattern`;
      }
    }

    try {
      // Replace common math notation with JavaScript equivalents
      let jsExpr = expr
        .replace(/\^/g, "**") // Power operator
        .replace(/\bPI\b/gi, "Math.PI")
        .replace(/\bE\b/g, "Math.E")
        .replace(/\bsqrt\s*\(/gi, "Math.sqrt(")
        .replace(/\bpow\s*\(/gi, "Math.pow(")
        .replace(/\bsin\s*\(/gi, "Math.sin(")
        .replace(/\bcos\s*\(/gi, "Math.cos(")
        .replace(/\btan\s*\(/gi, "Math.tan(")
        .replace(/\basin\s*\(/gi, "Math.asin(")
        .replace(/\bacos\s*\(/gi, "Math.acos(")
        .replace(/\batan\s*\(/gi, "Math.atan(")
        .replace(/\blog\s*\(/gi, "Math.log(")
        .replace(/\blog10\s*\(/gi, "Math.log10(")
        .replace(/\bexp\s*\(/gi, "Math.exp(")
        .replace(/\babs\s*\(/gi, "Math.abs(")
        .replace(/\bfloor\s*\(/gi, "Math.floor(")
        .replace(/\bceil\s*\(/gi, "Math.ceil(")
        .replace(/\bround\s*\(/gi, "Math.round(")
        .replace(/\bmin\s*\(/gi, "Math.min(")
        .replace(/\bmax\s*\(/gi, "Math.max(");

      // Use Function constructor with restricted scope
      const result = new Function(`"use strict"; return (${jsExpr})`)();

      if (typeof result !== "number" || !Number.isFinite(result)) {
        return `Error: Result is not a valid number (got ${result})`;
      }

      // Format result nicely
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
  CURRENT_TIME,
  WEB_SEARCH,
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
