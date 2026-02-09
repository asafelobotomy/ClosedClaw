/**
 * Tests for Workflow Executor
 */

import { describe, it, expect, vi } from "vitest";
import {
  executeWorkflow,
  serializeState,
  deserializeState,
  type WorkflowExecutionContext,
} from "./executor.js";
import { parseWorkflowDefinition } from "./schema.js";

function makeContext(overrides: Partial<WorkflowExecutionContext> = {}): WorkflowExecutionContext {
  return {
    toolHandler: vi.fn(async (tool: string, params: Record<string, unknown>) => {
      return { tool, params, result: "ok" };
    }),
    agentHandler: vi.fn(async (agentId: string, prompt: string) => {
      return `Agent ${agentId} response to: ${prompt}`;
    }),
    ...overrides,
  };
}

// ─── Basic Execution ────────────────────────────────────────────────────────

describe("executeWorkflow - basic", () => {
  it("executes a single tool step", async () => {
    const workflow = parseWorkflowDefinition({
      name: "simple",
      steps: [
        { name: "s1", tool: "fetch_data", params: { url: "https://example.com" } },
      ],
    });

    const ctx = makeContext();
    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("completed");
    expect(result.workflowName).toBe("simple");
    expect(result.steps.get("s1")?.status).toBe("completed");
    expect(result.steps.get("s1")?.output).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(ctx.toolHandler).toHaveBeenCalledWith("fetch_data", { url: "https://example.com" });
  });

  it("executes a single agent step", async () => {
    const workflow = parseWorkflowDefinition({
      name: "agent-wf",
      steps: [
        { name: "s1", agent: "main", prompt: "Hello world" },
      ],
    });

    const ctx = makeContext();
    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("completed");
    expect(ctx.agentHandler).toHaveBeenCalledWith("main", "Hello world", { model: undefined });
  });

  it("executes sequential steps with dependencies", async () => {
    const workflow = parseWorkflowDefinition({
      name: "sequential",
      steps: [
        { name: "fetch", tool: "fetch_data", params: { url: "https://api.test" } },
        { name: "summarize", agent: "main", prompt: "Summarize: {{steps.fetch.output}}", dependsOn: ["fetch"] },
        { name: "send", tool: "send_message", params: { message: "{{steps.summarize.output}}" }, dependsOn: ["summarize"] },
      ],
    });

    const ctx = makeContext();
    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("completed");
    expect(result.steps.get("fetch")?.status).toBe("completed");
    expect(result.steps.get("summarize")?.status).toBe("completed");
    expect(result.steps.get("send")?.status).toBe("completed");
  });

  it("executes parallel steps", async () => {
    const workflow = parseWorkflowDefinition({
      name: "parallel",
      steps: [
        { name: "a", tool: "fetch_a" },
        { name: "b", tool: "fetch_b" },
        { name: "c", tool: "fetch_c" },
      ],
    });

    const callOrder: string[] = [];
    const ctx = makeContext({
      toolHandler: vi.fn(async (tool) => {
        callOrder.push(tool);
        return `result from ${tool}`;
      }),
    });

    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("completed");
    expect(callOrder).toHaveLength(3);
    // All should be called (parallel in one batch)
    expect(callOrder).toContain("fetch_a");
    expect(callOrder).toContain("fetch_b");
    expect(callOrder).toContain("fetch_c");
  });
});

// ─── Error Handling ─────────────────────────────────────────────────────────

describe("executeWorkflow - errors", () => {
  it("fails workflow when a step fails", async () => {
    const workflow = parseWorkflowDefinition({
      name: "failing",
      steps: [
        { name: "s1", tool: "bad_tool" },
        { name: "s2", tool: "good_tool", dependsOn: ["s1"] },
      ],
    });

    const ctx = makeContext({
      toolHandler: vi.fn(async (tool) => {
        if (tool === "bad_tool") {throw new Error("Tool failed!");}
        return "ok";
      }),
    });

    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("failed");
    expect(result.steps.get("s1")?.status).toBe("failed");
    expect(result.steps.get("s1")?.error).toBe("Tool failed!");
    expect(result.steps.get("s2")?.status).toBe("skipped");
    expect(result.error).toContain("s1");
  });

  it("continues on error when continueOnError is set", async () => {
    const workflow = parseWorkflowDefinition({
      name: "continue",
      steps: [
        { name: "s1", tool: "bad_tool", continueOnError: true },
        { name: "s2", tool: "good_tool" },
      ],
    });

    const ctx = makeContext({
      toolHandler: vi.fn(async (tool) => {
        if (tool === "bad_tool") {throw new Error("Expected failure");}
        return "ok";
      }),
    });

    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("completed");
    expect(result.steps.get("s1")?.status).toBe("failed");
    expect(result.steps.get("s2")?.status).toBe("completed");
  });

  it("skips dependent steps when a step fails", async () => {
    const workflow = parseWorkflowDefinition({
      name: "skip-deps",
      steps: [
        { name: "root", tool: "test" },
        { name: "a", tool: "test", dependsOn: ["root"] },
        { name: "b", tool: "test", dependsOn: ["a"] },
        { name: "c", tool: "test", dependsOn: ["b"] },
      ],
    });

    const ctx = makeContext({
      toolHandler: vi.fn(async (tool) => {
        // root succeeds, then a fails
        throw new Error("Something went wrong");
      }),
    });

    // Override: root succeeds
    (ctx.toolHandler as ReturnType<typeof vi.fn>).mockImplementation(async () => "ok");
    (ctx.toolHandler as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => "ok"); // root
    (ctx.toolHandler as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new Error("fail");
    });

    // Simpler approach: just make everything after root fail
    const ctx2 = makeContext({
      toolHandler: vi.fn()
        .mockResolvedValueOnce("root ok")     // root
        .mockRejectedValueOnce(new Error("a failed")), // a
    });

    const result = await executeWorkflow(workflow, ctx2);

    expect(result.status).toBe("failed");
    expect(result.steps.get("root")?.status).toBe("completed");
    expect(result.steps.get("a")?.status).toBe("failed");
    // b and c should be skipped since they depend on a
    expect(result.steps.get("b")?.status).toBe("skipped");
    expect(result.steps.get("c")?.status).toBe("skipped");
  });
});

