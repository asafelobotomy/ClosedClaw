import type { Command } from "commander";
import { desktopInstallCommand, desktopUninstallCommand } from "../../commands/desktop-install.js";
import { launchCommand } from "../../commands/launch.js";
import { tokenGetCommand, tokenGenerateCommand, tokenSetCommand } from "../../commands/token.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerLaunchCommands(program: Command) {
  // --- closedclaw launch ---------------------------------------------------
  program
    .command("launch")
    .description("Start the gateway + GTK GUI in one command")
    .addHelpText(
      "after",
      () => `\n${theme.muted("Starts the gateway (if needed) and opens the desktop GUI.")}\n`,
    )
    .option("--gui-only", "Only launch the GTK GUI (assume gateway is running)")
    .option("--gateway-only", "Only start the gateway (no GUI)")
    .option("--port <port>", "Override gateway port", Number)
    .option("--gui-path <path>", "Path to closedclaw_messenger.py")
    .option("--timeout <ms>", "Gateway readiness timeout (ms)", Number)
    .option("--verbose", "Show detailed startup output")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await launchCommand(defaultRuntime, {
          guiOnly: Boolean(opts.guiOnly),
          gatewayOnly: Boolean(opts.gatewayOnly),
          port: opts.port,
          guiPath: opts.guiPath,
          timeoutMs: opts.timeout,
          verbose: Boolean(opts.verbose),
        });
      });
    });

  // --- closedclaw token ----------------------------------------------------
  const tokenCmd = program.command("token").description("Gateway token management");

  tokenCmd
    .command("get")
    .description("Show the current gateway token")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tokenGetCommand(defaultRuntime);
      });
    });

  tokenCmd
    .command("generate")
    .description("Generate a gateway token (saves to config if none exists)")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tokenGenerateCommand(defaultRuntime);
      });
    });

  tokenCmd
    .command("set <token>")
    .description("Set the gateway token in config")
    .action(async (token: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tokenSetCommand(defaultRuntime, token);
      });
    });

  // --- closedclaw desktop --------------------------------------------------
  const desktopCmd = program
    .command("desktop")
    .description("Desktop integration (Linux .desktop entry)");

  desktopCmd
    .command("install")
    .description("Install .desktop entry for the application menu")
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
