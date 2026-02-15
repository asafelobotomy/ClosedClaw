import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  applyAgentDefaults,
  applyCompactionDefaults,
  applyContextPruningDefaults,
  applyLoggingDefaults,
  applyMessageDefaults,
  applyModelDefaults,
  applySessionDefaults,
  applyTalkApiKey,
} from "../config/defaults.js";

const buildBase = () =>
  applyTalkApiKey(
    applyModelDefaults(
      applyCompactionDefaults(
        applyContextPruningDefaults(
          applyAgentDefaults(applySessionDefaults(applyLoggingDefaults(applyMessageDefaults({})))),
        ),
      ),
    ),
  );

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

vi.mock("../config/config.js", () => ({
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn(),
}));

describe("config diff cli", () => {
  it("emits json diff vs defaults", async () => {
    const base = buildBase();
    const snapshotConfig = JSON.parse(JSON.stringify(base));
    snapshotConfig.messages = { ...(snapshotConfig.messages ?? {}), ackReactionScope: "custom" };
    snapshotConfig.gateway = { ...(snapshotConfig.gateway ?? {}), port: 19001 };

    const { readConfigFileSnapshot } = await import("../config/config.js");
    const { defaultRuntime } = await import("../runtime.js");
    vi.mocked(readConfigFileSnapshot).mockResolvedValue({
      path: "/tmp/ClosedClaw.json",
      exists: true,
      raw: "{}",
      parsed: {},
      valid: true,
      config: snapshotConfig,
      hash: "hash",
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const { registerConfigCli } = await import("./config-cli.js");
    const program = new Command();
    program.exitOverride();
    registerConfigCli(program);

    await program.parseAsync(["config", "diff", "--json"], { from: "user" });

    expect(defaultRuntime.exit).not.toHaveBeenCalled();
    const logged = defaultRuntime.log.mock.calls[0]?.[0];
    expect(typeof logged).toBe("string");
    const payload = JSON.parse(logged as string) as {
      differences: Array<{ path: string; type: string; from?: unknown; to?: unknown }>;
    };

    expect(payload.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "messages.ackReactionScope",
          type: "changed",
          to: "custom",
        }),
        expect.objectContaining({
          path: "gateway",
          type: "added",
          to: expect.objectContaining({ port: 19001 }),
        }),
      ]),
    );
  });
});
