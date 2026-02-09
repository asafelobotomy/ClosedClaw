/**
 * Inter-Agent Communication (IPC) - Message passing between agents
 *
 * Provides typed message passing with multiple communication patterns:
 * - **Direct**: Agent A → Agent B (point-to-point)
 * - **Broadcast**: Agent A → All agents in squad
 * - **Request-Reply**: Agent A asks, Agent B responds (with timeout)
 * - **Publish-Subscribe**: Agents subscribe to named topics
 *
 * Design principles:
 * - Typed messages with clear intent (task, result, notification, question)
 * - Bounded message queues prevent memory exhaustion
 * - Timeouts on request-reply prevent deadlocks
 * - Topic-based pub/sub for loose coupling
 *
 * @module agents/squad/ipc
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Message types that indicate intent.
 */
export type MessageType = "task" | "result" | "notification" | "question" | "error";

/**
 * A message passed between agents.
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string;

  /** Sending agent ID */
  from: string;

  /** Target agent ID (undefined for broadcasts and topic messages) */
  to?: string;

  /** Message intent / type */
  type: MessageType;

  /** Message payload (serializable) */
  payload: unknown;

  /** When the message was created */
  timestamp: string;

  /** If this is a reply, the ID of the original message */
  replyTo?: string;

  /** Topic name for pub/sub messages */
  topic?: string;
}

/**
 * Handler function for incoming messages.
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Handler for request-reply that returns a response payload.
 */
export type RequestHandler = (message: AgentMessage) => Promise<unknown>;

/**
 * Registration handle for unsubscribing.
 */
export interface Subscription {
  /** Remove this subscription */
  unsubscribe(): void;
}

/**
 * Pending request awaiting a reply.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Statistics about the IPC system.
 */
export interface IPCStats {
  /** Total messages sent (direct) */
  messagesSent: number;

  /** Total messages broadcast */
  messagesBroadcast: number;

  /** Total requests made */
  requestsSent: number;

  /** Total topic messages published */
  topicMessagesPublished: number;

  /** Number of active subscriptions (topic) */
  activeTopicSubscriptions: number;

  /** Number of registered agents */
  registeredAgents: number;

  /** Messages in agent inboxes (total) */
  pendingMessages: number;
}

/**
 * Configuration for the IPC system.
 */
export interface IPCConfig {
  /** Max inbox size per agent (default: 1000) */
  maxInboxSize?: number;

  /** Default request timeout in ms (default: 30_000) */
  defaultRequestTimeout?: number;

  /** Max topic subscriptions per agent (default: 50) */
  maxTopicSubscriptions?: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_INBOX = 1000;
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_MAX_TOPIC_SUBS = 50;

// ─── AgentIPC ─────────────────────────────────────────────────────────────────

/**
 * Inter-agent communication system for a squad.
 *
 * Each agent registers with the IPC system and can send/receive messages.
 * Supports direct messaging, broadcast, request-reply, and pub/sub.
 *
 * @example
 * ```typescript
 * const ipc = new AgentIPC();
 *
 * // Register agents
 * ipc.register("agent-a");
 * ipc.register("agent-b");
 *
 * // Direct message
 * ipc.send("agent-a", "agent-b", {
 *   type: "task",
 *   payload: { action: "research", topic: "TypeScript patterns" },
 * });
 *
 * // Subscribe to inbox
 * ipc.onMessage("agent-b", (msg) => {
 *   console.log(`${msg.from} says:`, msg.payload);
 * });
 *
 * // Request-reply
 * ipc.onRequest("agent-b", async (msg) => {
 *   return { answer: 42 };
 * });
 * const result = await ipc.request("agent-a", "agent-b", { question: "?" });
 * ```
 */
export class AgentIPC {
  /** Per-agent message handlers (inbox listeners) */
  private readonly messageHandlers: Map<string, MessageHandler[]> = new Map();

  /** Per-agent request handlers */
  private readonly requestHandlers: Map<string, RequestHandler> = new Map();

  /** Topic → subscriber agent IDs + handlers */
  private readonly topicSubscriptions: Map<string, Map<string, MessageHandler[]>> = new Map();

