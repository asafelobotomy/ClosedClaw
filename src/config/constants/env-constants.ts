/**
 * Environment Variable Names
 * 
 * Centralized constants for all environment variable names used in ClosedClaw.
 * Import from here instead of using string literals to prevent typos and enable
 * type-safe environment variable access.
 * 
 * @example
 * ```typescript
 * // Before
 * const port = process.env.ClosedClaw_GATEWAY_PORT;
 * 
 * // After
 * import { ENV_CLOSEDCLAW_GATEWAY_PORT } from '@/config/constants';
 * const port = process.env[ENV_CLOSEDCLAW_GATEWAY_PORT];
 * ```
 */

// ============================================================================
// Core Environment Variables
// ============================================================================

export const ENV_CLOSEDCLAW_ROOT = "ClosedClaw_ROOT" as const;
export const ENV_CLOSEDCLAW_STATE_DIR = "ClosedClaw_STATE_DIR" as const;
export const ENV_CLOSEDCLAW_PROFILE = "ClosedClaw_PROFILE" as const;
export const ENV_CLOSEDCLAW_DEBUG = "ClosedClaw_DEBUG" as const;
export const ENV_CLOSEDCLAW_LOG_LEVEL = "ClosedClaw_LOG_LEVEL" as const;

// ============================================================================
// Gateway Environment Variables
// ============================================================================

export const ENV_CLOSEDCLAW_GATEWAY_PORT = "ClosedClaw_GATEWAY_PORT" as const;
export const ENV_CLOSEDCLAW_GATEWAY_TOKEN = "ClosedClaw_GATEWAY_TOKEN" as const;
export const ENV_CLOSEDCLAW_GATEWAY_PASSWORD = "ClosedClaw_GATEWAY_PASSWORD" as const;
export const ENV_CLOSEDCLAW_GATEWAY_LOCK = "ClosedClaw_GATEWAY_LOCK" as const;
export const ENV_CLOSEDCLAW_SKIP_CHANNELS = "ClosedClaw_SKIP_CHANNELS" as const;
export const ENV_CLOSEDCLAW_CONTROL_UI_BASE_PATH = "ClosedClaw_CONTROL_UI_BASE_PATH" as const;

// ============================================================================
// Testing Environment Variables
// ============================================================================

export const ENV_VITEST = "VITEST" as const;
export const ENV_NODE_ENV = "NODE_ENV" as const;
export const ENV_CI = "CI" as const;
export const ENV_GITHUB_ACTIONS = "GITHUB_ACTIONS" as const;
export const ENV_RUNNER_OS = "RUNNER_OS" as const;

export const ENV_CLOSEDCLAW_LIVE_TEST = "ClosedClaw_LIVE_TEST" as const;
export const ENV_LIVE = "LIVE" as const; // Generic live test flag
export const ENV_CLOSEDCLAW_LIVE_MODELS = "ClosedClaw_LIVE_MODELS" as const;
export const ENV_CLOSEDCLAW_LIVE_PROVIDERS = "ClosedClaw_LIVE_PROVIDERS" as const;
export const ENV_CLOSEDCLAW_LIVE_REQUIRE_PROFILE_KEYS = "ClosedClaw_LIVE_REQUIRE_PROFILE_KEYS" as const;
export const ENV_CLOSEDCLAW_LIVE_MODEL_TIMEOUT_MS = "ClosedClaw_LIVE_MODEL_TIMEOUT_MS" as const;
export const ENV_CLOSEDCLAW_TEST_SHARDS = "ClosedClaw_TEST_SHARDS" as const;
export const ENV_CLOSEDCLAW_TEST_WORKERS = "ClosedClaw_TEST_WORKERS" as const;
export const ENV_CLOSEDCLAW_TEST_HANDSHAKE_TIMEOUT_MS = "ClosedClaw_TEST_HANDSHAKE_TIMEOUT_MS" as const;
export const ENV_CLOSEDCLAW_E2E_MODELS = "ClosedClaw_E2E_MODELS" as const;

// ============================================================================
// Provider API Keys & Configuration
// ============================================================================

// Anthropic
export const ENV_ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY" as const;
export const ENV_ANTHROPIC_OAUTH_TOKEN = "ANTHROPIC_OAUTH_TOKEN" as const;
export const ENV_CLOSEDCLAW_LIVE_ANTHROPIC_KEYS = "ClosedClaw_LIVE_ANTHROPIC_KEYS" as const;

