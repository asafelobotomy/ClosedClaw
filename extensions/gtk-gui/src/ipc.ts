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
import { watch, type FSWatcher } from "node:fs";
import { readFile, writeFile, appendFile, access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { EventEmitter } from "node:events";

export interface GtkMessage {
  id: string;
  type: "message" | "response" | "status";
  from: string;
  to: string;
  text: string;
  timestamp: number;
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
}

export type MessageHandler = (message: GtkMessage) => void | Promise<void>;

export class GtkIpcBridge extends EventEmitter {
  private config: GtkIpcConfig;
  private socketServer: Server | null = null;
  private connectedClients: Set<Socket> = new Set();
  private fileWatcher: FSWatcher | null = null;
  private lastInboxPosition = 0;
  private messageHandler: MessageHandler | null = null;

  constructor(config: GtkIpcConfig) {
    super();
    this.config = config;
  }

  async start(handler: MessageHandler): Promise<void> {
    this.messageHandler = handler;

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
        client.write(line);
      }
    } else if (this.config.outboxPath) {
      await this.ensureDir(dirname(this.config.outboxPath));
      await appendFile(this.config.outboxPath, line, "utf-8");
    }

    this.emit("sent", message);
  }

  private async startSocketServer(): Promise<void> {
    const socketPath = this.config.socketPath!;
    
    // Ensure socket directory exists
    await this.ensureDir(dirname(socketPath));

    // Remove stale socket file if exists
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(socketPath);
    } catch {
      // Socket file doesn't exist, that's fine
    }

    this.socketServer = createServer((socket) => {
      this.connectedClients.add(socket);
      this.emit("clientConnected", socket);

      let buffer = "";

      socket.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
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
        this.emit("listening", socketPath);
        resolve();
      });
      this.socketServer!.on("error", reject);
    });
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
