/**
 * Tests for agent templates.
 *
 * @see {@link ./templates.ts}
 */

import { describe, it, expect } from "vitest";
import {
  getAgentTemplate,
  listTemplateIds,
  spawnConfigFromTemplate,
  findTemplatesByCapability,
  AGENT_TEMPLATES,
  RESEARCHER_TEMPLATE,
  CODER_TEMPLATE,
  REVIEWER_TEMPLATE,
  TESTER_TEMPLATE,
  DOCUMENTER_TEMPLATE,
  DEVOPS_TEMPLATE,
} from "./templates.js";

// ─── Template Registry ─────────────────────────────────────────────────────

describe("AGENT_TEMPLATES", () => {
  it("has all 6 built-in templates", () => {
    expect(Object.keys(AGENT_TEMPLATES)).toHaveLength(6);
    expect(Object.keys(AGENT_TEMPLATES).toSorted()).toEqual([
      "coder",
      "devops",
      "documenter",
      "researcher",
      "reviewer",
      "tester",
    ]);
  });

  it("each template has required fields", () => {
    for (const [id, template] of Object.entries(AGENT_TEMPLATES)) {
      expect(template.id, `${id} missing id`).toBe(id);
      expect(template.name, `${id} missing name`).toBeTruthy();
      expect(template.description, `${id} missing description`).toBeTruthy();
      expect(template.systemPrompt, `${id} missing systemPrompt`).toBeTruthy();
      expect(template.tools.length, `${id} should have tools`).toBeGreaterThan(0);
      expect(template.defaultTokenBudget, `${id} missing budget`).toBeGreaterThan(0);
      expect(template.capabilities.length, `${id} should have capabilities`).toBeGreaterThan(0);
      expect(template.examples.length, `${id} should have examples`).toBeGreaterThan(0);
    }
  });

  it("all templates include squad collaboration tools", () => {
    for (const template of Object.values(AGENT_TEMPLATES)) {
      expect(template.tools, `${template.id} missing squad_memory_write`).toContain("squad_memory_write");
      expect(template.tools, `${template.id} missing squad_memory_read`).toContain("squad_memory_read");
      expect(template.tools, `${template.id} missing squad_broadcast`).toContain("squad_broadcast");
    }
  });
});

// ─── Individual templates ──────────────────────────────────────────────────

describe("individual templates", () => {
  it("RESEARCHER_TEMPLATE has search tooling", () => {
    expect(RESEARCHER_TEMPLATE.tools).toContain("web_search");
    expect(RESEARCHER_TEMPLATE.tools).toContain("web_fetch");
    expect(RESEARCHER_TEMPLATE.capabilities).toContain("research");
    expect(RESEARCHER_TEMPLATE.defaultTokenBudget).toBe(50_000);
  });

  it("CODER_TEMPLATE has file + shell tooling", () => {
    expect(CODER_TEMPLATE.tools).toContain("read_file");
    expect(CODER_TEMPLATE.tools).toContain("write_file");
    expect(CODER_TEMPLATE.tools).toContain("bash");
    expect(CODER_TEMPLATE.capabilities).toContain("code");
    expect(CODER_TEMPLATE.defaultTokenBudget).toBe(100_000);
  });

  it("REVIEWER_TEMPLATE has read-only + search tooling", () => {
    expect(REVIEWER_TEMPLATE.tools).toContain("read_file");
    expect(REVIEWER_TEMPLATE.tools).toContain("grep");
    expect(REVIEWER_TEMPLATE.capabilities).toContain("review");
    expect(REVIEWER_TEMPLATE.capabilities).toContain("security");
  });

  it("TESTER_TEMPLATE has file + shell tooling for test execution", () => {
    expect(TESTER_TEMPLATE.tools).toContain("read_file");
    expect(TESTER_TEMPLATE.tools).toContain("write_file");
    expect(TESTER_TEMPLATE.tools).toContain("bash");
    expect(TESTER_TEMPLATE.capabilities).toContain("test");
    expect(TESTER_TEMPLATE.capabilities).toContain("testing");
  });

  it("DOCUMENTER_TEMPLATE has read/write tooling", () => {
    expect(DOCUMENTER_TEMPLATE.tools).toContain("read_file");
    expect(DOCUMENTER_TEMPLATE.tools).toContain("write_file");
    expect(DOCUMENTER_TEMPLATE.capabilities).toContain("documentation");
  });

  it("DEVOPS_TEMPLATE has infrastructure tooling", () => {
    expect(DEVOPS_TEMPLATE.tools).toContain("bash");
    expect(DEVOPS_TEMPLATE.tools).toContain("grep");
    expect(DEVOPS_TEMPLATE.capabilities).toContain("devops");
    expect(DEVOPS_TEMPLATE.capabilities).toContain("deployment");
    expect(DEVOPS_TEMPLATE.defaultTokenBudget).toBe(75_000);
  });
});

