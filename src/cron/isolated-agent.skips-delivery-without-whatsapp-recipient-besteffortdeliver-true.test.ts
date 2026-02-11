import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDeps } from "../cli/deps.js";
import type { ClosedClawConfig } from "../config/config.js";
import type { CronJob } from "./types.js";
import { discordPlugin } from "../../extensions/discord/src/channel.js";
import { setDiscordRuntime } from "../../extensions/discord/src/runtime.js";
import { telegramPlugin } from "../../extensions/telegram/src/channel.js";
import { setTelegramRuntime } from "../../extensions/telegram/src/runtime.js";
import { whatsappPlugin } from "../../extensions/whatsapp/src/channel.js";
import { setWhatsAppRuntime } from "../../extensions/whatsapp/src/runtime.js";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createPluginRuntime } from "../plugins/runtime/index.js";
import { createTestRegistry } from "../../test/helpers/channel-plugins.js";

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn(),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
}));
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));
vi.mock("../infra/outbound/deliver.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/outbound/deliver.js")>();
  return {
    ...actual,
    deliverOutboundPayloads: vi.fn().mockResolvedValue([{ messageId: "mock-1" }]),
  };
});

import { loadModelCatalog } from "../agents/model-catalog.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { deliverOutboundPayloads } from "../infra/outbound/deliver.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "ClosedClaw-cron-" });
}

