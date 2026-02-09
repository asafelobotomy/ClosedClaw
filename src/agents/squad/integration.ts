/**
 * Squad Integration Glue — Connect profiles, templates, and the squad system
 *
 * This module bridges the gap between:
 * - Agent profiles (user-defined .md files, built-in templates)
 * - Squad coordinator (orchestration strategies)
 * - Routing layer (message → squad resolution)
 *
 * Key capabilities:
 * - **Profile-based squad formation**: Build squads from profile IDs
 * - **Auto-roster**: Detect what profiles are needed for a task
 * - **Dynamic spawning**: Spawn squads from profiles with proper config
 * - **Profile ↔ template bridging**: Convert profiles to spawn configs
 *
 * @module agents/squad/integration
 */

import type { AgentSpawnConfig } from "./spawner.js";
import type { SquadConfig, CoordinationStrategy, ComplexTask } from "./coordinator.js";
import type { TaskInput, TaskPriority } from "./task-queue.js";
import type { AgentProfile, ProfileRegistrySnapshot } from "../profiles/types.js";
import { AGENT_TEMPLATES } from "./templates.js";
import { AGENTS } from "../../constants/agents.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A squad formation request — specifies desired agents and strategy.
 */
export interface SquadFormationRequest {
  /** Human-readable squad name */
  name: string;

  /** Coordination strategy to use */
  strategy: CoordinationStrategy;

  /** Profile IDs to include in the squad */
  profileIds: string[];

  /** Override models per profile */
  modelOverrides?: Record<string, string>;

  /** Override token budgets per profile */
  budgetOverrides?: Record<string, number>;

  /** Extra tools to add to all agents */
  globalTools?: string[];

  /** Maximum squad duration in ms */
  maxDuration?: number;
}

/**
 * Analysis of what profiles are recommended for a task.
 */
export interface TaskAnalysis {
  /** Recommended profile IDs */
  recommendedProfiles: string[];

  /** Recommended coordination strategy */
  strategy: CoordinationStrategy;

  /** Explanation of why these profiles were chosen */
  reasoning: string;

  /** Detected task types */
  taskTypes: string[];

  /** Estimated complexity (0-1) */
  complexity: number;
}

/**
 * Result of building a squad config from profiles.
 */
export interface SquadBuildResult {
  /** The built squad configuration */
  config: SquadConfig;

  /** Profiles that were resolved */
  resolvedProfiles: string[];

  /** Profile IDs that could not be resolved */
  missingProfiles: string[];

  /** Warnings during build */
  warnings: string[];
}

// ─── Task Analysis ──────────────────────────────────────────────────────────

/**
 * Keyword → capability mapping for task analysis.
 */
const TASK_CAPABILITY_MAP: Record<string, string[]> = {
  // Research keywords
  research: ["research", "search", "analysis"],
  search: ["research", "search"],
  find: ["research", "search"],
  investigate: ["research", "analysis"],
  compare: ["research", "analysis"],
  analyze: ["research", "analysis"],

  // Code keywords
  implement: ["code", "implementation"],
  code: ["code", "implementation"],
  build: ["code", "implementation"],
  refactor: ["code", "refactoring"],
  fix: ["code", "debugging"],
  debug: ["code", "debugging"],
  optimize: ["code", "implementation"],

  // Review keywords
  review: ["review", "audit", "quality"],
  audit: ["review", "audit", "security"],
  check: ["review", "quality"],
  verify: ["review", "validation"],

  // Test keywords
  test: ["test", "testing", "validation"],
  validate: ["test", "validation"],
  coverage: ["test", "testing"],

  // Docs keywords
  document: ["documentation", "docs", "writing"],
  explain: ["documentation", "writing"],
  guide: ["documentation", "writing"],

  // DevOps keywords
  deploy: ["devops", "deployment", "infrastructure"],
  monitor: ["devops", "monitoring"],
  pipeline: ["devops", "infrastructure"],
  security: ["devops", "security", "audit"],
};

/**
 * Strategy selection rules based on task patterns.
 */
