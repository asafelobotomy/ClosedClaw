/**
 * TPC Dead Drop Manager
 *
 * File-based transport for TPC messages. Manages the dead-drop
 * directory structure where agents exchange WAV-encoded TPC envelopes.
 *
 * Directory structure:
 *   dead-drop/
 *     inbox/{agentId}/   → Agents poll here for new messages
 *     outbox/{agentId}/  → Agents write completed results here
 *     archive/           → Processed messages (auto-cleaned by TTL)
 */

import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

const MAX_WAV_BYTES = 5 * 1024 * 1024; // 5MB safety cap
const VALID_ID_REGEX = /^[A-Za-z0-9._-]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeadDropConfig {
  /** Root directory for the dead-drop */
  basePath: string;
  /** Polling interval in ms (used when chokidar unavailable) */
  pollingInterval: number;
  /** Archive TTL in ms (default: 24h = 86400000) */
  archiveTtlMs: number;
  /** Cleanup interval in ms (default: 1h = 3600000) */
  cleanupIntervalMs: number;
}

export interface DeadDropMessage {
  /** Full file path */
  filePath: string;
  /** File name */
  fileName: string;
  /** Target agent ID (parsed from directory) */
  targetAgent: string;
  /** File creation time */
  createdAt: number;
}

export interface DeadDropEvents {
  message: [DeadDropMessage];
  error: [Error];
}

// ---------------------------------------------------------------------------
// Dead Drop Manager
// ---------------------------------------------------------------------------

export class DeadDropManager extends EventEmitter<DeadDropEvents> {
  private readonly config: DeadDropConfig;
  private readonly resolvedBase: string;
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private watcher: { close(): Promise<void> } | null = null;
  private started = false;

  constructor(config: DeadDropConfig) {
    super();
    this.config = config;
    this.resolvedBase = DeadDropManager.resolvePath(config.basePath);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the dead-drop directory structure and start watching.
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    // Create directory structure
    this.ensureDirectories();

    // Try chokidar for efficient file watching, fall back to polling
    try {
      await this.startChokidarWatcher();
    } catch {
      // Chokidar may not be available or may fail — use polling
      this.startPolling();
    }

    // Start archive cleanup
    this.cleanupTimer = setInterval(
      () => void this.cleanupArchive(),
      this.config.cleanupIntervalMs,
    );

    this.started = true;
  }

  /**
   * Stop watching and clean up timers.
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.pollTimers.values()) {
      clearInterval(timer);
    }
    this.pollTimers.clear();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.started = false;
  }

  // -------------------------------------------------------------------------
  // Message operations
  // -------------------------------------------------------------------------

  /**
   * Write a WAV file to a target agent's inbox.
   * File is written atomically (write to temp, then rename).
   */
  async writeMessage(params: {
    targetAgent: string;
    wavData: Buffer;
    messageId: string;
  }): Promise<string> {
    this.assertSafeAgentId(params.targetAgent);
    this.assertSafeMessageId(params.messageId);
    this.assertWavSize(params.wavData.length);

    const inboxDir = this.agentInboxPath(params.targetAgent);
    fs.mkdirSync(inboxDir, { recursive: true, mode: 0o700 });

    const fileName = `${params.messageId}.wav`;
    const filePath = path.join(inboxDir, fileName);
    const tempPath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;

    this.assertWithinBase(filePath);

    // Atomic write: write to temp file, then rename
    fs.writeFileSync(tempPath, params.wavData, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);

    return filePath;
  }

