import chalk from "chalk";
import type { RuntimeEnv } from "../../runtime.js";
import { GitService, classifyCommit } from "./upstream.git.js";
import { loadUpstreamTracking, saveUpstreamTracking } from "./upstream.storage.js";
import { DEFAULT_UPSTREAM_TRACKING, type UpstreamTrackingState } from "./upstream.types.js";

interface StatusOptions {
  lag?: boolean;
  json?: boolean;
}

export async function upstreamStatusCommand(
  opts: StatusOptions,
  _runtime: RuntimeEnv,
): Promise<void> {
  const git = new GitService();
  const tracking = await loadUpstreamTracking<UpstreamTrackingState>(DEFAULT_UPSTREAM_TRACKING);

  // Ensure upstream remote exists
  const remoteName = "openclaw";
  if (!(await git.remoteExists(remoteName))) {
    console.log(chalk.yellow("⚠️  Upstream remote not configured. Setting up..."));
    await git.addRemote(remoteName, tracking.remoteUrl);
  }

  // Fetch latest
  console.log(chalk.dim("Fetching upstream..."));
  try {
    await git.fetch(remoteName);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Failed to fetch upstream: ${detail}`));
    process.exit(1);
  }

  // Get current tracking state
  const currentBranch = await git.getCurrentBranch();
  const upstreamRef = tracking.trackingBranch;

  // Check if upstream ref exists
  if (!(await git.refExists(upstreamRef))) {
    console.error(chalk.red(`❌ Upstream ref ${upstreamRef} not found`));
    process.exit(1);
  }

  // Get divergence
  const commitsAhead = await git.countCommitsBetween(upstreamRef, "HEAD");
  const commitsBehind = await git.countCommitsBetween("HEAD", upstreamRef);

  // Get new commits
  const newCommits = await git.getCommitsBetween("HEAD", upstreamRef);

  // Classify commits
  const securityCommits = newCommits.filter((c) => classifyCommit(c) === "security");
  const bugfixCommits = newCommits.filter((c) => classifyCommit(c) === "bugfix");
  const featureCommits = newCommits.filter((c) => classifyCommit(c) === "feature");

  // Get upstream version
  const upstreamVersion = (await git.getLatestTag(upstreamRef)) || "unknown";

  // Update tracking
  const updatedTracking: UpstreamTrackingState = {
    ...tracking,
    lastCheck: new Date().toISOString(),
    upstreamVersion,
    divergenceCommits: commitsBehind,
    securityPatchesPending: securityCommits.map((c) => `${c.sha.slice(0, 7)}: ${c.message}`),
    featuresAvailable: featureCommits.map((c) => `${c.sha.slice(0, 7)}: ${c.message}`),
  };
  await saveUpstreamTracking(updatedTracking);

  // Output
  if (opts.json) {
    console.log(JSON.stringify(updatedTracking, null, 2));
    return;
  }

  if (opts.lag) {
    const lagHours = Math.floor(
      (Date.now() - new Date(tracking.lastSync).getTime()) / (1000 * 60 * 60),
    );
    console.log(`${lagHours}h`);
    return;
  }

  // Pretty output
  console.log("");
  console.log(chalk.bold("🦀 ClosedClaw Upstream Status"));
  console.log("");
  console.log(`${chalk.dim("Fork point:")}     ${tracking.forkPoint}`);
  console.log(`${chalk.dim("Current branch:")} ${currentBranch}`);
  console.log(`${chalk.dim("Upstream:")}       ${upstreamVersion} (${upstreamRef})`);
  console.log(`${chalk.dim("Last sync:")}      ${new Date(tracking.lastSync).toLocaleString()}`);
  console.log("");

  console.log(chalk.bold("Divergence:"));
  console.log(`  ${chalk.green(`+${commitsAhead}`)} commits ahead`);
  console.log(`  ${chalk.yellow(`-${commitsBehind}`)} commits behind`);
  console.log("");

  if (securityCommits.length > 0) {
    console.log(chalk.bold(chalk.red(`🔒 ${securityCommits.length} Security Patches Available:`)));
    for (const commit of securityCommits.slice(0, 5)) {
      console.log(`  ${chalk.red("•")} ${commit.sha.slice(0, 7)}: ${commit.message}`);
    }
    if (securityCommits.length > 5) {
      console.log(chalk.dim(`  ... and ${securityCommits.length - 5} more`));
    }
    console.log("");
  }

  if (bugfixCommits.length > 0) {
    console.log(chalk.bold(chalk.yellow(`🐛 ${bugfixCommits.length} Bug Fixes Available:`)));
    for (const commit of bugfixCommits.slice(0, 3)) {
      console.log(`  ${chalk.yellow("•")} ${commit.sha.slice(0, 7)}: ${commit.message}`);
    }
    if (bugfixCommits.length > 3) {
      console.log(chalk.dim(`  ... and ${bugfixCommits.length - 3} more`));
    }
    console.log("");
  }

  if (featureCommits.length > 0) {
    console.log(chalk.bold(chalk.blue(`✨ ${featureCommits.length} New Features Available:`)));
    for (const commit of featureCommits.slice(0, 3)) {
      console.log(`  ${chalk.blue("•")} ${commit.sha.slice(0, 7)}: ${commit.message}`);
    }
    if (featureCommits.length > 3) {
      console.log(chalk.dim(`  ... and ${featureCommits.length - 3} more`));
    }
    console.log("");
  }

  // Recommendations
  if (securityCommits.length > 0) {
    console.log(chalk.red(chalk.bold("⚠️  Recommended action:")));
    console.log(chalk.red(`   Run: ${chalk.bold("closedclaw upstream sync --security-only")}`));
  } else if (commitsBehind > 50) {
    console.log(chalk.yellow(chalk.bold("💡 Tip:")));
    console.log(chalk.yellow(`   You're ${commitsBehind} commits behind. Consider syncing:`));
    console.log(chalk.yellow(`   ${chalk.bold("closedclaw upstream sync --preview")}`));
  } else if (commitsBehind === 0) {
    console.log(chalk.green("✅ You're up to date with upstream!"));
  }

  console.log("");
}
