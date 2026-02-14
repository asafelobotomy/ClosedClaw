/**
 * ClosedClaw Constants
 *
 * Centralized export for all constants used across the codebase.
 * Import from here to access environment variables, network config, paths, timing, etc.
 *
 * @example
 * ```typescript
 * import {
 *   ENV_CLOSEDCLAW_GATEWAY_PORT,
 *   buildGatewayHttpUrl,
 *   DEFAULT_GATEWAY_PORT,
 * } from '@/config/constants';
 *
 * const port = process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? DEFAULT_GATEWAY_PORT;
 * const url = buildGatewayHttpUrl(port);
 * ```
 */

// ============================================================================
// Environment Variables
// ============================================================================

export {
  // Core
  ENV_CLOSEDCLAW_ROOT,
  ENV_CLOSEDCLAW_STATE_DIR,
  ENV_CLOSEDCLAW_PROFILE,
  ENV_CLOSEDCLAW_DEBUG,
  ENV_CLOSEDCLAW_LOG_LEVEL,

  // Gateway
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  ENV_CLOSEDCLAW_GATEWAY_TOKEN,
  ENV_CLOSEDCLAW_GATEWAY_PASSWORD,
  ENV_CLOSEDCLAW_GATEWAY_LOCK,
  ENV_CLOSEDCLAW_SKIP_CHANNELS,
  ENV_CLOSEDCLAW_CONTROL_UI_BASE_PATH,

  // Testing
  ENV_VITEST,
  ENV_NODE_ENV,
  ENV_CI,
  ENV_GITHUB_ACTIONS,
  ENV_RUNNER_OS,
  ENV_CLOSEDCLAW_LIVE_TEST,
  ENV_LIVE,
  ENV_CLOSEDCLAW_LIVE_MODELS,
  ENV_CLOSEDCLAW_LIVE_PROVIDERS,
  ENV_CLOSEDCLAW_LIVE_REQUIRE_PROFILE_KEYS,
  ENV_CLOSEDCLAW_LIVE_MODEL_TIMEOUT_MS,
  ENV_CLOSEDCLAW_TEST_SHARDS,
  ENV_CLOSEDCLAW_TEST_WORKERS,
  ENV_CLOSEDCLAW_TEST_HANDSHAKE_TIMEOUT_MS,
  ENV_CLOSEDCLAW_E2E_MODELS,

  // Provider API Keys
  ENV_ANTHROPIC_API_KEY,
  ENV_ANTHROPIC_OAUTH_TOKEN,
  ENV_CLOSEDCLAW_LIVE_ANTHROPIC_KEYS,
  ENV_OPENAI_API_KEY,
  ENV_OPENAI_TTS_BASE_URL,
  ENV_MINIMAX_API_KEY,
  ENV_MINIMAX_BASE_URL,
  ENV_MINIMAX_MODEL,
  ENV_ZAI_API_KEY,
  ENV_Z_AI_API_KEY,
  ENV_CLOSEDCLAW_ZAI_FALLBACK_SESSION_ID,
  ENV_CLAWDBOT_ZAI_FALLBACK_SESSION_ID,
  ENV_BRAVE_API_KEY,
  ENV_FIRECRAWL_API_KEY,
  ENV_FIRECRAWL_BASE_URL,

  // Channels
  ENV_TELEGRAM_BOT_TOKEN,
  ENV_CLOSEDCLAW_TWITCH_ACCESS_TOKEN,
  ENV_CLOSEDCLAW_DEBUG_NEXTCLOUD_TALK_ACCOUNTS,

  // Agent & Skills
  ENV_CLOSEDCLAW_BUNDLED_SKILLS_DIR,
  ENV_CLOSEDCLAW_BUNDLED_PLUGINS_DIR,
  ENV_CLOSEDCLAW_RAW_STREAM,
  ENV_CLOSEDCLAW_RAW_STREAM_PATH,

  // System
  ENV_SHELL,
  ENV_PATH,
  ENV_PATHEXT,
  ENV_NODE_OPTIONS,
  ENV_HOME,
  ENV_USERPROFILE,

  // Build & Deployment
  ENV_VERSIONS_JSON,
  ENV_LATEST_VERSION,

  // Utility Functions
  isCI,
  isTest,
  isLiveTest,
  getRunnerOS,
  isWindows,
  isMacOS,
  isLinux,
  type RunnerOS,
} from "./env-constants.js";

// ============================================================================
// Network Constants
// ============================================================================

export {
  // IP Addresses & Hostnames
  LOCALHOST_IPV4,
  LOCALHOST_IPV6,
  LOCALHOST_HOSTNAME,
  BIND_ALL_INTERFACES,

  // Default Ports
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNAL_PORT,
  DEFAULT_ORACLE_PORT,
  DEFAULT_OLLAMA_PORT,
  DEFAULT_BRAVE_LOCAL_PORT,
  DEFAULT_FIRECRAWL_PORT,
  DEFAULT_IPFS_API_PORT,
  TEST_PORT_GATEWAY,
  TEST_PORT_CUSTOM_GATEWAY,

  // Protocol Schemes
  PROTOCOL_HTTP,
  PROTOCOL_HTTPS,
  PROTOCOL_WS,
  PROTOCOL_WSS,

  // URL Builders
  buildGatewayHttpUrl,
  buildGatewayWsUrl,
  buildSignalHttpUrl,
  buildOllamaHttpUrl,
  buildHttpUrl,
  buildWsUrl,

  // Gateway Endpoints
  GATEWAY_ENDPOINT_RPC,
  GATEWAY_ENDPOINT_WS,
  GATEWAY_ENDPOINT_STATUS,
  buildGatewayRpcUrl,
  buildGatewayWsEndpointUrl,
  buildGatewayStatusUrl,

  // Timeouts & Limits
  HTTP_TIMEOUT_DEFAULT_MS,
  HTTP_TIMEOUT_SHORT_MS,
  HTTP_TIMEOUT_LONG_MS,
  WS_RECONNECT_DELAY_MS,
  WS_PING_INTERVAL_MS,
  WS_PONG_TIMEOUT_MS,

  // External Service URLs
  DEFAULT_FIRECRAWL_BASE_URL,
  DEFAULT_BRAVE_SEARCH_BASE_URL,
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
} from "./network-constants.js";

