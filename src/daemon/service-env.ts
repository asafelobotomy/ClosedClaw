import path from "node:path";
import { VERSION } from "../version.js";
import {
  GATEWAY_SERVICE_KIND,
  GATEWAY_SERVICE_MARKER,
  resolveGatewaySystemdServiceName,
  NODE_SERVICE_KIND,
  NODE_SERVICE_MARKER,
  resolveNodeSystemdServiceName,
} from "./constants.js";

export type MinimalServicePathOptions = {
  platform?: NodeJS.Platform;
  extraDirs?: string[];
  home?: string;
  env?: Record<string, string | undefined>;
};

type BuildServicePathOptions = MinimalServicePathOptions & {
  env?: Record<string, string | undefined>;
};

function resolveSystemPathDirs(): string[] {
  return ["/usr/local/bin", "/usr/bin", "/bin"];
}

/**
 * Resolve common user bin directories for Linux.
 * These are paths where npm global installs and node version managers typically place binaries.
 */
export function resolveLinuxUserBinDirs(
  home: string | undefined,
  env?: Record<string, string | undefined>,
): string[] {
  if (!home) {
    return [];
  }

  const dirs: string[] = [];

  const add = (dir: string | undefined) => {
    if (dir) {
      dirs.push(dir);
    }
  };
  const appendSubdir = (base: string | undefined, subdir: string) => {
    if (!base) {
      return undefined;
    }
    return base.endsWith(`/${subdir}`) ? base : path.posix.join(base, subdir);
  };

  // Env-configured bin roots (override defaults when present).
  add(env?.PNPM_HOME);
  add(appendSubdir(env?.NPM_CONFIG_PREFIX, "bin"));
  add(appendSubdir(env?.BUN_INSTALL, "bin"));
  add(appendSubdir(env?.VOLTA_HOME, "bin"));
  add(appendSubdir(env?.ASDF_DATA_DIR, "shims"));
  add(appendSubdir(env?.NVM_DIR, "current/bin"));
  add(appendSubdir(env?.FNM_DIR, "current/bin"));

  // Common user bin directories
  dirs.push(`${home}/.local/bin`); // XDG standard, pip, etc.
  dirs.push(`${home}/.npm-global/bin`); // npm custom prefix (recommended for non-root)
  dirs.push(`${home}/bin`); // User's personal bin

  // Node version managers
  dirs.push(`${home}/.nvm/current/bin`); // nvm with current symlink
  dirs.push(`${home}/.fnm/current/bin`); // fnm
  dirs.push(`${home}/.volta/bin`); // Volta
  dirs.push(`${home}/.asdf/shims`); // asdf
  dirs.push(`${home}/.local/share/pnpm`); // pnpm global bin
  dirs.push(`${home}/.bun/bin`); // Bun

  return dirs;
}

export function getMinimalServicePathParts(options: MinimalServicePathOptions = {}): string[] {
  const parts: string[] = [];
  const extraDirs = options.extraDirs ?? [];
  const systemDirs = resolveSystemPathDirs();

  // Add Linux user bin directories (npm global, nvm, fnm, volta, etc.)
  const linuxUserDirs = resolveLinuxUserBinDirs(options.home, options.env);

  const add = (dir: string) => {
    if (!dir) {
      return;
    }
    if (!parts.includes(dir)) {
      parts.push(dir);
    }
  };

  for (const dir of extraDirs) {
    add(dir);
  }
  // User dirs first so user-installed binaries take precedence
  for (const dir of linuxUserDirs) {
    add(dir);
  }
  for (const dir of systemDirs) {
    add(dir);
  }

  return parts;
}

export function getMinimalServicePathPartsFromEnv(options: BuildServicePathOptions = {}): string[] {
  const env = options.env ?? process.env;
  return getMinimalServicePathParts({
    ...options,
    home: options.home ?? env.HOME,
    env,
  });
}

export function buildMinimalServicePath(options: BuildServicePathOptions = {}): string {
  const env = options.env ?? process.env;

  return getMinimalServicePathPartsFromEnv({ ...options, env }).join(path.posix.delimiter);
}

export function buildServiceEnvironment(params: {
  env: Record<string, string | undefined>;
  port: number;
  token?: string;
}): Record<string, string | undefined> {
  const { env, port, token } = params;
  const profile = env.ClosedClaw_PROFILE;
  const systemdUnit = `${resolveGatewaySystemdServiceName(profile)}.service`;
  const stateDir = env.ClosedClaw_STATE_DIR;
  const configPath = env.ClosedClaw_CONFIG_PATH;
  return {
    HOME: env.HOME,
    PATH: buildMinimalServicePath({ env }),
    ClosedClaw_PROFILE: profile,
    ClosedClaw_STATE_DIR: stateDir,
    ClosedClaw_CONFIG_PATH: configPath,
    ClosedClaw_GATEWAY_PORT: String(port),
    ClosedClaw_GATEWAY_TOKEN: token,
    ClosedClaw_SYSTEMD_UNIT: systemdUnit,
    ClosedClaw_SERVICE_MARKER: GATEWAY_SERVICE_MARKER,
    ClosedClaw_SERVICE_KIND: GATEWAY_SERVICE_KIND,
    ClosedClaw_SERVICE_VERSION: VERSION,
  };
}

export function buildNodeServiceEnvironment(params: {
  env: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  const { env } = params;
  const stateDir = env.ClosedClaw_STATE_DIR;
  const configPath = env.ClosedClaw_CONFIG_PATH;
  return {
    HOME: env.HOME,
    PATH: buildMinimalServicePath({ env }),
    ClosedClaw_STATE_DIR: stateDir,
    ClosedClaw_CONFIG_PATH: configPath,
    ClosedClaw_SYSTEMD_UNIT: resolveNodeSystemdServiceName(),
    ClosedClaw_LOG_PREFIX: "node",
    ClosedClaw_SERVICE_MARKER: NODE_SERVICE_MARKER,
    ClosedClaw_SERVICE_KIND: NODE_SERVICE_KIND,
    ClosedClaw_SERVICE_VERSION: VERSION,
  };
}
