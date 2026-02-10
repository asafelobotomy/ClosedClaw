/**
 * Path Constants
 * 
 * Centralized constants for directory names, file names, and path construction
 * used across ClosedClaw. Use these instead of hardcoding path strings.
 * 
 * @example
 * ```typescript
 * // Before
 * const dir = path.join(os.homedir(), ".ClosedClaw", "sandboxes");
 * 
 * // After
 * import { getSandboxesDir } from '@/config/constants';
 * const dir = getSandboxesDir();
 * ```
 */

import os from "node:os";
import path from "node:path";

// ============================================================================
// Directory Names & Patterns
// ============================================================================

export const STATE_DIRNAME = ".ClosedClaw" as const;
export const LEGACY_STATE_DIRNAMES = [".clawdbot", ".moltbot", ".moldbot"] as const;

// Subdirectories
export const SUBDIRS = {
  SANDBOXES: "sandboxes",
  VOICE_CALLS: "voice-calls",
  WORKSPACE: "workspace",
  MEMORY: "memory",
  NOTES: "notes",
  SESSIONS: "sessions",
  LOGS: "logs",
  CREDENTIALS: "credentials",
  CACHE: "cache",
  TEMP: "temp",
} as const;

// Config files
export const CONFIG_FILENAME = "ClosedClaw.json" as const;
export const CONFIG_FILENAME_JSON5 = "config.json5" as const;
export const LEGACY_CONFIG_FILENAMES = ["clawdbot.json", "moltbot.json", "moldbot.json"] as const;

// Lock files
export const GATEWAY_LOCK_FILENAME = "gateway.lock" as const;

// ============================================================================
// Platform-Specific Constants
// ============================================================================

/**
 * Get platform-specific path separator
 */
export function getPathSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

/**
 * Get platform-specific home directory environment variable name
 */
export function getHomeEnvVar(): "USERPROFILE" | "HOME" {
  return process.platform === "win32" ? "USERPROFILE" : "HOME";
}

// ============================================================================
// Path Builders
// ============================================================================

/**
 * Get user's home directory
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Get ClosedClaw state directory
 * Default: ~/.ClosedClaw
 * Override: ClosedClaw_STATE_DIR environment variable
 */
export function getStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ClosedClaw_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  return path.join(getHomeDir(), STATE_DIRNAME);
}

/**
 * Get sandboxes directory
 * Default: ~/.ClosedClaw/sandboxes
 */
export function getSandboxesDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.SANDBOXES);
}

/**
 * Get voice calls directory
 * Default: ~/.ClosedClaw/voice-calls
 */
export function getVoiceCallsDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.VOICE_CALLS);
}

/**
 * Get workspace directory
 * Default: ~/.ClosedClaw/workspace
 */
export function getWorkspaceDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.WORKSPACE);
}

/**
 * Get memory directory
 * Default: ~/.ClosedClaw/workspace/memory
 */
export function getMemoryDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getWorkspaceDir(env), SUBDIRS.MEMORY);
}

/**
 * Get notes directory
 * Default: ~/.ClosedClaw/notes
 */
export function getNotesDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.NOTES);
}

/**
 * Get sessions directory
 * Default: ~/.ClosedClaw/sessions
 */
export function getSessionsDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.SESSIONS);
}

/**
 * Get logs directory
 * Default: ~/.ClosedClaw/logs
 */
export function getLogsDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.LOGS);
}

/**
 * Get credentials directory
 * Default: ~/.ClosedClaw/credentials
 */
export function getCredentialsDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.CREDENTIALS);
}

/**
 * Get cache directory
 * Default: ~/.ClosedClaw/cache
 */
export function getCacheDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.CACHE);
}

/**
 * Get temp directory
 * Default: ~/.ClosedClaw/temp
 */
export function getTempDir(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), SUBDIRS.TEMP);
}

/**
 * Get config file path
 * Default: ~/.ClosedClaw/config.json5
 * Override: ClosedClaw_CONFIG_PATH environment variable
 */
export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ClosedClaw_CONFIG_PATH?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  return path.join(getStateDir(env), CONFIG_FILENAME_JSON5);
}

/**
 * Get gateway lock file path
 * Default: ~/.ClosedClaw/gateway.lock
 */
export function getGatewayLockPath(env?: NodeJS.ProcessEnv): string {
  return path.join(getStateDir(env), GATEWAY_LOCK_FILENAME);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Resolve user path (expands ~ and resolves relative paths)
 * 
 * @example
 * ```typescript
 * resolveUserPath("~/my-dir") // "/home/user/my-dir"
 * resolveUserPath("./my-dir") // "/current/dir/my-dir"
 * ```
 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, getHomeDir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

/**
 * Join paths with platform-specific separator
 */
export function joinPaths(...paths: string[]): string {
  return path.join(...paths);
}

/**
 * Get relative path from base to target
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Normalize path (resolves .. and . segments)
 */
export function normalizePath(input: string): string {
  return path.normalize(input);
}
