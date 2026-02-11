import { describe, expect, it } from "vitest";
import {
  formatChannelSelectionLine,
  listChatChannels,
  normalizeChatChannelId,
} from "./registry.js";

describe("channel registry", () => {
  it("normalizes core aliases", () => {
    // Only gtk-gui aliases remain in core registry; channel plugins (imessage, googlechat, etc.) are now extensions.
    expect(normalizeChatChannelId("gtk")).toBe("gtk-gui");
    expect(normalizeChatChannelId("gui")).toBe("gtk-gui");
    expect(normalizeChatChannelId("desktop")).toBe("gtk-gui");
    expect(normalizeChatChannelId("web")).toBeNull();
    expect(normalizeChatChannelId("imsg")).toBeNull();
  });

  it("keeps GTK GUI first in the default order", () => {
    const channels = listChatChannels();
    expect(channels[0]?.id).toBe("gtk-gui");
  });

  it("does not include MS Teams by default", () => {
    const channels = listChatChannels();
    expect(channels.some((channel) => channel.id === "msteams")).toBe(false);
  });

  it("formats selection lines with docs labels", () => {
    const channels = listChatChannels();
    // Use gtk-gui since that's the only core channel now.
    const gtkGui = channels.find((c) => c.id === "gtk-gui");
    if (!gtkGui) {
      throw new Error("Missing GTK GUI channel metadata.");
    }
    const line = formatChannelSelectionLine(gtkGui, (path, label) =>
      [label, path].filter(Boolean).join(":"),
    );
    expect(line).toContain("/channels/gtk-gui");
  });
});
