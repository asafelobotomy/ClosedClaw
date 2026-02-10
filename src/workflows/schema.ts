/**
 * Workflow Schema — Define, parse, and validate declarative workflows
 *
 * Workflows are multi-step automations described in YAML or JSON5:
 * - **Triggers**: cron, manual, event-based
 * - **Steps**: Sequential or DAG-based with dependencies
 * - **Interpolation**: Template variables `{{steps.name.output}}`
 * - **Error handling**: Retry policies, rollback, continue-on-error
 *
 * @module workflows/schema
 *
 * @example
 * ```yaml
 * name: weekly-report
 * trigger:
 *   cron: "0 9 * * FRI"
 * steps:
 *   - name: fetch-metrics
 *     tool: github_api
 *     params:
 *       action: fetch_pr_stats
 *
 *   - name: summarize
 *     agent: main
 *     prompt: "Summarize: {{steps.fetch-metrics.output}}"
 *     dependsOn: [fetch-metrics]
 *
 *   - name: send-report
 *     tool: send_message
 *     params:
 *       channel: slack
 *       message: "{{steps.summarize.output}}"
 *     dependsOn: [summarize]
 * ```
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * How a workflow is triggered.
 */
export type WorkflowTrigger =
  | { kind: "manual" }
  | { kind: "cron"; expression: string; timezone?: string }
  | { kind: "event"; eventName: string; filter?: Record<string, unknown> };

/**
 * Retry policy for a workflow step.
 */
export interface RetryPolicy {
  /** Maximum number of retries (default: 0 = no retry) */
  maxRetries: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay (for exponential backoff) in ms (default: 60000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
}

/**
 * A single step in a workflow.
 */
export interface WorkflowStep {
  /** Unique step name within the workflow */
  name: string;

  /** Step type: invoke a tool or prompt an agent */
  type: "tool" | "agent";

  /** Tool name (if type is "tool") */
  tool?: string;

  /** Agent ID (if type is "agent") */
  agent?: string;

  /** Parameters for tool call (supports template interpolation) */
  params?: Record<string, unknown>;

  /** Prompt for agent call (supports template interpolation) */
  prompt?: string;

  /** Model override for agent step */
  model?: string;

  /** Steps that must complete before this one starts */
  dependsOn?: string[];

  /** Whether to continue the workflow if this step fails */
  continueOnError?: boolean;

  /** Retry policy for this step */
  retry?: RetryPolicy;

  /** Timeout for this step in ms (default: 300000 = 5 min) */
  timeoutMs?: number;

  /** Condition expression (step runs only if truthy) */
  condition?: string;
}

/**
 * A complete workflow definition.
 */
export interface WorkflowDefinition {
  /** Unique workflow name */
  name: string;

  /** Human-readable description */
  description?: string;

  /** How this workflow is triggered */
  trigger: WorkflowTrigger;

  /** Ordered list of steps (dependencies can override execution order) */
  steps: WorkflowStep[];

  /** Global timeout for entire workflow in ms (default: 1800000 = 30 min) */
  timeoutMs?: number;

  /** Global retry policy (applied to steps without individual policies) */
  defaultRetry?: RetryPolicy;

  /** Variables available to all steps */
  variables?: Record<string, unknown>;

  /** Tags for filtering/organizing workflows */
  tags?: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_STEP_TIMEOUT_MS = 300_000;    // 5 minutes
const DEFAULT_WORKFLOW_TIMEOUT_MS = 1_800_000; // 30 minutes

import { DELAY_RETRY_BASE_MS, DELAY_RETRY_MAX_MS } from "../config/constants/index.js";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 0,
  baseDelayMs: DELAY_RETRY_BASE_MS,
  maxDelayMs: DELAY_RETRY_MAX_MS,
  backoffMultiplier: 2,
};

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse a raw workflow object (from YAML/JSON5 deserialization) into a typed definition.
 *
 * @param raw - The deserialized workflow object
 * @returns Parsed WorkflowDefinition
 * @throws {WorkflowValidationError} If the workflow is invalid
 */
export function parseWorkflowDefinition(raw: unknown): WorkflowDefinition {
  if (!raw || typeof raw !== "object") {
    throw new WorkflowValidationError("Workflow must be an object");
  }

  const obj = raw as Record<string, unknown>;

  // Name
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new WorkflowValidationError("Workflow must have a 'name' string");
  }
  const name = obj.name.trim();

  // Description
  const description = typeof obj.description === "string" ? obj.description : undefined;

  // Trigger
  const trigger = parseTrigger(obj.trigger);

