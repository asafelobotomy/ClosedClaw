import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempWorkspace } from "../../test/helpers/workspace.js";
import {
  clearInternalHooks,
  registerInternalHook,
  type AgentBootstrapHookContext,
} from "../hooks/internal-hooks.js";
import { resolveBootstrapContextForRun, resolveBootstrapFilesForRun } from "./bootstrap-files.js";

describe("resolveBootstrapFilesForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("applies bootstrap hook overrides", async () => {
    registerInternalHook("agent:bootstrap", (event) => {
      const context = event.context as AgentBootstrapHookContext;
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: "EXTRA.md",
          path: path.join(context.workspaceDir, "EXTRA.md"),
          content: "extra",
          missing: false,
        },
      ];
    });

    const workspaceDir = await makeTempWorkspace("ClosedClaw-bootstrap-");
    const files = await resolveBootstrapFilesForRun({ workspaceDir });

    expect(files.some((file) => file.name === "EXTRA.md")).toBe(true);
  });
});

describe("resolveBootstrapContextForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("returns context files for hook-adjusted bootstrap files", async () => {
    registerInternalHook("agent:bootstrap", (event) => {
      const context = event.context as AgentBootstrapHookContext;
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: "EXTRA.md",
          path: path.join(context.workspaceDir, "EXTRA.md"),
          content: "extra",
          missing: false,
        },
      ];
    });

    const workspaceDir = await makeTempWorkspace("ClosedClaw-bootstrap-");
    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const extra = result.contextFiles.find((file) => file.path === "EXTRA.md");

    expect(extra?.content).toBe("extra");
  });

  it("accepts provider and modelId for model-adaptive budget calculation", async () => {
    const workspaceDir = await makeTempWorkspace("ClosedClaw-bootstrap-context-");

    // With a small model, budget should be smaller
    const resultSmall = await resolveBootstrapContextForRun({
      workspaceDir,
      provider: "ollama",
      modelId: "qwen3:8b",
    });

    // With a large model, budget should be larger
    const resultLarge = await resolveBootstrapContextForRun({
      workspaceDir,
      provider: "anthropic",
      modelId: "claude-opus-4-5",
    });

    // The contextFiles should exist in both cases
    expect(resultSmall.contextFiles).toBeDefined();
    expect(resultLarge.contextFiles).toBeDefined();
    // We can't easily test the exact budget, but at least verify it doesn't crash
  });

  it("accepts contextWindow override for custom context budgets", async () => {
    const workspaceDir = await makeTempWorkspace("ClosedClaw-bootstrap-context-window-");

    // With small context window
    const resultSmall = await resolveBootstrapContextForRun({
      workspaceDir,
      provider: "ollama",
      modelId: "custom-model",
      contextWindow: 4096,
    });

    // With large context window
    const resultLarge = await resolveBootstrapContextForRun({
      workspaceDir,
      provider: "ollama",
      modelId: "custom-model",
      contextWindow: 128000,
    });

    // Both should work without errors
    expect(resultSmall.contextFiles).toBeDefined();
    expect(resultLarge.contextFiles).toBeDefined();
  });
});