// OpenAI
export const ENV_OPENAI_API_KEY = "OPENAI_API_KEY" as const;
export const ENV_OPENAI_TTS_BASE_URL = "OPENAI_TTS_BASE_URL" as const;

// Minimax
export const ENV_MINIMAX_API_KEY = "MINIMAX_API_KEY" as const;
export const ENV_MINIMAX_BASE_URL = "MINIMAX_BASE_URL" as const;
export const ENV_MINIMAX_MODEL = "MINIMAX_MODEL" as const;

// Z.AI
export const ENV_ZAI_API_KEY = "ZAI_API_KEY" as const;
export const ENV_Z_AI_API_KEY = "Z_AI_API_KEY" as const;
export const ENV_CLOSEDCLAW_ZAI_FALLBACK_SESSION_ID = "ClosedClaw_ZAI_FALLBACK_SESSION_ID" as const;
export const ENV_CLAWDBOT_ZAI_FALLBACK_SESSION_ID = "CLAWDBOT_ZAI_FALLBACK_SESSION_ID" as const;

// Search & Tools
export const ENV_BRAVE_API_KEY = "BRAVE_API_KEY" as const;
export const ENV_FIRECRAWL_API_KEY = "FIRECRAWL_API_KEY" as const;
export const ENV_FIRECRAWL_BASE_URL = "FIRECRAWL_BASE_URL" as const;

// ============================================================================
// Channel-Specific Environment Variables
// ============================================================================

export const ENV_TELEGRAM_BOT_TOKEN = "TELEGRAM_BOT_TOKEN" as const;
export const ENV_CLOSEDCLAW_TWITCH_ACCESS_TOKEN = "ClosedClaw_TWITCH_ACCESS_TOKEN" as const;
export const ENV_CLOSEDCLAW_DEBUG_NEXTCLOUD_TALK_ACCOUNTS = "ClosedClaw_DEBUG_NEXTCLOUD_TALK_ACCOUNTS" as const;

// ============================================================================
// Agent & Skills Environment Variables
// ============================================================================

export const ENV_CLOSEDCLAW_BUNDLED_SKILLS_DIR = "ClosedClaw_BUNDLED_SKILLS_DIR" as const;
export const ENV_CLOSEDCLAW_BUNDLED_PLUGINS_DIR = "ClosedClaw_BUNDLED_PLUGINS_DIR" as const;
export const ENV_CLOSEDCLAW_RAW_STREAM = "ClosedClaw_RAW_STREAM" as const;
export const ENV_CLOSEDCLAW_RAW_STREAM_PATH = "ClosedClaw_RAW_STREAM_PATH" as const;

// ============================================================================
// System Environment Variables
// ============================================================================

export const ENV_SHELL = "SHELL" as const;
export const ENV_PATH = "PATH" as const;
export const ENV_PATHEXT = "PATHEXT" as const;
export const ENV_NODE_OPTIONS = "NODE_OPTIONS" as const;
export const ENV_HOME = "HOME" as const;
export const ENV_USERPROFILE = "USERPROFILE" as const;

// ============================================================================
// Build & Deployment Environment Variables
// ============================================================================

export const ENV_VERSIONS_JSON = "VERSIONS_JSON" as const;
export const ENV_LATEST_VERSION = "LATEST_VERSION" as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return process.env[ENV_CI] === "true" || process.env[ENV_GITHUB_ACTIONS] === "true";
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return Boolean(process.env[ENV_VITEST]) || process.env[ENV_NODE_ENV] === "test";
}

/**
 * Check if running live tests
 */
export function isLiveTest(): boolean {
  return Boolean(process.env[ENV_CLOSEDCLAW_LIVE_TEST]);
}

/**
 * Get runner OS (for CI)
 */
export type RunnerOS = "macOS" | "Windows" | "Linux" | "unknown";

export function getRunnerOS(): RunnerOS {
  const runnerOS = process.env[ENV_RUNNER_OS];
  if (runnerOS === "macOS") {return "macOS";}
  if (runnerOS === "Windows") {return "Windows";}
  if (runnerOS === "Linux") {return "Linux";}
  
  // Fallback to platform detection
  if (process.platform === "darwin") {return "macOS";}
  if (process.platform === "win32") {return "Windows";}
  if (process.platform === "linux") {return "Linux";}
  
  return "unknown";
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === "win32" || process.env[ENV_RUNNER_OS] === "Windows";
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === "darwin" || process.env[ENV_RUNNER_OS] === "macOS";
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === "linux" || process.env[ENV_RUNNER_OS] === "Linux";
}
