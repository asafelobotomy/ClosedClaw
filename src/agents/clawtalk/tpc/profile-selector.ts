/**
 * TPC Profile Selector
 *
 * Detects hardware capabilities by shelling out to Python audio probes,
 * selects the optimal TPC transport mode, and caches the result.
 *
 * Decision chain:
 *   1. Run probes/decide.py --auto (or with cached results)
 *   2. Parse JSON output → HardwareProfile
 *   3. Cache profile to disk (avoids re-probing on every startup)
 *   4. Falls back to "file" mode if probes fail or SNR is insufficient
 *
 * The profile-selector NEVER blocks agent communication — if probing
 * fails, it immediately returns file mode (the safe default).
 */

import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { HardwareProfile, TPCTransportMode, AFSKParams } from "./types.js";
import { DEFAULT_AFSK_PARAMS } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path to the probes directory (relative to this file at build time) */
const PROBES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "probes");

/** Cache validity period (24 hours) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Probe execution timeout (30 seconds) */
const PROBE_TIMEOUT_MS = 30_000;

/** Ultrasonic AFSK parameters (18/20 kHz carriers, 150 baud) */
export const ULTRASONIC_AFSK_PARAMS: AFSKParams = {
  freq0: 18000,
  freq1: 20000,
  sampleRate: 48000,
  baudRate: 150,
  bitsPerSample: 16,
  channels: 1,
};

/** Audible AFSK parameters (same as default Bell 202) */
export const AUDIBLE_AFSK_PARAMS: AFSKParams = DEFAULT_AFSK_PARAMS;

// ---------------------------------------------------------------------------
// Probe result types (JSON output from Python scripts)
// ---------------------------------------------------------------------------

interface DecideProbeResult {
  probe: "decide";
  success: boolean;
  error?: string;
  snr_db?: number;
  per?: number;
  decision?: {
    mode: "ultrasonic" | "audible" | "file";
    freq0_hz: number | null;
    freq1_hz: number | null;
    baud_rate: number | null;
    reason: string;
    confidence: number;
  };
  steps?: Array<Record<string, unknown>>;
}

interface CachedProfile {
  profile: HardwareProfile;
  timestamp: number;
  probeResult?: DecideProbeResult;
}

// ---------------------------------------------------------------------------
// File-mode fallback profile
// ---------------------------------------------------------------------------

const FILE_MODE_PROFILE: HardwareProfile = {
  ultrasonicSupported: false,
  selectedMode: "file",
  snrDb: undefined,
  packetErrorRate: undefined,
};

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Probe the hardware and select the optimal TPC transport mode.
 *
 * This is the primary entry point. It:
 *   1. Checks the cache; returns cached profile if fresh
 *   2. Runs the Python decide.py probe
 *   3. Parses the result into a HardwareProfile
 *   4. Caches the result for future calls
 *   5. Falls back to file mode on any error
 *
 * @param cachePath - Directory to store cached profile (e.g., ~/.closedclaw/tpc/)
 * @param pythonBin - Python executable (default: "python3")
 * @param forceReprobe - Skip cache and re-probe (default: false)
 * @param log - Optional logger
 */
