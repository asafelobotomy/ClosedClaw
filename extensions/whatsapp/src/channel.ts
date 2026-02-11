/**
 * Test shim — the WhatsApp channel extension was archived.
 */
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";

export const whatsappPlugin: ChannelPlugin = {
  id: "whatsapp",
  meta: {
    id: "whatsapp",
    label: "WhatsApp",
    selectionLabel: "WhatsApp",
    docsPath: "/channels/whatsapp",
    blurb: "WhatsApp channel (archived — stub for tests).",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg: any) => {
      const entry = cfg?.channels?.whatsapp;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const ids = accounts ? Object.keys(accounts).filter(Boolean) : [];
      return ids.length > 0 ? ids : ["default"];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const entry = cfg?.channels?.whatsapp;
      if (!entry || typeof entry !== "object") return {};
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      return accounts?.[accountId] ?? entry;
    },
    isConfigured: async (_account: unknown, cfg: any) => Boolean(cfg?.channels?.whatsapp),
  },
  outbound: {
    deliveryMode: "gateway",
    sendText: async ({ to, text }) => ({ channel: "whatsapp", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "whatsapp", messageId: "stub", to, text }),
  },
};
