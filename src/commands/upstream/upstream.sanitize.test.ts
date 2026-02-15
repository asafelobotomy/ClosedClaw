import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitService } from "./upstream.git.js";
import { upstreamSanitizeCommand } from "./upstream.sanitize.js";
import * as storage from "./upstream.storage.js";
import { DEFAULT_UPSTREAM_TRACKING } from "./upstream.types.js";

describe("upstreamSanitizeCommand", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects already-applied commits and applies clean ones when requested", async () => {
    vi.spyOn(storage, "loadUpstreamTracking").mockResolvedValue(DEFAULT_UPSTREAM_TRACKING);
    vi.spyOn(storage, "saveUpstreamTracking").mockResolvedValue();

    vi.spyOn(GitService.prototype, "remoteExists").mockResolvedValue(true);
    vi.spyOn(GitService.prototype, "fetch").mockResolvedValue();
    vi.spyOn(GitService.prototype, "refExists").mockResolvedValue(true);
    vi.spyOn(GitService.prototype, "getCommitsBetween").mockResolvedValue([
      { sha: "111", message: "Security: already here", author: "dev", date: "" },
      { sha: "222", message: "Security: clean apply", author: "dev", date: "" },
    ]);
    vi.spyOn(GitService.prototype, "getPatchIds").mockResolvedValue(new Set(["patch-111"]));
    vi.spyOn(GitService.prototype, "getPatchId").mockImplementation(async (sha: string) =>
      sha === "111" ? "patch-111" : "patch-222",
    );
    vi.spyOn(GitService.prototype, "getCommitFiles").mockResolvedValue(["src/app.ts"]);
    vi.spyOn(GitService.prototype, "canApplyCommit").mockImplementation(async (sha: string) =>
      sha === "222" ? { status: "clean" as const } : { status: "clean" as const },
    );
    const cherryPick = vi.spyOn(GitService.prototype, "cherryPick").mockResolvedValue();

    const report = await upstreamSanitizeCommand({ applyClean: true, json: true }, {} as never);

    expect(report?.summary.totalSecurity).toBe(2);
    expect(report?.summary.applied).toBe(2);
    expect(report?.summary.appliedNow).toBe(1);
    expect(cherryPick).toHaveBeenCalledTimes(1);
    expect(cherryPick).toHaveBeenCalledWith("222", { noCommit: false });
  });

  it("surfaces conflicts without applying when auto-apply is off", async () => {
    vi.spyOn(storage, "loadUpstreamTracking").mockResolvedValue(DEFAULT_UPSTREAM_TRACKING);
    vi.spyOn(storage, "saveUpstreamTracking").mockResolvedValue();

    vi.spyOn(GitService.prototype, "remoteExists").mockResolvedValue(true);
    vi.spyOn(GitService.prototype, "fetch").mockResolvedValue();
    vi.spyOn(GitService.prototype, "refExists").mockResolvedValue(true);
    vi.spyOn(GitService.prototype, "getCommitsBetween").mockResolvedValue([
      { sha: "333", message: "Security: conflict", author: "dev", date: "" },
    ]);
    vi.spyOn(GitService.prototype, "getPatchIds").mockResolvedValue(new Set());
    vi.spyOn(GitService.prototype, "getPatchId").mockResolvedValue("patch-333");
    vi.spyOn(GitService.prototype, "getCommitFiles").mockResolvedValue(["src/conflict.ts"]);
    vi.spyOn(GitService.prototype, "canApplyCommit").mockResolvedValue({
      status: "conflict",
      detail: "context mismatch",
    });
    const cherryPick = vi.spyOn(GitService.prototype, "cherryPick");

    const report = await upstreamSanitizeCommand({ json: true }, {} as never);

    expect(report?.summary.conflicts).toBe(1);
    expect(report?.summary.appliedNow).toBe(0);
    expect(cherryPick).not.toHaveBeenCalled();
  });
});
