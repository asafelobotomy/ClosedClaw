import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosedClawConfig } from "../config/config.js";

const { note, listChannelPlugins } = vi.hoisted(() => ({
  note: vi.fn(),
  listChannelPlugins: vi.fn(() => []),
}));

vi.mock("../terminal/note.js", () => ({
  note,
}));

vi.mock("../channels/plugins/index.js", () => ({
  listChannelPlugins,
}));

import { noteSecurityWarnings } from "./doctor-security.js";

describe("noteSecurityWarnings gateway exposure", () => {
  let prevToken: string | undefined;
  let prevPassword: string | undefined;

  beforeEach(() => {
    note.mockClear();
    prevToken = process.env.ClosedClaw_GATEWAY_TOKEN;
    prevPassword = process.env.ClosedClaw_GATEWAY_PASSWORD;
    delete process.env.ClosedClaw_GATEWAY_TOKEN;
    delete process.env.ClosedClaw_GATEWAY_PASSWORD;
  });

  afterEach(() => {
    if (prevToken === undefined) {
      delete process.env.ClosedClaw_GATEWAY_TOKEN;
    } else {
      process.env.ClosedClaw_GATEWAY_TOKEN = prevToken;
    }
    if (prevPassword === undefined) {
      delete process.env.ClosedClaw_GATEWAY_PASSWORD;
    } else {
      process.env.ClosedClaw_GATEWAY_PASSWORD = prevPassword;
    }
  });

  const lastMessage = () => {
    // The function emits two note() calls: "Security" then "Encryption".
    // Look through all calls for the relevant one.
    return note.mock.calls
      .map((c: unknown[]) =>
        typeof c[0] === "string" || typeof c[0] === "number" || typeof c[0] === "boolean"
          ? String(c[0])
          : "",
      )
      .join("\n");
  };

  it("warns when exposed without auth", async () => {
    const cfg = { gateway: { bind: "lan" } } as ClosedClawConfig;
    await noteSecurityWarnings(cfg);
    const message = lastMessage();
    expect(message).toContain("CRITICAL");
    expect(message).toContain("without authentication");
  });

  it("uses env token to avoid critical warning", async () => {
    process.env.ClosedClaw_GATEWAY_TOKEN = "token-123";
    const cfg = { gateway: { bind: "lan" } } as ClosedClawConfig;
    await noteSecurityWarnings(cfg);
    const message = lastMessage();
    expect(message).toContain("WARNING");
    expect(message).not.toContain("CRITICAL");
  });

  it("treats whitespace token as missing", async () => {
    const cfg = {
      gateway: { bind: "lan", auth: { mode: "token", token: "   " } },
    } as ClosedClawConfig;
    await noteSecurityWarnings(cfg);
    const message = lastMessage();
    expect(message).toContain("CRITICAL");
  });

  it("skips warning for loopback bind", async () => {
    const cfg = { gateway: { bind: "loopback" } } as ClosedClawConfig;
    await noteSecurityWarnings(cfg);
    const message = lastMessage();
    expect(message).toContain("No channel security warnings detected");
    expect(message).not.toContain("Gateway bound");
  });

  it("prints info grouping when only info-level findings exist", async () => {
    listChannelPlugins.mockReturnValue([
      {
        id: "test",
        meta: { label: "Test" },
        config: {
          listAccountIds: () => ["default"],
          resolveAccount: () => ({}),
          isConfigured: () => true,
        },
        security: {
          resolveDmPolicy: () => ({
            policy: "disabled",
            allowFrom: [],
            allowFromPath: "channels.test.",
            policyPath: "channels.test.dmPolicy",
            approveHint: "",
          }),
        },
      },
    ]);

    const cfg = { gateway: { bind: "loopback" } } as ClosedClawConfig;
    await noteSecurityWarnings(cfg);

    const message = lastMessage();
    expect(message).toContain("Info:");
    expect(message).toContain("DMs: disabled");
  });
});