  // Steps
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new WorkflowValidationError("Workflow must have at least one step");
  }
  const steps = obj.steps.map((s: unknown, i: number) => parseStep(s, i));

  // Validate step dependencies
  validateDependencies(steps);

  // Timeouts
  const timeoutMs = typeof obj.timeoutMs === "number"
    ? obj.timeoutMs
    : typeof obj.timeout === "number"
      ? obj.timeout
      : DEFAULT_WORKFLOW_TIMEOUT_MS;

  // Default retry
  const defaultRetry = obj.defaultRetry
    ? parseRetryPolicy(obj.defaultRetry)
    : undefined;

  // Variables
  const variables = obj.variables && typeof obj.variables === "object"
    ? obj.variables as Record<string, unknown>
    : undefined;

  // Tags
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string")
    : undefined;

  return { name, description, trigger, steps, timeoutMs, defaultRetry, variables, tags };
}

function parseTrigger(raw: unknown): WorkflowTrigger {
  if (!raw || typeof raw !== "object") {
    // Default to manual trigger
    return { kind: "manual" };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.cron === "string") {
    return {
      kind: "cron",
      expression: obj.cron,
      timezone: typeof obj.timezone === "string" ? obj.timezone : undefined,
    };
  }

  if (typeof obj.event === "string" || typeof obj.eventName === "string") {
    return {
      kind: "event",
      eventName: (obj.event ?? obj.eventName) as string,
      filter: obj.filter && typeof obj.filter === "object"
        ? obj.filter as Record<string, unknown>
        : undefined,
    };
  }

  if (obj.kind === "manual" || obj.manual === true) {
    return { kind: "manual" };
  }

  return { kind: "manual" };
}

