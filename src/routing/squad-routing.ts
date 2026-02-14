/**
 * Squad Routing Integration
 *
 * Connects the squad system to the ClosedClaw routing layer.
 * Handles message routing to squads, complexity detection, and reply aggregation.
 *
 * **Squad Triggers** (when to spin up a squad):
 * 1. Explicit user request ("use a squad", "collaborate on this")
 * 2. Complexity detection (long message, multi-step request, code + research)
 * 3. Config-based bindings (route certain peers/channels to squad)
 *
 * **Reply Aggregation**: Multiple agent outputs → single user-facing message.
 *
 * @module routing/squad-routing
 */

import type {
  SquadCoordinator,
  SquadConfig,
  SquadResult,
  CoordinationStrategy,
} from "../agents/squad/coordinator.js";
import type { AgentSpawnConfig } from "../agents/squad/spawner.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for a squad binding in the routing table.
 */
export interface SquadBinding {
  /** Unique squad binding ID */
  id: string;

  /** Which channels this binding applies to */
  channels?: string[];

  /** Peer IDs that trigger this squad */
  peerIds?: string[];

  /** Guild IDs that trigger this squad */
  guildIds?: string[];

  /** Squad config to use when triggered */
  squadConfig: SquadConfig;
}

/**
 * Trigger hints that help decide whether to use a squad.
 */
export interface SquadTriggerHint {
  /** Whether the user explicitly asked for squad collaboration */
  explicitRequest: boolean;

  /** The estimated complexity score (0 = trivial, 1 = highly complex) */
  complexityScore: number;

  /** Detected task types in the message */
  detectedTaskTypes: string[];

  /** Recommended strategy based on analysis */
  recommendedStrategy: CoordinationStrategy;

  /** Whether a squad is recommended */
  shouldUseSquad: boolean;
}

/**
 * Result from routing a message through a squad.
 */
export interface SquadRouteResult {
  /** Whether a squad handled this message */
  handled: boolean;

  /** The squad ID that processed the message */
  squadId?: string;

  /** Aggregated reply for the user */
  reply?: string;

  /** Raw squad result */
  squadResult?: SquadResult;
}

/**
 * Input for squad routing analysis.
 */
export interface SquadRouteInput {
  /** The user's message content */
  message: string;

  /** Channel the message came from */
  channel: string;

  /** Peer/user ID */
  peerId?: string;

  /** Guild/group ID */
  guildId?: string;
}

// ─── Complexity Detection ──────────────────────────────────────────────────

/**
 * Keywords that suggest explicit squad request.
 */
const SQUAD_KEYWORDS = [
  "use a squad",
  "use squad",
  "collaborate",
  "team up",
  "multi-agent",
  "multiple agents",
  "research and code",
  "review and test",
  "analyze and implement",
] as const;

/**
 * Patterns that indicate high-complexity tasks.
 */
const COMPLEXITY_PATTERNS = [
  {
    pattern: /\b(research|investigate|analyze)\b.*\b(implement|build|create|code)\b/i,
    weight: 0.4,
    types: ["research", "code"],
  },
  {
    pattern: /\b(review|audit|check)\b.*\b(test|verify|validate)\b/i,
    weight: 0.3,
    types: ["review", "test"],
  },
  {
    pattern: /\b(refactor|restructure|reorganize)\b.*\b(across|multiple|several)\b/i,
    weight: 0.3,
    types: ["code", "review"],
  },
  { pattern: /\bstep\s*\d+\b.*\bstep\s*\d+\b/i, weight: 0.2, types: ["general"] },
  { pattern: /\b(first|then|after that|finally|next)\b/gi, weight: 0.1, types: ["general"] },
] as const;

/**
 * Analyze a message to produce squad trigger hints.
 *
 * Uses keyword matching, pattern detection, and message length
 * to estimate complexity and recommend a squad strategy.
 *
 * @param input - The message and context to analyze
 * @returns Trigger hints with recommendations
 */
