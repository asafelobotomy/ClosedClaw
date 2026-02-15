/**
 * Token Management Commands
 *
 * Provides helpers for generating, reading, and setting gateway tokens.
 * Used both by the `closedclaw token` CLI subcommand and by the launch
 * command when a token needs to be created automatically.
 */

import { randomBytes } from "node:crypto";
import type { RuntimeEnv } from "../runtime.js";
import {
  loadConfig,
  readConfigFileSnapshot,
  writeConfigFile,
} from "../config/config.js";
import type { ClosedClawConfig } from "../config/config.js";

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/** Generate a cryptographically random 32-byte hex token. */
export function generateGatewayToken(): string {
  return randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

export type ResolvedToken = {
  token: string;
  source: "env" | "config";
};

/**
 * Resolve the current gateway token from environment or config.
 * Returns `null` when no token is configured anywhere.
 */
export function resolveCurrentToken(
  cfg?: ClosedClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedToken | null {
  const envToken = env.ClosedClaw_GATEWAY_TOKEN ?? env.CLAWDBOT_GATEWAY_TOKEN;
  if (typeof envToken === "string" && envToken.trim().length > 0) {
    return { token: envToken.trim(), source: "env" };
  }
  const config = cfg ?? loadConfig();
  const configToken = config.gateway?.auth?.token;
  if (typeof configToken === "string" && configToken.trim().length > 0) {
    return { token: configToken.trim(), source: "config" };
  }
  return null;
}

/**
 * Ensure a gateway token exists. If none is configured, generate one
 * and persist it to the config file.
 *
 * @returns The active token (existing or freshly generated).
 */
export async function ensureGatewayToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedToken> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.valid ? snapshot.config : {};
  const existing = resolveCurrentToken(cfg, env);
  if (existing) {
    return existing;
  }

  const token = generateGatewayToken();
  const nextConfig: ClosedClawConfig = {
    ...cfg,
    gateway: {
      ...cfg.gateway,
      auth: {
        ...cfg.gateway?.auth,
        token,
      },
    },
  };
  await writeConfigFile(nextConfig);
  return { token, source: "config" };
}

// ---------------------------------------------------------------------------
// CLI sub-command handlers
// ---------------------------------------------------------------------------

export async function tokenGetCommand(runtime: RuntimeEnv): Promise<void> {
  const resolved = resolveCurrentToken();
  if (!resolved) {
    runtime.log("No gateway token configured.");
    runtime.log("Generate one with: closedclaw token generate");
    return;
  }
  runtime.log("Token (" + resolved.source + "): " + resolved.token);
}

export async function tokenGenerateCommand(runtime: RuntimeEnv): Promise<void> {
  const resolved = await ensureGatewayToken();
  runtime.log("Gateway token: " + resolved.token);
  if (resolved.source === "config") {
    runtime.log("Token saved to config.");
  } else {
    runtime.log("Token is set via environment variable.");
  }
}

export async function tokenSetCommand(runtime: RuntimeEnv, token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    runtime.error("Token must not be empty.");
    runtime.exit(1);
    return;
  }
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.valid ? snapshot.config : {};
  const nextConfig: ClosedClawConfig = {
    ...cfg,
    gateway: {
      ...cfg.gateway,
      auth: {
        ...cfg.gateway?.auth,
        token: trimmed,
      },
    },
  };
  await writeConfigFile(nextConfig);
  runtime.log("Gateway token updated in config.");
}
