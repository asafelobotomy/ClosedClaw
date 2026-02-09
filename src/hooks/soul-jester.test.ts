import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SOUL_FILENAME, type WorkspaceBootstrapFile } from "../agents/workspace.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../../test/helpers/workspace.js";
import {
  applySoulJesterOverride,
  decideSoulJester,
  DEFAULT_SOUL_JESTER_FILENAME,
  resolveSoulJesterConfigFromHook,
} from "./soul-jester.js";

const makeFiles = (overrides?: Partial<WorkspaceBootstrapFile>) => [
  {
    name: DEFAULT_SOUL_FILENAME,
    path: "/tmp/SOUL.md",
    content: "friendly",
    missing: false,
    ...overrides,
  },
];

describe("decideSoulJester", () => {
  it("returns false when no config", () => {
    const result = decideSoulJester({});
    expect(result.useJester).toBe(false);
  });

  it("activates on random chance", () => {
    const result = decideSoulJester({
      config: { chance: 0.5 },
      random: () => 0.2,
    });
    expect(result.useJester).toBe(true);
    expect(result.reason).toBe("chance");
  });

  it("activates during purge window", () => {
    const result = decideSoulJester({
      config: {
        purge: { at: "00:00", duration: "10m" },
      },
      userTimezone: "UTC",
      now: new Date("2026-01-01T00:05:00Z"),
    });
    expect(result.useJester).toBe(true);
    expect(result.reason).toBe("purge");
  });

  it("prefers purge window over random chance", () => {
    const result = decideSoulJester({
      config: {
        chance: 0,
        purge: { at: "00:00", duration: "10m" },
      },
      userTimezone: "UTC",
      now: new Date("2026-01-01T00:05:00Z"),
      random: () => 0,
    });
    expect(result.useJester).toBe(true);
    expect(result.reason).toBe("purge");
  });

  it("skips purge window when outside duration", () => {
    const result = decideSoulJester({
      config: {
        purge: { at: "00:00", duration: "10m" },
      },
      userTimezone: "UTC",
      now: new Date("2026-01-01T00:30:00Z"),
    });
    expect(result.useJester).toBe(false);
  });

  it("honors sub-minute purge durations", () => {
    const config = {
      purge: { at: "00:00", duration: "30s" },
    };
    const active = decideSoulJester({
      config,
      userTimezone: "UTC",
      now: new Date("2026-01-01T00:00:20Z"),
    });
    const inactive = decideSoulJester({
      config,
      userTimezone: "UTC",
      now: new Date("2026-01-01T00:00:40Z"),
    });
    expect(active.useJester).toBe(true);
    expect(active.reason).toBe("purge");
    expect(inactive.useJester).toBe(false);
  });

  it("handles purge windows that wrap past midnight", () => {
    const result = decideSoulJester({
      config: {
        purge: { at: "23:55", duration: "10m" },
      },
      userTimezone: "UTC",
      now: new Date("2026-01-02T00:02:00Z"),
    });
    expect(result.useJester).toBe(true);
    expect(result.reason).toBe("purge");
  });

  it("clamps chance above 1", () => {
    const result = decideSoulJester({
      config: { chance: 2 },
      random: () => 0.5,
    });
    expect(result.useJester).toBe(true);
    expect(result.reason).toBe("chance");
  });
});

describe("applySoulJesterOverride", () => {
  it("replaces SOUL content when jester is active and file exists", async () => {
    const tempDir = await makeTempWorkspace("ClosedClaw-soul-");
    await writeWorkspaceFile({
      dir: tempDir,
      name: DEFAULT_SOUL_JESTER_FILENAME,
      content: "chaotic",
    });

    const files = makeFiles({
      path: path.join(tempDir, DEFAULT_SOUL_FILENAME),
    });

    const updated = await applySoulJesterOverride({
      files,
      workspaceDir: tempDir,
      config: { chance: 1 },
      userTimezone: "UTC",
      random: () => 0,
    });

    const soul = updated.find((file) => file.name === DEFAULT_SOUL_FILENAME);
    expect(soul?.content).toBe("chaotic");
  });

  it("leaves SOUL content when jester file is missing", async () => {
    const tempDir = await makeTempWorkspace("ClosedClaw-soul-");
    const files = makeFiles({
      path: path.join(tempDir, DEFAULT_SOUL_FILENAME),
    });

    const updated = await applySoulJesterOverride({
      files,
      workspaceDir: tempDir,
      config: { chance: 1 },
      userTimezone: "UTC",
      random: () => 0,
    });

    const soul = updated.find((file) => file.name === DEFAULT_SOUL_FILENAME);
    expect(soul?.content).toBe("friendly");
  });

  it("uses custom jester filename when configured", async () => {
    const tempDir = await makeTempWorkspace("ClosedClaw-soul-");
    await writeWorkspaceFile({
      dir: tempDir,
      name: "SOUL_JESTER_CUSTOM.md",
      content: "chaotic",
    });

    const files = makeFiles({
      path: path.join(tempDir, DEFAULT_SOUL_FILENAME),
    });

    const updated = await applySoulJesterOverride({
      files,
      workspaceDir: tempDir,
      config: { chance: 1, file: "SOUL_JESTER_CUSTOM.md" },
      userTimezone: "UTC",
      random: () => 0,
    });

    const soul = updated.find((file) => file.name === DEFAULT_SOUL_FILENAME);
    expect(soul?.content).toBe("chaotic");
  });

  it("warns and skips when jester file is empty", async () => {
    const tempDir = await makeTempWorkspace("ClosedClaw-soul-");
    await writeWorkspaceFile({
      dir: tempDir,
      name: DEFAULT_SOUL_JESTER_FILENAME,
      content: " ",
    });

    const warnings: string[] = [];
    const files = makeFiles({
      path: path.join(tempDir, DEFAULT_SOUL_FILENAME),
    });

    const updated = await applySoulJesterOverride({
      files,
      workspaceDir: tempDir,
      config: { chance: 1 },
      userTimezone: "UTC",
      random: () => 0,
      log: { warn: (message) => warnings.push(message) },
    });

    const soul = updated.find((file) => file.name === DEFAULT_SOUL_FILENAME);
    expect(soul?.content).toBe("friendly");
    expect(warnings.some((message) => message.includes("file empty"))).toBe(true);
  });

  it("leaves files untouched when SOUL.md is not in bootstrap files", async () => {
    const tempDir = await makeTempWorkspace("ClosedClaw-soul-");
    await writeWorkspaceFile({
      dir: tempDir,
      name: DEFAULT_SOUL_JESTER_FILENAME,
      content: "chaotic",
    });

    const files: WorkspaceBootstrapFile[] = [
      {
        name: "AGENTS.md",
        path: path.join(tempDir, "AGENTS.md"),
        content: "agents",
        missing: false,
      },
    ];

    const updated = await applySoulJesterOverride({
      files,
      workspaceDir: tempDir,
      config: { chance: 1 },
      userTimezone: "UTC",
      random: () => 0,
    });

    expect(updated).toEqual(files);
  });
});

describe("resolveSoulJesterConfigFromHook", () => {
  it("returns null and warns when config is invalid", () => {
    const warnings: string[] = [];
    const result = resolveSoulJesterConfigFromHook(
      { file: 42, chance: "nope", purge: "later" },
      { warn: (message) => warnings.push(message) },
    );
    expect(result).toBeNull();
    expect(warnings).toEqual([
      "soul-jester config: file must be a string",
      "soul-jester config: chance must be a number",
      "soul-jester config: purge must be an object",
    ]);
  });
});
