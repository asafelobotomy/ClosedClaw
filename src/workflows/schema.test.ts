/**
 * Tests for Workflow Schema
 */

import { describe, it, expect } from "vitest";
import {
  parseWorkflowDefinition,
  topologicalSort,
  interpolate,
  interpolateParams,
  WorkflowValidationError,
  type InterpolationContext,
} from "./schema.js";

// ─── parseWorkflowDefinition ────────────────────────────────────────────────

describe("parseWorkflowDefinition", () => {
  it("parses a valid workflow", () => {
    const workflow = parseWorkflowDefinition({
      name: "test-workflow",
      description: "A test workflow",
      trigger: { cron: "0 9 * * FRI" },
      steps: [
        { name: "step1", tool: "fetch_data", params: { url: "https://api.example.com" } },
        { name: "step2", agent: "main", prompt: "Summarize: {{steps.step1.output}}", dependsOn: ["step1"] },
      ],
    });

    expect(workflow.name).toBe("test-workflow");
    expect(workflow.description).toBe("A test workflow");
    expect(workflow.trigger.kind).toBe("cron");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0].type).toBe("tool");
    expect(workflow.steps[0].tool).toBe("fetch_data");
    expect(workflow.steps[1].type).toBe("agent");
    expect(workflow.steps[1].agent).toBe("main");
    expect(workflow.steps[1].dependsOn).toEqual(["step1"]);
  });

  it("defaults to manual trigger", () => {
    const workflow = parseWorkflowDefinition({
      name: "manual-wf",
      steps: [{ name: "s1", tool: "test" }],
    });

    expect(workflow.trigger.kind).toBe("manual");
  });

  it("parses event triggers", () => {
    const workflow = parseWorkflowDefinition({
      name: "event-wf",
      trigger: { event: "message:received", filter: { channel: "slack" } },
      steps: [{ name: "s1", tool: "test" }],
    });

    expect(workflow.trigger.kind).toBe("event");
    if (workflow.trigger.kind === "event") {
      expect(workflow.trigger.eventName).toBe("message:received");
      expect(workflow.trigger.filter).toEqual({ channel: "slack" });
    }
  });

  it("parses retry policies", () => {
    const workflow = parseWorkflowDefinition({
      name: "retry-wf",
      steps: [
        {
          name: "s1",
          tool: "flaky",
          retry: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000, backoffMultiplier: 2 },
        },
      ],
    });

    expect(workflow.steps[0].retry?.maxRetries).toBe(3);
    expect(workflow.steps[0].retry?.baseDelayMs).toBe(500);
  });

  it("parses numeric retry shorthand", () => {
    const workflow = parseWorkflowDefinition({
      name: "retry-short",
      steps: [{ name: "s1", tool: "flaky", retry: 5 }],
    });

    expect(workflow.steps[0].retry?.maxRetries).toBe(5);
  });

  it("parses continueOnError", () => {
    const workflow = parseWorkflowDefinition({
      name: "continue-wf",
      steps: [{ name: "s1", tool: "test", continueOnError: true }],
    });

    expect(workflow.steps[0].continueOnError).toBe(true);
  });

  it("parses tags and variables", () => {
    const workflow = parseWorkflowDefinition({
      name: "vars-wf",
      tags: ["report", "weekly"],
      variables: { reportTitle: "Weekly Summary" },
      steps: [{ name: "s1", tool: "test" }],
    });

    expect(workflow.tags).toEqual(["report", "weekly"]);
    expect(workflow.variables).toEqual({ reportTitle: "Weekly Summary" });
  });

  it("throws on missing name", () => {
    expect(() => parseWorkflowDefinition({ steps: [{ name: "s1", tool: "test" }] }))
      .toThrow(WorkflowValidationError);
  });

  it("throws on empty steps", () => {
    expect(() => parseWorkflowDefinition({ name: "empty", steps: [] }))
      .toThrow(WorkflowValidationError);
  });

  it("throws on step without tool or agent", () => {
    expect(() => parseWorkflowDefinition({ name: "bad", steps: [{ name: "s1" }] }))
      .toThrow(WorkflowValidationError);
  });

  it("throws on unknown dependency", () => {
    expect(() => parseWorkflowDefinition({
      name: "bad-dep",
      steps: [
        { name: "s1", tool: "test", dependsOn: ["nonexistent"] },
      ],
    })).toThrow(WorkflowValidationError);
  });

  it("throws on self-dependency", () => {
    expect(() => parseWorkflowDefinition({
      name: "self-dep",
      steps: [
        { name: "s1", tool: "test", dependsOn: ["s1"] },
      ],
    })).toThrow(WorkflowValidationError);
  });

  it("throws on duplicate step names", () => {
    expect(() => parseWorkflowDefinition({
      name: "dupes",
      steps: [
        { name: "s1", tool: "test" },
        { name: "s1", tool: "test2" },
      ],
    })).toThrow(WorkflowValidationError);
  });

  it("throws on dependency cycle", () => {
    expect(() => parseWorkflowDefinition({
      name: "cycle",
      steps: [
        { name: "a", tool: "test", dependsOn: ["b"] },
        { name: "b", tool: "test", dependsOn: ["c"] },
        { name: "c", tool: "test", dependsOn: ["a"] },
      ],
    })).toThrow(/cycle/i);
  });

  it("throws on non-object input", () => {
    expect(() => parseWorkflowDefinition(null)).toThrow(WorkflowValidationError);
    expect(() => parseWorkflowDefinition("string")).toThrow(WorkflowValidationError);
  });
});

