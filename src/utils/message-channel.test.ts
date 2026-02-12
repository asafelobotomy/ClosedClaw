import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { resolveGatewayMessageChannel } from "./message-channel.js";

const createRegistry = (channels: PluginRegistry["channels"]): PluginRegistry => ({
  plugins: [],
  tools: [],
  channels,
  providers: [],
  gatewayHandlers: {},
  httpHandlers: [],
  httpRoutes: [],
  cliRegistrars: [],
  services: [],
  diagnostics: [],
});

const createPlugin = (id: string, opts?: { aliases?: string[] }): ChannelPlugin => ({
  id,
  meta: {
    id,
    label: id,
    selectionLabel: id,
    docsPath: `/channels/${id}`,
    blurb: `${id} channel`,
    ...(opts?.aliases ? { aliases: opts.aliases } : {}),
  },
  capabilities: { chatTypes: ["direct"] },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
});

const matrixExtPlugin = createPlugin("matrix-ext", { aliases: ["matrix"] });

const defaultRegistry = createRegistry([
  { pluginId: "webchat", plugin: createPlugin("webchat"), source: "test" },
  { pluginId: "gtk-gui", plugin: createPlugin("gtk-gui", { aliases: ["gtk"] }), source: "test" },
]);

describe("message-channel", () => {
  beforeEach(() => {
    setActivePluginRegistry(defaultRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(createRegistry([]));
  });

  it("normalizes gateway message channels and rejects unknown values", () => {
    expect(resolveGatewayMessageChannel("webchat")).toBe("webchat");
    expect(resolveGatewayMessageChannel(" gtk ")).toBe("gtk-gui");
    expect(resolveGatewayMessageChannel("web")).toBeUndefined();
    expect(resolveGatewayMessageChannel("nope")).toBeUndefined();
  });

  it("normalizes plugin aliases when registered", () => {
    setActivePluginRegistry(
      createRegistry([{ pluginId: "matrix-ext", plugin: matrixExtPlugin, source: "test" }]),
    );
    expect(resolveGatewayMessageChannel("matrix")).toBe("matrix-ext");
  });
});
