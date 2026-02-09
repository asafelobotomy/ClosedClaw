/**
 * File system paths and directory constants for ClosedClaw.
 *
 * This module centralizes all path-related configuration:
 * - State directory (mutable data)
 * - Config file locations
 * - Credentials storage
 * - Session transcripts
 * - Cron job persistence
 * - Agent workspace files
 *
 * Paths respect environment variable overrides:
 * - `ClosedClaw_STATE_DIR`: Override state directory
 * - `ClosedClaw_CONFIG_PATH`: Override config file path
 * - `ClosedClaw_OAUTH_DIR`: Override OAuth credentials directory
 */

import os from "node:os";
import path from "node:path";

/**
 * State directory names (legacy and current).
 */
export const PATHS_STATE = {
  /** Legacy state directory names (backward compatibility) */
  LEGACY_DIRNAMES: [".clawdbot", ".moltbot", ".moldbot"] as const,

  /** Current state directory name */
  DIRNAME: ".closedclaw",

  /** Environment variable for state directory override */
  ENV_VAR: "ClosedClaw_STATE_DIR",

  /** Legacy environment variable (backward compatibility) */
  LEGACY_ENV_VAR: "CLAWDBOT_STATE_DIR",
} as const;

/**
 * Config file names and overrides.
 */
export const PATHS_CONFIG = {
  /** Current config filename */
  FILENAME: "config.json5",

  /** Legacy config filenames (backward compatibility) */
  LEGACY_FILENAMES: ["clawdbot.json", "moltbot.json", "moldbot.json"] as const,

  /** Environment variable for config path override */
  ENV_VAR: "ClosedClaw_CONFIG_PATH",

  /** Legacy environment variable */
  LEGACY_ENV_VAR: "CLAWDBOT_CONFIG_PATH",
} as const;

/**
 * Subdirectories within state directory.
 *
 * Structure: `~/.closedclaw/`
 * ```
 * ~/.closedclaw/
 * ├── config.json5       # Main configuration
 * ├── sessions/          # Session state and transcripts
 * ├── credentials/       # OAuth tokens, API keys
 * ├── cron/              # Scheduled job state
 * ├── logs/              # Structured logs (future)
 * ├── memory/            # Graph memory database (future)
 * └── cache/             # Temporary cached data
 * ```
 */
export const PATHS_SUBDIRS = {
  /** Session state and transcripts */
  SESSIONS: "sessions",

  /** OAuth tokens and API keys */
  CREDENTIALS: "credentials",

  /** Cron job state */
  CRON: "cron",

  /** Structured logs */
  LOGS: "logs",

  /** Memory database */
  MEMORY: "memory",

  /** Temporary cache */
  CACHE: "cache",
} as const;

/**
 * Agent workspace filenames.
 *
 * These files live in agent workspace directory (default: `~/agent-workspace/`).
 * Users can customize via config.
 */
export const PATHS_AGENT = {
  /** Agent configuration and instructions */
  AGENTS: "AGENTS.md",

  /** Agent personality and behavior */
  SOUL: "SOUL.md",

  /** Tool allowlist and configuration */
  TOOLS: "TOOLS.md",

  /** Assistant identity (name, avatar) */
  IDENTITY: "IDENTITY.md",

  /** User information and preferences */
  USER: "USER.md",

  /** Heartbeat acknowledgment prompt */
  HEARTBEAT: "HEARTBEAT.md",

  /** Bootstrap initialization prompt */
  BOOTSTRAP: "BOOTSTRAP.md",

  /** Memory context (primary) */
  MEMORY: "MEMORY.md",

  /** Memory context (alternative) */
  MEMORY_ALT: "memory.md",

  /** Jester mode prompt (playful personality testing) */
  SOUL_JESTER: "SOUL_JESTER.md",
} as const;

/**
 * Cron job storage.
 */
export const PATHS_CRON = {
  /** Cron jobs database filename */
  STORE: "jobs.json",
} as const;

/**
 * OAuth storage.
 */
export const PATHS_OAUTH = {
  /** OAuth tokens filename */
  FILENAME: "oauth.json",

  /** Environment variable for OAuth directory override */
  ENV_VAR: "ClosedClaw_OAUTH_DIR",
} as const;

/**
 * Passphrase storage (encryption).
 */
export const PATHS_PASSPHRASE = {
  /** Default passphrase file (relative to state dir) */
  FILENAME: ".passphrase",
} as const;

/**
 * Gateway lock directory (ephemeral).
 * Used for single-instance enforcement and PID tracking.
 */
export const PATHS_GATEWAY = {
  /** Lock directory suffix (will be in tmpdir) */
  LOCK_SUFFIX: "closedclaw",

  /** Lock filename */
  LOCK_FILE: "gateway.lock",
} as const;

/**
 * Helper to resolve full path for subdirectory.
 *
 * @param stateDir - State directory path
 * @param subdir - Subdirectory key from PATHS_SUBDIRS
 * @returns Full path to subdirectory
 *
 * @example
 * ```typescript
 * const sessionsDir = resolveSubdir(STATE_DIR, "SESSIONS");
 * // => "/home/user/.closedclaw/sessions"
 * ```
 */
export function resolveSubdir(stateDir: string, subdir: keyof typeof PATHS_SUBDIRS): string {
  return path.join(stateDir, PATHS_SUBDIRS[subdir]);
}

/**
 * Helper to resolve gateway lock directory with user isolation.
 *
 * @returns Gateway lock directory path
 *
 * @example
 * ```typescript
 * const lockDir = resolveGatewayLockDir();
 * // => "/tmp/closedclaw-1000" (where 1000 is UID)
 * ```
 */
export function resolveGatewayLockDir(): string {
  const base = os.tmpdir();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const suffix = uid != null ? `${PATHS_GATEWAY.LOCK_SUFFIX}-${uid}` : PATHS_GATEWAY.LOCK_SUFFIX;
  return path.join(base, suffix);
}

/**
 * Master paths configuration export.
 * Namespaced for IDE autocomplete and easy refactoring.
 */
export const PATHS = {
  STATE: PATHS_STATE,
  CONFIG: PATHS_CONFIG,
  SUBDIRS: PATHS_SUBDIRS,
  AGENT: PATHS_AGENT,
  CRON: PATHS_CRON,
  OAUTH: PATHS_OAUTH,
  PASSPHRASE: PATHS_PASSPHRASE,
  GATEWAY: PATHS_GATEWAY,
} as const;
