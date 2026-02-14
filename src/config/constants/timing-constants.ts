/**
 * Timing Constants
 *
 * Centralized constants for timeouts, intervals, delays, and TTLs used across ClosedClaw.
 * Use these instead of magic numbers to make timing values discoverable and maintainable.
 *
 * @example
 * ```typescript
 * // Before
 * const timeout = 30_000;
 *
 * // After
 * import { TIMEOUT_HTTP_DEFAULT_MS } from '@/config/constants';
 * const timeout = TIMEOUT_HTTP_DEFAULT_MS;
 * ```
 */

// ============================================================================
// Timeouts
// ============================================================================

// HTTP Timeouts
export const TIMEOUT_HTTP_DEFAULT_MS = 30_000 as const; // 30 seconds
export const TIMEOUT_HTTP_SHORT_MS = 10_000 as const; // 10 seconds
export const TIMEOUT_HTTP_LONG_MS = 60_000 as const; // 60 seconds

// Gateway Timeouts
export const TIMEOUT_HANDSHAKE_MS = 10_000 as const; // 10 seconds
export const TIMEOUT_GATEWAY_CONNECT_MS = 10_000 as const; // 10 seconds
export const TIMEOUT_WS_OPEN_MS = 5_000 as const; // 5 seconds
export const TIMEOUT_WS_FRAME_MS = 5_000 as const; // 5 seconds

// Browser & Automation Timeouts
export const TIMEOUT_BROWSER_AUTOSTART_MS = 12_000 as const; // 12 seconds
export const TIMEOUT_BROWSER_PAGE_MS = 20_000 as const; // 20 seconds (Playwright page ops)
export const TIMEOUT_BROWSER_GOTO_MS = 30_000 as const; // 30 seconds (Playwright page.goto)
export const TIMEOUT_PORT_WAIT_MS = 5_000 as const; // 5 seconds

// Test Timeouts
export const TIMEOUT_TEST_DEFAULT_MS = 2_000 as const; // 2 seconds
export const TIMEOUT_TEST_SHORT_MS = 1_500 as const; // 1.5 seconds
export const TIMEOUT_TEST_LONG_MS = 120_000 as const; // 2 minutes

// Test Suite Timeouts (for Vitest { timeout: ... })
export const TIMEOUT_TEST_SUITE_SHORT_MS = 5_000 as const; // 5 seconds
export const TIMEOUT_TEST_SUITE_DEFAULT_MS = 10_000 as const; // 10 seconds
export const TIMEOUT_TEST_SUITE_MEDIUM_MS = 15_000 as const; // 15 seconds
export const TIMEOUT_TEST_SUITE_STANDARD_MS = 20_000 as const; // 20 seconds
export const TIMEOUT_TEST_SUITE_EXTENDED_MS = 45_000 as const; // 45 seconds
export const TIMEOUT_TEST_SUITE_LONG_MS = 60_000 as const; // 60 seconds

// Workflow Timeouts
export const TIMEOUT_WORKFLOW_STEP_DEFAULT_MS = 300_000 as const; // 5 minutes
export const TIMEOUT_WORKFLOW_DEFAULT_MS = 1_800_000 as const; // 30 minutes

// General Timeouts
export const TIMEOUT_IMESSAGE_PROBE_MS = 2_000 as const; // 2 seconds
export const TIMEOUT_WEB_LOGIN_QR_MS = 120_000 as const; // 2 minutes

// ============================================================================
// Intervals & Polling
// ============================================================================

// Gateway Intervals
export const INTERVAL_TICK_MS = 30_000 as const; // 30 seconds
export const INTERVAL_HEALTH_REFRESH_MS = 60_000 as const; // 60 seconds
export const INTERVAL_SKILLS_REFRESH_MS = 30_000 as const; // 30 seconds

// WebSocket Intervals
export const INTERVAL_WS_RECONNECT_MS = 1_000 as const; // 1 second
export const INTERVAL_WS_PING_MS = 30_000 as const; // 30 seconds
export const INTERVAL_WS_PONG_TIMEOUT_MS = 5_000 as const; // 5 seconds

// Auth & Monitoring Intervals
export const INTERVAL_AUTH_CHECK_MIN_MS = 3_600_000 as const; // 1 hour

// ============================================================================
// Delays
// ============================================================================

export const DELAY_SESSION_STORE_SAVE_MS = 0 as const; // Immediate (overridable in tests)
export const DELAY_WS_CLOSE_MS = 500 as const; // 500ms
export const DELAY_MEDIA_GROUP_MS = 500 as const; // 500ms (Telegram media group batching)
export const DELAY_ONBOARD_WAIT_S = 0.4 as const; // 0.4 seconds
export const DELAY_SSH_CONNECT_TIMEOUT_S = 5 as const; // 5 seconds
export const DELAY_ONBOARD_TIMEOUT_S = 45 as const; // 45 seconds

// Backoff/Reconnect Delays
export const DELAY_RECONNECT_INITIAL_MS = 2_000 as const; // 2 seconds
export const DELAY_RECONNECT_MAX_MS = 30_000 as const; // 30 seconds
export const DELAY_RETRY_BASE_MS = 1_000 as const; // 1 second
export const DELAY_RETRY_MAX_MS = 60_000 as const; // 60 seconds

// ============================================================================
// TTLs (Time To Live)
// ============================================================================

// CLI & External Service TTLs
export const TTL_EXTERNAL_CLI_SYNC_MS = 15 * 60 * 1000; // 15 minutes
export const TTL_EXTERNAL_CLI_NEAR_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Auth & Session TTLs
export const TTL_AUTH_STORE_STALE_MS = 30_000 as const; // 30 seconds
export const TTL_ACTIVE_LOGIN_MS = 3 * 60_000; // 3 minutes

// Message & Group TTLs
export const TTL_RECENT_WEB_MESSAGE_MS = 20 * 60_000; // 20 minutes
export const TTL_GROUP_META_MS = 5 * 60 * 1000; // 5 minutes
export const TTL_DEDUPE_MS = 5 * 60_000; // 5 minutes

// Auto-Reply TTLs
export const TTL_MESSAGE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Session Staleness
export const TTL_SESSION_STALE_MS = 15 * 60_000; // 15 minutes

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert seconds to milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/**
 * Convert minutes to milliseconds
 */
export function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

/**
 * Convert hours to milliseconds
 */
export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

/**
 * Convert milliseconds to seconds
 */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}

/**
 * Convert milliseconds to minutes
 */
export function msToMinutes(ms: number): number {
  return ms / (60 * 1000);
}

/**
 * Convert milliseconds to hours
 */
export function msToHours(ms: number): number {
  return ms / (60 * 60 * 1000);
}

/**
 * Format milliseconds to human-readable string
 *
 * @example
 * ```typescript
 * formatDuration(30_000) // "30s"
 * formatDuration(60_000) // "1m"
 * formatDuration(3_600_000) // "1h"
 * formatDuration(90_000) // "1.5m"
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < 3_600_000) {
    const minutes = ms / 60_000;
    return minutes % 1 === 0 ? `${minutes}m` : `${minutes.toFixed(1)}m`;
  }
  const hours = ms / 3_600_000;
  return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
}
