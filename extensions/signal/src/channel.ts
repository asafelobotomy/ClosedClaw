/**
 * Test shim — the Signal channel extension was archived.
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

export const signalPlugin: ChannelPlugin = {
  id: "signal",
  meta: {
    id: "signal",
    label: "Signal",
    selectionLabel: "Signal",
    docsPath: "/channels/signal",
    blurb: "Signal channel (archived — stub for tests).",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg: any) => {
      const entry = cfg?.channels?.signal;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const ids = accounts ? Object.keys(accounts).filter(Boolean) : [];
      return ids.length > 0 ? ids : ["default"];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const entry = cfg?.channels?.signal;
      if (!entry || typeof entry !== "object") return {};
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      return accounts?.[accountId] ?? entry;
    },
    isConfigured: async (_account: unknown, cfg: any) => Boolean(cfg?.channels?.signal),
    setAccountEnabled: ({ cfg, accountId, enabled }: any) =>
      setAccountEnabledInConfigSection({ cfg, sectionKey: "signal", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }: any) =>
      deleteAccountFromConfigSection({ cfg, sectionKey: "signal", accountId, clearBaseFields: ["account", "cliPath", "name"] }),
  },
  setup: {
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      const namedConfig = applyAccountNameToChannelSection({ cfg, channelKey: "signal", accountId, name: input.name });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "signal" })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            signal: {
              ...next.channels?.signal,
              enabled: true,
              ...(input.signalNumber ? { account: input.signalNumber } : {}),
              ...(input.cliPath ? { cliPath: input.cliPath } : {}),
              ...(input.httpUrl ? { httpUrl: input.httpUrl } : {}),
              ...(input.httpHost ? { httpHost: input.httpHost } : {}),
              ...(input.httpPort ? { httpPort: Number(input.httpPort) } : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          signal: {
            ...next.channels?.signal,
            enabled: true,
            accounts: {
              ...next.channels?.signal?.accounts,
              [accountId]: {
                ...next.channels?.signal?.accounts?.[accountId],
                enabled: true,
                ...(input.signalNumber ? { account: input.signalNumber } : {}),
                ...(input.cliPath ? { cliPath: input.cliPath } : {}),
                ...(input.httpUrl ? { httpUrl: input.httpUrl } : {}),
                ...(input.httpHost ? { httpHost: input.httpHost } : {}),
                ...(input.httpPort ? { httpPort: Number(input.httpPort) } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => ({ channel: "signal", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "signal", messageId: "stub", to, text }),
  },
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [{ channel: "signal", accountId: account.accountId, kind: "runtime" as const, message: `Channel error: ${lastError}` }];
      }),
  },
};
