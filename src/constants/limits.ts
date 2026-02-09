/**
 * Resource limits and timeout constants for ClosedClaw.
 *
 * This module centralizes all limit-related configuration:
 * - Timeouts (network, execution, heartbeat)
 * - Memory limits (media, files, context)
 * - Token/character caps
 * - File size limits
 * - Concurrency limits
 *
 * All limits are designed to prevent abuse/DoS while allowing legitimate use cases.
 */

const MB = 1024 * 1024;

/**
 * Network timeouts (milliseconds).
 */
export const LIMITS_TIMEOUT = {
  /** Link preview fetch timeout */
  LINK_TIMEOUT_MS: 30_000, // 30 seconds

  /** Input file download timeout */
  INPUT_FILE_TIMEOUT_MS: 10_000, // 10 seconds

  /** Gateway handshake timeout */
  HANDSHAKE_TIMEOUT_MS: 10_000, // 10 seconds

  /** Provider usage query timeout */
  PROVIDER_USAGE_TIMEOUT_MS: 5_000, // 5 seconds

  /** Generic network operation timeout */
  DEFAULT_TIMEOUT_MS: 10_000, // 10 seconds
} as const;

/**
 * Media understanding limits.
 * Balances quality with cost/performance.
 */
export const LIMITS_MEDIA = {
  /** Default max description length (characters) */
  MAX_CHARS: 500,

  /** Max chars by capability */
  MAX_CHARS_BY_CAPABILITY: {
    image: 500,
    audio: 2000,
    video: 1000,
  } as const,

  /** Max file size by capability (bytes) */
  MAX_BYTES: {
    image: 10 * MB,
    audio: 25 * MB,
    video: 70 * MB,
  } as const,

  /** Timeout by capability (seconds) */
  TIMEOUT_SECONDS: {
    image: 60,
    audio: 300, // 5 minutes
    video: 600, // 10 minutes
  } as const,

  /** Video max base64 size (transcription services) */
  VIDEO_MAX_BASE64_BYTES: 70 * MB,

  /** Media processing concurrency (parallel operations) */
  CONCURRENCY: 2,
} as const;

/**
 * Input file limits (user-provided files).
 */
export const LIMITS_INPUT = {
  /** Image file max size */
  IMAGE_MAX_BYTES: 10 * MB,

  /** Generic file max size */
  FILE_MAX_BYTES: 5 * MB,

  /** Text file max characters (after extraction) */
  FILE_MAX_CHARS: 200_000,

  /** Max HTTP redirects to follow */
  MAX_REDIRECTS: 3,

  /** PDF max pages to process */
  PDF_MAX_PAGES: 4,

  /** PDF max pixels (OCR limit) */
  PDF_MAX_PIXELS: 4_000_000,

  /** PDF minimum text chars (below this, falls back to OCR) */
  PDF_MIN_TEXT_CHARS: 200,

  /** Accepted image MIME types */
  IMAGE_MIMES: ["image/jpeg", "image/png", "image/gif", "image/webp"] as const,
} as const;

/**
 * Browser automation limits.
 */
export const LIMITS_BROWSER = {
  /** Screenshot max dimension (width or height) */
  SCREENSHOT_MAX_SIDE: 2000,

  /** Screenshot max file size */
  SCREENSHOT_MAX_BYTES: 5 * MB,

  /** AI snapshot max characters (full mode) */
  AI_SNAPSHOT_MAX_CHARS: 80_000,

  /** AI snapshot max characters (efficient mode) */
  AI_SNAPSHOT_EFFICIENT_MAX_CHARS: 10_000,

  /** AI snapshot efficient mode crawl depth */
  AI_SNAPSHOT_EFFICIENT_DEPTH: 6,
} as const;

/**
 * Gateway and channel limits.
 */
export const LIMITS_GATEWAY = {
  /** Default gateway port */
  PORT: 18789,

  /** WebSocket slow operation threshold (milliseconds) */
  WS_SLOW_MS: 50,

  /** Web UI heartbeat interval (seconds) */
  HEARTBEAT_SECONDS: 60,

  /** Web UI reconnect policy */
  RECONNECT: {
    initialDelayMs: 1000,
    maxDelayMs: 30_000,
    backoffMultiplier: 1.5,
    maxAttempts: Number.POSITIVE_INFINITY,
  } as const,

  /** Web auto-reply media size cap */
  WEB_MEDIA_BYTES: 5 * MB,
} as const;

/**
 * Channel-specific limits.
 */
export const LIMITS_CHANNEL = {
  /** Gmail max body size */
  GMAIL_MAX_BYTES: 20_000,

  /** Gmail watch renewal interval (minutes) */
  GMAIL_RENEW_MINUTES: 12 * 60, // 12 hours

  /** Matrix default media max (MB) */
  MATRIX_MEDIA_MAX_MB: 20,

  /** Zalo default media max (MB) */
  ZALO_MEDIA_MAX_MB: 5,

  /** MS Teams default media max (MB) */
  MSTEAMS_MEDIA_MAX_MB: 5,

  /** BlueBubbles attachment max size */
  BLUEBUBBLES_ATTACHMENT_MAX_BYTES: 8 * MB,

  /** BlueBubbles text message limit */
  BLUEBUBBLES_TEXT_LIMIT: 4000,

  /** BlueBubbles inbound debounce (prevent duplicates) */
  BLUEBUBBLES_INBOUND_DEBOUNCE_MS: 500,
} as const;

/**
 * Link understanding limits.
 */
export const LIMITS_LINK = {
  /** Max links to process per message */
  MAX_LINKS: 3,

  /** Link fetch timeout (seconds) */
  TIMEOUT_SECONDS: 30,
} as const;

/**
 * Heartbeat and auto-reply limits.
 */
export const LIMITS_HEARTBEAT = {
  /** Heartbeat interval (cron expression format) */
  EVERY: "30m",

  /** Max characters in heartbeat acknowledgment */
  ACK_MAX_CHARS: 300,
} as const;

/**
 * Session and routing limits.
 */
export const LIMITS_SESSION = {
  /** Chat session active threshold (minutes) */
  CHAT_ACTIVE_MINUTES: 120, // 2 hours
} as const;

/**
 * UI display limits.
 */
export const LIMITS_UI = {
  /** Tool result inline threshold (characters) */
  TOOL_INLINE_THRESHOLD: 80,

  /** Preview max lines */
  PREVIEW_MAX_LINES: 2,

  /** Preview max characters */
  PREVIEW_MAX_CHARS: 100,
} as const;

/**
 * Master limits configuration export.
 * Namespaced for IDE autocomplete and easy refactoring.
 */
export const LIMITS = {
  TIMEOUT: LIMITS_TIMEOUT,
  MEDIA: LIMITS_MEDIA,
  INPUT: LIMITS_INPUT,
  BROWSER: LIMITS_BROWSER,
  GATEWAY: LIMITS_GATEWAY,
  CHANNEL: LIMITS_CHANNEL,
  LINK: LIMITS_LINK,
  HEARTBEAT: LIMITS_HEARTBEAT,
  SESSION: LIMITS_SESSION,
  UI: LIMITS_UI,
} as const;
