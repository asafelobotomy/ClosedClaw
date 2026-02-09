import chalk from "chalk";
import type { RuntimeEnv } from "../../runtime.js";
import { loadUpstreamConfig, saveUpstreamConfig } from "./upstream.storage.js";
import { DEFAULT_UPSTREAM_CONFIG, type UpstreamConfig } from "./upstream.types.js";

interface ConfigureOptions {
  autoApplySecurity?: string;
  checkInterval?: string;
  remoteUrl?: string;
}

export async function upstreamConfigureCommand(
  opts: ConfigureOptions,
  _runtime: RuntimeEnv,
): Promise<void> {
  const config = await loadUpstreamConfig<UpstreamConfig>(DEFAULT_UPSTREAM_CONFIG);

  let updated = false;

  if (opts.autoApplySecurity !== undefined) {
    config.autoApplySecurity = opts.autoApplySecurity.toLowerCase() === "true";
    updated = true;
  }

  if (opts.checkInterval !== undefined) {
    const hours = parseInt(opts.checkInterval, 10);
    if (isNaN(hours) || hours < 1) {
      console.error(chalk.red("❌ Check interval must be a positive number"));
      process.exit(1);
    }
    config.checkInterval = hours;
    updated = true;
  }

  if (opts.remoteUrl !== undefined) {
    config.remoteUrl = opts.remoteUrl;
    updated = true;
  }

  if (updated) {
    await saveUpstreamConfig(config);
    console.log(chalk.green("✅ Configuration updated"));
  }

  // Show current config
  console.log("");
  console.log(chalk.bold("🔧 Upstream Configuration:"));
  console.log("");
  console.log(
    `${chalk.dim("Auto-apply security:")} ${config.autoApplySecurity ? chalk.green("Yes") : chalk.red("No")}`,
  );
  console.log(`${chalk.dim("Check interval:")}     ${config.checkInterval} hours`);
  console.log(`${chalk.dim("Remote URL:")}         ${config.remoteUrl}`);
  console.log(`${chalk.dim("Tracking branch:")}    ${config.trackingBranch}`);
  console.log("");

  if (!updated) {
    console.log(chalk.dim("To change settings:"));
    console.log(chalk.dim("  closedclaw upstream configure --auto-apply-security true"));
    console.log(chalk.dim("  closedclaw upstream configure --check-interval 12"));
    console.log("");
  }
}
