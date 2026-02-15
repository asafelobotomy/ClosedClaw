/**
 * Desktop Integration Commands
 *
 * Install / uninstall a freedesktop .desktop entry so ClosedClaw appears
 * in the application menu on Linux desktops (GNOME, KDE, XFCE, etc.).
 *
 * Usage:
 *   closedclaw desktop install
 *   closedclaw desktop uninstall
 */

import { copyFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import type { RuntimeEnv } from "../runtime.js";

const DESKTOP_FILENAME = "ai.closedclaw.messenger.desktop";

function applicationsDir(): string {
  return path.join(homedir(), ".local", "share", "applications");
}

function installedPath(): string {
  return path.join(applicationsDir(), DESKTOP_FILENAME);
}

function sourceDesktopFile(): string | null {
  const candidates = [
    path.resolve("scripts/desktop", DESKTOP_FILENAME),
    path.resolve("apps/gtk-gui", DESKTOP_FILENAME),
    path.resolve(__dirname, "../../scripts/desktop", DESKTOP_FILENAME),
    path.resolve(__dirname, "../../apps/gtk-gui", DESKTOP_FILENAME),
    path.resolve(__dirname, "../../../scripts/desktop", DESKTOP_FILENAME),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function updateDesktopDatabase(): void {
  const dir = applicationsDir();
  spawnSync("update-desktop-database", [dir], { stdio: "ignore" });
}

export async function desktopInstallCommand(runtime: RuntimeEnv): Promise<void> {
  const source = sourceDesktopFile();
  if (!source) {
    runtime.error(
      "Desktop entry file not found. Ensure scripts/desktop/" +
        DESKTOP_FILENAME +
        " or apps/gtk-gui/" +
        DESKTOP_FILENAME +
        " exists.",
    );
    runtime.exit(1);
    return;
  }

  const dest = installedPath();
  mkdirSync(applicationsDir(), { recursive: true });
  copyFileSync(source, dest);
  updateDesktopDatabase();

  runtime.log("Desktop entry installed: " + dest);
  runtime.log("ClosedClaw should now appear in your application menu.");
}

export async function desktopUninstallCommand(runtime: RuntimeEnv): Promise<void> {
  const dest = installedPath();
  if (!existsSync(dest)) {
    runtime.log("Desktop entry not installed (nothing to remove).");
    return;
  }

  unlinkSync(dest);
  updateDesktopDatabase();
  runtime.log("Desktop entry removed.");
}
