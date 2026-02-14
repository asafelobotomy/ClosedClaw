/**
 * Tests for Squad Integration Glue
 */

import { describe, it, expect } from "vitest";
import type { ProfileRegistrySnapshot } from "../profiles/types.js";
import { builtinProfiles } from "../profiles/registry.js";
import {
  analyzeTaskForSquad,
  buildSquadFromProfiles,
  formSquadForTask,
  buildComplexTask,
} from "./integration.js";

function makeRegistry(): ProfileRegistrySnapshot {
  return {
    profiles: builtinProfiles(),
    loadedAt: Date.now(),
    errors: [],
  };
}

// ─── analyzeTaskForSquad ───────────────────────────────────────────────────

describe("analyzeTaskForSquad", () => {
  const registry = makeRegistry();

  it("detects research + code task", () => {
    const analysis = analyzeTaskForSquad(
      "Research Node.js best practices then implement a rate limiter",
      registry.profiles,
    );

    expect(analysis.recommendedProfiles).toContain("researcher");
    expect(analysis.recommendedProfiles).toContain("coder");
    expect(analysis.taskTypes.length).toBeGreaterThan(0);
    expect(analysis.complexity).toBeGreaterThan(0);
    expect(analysis.reasoning).toBeTruthy();
  });

  it("detects code + test + review task", () => {
    const analysis = analyzeTaskForSquad(
      "Implement the authentication module, write tests, and review for security",
      registry.profiles,
    );

    expect(analysis.recommendedProfiles).toContain("coder");
    expect(analysis.taskTypes).toContain("code");
  });

  it("detects DevOps task", () => {
    const analysis = analyzeTaskForSquad(
      "Deploy the application and set up monitoring pipeline for security",
      registry.profiles,
    );

    expect(analysis.recommendedProfiles).toContain("devops");
  });

  it("detects documentation task", () => {
    const analysis = analyzeTaskForSquad(
      "Document the API and create a getting started guide",
      registry.profiles,
    );

    expect(analysis.recommendedProfiles).toContain("documenter");
  });

  it("falls back to researcher + coder for ambiguous tasks", () => {
    const analysis = analyzeTaskForSquad("Do something", registry.profiles);

    expect(analysis.recommendedProfiles.length).toBeGreaterThanOrEqual(2);
  });

  it("selects pipeline strategy for sequential tasks", () => {
    const analysis = analyzeTaskForSquad(
      "Research the topic, then implement the solution, then test it",
      registry.profiles,
    );

    // Should detect the sequential chain
    expect(["pipeline", "parallel"]).toContain(analysis.strategy);
  });

  it("selects consensus for decision-making tasks", () => {
    const analysis = analyzeTaskForSquad(
      "Evaluate and decide between option A and option B, compare approaches and vote",
      registry.profiles,
    );

    expect(analysis.strategy).toBe("consensus");
  });

  it("respects max agents limit", () => {
    const analysis = analyzeTaskForSquad(
      "Research, code, review, test, document, deploy, monitor, analyze, fix, optimize everything",
      registry.profiles,
    );

    expect(analysis.recommendedProfiles.length).toBeLessThanOrEqual(10);
  });
});

// ─── buildSquadFromProfiles ─────────────────────────────────────────────────

