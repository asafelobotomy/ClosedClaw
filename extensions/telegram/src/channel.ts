/**
 * Test shim — the Telegram channel extension was archived.
 * This stub provides the `telegramPlugin` export that core infrastructure
 * tests use as a fixture when setting up plugin registries.
 */
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";

export const telegramPlugin: ChannelPlugin = {
  id: "telegram",
  meta: {
    id: "telegram",
    label: "Telegram",
    selectionLabel: "Telegram",
    docsPath: "/channels/telegram",
    blurb: "Telegram channel (archived — stub for tests).",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg: any) => {
      const entry = cfg?.channels?.telegram;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const ids = accounts ? Object.keys(accounts).filter(Boolean) : [];
      return ids.length > 0 ? ids : ["default"];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const entry = cfg?.channels?.telegram;
      if (!entry || typeof entry !== "object") return {};
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      return accounts?.[accountId] ?? entry;
    },
    isConfigured: async (_account: unknown, cfg: any) => Boolean(cfg?.channels?.telegram),
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => ({ channel: "telegram", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "telegram", messageId: "stub", to, text }),
  },
};
