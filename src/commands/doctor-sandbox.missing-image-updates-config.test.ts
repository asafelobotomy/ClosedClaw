import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ClosedClawConfig } from "../config/config.js";
import { DEFAULT_SANDBOX_IMAGE } from "../agents/sandbox.js";

const { note, runExec, runCommandWithTimeout } = vi.hoisted(() => {
  return {
    note: vi.fn(),
    runExec: vi.fn(),
    runCommandWithTimeout: vi.fn(),
  };
});

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
    runCommandWithTimeout.mockResolvedValue({
      stdout: "",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });
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

    const scriptPath = path.join(process.cwd(), "scripts", "sandbox-setup.sh");
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o755 });
    fs.writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });

    let next: ClosedClawConfig | undefined;
    try {
      next = await maybeRepairSandboxImages(cfg, runtime, prompter);
    } finally {
      fs.rmSync(scriptPath, { force: true });
    }

    expect(runCommandWithTimeout).toHaveBeenCalled();
    const messages = note.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("Updated agents.defaults.sandbox.docker.image"))).toBe(
      true,
    );
    expect(next.agents?.defaults?.sandbox?.docker?.image).toBe(DEFAULT_SANDBOX_IMAGE);
  });

  it("skips sandbox checks when docker is unavailable", async () => {
    runExec.mockImplementation(() => {
      const err = new Error("no docker");
      (err as Error & { stderr?: string }).stderr = "no docker";
      throw err;
    });

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

    expect(next).toBe(cfg);
    const messages = note.mock.calls.map((c) => String(c[0])).join("\n");
    expect(messages).toContain("Docker not available; skipping sandbox image checks.");
    expect(runCommandWithTimeout).not.toHaveBeenCalled();
  });

  it("logs browser image missing but does not build when declined", async () => {
    runExec.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "docker" && args[0] === "version") {
        return { stdout: "25.0", stderr: "" };
      }
      if (cmd === "docker" && args[0] === "image" && args[1] === "inspect") {
        const image = args[2];
        if (image === DEFAULT_SANDBOX_IMAGE) {
          return { stdout: "image ok", stderr: "" };
        }
        const err = new Error("No such image") as Error & { stderr?: string };
        err.stderr = "Error: No such image";
        throw err;
      }
      return { stdout: "", stderr: "" };
    });

    const cfg: ClosedClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "docker",
            docker: { image: DEFAULT_SANDBOX_IMAGE },
            browser: { enabled: true, image: undefined },
          },
        },
      },
    };

    const prompter = {
      confirmSkipInNonInteractive: vi.fn().mockResolvedValue(false),
    } as unknown as Parameters<typeof maybeRepairSandboxImages>[2];

    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as Parameters<typeof maybeRepairSandboxImages>[1];

    const next = await maybeRepairSandboxImages(cfg, runtime, prompter);

    const messages = note.mock.calls.map((c) => String(c[0])).join("\n");
    expect(messages).toContain("Sandbox browser image missing");
    expect(runCommandWithTimeout).not.toHaveBeenCalled();
    expect(next.agents?.defaults?.sandbox?.browser?.image).toBeUndefined();
  });
});