export async function selectProfile(params: {
  cachePath: string;
  pythonBin?: string;
  forceReprobe?: boolean;
  sampleRate?: number;
  log?: {
    info?: (msg: string) => void;
    debug?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}): Promise<HardwareProfile> {
  const { cachePath, log } = params;
  const pythonBin = params.pythonBin ?? "python3";
  const sampleRate = params.sampleRate ?? 48000;

  // 1. Check cache (unless force-reprobing)
  if (!params.forceReprobe) {
    const cached = await loadCachedProfile(cachePath);
    if (cached) {
      log?.debug?.(`Using cached hardware profile (mode=${cached.selectedMode})`);
      return cached;
    }
  }

  // 2. Check Python is available
  const pythonAvailable = await checkPython(pythonBin);
  if (!pythonAvailable) {
    log?.warn?.("Python3 not available — defaulting to file mode");
    const profile = FILE_MODE_PROFILE;
    await saveCachedProfile(cachePath, profile);
    return profile;
  }

  // 3. Check numpy/sounddevice availability
  const depsAvailable = await checkPythonDeps(pythonBin);
  if (!depsAvailable) {
    log?.warn?.(
      "Python audio dependencies (numpy/sounddevice) not available — defaulting to file mode",
    );
    const profile = FILE_MODE_PROFILE;
    await saveCachedProfile(cachePath, profile);
    return profile;
  }

  // 4. Run the decide.py probe
  log?.info?.("Running TPC hardware probe...");
  let probeResult: DecideProbeResult;

  try {
    const output = await runProbe(pythonBin, "decide.py", [
      "--auto",
      "--sample-rate",
      String(sampleRate),
    ]);
    probeResult = JSON.parse(output) as DecideProbeResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.warn?.(`Hardware probe failed: ${msg} — defaulting to file mode`);
    const profile = FILE_MODE_PROFILE;
    await saveCachedProfile(cachePath, profile);
    return profile;
  }

  // 5. Parse result into HardwareProfile
  const profile = parseProbeResult(probeResult);
  log?.info?.(
    `Hardware probe complete: mode=${profile.selectedMode}, ` +
      `SNR=${profile.snrDb?.toFixed(1) ?? "N/A"} dB, ` +
      `PER=${profile.packetErrorRate !== undefined ? (profile.packetErrorRate * 100).toFixed(1) + "%" : "N/A"}`,
  );

  // 6. Cache the result
  await saveCachedProfile(cachePath, profile, probeResult);

  return profile;
}

/**
 * Run a quick device check without full probing.
 * Returns whether audio I/O is available at all.
 */
export async function checkAudioDevices(params: {
  pythonBin?: string;
}): Promise<{ available: boolean; input?: string; output?: string; error?: string }> {
  const pythonBin = params.pythonBin ?? "python3";

  try {
    const output = await runProbe(pythonBin, "sweep.py", ["--check-only"]);
    const result = JSON.parse(output);
    const devices = result.devices ?? {};

    if (devices.error) {
      return { available: false, error: devices.error };
    }

    return {
      available: true,
      input: devices.input?.name,
      output: devices.output?.name,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get the AFSK parameters for a given transport mode.
 */
export function getAFSKParamsForMode(mode: TPCTransportMode): AFSKParams {
  switch (mode) {
    case "ultrasonic":
      return ULTRASONIC_AFSK_PARAMS;
    case "audible":
      return AUDIBLE_AFSK_PARAMS;
    case "file":
      return DEFAULT_AFSK_PARAMS; // File mode uses standard Bell 202
    case "auto":
      return DEFAULT_AFSK_PARAMS; // Auto resolves at probe time
    default:
      return DEFAULT_AFSK_PARAMS;
  }
}

/**
 * Invalidate the cached hardware profile, forcing a re-probe on next call.
 */
export async function invalidateCache(cachePath: string): Promise<void> {
  const cacheFile = path.join(cachePath, "hardware-profile.json");
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(cacheFile);
  } catch {
    // File doesn't exist — that's fine
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseProbeResult(result: DecideProbeResult): HardwareProfile {
  if (!result.success || !result.decision) {
    return FILE_MODE_PROFILE;
  }

  const decision = result.decision;
  const mode = decision.mode as TPCTransportMode;

  return {
    ultrasonicSupported: mode === "ultrasonic",
    selectedMode: mode,
    carrierFrequencies:
      decision.freq0_hz && decision.freq1_hz ? [decision.freq0_hz, decision.freq1_hz] : undefined,
    snrDb: result.snr_db,
    packetErrorRate: result.per,
  };
}

async function loadCachedProfile(cachePath: string): Promise<HardwareProfile | null> {
  const cacheFile = path.join(cachePath, "hardware-profile.json");
  try {
    const raw = await readFile(cacheFile, "utf-8");
    const cached: CachedProfile = JSON.parse(raw);

    // Check TTL
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      return null; // Stale
    }

    return cached.profile;
  } catch {
    return null; // Cache miss
  }
}

async function saveCachedProfile(
  cachePath: string,
  profile: HardwareProfile,
  probeResult?: DecideProbeResult,
): Promise<void> {
  try {
    await mkdir(cachePath, { recursive: true });
    const cacheFile = path.join(cachePath, "hardware-profile.json");
    const cached: CachedProfile = {
      profile,
      timestamp: Date.now(),
      probeResult,
    };
    await writeFile(cacheFile, JSON.stringify(cached, null, 2), "utf-8");
  } catch {
    // Cache write failure is non-fatal
  }
}

async function checkPython(pythonBin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(pythonBin, ["--version"], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

async function checkPythonDeps(pythonBin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      pythonBin,
      ["-c", "import numpy; import sounddevice; print('ok')"],
      { timeout: 10000 },
      (err, stdout) => {
        resolve(!err && stdout.trim() === "ok");
      },
    );
  });
}

function runProbe(pythonBin: string, script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(PROBES_DIR, script);

    execFile(
      pythonBin,
      [scriptPath, ...args],
      {
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1 MB
        env: {
          ...process.env,
          // Ensure Python outputs UTF-8
          PYTHONIOENCODING: "utf-8",
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `Probe ${script} failed: ${err.message}${stderr ? ` — ${stderr.trim()}` : ""}`,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}