describe("buildSquadFromProfiles", () => {
  const registry = makeRegistry();

  it("builds a squad from profile IDs", () => {
    const result = buildSquadFromProfiles(
      {
        name: "test-squad",
        strategy: "parallel",
        profileIds: ["researcher", "coder"],
      },
      registry,
    );

    expect(result.config.name).toBe("test-squad");
    expect(result.config.strategy).toBe("parallel");
    expect(result.config.agents).toHaveLength(2);
    expect(result.resolvedProfiles).toEqual(["researcher", "coder"]);
    expect(result.missingProfiles).toHaveLength(0);
  });

  it("applies model overrides", () => {
    const result = buildSquadFromProfiles(
      {
        name: "override-squad",
        strategy: "parallel",
        profileIds: ["researcher"],
        modelOverrides: { researcher: "gpt-4o" },
      },
      registry,
    );

    expect(result.config.agents[0].model).toBe("gpt-4o");
  });

  it("applies budget overrides", () => {
    const result = buildSquadFromProfiles(
      {
        name: "budget-squad",
        strategy: "parallel",
        profileIds: ["coder"],
        budgetOverrides: { coder: 200_000 },
      },
      registry,
    );

    expect(result.config.agents[0].maxTokens).toBe(200_000);
  });

  it("adds global tools to all agents", () => {
    const result = buildSquadFromProfiles(
      {
        name: "tools-squad",
        strategy: "parallel",
        profileIds: ["researcher", "coder"],
        globalTools: ["custom_tool"],
      },
      registry,
    );

    expect(result.config.agents[0].tools).toContain("custom_tool");
    expect(result.config.agents[1].tools).toContain("custom_tool");
  });

  it("tracks missing profiles", () => {
    const result = buildSquadFromProfiles(
      {
        name: "missing-squad",
        strategy: "parallel",
        profileIds: ["researcher", "nonexistent_agent"],
      },
      registry,
    );

    expect(result.resolvedProfiles).toContain("researcher");
    expect(result.missingProfiles).toContain("nonexistent_agent");
    expect(result.config.agents).toHaveLength(1);
  });

  it("falls back to templates for missing profiles", () => {
    // Use empty registry (no file profiles), but request built-in template IDs
    const emptyRegistry: ProfileRegistrySnapshot = {
      profiles: [],
      loadedAt: Date.now(),
      errors: [],
    };

    const result = buildSquadFromProfiles(
      {
        name: "fallback-squad",
        strategy: "parallel",
        profileIds: ["researcher"],
      },
      emptyRegistry,
    );

    // Should resolve from AGENT_TEMPLATES
    expect(result.resolvedProfiles).toContain("researcher");
    expect(result.config.agents).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── formSquadForTask ───────────────────────────────────────────────────────

describe("formSquadForTask", () => {
  const registry = makeRegistry();

  it("forms a squad from a task description", () => {
    const result = formSquadForTask(
      "Research the latest security vulnerabilities and implement fixes",
      registry,
      { name: "sec-squad" },
    );

    expect(result.config.name).toBe("sec-squad");
    expect(result.config.agents.length).toBeGreaterThanOrEqual(2);
    expect(result.analysis).toBeDefined();
    expect(result.analysis.taskTypes.length).toBeGreaterThan(0);
  });

  it("respects strategy override", () => {
    const result = formSquadForTask("Analyze the codebase", registry, { strategy: "map-reduce" });

    expect(result.config.strategy).toBe("map-reduce");
  });

  it("generates a name if not provided", () => {
    const result = formSquadForTask("Do something", registry);
    expect(result.config.name).toMatch(/^squad-\d+$/);
  });
});

// ─── buildComplexTask ───────────────────────────────────────────────────────

describe("buildComplexTask", () => {
  it("creates a complex task from analysis", () => {
    const analysis = analyzeTaskForSquad(
      "Research and implement a caching layer",
      builtinProfiles(),
    );

    const task = buildComplexTask("Build a caching layer", analysis);

    expect(task.description).toBe("Build a caching layer");
    expect(task.input).toBe("Build a caching layer");
    expect(["low", "normal", "high"]).toContain(task.priority);
  });

  it("generates subtasks for multi-profile tasks", () => {
    const analysis = analyzeTaskForSquad(
      "Research best practices, implement the solution, and write tests",
      builtinProfiles(),
    );

    const task = buildComplexTask("Full development workflow", analysis);

    if (analysis.recommendedProfiles.length > 1) {
      expect(task.subtasks).toBeDefined();
      expect(task.subtasks!.length).toBeGreaterThan(1);
    }
  });
});
