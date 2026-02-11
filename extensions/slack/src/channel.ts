/**
 * Test shim — the Slack channel extension was archived.
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

export const slackPlugin: ChannelPlugin = {
  id: "slack",
  meta: {
    id: "slack",
    label: "Slack",
    selectionLabel: "Slack",
    docsPath: "/channels/slack",
    blurb: "Slack channel (archived — stub for tests).",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg: any) => {
      const entry = cfg?.channels?.slack;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const ids = accounts ? Object.keys(accounts).filter(Boolean) : [];
      return ids.length > 0 ? ids : ["default"];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const entry = cfg?.channels?.slack;
      if (!entry || typeof entry !== "object") return {};
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      return accounts?.[accountId] ?? entry;
    },
    isConfigured: async (_account: unknown, cfg: any) => Boolean(cfg?.channels?.slack),
    setAccountEnabled: ({ cfg, accountId, enabled }: any) =>
      setAccountEnabledInConfigSection({ cfg, sectionKey: "slack", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }: any) =>
      deleteAccountFromConfigSection({ cfg, sectionKey: "slack", accountId, clearBaseFields: ["botToken", "appToken", "name"] }),
  },
  setup: {
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      const namedConfig = applyAccountNameToChannelSection({ cfg, channelKey: "slack", accountId, name: input.name });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "slack" })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            slack: {
              ...next.channels?.slack,
              enabled: true,
              ...(input.useEnv ? {} : {
                ...(input.botToken ? { botToken: input.botToken } : {}),
                ...(input.appToken ? { appToken: input.appToken } : {}),
              }),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          slack: {
            ...next.channels?.slack,
            enabled: true,
            accounts: {
              ...next.channels?.slack?.accounts,
              [accountId]: {
                ...next.channels?.slack?.accounts?.[accountId],
                enabled: true,
                ...(input.botToken ? { botToken: input.botToken } : {}),
                ...(input.appToken ? { appToken: input.appToken } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text, accountId, deps, replyToId }: any) => {
      if (deps?.sendSlack) {
        const result = await deps.sendSlack(to, text, {
          threadTs: replyToId ?? undefined,
          accountId: accountId ?? undefined,
        });
        return { channel: "slack", ...result };
      }
      return { channel: "slack", messageId: "stub", to, text };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId }: any) => {
      if (deps?.sendSlack) {
        const result = await deps.sendSlack(to, text, {
          mediaUrl,
          threadTs: replyToId ?? undefined,
          accountId: accountId ?? undefined,
        });
        return { channel: "slack", ...result };
      }
      return { channel: "slack", messageId: "stub", to, text };
    },
  },
  messaging: {
    normalizeTarget: (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      return trimmed.replace(/^#/, "").toLowerCase() || undefined;
    },
    targetResolver: {
      looksLikeId: (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^[CGDUW][A-Z0-9]{6,}$/i.test(trimmed)) return true;
        if (/^(channel|user|group):/i.test(trimmed)) return true;
        if (/^[@#]/.test(trimmed)) return true;
        return false;
      },
      hint: "<#channel|@user|channelId>",
    },
  },
  security: {},
};
