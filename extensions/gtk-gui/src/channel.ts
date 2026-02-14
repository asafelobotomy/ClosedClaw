/**
 * GTK GUI Channel Plugin
 *
 * Provides ClosedClaw channel integration for a custom GTK GUI application.
 * Supports Unix socket or file-based IPC for message exchange.
 */

import type {
  ChannelPlugin,
  ChannelCapabilities,
  ChannelMeta,
  ClosedClawConfig,
} from "ClosedClaw/plugin-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { GtkIpcBridge, generateMessageId, type GtkMessage, type GtkIpcConfig } from "./ipc.js";
import { processGtkMessage } from "./monitor.js";

const CLOSEDCLAW_STATE_DIR = join(homedir(), ".ClosedClaw");
const DEFAULT_SOCKET_PATH = join(CLOSEDCLAW_STATE_DIR, "gtk.sock");
const DEFAULT_INBOX_PATH = join(CLOSEDCLAW_STATE_DIR, "gtk", "inbox.jsonl");
const DEFAULT_OUTBOX_PATH = join(CLOSEDCLAW_STATE_DIR, "gtk", "outbox.jsonl");
const DEFAULT_USER_ID = "gtk-user";
const CHANNEL_ID = "gtk-gui";

// Singleton IPC bridge
let ipcBridge: GtkIpcBridge | null = null;

function resolveGtkConfig(cfg: ClosedClawConfig): GtkIpcConfig {
  const pluginConfig = (cfg as Record<string, unknown>).plugins as
    | Record<string, unknown>
    | undefined;
  const entries = pluginConfig?.entries as Record<string, unknown> | undefined;
  const gtkEntry = entries?.["gtk-gui"] as Record<string, unknown> | undefined;
  const config = gtkEntry?.config as GtkIpcConfig | undefined;

  return {
    socketPath: config?.socketPath ?? DEFAULT_SOCKET_PATH,
    inboxPath: config?.inboxPath ?? DEFAULT_INBOX_PATH,
    outboxPath: config?.outboxPath ?? DEFAULT_OUTBOX_PATH,
    userId: config?.userId ?? DEFAULT_USER_ID,
  };
}

function getIpcBridge(cfg: ClosedClawConfig): GtkIpcBridge {
  if (!ipcBridge) {
    const config = resolveGtkConfig(cfg);
    ipcBridge = new GtkIpcBridge(config);
  }
  return ipcBridge;
}

const gtkChannelMeta: ChannelMeta = {
  id: "gtk-gui",
  label: "GTK GUI",
  selectionLabel: "GTK GUI (Desktop)",
  detailLabel: "GTK Desktop",
  docsPath: "/channels/gtk-gui",
  docsLabel: "gtk-gui",
  blurb: "native Linux desktop GUI — the primary interface for ClosedClaw.",
  systemImage: "desktopcomputer",
  order: 1,
  aliases: ["gtk", "gui", "desktop"],
};

const gtkCapabilities: ChannelCapabilities = {
  chatTypes: ["direct"],
  reactions: false,
  threads: false,
  media: true,
  nativeCommands: false,
  blockStreaming: true,
};

interface ResolvedGtkAccount {
  accountId: string;
  userId: string;
  enabled: boolean;
  config: GtkIpcConfig;
}

