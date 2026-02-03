import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".ClosedClaw"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", ClosedClaw_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".ClosedClaw-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", ClosedClaw_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".ClosedClaw"));
  });

  it("uses ClosedClaw_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", ClosedClaw_STATE_DIR: "/var/lib/ClosedClaw" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/ClosedClaw"));
  });

  it("expands ~ in ClosedClaw_STATE_DIR", () => {
    const env = { HOME: "/Users/test", ClosedClaw_STATE_DIR: "~/ClosedClaw-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/ClosedClaw-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { ClosedClaw_STATE_DIR: "C:\\State\\ClosedClaw" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\ClosedClaw");
  });
});
