import { Command } from "commander";
import {
  upstreamStatusCommand,
  upstreamDiffCommand,
  upstreamSyncCommand,
  upstreamConfigureCommand,
} from "../commands/upstream/index.js";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "./cli-utils.js";

function runUpstreamCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

export function registerUpstreamCli(program: Command) {
  const upstream = program
    .command("upstream")
    .description("Track and sync with OpenClaw upstream")
    .addHelpText(
      "after",
      `
Examples:
  $ closedclaw upstream status                    # Check upstream state
  $ closedclaw upstream diff --security          # Show security changes
  $ closedclaw upstream sync --preview           # Preview sync changes
  $ closedclaw upstream sync --security-only     # Apply security patches
  $ closedclaw upstream configure                # Configure tracking
`,
    );

  // Status command
  upstream
    .command("status")
    .description("Check upstream OpenClaw status and divergence")
    .option("--lag", "Show only sync lag time")
    .option("--json", "Output as JSON")
    .action((opts) => runUpstreamCommand(() => upstreamStatusCommand(opts, defaultRuntime)));

  // Diff command
  upstream
    .command("diff")
    .description("Show differences between ClosedClaw and OpenClaw")
    .option("--security", "Show only security-related changes")
    .option("--commits <range>", "Show commits in range (e.g., HEAD~10..openclaw/main)")
    .option("--files <pattern>", "Filter files by glob pattern")
    .option("--semantic", "Show semantic diff (AST-based)")
    .action((opts) => runUpstreamCommand(() => upstreamDiffCommand(opts, defaultRuntime)));

  // Sync command
  upstream
    .command("sync")
    .description("Sync changes from OpenClaw")
    .option("--preview", "Preview changes without applying")
    .option("--security-only", "Apply only security patches")
    .option("--interactive", "Choose commits interactively")
    .option("--commit <sha>", "Apply specific commit")
    .option("--dry-run", "Show what would be done")
    .action((opts) => runUpstreamCommand(() => upstreamSyncCommand(opts, defaultRuntime)));

  // Configure command
  upstream
    .command("configure")
    .description("Configure upstream tracking settings")
    .option("--auto-apply-security <boolean>", "Auto-apply security patches")
    .option("--check-interval <hours>", "How often to check upstream (hours)")
    .option("--remote-url <url>", "Upstream git remote URL")
    .action((opts) => runUpstreamCommand(() => upstreamConfigureCommand(opts, defaultRuntime)));
}
