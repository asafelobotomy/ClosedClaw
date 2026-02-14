/**
 * Tests for Agent Profile Registry
 */

import { describe, it, expect } from "vitest";
import type { AgentProfile, ProfileRegistryConfig } from "./types.js";
import { AGENT_TEMPLATES, DEVOPS_TEMPLATE, RESEARCHER_TEMPLATE } from "../squad/templates.js";
import {
  parseProfileMarkdown,
  parseSimpleYaml,
  templateToProfile,
  builtinProfiles,
  fileToProfile,
  mergeWithTemplate,
  loadProfileRegistry,
  resolveProfile,
  findProfilesByCapability,
  validateProfile,
} from "./registry.js";

// ─── parseSimpleYaml ────────────────────────────────────────────────────────

describe("parseSimpleYaml", () => {
  it("parses key-value pairs", () => {
    const result = parseSimpleYaml("name: DevOps Agent\nmodel: claude-opus-4");
    expect(result).toEqual({ name: "DevOps Agent", model: "claude-opus-4" });
  });

  it("parses numbers", () => {
    const result = parseSimpleYaml("tokenBudget: 50000\nweight: 0.5");
    expect(result).toEqual({ tokenBudget: 50000, weight: 0.5 });
  });

  it("parses booleans", () => {
    const result = parseSimpleYaml("enabled: true\nverbose: false");
    expect(result).toEqual({ enabled: true, verbose: false });
  });

  it("parses arrays", () => {
    const result = parseSimpleYaml("tools: [read, exec, grep_search]");
    expect(result).toEqual({ tools: ["read", "exec", "grep_search"] });
  });

  it("parses empty arrays", () => {
    const result = parseSimpleYaml("tools: []");
    expect(result).toEqual({ tools: [] });
  });

  it("parses quoted strings", () => {
    const result = parseSimpleYaml('name: "My Agent"');
    expect(result).toEqual({ name: "My Agent" });
  });

  it("skips comments and blank lines", () => {
    const result = parseSimpleYaml("# comment\nname: test\n\n# another\nval: 1");
    expect(result).toEqual({ name: "test", val: 1 });
  });

  it("handles arrays with quoted elements", () => {
    const result = parseSimpleYaml('caps: ["research", "analysis"]');
    expect(result).toEqual({ caps: ["research", "analysis"] });
  });
});

// ─── parseProfileMarkdown ───────────────────────────────────────────────────

describe("parseProfileMarkdown", () => {
  it("parses frontmatter + content", () => {
    const raw = `---
name: Test Agent
model: claude-opus-4
tools: [read, write]
---

# Test Agent

You are a test agent.`;

    const result = parseProfileMarkdown(raw);
    expect(result.frontmatter).toEqual({
      name: "Test Agent",
      model: "claude-opus-4",
      tools: ["read", "write"],
    });
    expect(result.content).toContain("# Test Agent");
    expect(result.content).toContain("You are a test agent.");
  });

  it("handles no frontmatter", () => {
    const raw = "# Simple Agent\n\nJust a prompt.";
    const result = parseProfileMarkdown(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe("# Simple Agent\n\nJust a prompt.");
  });

  it("handles empty content after frontmatter", () => {
    const raw = "---\nname: Empty\n---\n";
    const result = parseProfileMarkdown(raw);
    expect(result.frontmatter).toEqual({ name: "Empty" });
    expect(result.content).toBe("");
  });
});

// ─── templateToProfile ──────────────────────────────────────────────────────

describe("templateToProfile", () => {
  it("converts a template to a profile", () => {
    const profile = templateToProfile(RESEARCHER_TEMPLATE);

    expect(profile.id).toBe("researcher");
    expect(profile.name).toBe("Researcher");
    expect(profile.source).toBe("template");
    expect(profile.tools.allow).toContain("web_search");
    expect(profile.capabilities).toContain("research");
    expect(profile.tokenBudget).toBe(50_000);
    expect(profile.loadedAt).toBeGreaterThan(0);
  });

  it("converts devops template", () => {
    const profile = templateToProfile(DEVOPS_TEMPLATE);

    expect(profile.id).toBe("devops");
    expect(profile.capabilities).toContain("devops");
    expect(profile.capabilities).toContain("security");
    expect(profile.tokenBudget).toBe(75_000);
  });
});

// ─── builtinProfiles ────────────────────────────────────────────────────────

describe("builtinProfiles", () => {
  it("returns all built-in templates as profiles", () => {
    const profiles = builtinProfiles();

    expect(profiles.length).toBe(Object.keys(AGENT_TEMPLATES).length);

    const ids = profiles.map((p) => p.id);
    expect(ids).toContain("researcher");
    expect(ids).toContain("coder");
    expect(ids).toContain("reviewer");
    expect(ids).toContain("tester");
    expect(ids).toContain("documenter");
    expect(ids).toContain("devops");
  });

  it("all profiles have required fields", () => {
    const profiles = builtinProfiles();
    for (const p of profiles) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.systemPrompt).toBeTruthy();
      expect(p.tools.allow.length).toBeGreaterThan(0);
      expect(p.source).toBe("template");
    }
  });
});

