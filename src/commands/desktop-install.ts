/**
 * Desktop Integration Commands
 *
 * Install/uninstall a freedesktop .desktop entry so ClosedClaw appears
 * in the Linux application menu. Only relevant on Linux; silently
 * no-ops on other platforms.
 */

import { execSync } from "node:child_process";
import { existsSync, copyFileSync, unlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { RuntimeEnv } from "../runtime.js";

const DESKTOP_FILE_NAME = "ai.closedclaw.messenger.desktop";

function resolveDesktopSource(): string | null {
  const candidates = [
    path.resolve("scripts/desktop", DESKTOP_FILE_NAME),
    path.resolve(__dirname, "../../scripts/desktop", DESKTOP_FILE_NAME),
    path.resolve(__dirname, "../../../scripts/desktop", DESKTOP_FILE_NAME),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }
  return null;
}

function applicationsDir(): string {
  return path.join(homedir(), ".local/share/applications");
}

export async function desktopInstallCommand(runtime: RuntimeEnv): Promise<void> {
  if (process.platform !== "linux") {
    runtime.log("Desktop integration is only supported on Linux.");
    return;
  }

  const src = resolveDesktopSource();
  if (!src) {
    runtime.error(
      "Desktop file not found. Ensure scripts/desktop/" + DESKTOP_FILE_NAME + " exists.",
    );
    runtime.exit(1);
    return;
  }

  const destDir = applicationsDir();
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, DESKTOP_FILE_NAME);
  copyFileSync(src, dest);
  runtime.log("Installed " + dest);

  try {
    execSync("update-desktop-database " + destDir, { stdio: "ignore" });
  } catch {
    // Non-fatal: desktop database update is optional
  }

  runtime.log("ClosedClaw should now appear in your application menu.");
}

export async function desktopUninstallCommand(runtime: RuntimeEnv): Promise<void> {
  if (process.platform !== "linux") {
    runtime.log("Desktop integration is only supported on Linux.");
    return;
  }

  const dest = path.join(applicationsDir(), DESKTOP_FILE_NAME);
  if (!existsSync(dest)) {
    runtime.log("No desktop entry found at " + dest);
    return;
  }

  unlinkSync(dest);
  runtime.log("Removed " + dest);

  try {
    execSync("update-desktop-database " + applicationsDir(), { stdio: "ignore" });
  } catch {
    // Non-fatal
  }
}
