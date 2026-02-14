import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOutboundAdapter } from "../../channels/plugins/types.js";
import type { ClosedClawConfig } from "../../config/config.js";
import {
  createIMessageTestPlugin,
  createOutboundTestPlugin,
  createTestRegistry,
} from "../../../test/helpers/channel-plugins.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";

/**
 * Lightweight outbound stubs for tests that delegate to per-channel deps
 * functions. The real per-channel adapters were archived when channels moved
 * to the plugin registry pattern, but the extension shims follow the same
 * pattern: adapter.sendText -> deps.send<Channel>(to, text, opts).
 */
const CHANNEL_DEPS_MAP: Record<string, string> = {
  telegram: "sendTelegram",
  signal: "sendSignal",
  whatsapp: "sendWhatsApp",
  imessage: "sendIMessage",
};

const chunkByLength = (text: string, limit: number): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
};

const markdownToTextChunks = (text: string, limit: number): Array<{ text: string }> =>
  chunkByLength(text, limit).map((chunk) => ({ text: chunk }));

const createChannelStubOutbound = (
  channel: string,
  opts?: {
    deliveryMode?: ChannelOutboundAdapter["deliveryMode"];
    chunker?: (text: string, limit: number) => string[];
    chunkerMode?: "text" | "markdown";
    textChunkLimit?: number;
  },
): ChannelOutboundAdapter => ({
  deliveryMode: opts?.deliveryMode ?? "direct",
  chunker: opts?.chunker,
  chunkerMode: opts?.chunkerMode,
  textChunkLimit: opts?.textChunkLimit,
  sendText: async ({
    deps,
    to,
    text,
    accountId,
    gifPlayback,
  }: {
    deps?: Record<string, unknown>;
    to: string;
    text: string;
    accountId?: string | null;
    gifPlayback?: unknown;
  }) => {
    const depsKey = CHANNEL_DEPS_MAP[channel];
    const send = depsKey ? deps?.[depsKey] : undefined;
    if (send) {
      const result = await (
        send as (
          to: string,
          text: string,
          opts: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>
      )(to, text, {
        verbose: false,
        accountId: accountId ?? undefined,
        gifPlayback,
      });
      return { channel, ...result };
    }
    return { channel, messageId: "test", to, text };
  },
  sendMedia: async ({
    deps,
    to,
    text,
    mediaUrl,
    accountId,
    gifPlayback,
  }: {
    deps?: Record<string, unknown>;
    to: string;
    text: string;
    mediaUrl?: string;
    accountId?: string | null;
    gifPlayback?: unknown;
  }) => {
    const depsKey = CHANNEL_DEPS_MAP[channel];
    const send = depsKey ? deps?.[depsKey] : undefined;
    if (send) {
      const result = await (
        send as (
          to: string,
          text: string,
          opts: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>
      )(to, text, {
        verbose: false,
        mediaUrl,
        accountId: accountId ?? undefined,
        gifPlayback,
      });
      return { channel, ...result };
    }
    return { channel, messageId: "test", to, text, mediaUrl };
  },
});

const mocks = vi.hoisted(() => ({
  appendAssistantMessageToSessionTranscript: vi.fn(async () => ({ ok: true, sessionFile: "x" })),
}));

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    appendAssistantMessageToSessionTranscript: mocks.appendAssistantMessageToSessionTranscript,
  };
});

const { deliverOutboundPayloads, normalizeOutboundPayloads } = await import("./deliver.js");

