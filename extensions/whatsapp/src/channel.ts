/**
 * Test shim — the WhatsApp channel extension was archived.
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
import { missingTargetError } from "../../../src/infra/outbound/target-errors.js";
import { normalizeE164 } from "../../../src/utils.js";

// ── WhatsApp target normalization (inlined from archived src/whatsapp/normalize.ts) ──

const WHATSAPP_USER_JID_RE = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/i;
const WHATSAPP_LID_RE = /^(\d+)@lid$/i;

function stripWhatsAppTargetPrefixes(value: string): string {
  let candidate = value.trim();
  for (;;) {
    const before = candidate;
    candidate = candidate.replace(/^whatsapp:/i, "").trim();
    if (candidate === before) return candidate;
  }
}

function isWhatsAppGroupJid(value: string): boolean {
  const candidate = stripWhatsAppTargetPrefixes(value);
  const lower = candidate.toLowerCase();
  if (!lower.endsWith("@g.us")) return false;
  const localPart = candidate.slice(0, candidate.length - "@g.us".length);
  if (!localPart || localPart.includes("@")) return false;
  return /^[0-9]+(-[0-9]+)*$/.test(localPart);
}

function normalizeWhatsAppTarget(value: string): string | null {
  const candidate = stripWhatsAppTargetPrefixes(value);
  if (!candidate) return null;
  if (isWhatsAppGroupJid(candidate)) {
    const localPart = candidate.slice(0, candidate.length - "@g.us".length);
    return `${localPart}@g.us`;
  }
  const userMatch = candidate.match(WHATSAPP_USER_JID_RE) ?? candidate.match(WHATSAPP_LID_RE);
  if (userMatch) {
    const phone = userMatch[1];
    const normalized = normalizeE164(phone);
    return normalized.length > 1 ? normalized : null;
  }
  if (candidate.includes("@")) return null;
  const normalized = normalizeE164(candidate);
  return normalized.length > 1 ? normalized : null;
}

// ── Plugin definition ──

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
    resolveAllowFrom: ({ cfg, accountId }: any) => {
      const entry = cfg?.channels?.whatsapp;
      if (!entry || typeof entry !== "object") return [];
      const accounts = entry.accounts as Record<string, unknown> | undefined;
      const account = accountId && accounts ? (accounts[accountId] as any) : entry;
      return (account?.allowFrom as string[]) ?? [];
    },
    setAccountEnabled: ({ cfg, accountId, enabled }: any) =>
      setAccountEnabledInConfigSection({ cfg, sectionKey: "whatsapp", accountId, enabled, allowTopLevel: true }),
    deleteAccount: ({ cfg, accountId }: any) =>
      deleteAccountFromConfigSection({ cfg, sectionKey: "whatsapp", accountId, clearBaseFields: ["name"] }),
  },
  setup: {
    applyAccountConfig: ({ cfg, accountId, input }: any) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "whatsapp",
        accountId,
        name: input.name,
        alwaysUseAccounts: true,
      });
      const next = migrateBaseNameToDefaultAccount({
        cfg: namedConfig,
        channelKey: "whatsapp",
        alwaysUseAccounts: true,
      });
      const entry = {
        ...next.channels?.whatsapp?.accounts?.[accountId],
        ...(input.authDir ? { authDir: input.authDir } : {}),
        enabled: true,
      };
      return {
        ...next,
        channels: {
          ...next.channels,
          whatsapp: {
            ...next.channels?.whatsapp,
            accounts: {
              ...next.channels?.whatsapp?.accounts,
              [accountId]: entry,
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "gateway",
    resolveTarget: ({ to, allowFrom, mode }: any) => {
      const trimmed = to?.trim() ?? "";
      const allowListRaw = (allowFrom ?? []).map((entry: any) => String(entry).trim()).filter(Boolean);
      const hasWildcard = allowListRaw.includes("*");
      const allowList = allowListRaw
        .filter((entry: string) => entry !== "*")
        .map((entry: string) => normalizeWhatsAppTarget(entry))
        .filter((entry: string | null): entry is string => Boolean(entry));

      if (trimmed) {
        const normalizedTo = normalizeWhatsAppTarget(trimmed);
        if (!normalizedTo) {
          if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
            return { ok: true, to: allowList[0] };
          }
          return { ok: false, error: missingTargetError("WhatsApp", "<E.164|group JID> or channels.whatsapp.allowFrom[0]") };
        }
        if (isWhatsAppGroupJid(normalizedTo)) {
          return { ok: true, to: normalizedTo };
        }
        if (mode === "implicit" || mode === "heartbeat") {
          if (hasWildcard || allowList.length === 0) {
            return { ok: true, to: normalizedTo };
          }
          if (allowList.includes(normalizedTo)) {
            return { ok: true, to: normalizedTo };
          }
          return { ok: true, to: allowList[0] };
        }
        return { ok: true, to: normalizedTo };
      }

      if (allowList.length > 0) {
        return { ok: true, to: allowList[0] };
      }
      return { ok: false, error: missingTargetError("WhatsApp", "<E.164|group JID> or channels.whatsapp.allowFrom[0]") };
    },
    sendText: async ({ to, text, accountId, deps, gifPlayback }: any) => {
      if (deps?.sendWhatsApp) {
        const result = await deps.sendWhatsApp(to, text, {
          verbose: false,
          accountId: accountId ?? undefined,
          gifPlayback,
        });
        return { channel: "whatsapp", ...result };
      }
      return { channel: "whatsapp", messageId: "stub", to, text };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, deps, gifPlayback }: any) => {
      if (deps?.sendWhatsApp) {
        const result = await deps.sendWhatsApp(to, text, {
          verbose: false,
          mediaUrl,
          accountId: accountId ?? undefined,
          gifPlayback,
        });
        return { channel: "whatsapp", ...result };
      }
      return { channel: "whatsapp", messageId: "stub", to, text };
    },
  },
  messaging: {
    normalizeTarget: (raw: string) => {
      return normalizeWhatsAppTarget(stripWhatsAppTargetPrefixes(raw)) ?? undefined;
    },
    targetResolver: {
      looksLikeId: (raw: string) => {
        const trimmed = stripWhatsAppTargetPrefixes(raw);
        if (!trimmed) return false;
        if (trimmed.toLowerCase().endsWith("@g.us")) return true;
        if (/@s\.whatsapp\.net$/i.test(trimmed)) return true;
        if (/@lid$/i.test(trimmed)) return true;
        if (/^\+?\d{6,}$/.test(trimmed)) return true;
        if (/^whatsapp:/i.test(raw.trim())) return true;
        return false;
      },
      hint: "<E.164|group JID>",
    },
  },
  heartbeat: {
    checkReady: async ({ cfg, accountId, deps }: any) => {
      if (cfg?.web?.enabled === false) {
        return { ok: false, reason: "whatsapp-disabled" };
      }
      const entry = cfg?.channels?.whatsapp;
      const accounts = entry?.accounts as Record<string, any> | undefined;
      const account = accountId && accounts ? accounts[accountId] : entry;
      const authExists = await (deps?.webAuthExists ?? (async () => false))(account?.authDir);
      if (!authExists) {
        return { ok: false, reason: "whatsapp-not-linked" };
      }
      const listenerActive = deps?.hasActiveWebListener ? deps.hasActiveWebListener() : false;
      if (!listenerActive) {
        return { ok: false, reason: "whatsapp-not-running" };
      }
      return { ok: true, reason: "ok" };
    },
  },
};
