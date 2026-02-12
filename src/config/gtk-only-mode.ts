/**
 * GTK-Only Mode Detection & Enforcement
 *
 * When only the GTK GUI channel is configured (no other channels have enabled accounts),
 * auto-detect and enforce GTK-only mode. This disables startup of all non-GTK channels
 * while preserving all agent, tool, cron, and hook functionality.
 */

import type { ClosedClawConfig } from "./types.js";
import type { ChannelPlugin } from "../channels/plugins/types.js";

const GTK_CHANNEL_ID = "gtk-gui";

/**
 * Checks whether a channel has at least one enabled account in the config.
 * A channel is "configured" if it has accounts with `enabled !== false`.
 */
function hasEnabledAccounts(
  cfg: ClosedClawConfig,
  channelId: string,
): boolean {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  if (!channels) {
    return false;
  }
  const channelConfig = channels[channelId];
  if (!channelConfig || typeof channelConfig !== "object") {
    return false;
  }
  const accounts = (channelConfig as Record<string, unknown>).accounts;
  if (!accounts || typeof accounts !== "object") {
    return false;
  }
  for (const account of Object.values(accounts as Record<string, unknown>)) {
    if (!account || typeof account !== "object") {
      continue;
    }
    const enabled = (account as { enabled?: boolean }).enabled;
    if (enabled !== false) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the config indicates GTK-only mode should be active.
 *
 * GTK-only mode is auto-detected when:
 * - No other messaging channels have enabled accounts, OR
 * - The config explicitly sets `channels.mode` to `"gtk-only"`
 */
export function isGtkOnlyMode(cfg: ClosedClawConfig): boolean {
  // Explicit opt-in via config
  if (cfg.channels?.mode === "gtk-only") {
    return true;
  }

  const channels = cfg.channels as Record<string, unknown> | undefined;
  if (!channels) {
    return true;
  }

  // Auto-detect: if any non-GTK configured channel has enabled accounts,
  // gtk-only mode is off.
  for (const channelId of Object.keys(channels)) {
    if (channelId === "mode" || channelId === "defaults" || channelId === GTK_CHANNEL_ID) {
      continue;
    }
    if (hasEnabledAccounts(cfg, channelId)) {
      return false;
    }
  }

  return true;
}

/**
 * Filters channel plugins to only include GTK GUI when in GTK-only mode.
 * Passes through all plugins unchanged when not in GTK-only mode.
 */
export function filterChannelsForGtkOnlyMode(
  plugins: ChannelPlugin[],
  cfg: ClosedClawConfig,
): ChannelPlugin[] {
  if (!isGtkOnlyMode(cfg)) {
    return plugins;
  }
  return plugins.filter((plugin) => plugin.id === GTK_CHANNEL_ID);
}

/**
 * Returns a human-readable summary of GTK-only mode status for logging.
 */
export function formatGtkOnlyModeStatus(cfg: ClosedClawConfig): string {
  if (!isGtkOnlyMode(cfg)) {
    return "gtk-only mode: off (other channels configured)";
  }
  const explicit = cfg.channels?.mode === "gtk-only";
  return explicit
    ? "gtk-only mode: on (explicit config)"
    : "gtk-only mode: on (auto-detected, no other channels configured)";
}
