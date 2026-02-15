import type { Command } from "commander";
import { launchCommand } from "../../commands/launch.js";
import {
  tokenGetCommand,
  tokenGenerateCommand,
  tokenSetCommand,
} from "../../commands/token.js";
import {
  desktopInstallCommand,
  desktopUninstallCommand,
} from "../../commands/desktop-install.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerLaunchCommands(program: Command) {
  // --- closedclaw launch ---------------------------------------------------
  program
    .command("launch")
    .description("Start gateway + GTK GUI in one step")
    .addHelpText(
      "after",
      () =>
        "\n" +
        theme.muted("Start the gateway (if not running) and launch the GTK desktop GUI.") +
        "\n",
    )
    .option("--gui-only", "Only launch the GTK GUI (assume gateway running)", false)
    .option("--gateway-only", "Only start the gateway in the background", false)
    .option("--port <port>", "Override gateway port")
    .option("--timeout <ms>", "Max time to wait for gateway readiness (default: 15000)")
    .option("--verbose", "Show detailed progress", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await launchCommand(defaultRuntime, {
          guiOnly: Boolean(opts.guiOnly),
          gatewayOnly: Boolean(opts.gatewayOnly),
          port: opts.port ? Number(opts.port) : undefined,
          timeoutMs: opts.timeout ? Number(opts.timeout) : undefined,
          verbose: Boolean(opts.verbose),
        });
      });
    });

  // --- closedclaw token ----------------------------------------------------
  const tokenCmd = program
    .command("token")
    .description("Gateway token management")
    .addHelpText(
      "after",
      () =>
        "\n" +
        theme.muted("Manage the gateway auth token used for local and remote connections.") +
        "\n",
    );

  tokenCmd
    .command("get")
    .description("Display the current gateway token")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tokenGetCommand(defaultRuntime);
      });
    });

  tokenCmd
    .command("generate")
    .description("Generate a new gateway token and save to config")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tokenGenerateCommand(defaultRuntime);
      });
    });

  tokenCmd
    .command("set <token>")
    .description("Set a specific gateway token in config")
    .action(async (token: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tokenSetCommand(defaultRuntime, token);
      });
    });

  // --- closedclaw desktop --------------------------------------------------
  const desktopCmd = program
    .command("desktop")
    .description("Linux desktop integration")
    .addHelpText(
      "after",
      () =>
        "\n" +
        theme.muted("Install or remove the .desktop entry for the application menu.") +
        "\n",
    );

  desktopCmd
    .command("install")
    .description("Install .desktop entry to the application menu")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await desktopInstallCommand(defaultRuntime);
      });
    });

  desktopCmd
    .command("uninstall")
    .description("Remove .desktop entry from the application menu")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await desktopUninstallCommand(defaultRuntime);
      });
    });
}
