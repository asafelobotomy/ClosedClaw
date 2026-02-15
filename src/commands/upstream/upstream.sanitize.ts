import chalk from "chalk";
import type { RuntimeEnv } from "../../runtime.js";
import { GitService, classifyCommit } from "./upstream.git.js";
import { loadUpstreamTracking, saveUpstreamTracking } from "./upstream.storage.js";
import { DEFAULT_UPSTREAM_TRACKING, type UpstreamTrackingState } from "./upstream.types.js";

interface SanitizeOptions {
  json?: boolean;
  applyClean?: boolean;
  limit?: string;
  patchWindow?: string;
}

export type SanitizedStatus = "applied" | "clean" | "conflict" | "obsolete" | "error";

export interface SanitizedCommit {
  sha: string;
  message: string;
  status: SanitizedStatus;
  reason?: string;
  files: string[];
}

export interface SanitizeReport {
  summary: {
    totalSecurity: number;
    applied: number;
    clean: number;
    conflicts: number;
    obsolete: number;
    errors: number;
    appliedNow: number;
  };
  commits: SanitizedCommit[];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function summarize(commits: SanitizedCommit[], appliedNow: number) {
  const summary = {
    totalSecurity: commits.length,
    applied: 0,
    clean: 0,
    conflicts: 0,
    obsolete: 0,
    errors: 0,
    appliedNow,
  };

  for (const commit of commits) {
    if (commit.status === "applied") {
      summary.applied++;
    }
    if (commit.status === "clean") {
      summary.clean++;
    }
    if (commit.status === "conflict") {
      summary.conflicts++;
    }
    if (commit.status === "obsolete") {
      summary.obsolete++;
    }
    if (commit.status === "error") {
      summary.errors++;
    }
  }

  return summary;
}

export async function upstreamSanitizeCommand(
  opts: SanitizeOptions,
  _runtime: RuntimeEnv,
): Promise<SanitizeReport | void> {
  const git = new GitService();
  const tracking = await loadUpstreamTracking<UpstreamTrackingState>(DEFAULT_UPSTREAM_TRACKING);

  const remoteName = "openclaw";
  if (!(await git.remoteExists(remoteName))) {
    console.error(chalk.red("❌ Upstream remote not configured. Run: closedclaw upstream status"));
    process.exit(1);
  }

  console.log(chalk.dim("Fetching upstream..."));
  await git.fetch(remoteName);

  const upstreamRef = tracking.trackingBranch;
  if (!(await git.refExists(upstreamRef))) {
    console.error(chalk.red(`❌ Upstream ref ${upstreamRef} not found`));
    process.exit(1);
  }

  const commitLimit = parsePositiveInt(opts.limit, Number.MAX_SAFE_INTEGER);
  const patchWindow = parsePositiveInt(opts.patchWindow, 800);

  const commits = await git.getCommitsBetween("HEAD", upstreamRef);
  const securityCommits = commits
    .filter((c) => classifyCommit(c) === "security")
    .slice(0, commitLimit);

  if (securityCommits.length === 0) {
    console.log(chalk.green("✅ No upstream security commits to sanitize"));
    return;
  }

  const localPatchIds = await git.getPatchIds("HEAD", patchWindow);
  const results: SanitizedCommit[] = [];

  for (const commit of securityCommits) {
    const files = await git.getCommitFiles(commit.sha);
    const patchId = await git.getPatchId(commit.sha);

    if (patchId && localPatchIds.has(patchId)) {
      results.push({
        sha: commit.sha,
        message: commit.message,
        status: "applied",
        reason: "Patch already present locally",
        files,
      });
      continue;
    }

    try {
      const applyStatus = await git.canApplyCommit(commit.sha);
      if (applyStatus.status === "clean") {
        results.push({
          sha: commit.sha,
          message: commit.message,
          status: "clean",
          reason: "Applies cleanly",
          files,
        });
      } else if (applyStatus.status === "missing") {
        results.push({
          sha: commit.sha,
          message: commit.message,
          status: "obsolete",
          reason: applyStatus.detail,
          files,
        });
      } else {
        results.push({
          sha: commit.sha,
          message: commit.message,
          status: "conflict",
          reason: applyStatus.detail,
          files,
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        sha: commit.sha,
        message: commit.message,
        status: "error",
        reason: detail,
        files,
      });
    }
  }

  let appliedNow = 0;
  if (opts.applyClean) {
    const cleanCommits = results.filter((commit) => commit.status === "clean");
    if (cleanCommits.length > 0) {
      console.log(chalk.bold(`🔄 Applying ${cleanCommits.length} clean security commits...`));
      for (const commit of cleanCommits.toReversed()) {
        try {
          await git.cherryPick(commit.sha, { noCommit: false });
          commit.status = "applied";
          commit.reason = "Applied by sanitizer";
          appliedNow++;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          commit.status = "conflict";
          commit.reason = detail;
        }
      }

      if (appliedNow > 0) {
        const updatedTracking: UpstreamTrackingState = {
          ...tracking,
          lastSync: new Date().toISOString(),
        };
        await saveUpstreamTracking(updatedTracking);
      }
    }
  }

  const summary = summarize(results, appliedNow);
  const report: SanitizeReport = { summary, commits: results };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log("");
  console.log(chalk.bold("🔒 Upstream Security Sanitizer"));
  console.log(chalk.dim(`Tracking ${upstreamRef} • patch window ${patchWindow} commits`));
  console.log(
    `${summary.totalSecurity} security commits: ${chalk.green(`${summary.applied} applied`)}, ${chalk.yellow(`${summary.clean} clean`)}, ${chalk.red(`${summary.conflicts} conflicts`)}, ${chalk.dim(`${summary.obsolete} obsolete`)}`,
  );

  if (summary.appliedNow > 0) {
    console.log(chalk.green(`✅ Applied ${summary.appliedNow} clean commits`));
  } else if (summary.clean > 0 && !opts.applyClean) {
    console.log(
      chalk.yellow("💡 Run with --apply-clean to cherry-pick clean patches automatically"),
    );
  }

  const conflicts = results.filter((c) => c.status === "conflict");
  if (conflicts.length > 0) {
    console.log("");
    console.log(chalk.red.bold(`❗ ${conflicts.length} commits need manual attention:`));
    for (const conflict of conflicts.slice(0, 5)) {
      console.log(`  ${chalk.red(conflict.sha.slice(0, 7))} ${conflict.message}`);
      if (conflict.reason) {
        console.log(chalk.dim(`    ${conflict.reason}`));
      }
    }
    if (conflicts.length > 5) {
      console.log(chalk.dim(`  ... and ${conflicts.length - 5} more`));
    }
  }

  const obsolete = results.filter((c) => c.status === "obsolete");
  if (obsolete.length > 0) {
    console.log("");
    console.log(chalk.dim(`🗑️  ${obsolete.length} commits look obsolete or missing files`));
  }

  if (summary.errors > 0) {
    console.log("");
    console.log(
      chalk.red(`⚠️  ${summary.errors} commits failed to analyze. Re-run with --json for details.`),
    );
  }

  console.log("");
  return report;
}
