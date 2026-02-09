import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { UpstreamTrackingState, UpstreamConfig } from "./upstream.types.js";

const execFileAsync = promisify(execFile);

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export class GitService {
  constructor(private repoPath: string = process.cwd()) {}

  /**
   * Execute git command
   */
  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: this.repoPath });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: ${error}`);
    }
  }

  /**
   * Check if git remote exists
   */
  async remoteExists(remoteName: string): Promise<boolean> {
    try {
      const remotes = await this.exec(["remote"]);
      return remotes.split("\n").includes(remoteName);
    } catch {
      return false;
    }
  }

  /**
   * Add git remote
   */
  async addRemote(remoteName: string, url: string): Promise<void> {
    await this.exec(["remote", "add", remoteName, url]);
  }

  /**
   * Fetch from remote
   */
  async fetch(remoteName: string): Promise<void> {
    await this.exec(["fetch", remoteName]);
  }

  /**
   * Get commits between two refs
   */
  async getCommitsBetween(base: string, head: string): Promise<GitCommit[]> {
    const format = "%H%n%s%n%an%n%ad%n---";
    const output = await this.exec([
      "log",
      `${base}..${head}`,
      `--pretty=format:${format}`,
      "--date=iso",
    ]);

    const commits: GitCommit[] = [];
    const blocks = output.split("---\n").filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length >= 4) {
        commits.push({
          sha: lines[0],
          message: lines[1],
          author: lines[2],
          date: lines[3],
        });
      }
    }

    return commits;
  }

  /**
   * Get latest tag from a branch
   */
  async getLatestTag(ref: string = "HEAD"): Promise<string | null> {
    try {
      const tag = await this.exec(["describe", "--tags", "--abbrev=0", ref]);
      return tag.trim();
    } catch {
      return null;
    }
  }

  /**
   * Count commits between two refs
   */
  async countCommitsBetween(base: string, head: string): Promise<number> {
    try {
      const count = await this.exec(["rev-list", "--count", `${base}..${head}`]);
      return parseInt(count.trim(), 10);
    } catch {
      return 0;
    }
  }

  /**
   * Get current branch
   */
  async getCurrentBranch(): Promise<string> {
    const branch = await this.exec(["rev-parse", "--abbrev-ref", "HEAD"]);
    return branch.trim();
  }

  /**
   * Check if ref exists
   */
  async refExists(ref: string): Promise<boolean> {
    try {
      await this.exec(["rev-parse", "--verify", ref]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get diff between two refs
   */
  async getDiff(base: string, head: string, filePattern?: string): Promise<string> {
    const args = ["diff", `${base}..${head}`];
    if (filePattern) {
      args.push("--", filePattern);
    }
    return await this.exec(args);
  }

  /**
   * Apply a patch
   */
  async applyPatch(patchContent: string): Promise<void> {
    // Check if patch can be applied
    await this.runGitWithInput(["apply", "--check"], patchContent);
    // Apply the patch
    await this.runGitWithInput(["apply"], patchContent);
  }

  /**
   * Run git command with stdin input
   */
  private runGitWithInput(args: string[], input: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, { cwd: this.repoPath });
      let stderr = "";

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        reject(new Error(`Git command failed: ${error.message}`));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Git command failed with code ${code}: ${stderr}`));
        }
      });

      // Write input and close stdin
      child.stdin.write(input);
      child.stdin.end();
    });
  }

  /**
   * Cherry-pick a commit
   */
  async cherryPick(commitSha: string, options: { noCommit?: boolean } = {}): Promise<void> {
    const args = ["cherry-pick", commitSha];
    if (options.noCommit) {
      args.push("--no-commit");
    }
    await this.exec(args);
  }
}

/**
 * Classify commits as security-related, bug fixes, or features
 */
export function classifyCommit(commit: GitCommit): "security" | "bugfix" | "feature" | "other" {
  const message = commit.message.toLowerCase();

  // Security indicators
  const securityKeywords = [
    "security",
    "cve-",
    "ssrf",
    "xss",
    "rce",
    "vulnerability",
    "exploit",
    "patch",
    "bypass",
    "injection",
    "sanitize",
    "escape",
  ];

  for (const keyword of securityKeywords) {
    if (message.includes(keyword)) {
      return "security";
    }
  }

  // Bug fix indicators
  if (message.startsWith("fix:") || message.includes("fixes")) {
    return "bugfix";
  }

  // Feature indicators
  if (message.startsWith("feat:") || message.includes("add") || message.includes("new")) {
    return "feature";
  }

  return "other";
}