describe("deliverOutboundPayloads", () => {
  beforeEach(() => {
    setActivePluginRegistry(defaultRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });
  it("chunks telegram markdown and passes through accountId", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const cfg: ClosedClawConfig = {
      channels: { telegram: { botToken: "tok-1", textChunkLimit: 2 } },
    };
    const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "";
    try {
      const results = await deliverOutboundPayloads({
        cfg,
        channel: "telegram",
        to: "123",
        payloads: [{ text: "abcd" }],
        deps: { sendTelegram },
      });

      expect(sendTelegram).toHaveBeenCalledTimes(2);
      for (const call of sendTelegram.mock.calls) {
        expect(call[2]).toEqual(expect.objectContaining({ accountId: undefined, verbose: false }));
      }
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ channel: "telegram", chatId: "c1" });
    } finally {
      if (prevTelegramToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
      }
    }
  });

  it("passes explicit accountId to sendTelegram", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const cfg: ClosedClawConfig = {
      channels: { telegram: { botToken: "tok-1", textChunkLimit: 2 } },
    };

    await deliverOutboundPayloads({
      cfg,
      channel: "telegram",
      to: "123",
      accountId: "default",
      payloads: [{ text: "hi" }],
      deps: { sendTelegram },
    });

    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "hi",
      expect.objectContaining({ accountId: "default", verbose: false }),
    );
  });

  it("delivers signal media through adapter", async () => {
    const sendSignal = vi.fn().mockResolvedValue({ messageId: "s1", timestamp: 123 });
    const cfg: ClosedClawConfig = { channels: { signal: { mediaMaxMb: 2 } } };

    const results = await deliverOutboundPayloads({
      cfg,
      channel: "signal",
      to: "+1555",
      payloads: [{ text: "hi", mediaUrl: "https://x.test/a.jpg" }],
      deps: { sendSignal },
    });

    expect(sendSignal).toHaveBeenCalledWith(
      "+1555",
      "hi",
      expect.objectContaining({
        mediaUrl: "https://x.test/a.jpg",
        verbose: false,
      }),
    );
    expect(results[0]).toMatchObject({ channel: "signal", messageId: "s1" });
  });

  it("chunks Signal text using the adapter chunker", async () => {
    const sendSignal = vi.fn().mockResolvedValue({ messageId: "s1", timestamp: 123 });
    const cfg: ClosedClawConfig = {
      channels: { signal: { textChunkLimit: 20 } },
    };
    const text = `Intro\\n\\n\x60\x60\x60\x60md\\n${"y".repeat(60)}\\n\x60\x60\x60\\n\\nOutro`;
    const expectedChunks = markdownToTextChunks(text, 20);

    await deliverOutboundPayloads({
      cfg,
      channel: "signal",
      to: "+1555",
      payloads: [{ text }],
      deps: { sendSignal },
    });

    expect(sendSignal).toHaveBeenCalledTimes(expectedChunks.length);
    expectedChunks.forEach((chunk, index) => {
      expect(sendSignal).toHaveBeenNthCalledWith(
        index + 1,
        "+1555",
        chunk.text,
        expect.objectContaining({
          accountId: undefined,
          verbose: false,
        }),
      );
    });
  });

  it("chunks WhatsApp text and returns all results", async () => {
    const sendWhatsApp = vi
      .fn()
      .mockResolvedValueOnce({ messageId: "w1", toJid: "jid" })
      .mockResolvedValueOnce({ messageId: "w2", toJid: "jid" });
    const cfg: ClosedClawConfig = {
      channels: { whatsapp: { textChunkLimit: 2 } },
    };

    const results = await deliverOutboundPayloads({
      cfg,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "abcd" }],
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.messageId)).toEqual(["w1", "w2"]);
  });

  it("respects newline chunk mode for WhatsApp", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    const cfg: ClosedClawConfig = {
      channels: { whatsapp: { textChunkLimit: 4000, chunkMode: "newline" } },
    };

    await deliverOutboundPayloads({
      cfg,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "Line one\n\nLine two" }],
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      1,
      "+1555",
      "Line one",
      expect.objectContaining({ verbose: false }),
    );
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      2,
      "+1555",
      "Line two",
      expect.objectContaining({ verbose: false }),
    );
  });

  it("preserves fenced blocks for markdown chunkers in newline mode", async () => {
    const chunker = vi.fn((text: string) => (text ? [text] : []));
    const sendText = vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
      channel: "matrix" as const,
      messageId: text,
      roomId: "r1",
    }));
    const sendMedia = vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
      channel: "matrix" as const,
      messageId: text,
      roomId: "r1",
    }));
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: {
              deliveryMode: "direct",
              chunker,
              chunkerMode: "markdown",
              textChunkLimit: 4000,
              sendText,
              sendMedia,
            },
          }),
        },
      ]),
    );

    const cfg: ClosedClawConfig = {
      channels: { matrix: { textChunkLimit: 4000, chunkMode: "newline" } },
    };
    const text = "```js\nconst a = 1;\nconst b = 2;\n```\nAfter";

    await deliverOutboundPayloads({
      cfg,
      channel: "matrix",
      to: "!room",
      payloads: [{ text }],
    });

    expect(chunker).toHaveBeenCalledTimes(1);
    expect(chunker).toHaveBeenNthCalledWith(1, text, 4000);
  });

  it("delivers iMessage text through adapter", async () => {
    const sendText = vi.fn().mockResolvedValue({ channel: "imessage", messageId: "i1" });
    const sendMedia = vi.fn().mockResolvedValue({ channel: "imessage", messageId: "i2" });
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "imessage",
          source: "test",
          plugin: createIMessageTestPlugin({
            outbound: {
              deliveryMode: "direct",
              sendText,
              sendMedia,
            },
          }),
        },
      ]),
    );
    const cfg: ClosedClawConfig = {
      agents: { defaults: { mediaMaxMb: 3 } },
    };

    const results = await deliverOutboundPayloads({
      cfg,
      channel: "imessage",
      to: "chat_id:42",
      payloads: [{ text: "hello" }],
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({ to: "chat_id:42", text: "hello" }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ channel: "imessage", messageId: "i1" });
  });

  it("normalizes payloads and drops empty entries", () => {
    const normalized = normalizeOutboundPayloads([
      { text: "hi" },
      { text: "MEDIA:https://x.test/a.jpg" },
      { text: " ", mediaUrls: [] },
    ]);
    expect(normalized).toEqual([
      { text: "hi", mediaUrls: [] },
      { text: "", mediaUrls: ["https://x.test/a.jpg"] },
    ]);
  });

  it("continues on errors when bestEffort is enabled", async () => {
    const sendWhatsApp = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ messageId: "w2", toJid: "jid" });
    const onError = vi.fn();
    const cfg: ClosedClawConfig = {};

    const results = await deliverOutboundPayloads({
      cfg,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }, { text: "b" }],
      deps: { sendWhatsApp },
      bestEffort: true,
      onError,
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ channel: "whatsapp", messageId: "w2", toJid: "jid" }]);
  });

  it("passes normalized payload to onError", async () => {
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    const cfg: ClosedClawConfig = {};

    await deliverOutboundPayloads({
      cfg,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "hi", mediaUrl: "https://x.test/a.jpg" }],
      deps: { sendWhatsApp },
      bestEffort: true,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ text: "hi", mediaUrls: ["https://x.test/a.jpg"] }),
    );
  });

  it("mirrors delivered output when mirror options are provided", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const cfg: ClosedClawConfig = {
      channels: { telegram: { botToken: "tok-1", textChunkLimit: 2 } },
    };
    mocks.appendAssistantMessageToSessionTranscript.mockClear();

    await deliverOutboundPayloads({
      cfg,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "caption", mediaUrl: "https://example.com/files/report.pdf?sig=1" }],
      deps: { sendTelegram },
      mirror: {
        sessionKey: "agent:main:main",
        text: "caption",
        mediaUrls: ["https://example.com/files/report.pdf?sig=1"],
      },
    });

    expect(mocks.appendAssistantMessageToSessionTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "report.pdf" }),
    );
  });
});

const emptyRegistry = createTestRegistry([]);
const defaultRegistry = createTestRegistry([
  {
    pluginId: "telegram",
    plugin: createOutboundTestPlugin({
      id: "telegram",
      outbound: createChannelStubOutbound("telegram", { chunker: chunkByLength }),
    }),
    source: "test",
  },
  {
    pluginId: "signal",
    plugin: createOutboundTestPlugin({
      id: "signal",
      outbound: createChannelStubOutbound("signal", {
        chunker: (text, limit) => markdownToTextChunks(text, limit).map((c) => c.text),
        chunkerMode: "markdown",
      }),
    }),
    source: "test",
  },
  {
    pluginId: "whatsapp",
    plugin: createOutboundTestPlugin({
      id: "whatsapp",
      outbound: createChannelStubOutbound("whatsapp", {
        deliveryMode: "gateway",
        chunker: chunkByLength,
      }),
    }),
    source: "test",
  },
  {
    pluginId: "imessage",
    plugin: createIMessageTestPlugin(),
    source: "test",
  },
]);
