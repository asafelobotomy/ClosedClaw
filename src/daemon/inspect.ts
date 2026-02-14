import fs from "node:fs/promises";
import path from "node:path";
import {
  GATEWAY_SERVICE_KIND,
  GATEWAY_SERVICE_MARKER,
  resolveGatewaySystemdServiceName,
} from "./constants.js";

export type ExtraGatewayService = {
  platform: "linux";
  label: string;
  detail: string;
  scope: "user" | "system";
  marker?: "ClosedClaw" | "clawdbot" | "moltbot";
  legacy?: boolean;
};

export type FindExtraGatewayServicesOptions = {
  deep?: boolean;
};

const EXTRA_MARKERS = ["ClosedClaw", "clawdbot", "moltbot"] as const;

export function renderGatewayServiceCleanupHints(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string[] {
  const profile = env.ClosedClaw_PROFILE;
  const unit = resolveGatewaySystemdServiceName(profile);
  return [
    `systemctl --user disable --now ${unit}.service`,
    `rm ~/.config/systemd/user/${unit}.service`,
  ];
}

function resolveHomeDir(env: Record<string, string | undefined>): string {
  const home = env.HOME?.trim();
  if (!home) {
    throw new Error("Missing HOME");
  }
  return home;
}

type Marker = (typeof EXTRA_MARKERS)[number];

function detectMarker(content: string): Marker | null {
  const lower = content.toLowerCase();
  for (const marker of EXTRA_MARKERS) {
    if (lower.includes(marker)) {
      return marker;
    }
  }
  return null;
}

function hasGatewayServiceMarker(content: string): boolean {
  const lower = content.toLowerCase();
  const markerKeys = ["ClosedClaw_service_marker"];
  const kindKeys = ["ClosedClaw_service_kind"];
  const markerValues = [GATEWAY_SERVICE_MARKER.toLowerCase()];
  const hasMarkerKey = markerKeys.some((key) => lower.includes(key));
  const hasKindKey = kindKeys.some((key) => lower.includes(key));
  const hasMarkerValue = markerValues.some((value) => lower.includes(value));
  return (
    hasMarkerKey &&
    hasKindKey &&
    hasMarkerValue &&
    lower.includes(GATEWAY_SERVICE_KIND.toLowerCase())
  );
}

function isClosedClawGatewaySystemdService(name: string, contents: string): boolean {
  if (hasGatewayServiceMarker(contents)) {
    return true;
  }
  if (!name.startsWith("ClosedClaw-gateway")) {
    return false;
  }
  return contents.toLowerCase().includes("gateway");
}

function isIgnoredSystemdName(name: string): boolean {
  return name === resolveGatewaySystemdServiceName();
}

async function scanSystemdDir(params: {
  dir: string;
  scope: "user" | "system";
}): Promise<ExtraGatewayService[]> {
  const results: ExtraGatewayService[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(params.dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".service")) {
      continue;
    }
    const name = entry.replace(/\.service$/, "");
    if (isIgnoredSystemdName(name)) {
      continue;
    }
    const fullPath = path.join(params.dir, entry);
    let contents = "";
    try {
      contents = await fs.readFile(fullPath, "utf8");
    } catch {
      continue;
    }
    const marker = detectMarker(contents);
    if (!marker) {
      continue;
    }
    if (marker === "ClosedClaw" && isClosedClawGatewaySystemdService(name, contents)) {
      continue;
    }
    results.push({
      platform: "linux",
      label: entry,
      detail: `unit: ${fullPath}`,
      scope: params.scope,
      marker,
      legacy: marker !== "ClosedClaw",
    });
  }

  return results;
}

export async function findExtraGatewayServices(
  env: Record<string, string | undefined>,
  opts: FindExtraGatewayServicesOptions = {},
): Promise<ExtraGatewayService[]> {
  const results: ExtraGatewayService[] = [];
  const seen = new Set<string>();
  const push = (svc: ExtraGatewayService) => {
    const key = `${svc.platform}:${svc.label}:${svc.detail}:${svc.scope}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(svc);
  };

  try {
    const home = resolveHomeDir(env);
    const userDir = path.join(home, ".config", "systemd", "user");
    for (const svc of await scanSystemdDir({
      dir: userDir,
      scope: "user",
    })) {
      push(svc);
    }
    if (opts.deep) {
      for (const dir of ["/etc/systemd/system", "/usr/lib/systemd/system", "/lib/systemd/system"]) {
        for (const svc of await scanSystemdDir({
          dir,
          scope: "system",
        })) {
          push(svc);
        }
      }
    }
  } catch {
    return results;
  }
  return results;
}
