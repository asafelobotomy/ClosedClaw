import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { note, runCommandWithTimeout, resolveClosedClawPackageRoot } = vi.hoisted(() => {
  return {
    note: vi.fn(),
    runCommandWithTimeout: vi.fn(),
    resolveClosedClawPackageRoot: vi.fn(),
  };
});

vi.mock("../terminal/note.js", () => ({ note }));
vi.mock("../process/exec.js", () => ({ runCommandWithTimeout }));
vi.mock("../infra/closedclaw-root.js", () => ({ resolveClosedClawPackageRoot }));

import { maybeRepairUiProtocolFreshness } from "./doctor-ui.js";

describe("doctor ui freshness", () => {
  beforeEach(() => {
    note.mockClear();
    runCommandWithTimeout.mockReset();
    resolveClosedClawPackageRoot.mockReset();
  });

  it("does nothing when UI assets are fresh", async () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), "ui-fresh-"));
    const schemaPath = path.join(root, "src", "gateway", "protocol", "schema.ts");
    const uiIndexPath = path.join(root, "dist", "control-ui", "index.html");

    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.mkdirSync(path.dirname(uiIndexPath), { recursive: true });
    fs.writeFileSync(schemaPath, "export const x = 1;", "utf-8");
    fs.writeFileSync(uiIndexPath, "<html></html>", "utf-8");

    const uiMtime = new Date(Date.now());
    const schemaMtime = new Date(uiMtime.getTime() - 10_000);
    fs.utimesSync(schemaPath, schemaMtime, schemaMtime);
    fs.utimesSync(uiIndexPath, uiMtime, uiMtime);

    resolveClosedClawPackageRoot.mockResolvedValue(root);
    runCommandWithTimeout.mockReset();

    const prompter = {
      confirmAggressive: vi.fn(),
      confirm: vi.fn(),
      confirmRepair: vi.fn(),
    } as unknown as Parameters<typeof maybeRepairUiProtocolFreshness>[1];

    await maybeRepairUiProtocolFreshness({} as never, prompter);

    expect(note).not.toHaveBeenCalled();
    expect(runCommandWithTimeout).not.toHaveBeenCalled();

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("warns about stale UI when git is unavailable", async () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), "ui-stale-"));
    const schemaPath = path.join(root, "src", "gateway", "protocol", "schema.ts");
    const uiIndexPath = path.join(root, "dist", "control-ui", "index.html");

    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.mkdirSync(path.dirname(uiIndexPath), { recursive: true });
    fs.writeFileSync(schemaPath, "export const x = 1;", "utf-8");
    fs.writeFileSync(uiIndexPath, "<html></html>", "utf-8");

    const schemaMtime = new Date(Date.now());
    const uiMtime = new Date(schemaMtime.getTime() - 10_000);
    fs.utimesSync(schemaPath, schemaMtime, schemaMtime);
    fs.utimesSync(uiIndexPath, uiMtime, uiMtime);

    resolveClosedClawPackageRoot.mockResolvedValue(root);
    runCommandWithTimeout.mockRejectedValue(new Error("git missing"));

    const prompter = {
      confirmAggressive: vi.fn().mockResolvedValue(false),
      confirm: vi.fn(),
      confirmRepair: vi.fn(),
    } as unknown as Parameters<typeof maybeRepairUiProtocolFreshness>[1];

    await maybeRepairUiProtocolFreshness({} as never, prompter);

    const messages = note.mock.calls.map((c) => String(c[0])).join("\n");
    expect(messages).toContain("Could not inspect git history");

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rebuilds stale UI when confirmed and git log is available", async () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), "ui-rebuild-"));
    const schemaPath = path.join(root, "src", "gateway", "protocol", "schema.ts");
    const uiIndexPath = path.join(root, "dist", "control-ui", "index.html");
    const uiPackagePath = path.join(root, "ui", "package.json");
    const uiScriptPath = path.join(root, "scripts", "ui.js");

    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.mkdirSync(path.dirname(uiIndexPath), { recursive: true });
    fs.mkdirSync(path.dirname(uiPackagePath), { recursive: true });
    fs.mkdirSync(path.dirname(uiScriptPath), { recursive: true });
    fs.writeFileSync(schemaPath, "export const x = 1;", "utf-8");
    fs.writeFileSync(uiIndexPath, "<html></html>", "utf-8");
    fs.writeFileSync(uiPackagePath, "{}", "utf-8");
    fs.writeFileSync(uiScriptPath, "// stub", "utf-8");

    const schemaMtime = new Date(Date.now());
    const uiMtime = new Date(schemaMtime.getTime() - 10_000);
    fs.utimesSync(schemaPath, schemaMtime, schemaMtime);
    fs.utimesSync(uiIndexPath, uiMtime, uiMtime);

    resolveClosedClawPackageRoot.mockResolvedValue(root);
    runCommandWithTimeout.mockReset();
    runCommandWithTimeout
      .mockResolvedValueOnce({ code: 0, stdout: "abc", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "ok", stderr: "" });

    const prompter = {
      confirmAggressive: vi.fn().mockResolvedValue(true),
      confirm: vi.fn(),
      confirmRepair: vi.fn(),
    } as unknown as Parameters<typeof maybeRepairUiProtocolFreshness>[1];

    await maybeRepairUiProtocolFreshness({} as never, prompter);

    const messages = note.mock.calls.map((c) => String(c[0])).join("\n");
    expect(messages).toContain("UI rebuild complete");
    expect(runCommandWithTimeout).toHaveBeenCalledTimes(2);
    expect(runCommandWithTimeout.mock.calls[0][0][0]).toBe("git");
    expect(runCommandWithTimeout.mock.calls[1][0][0]).toBe(process.execPath);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
