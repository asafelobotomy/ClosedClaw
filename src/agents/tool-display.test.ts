import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { formatToolDetail, resolveToolDisplay } from "./tool-display.js";

describe("tool display details", () => {
  it("skips zero/false values for optional detail fields", () => {
    const detail = formatToolDetail(
      resolveToolDisplay({
        name: "sessions_spawn",
        args: {
          task: "double-message-bug-gpt",
          label: 0,
          runTimeoutSeconds: 0,
          timeoutSeconds: 0,
        },
      }),
    );

    expect(detail).toBe("double-message-bug-gpt");
  });

  it("includes only truthy boolean details", () => {
    const detail = formatToolDetail(
      resolveToolDisplay({
        name: "message",
        args: {
          action: "react",
          provider: "discord",
          to: "chan-1",
          remove: false,
        },
      }),
    );

    expect(detail).toContain("provider discord");
    expect(detail).toContain("to chan-1");
    expect(detail).not.toContain("remove");
  });

  it("keeps positive numbers and true booleans", () => {
    const detail = formatToolDetail(
      resolveToolDisplay({
        name: "sessions_history",
        args: {
          sessionKey: "agent:main:main",
          limit: 20,
          includeTools: true,
        },
      }),
    );

    expect(detail).toContain("session agent:main:main");
    expect(detail).toContain("limit 20");
    expect(detail).toContain("tools true");
  });

  it("uses fallback detail keys and deduplicates entries", () => {
    const detail = formatToolDetail(
      resolveToolDisplay({
        name: "custom_tool",
        args: {
          targetUrl: "https://example.test/page",
          targetId: "node-1",
          messageId: "m-1",
          // duplicate targetUrl should not produce duplicate segments
          target: "ignored",
        },
      }),
    );

    expect(detail).toContain("url https://example.test/page");
    expect(detail).toContain("target node-1");
    expect(detail).toContain("message m-1");
    // ensure only one url segment is present
    expect((detail ?? "").match(/url https:\/\/example\.test\/page/g)?.length).toBe(1);
  });

  it("formats read/edit paths with ranges and home shortening", () => {
    const homePath = `${homedir()}/projects/ClosedClaw/README.md`;

    const readDetail = formatToolDetail(
      resolveToolDisplay({
        name: "read",
        args: { path: homePath, offset: 10, limit: 5 },
      }),
    );
    const writeDetail = formatToolDetail(
      resolveToolDisplay({
        name: "write",
        args: { path: homePath },
      }),
    );

    expect(readDetail).toContain("~");
    expect(readDetail).toContain(":10-15");
    expect(writeDetail).toContain("~");
  });
});
