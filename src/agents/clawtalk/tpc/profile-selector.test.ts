/**
 * Profile Selector Unit Tests
 *
 * Tests for the hardware probe integration and mode selection logic.
 * Uses mock probe results — no actual audio hardware required.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { HardwareProfile } from "./types.js";
import {
  getAFSKParamsForMode,
  ULTRASONIC_AFSK_PARAMS,
  AUDIBLE_AFSK_PARAMS,
} from "./profile-selector.js";
import { DEFAULT_AFSK_PARAMS, ULTRASONIC_AFSK_PARAMS as ULTRASONIC_TYPES_PARAMS } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tpc-profile-test-"));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("profile-selector", () => {
  describe("getAFSKParamsForMode", () => {
    it("returns ultrasonic params for ultrasonic mode", () => {
      const params = getAFSKParamsForMode("ultrasonic");
      expect(params.freq0).toBe(18000);
      expect(params.freq1).toBe(20000);
      expect(params.sampleRate).toBe(48000);
      expect(params.baudRate).toBe(150);
    });

    it("returns Bell 202 params for audible mode", () => {
      const params = getAFSKParamsForMode("audible");
      expect(params.freq0).toBe(1200);
      expect(params.freq1).toBe(2400);
      expect(params.baudRate).toBe(300);
    });

    it("returns default params for file mode", () => {
      const params = getAFSKParamsForMode("file");
      expect(params).toEqual(DEFAULT_AFSK_PARAMS);
    });

    it("returns default params for auto mode", () => {
      const params = getAFSKParamsForMode("auto");
      expect(params).toEqual(DEFAULT_AFSK_PARAMS);
    });
  });

  describe("AFSK param constants", () => {
    it("ULTRASONIC_AFSK_PARAMS has correct ultrasonic frequencies", () => {
      expect(ULTRASONIC_AFSK_PARAMS.freq0).toBe(18000);
      expect(ULTRASONIC_AFSK_PARAMS.freq1).toBe(20000);
      // Nyquist: sample rate must be > 2 * max freq
      expect(ULTRASONIC_AFSK_PARAMS.sampleRate).toBeGreaterThan(
        2 * Math.max(ULTRASONIC_AFSK_PARAMS.freq0, ULTRASONIC_AFSK_PARAMS.freq1),
      );
    });

    it("AUDIBLE_AFSK_PARAMS matches Bell 202 standard", () => {
      expect(AUDIBLE_AFSK_PARAMS.freq0).toBe(1200);
      expect(AUDIBLE_AFSK_PARAMS.freq1).toBe(2400);
      expect(AUDIBLE_AFSK_PARAMS.baudRate).toBe(300);
    });

    it("types.ts ULTRASONIC_AFSK_PARAMS matches profile-selector constant", () => {
      expect(ULTRASONIC_TYPES_PARAMS).toEqual(ULTRASONIC_AFSK_PARAMS);
    });
  });

  describe("cache operations", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanup(tmpDir);
    });

    it("saveCachedProfile saves and loadCachedProfile reads back", async () => {
      // We test indirectly through selectProfile's cache mechanism.
      // Write a mock cache file and verify it's loaded.
      const cacheFile = path.join(tmpDir, "hardware-profile.json");
      const mockProfile: HardwareProfile = {
        ultrasonicSupported: true,
        selectedMode: "ultrasonic",
        carrierFrequencies: [18000, 20000],
        snrDb: 28.5,
        packetErrorRate: 0.02,
      };
      const cached = {
        profile: mockProfile,
        timestamp: Date.now(),
      };
      fs.writeFileSync(cacheFile, JSON.stringify(cached));

      // Import selectProfile dynamically to test cache loading
      const { selectProfile } = await import("./profile-selector.js");
      const result = await selectProfile({
        cachePath: tmpDir,
        pythonBin: "python3",
      });

      expect(result.selectedMode).toBe("ultrasonic");
      expect(result.ultrasonicSupported).toBe(true);
      expect(result.snrDb).toBe(28.5);
      expect(result.packetErrorRate).toBe(0.02);
    });

    it("returns file mode when cache is stale (> 24h)", async () => {
      const cacheFile = path.join(tmpDir, "hardware-profile.json");
      const staleProfile: HardwareProfile = {
        ultrasonicSupported: true,
        selectedMode: "ultrasonic",
        carrierFrequencies: [18000, 20000],
        snrDb: 28.5,
        packetErrorRate: 0.02,
      };
      const cached = {
        profile: staleProfile,
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      fs.writeFileSync(cacheFile, JSON.stringify(cached));

      const { selectProfile } = await import("./profile-selector.js");
      // With no Python available (spoofed), should default to file mode
      const result = await selectProfile({
        cachePath: tmpDir,
        pythonBin: "/nonexistent/python3",
      });

      // Stale cache ignored, fallback to file mode
      expect(result.selectedMode).toBe("file");
      expect(result.ultrasonicSupported).toBe(false);
    });

    it("invalidateCache removes the cache file", async () => {
      const cacheFile = path.join(tmpDir, "hardware-profile.json");
      fs.writeFileSync(cacheFile, JSON.stringify({ profile: {}, timestamp: Date.now() }));
      expect(fs.existsSync(cacheFile)).toBe(true);

      const { invalidateCache } = await import("./profile-selector.js");
      await invalidateCache(tmpDir);

      expect(fs.existsSync(cacheFile)).toBe(false);
    });

    it("invalidateCache is a no-op when no cache exists", async () => {
      const { invalidateCache } = await import("./profile-selector.js");
      // Should not throw
      await invalidateCache(tmpDir);
    });
  });

  describe("selectProfile fallback behavior", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanup(tmpDir);
    });

    it("defaults to file mode when Python is not available", async () => {
      const { selectProfile } = await import("./profile-selector.js");
      const result = await selectProfile({
        cachePath: tmpDir,
        pythonBin: "/nonexistent/python3",
        forceReprobe: true,
      });

      expect(result.selectedMode).toBe("file");
      expect(result.ultrasonicSupported).toBe(false);
    });

    it("creates cache file even on fallback", async () => {
      const { selectProfile } = await import("./profile-selector.js");
      await selectProfile({
        cachePath: tmpDir,
        pythonBin: "/nonexistent/python3",
        forceReprobe: true,
      });

      const cacheFile = path.join(tmpDir, "hardware-profile.json");
      expect(fs.existsSync(cacheFile)).toBe(true);

      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
      expect(cached.profile.selectedMode).toBe("file");
    });

    it("logs warning when Python is unavailable", async () => {
      const warnings: string[] = [];
      const { selectProfile } = await import("./profile-selector.js");
      await selectProfile({
        cachePath: tmpDir,
        pythonBin: "/nonexistent/python3",
        forceReprobe: true,
        log: {
          warn: (msg) => warnings.push(msg),
        },
      });

      expect(warnings.some((w) => w.includes("Python3 not available"))).toBe(true);
    });

    it("forceReprobe skips cache", async () => {
      // Write a fresh cache with ultrasonic mode
      const cacheFile = path.join(tmpDir, "hardware-profile.json");
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({
          profile: {
            ultrasonicSupported: true,
            selectedMode: "ultrasonic",
            snrDb: 30,
            packetErrorRate: 0.01,
          },
          timestamp: Date.now(),
        }),
      );

      const { selectProfile } = await import("./profile-selector.js");
      // Force reprobe — cache is ignored, and without Python, falls back to file
      const result = await selectProfile({
        cachePath: tmpDir,
        pythonBin: "/nonexistent/python3",
        forceReprobe: true,
      });

      expect(result.selectedMode).toBe("file");
    });
  });

  describe("checkAudioDevices", () => {
    it("returns available=false when Python is not found", async () => {
      const { checkAudioDevices } = await import("./profile-selector.js");
      const result = await checkAudioDevices({ pythonBin: "/nonexistent/python3" });
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
