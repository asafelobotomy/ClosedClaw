// Default service labels (canonical + legacy compatibility)
export const GATEWAY_SYSTEMD_SERVICE_NAME = "ClosedClaw-gateway";
export const GATEWAY_SERVICE_MARKER = "ClosedClaw";
export const GATEWAY_SERVICE_KIND = "gateway";
export const NODE_SYSTEMD_SERVICE_NAME = "ClosedClaw-node";
export const NODE_SERVICE_MARKER = "ClosedClaw";
export const NODE_SERVICE_KIND = "node";
export const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES: string[] = [];

// Platform-specific constants
export const GATEWAY_LAUNCH_AGENT_LABEL = "ai.ClosedClaw.gateway";
export const GATEWAY_WINDOWS_TASK_NAME = "ClosedClaw Gateway";

export function normalizeGatewayProfile(profile?: string): string | null {
  const trimmed = profile?.trim();
  if (!trimmed || trimmed.toLowerCase() === "default") {
    return null;
  }
  return trimmed;
}

export function resolveGatewayProfileSuffix(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  return normalized ? `-${normalized}` : "";
}

export function resolveGatewaySystemdServiceName(profile?: string): string {
  const suffix = resolveGatewayProfileSuffix(profile);
  if (!suffix) {
    return GATEWAY_SYSTEMD_SERVICE_NAME;
  }
  return `ClosedClaw-gateway${suffix}`;
}

export function resolveGatewayLaunchAgentLabel(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  if (!normalized) {
    return GATEWAY_LAUNCH_AGENT_LABEL;
  }
  return `ai.ClosedClaw.${normalized}`;
}

export function resolveGatewayWindowsTaskName(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  if (!normalized) {
    return GATEWAY_WINDOWS_TASK_NAME;
  }
  return `ClosedClaw Gateway (${normalized})`;
}

export function formatGatewayServiceDescription(params?: {
  profile?: string;
  version?: string;
}): string {
  const profile = normalizeGatewayProfile(params?.profile);
  const version = params?.version?.trim();
  const parts: string[] = [];
  if (profile) {
    parts.push(`profile: ${profile}`);
  }
  if (version) {
    parts.push(`v${version}`);
  }
  if (parts.length === 0) {
    return "ClosedClaw Gateway";
  }
  return `ClosedClaw Gateway (${parts.join(", ")})`;
}

export function resolveNodeSystemdServiceName(): string {
  return NODE_SYSTEMD_SERVICE_NAME;
}

export function formatNodeServiceDescription(params?: { version?: string }): string {
  const version = params?.version?.trim();
  if (!version) {
    return "ClosedClaw Node Host";
  }
  return `ClosedClaw Node Host (v${version})`;
}
