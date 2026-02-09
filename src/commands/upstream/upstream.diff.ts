import chalk from "chalk";
import type { RuntimeEnv } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { GitService, classifyCommit } from "./upstream.git.js";
import { loadUpstreamTracking } from "./upstream.storage.js";
import { DEFAULT_UPSTREAM_TRACKING } from "./upstream.types.js";

interface DiffOptions {
  security?: boolean;
  commits?: string;
  files?: string;
  semantic?: boolean;
}

export async function upstreamDiffCommand(opts: DiffOptions, runtime: RuntimeEnv): Promise<void> {
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

  // Determine commit range
  const range = opts.commits || `HEAD..${tracking.trackingBranch}`;
  const [base, head] = range.split("..");

  // Get commits in range
  const commits = await git.getCommitsBetween(base, head);

  // Filter by security if requested
  let filteredCommits = commits;
  if (opts.security) {
    filteredCommits = commits.filter((c) => classifyCommit(c) === "security");
  }

  if (filteredCommits.length === 0) {
    console.log(chalk.green("✅ No new commits in this range"));
    return;
  }

  // Show commits
  console.log("");
  console.log(chalk.bold(`📊 Diff: ${range}`));
  console.log(chalk.dim(`${filteredCommits.length} commits`));
  console.log("");

  for (const commit of filteredCommits) {
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
    console.log(chalk.dim(`   ${commit.author} • ${new Date(commit.date).toLocaleString()}`));
    console.log("");
  }

  // Show file diff if requested
  if (opts.files || opts.semantic) {
    console.log(chalk.bold("📄 File Changes:"));
    const diff = await git.getDiff(base, head, opts.files);

    if (opts.semantic) {
      console.log(chalk.yellow("⚠️  Semantic diff not yet implemented. Showing text diff:"));
    }

    // Limit diff output
    const lines = diff.split("\n");
    const maxLines = 100;
    if (lines.length > maxLines) {
      console.log(lines.slice(0, maxLines).join("\n"));
      console.log(chalk.dim(`\n... ${lines.length - maxLines} more lines`));
      console.log(chalk.dim(`Run: git diff ${range} to see full diff`));
    } else {
      console.log(diff);
    }
  }

  console.log("");
  console.log(chalk.dim("Tip: Run 'closedclaw upstream sync --preview' to see what would change"));
  console.log("");
}
