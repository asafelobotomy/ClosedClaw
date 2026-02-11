import type { GroupPolicy } from "./types.base.js";
import type { GoogleChatConfig } from "./types.googlechat.js";
import type { MSTeamsConfig } from "./types.msteams.js";

export type ChannelHeartbeatVisibilityConfig = {
  /** Show HEARTBEAT_OK acknowledgments in chat (default: false). */
  showOk?: boolean;
  /** Show heartbeat alerts with actual content (default: true). */
  showAlerts?: boolean;
  /** Emit indicator events for UI status display (default: true). */
  useIndicator?: boolean;
};

export type ChannelDefaultsConfig = {
  groupPolicy?: GroupPolicy;
  /** Default heartbeat visibility for all channels. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
};

export type ChannelsConfig = {
  /**
   * Channel routing mode.
   * - `"auto"` (default): auto-detects GTK-only when no other channels have enabled accounts.
   * - `"gtk-only"`: forces all communication through the GTK GUI desktop channel.
   */
  mode?: "gtk-only" | "auto";
  defaults?: ChannelDefaultsConfig;
  googlechat?: GoogleChatConfig;
  msteams?: MSTeamsConfig;
  [key: string]: unknown;
};