// ─── topologicalSort ────────────────────────────────────────────────────────

describe("topologicalSort", () => {
  it("sorts independent steps into one batch", () => {
    const steps = [
      { name: "a", type: "tool" as const, tool: "test", timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "b", type: "tool" as const, tool: "test", timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "c", type: "tool" as const, tool: "test", timeoutMs: 300000, continueOnError: false, retryCount: 0 },
    ];

    const batches = topologicalSort(steps);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("sorts sequential dependencies", () => {
    const steps = [
      { name: "a", type: "tool" as const, tool: "test", timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "b", type: "tool" as const, tool: "test", dependsOn: ["a"], timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "c", type: "tool" as const, tool: "test", dependsOn: ["b"], timeoutMs: 300000, continueOnError: false, retryCount: 0 },
    ];

    const batches = topologicalSort(steps);
    expect(batches).toHaveLength(3);
    expect(batches[0][0].name).toBe("a");
    expect(batches[1][0].name).toBe("b");
    expect(batches[2][0].name).toBe("c");
  });

  it("parallelizes independent branches", () => {
    const steps = [
      { name: "start", type: "tool" as const, tool: "test", timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "branch-a", type: "tool" as const, tool: "test", dependsOn: ["start"], timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "branch-b", type: "tool" as const, tool: "test", dependsOn: ["start"], timeoutMs: 300000, continueOnError: false, retryCount: 0 },
      { name: "end", type: "tool" as const, tool: "test", dependsOn: ["branch-a", "branch-b"], timeoutMs: 300000, continueOnError: false, retryCount: 0 },
    ];

    const batches = topologicalSort(steps);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(1); // start
    expect(batches[1]).toHaveLength(2); // branch-a, branch-b (parallel)
    expect(batches[2]).toHaveLength(1); // end
  });
});

// ─── interpolate ────────────────────────────────────────────────────────────

describe("interpolate", () => {
  const context: InterpolationContext = {
    steps: {
      "fetch-data": { output: "some data result", status: "completed" },
      "summarize": { output: { key: "value" }, status: "completed" },
    },
    variables: { title: "Weekly Report", version: "1.0" },
    env: { NODE_ENV: "production" },
  };

  it("interpolates step output", () => {
    const result = interpolate("Data: {{steps.fetch-data.output}}", context);
    expect(result).toBe("Data: some data result");
  });

  it("interpolates step status", () => {
    const result = interpolate("Status: {{steps.fetch-data.status}}", context);
    expect(result).toBe("Status: completed");
  });

  it("interpolates variables", () => {
    const result = interpolate("Title: {{variables.title}}", context);
    expect(result).toBe("Title: Weekly Report");
  });

  it("interpolates env vars", () => {
    const result = interpolate("Env: {{env.NODE_ENV}}", context);
    expect(result).toBe("Env: production");
  });

  it("serializes object outputs as JSON", () => {
    const result = interpolate("Data: {{steps.summarize.output}}", context);
    expect(result).toBe('Data: {"key":"value"}');
  });

  it("leaves unresolved templates as-is", () => {
    const result = interpolate("Unknown: {{steps.nonexistent.output}}", context);
    expect(result).toBe("Unknown: {{steps.nonexistent.output}}");
  });

  it("handles multiple interpolations", () => {
    const result = interpolate(
      "{{variables.title}} v{{variables.version}} ({{env.NODE_ENV}})",
      context,
    );
    expect(result).toBe("Weekly Report v1.0 (production)");
  });

  it("handles no templates", () => {
    expect(interpolate("plain text", context)).toBe("plain text");
  });

  it("handles vars alias", () => {
    const result = interpolate("{{vars.title}}", context);
    expect(result).toBe("Weekly Report");
  });
});

// ─── interpolateParams ──────────────────────────────────────────────────────

describe("interpolateParams", () => {
  const context: InterpolationContext = {
    steps: { s1: { output: "data" } },
    variables: {},
  };

  it("interpolates string params", () => {
    const result = interpolateParams(
      { message: "Result: {{steps.s1.output}}", count: 42 },
      context,
    );

    expect(result.message).toBe("Result: data");
    expect(result.count).toBe(42); // Non-string unchanged
  });
});
