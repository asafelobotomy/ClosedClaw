/**
 * Unified Launch Command
 *
 * Single command that:
 * 1. Ensures a gateway token exists
 * 2. Starts the gateway in the background (if not already running)
 * 3. Waits for the gateway to become ready
 * 4. Launches the GTK GUI with connection details
 *
 * Usage: closedclaw launch [--gui-only] [--gateway-only] [--port <port>]
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import type { RuntimeEnv } from "../runtime.js";
import { readConfigFileSnapshot, resolveGatewayPort, resolveStateDir } from "../config/config.js";
import { isGatewayRunning, waitForGatewayReady } from "../gateway/readiness.js";
import { ensureGatewayToken } from "./token.js";

export type LaunchOptions = {
  /** Only start the gateway, do not launch the GTK GUI. */
  gatewayOnly?: boolean;
  /** Only launch the GTK GUI (assume gateway is already running). */
  guiOnly?: boolean;
  /** Override gateway port. */
  port?: number;
  /** Path to the GTK GUI Python script. Falls back to discovery. */
  guiPath?: string;
  /** Maximum time (ms) to wait for the gateway to become ready. */
  timeoutMs?: number;
  /** Be verbose about what is happening. */
  verbose?: boolean;
};

export async function launchCommand(
  runtime: RuntimeEnv,
  options: LaunchOptions = {},
): Promise<void> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.valid ? snapshot.config : {};
  const port = options.port ?? resolveGatewayPort(cfg);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const verbose = options.verbose ?? false;

  // -----------------------------------------------------------------------
  // 1. Ensure a token exists (generate + save if needed)
  // -----------------------------------------------------------------------
  const tokenResult = await ensureGatewayToken();
  if (verbose) {
    runtime.log("Token source: " + tokenResult.source);
  }

  // -----------------------------------------------------------------------
  // 2. Start or detect gateway
  // -----------------------------------------------------------------------
  if (!options.guiOnly) {
    const alreadyRunning = await isGatewayRunning(port);
    if (alreadyRunning) {
      runtime.log("Gateway already running on port " + port + ".");
    } else {
      runtime.log("Starting gateway on port " + port + "...");
      await startGatewayBackground(runtime, port, tokenResult.token, verbose);

      const readiness = await waitForGatewayReady({ port, timeoutMs });
      if (!readiness.ok) {
        runtime.error(readiness.error ?? "Gateway did not become ready in time.");
        runtime.exit(1);
        return;
      }
      runtime.log("Gateway ready (" + readiness.elapsedMs + "ms).");
    }
  }

  // -----------------------------------------------------------------------
  // 3. Launch GTK GUI
  // -----------------------------------------------------------------------
  if (!options.gatewayOnly) {
    const guiScript = resolveGuiPath(options.guiPath);
    if (!guiScript) {
      runtime.error(
        "GTK GUI script not found. Ensure apps/gtk-gui/closedclaw_messenger.py exists.",
      );
      runtime.exit(1);
      return;
    }

    runtime.log("Launching GTK GUI...");
    launchGtkGui(guiScript, port, tokenResult.token);
  } else {
    runtime.log("Gateway-only mode. Press Ctrl+C to stop.");
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveGuiPath(override?: string): string | null {
  if (override && existsSync(override)) {
    return override;
  }

  // Try relative to the project root (from-source development)
  const candidates = [
    path.resolve("apps/gtk-gui/closedclaw_messenger.py"),
    path.resolve(__dirname, "../../apps/gtk-gui/closedclaw_messenger.py"),
    // Installed via npm: look relative to package root
    path.resolve(__dirname, "../../../apps/gtk-gui/closedclaw_messenger.py"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function startGatewayBackground(
  runtime: RuntimeEnv,
  port: number,
  token: string,
  verbose: boolean,
): Promise<void> {
  const stateDir = resolveStateDir();
  const pidFile = path.join(stateDir, "gateway.pid");
  const logDir = path.join(stateDir, "logs");
  mkdirSync(logDir, { recursive: true });

  // Check for stale PID file
  if (existsSync(pidFile)) {
    try {
      const oldPid = Number.parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      if (Number.isFinite(oldPid)) {
        try {
          process.kill(oldPid, 0); // check if alive
          // Process is alive — gateway may already be running
          return;
        } catch {
          // Process is dead, remove stale PID file
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ClosedClaw_GATEWAY_TOKEN: token,
  };

  // Use the same entry point as `pnpm dev:gateway`
  const entryScript = resolveGatewayEntry();
  const args = [entryScript, "gateway", "--port", String(port)];
  if (verbose) {
    args.push("--verbose");
  }

  const logFile = path.join(logDir, "gateway-launch.log");
  const fs = await import("node:fs");
  const out = fs.openSync(logFile, "a");

  const child: ChildProcess = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", out, out],
    detached: true,
  });

  child.unref();

  if (child.pid) {
    writeFileSync(pidFile, String(child.pid) + "\n");
  }

  if (verbose) {
    runtime.log("Gateway PID: " + (child.pid ?? "unknown"));
    runtime.log("Log: " + logFile);
  }
}

function resolveGatewayEntry(): string {
  // From-source: use closedclaw.mjs at project root
  const mjsEntry = path.resolve("closedclaw.mjs");
  if (existsSync(mjsEntry)) {
    return mjsEntry;
  }
  // Installed: use dist/entry.js
  const distEntry = path.resolve(__dirname, "../entry.js");
  if (existsSync(distEntry)) {
    return distEntry;
  }
  return mjsEntry; // Fallback; will fail with a clear error
}

function launchGtkGui(scriptPath: string, port: number, token: string): void {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ClosedClaw_GATEWAY_PORT: String(port),
    ClosedClaw_GATEWAY_TOKEN: token,
    GSK_RENDERER: "cairo", // Avoid OpenGL/EGL issues on some Linux setups
  };

  const child = spawn("python3", [scriptPath], {
    cwd: path.dirname(scriptPath),
    env,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals to the GUI process
  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
}
