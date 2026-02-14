import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosedClawConfig } from "../config/config.js";

const { note, healthCommand, callGateway, formatHealthCheckFailure, buildGatewayConnectionDetails } = vi.hoisted(() => {
  return {
    note: vi.fn(),
    healthCommand: vi.fn(),
    callGateway: vi.fn(),
    formatHealthCheckFailure: vi.fn(),
    buildGatewayConnectionDetails: vi.fn(),
  };
});

vi.mock("../terminal/note.js", () => ({ note }));
vi.mock("./health.js", () => ({ healthCommand }));
vi.mock("../gateway/call.js", () => ({
  callGateway,
  buildGatewayConnectionDetails,
}));
vi.mock("./health-format.js", () => ({ formatHealthCheckFailure }));
vi.mock("../config/constants/index.js", () => ({ TIMEOUT_TEST_SUITE_SHORT_MS: 5000, secondsToMs: (s: number) => s * 1000 }));

import { checkGatewayHealth } from "./doctor-gateway-health.js";

describe("doctor gateway health", () => {
  beforeEach(() => {
    note.mockClear();
    healthCommand.mockReset();
    callGateway.mockReset();
    formatHealthCheckFailure.mockReset();
    buildGatewayConnectionDetails.mockReset();
  });

  it("probes gateway status when health command fails for non-closed errors", async () => {
    const runtime = { error: vi.fn() } as unknown as Parameters<typeof checkGatewayHealth>[0]["runtime"];
    const cfg = { gateway: { bind: "loopback" } } as ClosedClawConfig;

    buildGatewayConnectionDetails.mockReturnValue({ message: "connect-info" });
    healthCommand.mockRejectedValue(new Error("boom"));
    formatHealthCheckFailure.mockReturnValue("health failed");
    callGateway.mockResolvedValue({ ok: true });

    await checkGatewayHealth({ runtime, cfg });

    expect(runtime.error).toHaveBeenCalledWith("health failed");
    expect(note).toHaveBeenCalledWith("connect-info", "Gateway connection");
    expect(callGateway).toHaveBeenCalledWith({ method: "gateway.status", params: {}, timeoutMs: 3000 });
  });

  it("logs probe failure when gateway.status errors", async () => {
    const runtime = { error: vi.fn() } as unknown as Parameters<typeof checkGatewayHealth>[0]["runtime"];
    const cfg = { gateway: { bind: "loopback" } } as ClosedClawConfig;

    buildGatewayConnectionDetails.mockReturnValue({ message: "connect-info" });
    healthCommand.mockRejectedValue(new Error("boom"));
    formatHealthCheckFailure.mockReturnValue("health failed");
    callGateway.mockRejectedValue(new Error("probe fail"));

    await checkGatewayHealth({ runtime, cfg });

    const errors = runtime.error.mock.calls.map((c) => c[0]);
    expect(errors).toContain("health failed");
    expect(errors.some((msg: string) => msg.includes("Gateway status probe failed"))).toBe(true);
    expect(note).toHaveBeenCalledWith("connect-info", "Gateway connection");
  });

  it("keeps healthOk true even if channel status probe fails", async () => {
    const runtime = { error: vi.fn() } as unknown as Parameters<typeof checkGatewayHealth>[0]["runtime"];
    const cfg = { gateway: { bind: "loopback" } } as ClosedClawConfig;

    buildGatewayConnectionDetails.mockReturnValue({ message: "connect-info" });
    healthCommand.mockResolvedValue(undefined);
    callGateway.mockRejectedValue(new Error("status fail"));

    const result = await checkGatewayHealth({ runtime, cfg, timeoutMs: 2000 });

    expect(result.healthOk).toBe(true);
    expect(runtime.error).not.toHaveBeenCalled();
    expect(callGateway).toHaveBeenCalledWith({
      method: "channels.status",
      params: { probe: true, timeoutMs: 5000 },
      timeoutMs: 6000,
    });
    expect(note).not.toHaveBeenCalled();
  });
});
