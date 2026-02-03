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
import { GtkIpcBridge, generateMessageId, type GtkMessage, type GtkIpcConfig } from "./ipc.js";
import { processGtkMessage } from "./monitor.js";

const DEFAULT_SOCKET_PATH = "/tmp/closedclaw-gtk.sock";
const DEFAULT_INBOX_PATH = "/tmp/closedclaw-gtk/inbox.jsonl";
const DEFAULT_OUTBOX_PATH = "/tmp/closedclaw-gtk/outbox.jsonl";
const DEFAULT_USER_ID = "gtk-user";
const CHANNEL_ID = "gtk-gui";

// Singleton IPC bridge
let ipcBridge: GtkIpcBridge | null = null;

function resolveGtkConfig(cfg: ClosedClawConfig): GtkIpcConfig {
  const pluginConfig = (cfg as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
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
  name: "GTK GUI",
  displayName: "GTK GUI",
  order: 1,
  icon: "desktop",
  description: "Custom GTK desktop GUI for Linux",
  color: "#4a86cf", // GTK blue
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
    configPrefixes: ["plugins.entries.gtk-gui"] 
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
    
    isConfigured: (account) => {
      return Boolean(account.config.socketPath || (account.config.inboxPath && account.config.outboxPath));
    },
    
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: "GTK GUI",
      enabled: account.enabled,
      configured: true,
    }),
    
    resolveAllowFrom: () => ["*"], // Allow all local GTK messages
    
    formatAllowFrom: ({ allowFrom }) => allowFrom,
  },

  security: {
    resolveDmPolicy: ({ account }) => ({
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
    normalizeTarget: (target) => {
      const trimmed = target.trim();
      return trimmed || DEFAULT_USER_ID;
    },
    
    looksLikeTarget: (target) => {
      return Boolean(target?.trim());
    },
    
    async send(ctx) {
      const { cfg, to, text, attachments } = ctx;
      const bridge = getIpcBridge(cfg);
      const config = resolveGtkConfig(cfg);

      const message: GtkMessage = {
        id: generateMessageId(),
        type: "response",
        from: "assistant",
        to: to ?? config.userId ?? DEFAULT_USER_ID,
        text: text ?? "",
        timestamp: Date.now(),
        attachments: attachments?.map((att) => ({
          path: att.path ?? "",
          mimeType: att.mimetype ?? "application/octet-stream",
        })),
      };

      await bridge.send(message);

      return {
        success: true,
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
        accounts: [{
          accountId: "default",
          status: bridge.isConnected ? "connected" : "disconnected",
          details: {
            socketPath: config.socketPath,
            clientCount: bridge.clientCount,
          },
        }],
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
      const { cfg, log, accountId, account, setStatus } = ctx;
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