// ─── Events ─────────────────────────────────────────────────────────────────

describe("executeWorkflow - events", () => {
  it("emits workflow and step events", async () => {
    const workflow = parseWorkflowDefinition({
      name: "events-wf",
      steps: [{ name: "s1", tool: "test" }],
    });

    const events: string[] = [];
    const ctx = makeContext({
      onEvent: (event) => events.push(event.type),
    });

    await executeWorkflow(workflow, ctx);

    expect(events).toContain("workflow:start");
    expect(events).toContain("step:start");
    expect(events).toContain("step:complete");
    expect(events).toContain("batch:start");
    expect(events).toContain("batch:complete");
    expect(events).toContain("workflow:complete");
  });
});

// ─── Cancellation ───────────────────────────────────────────────────────────

describe("executeWorkflow - cancellation", () => {
  it("cancels on abort signal", async () => {
    const workflow = parseWorkflowDefinition({
      name: "cancel-wf",
      steps: [
        { name: "s1", tool: "test" },
        { name: "s2", tool: "test", dependsOn: ["s1"] },
      ],
    });

    const controller = new AbortController();

    const ctx = makeContext({
      toolHandler: vi.fn(async () => {
        controller.abort(); // Cancel after first step
        return "ok";
      }),
      signal: controller.signal,
    });

    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("cancelled");
  });
});

// ─── Retry ──────────────────────────────────────────────────────────────────

describe("executeWorkflow - retry", () => {
  it("retries failing steps", async () => {
    const workflow = parseWorkflowDefinition({
      name: "retry-wf",
      steps: [{
        name: "flaky",
        tool: "flaky_tool",
        retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 },
      }],
    });

    let callCount = 0;
    const ctx = makeContext({
      toolHandler: vi.fn(async () => {
        callCount++;
        if (callCount < 3) {throw new Error("Transient error");}
        return "success";
      }),
    });

    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("completed");
    expect(result.steps.get("flaky")?.retryCount).toBe(2);
    expect(callCount).toBe(3); // original + 2 retries
  });

  it("fails after exhausting retries", async () => {
    const workflow = parseWorkflowDefinition({
      name: "exhaust-retry",
      steps: [{
        name: "always-fail",
        tool: "bad",
        retry: { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 },
      }],
    });

    const ctx = makeContext({
      toolHandler: vi.fn(async () => {
        throw new Error("Permanent failure");
      }),
    });

    const result = await executeWorkflow(workflow, ctx);

    expect(result.status).toBe("failed");
    expect(result.steps.get("always-fail")?.retryCount).toBe(1);
  });
});

// ─── Serialization ──────────────────────────────────────────────────────────

describe("serializeState / deserializeState", () => {
  it("round-trips execution state", async () => {
    const workflow = parseWorkflowDefinition({
      name: "serialize-wf",
      steps: [
        { name: "s1", tool: "test" },
        { name: "s2", tool: "test", dependsOn: ["s1"] },
      ],
    });

    const ctx = makeContext();
    const result = await executeWorkflow(workflow, ctx);

    const serialized = serializeState(result);

    expect(serialized.workflowName).toBe("serialize-wf");
    expect(serialized.steps).toHaveLength(2);
    expect(serialized.savedAt).toBeGreaterThan(0);

    const deserialized = deserializeState(serialized);
    expect(deserialized.workflowName).toBe("serialize-wf");
    expect(deserialized.steps.size).toBe(2);
    expect(deserialized.steps.get("s1")?.status).toBe("completed");
    expect(deserialized.steps.get("s2")?.status).toBe("completed");
  });
});
