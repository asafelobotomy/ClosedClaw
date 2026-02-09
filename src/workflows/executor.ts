/**
 * Workflow Executor — Run workflow definitions with step orchestration
 *
 * Executes workflow steps in topological order, running independent
 * steps in parallel where possible.
 *
 * Features:
 * - DAG-based execution via topological sort
 * - Parallel step execution within batches
 * - Template interpolation between steps
 * - Retry with exponential backoff
 * - Timeouts per-step and per-workflow
 * - State tracking for resume after crash
 * - Event emission for monitoring
 *
 * @module workflows/executor
 */

import type { WorkflowDefinition, WorkflowStep, InterpolationContext } from "./schema.js";
import { topologicalSort, interpolate, interpolateParams, DEFAULT_RETRY_POLICY } from "./schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Status of a workflow execution.
 */
export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

/**
 * Status of a single step execution.
 */
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "timed_out";

/**
 * Result of a step execution.
 */
export interface StepResult {
  /** Step name */
  name: string;

  /** Final status */
  status: StepStatus;

  /** Output data (if completed) */
  output?: unknown;

  /** Error message (if failed) */
  error?: string;

  /** Started timestamp */
  startedAt?: number;

  /** Completed timestamp */
  completedAt?: number;

  /** Duration in ms */
  durationMs?: number;

  /** Number of retries attempted */
  retryCount: number;
}

/**
 * Full result of a workflow execution.
 */
export interface WorkflowExecutionResult {
  /** Workflow name */
  workflowName: string;

  /** Execution ID */
  executionId: string;

  /** Overall status */
  status: WorkflowStatus;

  /** Results for each step */
  steps: Map<string, StepResult>;

  /** Started timestamp */
  startedAt: number;

  /** Completed timestamp */
  completedAt?: number;

  /** Total duration in ms */
  durationMs?: number;

  /** Error message for overall failure */
  error?: string;
}

/**
 * Handler function that executes a tool step.
 */
export type ToolStepHandler = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Handler function that executes an agent step.
 */
export type AgentStepHandler = (
  agentId: string,
  prompt: string,
  opts?: { model?: string },
) => Promise<unknown>;

/**
 * Event emitted during workflow execution.
 */
export interface WorkflowEvent {
  timestamp: number;
  type:
    | "workflow:start"
    | "workflow:complete"
    | "workflow:fail"
    | "workflow:cancel"
    | "workflow:timeout"
    | "step:start"
    | "step:complete"
    | "step:fail"
    | "step:skip"
    | "step:retry"
    | "step:timeout"
    | "batch:start"
    | "batch:complete";
  workflowName: string;
  executionId: string;
  stepName?: string;
  batchIndex?: number;
  error?: string;
  data?: unknown;
}

/**
 * Event listener for workflow events.
 */
export type WorkflowEventListener = (event: WorkflowEvent) => void;

/**
 * Execution context providing handlers and state.
 */
export interface WorkflowExecutionContext {
  /** Handler for tool steps */
  toolHandler: ToolStepHandler;

  /** Handler for agent steps */
  agentHandler: AgentStepHandler;

  /** Event listener (optional) */
  onEvent?: WorkflowEventListener;

