import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "ClosedClaw",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "ClosedClaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "ClosedClaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "ClosedClaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "ClosedClaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "ClosedClaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "ClosedClaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "ClosedClaw", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "ClosedClaw", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".ClosedClaw-dev");
    expect(env.ClosedClaw_PROFILE).toBe("dev");
    expect(env.ClosedClaw_STATE_DIR).toBe(expectedStateDir);
    expect(env.ClosedClaw_CONFIG_PATH).toBe(path.join(expectedStateDir, "ClosedClaw.json"));
    expect(env.ClosedClaw_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      ClosedClaw_STATE_DIR: "/custom",
      ClosedClaw_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.ClosedClaw_STATE_DIR).toBe("/custom");
    expect(env.ClosedClaw_GATEWAY_PORT).toBe("19099");
    expect(env.ClosedClaw_CONFIG_PATH).toBe(path.join("/custom", "ClosedClaw.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("ClosedClaw doctor --fix", {})).toBe("ClosedClaw doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("ClosedClaw doctor --fix", { ClosedClaw_PROFILE: "default" })).toBe(
      "ClosedClaw doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("ClosedClaw doctor --fix", { ClosedClaw_PROFILE: "Default" })).toBe(
      "ClosedClaw doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("ClosedClaw doctor --fix", { ClosedClaw_PROFILE: "bad profile" })).toBe(
      "ClosedClaw doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("ClosedClaw --profile work doctor --fix", { ClosedClaw_PROFILE: "work" }),
    ).toBe("ClosedClaw --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("ClosedClaw --dev doctor", { ClosedClaw_PROFILE: "dev" })).toBe(
      "ClosedClaw --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("ClosedClaw doctor --fix", { ClosedClaw_PROFILE: "work" })).toBe(
      "ClosedClaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(
      formatCliCommand("ClosedClaw doctor --fix", { ClosedClaw_PROFILE: "  jbClosedClaw  " }),
    ).toBe("ClosedClaw --profile jbClosedClaw doctor --fix");
  });

  it("handles command with no args after ClosedClaw", () => {
    expect(formatCliCommand("ClosedClaw", { ClosedClaw_PROFILE: "test" })).toBe(
      "ClosedClaw --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm ClosedClaw doctor", { ClosedClaw_PROFILE: "work" })).toBe(
      "pnpm ClosedClaw --profile work doctor",
    );
  });
});
