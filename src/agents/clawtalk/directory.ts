/**
 * ClawTalk Directory
 *
 * Maps ClawTalk intents to specialized subagents.
 * The Directory is the central router that finds the appropriate
 * subagent(s) for each task based on capability matching.
 */

import type { IntentCategory, SubagentProfile, ClawTalkMessage } from "./types.js";

/**
 * Built-in subagent profiles.
 */
const SUBAGENT_PROFILES: SubagentProfile[] = [
  {
    id: "research",
    name: "Research Agent",
    description: "Web search, browsing, summarization, and information retrieval",
    capabilities: ["web_search", "summarize", "browse"],
    systemPrompt: [
      "You are a focused research assistant. Your job is to:",
      "- Search the web for accurate, up-to-date information",
      "- Summarize findings concisely",
      "- Cite sources when possible",
      "- Distinguish facts from opinions",
      "",
      "Be thorough but concise. Present findings in a structured format.",
      "When using tools, prefer web_search for factual queries.",
    ].join("\n"),
    tools: ["web_search", "fetch_url", "current_time"],
    priority: 10,
  },
  {
    id: "system",
    name: "System Agent",
    description: "File operations, directory management, and command execution",
    capabilities: ["read_file", "write_file", "list_directory", "run_command", "clipboard_manage"],
    systemPrompt: [
      "You are a system operations assistant. Your job is to:",
      "- Read and write files safely",
      "- Navigate the filesystem",
      "- Execute shell commands carefully",
      "- Report results clearly",
      "",
      "Always confirm destructive operations. Show relevant output.",
      "Use list_directory before file operations to verify paths.",
    ].join("\n"),
    tools: ["read_file", "write_file", "list_directory", "run_command", "current_time", "clipboard_read", "clipboard_write"],
    priority: 10,
  },
  {
    id: "coder",
    name: "Code Agent",
    description: "Code generation, review, debugging, and refactoring",
    capabilities: ["code_generate", "code_review", "code_debug", "code_refactor"],
    systemPrompt: [
      "You are an expert programmer. Your job is to:",
      "- Write clean, idiomatic code",
      "- Review code for bugs, security issues, and style",
      "- Debug issues methodically",
      "- Refactor for clarity and performance",
      "",
      "Follow best practices. Explain your reasoning.",
      "Use read_file to understand context before making changes.",
    ].join("\n"),
    tools: ["read_file", "write_file", "list_directory", "run_command", "calculator"],
    priority: 10,
  },
  {
    id: "memory",
    name: "Memory Agent",
    description: "Personal knowledge base — save, recall, and reflect on facts, preferences, and entities",
    capabilities: ["remember", "recall"],
    systemPrompt: [
      "You are a knowledge management assistant. Your job is to:",
      "- Save information with type prefixes: W: (world fact), B: (biographical), O(c=N): (opinion), S: (summary)",
      "- Tag entities with @Name in note text",
      "- Retrieve notes via recall_notes (supports query, entity, type, since filters)",
      "- Generate entity summaries via reflect_memory",
      "- Be precise with storage and recall. Confirm what was saved.",
    ].join("\n"),
    tools: ["save_note", "recall_notes", "reflect_memory", "current_time"],
    priority: 10,
  },
  {
    id: "browser",
    name: "Browser Agent",
    description: "Web page automation — navigation, screenshots, form filling, data extraction via Playwright",
    capabilities: ["browser_automate"],
    systemPrompt: [
      "You are a browser automation specialist. Your job is to:",
      "- Navigate to web pages and interact with them programmatically",
      "- Take screenshots of pages or specific regions",
      "- Fill forms and click buttons",
      "- Extract structured data from web pages",
      "- Handle authentication flows when credentials are provided",
      "",
      "Use the browser tool for multi-step page interactions.",
      "Take screenshots to verify state before and after actions.",
      "Be cautious with form submissions — confirm before submitting.",
    ].join("\n"),
    tools: ["browser", "screenshot", "screenshot_region", "screenshot_ocr", "web_search", "current_time"],
    priority: 10,
  },
  {
    id: "automation",
    name: "Automation Agent",
    description: "Scheduling, reminders, cron tasks, and recurring workflows",
    capabilities: ["schedule_task"],
    systemPrompt: [
      "You are a task automation assistant. Your job is to:",
      "- Schedule reminders and recurring tasks",
      "- Set up cron-style periodic checks and notifications",
      "- Manage timers and alarms",
      "- Create automated workflows that run on schedule",
      "",
      "Always confirm scheduling details (time, recurrence, action) before committing.",
      "Use set_reminder for one-time tasks and cron for recurring ones.",
      "Report back clearly what was scheduled and when it will trigger.",
    ].join("\n"),
    tools: ["set_reminder", "current_time", "run_command", "save_note"],
    priority: 10,
  },
];

/** Conversation handler — fallback for general chat */
const CONVERSATION_PROFILE: SubagentProfile = {
  id: "conversation",
  name: "Conversation Agent",
  description: "General conversation and questions that don't match a specialist",
  capabilities: ["conversation", "unknown"],
  systemPrompt: [
    "You are a helpful AI assistant. Answer questions clearly and concisely.",
    "If a question might benefit from specialized tools (web search, file operations, etc.),",
    "answer directly but mention that you can also search the web or read files if needed.",
  ].join("\n"),
  tools: ["web_search", "calculator", "current_time"],
  priority: 1,
  // Conversation agent handles human-facing messages — text fallback is allowed.
  allowTextFallback: true,
};

/** Routing decision from the Directory */
export interface RoutingDecision {
  /** Primary subagent to handle the request */
  primary: SubagentProfile;
  /** Alternative subagents (for fallback or parallel execution) */
  alternates: SubagentProfile[];
  /** Execution strategy */
  strategy: "single" | "parallel" | "pipeline";
  /** Detected intent */
  intent: IntentCategory;
}

/**
 * The Directory — routes ClawTalk messages to the appropriate subagent(s).
 */
export class Directory {
  private profiles: SubagentProfile[];

  constructor(customProfiles?: SubagentProfile[]) {
    this.profiles = [...SUBAGENT_PROFILES, ...(customProfiles ?? [])];
  }

  /**
   * Find the best subagent(s) for a given intent.
   * Returns ordered list with the best match first.
   */
  route(intent: IntentCategory): SubagentProfile[] {
    const matches = this.profiles
      .filter((p) => p.capabilities.includes(intent))
      .toSorted((a, b) => b.priority - a.priority);

    if (matches.length === 0) {
      return [CONVERSATION_PROFILE];
    }
    return matches;
  }

  /**
   * Route a full ClawTalk message, potentially to multiple subagents.
   */
  routeMessage(msg: ClawTalkMessage, intent: IntentCategory): RoutingDecision {
    const agents = this.route(intent);
    return {
      primary: agents[0],
      alternates: agents.slice(1),
      strategy: "single",
      intent,
    };
  }

  /** Get all registered subagent profiles */
  getProfiles(): SubagentProfile[] {
    return [...this.profiles, CONVERSATION_PROFILE];
  }

  /** Get a specific profile by ID */
  getProfile(id: string): SubagentProfile | undefined {
    return (
      this.profiles.find((p) => p.id === id) ??
      (id === "conversation" ? CONVERSATION_PROFILE : undefined)
    );
  }

  /** Register a custom subagent profile */
  registerProfile(profile: SubagentProfile): void {
    this.profiles = this.profiles.filter((p) => p.id !== profile.id);
    this.profiles.push(profile);
  }
}