  /** Environment variables for interpolation */
  env?: Record<string, string>;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ─── Workflow Executor ──────────────────────────────────────────────────────

/**
 * Execute a workflow definition.
 *
 * @param workflow - The workflow to execute
 * @param ctx - Execution context with handlers and options
 * @returns Full execution result
 *
 * @example
 * ```typescript
 * const result = await executeWorkflow(workflow, {
 *   toolHandler: async (tool, params) => {
 *     return await callTool(tool, params);
 *   },
 *   agentHandler: async (agentId, prompt) => {
 *     return await runAgent(agentId, prompt);
 *   },
 *   onEvent: (event) => console.log(event),
 * });
 * ```
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  ctx: WorkflowExecutionContext,
): Promise<WorkflowExecutionResult> {
  const executionId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const stepResults = new Map<string, StepResult>();
  const timeoutMs = workflow.timeoutMs ?? 1_800_000;

  // Initialize all steps as pending
  for (const step of workflow.steps) {
    stepResults.set(step.name, {
      name: step.name,
      status: "pending",
      retryCount: 0,
    });
  }

  const emit = (event: Omit<WorkflowEvent, "timestamp" | "workflowName" | "executionId">) => {
    ctx.onEvent?.({
      timestamp: Date.now(),
      workflowName: workflow.name,
      executionId,
      ...event,
    });
  };

  emit({ type: "workflow:start" });

  // Create workflow timeout
  let timeoutReached = false;
  const workflowTimeoutHandle = setTimeout(() => {
    timeoutReached = true;
  }, timeoutMs);
  if (typeof workflowTimeoutHandle === "object" && "unref" in workflowTimeoutHandle) {
    workflowTimeoutHandle.unref();
  }

  try {
    // Sort steps into parallel batches
    const batches = topologicalSort(workflow.steps);

    // Execute batches
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      // Check cancellation
      if (ctx.signal?.aborted || timeoutReached) {
        break;
      }

      const batch = batches[batchIdx];
      emit({ type: "batch:start", batchIndex: batchIdx });

      // Execute all steps in this batch in parallel
      const batchPromises = batch.map((step) =>
        executeStep(step, workflow, stepResults, ctx, emit, executionId),
      );

      const results = await Promise.allSettled(batchPromises);

      // Update step results
      for (let i = 0; i < results.length; i++) {
        const step = batch[i];
        const result = results[i];

        if (result.status === "fulfilled") {
          stepResults.set(step.name, result.value);
        } else {
          stepResults.set(step.name, {
            name: step.name,
            status: "failed",
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            retryCount: 0,
          });
        }
      }

      emit({ type: "batch:complete", batchIndex: batchIdx });

      // Check for failures (unless continueOnError)
      for (const step of batch) {
        const sr = stepResults.get(step.name);
        if (sr?.status === "failed" && !step.continueOnError) {
          // Mark downstream steps as skipped
          skipDependentSteps(step.name, workflow.steps, stepResults);

          const completedAt = Date.now();
          emit({ type: "workflow:fail", error: sr.error });

          return {
            workflowName: workflow.name,
            executionId,
            status: "failed",
            steps: stepResults,
            startedAt,
            completedAt,
            durationMs: completedAt - startedAt,
            error: `Step "${step.name}" failed: ${sr.error}`,
          };
        }
      }
    }

    // Check final status
    const completedAt = Date.now();

    if (ctx.signal?.aborted) {
      emit({ type: "workflow:cancel" });
      return {
        workflowName: workflow.name,
        executionId,
        status: "cancelled",
        steps: stepResults,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      };
    }

    if (timeoutReached) {
      emit({ type: "workflow:timeout" });
      return {
        workflowName: workflow.name,
        executionId,
        status: "timed_out",
        steps: stepResults,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        error: `Workflow timed out after ${timeoutMs}ms`,
      };
    }

    emit({ type: "workflow:complete" });
    return {
      workflowName: workflow.name,
      executionId,
      status: "completed",
      steps: stepResults,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
    };
  } finally {
    clearTimeout(workflowTimeoutHandle);
  }
}

// ─── Step Execution ─────────────────────────────────────────────────────────

async function executeStep(
  step: WorkflowStep,
  workflow: WorkflowDefinition,
  stepResults: Map<string, StepResult>,
  ctx: WorkflowExecutionContext,
  emit: (event: Omit<WorkflowEvent, "timestamp" | "workflowName" | "executionId">) => void,
  _executionId: string,
): Promise<StepResult> {
  const startedAt = Date.now();

  // Build interpolation context from completed steps
  const interpContext: InterpolationContext = {
    steps: {},
    variables: workflow.variables,
    env: ctx.env,
  };

  for (const [name, result] of stepResults) {
    interpContext.steps[name] = {
      output: result.output,
      error: result.error,
      status: result.status,
    };
  }

  // Check condition
  if (step.condition) {
    const resolved = interpolate(step.condition, interpContext);
    if (resolved === "false" || resolved === "" || resolved === "0") {
      emit({ type: "step:skip", stepName: step.name });
      return {
        name: step.name,
        status: "skipped",
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        retryCount: 0,
      };
    }
  }

  emit({ type: "step:start", stepName: step.name });

  // Determine retry policy
  const retry = step.retry ?? workflow.defaultRetry ?? DEFAULT_RETRY_POLICY;
  let lastError: string | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    if (attempt > 0) {
      // Wait before retry with exponential backoff
      const delay = Math.min(
        retry.baseDelayMs * Math.pow(retry.backoffMultiplier, attempt - 1),
        retry.maxDelayMs,
      );
      emit({ type: "step:retry", stepName: step.name, data: { attempt, delay } });
      await sleep(delay);
      retryCount++;
    }

    try {
      // Create step timeout
      const stepTimeoutMs = step.timeoutMs ?? 300_000;
      const output = await withTimeout(
        () => runStep(step, interpContext, ctx),
        stepTimeoutMs,
        `Step "${step.name}" timed out after ${stepTimeoutMs}ms`,
      );

      const completedAt = Date.now();
      emit({ type: "step:complete", stepName: step.name });

      return {
        name: step.name,
        status: "completed",
        output,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        retryCount,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      if (lastError.includes("timed out")) {
        emit({ type: "step:timeout", stepName: step.name, error: lastError });
        return {
          name: step.name,
          status: "timed_out",
          error: lastError,
          startedAt,
          completedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          retryCount,
        };
      }
    }
  }

  // All retries exhausted
  emit({ type: "step:fail", stepName: step.name, error: lastError });

  return {
    name: step.name,
    status: "failed",
    error: lastError,
    startedAt,
    completedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    retryCount,
  };
}

async function runStep(
  step: WorkflowStep,
  context: InterpolationContext,
  ctx: WorkflowExecutionContext,
): Promise<unknown> {
  if (step.type === "tool" && step.tool) {
    const params = step.params ? interpolateParams(step.params, context) : {};
    return await ctx.toolHandler(step.tool, params);
  }

  if (step.type === "agent" && step.agent) {
    const prompt = step.prompt ? interpolate(step.prompt, context) : "";
    return await ctx.agentHandler(step.agent, prompt, { model: step.model });
  }

  throw new Error(`Invalid step type: ${step.type}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function skipDependentSteps(
  failedStepName: string,
  allSteps: WorkflowStep[],
  stepResults: Map<string, StepResult>,
): void {
  // Find all steps that directly or transitively depend on the failed step
  const toSkip = new Set<string>();

  function markDependents(name: string) {
    for (const step of allSteps) {
      if (step.dependsOn?.includes(name) && !toSkip.has(step.name)) {
        toSkip.add(step.name);
        markDependents(step.name);
      }
    }
  }

  markDependents(failedStepName);

  for (const name of toSkip) {
    const existing = stepResults.get(name);
    if (existing && existing.status === "pending") {
      stepResults.set(name, {
        ...existing,
        status: "skipped",
        error: `Skipped: dependency "${failedStepName}" failed`,
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms);
    if (typeof handle === "object" && "unref" in handle) {
      handle.unref();
    }
  });
}

async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    }, timeoutMs);

    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }

    fn().then(
      (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}

// ─── State Serialization ─────────────────────────────────────────────────────

/**
 * Serializable workflow execution state for persistence.
 */
export interface SerializedWorkflowState {
  executionId: string;
  workflowName: string;
  status: WorkflowStatus;
  steps: Array<{
    name: string;
    status: StepStatus;
    output?: unknown;
    error?: string;
    retryCount: number;
    startedAt?: number;
    completedAt?: number;
  }>;
  startedAt: number;
  savedAt: number;
}

/**
 * Serialize execution state for persistence.
 */
export function serializeState(result: WorkflowExecutionResult): SerializedWorkflowState {
  return {
    executionId: result.executionId,
    workflowName: result.workflowName,
    status: result.status,
    steps: [...result.steps.entries()].map(([, sr]) => ({
      name: sr.name,
      status: sr.status,
      output: sr.output,
      error: sr.error,
      retryCount: sr.retryCount,
      startedAt: sr.startedAt,
      completedAt: sr.completedAt,
    })),
    startedAt: result.startedAt,
    savedAt: Date.now(),
  };
}

/**
 * Deserialize execution state from persistence.
 */
export function deserializeState(state: SerializedWorkflowState): WorkflowExecutionResult {
  const steps = new Map<string, StepResult>();
  for (const s of state.steps) {
    steps.set(s.name, {
      name: s.name,
      status: s.status,
      output: s.output,
      error: s.error,
      retryCount: s.retryCount,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationMs: s.startedAt && s.completedAt ? s.completedAt - s.startedAt : undefined,
    });
  }

  return {
    workflowName: state.workflowName,
    executionId: state.executionId,
    status: state.status,
    steps,
    startedAt: state.startedAt,
  };
}
