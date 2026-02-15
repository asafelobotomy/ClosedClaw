/**
 * Shared environment safety utilities for host execution contexts.
 * Enforces a common blocklist and optionally forbids PATH overrides.
 */
const BLOCKED_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PYTHONPATH",
  "PYTHONHOME",
  "RUBYLIB",
  "PERL5LIB",
  "BASH_ENV",
  "ENV",
  "GCONV_PATH",
  "IFS",
  "SSLKEYLOGFILE",
]);

const BLOCKED_ENV_PREFIXES = ["DYLD_", "LD_"];

export type EnvSafetyOptions = {
  /** When true, any attempt to override PATH throws. */
  forbidPathOverride?: boolean;
};

export function assertSafeEnv(env: Record<string, string>, opts?: EnvSafetyOptions): void {
  const forbidPathOverride = opts?.forbidPathOverride ?? false;
  for (const key of Object.keys(env)) {
    const upperKey = key.toUpperCase();
    if (BLOCKED_ENV_PREFIXES.some((prefix) => upperKey.startsWith(prefix))) {
      throw new Error(`Security Violation: Environment variable '${key}' is forbidden.`);
    }
    if (BLOCKED_ENV_KEYS.has(upperKey)) {
      throw new Error(`Security Violation: Environment variable '${key}' is forbidden.`);
    }
    if (forbidPathOverride && upperKey === "PATH") {
      throw new Error(
        "Security Violation: Custom 'PATH' variable is forbidden during host execution.",
      );
    }
  }
}

export const envSafety = {
  assertSafeEnv,
  BLOCKED_ENV_KEYS,
  BLOCKED_ENV_PREFIXES,
} as const;
