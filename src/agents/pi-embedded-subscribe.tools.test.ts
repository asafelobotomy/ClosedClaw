import { beforeEach, describe, expect, it } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { createTestRegistry } from "../../test/helpers/channel-plugins.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { extractMessagingToolSend } from "./pi-embedded-subscribe.tools.js";

const testPlugin: ChannelPlugin = {
  id: "test-channel",
  meta: {
    id: "test-channel",
    label: "Test Channel",
    selectionLabel: "Test Channel",
    docsPath: "/channels/test-channel",
    blurb: "Test channel for unit tests",
  },
  capabilities: { chatTypes: ["direct", "group"] },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
  },
  messaging: {
    normalizeTarget: (target) => target.toLowerCase(),
  },
};

describe("extractMessagingToolSend", () => {
  beforeEach(() => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "test-channel", plugin: testPlugin, source: "test" }]),
    );
  });

  it("uses channel as provider for message tool", () => {
    const result = extractMessagingToolSend("message", {
      action: "send",
      channel: "test-channel",
      to: "123",
    });

    expect(result?.tool).toBe("message");
    expect(result?.provider).toBe("test-channel");
    expect(result?.to).toBe("123");
  });

  it("prefers provider when both provider and channel are set", () => {
    const result = extractMessagingToolSend("message", {
      action: "send",
      provider: "webchat",
      channel: "test-channel",
      to: "channel:C1",
    });

    expect(result?.tool).toBe("message");
    expect(result?.provider).toBe("webchat");
    expect(result?.to).toBe("channel:c1");
  });
});
