/**
 * GTK GUI IPC Module
 * 
 * Provides communication between ClosedClaw and a GTK GUI application
 * using either Unix sockets or file-based IPC.
 * 
 * Message Format (JSON lines):
 * {
 *   "id": "unique-message-id",
 *   "type": "message" | "response" | "status",
 *   "from": "user-id",
 *   "to": "assistant" | "user-id",
 *   "text": "message content",
 *   "timestamp": 1234567890,
 *   "attachments": [{ "path": "/path/to/file", "mimeType": "image/png" }]
 * }
 */

import { createServer, type Server, type Socket } from "node:net";
import { watch, type FSWatcher, chmodSync } from "node:fs";
import { readFile, writeFile, appendFile, access, mkdir } from "node:fs/promises";
import crypto from "node:crypto";
import { dirname, join } from "node:path";
import { EventEmitter } from "node:events";

export interface GtkMessage {
  id: string;
  type: "message" | "response" | "status";
  from: string;
  to: string;
  text: string;
  timestamp: number;
  /** Risk level of the operation performed (surfaced by ClawTalk routing). */
  riskLevel?: "low" | "medium" | "high";
  attachments?: Array<{
    path: string;
    mimeType: string;
    data?: string; // base64 encoded
  }>;
}

export interface GtkIpcConfig {
  socketPath?: string;
  inboxPath?: string;
  outboxPath?: string;
  userId?: string;
  /** Enable token-based authentication for socket connections. Default: true */
  requireAuth?: boolean;
}

export type MessageHandler = (message: GtkMessage) => void | Promise<void>;

export class GtkIpcBridge extends EventEmitter {
  private config: GtkIpcConfig;
  private socketServer: Server | null = null;
  private connectedClients: Set<Socket> = new Set();
  private authenticatedClients: WeakSet<Socket> = new WeakSet();
  private sessionToken: string | null = null;
  private fileWatcher: FSWatcher | null = null;
  private lastInboxPosition = 0;
  private messageHandler: MessageHandler | null = null;

  constructor(config: GtkIpcConfig) {
    super();
    this.config = config;
  }