async function writeSessionStore(home: string) {
  const dir = path.join(home, ".ClosedClaw", "sessions");
  await fs.mkdir(dir, { recursive: true });
  const storePath = path.join(dir, "sessions.json");
  await fs.writeFile(
    storePath,
    JSON.stringify(
      {
        "agent:main:main": {
          sessionId: "main-session",
          updatedAt: Date.now(),
          lastProvider: "webchat",
          lastTo: "",
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  return storePath;
}

function makeCfg(
  home: string,
  storePath: string,
  overrides: Partial<ClosedClawConfig> = {},
): ClosedClawConfig {
  const base: ClosedClawConfig = {
    agents: {
      defaults: {
        model: "anthropic/claude-opus-4-5",
        workspace: path.join(home, "ClosedClaw"),
      },
    },
    session: { store: storePath, mainKey: "main" },
  } as ClosedClawConfig;
  return { ...base, ...overrides };
}

function makeJob(payload: CronJob["payload"]): CronJob {
  const now = Date.now();
  return {
    id: "job-1",
    enabled: true,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload,
    state: {},
    isolation: { postToMainPrefix: "Cron" },
  };
}

describe("runCronIsolatedAgentTurn", () => {
  beforeEach(() => {
    vi.mocked(runEmbeddedPiAgent).mockReset();
    vi.mocked(loadModelCatalog).mockResolvedValue([]);
    vi.mocked(deliverOutboundPayloads).mockReset().mockResolvedValue([{ messageId: "mock-1" }]);
    const runtime = createPluginRuntime();
    setDiscordRuntime(runtime);
    setTelegramRuntime(runtime);
    setWhatsAppRuntime(runtime);
    setActivePluginRegistry(
      createTestRegistry([
        { pluginId: "whatsapp", plugin: whatsappPlugin, source: "test" },
        { pluginId: "telegram", plugin: telegramPlugin, source: "test" },
        { pluginId: "discord", plugin: discordPlugin, source: "test" },
      ]),
    );
  });

  it("skips delivery without a WhatsApp recipient when bestEffortDeliver=true", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "whatsapp",
          bestEffortDeliver: true,
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("skipped");
      expect(String(res.summary ?? "")).toMatch(/delivery skipped/i);
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });
  });

  it("delivers telegram via channel send", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello from cron" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = "";
      try {
        const res = await runCronIsolatedAgentTurn({
          cfg: makeCfg(home, storePath, {
            channels: { telegram: { botToken: "t-1" } },
          }),
          deps,
          job: makeJob({
            kind: "agentTurn",
            message: "do it",
            deliver: true,
            channel: "telegram",
            to: "123",
          }),
          message: "do it",
          sessionKey: "cron:job-1",
          lane: "cron",
        });

        expect(res.status).toBe("ok");
        expect(deliverOutboundPayloads).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: "telegram",
            to: "123",
            payloads: [{ text: "hello from cron" }],
          }),
        );
      } finally {
        if (prevTelegramToken === undefined) {
          delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
          process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
        }
      }
    });
  });

  it("auto-delivers when explicit target is set without deliver flag", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello from cron" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = "";
      try {
        const res = await runCronIsolatedAgentTurn({
          cfg: makeCfg(home, storePath, {
            channels: { telegram: { botToken: "t-1" } },
          }),
          deps,
          job: makeJob({
            kind: "agentTurn",
            message: "do it",
            channel: "telegram",
            to: "123",
          }),
          message: "do it",
          sessionKey: "cron:job-1",
          lane: "cron",
        });

        expect(res.status).toBe("ok");
        expect(deliverOutboundPayloads).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: "telegram",
            to: "123",
            payloads: [{ text: "hello from cron" }],
          }),
        );
      } finally {
        if (prevTelegramToken === undefined) {
          delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
          process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
        }
      }
    });
  });

  it("skips auto-delivery when messaging tool already sent to the target", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "sent" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
        didSendViaMessagingTool: true,
        messagingToolSentTargets: [{ tool: "message", provider: "telegram", to: "123" }],
      });

      const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = "";
      try {
        const res = await runCronIsolatedAgentTurn({
          cfg: makeCfg(home, storePath, {
            channels: { telegram: { botToken: "t-1" } },
          }),
          deps,
          job: makeJob({
            kind: "agentTurn",
            message: "do it",
            channel: "telegram",
            to: "123",
          }),
          message: "do it",
          sessionKey: "cron:job-1",
          lane: "cron",
        });

        expect(res.status).toBe("ok");
        expect(deliverOutboundPayloads).not.toHaveBeenCalled();
      } finally {
        if (prevTelegramToken === undefined) {
          delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
          process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
        }
      }
    });
  });

  it("delivers telegram topic targets via channel send", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello from cron" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "telegram",
          to: "telegram:group:-1001234567890:topic:321",
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(deliverOutboundPayloads).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "telegram",
          to: "telegram:group:-1001234567890:topic:321",
          payloads: [{ text: "hello from cron" }],
        }),
      );
    });
  });

  it("delivers telegram shorthand topic suffixes via channel send", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello from cron" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "telegram",
          to: "-1001234567890:321",
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(deliverOutboundPayloads).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "telegram",
          to: "-1001234567890:321",
          payloads: [{ text: "hello from cron" }],
        }),
      );
    });
  });

  it("delivers via discord when configured", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello from cron" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "discord",
          to: "channel:1122",
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(deliverOutboundPayloads).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "discord",
          to: "channel:1122",
          payloads: [{ text: "hello from cron" }],
        }),
      );
    });
  });

  it("skips delivery when response is exactly HEARTBEAT_OK", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "HEARTBEAT_OK" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "telegram",
          to: "123",
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      // Job still succeeds, but no delivery happens.
      expect(res.status).toBe("ok");
      expect(res.summary).toBe("HEARTBEAT_OK");
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });
  });

  it("skips delivery when response has HEARTBEAT_OK with short padding", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      // Short junk around HEARTBEAT_OK (<=30 chars) should still skip delivery.
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "HEARTBEAT_OK 🦞" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath, {
          channels: { whatsapp: { allowFrom: ["+1234"] } },
        }),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "whatsapp",
          to: "+1234",
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });
  });

  it("delivers when response has HEARTBEAT_OK but also substantial content", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = {} as CliDeps;
      // Long content after HEARTBEAT_OK should still be delivered.
      const longContent = `Important alert: ${"a".repeat(500)}`;
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: `HEARTBEAT_OK ${longContent}` }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath),
        deps,
        job: makeJob({
          kind: "agentTurn",
          message: "do it",
          deliver: true,
          channel: "telegram",
          to: "123",
        }),
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(deliverOutboundPayloads).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "telegram",
          to: "123",
        }),
      );
    });
  });
});
