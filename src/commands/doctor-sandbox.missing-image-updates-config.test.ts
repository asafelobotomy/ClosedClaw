import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_SANDBOX_IMAGE } from "../agents/sandbox.js";
import type { ClosedClawConfig } from "../config/config.js";

const note = vi.fn();
const runExec = vi.fn();
const runCommandWithTimeout = vi.fn();

vi.mock("../terminal/note.js", () => ({ note }));
vi.mock("../process/exec.js", () => ({ runExec, runCommandWithTimeout }));
vi.mock("../config/constants/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/constants/index.js")>();
  return {
    ...actual,
  };
});

import { maybeRepairSandboxImages } from "./doctor-sandbox.js";

describe("doctor sandbox image repair", () => {
  beforeEach(() => {
    note.mockClear();
    runExec.mockReset();
    runCommandWithTimeout.mockReset();

    let inspectCalls = 0;
    // docker version check succeeds
    runExec.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "docker" && args[0] === "version") {
        return { stdout: "25.0", stderr: "" };
      }
      // first inspect fails with missing image, second succeeds after build
      if (cmd === "docker" && args[0] === "image" && args[1] === "inspect") {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          const err = new Error("No such image") as Error & { stderr?: string };
          err.stderr = "Error: No such image";
          throw err;
        }
        return { stdout: "image ok", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });
    runCommandWithTimeout.mockResolvedValue({ stdout: "", stderr: "", code: 0, signal: null, killed: false });
  });

  it("updates config after building a missing sandbox image", async () => {
    const cfg: ClosedClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "docker",
            docker: { image: DEFAULT_SANDBOX_IMAGE },
          },
        },
      },
    };

    const prompter = {
      confirmSkipInNonInteractive: vi.fn().mockResolvedValue(true),
    } as unknown as Parameters<typeof maybeRepairSandboxImages>[2];

    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as Parameters<typeof maybeRepairSandboxImages>[1];

    const next = await maybeRepairSandboxImages(cfg, runtime, prompter);

    expect(runCommandWithTimeout).toHaveBeenCalled();
    const messages = note.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("Updated agents.defaults.sandbox.docker.image"))).toBe(true);
    expect(next.agents?.defaults?.sandbox?.docker?.image).toBe(DEFAULT_SANDBOX_IMAGE);
  });
});
