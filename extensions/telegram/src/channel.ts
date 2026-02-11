/**
 * Test shim — the Telegram channel extension was archived.
 * This stub provides the `telegramPlugin` export that core infrastructure
 * tests use as a fixture when setting up plugin registries.
 */
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";
import type { ChannelOnboardingAdapter } from "../../../src/channels/plugins/onboarding-types.js";
import {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../../../src/channels/plugins/setup-helpers.js";
import {
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../../../src/channels/plugins/config-helpers.js";
import { collectTelegramStatusIssues } from "../../../src/channels/plugins/status-issues/telegram.js";
import { isChannelConfigured } from "../../../src/config/plugin-auto-enable.js";

const DEFAULT_ACCOUNT_ID = "default";

const telegramOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: "telegram",
  getStatus: async ({ cfg }) => {
    const configured = isChannelConfigured(cfg, "telegram");
    return {
      channel: "telegram",
      configured,
      statusLines: [`Telegram: ${configured ? "configured" : "needs token"}`],
      selectionHint: configured ? "configured" : "not configured",
      quickstartScore: configured ? 1 : 10,
    };
  },
  configure: async ({ cfg }) => ({ cfg }),
};

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
  onboarding: telegramOnboardingAdapter,
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
    setAccountEnabled: ({ cfg, accountId, enabled }: any) =>
      setAccountEnabledInConfigSection({ cfg, sectionKey: "telegram", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }: any) =>
      deleteAccountFromConfigSection({ cfg, sectionKey: "telegram", accountId, clearBaseFields: ["botToken", "tokenFile", "name"] }),
  },
  setup: {
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      const namedConfig = applyAccountNameToChannelSection({ cfg, channelKey: "telegram", accountId, name: input.name });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "telegram" })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            telegram: {
              ...next.channels?.telegram,
              enabled: true,
              ...(input.useEnv ? {} : input.tokenFile ? { tokenFile: input.tokenFile } : input.token ? { botToken: input.token } : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          telegram: {
            ...next.channels?.telegram,
            enabled: true,
            accounts: {
              ...next.channels?.telegram?.accounts,
              [accountId]: {
                ...next.channels?.telegram?.accounts?.[accountId],
                enabled: true,
                ...(input.tokenFile ? { tokenFile: input.tokenFile } : input.token ? { botToken: input.token } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text, accountId, deps }: any) => {
      if (deps?.sendTelegram) {
        const result = await deps.sendTelegram(to, text, {
          verbose: false,
          accountId: accountId ?? undefined,
        });
        return { channel: "telegram", ...result };
      }
      return { channel: "telegram", messageId: "stub", to, text };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, deps }: any) => {
      if (deps?.sendTelegram) {
        const result = await deps.sendTelegram(to, text, {
          verbose: false,
          mediaUrl,
          accountId: accountId ?? undefined,
        });
        return { channel: "telegram", ...result };
      }
      return { channel: "telegram", messageId: "stub", to, text };
    },
  },
  messaging: {
    normalizeTarget: (raw: string) => {
      let trimmed = raw.trim();
      trimmed = trimmed.replace(/^telegram:/i, "").trim();
      return trimmed.toLowerCase() || undefined;
    },
    targetResolver: {
      looksLikeId: (raw: string) => {
        let trimmed = raw.trim();
        trimmed = trimmed.replace(/^telegram:/i, "").trim();
        if (!trimmed) return false;
        if (/^@/.test(trimmed)) return true;
        if (/^-?\d+/.test(trimmed)) return true;
        if (/^(channel|group|user):/i.test(trimmed)) return true;
        return false;
      },
      hint: "<@username|chatId>",
    },
  },
  status: {
    collectStatusIssues: collectTelegramStatusIssues,
    probeAccount: async ({ account, timeoutMs }: { account: any; timeoutMs?: number; cfg?: any }) => {
      let token = (account?.botToken ?? account?.token ?? "").trim();
      if (!token && account?.tokenFile) {
        try {
          const fs = await import("node:fs");
          token = fs.readFileSync(account.tokenFile, "utf-8").trim();
        } catch { /* ignore */ }
      }
      if (!token) return { ok: false, error: "no token" };
      const base = `https://api.telegram.org/bot${token}`;
      const started = Date.now();
      try {
        const controller = new AbortController();
        const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const meRes = await fetch(`${base}/getMe`, { signal: controller.signal });
        const meJson = await meRes.json() as any;
        if (timer) clearTimeout(timer);
        if (!meRes.ok || !meJson?.ok) {
          return { ok: false, status: meRes.status, error: meJson?.description ?? `getMe failed (${meRes.status})`, elapsedMs: Date.now() - started };
        }
        const result: any = { ok: true, elapsedMs: Date.now() - started, bot: { id: meJson.result?.id ?? null, username: meJson.result?.username ?? null } };
        try {
          const whRes = await fetch(`${base}/getWebhookInfo`, { signal: controller.signal });
          const whJson = await whRes.json() as any;
          if (whRes.ok && whJson?.ok) {
            result.webhook = { url: whJson.result?.url ?? null, hasCustomCert: whJson.result?.has_custom_certificate ?? null };
          }
        } catch { /* ignore webhook errors */ }
        return result;
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err), elapsedMs: Date.now() - started };
      }
    },
  },
  security: {},
};
