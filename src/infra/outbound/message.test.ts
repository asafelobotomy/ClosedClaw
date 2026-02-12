import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOutboundAdapter } from "../../channels/plugins/types.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../../test/helpers/channel-plugins.js";

const loadMessage = async () => await import("./message.js");

const setRegistry = async (registry: ReturnType<typeof createTestRegistry>) => {
  const { setActivePluginRegistry } = await import("../../plugins/runtime.js");
  setActivePluginRegistry(registry);
};

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
  randomIdempotencyKey: () => "idem-1",
}));

const emptyRegistry = createTestRegistry([]);

const createDirectOutbound = (channel: "webchat" | "gtk-gui"): ChannelOutboundAdapter => ({
  deliveryMode: "direct",
  sendText: async () => ({ channel, messageId: `${channel}-text` }),
  sendMedia: async () => ({ channel, messageId: `${channel}-media` }),
  pollMaxOptions: 5,
  sendPoll: async () => ({ channel, messageId: `${channel}-poll` }),
});

const createGatewayOutbound = (channel: "webchat" | "gtk-gui"): ChannelOutboundAdapter => ({
  deliveryMode: "gateway",
  sendText: async () => ({ channel, messageId: `${channel}-text` }),
  sendMedia: async () => ({ channel, messageId: `${channel}-media` }),
  pollMaxOptions: 5,
  sendPoll: async () => ({ channel, messageId: `${channel}-poll` }),
});

describe("sendMessage channel normalization", () => {
  beforeEach(async () => {
    callGatewayMock.mockReset();
    vi.resetModules();
    await setRegistry(emptyRegistry);
  });

  afterEach(async () => {
    await setRegistry(emptyRegistry);
  });

  it("normalizes webchat plugin alias", async () => {
    const { sendMessage } = await loadMessage();
    callGatewayMock.mockResolvedValueOnce({ messageId: "webchat-gw-1" });
    const webchat = createOutboundTestPlugin({
      id: "webchat",
      outbound: createGatewayOutbound("webchat"),
      label: "Web Chat",
    });
    webchat.meta.aliases = ["web"];

    await setRegistry(
      createTestRegistry([{ pluginId: "webchat", source: "test", plugin: webchat }]),
    );

    const result = await sendMessage({
      cfg: {},
      to: "room:general",
      content: "hello",
      channel: "web",
    });

    expect(result.channel).toBe("webchat");
    expect(result.via).toBe("gateway");
    expect(result.result?.messageId).toBe("webchat-gw-1");
    const call = callGatewayMock.mock.calls[0]?.[0] as { params?: Record<string, unknown> };
    expect(call.params?.channel).toBe("webchat");
  });

  it("normalizes gtk-gui alias", async () => {
    const { sendMessage } = await loadMessage();
    const gtk = createOutboundTestPlugin({
      id: "gtk-gui",
      outbound: createDirectOutbound("gtk-gui"),
      label: "GTK GUI",
    });
    gtk.meta.aliases = ["gtk", "gui"];

    await setRegistry(createTestRegistry([{ pluginId: "gtk-gui", source: "test", plugin: gtk }]));

    const result = await sendMessage({
      cfg: {},
      to: "desktop:main",
      content: "hello",
      channel: "gtk",
    });

    expect(result.channel).toBe("gtk-gui");
    expect(result.via).toBe("direct");
    expect(result.result?.messageId).toBe("gtk-gui-text");
  });

  it("returns dry-run payload without sending", async () => {
    const { sendMessage } = await loadMessage();
    const gtk = createOutboundTestPlugin({
      id: "gtk-gui",
      outbound: createDirectOutbound("gtk-gui"),
      label: "GTK GUI",
    });

    await setRegistry(createTestRegistry([{ pluginId: "gtk-gui", source: "test", plugin: gtk }]));

    const result = await sendMessage({
      cfg: {},
      to: "desktop:main",
      content: "hello",
      channel: "gtk-gui",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.via).toBe("direct");
    expect(result.result).toBeUndefined();
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("throws for unknown channel", async () => {
    const { sendMessage } = await loadMessage();

    await expect(
      sendMessage({
        cfg: {},
        to: "desktop:main",
        content: "hello",
        channel: "unknown-channel",
      }),
    ).rejects.toThrow("Unknown channel");
  });
});

describe("sendPoll channel normalization", () => {
  beforeEach(async () => {
    callGatewayMock.mockReset();
    vi.resetModules();
    await setRegistry(emptyRegistry);
  });

  afterEach(async () => {
    await setRegistry(emptyRegistry);
  });

  it("normalizes webchat alias for polls and forwards normalized channel", async () => {
    const { sendPoll } = await loadMessage();
    callGatewayMock.mockResolvedValueOnce({ messageId: "poll-1" });

    const webchat = createOutboundTestPlugin({
      id: "webchat",
      outbound: createGatewayOutbound("webchat"),
      label: "Web Chat",
    });
    webchat.meta.aliases = ["web"];

    await setRegistry(
      createTestRegistry([{ pluginId: "webchat", source: "test", plugin: webchat }]),
    );

    const result = await sendPoll({
      cfg: {},
      to: "room:polls",
      question: "Lunch?",
      options: ["A", "B", "C", "D", "E"],
      channel: "web",
    });

    const call = callGatewayMock.mock.calls[0]?.[0] as { params?: Record<string, unknown> };
    expect(call.params?.channel).toBe("webchat");
    expect(Array.isArray(call.params?.options) ? call.params.options.length : 0).toBe(5);
    expect(result.channel).toBe("webchat");
    expect(result.result?.messageId).toBe("poll-1");
  });

  it("returns dry-run poll payload without gateway call", async () => {
    const { sendPoll } = await loadMessage();

    const webchat = createOutboundTestPlugin({
      id: "webchat",
      outbound: createGatewayOutbound("webchat"),
      label: "Web Chat",
    });
    webchat.meta.aliases = ["web"];
    await setRegistry(
      createTestRegistry([{ pluginId: "webchat", source: "test", plugin: webchat }]),
    );

    const result = await sendPoll({
      cfg: {},
      to: "room:polls",
      question: "Lunch?",
      options: ["A", "B"],
      channel: "web",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.result).toBeUndefined();
    expect(callGatewayMock).not.toHaveBeenCalled();
  });
});
