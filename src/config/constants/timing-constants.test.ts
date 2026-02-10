import { describe, it, expect } from "vitest";
import {
  TIMEOUT_HTTP_DEFAULT_MS,
  TIMEOUT_HANDSHAKE_MS,
  TIMEOUT_TEST_SUITE_SHORT_MS,
  TIMEOUT_TEST_SUITE_DEFAULT_MS,
  TIMEOUT_TEST_SUITE_MEDIUM_MS,
  TIMEOUT_TEST_SUITE_STANDARD_MS,
  TIMEOUT_TEST_SUITE_EXTENDED_MS,
  TIMEOUT_TEST_SUITE_LONG_MS,
  INTERVAL_TICK_MS,
  TTL_EXTERNAL_CLI_SYNC_MS,
  secondsToMs,
  minutesToMs,
  hoursToMs,
  msToSeconds,
  msToMinutes,
  msToHours,
  formatDuration,
  TIMEOUT_WORKFLOW_STEP_DEFAULT_MS,
  TIMEOUT_WORKFLOW_DEFAULT_MS,
  DELAY_SESSION_STORE_SAVE_MS,
  TTL_SESSION_STALE_MS,
  INTERVAL_WS_PING_MS,
} from "./timing-constants.js";

describe("timing-constants", () => {
  describe("constant definitions", () => {
    it("should define HTTP timeouts", () => {
      expect(TIMEOUT_HTTP_DEFAULT_MS).toBe(30_000);
    });

    it("should define gateway timeouts", () => {
      expect(TIMEOUT_HANDSHAKE_MS).toBe(10_000);
    });

    it("should define intervals", () => {
      expect(INTERVAL_TICK_MS).toBe(30_000);
      expect(INTERVAL_WS_PING_MS).toBe(30_000);
    });

    it("should define TTLs", () => {
      expect(TTL_EXTERNAL_CLI_SYNC_MS).toBe(15 * 60 * 1000);
      expect(TTL_SESSION_STALE_MS).toBe(15 * 60_000);
    });
    it("should define test suite timeouts for Vitest", () => {
      expect(TIMEOUT_TEST_SUITE_SHORT_MS).toBe(5_000);
      expect(TIMEOUT_TEST_SUITE_DEFAULT_MS).toBe(10_000);
      expect(TIMEOUT_TEST_SUITE_MEDIUM_MS).toBe(15_000);
      expect(TIMEOUT_TEST_SUITE_STANDARD_MS).toBe(20_000);
      expect(TIMEOUT_TEST_SUITE_EXTENDED_MS).toBe(45_000);
      expect(TIMEOUT_TEST_SUITE_LONG_MS).toBe(60_000);
    });
    it("should define workflow timeouts", () => {
      expect(TIMEOUT_WORKFLOW_STEP_DEFAULT_MS).toBe(300_000); // 5 minutes
      expect(TIMEOUT_WORKFLOW_DEFAULT_MS).toBe(1_800_000); // 30 minutes
    });

    it("should define delays", () => {
      expect(DELAY_SESSION_STORE_SAVE_MS).toBe(0);
    });
  });

  describe("time conversion", () => {
    describe("secondsToMs()", () => {
      it("should convert seconds to milliseconds", () => {
        expect(secondsToMs(1)).toBe(1000);
        expect(secondsToMs(30)).toBe(30_000);
        expect(secondsToMs(0)).toBe(0);
      });
    });

    describe("minutesToMs()", () => {
      it("should convert minutes to milliseconds", () => {
        expect(minutesToMs(1)).toBe(60_000);
        expect(minutesToMs(5)).toBe(300_000);
        expect(minutesToMs(0)).toBe(0);
      });
    });

    describe("hoursToMs()", () => {
      it("should convert hours to milliseconds", () => {
        expect(hoursToMs(1)).toBe(3_600_000);
        expect(hoursToMs(2)).toBe(7_200_000);
        expect(hoursToMs(0)).toBe(0);
      });
    });

    describe("msToSeconds()", () => {
      it("should convert milliseconds to seconds", () => {
        expect(msToSeconds(1000)).toBe(1);
        expect(msToSeconds(30_000)).toBe(30);
        expect(msToSeconds(0)).toBe(0);
      });
    });

    describe("msToMinutes()", () => {
      it("should convert milliseconds to minutes", () => {
        expect(msToMinutes(60_000)).toBe(1);
        expect(msToMinutes(300_000)).toBe(5);
        expect(msToMinutes(0)).toBe(0);
      });
    });

    describe("msToHours()", () => {
      it("should convert milliseconds to hours", () => {
        expect(msToHours(3_600_000)).toBe(1);
        expect(msToHours(7_200_000)).toBe(2);
        expect(msToHours(0)).toBe(0);
      });
    });
  });

  describe("formatDuration()", () => {
    it("should format milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("should format seconds", () => {
      expect(formatDuration(1000)).toBe("1s");
      expect(formatDuration(30_000)).toBe("30s");
      expect(formatDuration(59_000)).toBe("59s");
    });

    it("should format minutes", () => {
      expect(formatDuration(60_000)).toBe("1m");
      expect(formatDuration(300_000)).toBe("5m");
      expect(formatDuration(90_000)).toBe("1.5m");
    });

    it("should format hours", () => {
      expect(formatDuration(3_600_000)).toBe("1h");
      expect(formatDuration(7_200_000)).toBe("2h");
      expect(formatDuration(5_400_000)).toBe("1.5h");
    });

    it("should handle edge cases", () => {
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(1)).toBe("1ms");
    });
  });

  describe("type safety", () => {
    it("should have constant number literal types", () => {
      // TypeScript should enforce these as literal types
      const timeout: 30_000 = TIMEOUT_HTTP_DEFAULT_MS;
      expect(timeout).toBe(30_000);
    });
  });

  describe("consistency checks", () => {
    it("should have consistent timeout hierarchy", () => {
      // Short < Default < Long
      expect(10_000).toBeLessThan(TIMEOUT_HTTP_DEFAULT_MS);
      expect(TIMEOUT_HTTP_DEFAULT_MS).toBeLessThan(60_000);
    });

    it("should have workflow timeouts longer than step timeouts", () => {
      expect(TIMEOUT_WORKFLOW_DEFAULT_MS).toBeGreaterThan(TIMEOUT_WORKFLOW_STEP_DEFAULT_MS);
    });

    it("should have reasonable TTL values", () => {
      // All TTLs should be positive
      expect(TTL_EXTERNAL_CLI_SYNC_MS).toBeGreaterThan(0);
      expect(TTL_SESSION_STALE_MS).toBeGreaterThan(0);
    });
  });
});
