/**
 * Test shim — the Signal channel extension was archived.
 */
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";

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
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => ({ channel: "signal", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "signal", messageId: "stub", to, text }),
  },
};
