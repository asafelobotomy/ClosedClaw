import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "ClosedClaw", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "ClosedClaw", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "ClosedClaw", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "ClosedClaw", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "ClosedClaw", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "ClosedClaw", "status", "--", "ignored"], 2)).toEqual([
      "status",
    ]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "ClosedClaw", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "ClosedClaw"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "ClosedClaw", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "ClosedClaw", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "ClosedClaw", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "ClosedClaw", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "ClosedClaw", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "ClosedClaw", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "ClosedClaw", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "ClosedClaw", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "ClosedClaw", "status", "--debug"])).toBe(false);
    expect(
      getVerboseFlag(["node", "ClosedClaw", "status", "--debug"], { includeDebug: true }),
    ).toBe(true);
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "ClosedClaw", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "ClosedClaw", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "ClosedClaw", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "ClosedClaw", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["node", "ClosedClaw", "status"],
    });
    expect(nodeArgv).toEqual(["node", "ClosedClaw", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["node-22", "ClosedClaw", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "ClosedClaw", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["node-22.2.0.exe", "ClosedClaw", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "ClosedClaw", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["node-22.2", "ClosedClaw", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "ClosedClaw", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["node-22.2.exe", "ClosedClaw", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "ClosedClaw", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["/usr/bin/node-22.2.0", "ClosedClaw", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "ClosedClaw", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["nodejs", "ClosedClaw", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "ClosedClaw", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["node-dev", "ClosedClaw", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual([
      "node",
      "ClosedClaw",
      "node-dev",
      "ClosedClaw",
      "status",
    ]);

    const directArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["ClosedClaw", "status"],
    });
    expect(directArgv).toEqual(["node", "ClosedClaw", "status"]);

    const bunArgv = buildParseArgv({
      programName: "ClosedClaw",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "ClosedClaw",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "ClosedClaw", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "ClosedClaw", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "ClosedClaw", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "ClosedClaw", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "ClosedClaw", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "ClosedClaw", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "ClosedClaw", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "ClosedClaw", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
