/**
 * Agent Profile Types — Structured definitions for specialized agent roles
 *
 * Agent profiles define how an agent behaves: its system prompt, tool access,
 * model preferences, scheduling, and integration with the squad system.
 *
 * Profiles can be:
 * - **Built-in**: Derived from squad templates (researcher, coder, etc.)
 * - **Custom**: User-defined markdown files in `~/.closedclaw/agents/`
 * - **Composite**: Combine template + custom overrides
 *
 * @module agents/profiles/types
 */

// ─── Profile Definition ─────────────────────────────────────────────────────

/**
 * Severity levels for agent findings/reports.
 */
export type FindingSeverity = "critical" | "high" | "medium" | "low";

/**
 * Categories of agent analysis.
 */
export type FindingCategory =
  | "security"
  | "performance"
  | "maintainability"
  | "documentation"
  | "testing"
  | "dependencies"
  | "general";

/**
 * Effort estimate for a recommendation.
 */
export type EffortEstimate = "trivial" | "moderate" | "significant";

/**
 * A structured finding from an agent analysis.
 */
export interface AgentFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  location: string;
  issue: string;
  recommendation: string;
  effort: EffortEstimate;
}

/**
 * Tool access configuration for a profile.
 */
export interface ProfileToolAccess {
  /** Allowed tool names */
  allow: string[];
  /** Denied tool names (takes precedence over allow) */
  deny?: string[];
}

/**
 * Scheduling configuration for automated profile execution.
 */
export interface ProfileSchedule {
  /** Cron expression or interval string */
  expression: string;
  /** Timezone for cron (default: UTC) */
  timezone?: string;
  /** Task description sent when schedule fires */
  task: string;
  /** Model override for scheduled runs */
  model?: string;
  /** Maximum runtime in seconds */
  timeoutSeconds?: number;
}

/**
 * An agent profile definition.
 */
export interface AgentProfile {
  /** Unique profile ID (matches filename without extension) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description */
  description: string;

  /** Profile source: built-in template, user file, or composite */
  source: "template" | "file" | "composite";

  /** System prompt (the profile's full behavioral instructions) */
  systemPrompt: string;

  /** Tools this agent can use */
  tools: ProfileToolAccess;

  /** Preferred model (can be overridden per task) */
  model?: string;

  /** Fallback models if primary is unavailable */
  fallbackModels?: string[];

  /** Token budget per task */
  tokenBudget: number;

  /** Capabilities this agent excels at */
  capabilities: string[];

  /** Automated schedules for this agent */
  schedules?: ProfileSchedule[];

  /** Custom metadata from the profile file */
  metadata?: Record<string, unknown>;

  /** File path if loaded from disk */
  filePath?: string;

  /** When this profile was last loaded/updated */
  loadedAt: number;
}

/**
 * Profile registry snapshot — all loaded profiles at a point in time.
 */
export interface ProfileRegistrySnapshot {
  profiles: AgentProfile[];
  loadedAt: number;
  errors: ProfileLoadError[];
}

/**
 * Error that occurred while loading a profile.
 */
export interface ProfileLoadError {
  filePath: string;
  error: string;
  timestamp: number;
}

// ─── Profile Registry Configuration ─────────────────────────────────────────

/**
 * Configuration for the profile registry.
 */
export interface ProfileRegistryConfig {
  /** Directory to scan for profile files (default: ~/.closedclaw/agents/) */
  profileDir: string;

  /** Whether to include built-in templates (default: true) */
  includeBuiltins?: boolean;

  /** File extensions to recognize as profiles (default: [".md"]) */
  extensions?: string[];
}

// ─── DevOps Profile Constants ───────────────────────────────────────────────

/**
 * Default schedules for the DevOps agent.
 */
export const DEVOPS_SCHEDULES: ProfileSchedule[] = [
  {
    expression: "0 2 * * *", // 2am daily
    task: "Run security audit. Report only critical/high findings. Check sandbox configs, validate encryption, scan for vulnerabilities.",
    model: undefined, // Use profile default
    timeoutSeconds: 300,
  },
  {
    expression: "0 10 * * 1", // 10am Mondays
    task: "Analyze code quality metrics: duplication, complexity, test coverage. Suggest top 5 refactoring candidates.",
    timeoutSeconds: 600,
  },
  {
    expression: "0 9 1 * *", // 9am 1st of month
    task: "Check for outdated npm dependencies with security vulnerabilities (npm audit). Prioritize patches.",
    timeoutSeconds: 300,
  },
];

/**
 * Severity sort order for consistent ranking.
 */
export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
