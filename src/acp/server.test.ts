import { describe, expect, it } from "vitest";
import { parseAcpArgs } from "./server.js";

describe("parseAcpArgs", () => {
  it("parses gateway connection options", () => {
    const opts = parseAcpArgs([
      "--url",
      "wss://example.test/ws",
      "--gateway-token",
      "token-123",
      "--gateway-password",
      "pw-456",
      "--session",
      "agent:main:main",
      "--session-label",
      "main",
    ]);

    expect(opts.gatewayUrl).toBe("wss://example.test/ws");
    expect(opts.gatewayToken).toBe("token-123");
    expect(opts.gatewayPassword).toBe("pw-456");
    expect(opts.defaultSessionKey).toBe("agent:main:main");
    expect(opts.defaultSessionLabel).toBe("main");
  });

  it("parses boolean and toggle flags", () => {
    const opts = parseAcpArgs([
      "--require-existing",
      "--reset-session",
      "--no-prefix-cwd",
      "--verbose",
    ]);

    expect(opts.requireExistingSession).toBe(true);
    expect(opts.resetSession).toBe(true);
    expect(opts.prefixCwd).toBe(false);
    expect(opts.verbose).toBe(true);
  });
});
