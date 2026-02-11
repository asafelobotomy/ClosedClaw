process.env.NO_COLOR = "1";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../../channels/plugins/types.js";
import { getChannelPlugin, listChannelPlugins } from "../../channels/plugins/index.js";
import { fetchSlackScopes } from "../../slack/scopes.js";
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

vi.mock("../../slack/scopes.js", () => ({
  fetchSlackScopes: vi.fn(),
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
  account?: Record<string, unknown>;
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
      resolveAccount: () => params.account ?? { accountId: "default" },
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

  it("prints Slack capabilities without scopes (scopes fetching archived)", async () => {
    const plugin = buildPlugin({
      id: "slack",
      account: {
        accountId: "default",
        botToken: "xoxb-bot",
        config: { userToken: "xoxp-user" },
      },
      probe: { ok: true, bot: { name: "ClosedClaw" }, team: { name: "team" } },
    });
    vi.mocked(listChannelPlugins).mockReturnValue([plugin]);
    vi.mocked(getChannelPlugin).mockReturnValue(plugin);

    await channelsCapabilitiesCommand({ channel: "slack" }, runtime);

    const output = logs.join("\n");
    // Slack scopes fetching was archived; bot/user scope lines no longer appear.
    expect(output).toContain("slack");
    expect(output).toContain("Support:");
  });

  it("prints Teams Graph permission hints when present", async () => {
    const plugin = buildPlugin({
      id: "msteams",
      probe: {
        ok: true,
        appId: "app-id",
        graph: {
          ok: true,
          roles: ["ChannelMessage.Read.All", "Files.Read.All"],
        },
      },
    });
    vi.mocked(listChannelPlugins).mockReturnValue([plugin]);
    vi.mocked(getChannelPlugin).mockReturnValue(plugin);

    await channelsCapabilitiesCommand({ channel: "msteams" }, runtime);

    const output = logs.join("\n");
    expect(output).toContain("ChannelMessage.Read.All (channel history)");
    expect(output).toContain("Files.Read.All (files (OneDrive))");
  });
});
