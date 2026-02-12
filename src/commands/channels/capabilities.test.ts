process.env.NO_COLOR = "1";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../../channels/plugins/types.js";
import { getChannelPlugin, listChannelPlugins } from "../../channels/plugins/index.js";
import { channelsCapabilitiesCommand } from "./capabilities.js";

const logs: string[] = [];
const errors: string[] = [];

vi.mock("./shared.js", () => ({
  requireValidConfig: vi.fn(async () => ({ channels: {} })),
  formatChannelAccountLabel: vi.fn(
    ({ channel, accountId }: { channel: string; accountId: string }) => `${channel}:${accountId}`,
  ),
}));

vi.mock("../../channels/plugins/index.js", () => ({
  listChannelPlugins: vi.fn(),
  getChannelPlugin: vi.fn(),
}));

const runtime = {
  log: (value: string) => logs.push(value),
  error: (value: string) => errors.push(value),
  exit: (code: number) => {
    throw new Error(`exit:${code}`);
  },
};

function resetOutput() {
  logs.length = 0;
  errors.length = 0;
}

function buildPlugin(params: {
  id: string;
  capabilities?: ChannelPlugin["capabilities"];
  probe?: unknown;
}): ChannelPlugin {
  const capabilities =
    params.capabilities ?? ({ chatTypes: ["direct"] } as ChannelPlugin["capabilities"]);
  return {
    id: params.id,
    meta: {
      id: params.id,
      label: params.id,
      selectionLabel: params.id,
      docsPath: "/channels/test",
      blurb: "test",
    },
    capabilities,
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: () => ({ accountId: "default" }),
      defaultAccountId: () => "default",
      isConfigured: () => true,
      isEnabled: () => true,
    },
    status: params.probe
      ? {
          probeAccount: async () => params.probe,
        }
      : undefined,
    actions: {
      listActions: () => ["poll"],
    },
  };
}

describe("channelsCapabilitiesCommand", () => {
  beforeEach(() => {
    resetOutput();
    vi.clearAllMocks();
  });

  it("prints webchat capabilities and probe status", async () => {
    const plugin = buildPlugin({
      id: "webchat",
      capabilities: { chatTypes: ["direct", "group"], polls: true },
      probe: { ok: true },
    });
    vi.mocked(listChannelPlugins).mockReturnValue([plugin]);
    vi.mocked(getChannelPlugin).mockReturnValue(plugin);

    await channelsCapabilitiesCommand({ channel: "webchat" }, runtime);

    const output = logs.join("\n");
    expect(output).toContain("webchat:default");
    expect(output).toContain("Support: chatTypes=direct,group polls");
    expect(output).toContain("Actions: send, broadcast, poll");
    expect(output).toContain("Probe: ok");
  });

  it("exits with error for unknown channel", async () => {
    vi.mocked(listChannelPlugins).mockReturnValue([]);
    vi.mocked(getChannelPlugin).mockReturnValue(undefined);

    await expect(channelsCapabilitiesCommand({ channel: "unknown" }, runtime)).rejects.toThrow(
      "exit:1",
    );

    expect(errors.join("\n")).toContain('Unknown channel "unknown".');
  });
});
