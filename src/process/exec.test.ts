import { describe, expect, it } from "vitest";
import { TIMEOUT_TEST_SUITE_SHORT_MS } from "../config/constants/index.js";
import { runCommandWithTimeout } from "./exec.js";

describe("runCommandWithTimeout", () => {
  it("passes env overrides to child", async () => {
    const result = await runCommandWithTimeout(
      [process.execPath, "-e", 'process.stdout.write(process.env.ClosedClaw_TEST_ENV ?? "")'],
      {
        timeoutMs: TIMEOUT_TEST_SUITE_SHORT_MS,
        env: { ClosedClaw_TEST_ENV: "ok" },
      },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("ok");
  });

  it("merges custom env with process.env", async () => {
    const previous = process.env.ClosedClaw_BASE_ENV;
    process.env.ClosedClaw_BASE_ENV = "base";
    try {
      const result = await runCommandWithTimeout(
        [
          process.execPath,
          "-e",
          'process.stdout.write((process.env.ClosedClaw_BASE_ENV ?? "") + "|" + (process.env.ClosedClaw_TEST_ENV ?? ""))',
        ],
        {
          timeoutMs: TIMEOUT_TEST_SUITE_SHORT_MS,
          env: { ClosedClaw_TEST_ENV: "ok" },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toBe("base|ok");
    } finally {
      if (previous === undefined) {
        delete process.env.ClosedClaw_BASE_ENV;
      } else {
        process.env.ClosedClaw_BASE_ENV = previous;
      }
    }
  });
});