  /**
   * Generate a session token and write it to the state directory.
   * The Python client reads this token to authenticate.
   */
  private async generateSessionToken(): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenDir = this.config.socketPath
      ? dirname(this.config.socketPath)
      : dirname(this.config.inboxPath ?? "");
    const tokenPath = join(tokenDir, "gtk-session-token");
    await this.ensureDir(tokenDir);
    await writeFile(tokenPath, token, { encoding: "utf-8", mode: 0o600 });
    return token;
  }

  /**
   * Get the current session token (for testing/diagnostics).
   */
  get token(): string | null {
    return this.sessionToken;
  }

  async start(handler: MessageHandler): Promise<void> {
    this.messageHandler = handler;

    // Generate session token for authentication (socket mode only)
    const requireAuth = this.config.requireAuth !== false;
    if (requireAuth && this.config.socketPath) {
      this.sessionToken = await this.generateSessionToken();
    }

    if (this.config.socketPath) {
      await this.startSocketServer();
    } else if (this.config.inboxPath && this.config.outboxPath) {
      await this.startFileWatcher();
    } else {
      throw new Error("GTK IPC requires either socketPath or inboxPath/outboxPath");
    }
  }

  async stop(): Promise<void> {
    if (this.socketServer) {
      for (const client of this.connectedClients) {
        client.destroy();
      }
      this.connectedClients.clear();
      await new Promise<void>((resolve) => {
        this.socketServer?.close(() => resolve());
      });
      this.socketServer = null;
    }

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  async send(message: GtkMessage): Promise<void> {
    const line = JSON.stringify(message) + "\n";

    if (this.socketServer && this.connectedClients.size > 0) {
      for (const client of this.connectedClients) {
        // Only send to authenticated clients
        if (this.authenticatedClients.has(client)) {
          client.write(line);
        }
      }
    } else if (this.config.outboxPath) {
      await this.ensureDir(dirname(this.config.outboxPath));
      await appendFile(this.config.outboxPath, line, "utf-8");
    }

    this.emit("sent", message);
  }

  private async startSocketServer(): Promise<void> {
    const socketPath = this.config.socketPath!;
    const requireAuth = this.config.requireAuth !== false;
    
    // Ensure socket directory exists with restricted permissions
    const socketDir = dirname(socketPath);
    await this.ensureDir(socketDir);

    // Remove stale socket file if exists
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(socketPath);
    } catch {
      // Socket file doesn't exist, that's fine
    }

    this.socketServer = createServer((socket) => {
      this.connectedClients.add(socket);

      if (!requireAuth || !this.sessionToken) {
        // Auth disabled — auto-authenticate
        this.authenticatedClients.add(socket);
        this.emit("clientConnected", socket);
      }

      let buffer = "";

      socket.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            // Check if this is an auth message from an unauthenticated client
            if (requireAuth && this.sessionToken && !this.authenticatedClients.has(socket)) {
              this.handleAuthMessage(socket, line.trim());
              continue;
            }
            try {
              const message = JSON.parse(line) as GtkMessage;
              this.handleIncomingMessage(message);
            } catch  {
              this.emit("error", new Error(`Invalid JSON: ${line}`));
            }
          }
        }
      });

      socket.on("close", () => {
        this.connectedClients.delete(socket);
        this.emit("clientDisconnected", socket);
      });

      socket.on("error", (err) => {
        this.emit("error", err);
        this.connectedClients.delete(socket);
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.socketServer!.listen(socketPath, () => {
        // Restrict socket file permissions to owner only (0600)
        try {
          chmodSync(socketPath, 0o600);
        } catch {
          // Best-effort; some systems may not support chmod on sockets
        }
        this.emit("listening", socketPath);
        resolve();
      });
      this.socketServer!.on("error", reject);
    });
  }

  /**
   * Handle an authentication message from an unauthenticated client.
   * Expected format: {"type":"auth","token":"<hex-token>"}
   */
  private handleAuthMessage(socket: Socket, line: string): void {
    try {
      const msg = JSON.parse(line) as { type?: string; token?: string };
      if (msg.type === "auth" && msg.token) {
        // Constant-time comparison to prevent timing attacks
        const expected = Buffer.from(this.sessionToken!, "utf-8");
        const received = Buffer.from(msg.token, "utf-8");
        if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) {
          this.authenticatedClients.add(socket);
          this.emit("clientConnected", socket);
          socket.write(JSON.stringify({ type: "auth_ok" }) + "\n");
          return;
        }
      }
    } catch {
      // Invalid JSON — fall through to reject
    }
    socket.write(JSON.stringify({ type: "auth_failed", error: "Invalid token" }) + "\n");
    socket.end();
    this.connectedClients.delete(socket);
  }

  private async startFileWatcher(): Promise<void> {
    const inboxPath = this.config.inboxPath!;
    
    await this.ensureDir(dirname(inboxPath));
    
    // Create inbox file if it doesn't exist
    try {
      await access(inboxPath);
    } catch {
      await writeFile(inboxPath, "", "utf-8");
    }

    // Get initial file size
    const content = await readFile(inboxPath, "utf-8");
    this.lastInboxPosition = content.length;

    this.fileWatcher = watch(inboxPath, async (eventType) => {
      if (eventType === "change") {
        await this.processNewMessages();
      }
    });

    this.emit("watching", inboxPath);
  }

  private async processNewMessages(): Promise<void> {
    const inboxPath = this.config.inboxPath!;
    
    try {
      const content = await readFile(inboxPath, "utf-8");
      const newContent = content.slice(this.lastInboxPosition);
      this.lastInboxPosition = content.length;

      const lines = newContent.split("\n").filter((line) => line.trim());
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as GtkMessage;
          this.handleIncomingMessage(message);
        } catch  {
          this.emit("error", new Error(`Invalid JSON in inbox: ${line}`));
        }
      }
    } catch (err) {
      this.emit("error", err);
    }
  }

  private handleIncomingMessage(message: GtkMessage): void {
    this.emit("message", message);
    if (this.messageHandler) {
      Promise.resolve(this.messageHandler(message)).catch((err) => {
        this.emit("error", err);
      });
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  get isConnected(): boolean {
    if (this.socketServer) {
      return this.connectedClients.size > 0;
    }
    return this.fileWatcher !== null;
  }

  get clientCount(): number {
    return this.connectedClients.size;
  }
}

export function generateMessageId(): string {
  return `gtk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
