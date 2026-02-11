/**
 * Test shim — the iMessage channel extension was archived.
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

const DEFAULT_ACCOUNT_ID = "default";

export const imessagePlugin: ChannelPlugin = {
  id: "imessage",
  meta: {
    id: "imessage",
    label: "iMessage",
    selectionLabel: "iMessage",
    docsPath: "/channels/imessage",
    blurb: "iMessage channel (archived — stub for tests).",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg: any) => {
      const entry = cfg?.channels?.imessage;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const ids = accounts ? Object.keys(accounts).filter(Boolean) : [];
      return ids.length > 0 ? ids : ["default"];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const entry = cfg?.channels?.imessage;
      if (!entry || typeof entry !== "object") return {};
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      return accounts?.[accountId] ?? entry;
    },
    isConfigured: async (_account: unknown, cfg: any) => Boolean(cfg?.channels?.imessage),
    setAccountEnabled: ({ cfg, accountId, enabled }: any) =>
      setAccountEnabledInConfigSection({ cfg, sectionKey: "imessage", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }: any) =>
      deleteAccountFromConfigSection({ cfg, sectionKey: "imessage", accountId, clearBaseFields: ["cliPath", "dbPath", "name"] }),
  },
  setup: {
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      const namedConfig = applyAccountNameToChannelSection({ cfg, channelKey: "imessage", accountId, name: input.name });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "imessage" })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            imessage: {
              ...next.channels?.imessage,
              enabled: true,
              ...(input.cliPath ? { cliPath: input.cliPath } : {}),
              ...(input.dbPath ? { dbPath: input.dbPath } : {}),
              ...(input.service ? { service: input.service } : {}),
              ...(input.region ? { region: input.region } : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          imessage: {
            ...next.channels?.imessage,
            enabled: true,
            accounts: {
              ...next.channels?.imessage?.accounts,
              [accountId]: {
                ...next.channels?.imessage?.accounts?.[accountId],
                enabled: true,
                ...(input.cliPath ? { cliPath: input.cliPath } : {}),
                ...(input.dbPath ? { dbPath: input.dbPath } : {}),
                ...(input.service ? { service: input.service } : {}),
                ...(input.region ? { region: input.region } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => ({ channel: "imessage", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "imessage", messageId: "stub", to, text }),
  },
};
