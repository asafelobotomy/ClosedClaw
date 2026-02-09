/**
 * Tests for Inter-Agent Communication (IPC)
 *
 * Covers: direct messaging, broadcast, request-reply, pub/sub, inbox,
 * stats, registration, error handling, timeouts, edge cases.
 *
 * @module agents/squad/ipc.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentIPC,
  createAgentIPC,
  type AgentMessage,
  type MessageHandler,
} from "./ipc.js";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentIPC", () => {
  let ipc: AgentIPC;

  beforeEach(() => {
    ipc = new AgentIPC();
  });

  afterEach(() => {
    ipc.reset();
  });

  // ─── Registration ─────────────────────────────────────────────────────

  describe("registration", () => {
    it("should register an agent", () => {
      ipc.register("a1");
      expect(ipc.isRegistered("a1")).toBe(true);
    });

    it("should throw on duplicate registration", () => {
      ipc.register("a1");
      expect(() => ipc.register("a1")).toThrow(/already registered/);
    });

    it("should unregister an agent", () => {
      ipc.register("a1");
      ipc.unregister("a1");
      expect(ipc.isRegistered("a1")).toBe(false);
    });

    it("should clean up subscriptions on unregister", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.subscribe("a1", "topic-x", vi.fn());
      expect(ipc.getTopicSubscriberCount("topic-x")).toBe(1);

      ipc.unregister("a1");
      expect(ipc.getTopicSubscriberCount("topic-x")).toBe(0);
    });
  });

  // ─── Direct Messaging ──────────────────────────────────────────────────

  describe("send (direct messaging)", () => {
    it("should send a message between agents", () => {
      ipc.register("a1");
      ipc.register("a2");

      const msg = ipc.send("a1", "a2", {
        type: "task",
        payload: { action: "research" },
      });

      expect(msg.id).toBeDefined();
      expect(msg.from).toBe("a1");
      expect(msg.to).toBe("a2");
      expect(msg.type).toBe("task");
      expect(msg.payload).toEqual({ action: "research" });
      expect(msg.timestamp).toBeDefined();
    });

    it("should deliver to message handler", () => {
      ipc.register("a1");
      ipc.register("a2");

      const received: AgentMessage[] = [];
      ipc.onMessage("a2", (msg) => received.push(msg));

      ipc.send("a1", "a2", { type: "notification", payload: "hello" });

      expect(received).toHaveLength(1);
      expect(received[0].payload).toBe("hello");
    });

    it("should queue in inbox when no handler", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.send("a1", "a2", { type: "notification", payload: "queued" });

      const inbox = ipc.getInbox("a2");
      expect(inbox).toHaveLength(1);
      expect(inbox[0].payload).toBe("queued");
    });

    it("should drain inbox when handler registered", () => {
      ipc.register("a1");
      ipc.register("a2");

      // Queue messages before handler
      ipc.send("a1", "a2", { type: "notification", payload: "msg1" });
      ipc.send("a1", "a2", { type: "notification", payload: "msg2" });

      const received: AgentMessage[] = [];
      ipc.onMessage("a2", (msg) => received.push(msg));

      // Inbox should have been drained through handler
      expect(received).toHaveLength(2);
      expect(ipc.getInbox("a2")).toHaveLength(0);
    });

    it("should throw if sender not registered", () => {
      ipc.register("a2");
      expect(() =>
        ipc.send("unknown", "a2", { type: "task", payload: null }),
      ).toThrow(/not registered/);
    });

    it("should throw if recipient not registered", () => {
      ipc.register("a1");
      expect(() =>
        ipc.send("a1", "unknown", { type: "task", payload: null }),
      ).toThrow(/not registered/);
    });

    it("should drop oldest messages when inbox is full", () => {
      const smallIpc = new AgentIPC({ maxInboxSize: 2 });
      smallIpc.register("a1");
      smallIpc.register("a2");

      smallIpc.send("a1", "a2", { type: "notification", payload: "first" });
      smallIpc.send("a1", "a2", { type: "notification", payload: "second" });
      smallIpc.send("a1", "a2", { type: "notification", payload: "third" });

      const inbox = smallIpc.getInbox("a2");
      expect(inbox).toHaveLength(2);
      expect(inbox[0].payload).toBe("second"); // first was dropped
      expect(inbox[1].payload).toBe("third");
    });

    it("should not break if message handler throws", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.onMessage("a2", () => {
        throw new Error("Handler boom");
      });

      // Should not throw
      expect(() =>
        ipc.send("a1", "a2", { type: "notification", payload: "test" }),
      ).not.toThrow();
    });

    it("should include replyTo when provided", () => {
      ipc.register("a1");
      ipc.register("a2");

      const received: AgentMessage[] = [];
      ipc.onMessage("a2", (msg) => received.push(msg));

      ipc.send("a1", "a2", {
        type: "result",
        payload: "answer",
        replyTo: "orig-123",
      });

      expect(received[0].replyTo).toBe("orig-123");
    });

    it("should support unsubscribing from messages", () => {
      ipc.register("a1");
      ipc.register("a2");

      const received: AgentMessage[] = [];
      const sub = ipc.onMessage("a2", (msg) => received.push(msg));

      ipc.send("a1", "a2", { type: "notification", payload: "before" });
      expect(received).toHaveLength(1);

      sub.unsubscribe();

      ipc.send("a1", "a2", { type: "notification", payload: "after" });
      // Second message goes to inbox, not handler
      expect(received).toHaveLength(1);
    });
  });

  // ─── Broadcast ──────────────────────────────────────────────────────────

  describe("broadcast", () => {
    it("should send to all agents except sender", () => {
      ipc.register("a1");
      ipc.register("a2");
      ipc.register("a3");

      const messages = ipc.broadcast("a1", {
        type: "notification",
        payload: "everyone",
      });

      expect(messages).toHaveLength(2);
      expect(messages.every((m) => m.from === "a1")).toBe(true);
    });

    it("should deliver to handlers", () => {
      ipc.register("a1");
      ipc.register("a2");

      const received: AgentMessage[] = [];
      ipc.onMessage("a2", (msg) => received.push(msg));

      ipc.broadcast("a1", { type: "notification", payload: "broadcast!" });

      expect(received).toHaveLength(1);
      expect(received[0].payload).toBe("broadcast!");
    });

    it("should not send to self", () => {
      ipc.register("a1");
      ipc.register("a2");

      const selfReceived: AgentMessage[] = [];
      ipc.onMessage("a1", (msg) => selfReceived.push(msg));

      ipc.broadcast("a1", { type: "notification", payload: "test" });

      expect(selfReceived).toHaveLength(0);
    });

    it("should throw if broadcaster not registered", () => {
      expect(() =>
        ipc.broadcast("unknown", { type: "notification", payload: null }),
      ).toThrow(/not registered/);
    });
  });

  // ─── Request-Reply ──────────────────────────────────────────────────────

  describe("request-reply", () => {
    it("should execute request and return response", async () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.onRequest("a2", async (msg) => {
        return { answer: (msg.payload as any).x * 2 };
      });

      const result = await ipc.request("a1", "a2", { x: 21 });
      expect(result).toEqual({ answer: 42 });
    });

    it("should throw if target has no request handler", async () => {
      ipc.register("a1");
      ipc.register("a2");

      await expect(ipc.request("a1", "a2", {})).rejects.toThrow(
        /no request handler/,
      );
    });

    it("should throw on duplicate request handler", () => {
      ipc.register("a1");

      ipc.onRequest("a1", async () => "first");
      expect(() => ipc.onRequest("a1", async () => "second")).toThrow(
        /already has a request handler/,
      );
    });

    it("should allow unsubscribing request handler", () => {
      ipc.register("a1");

      const sub = ipc.onRequest("a1", async () => "response");
      sub.unsubscribe();

      // Can now register a new handler
      ipc.onRequest("a1", async () => "new response");
    });

    it("should propagate handler errors", async () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.onRequest("a2", async () => {
        throw new Error("Handler failed");
      });

      await expect(ipc.request("a1", "a2", {})).rejects.toThrow(
        /Handler failed/,
      );
    });

    it("should timeout if handler takes too long", async () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.onRequest("a2", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return "too late";
      });

      await expect(
        ipc.request("a1", "a2", {}, 50), // 50ms timeout
      ).rejects.toThrow(/timed out/);
    });
  });

  // ─── Publish-Subscribe ──────────────────────────────────────────────────

  describe("publish-subscribe", () => {
    it("should deliver topic messages to subscribers", () => {
      ipc.register("a1");
      ipc.register("a2");
      ipc.register("a3");

      const a2Received: AgentMessage[] = [];
      const a3Received: AgentMessage[] = [];

      ipc.subscribe("a2", "status-updates", (msg) => a2Received.push(msg));
      ipc.subscribe("a3", "status-updates", (msg) => a3Received.push(msg));

      const count = ipc.publish("a1", "status-updates", {
        status: "complete",
      });

      expect(count).toBe(2);
      expect(a2Received).toHaveLength(1);
      expect(a3Received).toHaveLength(1);
      expect(a2Received[0].topic).toBe("status-updates");
    });

    it("should not deliver to publisher (no self-receive)", () => {
      ipc.register("a1");

      const received: AgentMessage[] = [];
      ipc.subscribe("a1", "topic", (msg) => received.push(msg));

      ipc.publish("a1", "topic", "data");

      expect(received).toHaveLength(0);
    });

    it("should return 0 when no subscribers", () => {
      ipc.register("a1");
      const count = ipc.publish("a1", "empty-topic", "data");
      expect(count).toBe(0);
    });

    it("should support unsubscribing from topics", () => {
      ipc.register("a1");
      ipc.register("a2");

      const received: AgentMessage[] = [];
      const sub = ipc.subscribe("a2", "topic", (msg) => received.push(msg));

      ipc.publish("a1", "topic", "first");
      expect(received).toHaveLength(1);

      sub.unsubscribe();

      ipc.publish("a1", "topic", "second");
      expect(received).toHaveLength(1); // No new messages
    });

    it("should list active topics", () => {
      ipc.register("a1");

      ipc.subscribe("a1", "alpha", vi.fn());
      ipc.subscribe("a1", "beta", vi.fn());

      const topics = ipc.listTopics();
      expect(topics).toContain("alpha");
      expect(topics).toContain("beta");
    });

    it("should count subscribers per topic", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.subscribe("a1", "topic", vi.fn());
      ipc.subscribe("a2", "topic", vi.fn());

      expect(ipc.getTopicSubscriberCount("topic")).toBe(2);
      expect(ipc.getTopicSubscriberCount("nonexistent")).toBe(0);
    });

    it("should enforce max topic subscriptions per agent", () => {
      const limitedIpc = new AgentIPC({ maxTopicSubscriptions: 2 });
      limitedIpc.register("a1");

      limitedIpc.subscribe("a1", "topic-1", vi.fn());
      limitedIpc.subscribe("a1", "topic-2", vi.fn());

      expect(() =>
        limitedIpc.subscribe("a1", "topic-3", vi.fn()),
      ).toThrow(/max topic subscriptions/);
    });

    it("should not break if topic handler throws", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.subscribe("a2", "topic", () => {
        throw new Error("Boom");
      });

      expect(() => ipc.publish("a1", "topic", "data")).not.toThrow();
    });

    it("should clean up empty topic registrations on unsubscribe", () => {
      ipc.register("a1");

      const sub = ipc.subscribe("a1", "lonely-topic", vi.fn());
      expect(ipc.listTopics()).toContain("lonely-topic");

      sub.unsubscribe();
      expect(ipc.listTopics()).not.toContain("lonely-topic");
    });
  });

  // ─── Stats ──────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("should track message counts", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.send("a1", "a2", { type: "task", payload: null });
      ipc.send("a1", "a2", { type: "task", payload: null });
      ipc.broadcast("a1", { type: "notification", payload: null });

      const stats = ipc.getStats();
      // 2 direct + 1 from broadcast = 3 messagesSent
      expect(stats.messagesSent).toBe(3);
      expect(stats.messagesBroadcast).toBe(1);
      expect(stats.registeredAgents).toBe(2);
    });

    it("should track pending inbox messages", () => {
      ipc.register("a1");
      ipc.register("a2");

      ipc.send("a1", "a2", { type: "task", payload: null });

      const stats = ipc.getStats();
      expect(stats.pendingMessages).toBe(1);
    });

    it("should track request counts", async () => {
      ipc.register("a1");
      ipc.register("a2");
      ipc.onRequest("a2", async () => "ok");

      await ipc.request("a1", "a2", {});

      const stats = ipc.getStats();
      expect(stats.requestsSent).toBe(1);
    });

    it("should track topic publish counts", () => {
      ipc.register("a1");
      ipc.register("a2");
      ipc.subscribe("a2", "t", vi.fn());

      ipc.publish("a1", "t", null);
      ipc.publish("a1", "t", null);

      expect(ipc.getStats().topicMessagesPublished).toBe(2);
    });
  });

  // ─── Reset ──────────────────────────────────────────────────────────────

  describe("reset", () => {
    it("should clear all state", () => {
      ipc.register("a1");
      ipc.register("a2");
      ipc.subscribe("a1", "topic", vi.fn());

      ipc.reset();

      expect(ipc.isRegistered("a1")).toBe(false);
      expect(ipc.isRegistered("a2")).toBe(false);
      expect(ipc.listTopics()).toHaveLength(0);

      const stats = ipc.getStats();
      expect(stats.messagesSent).toBe(0);
      expect(stats.registeredAgents).toBe(0);
    });
  });
});

// ─── Factory ──────────────────────────────────────────────────────────────────

describe("createAgentIPC", () => {
  it("should create an IPC instance", () => {
    const ipc = createAgentIPC();
    expect(ipc).toBeInstanceOf(AgentIPC);
  });

  it("should accept config", () => {
    const ipc = createAgentIPC({ maxInboxSize: 10 });
    expect(ipc).toBeInstanceOf(AgentIPC);
  });
});