const STRATEGY_RULES: Array<{
  pattern: RegExp;
  strategy: CoordinationStrategy;
  weight: number;
}> = [
  // Pipeline: sequential workflows (research → code → test → review)
  { pattern: /research.*(?:then|and then|followed by).*(?:code|implement)/i, strategy: "pipeline", weight: 3 },
  { pattern: /(?:implement|code).*(?:then|and).*(?:test|review)/i, strategy: "pipeline", weight: 3 },
  { pattern: /step\s*by\s*step|sequential|in order/i, strategy: "pipeline", weight: 2 },

  // Map-Reduce: split-and-merge patterns
  { pattern: /(?:analyze|scan|audit).*(?:all|every|each).*(?:file|module|component)/i, strategy: "map-reduce", weight: 3 },
  { pattern: /summarize.*multiple|combine.*results/i, strategy: "map-reduce", weight: 2 },

  // Consensus: decision-making, evaluation
  { pattern: /(?:decide|choose|evaluate|compare).*(?:option|approach|solution)/i, strategy: "consensus", weight: 3 },
  { pattern: /(?:vote|agree|consensus)/i, strategy: "consensus", weight: 3 },

  // Parallel: independent tasks
  { pattern: /(?:simultaneously|in parallel|at the same time|concurrently)/i, strategy: "parallel", weight: 3 },
  { pattern: /(?:both|all of|multiple).*(?:at once|together)/i, strategy: "parallel", weight: 2 },
];

/**
 * Analyze a task description to recommend profiles and strategy.
 */
export function analyzeTaskForSquad(
  taskDescription: string,
  availableProfiles: AgentProfile[],
): TaskAnalysis {
  const words = taskDescription.toLowerCase().split(/\s+/);
  const capabilityScores = new Map<string, number>();

  // Score capabilities based on keyword matches
  for (const word of words) {
    const stripped = word.replace(/[^a-z]/g, "");
    const caps = TASK_CAPABILITY_MAP[stripped];
    if (caps) {
      for (const cap of caps) {
        capabilityScores.set(cap, (capabilityScores.get(cap) ?? 0) + 1);
      }
    }
  }

  // Find matching profiles
  const matchedProfiles = new Map<string, number>();
  for (const profile of availableProfiles) {
    let score = 0;
    for (const cap of profile.capabilities) {
      score += capabilityScores.get(cap) ?? 0;
    }
    if (score > 0) {
      matchedProfiles.set(profile.id, score);
    }
  }

  // Sort by score, take top profiles (min 2 for a squad)
  const sorted = [...matchedProfiles.entries()]
    .sort((a, b) => b[1] - a[1]);

  const recommendedProfiles = sorted.length >= 2
    ? sorted.map(([id]) => id)
    : // If fewer than 2 matches, include researcher + best match as fallback
      sorted.length === 1
        ? [sorted[0][0], sorted[0][0] === "researcher" ? "coder" : "researcher"]
        : ["researcher", "coder"];

  // Detect strategy
  let bestStrategy: CoordinationStrategy = "parallel";
  let bestWeight = 0;

  for (const rule of STRATEGY_RULES) {
    if (rule.pattern.test(taskDescription) && rule.weight > bestWeight) {
      bestStrategy = rule.strategy;
      bestWeight = rule.weight;
    }
  }

  // If we have a pipeline-like set (research → code → test → review), suggest pipeline
  const hasSequentialChain =
    matchedProfiles.has("researcher") &&
    matchedProfiles.has("coder") &&
    (matchedProfiles.has("tester") || matchedProfiles.has("reviewer"));
  if (hasSequentialChain && bestWeight < 2) {
    bestStrategy = "pipeline";
  }

  // Compute complexity
  const taskTypes = [...capabilityScores.entries()]
    .filter(([, score]) => score > 0)
    .map(([cap]) => cap);

  const complexity = Math.min(1, (taskTypes.length * 0.15) + (words.length * 0.005) + (recommendedProfiles.length * 0.1));

  // Build reasoning
  const reasoning = [
    `Detected task types: ${taskTypes.join(", ") || "general"}`,
    `Recommended ${recommendedProfiles.length} agents with "${bestStrategy}" strategy`,
    complexity > 0.6 ? "High complexity — multiple specialized agents recommended" :
      complexity > 0.3 ? "Moderate complexity — targeted agent selection" :
        "Low complexity — minimal squad sufficient",
  ].join(". ");

  return {
    recommendedProfiles: recommendedProfiles.slice(0, AGENTS.SPAWNING.MAX_AGENTS_PER_SQUAD),
    strategy: bestStrategy,
    reasoning,
    taskTypes,
    complexity,
  };
}

// ─── Squad Building ─────────────────────────────────────────────────────────

/**
 * Build a SquadConfig from a formation request and profile registry.
 *
 * Resolves profile IDs to spawn configs, applying overrides.
 */
