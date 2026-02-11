/**
 * Test shim — the Discord channel extension was archived.
 */
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../../../src/channels/plugins/setup-helpers.js";
import {
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../../../src/channels/plugins/config-helpers.js";
import { collectDiscordStatusIssues } from "../../../src/channels/plugins/status-issues/discord.js";

const DEFAULT_ACCOUNT_ID = "default";

export const discordPlugin: ChannelPlugin = {
  id: "discord",
  meta: {
    id: "discord",
    label: "Discord",
    selectionLabel: "Discord",
    docsPath: "/channels/discord",
    blurb: "Discord channel (archived — stub for tests).",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg: any) => {
      const entry = cfg?.channels?.discord;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const ids = accounts ? Object.keys(accounts).filter(Boolean) : [];
      return ids.length > 0 ? ids : ["default"];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const entry = cfg?.channels?.discord;
      if (!entry || typeof entry !== "object") return {};
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      return accounts?.[accountId] ?? entry;
    },
    isConfigured: async (_account: unknown, cfg: any) => Boolean(cfg?.channels?.discord),
    setAccountEnabled: ({ cfg, accountId, enabled }: any) =>
      setAccountEnabledInConfigSection({ cfg, sectionKey: "discord", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }: any) =>
      deleteAccountFromConfigSection({ cfg, sectionKey: "discord", accountId, clearBaseFields: ["token", "name"] }),
  },
  setup: {
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      const namedConfig = applyAccountNameToChannelSection({ cfg, channelKey: "discord", accountId, name: input.name });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "discord" })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            discord: {
              ...next.channels?.discord,
              enabled: true,
              ...(input.useEnv ? {} : input.token ? { token: input.token } : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          discord: {
            ...next.channels?.discord,
            enabled: true,
            accounts: {
              ...next.channels?.discord?.accounts,
              [accountId]: {
                ...next.channels?.discord?.accounts?.[accountId],
                enabled: true,
                ...(input.token ? { token: input.token } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => ({ channel: "discord", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "discord", messageId: "stub", to, text }),
  },
  status: {
    collectStatusIssues: collectDiscordStatusIssues,
  },
  security: {},
};