function parseStep(raw: unknown, index: number): WorkflowStep {
  if (!raw || typeof raw !== "object") {
    throw new WorkflowValidationError(`Step ${index} must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new WorkflowValidationError(`Step ${index} must have a 'name' string`);
  }

  const name = obj.name.trim();

  // Determine type from fields
  const hasTool = typeof obj.tool === "string";
  const hasAgent = typeof obj.agent === "string";

  if (!hasTool && !hasAgent) {
    throw new WorkflowValidationError(
      `Step "${name}" must have either 'tool' or 'agent'`,
    );
  }

  const type: "tool" | "agent" = hasTool ? "tool" : "agent";

  // Parse dependencies
  const dependsOn = Array.isArray(obj.dependsOn)
    ? obj.dependsOn.filter((d): d is string => typeof d === "string")
    : typeof obj.depends_on === "string"
      ? [obj.depends_on]
      : Array.isArray(obj.depends_on)
        ? (obj.depends_on as unknown[]).filter((d): d is string => typeof d === "string")
        : undefined;

  // Parse params
  const params = obj.params && typeof obj.params === "object"
    ? obj.params as Record<string, unknown>
    : undefined;

  // Parse retry
  const retry = obj.retry ? parseRetryPolicy(obj.retry) : undefined;

  return {
    name,
    type,
    tool: hasTool ? obj.tool as string : undefined,
    agent: hasAgent ? obj.agent as string : undefined,
    params,
    prompt: typeof obj.prompt === "string" ? obj.prompt : undefined,
    model: typeof obj.model === "string" ? obj.model : undefined,
    dependsOn,
    continueOnError: obj.continueOnError === true || obj.continue_on_error === true,
    retry,
    timeoutMs: typeof obj.timeoutMs === "number"
      ? obj.timeoutMs
      : typeof obj.timeout === "number"
        ? obj.timeout
        : DEFAULT_STEP_TIMEOUT_MS,
    condition: typeof obj.condition === "string" ? obj.condition : undefined,
  };
}

function parseRetryPolicy(raw: unknown): RetryPolicy {
  if (typeof raw === "number") {
    return { ...DEFAULT_RETRY_POLICY, maxRetries: raw };
  }

  if (typeof raw !== "object" || !raw) {
    return { ...DEFAULT_RETRY_POLICY };
  }

  const obj = raw as Record<string, unknown>;
  return {
    maxRetries: typeof obj.maxRetries === "number" ? obj.maxRetries : DEFAULT_RETRY_POLICY.maxRetries,
    baseDelayMs: typeof obj.baseDelayMs === "number" ? obj.baseDelayMs : DEFAULT_RETRY_POLICY.baseDelayMs,
    maxDelayMs: typeof obj.maxDelayMs === "number" ? obj.maxDelayMs : DEFAULT_RETRY_POLICY.maxDelayMs,
    backoffMultiplier: typeof obj.backoffMultiplier === "number" ? obj.backoffMultiplier : DEFAULT_RETRY_POLICY.backoffMultiplier,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate that step dependencies form a valid DAG (no cycles).
 */
function validateDependencies(steps: WorkflowStep[]): void {
  const stepNames = new Set(steps.map((s) => s.name));

  // Check for duplicate names
  if (stepNames.size < steps.length) {
    const seen = new Set<string>();
    for (const step of steps) {
      if (seen.has(step.name)) {
        throw new WorkflowValidationError(`Duplicate step name: "${step.name}"`);
      }
      seen.add(step.name);
    }
  }

  // Check all dependencies exist
  for (const step of steps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!stepNames.has(dep)) {
          throw new WorkflowValidationError(
            `Step "${step.name}" depends on unknown step "${dep}"`,
          );
        }
        if (dep === step.name) {
          throw new WorkflowValidationError(
            `Step "${step.name}" depends on itself`,
          );
        }
      }
    }
  }

  // Check for cycles via DFS
  detectCycles(steps);
}

/**
 * Detect cycles in step dependencies via DFS.
 */
function detectCycles(steps: WorkflowStep[]): void {
  const adjacency = new Map<string, string[]>();
  for (const step of steps) {
    adjacency.set(step.name, step.dependsOn ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      throw new WorkflowValidationError(
        `Dependency cycle detected: ${cycle.join(" → ")}`,
      );
    }

    if (visited.has(node)) {return;}

    inStack.add(node);
    path.push(node);

    for (const dep of adjacency.get(node) ?? []) {
      dfs(dep, [...path]);
    }

    inStack.delete(node);
    visited.add(node);
  }

  for (const step of steps) {
    if (!visited.has(step.name)) {
      dfs(step.name, []);
    }
  }
}

// ─── Template Interpolation ─────────────────────────────────────────────────

/**
 * Pattern for template variables: `{{expression}}`.
 */
const TEMPLATE_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Interpolate template variables in a string.
 *
 * Supports:
 * - `{{steps.<name>.output}}` — output from a previous step
 * - `{{variables.<name>}}` — workflow variables
 * - `{{env.<name>}}` — environment variables
 *
 * @param template - String with `{{...}}` placeholders
 * @param context - Available variables for interpolation
 * @returns Interpolated string
 */
export function interpolate(
  template: string,
  context: InterpolationContext,
): string {
  return template.replace(TEMPLATE_PATTERN, (match, expr: string) => {
    const resolved = resolveExpression(expr.trim(), context);
    if (resolved === undefined) {return match;} // Leave unresolved as-is
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

/**
 * Interpolate all string values in a params object.
 */
export function interpolateParams(
  params: Record<string, unknown>,
  context: InterpolationContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      result[key] = interpolate(value, context);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Context for template interpolation.
 */
export interface InterpolationContext {
  /** Results from previous steps */
  steps: Record<string, { output?: unknown; error?: string; status?: string }>;
  /** Workflow variables */
  variables?: Record<string, unknown>;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Resolve a dotted path expression against the context.
 */
function resolveExpression(expr: string, context: InterpolationContext): unknown {
  const parts = expr.split(".");
  const root = parts[0];

  let current: unknown;

  switch (root) {
    case "steps":
      current = context.steps;
      break;
    case "variables":
    case "vars":
      current = context.variables;
      break;
    case "env":
      current = context.env;
      break;
    default:
      return undefined;
  }

  // Walk the dotted path
  for (let i = 1; i < parts.length; i++) {
    if (current === null || current === undefined) {return undefined;}
    if (typeof current !== "object") {return undefined;}
    current = (current as Record<string, unknown>)[parts[i]];
  }

  return current;
}

// ─── Topological Sort ───────────────────────────────────────────────────────

/**
 * Topologically sort workflow steps based on dependencies.
 *
 * Steps with no dependencies come first. Steps with satisfied
 * dependencies are grouped into parallel batches.
 *
 * @returns Array of batches, where all steps in a batch can run in parallel
 */
export function topologicalSort(steps: WorkflowStep[]): WorkflowStep[][] {
  const stepMap = new Map<string, WorkflowStep>();
  for (const step of steps) {
    stepMap.set(step.name, step);
  }

  // Track in-degree (number of unresolved dependencies)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep → steps that depend on it

  for (const step of steps) {
    inDegree.set(step.name, step.dependsOn?.length ?? 0);

    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        const deps = dependents.get(dep) ?? [];
        deps.push(step.name);
        dependents.set(dep, deps);
      }
    }
  }

  const batches: WorkflowStep[][] = [];
  const processed = new Set<string>();

  while (processed.size < steps.length) {
    // Find all steps with in-degree 0
    const batch: WorkflowStep[] = [];

    for (const [name, degree] of inDegree) {
      if (degree === 0 && !processed.has(name)) {
        batch.push(stepMap.get(name)!);
      }
    }

    if (batch.length === 0) {
      // Should not happen if validation passed, but guard against it
      throw new WorkflowValidationError("Unresolvable dependencies (internal error)");
    }

    // Mark batch as processed and reduce in-degrees
    for (const step of batch) {
      processed.add(step.name);
      inDegree.delete(step.name);

      for (const dependent of dependents.get(step.name) ?? []) {
        inDegree.set(dependent, (inDegree.get(dependent) ?? 1) - 1);
      }
    }

    batches.push(batch);
  }

  return batches;
}

// ─── Error ──────────────────────────────────────────────────────────────────

/**
 * Error thrown during workflow validation.
 */
export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}
