/**
 * Tests for upstream storage functions.
 *
 * Tests cover:
 * - loadUpstreamTracking / saveUpstreamTracking
 * - loadUpstreamConfig / saveUpstreamConfig
 * - Path resolution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadUpstreamTracking,
  saveUpstreamTracking,
  loadUpstreamConfig,
  saveUpstreamConfig,
  getUpstreamTrackingPath,
  getUpstreamConfigPath,
} from "./upstream.storage.js";
import type { UpstreamTrackingState, UpstreamConfig } from "./upstream.types.js";
import { DEFAULT_UPSTREAM_TRACKING, DEFAULT_UPSTREAM_CONFIG } from "./upstream.types.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─── Path Resolution ─────────────────────────────────────────────────────────

describe("path resolution", () => {
  it("tracking path is under ~/.closedclaw/", async () => {
    const trackingPath = await getUpstreamTrackingPath();
    expect(trackingPath).toContain(".closedclaw");
    expect(trackingPath).toContain("upstream-tracking");
  });

  it("config path is under ~/.closedclaw/", async () => {
    const configPath = await getUpstreamConfigPath();
    expect(configPath).toContain(".closedclaw");
    expect(configPath).toContain("upstream-config");
  });
});

// ─── Tracking State ──────────────────────────────────────────────────────────

describe("upstream tracking state", () => {
  let tmpDir: string;
  let trackingFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "closedclaw-test-"));
    trackingFile = path.join(tmpDir, "upstream-tracking.json5");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns default when file does not exist", async () => {
    const result = await loadUpstreamTracking(DEFAULT_UPSTREAM_TRACKING);
    // Should return through default path or fallback
    expect(result).toBeDefined();
    expect(result.forkPoint).toBe("v2026.2.1");
  });

  it("DEFAULT_UPSTREAM_TRACKING has correct shape", () => {
    expect(DEFAULT_UPSTREAM_TRACKING).toMatchObject({
      forkPoint: "v2026.2.1",
      remoteUrl: "https://github.com/openclaw/openclaw.git",
      trackingBranch: "openclaw/main",
      divergenceCommits: 0,
      securityPatchesPending: [],
      featuresAvailable: [],
    });
    expect(DEFAULT_UPSTREAM_TRACKING.lastSync).toBeDefined();
    expect(DEFAULT_UPSTREAM_TRACKING.lastCheck).toBeDefined();
  });

  it("DEFAULT_UPSTREAM_CONFIG has correct shape", () => {
    expect(DEFAULT_UPSTREAM_CONFIG).toEqual({
      autoApplySecurity: false,
      checkInterval: 24,
      remoteUrl: "https://github.com/openclaw/openclaw.git",
      trackingBranch: "openclaw/main",
    });
  });
});

// ─── Round-trip Save/Load ────────────────────────────────────────────────────

describe("tracking save/load round-trip", () => {
  let tmpDir: string;
  let originalHomedir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "closedclaw-test-"));
    // We need to mock homedir for the save/load functions
    originalHomedir = os.homedir();
    vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("can save and reload tracking state", async () => {
    const state: UpstreamTrackingState = {
      forkPoint: "v2026.2.1",
      lastSync: "2026-02-08T00:00:00Z",
      upstreamVersion: "v2026.2.6",
      divergenceCommits: 47,
      securityPatchesPending: ["CVE-2026-0001"],
      featuresAvailable: ["Multi-model routing"],
      lastCheck: "2026-02-09T00:00:00Z",
      remoteUrl: "https://github.com/openclaw/openclaw.git",
      trackingBranch: "openclaw/main",
    };

    await saveUpstreamTracking(state);
    const loaded = await loadUpstreamTracking<UpstreamTrackingState>(DEFAULT_UPSTREAM_TRACKING);

    expect(loaded.forkPoint).toBe("v2026.2.1");
    expect(loaded.upstreamVersion).toBe("v2026.2.6");
    expect(loaded.divergenceCommits).toBe(47);
    expect(loaded.securityPatchesPending).toEqual(["CVE-2026-0001"]);
    expect(loaded.featuresAvailable).toEqual(["Multi-model routing"]);
  });

  it("can save and reload upstream config", async () => {
    const config: UpstreamConfig = {
      autoApplySecurity: true,
      checkInterval: 12,
      remoteUrl: "https://custom.git/repo.git",
      trackingBranch: "custom/main",
    };

    await saveUpstreamConfig(config);
    const loaded = await loadUpstreamConfig<UpstreamConfig>(DEFAULT_UPSTREAM_CONFIG);

    expect(loaded.autoApplySecurity).toBe(true);
    expect(loaded.checkInterval).toBe(12);
    expect(loaded.remoteUrl).toBe("https://custom.git/repo.git");
    expect(loaded.trackingBranch).toBe("custom/main");
  });

  it("returns default value when file contains invalid JSON", async () => {
    const trackingPath = await getUpstreamTrackingPath();
    await fs.mkdir(path.dirname(trackingPath), { recursive: true });
    await fs.writeFile(trackingPath, "not valid json {{{", "utf-8");

    const loaded = await loadUpstreamTracking(DEFAULT_UPSTREAM_TRACKING);
    expect(loaded).toEqual(DEFAULT_UPSTREAM_TRACKING);
  });

  it("creates parent directories when saving", async () => {
    const state = { ...DEFAULT_UPSTREAM_TRACKING, upstreamVersion: "v3.0.0" };
    await saveUpstreamTracking(state);

    const trackingPath = await getUpstreamTrackingPath();
    const content = await fs.readFile(trackingPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.upstreamVersion).toBe("v3.0.0");
  });
});
