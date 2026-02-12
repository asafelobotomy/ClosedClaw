import type {
  ChannelCapabilities,
  ChannelId,
  ChannelOutboundAdapter,
  ChannelPlugin,
} from "../../src/channels/plugins/types.js";
import type { PluginRegistry } from "../../src/plugins/registry.js";

// Removed iMessage test helpers (v2026.2 platform removal):
// - normalizeIMessageHandle
// - imessageStubOutbound
// - createIMessageTestPlugin
// Use createOutboundTestPlugin for creating generic test channel stubs

export const createTestRegistry = (channels: PluginRegistry["channels"] = []): PluginRegistry => ({
  plugins: [],
  tools: [],
  hooks: [],
  typedHooks: [],
  channels,
  providers: [],
  gatewayHandlers: {},
  httpHandlers: [],
  httpRoutes: [],
  cliRegistrars: [],
  services: [],
  commands: [],
  diagnostics: [],
});

export const createOutboundTestPlugin = (params: {
  id: ChannelId;
  outbound: ChannelOutboundAdapter;
  label?: string;
  docsPath?: string;
  capabilities?: ChannelCapabilities;
}): ChannelPlugin => ({
  id: params.id,
  meta: {
    id: params.id,
    label: params.label ?? String(params.id),
    selectionLabel: params.label ?? String(params.id),
    docsPath: params.docsPath ?? `/channels/${params.id}`,
    blurb: "test stub.",
  },
  capabilities: params.capabilities ?? { chatTypes: ["direct"] },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
  outbound: params.outbound,
});

export const createIMessageTestPlugin = (params?: {
  outbound?: ChannelOutboundAdapter;
  capabilities?: ChannelCapabilities;
}): ChannelPlugin => ({
  id: "imessage",
  meta: {
    id: "imessage",
    label: "iMessage",
    selectionLabel: "iMessage",
    docsPath: "/channels/imessage",
    blurb: "test stub.",
  },
  capabilities: params?.capabilities ?? { chatTypes: ["direct"] },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
  outbound:
    params?.outbound ??
    ({
      deliveryMode: "direct",
      sendText: async () => ({ channel: "imessage", messageId: "test-imessage-text" }),
      sendMedia: async () => ({ channel: "imessage", messageId: "test-imessage-media" }),
    } as ChannelOutboundAdapter),
});