  /** Registered agent IDs */
  private readonly agents: Set<string> = new Set();

  /** Pending requests awaiting replies */
  private readonly pendingRequests: Map<string, PendingRequest> = new Map();

  /** Message inbox queues (unprocessed messages when no handler registered) */
  private readonly inboxes: Map<string, AgentMessage[]> = new Map();

  /** Configuration */
  private readonly maxInboxSize: number;
  private readonly defaultRequestTimeout: number;
  private readonly maxTopicSubscriptions: number;

  /** Stats counters */
  private stats = {
    messagesSent: 0,
    messagesBroadcast: 0,
    requestsSent: 0,
    topicMessagesPublished: 0,
  };

  constructor(config: IPCConfig = {}) {
    this.maxInboxSize = config.maxInboxSize ?? DEFAULT_MAX_INBOX;
    this.defaultRequestTimeout = config.defaultRequestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    this.maxTopicSubscriptions = config.maxTopicSubscriptions ?? DEFAULT_MAX_TOPIC_SUBS;
  }

  // ─── Agent Registration ─────────────────────────────────────────────────

  /**
   * Register an agent with the IPC system.
   *
   * Must be called before sending/receiving messages.
   * @throws {Error} If agent already registered
   */
  register(agentId: string): void {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }
    this.agents.add(agentId);
    this.inboxes.set(agentId, []);
    this.messageHandlers.set(agentId, []);
  }

  /**
   * Unregister an agent, cleaning up all subscriptions and pending data.
   */
  unregister(agentId: string): void {
    this.agents.delete(agentId);
    this.inboxes.delete(agentId);
    this.messageHandlers.delete(agentId);
    this.requestHandlers.delete(agentId);

    // Remove from all topic subscriptions
    for (const [, subscribers] of this.topicSubscriptions) {
      subscribers.delete(agentId);
    }

    // Pending requests from this agent will timeout naturally
    // since we can't track which agent made which request.
  }

  /**
   * Check if an agent is registered.
   */
  isRegistered(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  // ─── Direct Messaging ───────────────────────────────────────────────────

  /**
   * Send a direct message from one agent to another.
   *
   * @param from - Sender agent ID
   * @param to - Recipient agent ID
   * @param options - Message content (type + payload)
   * @throws {Error} If sender or recipient not registered
   * @throws {Error} If recipient inbox is full
   */
  send(
    from: string,
    to: string,
    options: { type: MessageType; payload: unknown; replyTo?: string },
  ): AgentMessage {
    this.assertRegistered(from, "sender");
    this.assertRegistered(to, "recipient");

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      from,
      to,
      type: options.type,
      payload: options.payload,
      timestamp: new Date().toISOString(),
      replyTo: options.replyTo,
    };

    // Check if this is a reply to a pending request
    if (options.replyTo) {
      const pending = this.pendingRequests.get(options.replyTo);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(options.replyTo);
        pending.resolve(message.payload);
        this.stats.messagesSent++;
        return message;
      }
    }

