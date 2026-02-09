import chalk from "chalk";
import type { RuntimeEnv } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { GitService, classifyCommit } from "./upstream.git.js";
import { loadUpstreamTracking, saveUpstreamTracking } from "./upstream.storage.js";
import { DEFAULT_UPSTREAM_TRACKING } from "./upstream.types.js";

interface SyncOptions {
  preview?: boolean;
  securityOnly?: boolean;
  interactive?: boolean;
  commit?: string;
  dryRun?: boolean;
}

export async function upstreamSyncCommand(opts: SyncOptions, runtime: RuntimeEnv): Promise<void> {
  const git = new GitService();
  const tracking = await loadUpstreamTracking(DEFAULT_UPSTREAM_TRACKING);

  // Ensure upstream remote exists
  const remoteName = "openclaw";
  if (!(await git.remoteExists(remoteName))) {
    console.error(chalk.red("❌ Upstream remote not configured. Run: closedclaw upstream status"));
    process.exit(1);
  }

  // Fetch latest
  console.log(chalk.dim("Fetching upstream..."));
  await git.fetch(remoteName);

  // Get commits to sync
  const commits = await git.getCommitsBetween("HEAD", tracking.trackingBranch);

  if (commits.length === 0) {
    console.log(chalk.green("✅ Already up to date with upstream"));
    return;
  }

  // Filter by security if requested
  let commitsToApply = commits;
  if (opts.securityOnly) {
    commitsToApply = commits.filter((c) => classifyCommit(c) === "security");
    console.log(chalk.yellow(`🔒 Filtering to ${commitsToApply.length} security commits`));
  }

  if (opts.commit) {
    commitsToApply = commits.filter((c) => c.sha.startsWith(opts.commit!));
    if (commitsToApply.length === 0) {
      console.error(chalk.red(`❌ Commit ${opts.commit} not found`));
      process.exit(1);
    }
  }

  // Preview mode
  if (opts.preview || opts.dryRun) {
    console.log("");
    console.log(chalk.bold("📋 Preview: Would apply these commits:"));
    console.log("");

    for (const commit of commitsToApply) {
      const type = classifyCommit(commit);
      let icon = "•";
      let color = chalk.white;

      if (type === "security") {
        icon = "🔒";
        color = chalk.red;
      } else if (type === "bugfix") {
        icon = "🐛";
        color = chalk.yellow;
      } else if (type === "feature") {
        icon = "✨";
        color = chalk.blue;
      }

      console.log(color(`${icon} ${commit.sha.slice(0, 7)} ${commit.message}`));
    }

    console.log("");
    console.log(chalk.dim("Run without --preview to apply these changes"));
    return;
  }

  // Interactive mode
  if (opts.interactive) {
    console.log(chalk.yellow("⚠️  Interactive mode not yet implemented"));
    console.log(chalk.dim("For now, use --commit <sha> to apply specific commits"));
    return;
  }

  // Apply commits
  console.log("");
  console.log(chalk.bold(`🔄 Applying ${commitsToApply.length} commits...`));
  console.log("");

  let appliedCount = 0;
  let failedCount = 0;

  for (const commit of commitsToApply.toReversed()) {
    // Reverse to apply in chronological order
    try {
      console.log(chalk.dim(`Applying ${commit.sha.slice(0, 7)}: ${commit.message}`));
      await git.cherryPick(commit.sha, { noCommit: false });
      appliedCount++;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to apply ${commit.sha.slice(0, 7)}: ${error}`));
      failedCount++;

      // Ask user what to do
      console.log("");
      console.log(chalk.yellow("Options:"));
      console.log("  1. Skip this commit");
      console.log("  2. Abort sync");
      console.log("  3. Manually resolve and continue");
      console.log("");
      console.log(
        chalk.dim("Run 'git cherry-pick --abort' to cancel, or resolve conflicts manually"),
      );
      break;
    }
  }

  // Update tracking
  if (appliedCount > 0) {
    const updatedTracking = {
      ...tracking,
      lastSync: new Date().toISOString(),
    };
    await saveUpstreamTracking(updatedTracking);
  }

  // Summary
  console.log("");
  if (failedCount === 0) {
    console.log(chalk.green(`✅ Successfully applied ${appliedCount} commits`));
  } else {
    console.log(chalk.yellow(`⚠️  Applied ${appliedCount} commits, ${failedCount} failed`));
  }
  console.log("");
}
