import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));
vi.mock("node:fs", () => {
  const existsSync = vi.fn();
  const readFileSync = vi.fn();
  return {
    existsSync,
    readFileSync,
    default: { existsSync, readFileSync },
  };
});
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

describe("browser default executable detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("prefers default Chromium browser on Linux via xdg-settings", async () => {
    vi.mocked(execFileSync).mockImplementation((cmd, _args) => {
      if (cmd === "xdg-settings") {
        return "google-chrome.desktop";
      }
      return "";
    });
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const value = String(p);
      return value === "/usr/share/applications/google-chrome.desktop";
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes("google-chrome.desktop")) {
        return "[Desktop Entry]\nExec=/usr/bin/google-chrome %U\n";
      }
      return "";
    });

    const { resolveBrowserExecutableForPlatform } = await import("./chrome.executables.js");
    const exe = resolveBrowserExecutableForPlatform(
      {} as Parameters<typeof resolveBrowserExecutableForPlatform>[0],
      "linux",
    );

    expect(exe?.path).toBe("/usr/bin/google-chrome");
    expect(exe?.kind).toBe("chrome");
  });

  it("falls back to known candidates when default browser is non-Chromium on Linux", async () => {
    vi.mocked(execFileSync).mockImplementation((cmd) => {
      if (cmd === "xdg-settings" || cmd === "xdg-mime") {
        return "firefox.desktop";
      }
      return "";
    });
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === "/usr/bin/google-chrome";
    });

    const { resolveBrowserExecutableForPlatform } = await import("./chrome.executables.js");
    const exe = resolveBrowserExecutableForPlatform(
      {} as Parameters<typeof resolveBrowserExecutableForPlatform>[0],
      "linux",
    );

    expect(exe?.path).toBe("/usr/bin/google-chrome");
  });
});