export function analyzeSquadTrigger(input: SquadRouteInput): SquadTriggerHint {
  const { message } = input;
  const lowerMessage = message.toLowerCase();

  // Check for explicit squad request
  const explicitRequest = SQUAD_KEYWORDS.some((kw) => lowerMessage.includes(kw));

  // Calculate complexity score
  let complexityScore = 0;
  const detectedTaskTypes = new Set<string>();

  // Length-based complexity (longer messages tend to be more complex)
  const wordCount = message.split(/\s+/).length;
  if (wordCount > 200) {
    complexityScore += 0.3;
  } else if (wordCount > 100) {
    complexityScore += 0.2;
  } else if (wordCount > 50) {
    complexityScore += 0.1;
  }

  // Pattern-based complexity
  for (const { pattern, weight, types } of COMPLEXITY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(message)) {
      complexityScore += weight;
      for (const t of types) {
        detectedTaskTypes.add(t);
      }
    }
  }

  // Multiple code blocks suggest multi-step work
  const codeBlockCount = (message.match(/```/g) || []).length / 2;
  if (codeBlockCount >= 2) {
    complexityScore += 0.2;
    detectedTaskTypes.add("code");
  }

  // Explicit request pushes complexity over threshold
  if (explicitRequest) {
    complexityScore = Math.max(complexityScore, 0.6);
  }

  // Cap at 1.0
  complexityScore = Math.min(1.0, complexityScore);

  // Determine recommended strategy
  const typeList = [...detectedTaskTypes];
  let recommendedStrategy: CoordinationStrategy = "pipeline";

  if (typeList.length === 0 || typeList.length === 1) {
    recommendedStrategy = "pipeline";
  } else if (typeList.includes("research") && typeList.includes("code")) {
    recommendedStrategy = "pipeline"; // Research → Code
  } else if (typeList.includes("review") && typeList.includes("test")) {
    recommendedStrategy = "parallel"; // Review + Test simultaneously
  } else if (typeList.length >= 3) {
    recommendedStrategy = "map-reduce"; // Many task types → distribute
  }

  // Threshold: use squad if complexity > 0.5 or explicit request
  const shouldUseSquad = explicitRequest || complexityScore > 0.5;

  return {
    explicitRequest,
    complexityScore,
    detectedTaskTypes: typeList,
    recommendedStrategy,
    shouldUseSquad,
  };
}

// ─── Default Squad Configs ──────────────────────────────────────────────────

/**
 * Default agent templates for squad creation.
 */
export const DEFAULT_SQUAD_AGENTS: Record<string, AgentSpawnConfig> = {
  researcher: {
    role: "researcher",
    squadId: "",
    name: "Researcher",
    tools: ["web_search", "web_fetch", "read_file"],
    maxTokens: 50_000,
  },
  coder: {
    role: "coder",
    squadId: "",
    name: "Coder",
    tools: ["read_file", "write_file", "bash", "grep"],
    maxTokens: 100_000,
  },
  reviewer: {
    role: "reviewer",
    squadId: "",
    name: "Reviewer",
    tools: ["read_file", "grep", "web_search"],
    maxTokens: 50_000,
  },
  tester: {
    role: "tester",
    squadId: "",
    name: "Tester",
    tools: ["read_file", "bash", "write_file"],
    maxTokens: 50_000,
  },
};

/**
 * Build a squad config from detected task types.
 */
export function buildSquadConfig(
  name: string,
  strategy: CoordinationStrategy,
  roles: string[],
): SquadConfig {
  const agents: AgentSpawnConfig[] = roles.map((role) => {
    const template = DEFAULT_SQUAD_AGENTS[role];
    return template
      ? { ...template, squadId: "" }
      : { role, squadId: "", name: role, maxTokens: 50_000 };
  });

  return {
    name,
    strategy,
    agents,
  };
}

// ─── Reply Aggregation ─────────────────────────────────────────────────────

/**
 * Aggregate a squad result into a user-facing reply.
 *
 * Combines agent contributions in a readable format.
 * Pipeline results show the final output; parallel results show all outputs.
 */
export function aggregateSquadReply(result: SquadResult, strategy: CoordinationStrategy): string {
  if (!result.success) {
    const failedContribs = result.contributions.filter((c) => !c.output);
    return [
      "Squad task failed.",
      result.error ? `Error: ${result.error}` : "",
      `Completed: ${result.metrics.tasksCompleted}, Failed: ${result.metrics.tasksFailed}`,
      failedContribs.length > 0
        ? `Failed agents: ${failedContribs.map((c) => c.role).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  switch (strategy) {
    case "pipeline":
      // Pipeline: show final agent's output
      return formatOutput(result.output);

    case "parallel": {
      // Parallel: show all outputs labeled by agent
      const parts: string[] = [];
      for (const contrib of result.contributions) {
        parts.push(`**${contrib.role}** (${contrib.agentId}):\n${formatOutput(contrib.output)}`);
      }
      return parts.join("\n\n---\n\n");
    }

    case "map-reduce":
      // Map-reduce: show the reduced output
      return formatOutput(result.output);

    case "consensus":
      // Consensus: show the winning answer + vote count
      return [
        formatOutput(result.output),
        "",
        `_(${result.contributions.length} agents voted, ${result.metrics.tasksCompleted} succeeded)_`,
      ].join("\n");

    default:
      return formatOutput(result.output);
  }
}

/**
 * Format an output value as a string for display.
 */
function formatOutput(output: unknown): string {
  if (output === null || output === undefined) {
    return "(no output)";
  }
  if (typeof output === "string") {
    return output;
  }
  return JSON.stringify(output, null, 2);
}

// ─── Squad Route Resolution ────────────────────────────────────────────────

/**
 * Check if a message should be routed to a squad based on bindings.
 *
 * @param input - The incoming message context
 * @param bindings - Configured squad bindings
 * @returns The matching binding, or undefined if no match
 */
export function findSquadBinding(
  input: SquadRouteInput,
  bindings: SquadBinding[],
): SquadBinding | undefined {
  for (const binding of bindings) {
    // Channel match
    if (binding.channels && binding.channels.length > 0) {
      if (!binding.channels.includes(input.channel)) {
        continue;
      }
    }

    // Peer match
    if (binding.peerIds && binding.peerIds.length > 0) {
      if (!input.peerId || !binding.peerIds.includes(input.peerId)) {
        continue;
      }
    }

    // Guild match
    if (binding.guildIds && binding.guildIds.length > 0) {
      if (!input.guildId || !binding.guildIds.includes(input.guildId)) {
        continue;
      }
    }

    return binding;
  }

  return undefined;
}

/**
 * Route a message through the squad system.
 *
 * Checks bindings first, then complexity analysis for automatic squad creation.
 *
 * @param input - The incoming message
 * @param coordinator - The squad coordinator
 * @param bindings - Configured squad bindings (optional)
 * @returns The routing result
 */
export async function routeToSquad(
  input: SquadRouteInput,
  coordinator: SquadCoordinator,
  bindings: SquadBinding[] = [],
): Promise<SquadRouteResult> {
  // 1. Check for explicit bindings
  const binding = findSquadBinding(input, bindings);
  if (binding) {
    const squadId = await coordinator.createSquad(binding.squadConfig);
    const result = await coordinator.executeTask(squadId, {
      description: input.message,
    });

    await coordinator.terminateSquad(squadId).catch(() => {});

    return {
      handled: true,
      squadId,
      reply: aggregateSquadReply(result, binding.squadConfig.strategy),
      squadResult: result,
    };
  }

  // 2. Check if complexity warrants a squad
  const trigger = analyzeSquadTrigger(input);
  if (!trigger.shouldUseSquad) {
    return { handled: false };
  }

  // 3. Build and execute a squad
  const roles =
    trigger.detectedTaskTypes.length > 0
      ? mapTaskTypesToRoles(trigger.detectedTaskTypes)
      : ["researcher", "coder"];

  const config = buildSquadConfig(`auto-${Date.now()}`, trigger.recommendedStrategy, roles);

  const squadId = await coordinator.createSquad(config);
  const result = await coordinator.executeTask(squadId, {
    description: input.message,
    priority: "normal",
  });

  await coordinator.terminateSquad(squadId).catch(() => {});

  return {
    handled: true,
    squadId,
    reply: aggregateSquadReply(result, trigger.recommendedStrategy),
    squadResult: result,
  };
}

/**
 * Map detected task types to agent roles.
 */
function mapTaskTypesToRoles(taskTypes: string[]): string[] {
  const roleMap: Record<string, string> = {
    research: "researcher",
    code: "coder",
    review: "reviewer",
    test: "tester",
    general: "coder",
  };

  const roles = new Set<string>();
  for (const type of taskTypes) {
    roles.add(roleMap[type] ?? type);
  }

  // Ensure at least 2 agents for a meaningful squad
  if (roles.size < 2) {
    if (!roles.has("researcher")) {
      roles.add("researcher");
    }
    if (!roles.has("coder")) {
      roles.add("coder");
    }
  }

  return [...roles];
}
