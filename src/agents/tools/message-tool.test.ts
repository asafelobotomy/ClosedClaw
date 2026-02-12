import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../../channels/plugins/types.js";
import type { MessageActionRunResult } from "../../infra/outbound/message-action-runner.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createTestRegistry } from "../../../test/helpers/channel-plugins.js";
import { createMessageTool } from "./message-tool.js";

const mocks = vi.hoisted(() => ({
  runMessageAction: vi.fn(),
}));

vi.mock("../../infra/outbound/message-action-runner.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../infra/outbound/message-action-runner.js")
  >("../../infra/outbound/message-action-runner.js");
  return {
    ...actual,
    runMessageAction: mocks.runMessageAction,
  };
});

describe("message tool agent routing", () => {
  it("derives agentId from the session key", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      agentSessionKey: "agent:alpha:main",
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      message: "hi",
    });

    const call = mocks.runMessageAction.mock.calls[0]?.[0];
    expect(call?.agentId).toBe("alpha");
    expect(call?.sessionKey).toBeUndefined();
  });
});

describe("message tool path passthrough", () => {
  it("does not convert path to media for send", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      to: "telegram:123",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      path: "~/Downloads/voice.ogg",
      message: "",
    });

    const call = mocks.runMessageAction.mock.calls[0]?.[0];
    expect(call?.params?.path).toBe("~/Downloads/voice.ogg");
    expect(call?.params?.media).toBeUndefined();
  });

  it("does not convert filePath to media for send", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      to: "telegram:123",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      filePath: "./tmp/note.m4a",
      message: "",
    });

    const call = mocks.runMessageAction.mock.calls[0]?.[0];
    expect(call?.params?.filePath).toBe("./tmp/note.m4a");
    expect(call?.params?.media).toBeUndefined();
  });
});

describe("message tool sandbox path validation", () => {
  it("rejects filePath that escapes sandbox root", async () => {
    const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "msg-sandbox-"));
    try {
      const tool = createMessageTool({
        config: {} as never,
        sandboxRoot: sandboxDir,
      });

      await expect(
        tool.execute("1", {
          action: "send",
          target: "telegram:123",
          filePath: "/etc/passwd",
          message: "",
        }),
      ).rejects.toThrow(/sandbox/i);
    } finally {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    }
  });

  it("rejects path param with traversal sequence", async () => {
    const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "msg-sandbox-"));
    try {
      const tool = createMessageTool({
        config: {} as never,
        sandboxRoot: sandboxDir,
      });

      await expect(
        tool.execute("1", {
          action: "send",
          target: "telegram:123",
          path: "../../../etc/shadow",
          message: "",
        }),
      ).rejects.toThrow(/sandbox/i);
    } finally {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    }
  });

  it("allows filePath inside sandbox root", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      to: "telegram:123",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "msg-sandbox-"));
    try {
      const tool = createMessageTool({
        config: {} as never,
        sandboxRoot: sandboxDir,
      });

      await tool.execute("1", {
        action: "send",
        target: "telegram:123",
        filePath: "./data/file.txt",
        message: "",
      });

      expect(mocks.runMessageAction).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    }
  });

  it("skips validation when no sandboxRoot is set", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      to: "telegram:123",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      filePath: "/etc/passwd",
      message: "",
    });

    // Without sandboxRoot the validation is skipped — unsandboxed sessions work normally.
    expect(mocks.runMessageAction).toHaveBeenCalledTimes(1);
  });
});