// ─── getAgentTemplate ──────────────────────────────────────────────────────

describe("getAgentTemplate", () => {
  it("returns template by ID", () => {
    const template = getAgentTemplate("coder");
    expect(template.id).toBe("coder");
    expect(template.name).toBe("Coder");
  });

  it("throws for unknown template", () => {
    expect(() => getAgentTemplate("unknown")).toThrow('Unknown agent template "unknown"');
  });

  it("error lists available templates", () => {
    try {
      getAgentTemplate("nonexistent");
    } catch (e) {
      expect((e as Error).message).toContain("researcher");
      expect((e as Error).message).toContain("coder");
    }
  });
});

// ─── listTemplateIds ───────────────────────────────────────────────────────

describe("listTemplateIds", () => {
  it("returns all template IDs", () => {
    const ids = listTemplateIds();
    expect(ids).toContain("researcher");
    expect(ids).toContain("coder");
    expect(ids).toContain("reviewer");
    expect(ids).toContain("tester");
    expect(ids).toContain("documenter");
    expect(ids).toContain("devops");
  });
});

// ─── spawnConfigFromTemplate ──────────────────────────────────────────────

describe("spawnConfigFromTemplate", () => {
  it("creates spawn config with template defaults", () => {
    const config = spawnConfigFromTemplate("researcher", { squadId: "squad-1" });

    expect(config.role).toBe("researcher");
    expect(config.squadId).toBe("squad-1");
    expect(config.name).toBe("Researcher");
    expect(config.profile).toBe(RESEARCHER_TEMPLATE.systemPrompt);
    expect(config.maxTokens).toBe(50_000);
    expect(config.tools).toEqual(RESEARCHER_TEMPLATE.tools);
  });

  it("overrides model", () => {
    const config = spawnConfigFromTemplate("coder", {
      squadId: "squad-1",
      model: "claude-3-opus",
    });
    expect(config.model).toBe("claude-3-opus");
  });

  it("overrides maxTokens", () => {
    const config = spawnConfigFromTemplate("coder", {
      squadId: "squad-1",
      maxTokens: 200_000,
    });
    expect(config.maxTokens).toBe(200_000);
  });

  it("merges extraTools", () => {
    const config = spawnConfigFromTemplate("reviewer", {
      squadId: "squad-1",
      extraTools: ["custom_lint", "security_scan"],
    });

    expect(config.tools).toContain("custom_lint");
    expect(config.tools).toContain("security_scan");
    // Also has original tools
    expect(config.tools).toContain("read_file");
    expect(config.tools).toContain("grep");
  });

  it("passes through environment", () => {
    const config = spawnConfigFromTemplate("devops", {
      squadId: "squad-1",
      environment: { AWS_REGION: "us-east-1" },
    });
    expect(config.environment).toEqual({ AWS_REGION: "us-east-1" });
  });

  it("throws for unknown template", () => {
    expect(() =>
      spawnConfigFromTemplate("fake", { squadId: "squad-1" }),
    ).toThrow("Unknown agent template");
  });
});

// ─── findTemplatesByCapability ─────────────────────────────────────────────

describe("findTemplatesByCapability", () => {
  it("finds templates by single capability", () => {
    const results = findTemplatesByCapability(["research"]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("researcher");
  });

  it("finds templates by multiple capabilities", () => {
    const results = findTemplatesByCapability(["code", "review"]);
    expect(results.map((t) => t.id).toSorted()).toEqual(["coder", "reviewer"]);
  });

  it("returns empty array for unknown capability", () => {
    const results = findTemplatesByCapability(["teleportation"]);
    expect(results).toHaveLength(0);
  });

  it("deduplicates when template matches multiple capabilities", () => {
    const results = findTemplatesByCapability(["devops", "deployment", "security"]);
    // devops template has all three — should appear once
    const devopsMatches = results.filter((t) => t.id === "devops");
    expect(devopsMatches).toHaveLength(1);
  });

  it("security capability matches both reviewer and devops", () => {
    const results = findTemplatesByCapability(["security"]);
    const ids = results.map((t) => t.id).toSorted();
    expect(ids).toContain("devops");
    expect(ids).toContain("reviewer");
  });
});