    // Deliver to handlers
    const handlers = this.messageHandlers.get(to) ?? [];
    if (handlers.length > 0) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch {
          // Don't let handler errors break messaging
        }
      }
    } else {
      // Queue in inbox if no handlers
      this.enqueueInbox(to, message);
    }

    this.stats.messagesSent++;
    return message;
  }

  /**
   * Register a handler for incoming messages to an agent.
   *
   * When registered, drains any existing inbox messages through the handler.
   *
   * @returns Subscription handle for unsubscribing
   */
  onMessage(agentId: string, handler: MessageHandler): Subscription {
    this.assertRegistered(agentId, "listener");

    const handlers = this.messageHandlers.get(agentId)!;
    handlers.push(handler);

    // Drain inbox through handler
    const inbox = this.inboxes.get(agentId);
    if (inbox && inbox.length > 0) {
      const messages = inbox.splice(0);
      for (const msg of messages) {
        try {
          handler(msg);
        } catch {
          // Swallow handler errors on drain
        }
      }
    }

    return {
      unsubscribe: () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      },
    };
  }

  /**
   * Get messages in an agent's inbox (messages received before handler was set).
   */
  getInbox(agentId: string): AgentMessage[] {
    return [...(this.inboxes.get(agentId) ?? [])];
  }

  // ─── Broadcast ──────────────────────────────────────────────────────────

  /**
   * Broadcast a message to all registered agents (except sender).
   *
   * @param from - Sender agent ID
   * @param options - Message content
   * @returns Array of messages sent (one per recipient)
   */
  broadcast(
    from: string,
    options: { type: MessageType; payload: unknown },
  ): AgentMessage[] {
    this.assertRegistered(from, "broadcaster");

    const messages: AgentMessage[] = [];
    for (const agentId of this.agents) {
      if (agentId === from) continue;

      const msg = this.send(from, agentId, options);
      messages.push(msg);
    }

    this.stats.messagesBroadcast++;
    return messages;
  }

  // ─── Request-Reply ──────────────────────────────────────────────────────

  /**
   * Register a request handler for an agent.
   *
   * Only one request handler per agent. When a request arrives,
   * the handler processes it and the return value is sent back as a reply.
   *
   * @throws {Error} If agent already has a request handler
   */
  onRequest(agentId: string, handler: RequestHandler): Subscription {
    this.assertRegistered(agentId, "request handler");

    if (this.requestHandlers.has(agentId)) {
      throw new Error(`Agent ${agentId} already has a request handler`);
    }

    this.requestHandlers.set(agentId, handler);

    return {
      unsubscribe: () => {
        this.requestHandlers.delete(agentId);
      },
    };
  }

  /**
   * Send a request to another agent and await a response.
   *
   * The target agent must have a request handler registered via onRequest().
   *
   * @param from - Requesting agent ID
   * @param to - Target agent ID
   * @param payload - Request data
   * @param timeout - Response timeout in ms (default: configured default)
   * @returns The response payload from the target agent
   * @throws {Error} If target has no request handler
   * @throws {Error} If request times out
   */
  async request(
    from: string,
    to: string,
    payload: unknown,
    timeout?: number,
  ): Promise<unknown> {
    this.assertRegistered(from, "requester");
    this.assertRegistered(to, "request target");

    const handler = this.requestHandlers.get(to);
    if (!handler) {
      throw new Error(`Agent ${to} has no request handler registered`);
    }

    const requestMessage: AgentMessage = {
      id: crypto.randomUUID(),
      from,
      to,
      type: "question",
      payload,
      timestamp: new Date().toISOString(),
    };

    this.stats.requestsSent++;

    const effectiveTimeout = timeout ?? this.defaultRequestTimeout;

    // Create a promise that will be resolved when the handler responds
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestMessage.id);
        reject(new Error(
          `Request to agent ${to} timed out after ${effectiveTimeout}ms`,
        ));
      }, effectiveTimeout);

      this.pendingRequests.set(requestMessage.id, { resolve, reject, timer });

      // Execute handler and auto-resolve
      handler(requestMessage)
        .then((result) => {
          const pending = this.pendingRequests.get(requestMessage.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(requestMessage.id);
            pending.resolve(result);
          }
        })
        .catch((err) => {
          const pending = this.pendingRequests.get(requestMessage.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(requestMessage.id);
            pending.reject(
              err instanceof Error ? err : new Error(String(err)),
            );
          }
        });
    });
  }

  // ─── Publish-Subscribe ──────────────────────────────────────────────────

  /**
   * Subscribe an agent to a topic.
   *
   * @param agentId - Subscribing agent ID
   * @param topic - Topic name
   * @param handler - Handler for topic messages
   * @returns Subscription handle
   * @throws {Error} If agent not registered
   * @throws {Error} If agent exceeds max topic subscriptions
   */
  subscribe(agentId: string, topic: string, handler: MessageHandler): Subscription {
    this.assertRegistered(agentId, "subscriber");

    // Check subscription limit
    let totalSubs = 0;
    for (const [, subscribers] of this.topicSubscriptions) {
      if (subscribers.has(agentId)) {
        totalSubs += subscribers.get(agentId)!.length;
      }
    }
    if (totalSubs >= this.maxTopicSubscriptions) {
      throw new Error(
        `Agent ${agentId} has reached max topic subscriptions (${this.maxTopicSubscriptions})`,
      );
    }

    if (!this.topicSubscriptions.has(topic)) {
      this.topicSubscriptions.set(topic, new Map());
    }

    const topicSubs = this.topicSubscriptions.get(topic)!;
    if (!topicSubs.has(agentId)) {
      topicSubs.set(agentId, []);
    }

    const handlers = topicSubs.get(agentId)!;
    handlers.push(handler);

    return {
      unsubscribe: () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
        // Clean up empty entries
        if (handlers.length === 0) {
          topicSubs.delete(agentId);
        }
        if (topicSubs.size === 0) {
          this.topicSubscriptions.delete(topic);
        }
      },
    };
  }

  /**
   * Publish a message to a topic.
   *
   * All agents subscribed to the topic receive the message.
   *
   * @param from - Publishing agent ID
   * @param topic - Topic name
   * @param payload - Message data
   * @returns Number of agents that received the message
   */
  publish(from: string, topic: string, payload: unknown): number {
    this.assertRegistered(from, "publisher");

    const topicSubs = this.topicSubscriptions.get(topic);
    if (!topicSubs || topicSubs.size === 0) return 0;

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      from,
      type: "notification",
      payload,
      timestamp: new Date().toISOString(),
      topic,
    };

    let recipientCount = 0;
    for (const [agentId, handlers] of topicSubs) {
      if (agentId === from) continue; // Don't send to self

      for (const handler of handlers) {
        try {
          handler(message);
        } catch {
          // Don't let handler errors break publishing
        }
      }
      recipientCount++;
    }

    this.stats.topicMessagesPublished++;
    return recipientCount;
  }

  /**
   * List all topics that have active subscriptions.
   */
  listTopics(): string[] {
    return [...this.topicSubscriptions.keys()];
  }

  /**
   * Get the number of subscribers for a topic.
   */
  getTopicSubscriberCount(topic: string): number {
    const subs = this.topicSubscriptions.get(topic);
    return subs?.size ?? 0;
  }

  // ─── Stats & Cleanup ···────────────────────────────────────────────────

  /**
   * Get IPC statistics.
   */
  getStats(): IPCStats {
    let pendingMessages = 0;
    for (const inbox of this.inboxes.values()) {
      pendingMessages += inbox.length;
    }

    let activeTopicSubscriptions = 0;
    for (const subs of this.topicSubscriptions.values()) {
      activeTopicSubscriptions += subs.size;
    }

    return {
      ...this.stats,
      activeTopicSubscriptions,
      registeredAgents: this.agents.size,
      pendingMessages,
    };
  }

  /**
   * Reset all state. Rejects pending requests and clears all data.
   */
  reset(): void {
    // Reject pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("IPC system reset"));
    }
    this.pendingRequests.clear();

    this.agents.clear();
    this.inboxes.clear();
    this.messageHandlers.clear();
    this.requestHandlers.clear();
    this.topicSubscriptions.clear();
    this.stats = {
      messagesSent: 0,
      messagesBroadcast: 0,
      requestsSent: 0,
      topicMessagesPublished: 0,
    };
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /**
   * Assert an agent is registered.
   * @throws {Error} If not registered
   */
  private assertRegistered(agentId: string, role: string): void {
    if (!this.agents.has(agentId)) {
      throw new Error(`${role} agent ${agentId} is not registered`);
    }
  }

  /**
   * Add a message to an agent's inbox queue.
   * Drops oldest messages if inbox is full.
   */
  private enqueueInbox(agentId: string, message: AgentMessage): void {
    const inbox = this.inboxes.get(agentId);
    if (!inbox) return;

    if (inbox.length >= this.maxInboxSize) {
      inbox.shift(); // Drop oldest
    }
    inbox.push(message);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an AgentIPC instance.
 *
 * @example
 * ```typescript
 * const ipc = createAgentIPC({ maxInboxSize: 500 });
 * ipc.register("agent-1");
 * ipc.register("agent-2");
 * ```
 */
export function createAgentIPC(config?: IPCConfig): AgentIPC {
  return new AgentIPC(config);
}
