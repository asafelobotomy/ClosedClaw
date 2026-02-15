import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerAcpCli } from "./acp-cli.js";
import { registerCompletionCli } from "./completion-cli.js";
import { registerDevicesCli } from "./devices-cli.js";
import { registerDirectoryCli } from "./directory-cli.js";
import { registerDocsCli } from "./docs-cli.js";
import { registerLogsCli } from "./logs-cli.js";
import { registerSystemCli } from "./system-cli.js";
import { registerUpstreamCli } from "./upstream-cli.js";

const registerAll = (program: Command) => {
  registerAcpCli(program);
  registerCompletionCli(program);
  registerDevicesCli(program);
  registerDirectoryCli(program);
  registerDocsCli(program);
  registerLogsCli(program);
  registerSystemCli(program);
  registerUpstreamCli(program);
};

describe("cli surface smoke", () => {
  it("registers key subcommands without execution", () => {
    const program = new Command();
    program.exitOverride();

    expect(() => registerAll(program)).not.toThrow();

    const commandNames = program.commands.map((cmd) => cmd.name());

    expect(commandNames).toEqual(
      expect.arrayContaining([
        "acp",
        "completion",
        "devices",
        "directory",
        "docs",
        "logs",
        "system",
        "upstream",
      ]),
    );
  });
});