// ─── fileToProfile ──────────────────────────────────────────────────────────

describe("fileToProfile", () => {
  it("creates a profile from parsed markdown", () => {
    const parsed = parseProfileMarkdown(`---
name: Custom Agent
model: claude-opus-4
tools: [read, exec, web_search]
capabilities: [research, security]
tokenBudget: 100000
description: My custom agent
---

# Custom Agent

You are a custom security researcher.`);

    const profile = fileToProfile("custom", parsed, "/path/to/custom.md");

    expect(profile.id).toBe("custom");
    expect(profile.name).toBe("Custom Agent");
    expect(profile.source).toBe("file");
    expect(profile.model).toBe("claude-opus-4");
    expect(profile.tools.allow).toEqual(["read", "exec", "web_search"]);
    expect(profile.capabilities).toEqual(["research", "security"]);
    expect(profile.tokenBudget).toBe(100000);
    expect(profile.filePath).toBe("/path/to/custom.md");
  });

  it("extracts name from heading if not in frontmatter", () => {
    const parsed = parseProfileMarkdown("# My Agent Name\n\nSome prompt.");
    const profile = fileToProfile("myagent", parsed, "/path/to/myagent.md");
    expect(profile.name).toBe("My Agent Name");
  });

  it("uses id as name fallback", () => {
    const parsed = parseProfileMarkdown("No heading, just a prompt.");
    const profile = fileToProfile("fallback", parsed, "/path/to/fallback.md");
    expect(profile.name).toBe("fallback");
  });

  it("parses deny tools", () => {
    const parsed = parseProfileMarkdown(`---
tools: [read, exec, write]
deny_tools: [exec]
---
Prompt.`);

    const profile = fileToProfile("restricted", parsed, "/path.md");
    expect(profile.tools.allow).toEqual(["read", "exec", "write"]);
    expect(profile.tools.deny).toEqual(["exec"]);
  });
});

// ─── mergeWithTemplate ──────────────────────────────────────────────────────

describe("mergeWithTemplate", () => {
  it("merges file profile with matching template", () => {
    const parsed = parseProfileMarkdown(`---
name: Custom Researcher
model: claude-opus-4
---

# Enhanced Researcher

You are an enhanced researcher with extra capabilities.`);

    const fileProfile = fileToProfile("researcher", parsed, "/path/researcher.md");
    const merged = mergeWithTemplate(fileProfile, RESEARCHER_TEMPLATE);

    expect(merged.source).toBe("composite");
    expect(merged.name).toBe("Custom Researcher");
    expect(merged.model).toBe("claude-opus-4");
    // Tools should fall back to template since file has none
    expect(merged.tools.allow).toEqual(RESEARCHER_TEMPLATE.tools);
    // Capabilities should fall back to template since file only has default
    expect(merged.capabilities).toEqual(RESEARCHER_TEMPLATE.capabilities);
    expect(merged.systemPrompt).toContain("Enhanced Researcher");
  });

  it("preserves file tools when provided", () => {
    const parsed = parseProfileMarkdown(`---
tools: [custom_tool, read]
---
Prompt.`);

    const fileProfile = fileToProfile("researcher", parsed, "/path.md");
    const merged = mergeWithTemplate(fileProfile, RESEARCHER_TEMPLATE);
    expect(merged.tools.allow).toEqual(["custom_tool", "read"]);
  });
});

// ─── loadProfileRegistry ────────────────────────────────────────────────────