  /**
   * Read and consume a message from an agent's inbox.
   * Moves the file to archive after reading.
   */
  async readMessage(filePath: string): Promise<Buffer> {
    this.assertWithinBase(filePath);
    this.assertWavExtension(filePath);

    const stats = fs.statSync(filePath);
    this.assertWavSize(stats.size);

    const data = fs.readFileSync(filePath);

    // Move to archive
    const archiveDir = this.archivePath();
    fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });

    const archivePath = path.join(archiveDir, path.basename(filePath));
    fs.renameSync(filePath, archivePath);

    return data;
  }

  /**
   * List all pending messages for a specific agent.
   */
  listMessages(agentId: string): DeadDropMessage[] {
    this.assertSafeAgentId(agentId);
    const inboxDir = this.agentInboxPath(agentId);
    if (!fs.existsSync(inboxDir)) {
      return [];
    }

    const files = fs.readdirSync(inboxDir);
    return files
      .filter((f) => this.isValidMessageFile(f))
      .map((f) => ({
        filePath: path.join(inboxDir, f),
        fileName: f,
        targetAgent: agentId,
        createdAt: fs.statSync(path.join(inboxDir, f)).mtimeMs,
      }))
      .toSorted((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Write a result to an agent's outbox.
   */
  async writeResult(params: {
    sourceAgent: string;
    wavData: Buffer;
    messageId: string;
  }): Promise<string> {
    this.assertSafeAgentId(params.sourceAgent);
    this.assertSafeMessageId(params.messageId);
    this.assertWavSize(params.wavData.length);

    const outboxDir = this.agentOutboxPath(params.sourceAgent);
    fs.mkdirSync(outboxDir, { recursive: true, mode: 0o700 });

    const fileName = `${params.messageId}.wav`;
    const filePath = path.join(outboxDir, fileName);
    const tempPath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;

    this.assertWithinBase(filePath);

    fs.writeFileSync(tempPath, params.wavData, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);

    return filePath;
  }

  // -------------------------------------------------------------------------
  // Watch for new messages
  // -------------------------------------------------------------------------

  /**
   * Start polling a specific agent's inbox for new messages.
   */
  watchAgent(agentId: string): void {
    this.assertSafeAgentId(agentId);
    if (this.pollTimers.has(agentId)) {
      return;
    }

    const seen = new Set<string>();

    const poll = (): void => {
      try {
        const messages = this.listMessages(agentId);
        for (const msg of messages) {
          if (!seen.has(msg.fileName)) {
            seen.add(msg.fileName);
            this.emit("message", msg);
          }
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Immediate check + interval
    poll();
    const timer = setInterval(poll, this.config.pollingInterval);
    this.pollTimers.set(agentId, timer);
  }

  /**
   * Stop watching a specific agent's inbox.
   */
  unwatchAgent(agentId: string): void {
    const timer = this.pollTimers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(agentId);
    }
  }

  // -------------------------------------------------------------------------
  // Path helpers
  // -------------------------------------------------------------------------

  agentInboxPath(agentId: string): string {
    return path.join(this.resolvedBase, "inbox", agentId);
  }

  agentOutboxPath(agentId: string): string {
    return path.join(this.resolvedBase, "outbox", agentId);
  }

  archivePath(): string {
    return path.join(this.resolvedBase, "archive");
  }

  getBasePath(): string {
    return this.resolvedBase;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private ensureDirectories(): void {
    const dirs = [
      this.resolvedBase,
      path.join(this.resolvedBase, "inbox"),
      path.join(this.resolvedBase, "outbox"),
      path.join(this.resolvedBase, "archive"),
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Verify permissions on base directory
    const stats = fs.statSync(this.resolvedBase);
    const mode = stats.mode & 0o777;
    if (mode !== 0o700) {
      fs.chmodSync(this.resolvedBase, 0o700);
    }
  }

  private async startChokidarWatcher(): Promise<void> {
    // Dynamic import to handle cases where chokidar isn't available
    const chokidar = await import("chokidar");
    const inboxGlob = path.join(this.resolvedBase, "inbox", "**", "*.wav");

    const watcher = chokidar.watch(inboxGlob, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    watcher.on("add", (filePath: string) => {
      // Skip temp files
      if (filePath.includes(".tmp")) {
        return;
      }

      const parts = filePath.split(path.sep);
      const inboxIdx = parts.indexOf("inbox");
      if (inboxIdx === -1 || inboxIdx + 1 >= parts.length) {
        return;
      }

      const targetAgent = parts[inboxIdx + 1];
      const fileName = parts[parts.length - 1];

      if (this.isValidAgentId(targetAgent) && this.isValidMessageFile(fileName)) {
        this.emit("message", {
          filePath,
          fileName,
          targetAgent,
          createdAt: Date.now(),
        });
      }
    });

    watcher.on("error", (err: unknown) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });

    this.watcher = watcher;
  }

  private startPolling(): void {
    // When no watcher, poll the inbox root for any agent directories
    const pollRoot = (): void => {
      try {
        const inboxRoot = path.join(this.resolvedBase, "inbox");
        if (!fs.existsSync(inboxRoot)) {
          return;
        }

        const agents = fs.readdirSync(inboxRoot);
        for (const agentId of agents) {
          const agentPath = path.join(inboxRoot, agentId);
          if (fs.statSync(agentPath).isDirectory() && this.isValidAgentId(agentId)) {
            this.watchAgent(agentId);
          }
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    };

    pollRoot();
    // Check for new agent directories periodically
    const timer = setInterval(pollRoot, this.config.pollingInterval * 5);
    this.pollTimers.set("__root__", timer);
  }

  private async cleanupArchive(): Promise<void> {
    const archiveDir = this.archivePath();
    if (!fs.existsSync(archiveDir)) {
      return;
    }

    const now = Date.now();
    const files = fs.readdirSync(archiveDir);

    for (const file of files) {
      try {
        const filePath = path.join(archiveDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > this.config.archiveTtlMs) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  static resolvePath(p: string): string {
    if (p.startsWith("~/")) {
      return path.join(process.env.HOME ?? "/tmp", p.slice(2));
    }
    return p;
  }

  private assertSafeAgentId(agentId: string): void {
    if (!this.isValidAgentId(agentId)) {
      throw new Error(`Invalid agent identifier: ${agentId}`);
    }
  }

  private assertSafeMessageId(messageId: string): void {
    if (!this.isValidMessageId(messageId)) {
      throw new Error(`Invalid message identifier: ${messageId}`);
    }
  }

  private assertWithinBase(filePath: string): void {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(this.resolvedBase))) {
      throw new Error("File path escapes dead-drop base directory");
    }
  }

  private assertWavSize(size: number): void {
    if (size <= 0) {
      throw new Error("WAV data is empty");
    }
    if (size > MAX_WAV_BYTES) {
      throw new Error(`WAV data exceeds maximum allowed size of ${MAX_WAV_BYTES} bytes`);
    }
  }

  private assertWavExtension(filePath: string): void {
    if (!filePath.endsWith(".wav")) {
      throw new Error("Unexpected file type; only .wav messages are allowed");
    }
  }

  private isValidMessageFile(fileName: string): boolean {
    if (!fileName.endsWith(".wav")) {
      return false;
    }
    if (fileName.endsWith(".tmp")) {
      return false;
    }
    const base = fileName.replace(/\.wav$/, "");
    return this.isValidMessageId(base);
  }

  private isValidAgentId(agentId: string): boolean {
    return VALID_ID_REGEX.test(agentId);
  }

  private isValidMessageId(messageId: string): boolean {
    return VALID_ID_REGEX.test(messageId);
  }
}
