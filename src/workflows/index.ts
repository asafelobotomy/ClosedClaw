/**
 * Workflow Engine — Declarative multi-step automation
 *
 * Re-exports schema and executor APIs.
 *
 * @module workflows
 */

// ─── Schema ─────────────────────────────────────────────────────────────────

export {
  parseWorkflowDefinition,
  topologicalSort,
  interpolate,
  interpolateParams,
  WorkflowValidationError,
  DEFAULT_RETRY_POLICY,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowTrigger,
  type RetryPolicy,
  type InterpolationContext,
} from "./schema.js";

// ─── Executor ───────────────────────────────────────────────────────────────

export {
  executeWorkflow,
  serializeState,
  deserializeState,
  type WorkflowStatus,
  type StepStatus,
  type StepResult,
  type WorkflowExecutionResult,
  type ToolStepHandler,
  type AgentStepHandler,
  type WorkflowEvent,
  type WorkflowEventListener,
  type WorkflowExecutionContext,
  type SerializedWorkflowState,
} from "./executor.js";
