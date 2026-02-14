import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
});