// ============================================================================
// Timing Constants
// ============================================================================

export {
  // Timeouts
  TIMEOUT_HTTP_DEFAULT_MS,
  TIMEOUT_HTTP_SHORT_MS,
  TIMEOUT_HTTP_LONG_MS,
  TIMEOUT_HANDSHAKE_MS,
  TIMEOUT_GATEWAY_CONNECT_MS,
  TIMEOUT_WS_OPEN_MS,
  TIMEOUT_WS_FRAME_MS,
  TIMEOUT_BROWSER_AUTOSTART_MS,
  TIMEOUT_BROWSER_PAGE_MS,
  TIMEOUT_BROWSER_GOTO_MS,
  TIMEOUT_PORT_WAIT_MS,
  TIMEOUT_TEST_DEFAULT_MS,
  TIMEOUT_TEST_SHORT_MS,
  TIMEOUT_TEST_LONG_MS,
  TIMEOUT_TEST_SUITE_SHORT_MS,
  TIMEOUT_TEST_SUITE_DEFAULT_MS,
  TIMEOUT_TEST_SUITE_MEDIUM_MS,
  TIMEOUT_TEST_SUITE_STANDARD_MS,
  TIMEOUT_TEST_SUITE_EXTENDED_MS,
  TIMEOUT_TEST_SUITE_LONG_MS,
  TIMEOUT_WORKFLOW_STEP_DEFAULT_MS,
  TIMEOUT_WORKFLOW_DEFAULT_MS,
  TIMEOUT_IMESSAGE_PROBE_MS,
  TIMEOUT_WEB_LOGIN_QR_MS,

  // Intervals
  INTERVAL_TICK_MS,
  INTERVAL_HEALTH_REFRESH_MS,
  INTERVAL_SKILLS_REFRESH_MS,
  INTERVAL_WS_RECONNECT_MS,
  INTERVAL_WS_PING_MS,
  INTERVAL_WS_PONG_TIMEOUT_MS,
  INTERVAL_AUTH_CHECK_MIN_MS,

  // Delays
  DELAY_SESSION_STORE_SAVE_MS,
  DELAY_WS_CLOSE_MS,
  DELAY_MEDIA_GROUP_MS,
  DELAY_ONBOARD_WAIT_S,
  DELAY_SSH_CONNECT_TIMEOUT_S,
  DELAY_ONBOARD_TIMEOUT_S,
  DELAY_RECONNECT_INITIAL_MS,
  DELAY_RECONNECT_MAX_MS,
  DELAY_RETRY_BASE_MS,
  DELAY_RETRY_MAX_MS,

  // TTLs
  TTL_EXTERNAL_CLI_SYNC_MS,
  TTL_EXTERNAL_CLI_NEAR_EXPIRY_MS,
  TTL_AUTH_STORE_STALE_MS,
  TTL_ACTIVE_LOGIN_MS,
  TTL_RECENT_WEB_MESSAGE_MS,
  TTL_GROUP_META_MS,
  TTL_DEDUPE_MS,
  TTL_MESSAGE_TIMEOUT_MS,
  TTL_SESSION_STALE_MS,

  // Utility Functions
  secondsToMs,
  minutesToMs,
  hoursToMs,
  msToSeconds,
  msToMinutes,
  msToHours,
  formatDuration,
} from "./timing-constants.js";

// ============================================================================
// Path Constants
// ============================================================================

export {
  // Directory Names
  STATE_DIRNAME,
  LEGACY_STATE_DIRNAMES,
  SUBDIRS,

  // File Names
  CONFIG_FILENAME,
  CONFIG_FILENAME_JSON5,
  LEGACY_CONFIG_FILENAMES,
  GATEWAY_LOCK_FILENAME,

  // Platform Helpers
  getPathSeparator,
  getHomeEnvVar,

  // Path Builders
  getHomeDir,
  getStateDir,
  getSandboxesDir,
  getVoiceCallsDir,
  getWorkspaceDir,
  getMemoryDir,
  getNotesDir,
  getSessionsDir,
  getLogsDir,
  getCredentialsDir,
  getCacheDir,
  getTempDir,
  getConfigPath,
  getGatewayLockPath,

  // Utility Functions
  resolveUserPath,
  joinPaths,
  getRelativePath,
  normalizePath,
} from "./path-constants.js";

// ============================================================================
// Size Constants
// ============================================================================

export {
  // Media Size Limits
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOCUMENT_BYTES,

  // Size Units
  BYTES_PER_KB,
  BYTES_PER_MB,
  BYTES_PER_GB,

  // Media Type Detection
  mediaKindFromMime,
  maxBytesForKind,
  type MediaKind,

  // Size Formatting
  formatBytes,
  parseBytes,
  isWithinLimit,
  percentOfLimit,
} from "./size-constants.js";

// ============================================================================
// Domain-Specific Constants (from existing files)
// ============================================================================

// Re-export existing constants for convenience
// (These can be imported directly from their original locations as well)

// Note: Add re-exports here as needed, e.g.:
// export * from '../daemon/constants.js';
// export * from '../agents/auth-profiles/constants.js';
// etc.
