/**
 * Tests for upstream git service and commit classification.
 *
 * Tests cover:
 * - classifyCommit heuristics (security, bugfix, feature, other)
 * - GitService methods (mocked git commands)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyCommit, GitService, type GitCommit } from "./upstream.git.js";

// ─── classifyCommit ──────────────────────────────────────────────────────────

describe("classifyCommit", () => {
  function makeCommit(message: string): GitCommit {
    return { sha: "abc123def456", message, author: "test", date: "2026-02-08" };
  }

  describe("security classification", () => {
    const securityMessages = [
      "Security: fix token leak",
      "fix CVE-2026-1234",
      "Prevent SSRF in media fetch",
      "Fix XSS vulnerability in web UI",
      "Patch RCE in skill loader",
      "Close vulnerability in config parser",
      "Prevent exploit in sandbox escape",
      "bypass fix for auth middleware",
      "SQL injection prevention in query builder",
      "Sanitize user input in template engine",
      "Escape HTML in notification renderer",
    ];

    for (const msg of securityMessages) {
      it(`classifies "${msg}" as security`, () => {
        expect(classifyCommit(makeCommit(msg))).toBe("security");
      });
    }

    it("is case-insensitive for security keywords", () => {
      expect(classifyCommit(makeCommit("SECURITY: critical fix"))).toBe("security");
      expect(classifyCommit(makeCommit("Fix CVE-2026-9999"))).toBe("security");
    });
  });

  describe("bugfix classification", () => {
    it('classifies "fix: ..." messages as bugfix', () => {
      expect(classifyCommit(makeCommit("fix: resolve crash on startup"))).toBe("bugfix");
    });

    it('classifies messages containing "fixes" as bugfix', () => {
      expect(classifyCommit(makeCommit("This commit fixes the memory leak"))).toBe("bugfix");
    });

    it("security takes precedence over bugfix", () => {
      // "fix:" + security keyword → security wins
      expect(classifyCommit(makeCommit("fix: SSRF bypass in fetch"))).toBe("security");
    });
  });

  describe("feature classification", () => {
    it('classifies "feat: ..." messages as feature', () => {
      expect(classifyCommit(makeCommit("feat: add multi-model routing"))).toBe("feature");
    });

    it('classifies messages containing "add" as feature', () => {
      expect(classifyCommit(makeCommit("Add Prometheus metrics endpoint"))).toBe("feature");
    });

    it('classifies messages containing "new" as feature', () => {
      expect(classifyCommit(makeCommit("New workflow engine for automation"))).toBe("feature");
    });

    it("security takes precedence over feature", () => {
      expect(classifyCommit(makeCommit("Add sanitize function for XSS prevention"))).toBe(
        "security",
      );
    });
  });

  describe("other classification", () => {
    it("classifies chore messages as other", () => {
      expect(classifyCommit(makeCommit("chore: update dependencies"))).toBe("other");
    });

    it("classifies docs messages as other", () => {
      expect(classifyCommit(makeCommit("docs: update README"))).toBe("other");
    });

    it("classifies refactor messages as other", () => {
      expect(classifyCommit(makeCommit("refactor: simplify config loading"))).toBe("other");
    });

    it("classifies style messages as other", () => {
      expect(classifyCommit(makeCommit("style: format with prettier"))).toBe("other");
    });

    it("classifies test messages as other", () => {
      expect(classifyCommit(makeCommit("test: improve coverage for crypto module"))).toBe("other");
    });
  });
});

// ─── GitService ──────────────────────────────────────────────────────────────

describe("GitService", () => {
  let execFileMock: ReturnType<typeof vi.fn>;
  let git: GitService;

  beforeEach(async () => {
    // Mock child_process.execFile
    execFileMock = vi.fn();
    vi.doMock("node:child_process", () => ({
      execFile: execFileMock,
      spawn: vi.fn(),
    }));

    // Re-import to get mocked version
    const mod = await import("./upstream.git.js");
    git = new mod.GitService("/test/repo");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to set up execFile mock responses
  function mockGitCommand(stdout: string) {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, result: { stdout: string }) => void,
      ) => {
        cb(null, { stdout });
      },
    );
  }

  function mockGitError(message: string) {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, result: { stdout: string }) => void,
      ) => {
        cb(new Error(message), { stdout: "" });
      },
    );
  }

  describe("remoteExists", () => {
    it("returns true when remote is in list", async () => {
      mockGitCommand("origin\nopenclaw\nbackup");
      const result = await git.remoteExists("openclaw");
      expect(result).toBe(true);
    });

    it("returns false when remote is not in list", async () => {
      mockGitCommand("origin\nbackup");
      const result = await git.remoteExists("openclaw");
      expect(result).toBe(false);
    });

    it("returns false on git error", async () => {
      mockGitError("fatal: not a git repository");
      const result = await git.remoteExists("openclaw");
      expect(result).toBe(false);
    });
  });

  describe("getCurrentBranch", () => {
    it("returns trimmed branch name", async () => {
      mockGitCommand("main\n");
      const branch = await git.getCurrentBranch();
      expect(branch).toBe("main");
    });
  });

  describe("countCommitsBetween", () => {
    it("returns parsed count", async () => {
      mockGitCommand("42\n");
      const count = await git.countCommitsBetween("HEAD", "openclaw/main");
      expect(count).toBe(42);
    });

    it("returns 0 on error", async () => {
      mockGitError("fatal: bad range");
      const count = await git.countCommitsBetween("bad", "refs");
      expect(count).toBe(0);
    });
  });

  describe("refExists", () => {
    it("returns true when ref exists", async () => {
      mockGitCommand("abc123");
      const result = await git.refExists("openclaw/main");
      expect(result).toBe(true);
    });

    it("returns false when ref doesn't exist", async () => {
      mockGitError("fatal: Needed a single revision");
      const result = await git.refExists("nonexistent/branch");
      expect(result).toBe(false);
    });
  });

  describe("getLatestTag", () => {
    it("returns tag when found", async () => {
      mockGitCommand("v2026.2.3\n");
      const tag = await git.getLatestTag("HEAD");
      expect(tag).toBe("v2026.2.3");
    });

    it("returns null when no tag found", async () => {
      mockGitError("fatal: No names found");
      const tag = await git.getLatestTag("HEAD");
      expect(tag).toBeNull();
    });
  });

  describe("getCommitsBetween", () => {
    it("parses commit output into structured objects", async () => {
      const output = [
        "abc123def456789",
        "feat: add new feature",
        "Alice Developer",
        "2026-02-08 12:00:00 +0000",
        "---",
        "def456789abc123",
        "fix: resolve crash",
        "Bob Developer",
        "2026-02-07 10:00:00 +0000",
        "---",
        "",
      ].join("\n");

      mockGitCommand(output);
      const commits = await git.getCommitsBetween("HEAD", "openclaw/main");

      expect(commits).toHaveLength(2);
      expect(commits[0]).toEqual({
        sha: "abc123def456789",
        message: "feat: add new feature",
        author: "Alice Developer",
        date: "2026-02-08 12:00:00 +0000",
      });
      expect(commits[1]).toEqual({
        sha: "def456789abc123",
        message: "fix: resolve crash",
        author: "Bob Developer",
        date: "2026-02-07 10:00:00 +0000",
      });
    });

    it("returns empty array for no commits", async () => {
      mockGitCommand("");
      const commits = await git.getCommitsBetween("HEAD", "HEAD");
      expect(commits).toEqual([]);
    });
  });
});
