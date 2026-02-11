/**
 * Test shim — the Slack channel extension was archived.
 */
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";

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
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => ({ channel: "slack", messageId: "stub", to, text }),
    sendMedia: async ({ to, text }) => ({ channel: "slack", messageId: "stub", to, text }),
  },
};