export function buildSquadFromProfiles(
  request: SquadFormationRequest,
  registry: ProfileRegistrySnapshot,
): SquadBuildResult {
  const agents: AgentSpawnConfig[] = [];
  const resolvedProfiles: string[] = [];
  const missingProfiles: string[] = [];
  const warnings: string[] = [];

  for (const profileId of request.profileIds) {
    const profile = registry.profiles.find((p) => p.id === profileId);

    if (!profile) {
      // Try falling back to a built-in template
      const template = AGENT_TEMPLATES[profileId];
      if (template) {
        agents.push(profileToSpawnConfig(
          {
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
          },
          request,
        ));
        resolvedProfiles.push(profileId);
        warnings.push(`Profile "${profileId}" resolved from template (no user profile found)`);
      } else {
        missingProfiles.push(profileId);
      }
      continue;
    }

    agents.push(profileToSpawnConfig(profile, request));
    resolvedProfiles.push(profileId);
  }

  if (agents.length === 0) {
    warnings.push("No agents could be resolved — squad will be empty");
  }

  const config: SquadConfig = {
    name: request.name,
    strategy: request.strategy,
    agents,
    maxDuration: request.maxDuration ?? AGENTS.COORDINATION.SQUAD.MAX_LIFETIME_MS,
    inactivityTimeout: AGENTS.COORDINATION.SQUAD.INACTIVITY_TIMEOUT_MS,
  };

  return { config, resolvedProfiles, missingProfiles, warnings };
}

/**
 * Convert an AgentProfile to an AgentSpawnConfig.
 */
function profileToSpawnConfig(
  profile: AgentProfile,
  request: SquadFormationRequest,
): AgentSpawnConfig {
  const model = request.modelOverrides?.[profile.id] ?? profile.model;
  const budget = request.budgetOverrides?.[profile.id] ?? profile.tokenBudget;

  const tools = request.globalTools
    ? [...profile.tools.allow, ...request.globalTools]
    : [...profile.tools.allow];

  // Apply deny list
  const denySet = profile.tools.deny ? new Set(profile.tools.deny) : undefined;
  const filteredTools = denySet
    ? tools.filter((t) => !denySet.has(t))
    : tools;

  return {
    role: profile.id,
    squadId: request.name,
    name: profile.name,
    profile: profile.systemPrompt,
    model,
    tools: filteredTools,
    maxTokens: budget,
  };
}

// ─── Quick Squad Formation ──────────────────────────────────────────────────

/**
 * One-shot squad formation: analyze task → pick profiles → build config.
 *
 * Combines task analysis with squad building for the common case
 * where the user provides a task description and wants an optimal squad.
 *
 * @example
 * ```typescript
 * const result = formSquadForTask(
 *   "Research Node.js best practices, then implement a rate limiter with tests",
 *   registry,
 *   { name: "rate-limiter-squad" }
 * );
 * // → Pipeline strategy with researcher → coder → tester
 * ```
 */
export function formSquadForTask(
  taskDescription: string,
  registry: ProfileRegistrySnapshot,
  opts?: {
    name?: string;
    strategy?: CoordinationStrategy;
    modelOverrides?: Record<string, string>;
    globalTools?: string[];
    maxDuration?: number;
  },
): SquadBuildResult & { analysis: TaskAnalysis } {
  const analysis = analyzeTaskForSquad(taskDescription, registry.profiles);

  const request: SquadFormationRequest = {
    name: opts?.name ?? `squad-${Date.now()}`,
    strategy: opts?.strategy ?? analysis.strategy,
    profileIds: analysis.recommendedProfiles,
    modelOverrides: opts?.modelOverrides,
    globalTools: opts?.globalTools,
    maxDuration: opts?.maxDuration,
  };

  const result = buildSquadFromProfiles(request, registry);
  return { ...result, analysis };
}

/**
 * Build a ComplexTask object from a user message for squad execution.
 */
export function buildComplexTask(
  description: string,
  analysis: TaskAnalysis,
): ComplexTask {
  // Generate subtasks based on recommended profiles
  const subtasks: TaskInput[] = analysis.recommendedProfiles.map((profileId) => {
    const taskType = analysis.taskTypes.find((t) =>
      TASK_CAPABILITY_MAP[t]?.some((cap) =>
        AGENT_TEMPLATES[profileId]?.capabilities.includes(cap),
      ),
    );

    return {
      description: `[${profileId}] ${taskType ? `Focus on ${taskType}: ` : ""}${description}`,
      type: taskType ?? "general",
      priority: "normal" as const,
      input: { profileId, taskType, description },
    };
  });

  const priority: TaskPriority =
    analysis.complexity > 0.6 ? "high" : analysis.complexity > 0.3 ? "normal" : "low";

  return {
    description,
    subtasks: subtasks.length > 1 ? subtasks : undefined,
    priority,
    input: description,
  };
}