export const gtkGuiPlugin: ChannelPlugin<ResolvedGtkAccount> = {
  id: CHANNEL_ID,
  meta: gtkChannelMeta,
  capabilities: gtkCapabilities,

  reload: {
    configPrefixes: ["plugins.entries.gtk-gui"],
  },

  config: {
    listAccountIds: () => ["default"],

    resolveAccount: (cfg, accountId) => {
      const config = resolveGtkConfig(cfg);
      return {
        accountId: accountId ?? "default",
        userId: config.userId ?? DEFAULT_USER_ID,
        enabled: true,
        config,
      };
    },

    defaultAccountId: () => "default",

    setAccountEnabled: () => {
      // Single account, always enabled
      return {};
    },

    deleteAccount: () => {
      // Cannot delete the single account
      return {};
    },

    isConfigured: (_account) => {
      return Boolean(
        _account.config.socketPath || (_account.config.inboxPath && _account.config.outboxPath),
      );
    },

    describeAccount: (_account) => ({
      accountId: _account.accountId,
      name: "GTK GUI",
      enabled: _account.enabled,
      configured: true,
    }),

    resolveAllowFrom: () => ["*"], // Allow all local GTK messages

    formatAllowFrom: ({ allowFrom }) => allowFrom,
  },

  security: {
    resolveDmPolicy: ({ _account }) => ({
      policy: "open", // Trust local GTK app
      allowFrom: ["*"],
      policyPath: "plugins.entries.gtk-gui.config",
      allowFromPath: "plugins.entries.gtk-gui.config",
      approveHint: "GTK GUI messages are from local application",
      normalizeEntry: (raw) => raw,
    }),

    resolveGroupPolicy: () => ({
      policy: "disabled",
      allowlist: [],
      policyPath: "plugins.entries.gtk-gui.config",
    }),
  },

  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 16_000,

    resolveTarget: (params: { to?: string }) => {
      const to = params.to?.trim() || DEFAULT_USER_ID;
      return { ok: true as const, to };
    },

    sendText: async (ctx: {
      cfg: ClosedClawConfig;
      to: string;
      text: string;
      accountId?: string | null;
    }) => {
      const bridge = getIpcBridge(ctx.cfg);
      const config = resolveGtkConfig(ctx.cfg);
      const target = ctx.to?.trim() || config.userId || DEFAULT_USER_ID;

      const message: GtkMessage = {
        id: generateMessageId(),
        type: "response",
        from: "assistant",
        to: target,
        text: ctx.text ?? "",
        timestamp: Date.now(),
      };

      await bridge.send(message);

      return {
        channel: CHANNEL_ID as string,
        messageId: message.id,
      };
    },

    sendMedia: async (ctx: {
      cfg: ClosedClawConfig;
      to: string;
      text: string;
      mediaUrl?: string;
      accountId?: string | null;
    }) => {
      const bridge = getIpcBridge(ctx.cfg);
      const config = resolveGtkConfig(ctx.cfg);
      const target = ctx.to?.trim() || config.userId || DEFAULT_USER_ID;

      const message: GtkMessage = {
        id: generateMessageId(),
        type: "response",
        from: "assistant",
        to: target,
        text: ctx.text ?? "",
        timestamp: Date.now(),
        attachments: ctx.mediaUrl
          ? [{ path: ctx.mediaUrl, mimeType: "application/octet-stream" }]
          : undefined,
      };

      await bridge.send(message);

      return {
        channel: CHANNEL_ID as string,
        messageId: message.id,
      };
    },
  },

  status: {
    async probe({ cfg }) {
      const config = resolveGtkConfig(cfg);
      const bridge = getIpcBridge(cfg);

      return {
        connected: bridge.isConnected,
        accounts: [
          {
            accountId: "default",
            status: bridge.isConnected ? "connected" : "disconnected",
            details: {
              socketPath: config.socketPath,
              clientCount: bridge.clientCount,
            },
          },
        ],
      };
    },

    collectIssues: async ({ cfg }) => {
      const issues: Array<{ level: "error" | "warning" | "info"; message: string }> = [];
      const config = resolveGtkConfig(cfg);

      if (!config.socketPath && !config.inboxPath) {
        issues.push({
          level: "warning",
          message: "GTK GUI IPC not configured - using default socket path",
        });
      }

      return issues;
    },
  },

  gateway: {
    async startAccount(ctx) {
      const { cfg, log, accountId, _account, setStatus } = ctx;
      const config = resolveGtkConfig(cfg);
      const bridge = getIpcBridge(cfg);

      log?.info?.(`Starting GTK GUI IPC bridge at ${config.socketPath ?? config.inboxPath}`);

      try {
        await bridge.start(async (message) => {
          log?.debug?.(`Received GTK message: ${message.id}`);

          // Process the message through the AI agent
          const result = await processGtkMessage(message, {
            cfg,
            accountId: accountId ?? "default",
            log,
            setStatus,
            userId: config.userId ?? DEFAULT_USER_ID,
          });

          // Send response back to GTK client
          if (result.text) {
            const response: GtkMessage = {
              id: generateMessageId(),
              type: "response",
              from: "assistant",
              to: message.from,
              text: result.text,
              timestamp: Date.now(),
              riskLevel: result.riskLevel,
            };
            await bridge.send(response);
            log?.debug?.(`Sent response: ${response.id}`);
          } else if (result.error) {
            const errorResponse: GtkMessage = {
              id: generateMessageId(),
              type: "status",
              from: "system",
              to: message.from,
              text: `Error: ${result.error}`,
              timestamp: Date.now(),
            };
            await bridge.send(errorResponse);
            log?.warn?.(`Sent error response: ${result.error}`);
          }
        });

        bridge.on("clientConnected", () => {
          log?.info?.("GTK GUI client connected");
        });

        bridge.on("clientDisconnected", () => {
          log?.info?.("GTK GUI client disconnected");
        });

        bridge.on("error", (err) => {
          log?.error?.(`GTK GUI IPC error: ${err.message}`);
        });

        log?.info?.("GTK GUI IPC bridge started successfully");
      } catch (err) {
        log?.error?.(`Failed to start GTK GUI IPC: ${err}`);
        throw err;
      }
    },

    async stopAccount(ctx) {
      const { log } = ctx;
      if (ipcBridge) {
        log?.info?.("Stopping GTK GUI IPC bridge");
        await ipcBridge.stop();
        ipcBridge = null;
      }
    },
  },

  streaming: {
    supportsBlockStreaming: () => true,

    async streamBlock(ctx) {
      const { cfg, to, text } = ctx;
      const bridge = getIpcBridge(cfg);
      const config = resolveGtkConfig(cfg);

      const message: GtkMessage = {
        id: generateMessageId(),
        type: "response",
        from: "assistant",
        to: to ?? config.userId ?? DEFAULT_USER_ID,
        text: text ?? "",
        timestamp: Date.now(),
      };

      await bridge.send(message);

      return {
        success: true,
        messageId: message.id,
      };
    },
  },
};
