import { describe, expect, it } from "vitest";
import type { ClosedClawConfig } from "./types.js";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import {
  filterChannelsForGtkOnlyMode,
  formatGtkOnlyModeStatus,
  isGtkOnlyMode,
} from "./gtk-only-mode.js";

function makeConfig(overrides: Partial<ClosedClawConfig> = {}): ClosedClawConfig {
  return { ...overrides } as ClosedClawConfig;
}

function makePlugin(id: string): ChannelPlugin {
  return { id } as unknown as ChannelPlugin;
}

describe("isGtkOnlyMode", () => {
  it("returns true when channels.mode is explicitly gtk-only", () => {
    const cfg = makeConfig({ channels: { mode: "gtk-only" } });
    expect(isGtkOnlyMode(cfg)).toBe(true);
  });

  it("returns true when no channels are configured (auto-detect)", () => {
    const cfg = makeConfig({});
    expect(isGtkOnlyMode(cfg)).toBe(true);
  });

  it("returns true when channels exist but none have enabled accounts", () => {
    const cfg = makeConfig({
      channels: {
        googlechat: { accounts: { main: { enabled: false } } },
      },
    });
    expect(isGtkOnlyMode(cfg)).toBe(true);
  });

  it("returns false when a non-GTK channel has an enabled account", () => {
    const cfg = makeConfig({
      channels: {
        googlechat: { accounts: { main: { enabled: true } } },
      },
    });
    expect(isGtkOnlyMode(cfg)).toBe(false);
  });

  it("returns false when a non-GTK channel has account with default enabled (not false)", () => {
    const cfg = makeConfig({
      channels: {
        imessage: { accounts: { default: {} } },
      },
    });
    expect(isGtkOnlyMode(cfg)).toBe(false);
  });

  it("returns false when mode is auto and channels are configured", () => {
    const cfg = makeConfig({
      channels: {
        mode: "auto",
        nostr: { accounts: { main: { enabled: true } } },
      },
    });
    expect(isGtkOnlyMode(cfg)).toBe(false);
  });
});

describe("filterChannelsForGtkOnlyMode", () => {
  const gtkPlugin = makePlugin("gtk-gui");
  const googlechatPlugin = makePlugin("googlechat");
  const nostrPlugin = makePlugin("nostr");
  const allPlugins = [gtkPlugin, googlechatPlugin, nostrPlugin];

  it("returns only GTK plugin when in GTK-only mode", () => {
    const cfg = makeConfig({ channels: { mode: "gtk-only" } });
    const result = filterChannelsForGtkOnlyMode(allPlugins, cfg);
    expect(result).toEqual([gtkPlugin]);
  });

  it("returns all plugins when not in GTK-only mode", () => {
    const cfg = makeConfig({
      channels: {
        googlechat: { accounts: { main: { enabled: true } } },
      },
    });
    const result = filterChannelsForGtkOnlyMode(allPlugins, cfg);
    expect(result).toEqual(allPlugins);
  });

  it("returns empty array when GTK plugin not registered", () => {
    const cfg = makeConfig({ channels: { mode: "gtk-only" } });
    const result = filterChannelsForGtkOnlyMode(
      [googlechatPlugin, nostrPlugin],
      cfg,
    );
    expect(result).toEqual([]);
  });
});

describe("formatGtkOnlyModeStatus", () => {
  it("formats explicit mode", () => {
    const cfg = makeConfig({ channels: { mode: "gtk-only" } });
    expect(formatGtkOnlyModeStatus(cfg)).toContain("explicit");
  });

  it("formats auto-detected mode", () => {
    const cfg = makeConfig({});
    expect(formatGtkOnlyModeStatus(cfg)).toContain("auto-detected");
  });

  it("formats off when other channels configured", () => {
    const cfg = makeConfig({
      channels: {
        googlechat: { accounts: { main: { enabled: true } } },
      },
    });
    expect(formatGtkOnlyModeStatus(cfg)).toContain("off");
  });
});