describe("loadProfileRegistry", () => {
  it("loads profiles from directory and merges with builtins", async () => {
    const mockReadDir = async () => ["custom.md", "researcher.md"];
    const mockReadFile = async (path: string) => {
      if (path.includes("custom.md")) {
        return `---\nname: Custom\ntools: [read]\n---\nCustom prompt.`;
      }
      if (path.includes("researcher.md")) {
        return `---\nname: Enhanced Researcher\nmodel: gpt-4\n---\nBetter researcher.`;
      }
      throw new Error("Not found");
    };

    const config: ProfileRegistryConfig = {
      profileDir: "/home/test/.closedclaw/agents",
      includeBuiltins: true,
    };

    const snapshot = await loadProfileRegistry(config, mockReadDir, mockReadFile);

    // Should have custom + all builtins (researcher merged, not duplicated)
    const ids = snapshot.profiles.map((p) => p.id);
    expect(ids).toContain("custom");
    expect(ids).toContain("researcher");
    expect(ids).toContain("coder");
    expect(ids).toContain("devops");

    // Researcher should be composite (merged with template)
    const researcher = snapshot.profiles.find((p) => p.id === "researcher");
    expect(researcher?.source).toBe("composite");
    expect(researcher?.model).toBe("gpt-4");

    // Custom should be file-based
    const custom = snapshot.profiles.find((p) => p.id === "custom");
    expect(custom?.source).toBe("file");

    expect(snapshot.errors).toHaveLength(0);
  });

  it("handles missing directory gracefully", async () => {
    const mockReadDir = async () => {
      throw new Error("ENOENT");
    };
    const mockReadFile = async () => "";

    const snapshot = await loadProfileRegistry(
      { profileDir: "/nonexistent", includeBuiltins: true },
      mockReadDir,
      mockReadFile,
    );

    // Should still have all builtins
    expect(snapshot.profiles.length).toBe(Object.keys(AGENT_TEMPLATES).length);
    expect(snapshot.errors).toHaveLength(0);
  });

  it("records errors for unreadable files", async () => {
    const mockReadDir = async () => ["bad.md"];
    const mockReadFile = async () => {
      throw new Error("Permission denied");
    };

    const snapshot = await loadProfileRegistry(
      { profileDir: "/test", includeBuiltins: false },
      mockReadDir,
      mockReadFile,
    );

    expect(snapshot.profiles).toHaveLength(0);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0].error).toBe("Permission denied");
  });

  it("excludes builtins when configured", async () => {
    const snapshot = await loadProfileRegistry(
      { profileDir: "/test", includeBuiltins: false },
      async () => [],
      async () => "",
    );

    expect(snapshot.profiles).toHaveLength(0);
  });
});

// ─── resolveProfile ─────────────────────────────────────────────────────────

describe("resolveProfile", () => {
  it("finds a profile by ID", async () => {
    const snapshot = await loadProfileRegistry(
      { profileDir: "/test", includeBuiltins: true },
      async () => [],
      async () => "",
    );

    const profile = resolveProfile(snapshot, "coder");
    expect(profile).toBeDefined();
    expect(profile!.id).toBe("coder");
  });

  it("returns undefined for unknown ID", async () => {
    const snapshot = await loadProfileRegistry(
      { profileDir: "/test", includeBuiltins: true },
      async () => [],
      async () => "",
    );

    expect(resolveProfile(snapshot, "nonexistent")).toBeUndefined();
  });
});

// ─── findProfilesByCapability ───────────────────────────────────────────────

describe("findProfilesByCapability", () => {
  it("finds profiles matching capabilities", async () => {
    const snapshot = await loadProfileRegistry(
      { profileDir: "/test", includeBuiltins: true },
      async () => [],
      async () => "",
    );

    const matches = findProfilesByCapability(snapshot, ["security"]);
    const ids = matches.map((p) => p.id);
    expect(ids).toContain("devops");
  });

  it("returns empty for unmatched capability", async () => {
    const snapshot = await loadProfileRegistry(
      { profileDir: "/test", includeBuiltins: true },
      async () => [],
      async () => "",
    );

    const matches = findProfilesByCapability(snapshot, ["quantum-computing"]);
    expect(matches).toHaveLength(0);
  });
});

// ─── validateProfile ────────────────────────────────────────────────────────

describe("validateProfile", () => {
  it("returns empty for valid profile", () => {
    const profile = templateToProfile(RESEARCHER_TEMPLATE);
    expect(validateProfile(profile)).toEqual([]);
  });

  it("detects missing system prompt", () => {
    const profile: AgentProfile = {
      id: "test",
      name: "Test",
      description: "Test",
      source: "file",
      systemPrompt: "",
      tools: { allow: ["read"] },
      tokenBudget: 50000,
      capabilities: ["test"],
      loadedAt: Date.now(),
    };

    const issues = validateProfile(profile);
    expect(issues).toContain("Missing system prompt");
  });

  it("detects empty tool list", () => {
    const profile: AgentProfile = {
      id: "test",
      name: "Test",
      description: "Test",
      source: "file",
      systemPrompt: "Prompt",
      tools: { allow: [] },
      tokenBudget: 50000,
      capabilities: ["test"],
      loadedAt: Date.now(),
    };

    const issues = validateProfile(profile);
    expect(issues.some((i) => i.includes("No tools"))).toBe(true);
  });

  it("detects invalid token budget", () => {
    const profile: AgentProfile = {
      id: "test",
      name: "Test",
      description: "Test",
      source: "file",
      systemPrompt: "Prompt",
      tools: { allow: ["read"] },
      tokenBudget: -1,
      capabilities: ["test"],
      loadedAt: Date.now(),
    };

    const issues = validateProfile(profile);
    expect(issues.some((i) => i.includes("token budget"))).toBe(true);
  });
});
