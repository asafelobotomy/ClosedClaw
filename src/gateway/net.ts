import net from "node:net";
import { pickPrimaryTailnetIPv4, pickPrimaryTailnetIPv6 } from "../infra/tailnet.js";

export function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  if (ip === "127.0.0.1") {
    return true;
  }
  if (ip.startsWith("127.")) {
    return true;
  }
  if (ip === "::1") {
    return true;
  }
  if (ip.startsWith("::ffff:127.")) {
    return true;
  }
  return false;
}

function normalizeIPv4MappedAddress(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length);
  }
  return ip;
}

function normalizeIp(ip: string | undefined): string | undefined {
  const trimmed = ip?.trim();
  if (!trimmed) {
    return undefined;
  }
  return normalizeIPv4MappedAddress(trimmed.toLowerCase());
}

function stripOptionalPort(ip: string): string {
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    if (end !== -1) {
      return ip.slice(1, end);
    }
  }
  if (net.isIP(ip)) {
    return ip;
  }
  const lastColon = ip.lastIndexOf(":");
  if (lastColon > -1 && ip.includes(".") && ip.indexOf(":") === lastColon) {
    const candidate = ip.slice(0, lastColon);
    if (net.isIP(candidate) === 4) {
      return candidate;
    }
  }
  return ip;
}

export function parseForwardedForClientIp(forwardedFor?: string): string | undefined {
  const raw = forwardedFor?.split(",")[0]?.trim();
  if (!raw) {
    return undefined;
  }
  return normalizeIp(stripOptionalPort(raw));
}

function parseRealIp(realIp?: string): string | undefined {
  const raw = realIp?.trim();
  if (!raw) {
    return undefined;
  }
  return normalizeIp(stripOptionalPort(raw));
}

export function isTrustedProxyAddress(ip: string | undefined, trustedProxies?: string[]): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized || !trustedProxies || trustedProxies.length === 0) {
    return false;
  }
  return trustedProxies.some((proxy) => normalizeIp(proxy) === normalized);
}

export function resolveGatewayClientIp(params: {
  remoteAddr?: string;
  forwardedFor?: string;
  realIp?: string;
  trustedProxies?: string[];
}): string | undefined {
  const remote = normalizeIp(params.remoteAddr);
  if (!remote) {
    return undefined;
  }
  if (!isTrustedProxyAddress(remote, params.trustedProxies)) {
    return remote;
  }
  return parseForwardedForClientIp(params.forwardedFor) ?? parseRealIp(params.realIp) ?? remote;
}

export function isLocalGatewayAddress(ip: string | undefined): boolean {
  if (isLoopbackAddress(ip)) {
    return true;
  }
  if (!ip) {
    return false;
  }
  const normalized = normalizeIPv4MappedAddress(ip.trim().toLowerCase());
  const tailnetIPv4 = pickPrimaryTailnetIPv4();
  if (tailnetIPv4 && normalized === tailnetIPv4.toLowerCase()) {
    return true;
  }
  const tailnetIPv6 = pickPrimaryTailnetIPv6();
  if (tailnetIPv6 && ip.trim().toLowerCase() === tailnetIPv6.toLowerCase()) {
    return true;
  }
  return false;
}

/**
 * Resolves gateway bind host with fallback strategy.
 *
 * Modes:
 * - loopback: 127.0.0.1 (rarely fails, but handled gracefully)
 * - lan: always 0.0.0.0 (no fallback)
 * - tailnet: Tailnet IPv4 if available, else loopback
 * - auto: Loopback if available, else 0.0.0.0
 * - custom: User-specified IP, fallback to 0.0.0.0 if unavailable
 *
 * @returns The bind address to use (never null)
 */
export async function resolveGatewayBindHost(
  bind: import("../config/config.js").GatewayBindMode | undefined,
  customHost?: string,
): Promise<string> {
  const mode = bind ?? "loopback";

  if (mode === "loopback") {
    // 127.0.0.1 should always be available; error out if not (MED-02).
    if (await canBindToHost("127.0.0.1")) {
      return "127.0.0.1";
    }
    throw new Error(
      "Cannot bind to 127.0.0.1 in loopback mode. " +
        "Check if another process is using the port or if the loopback interface is down. " +
        'Use bind mode "lan" or "auto" if you need a broader bind address.',
    );
  }

  if (mode === "tailnet") {
    const tailnetIP = pickPrimaryTailnetIPv4();
    if (tailnetIP && (await canBindToHost(tailnetIP))) {
      return tailnetIP;
    }
    if (await canBindToHost("127.0.0.1")) {
      return "127.0.0.1";
    }
    // MED-02: warn when falling back to 0.0.0.0 outside of explicit lan mode.
    console.warn(
      '[gateway] WARNING: tailnet mode falling back to 0.0.0.0 — the gateway will be exposed on all network interfaces.',
    );
    return "0.0.0.0";
  }

  if (mode === "lan") {
    return "0.0.0.0";
  }

  if (mode === "custom") {
    const host = customHost?.trim();
    if (!host) {
      // MED-02: warn when falling back to 0.0.0.0 outside of explicit lan mode.
      console.warn(
        '[gateway] WARNING: custom bind mode with empty host — falling back to 0.0.0.0 (all interfaces).',
      );
      return "0.0.0.0";
    } // invalid config → fall back to all

    if (isValidIPv4(host) && (await canBindToHost(host))) {
      return host;
    }
    // Custom IP failed → fall back to LAN
    console.warn(
      `[gateway] WARNING: custom bind address ${host} unavailable — falling back to 0.0.0.0 (all interfaces).`,
    );
    return "0.0.0.0";
  }

  if (mode === "auto") {
    if (await canBindToHost("127.0.0.1")) {
      return "127.0.0.1";
    }
    // MED-02: warn when falling back to 0.0.0.0 outside of explicit lan mode.
    console.warn(
      '[gateway] WARNING: auto mode falling back to 0.0.0.0 — the gateway will be exposed on all network interfaces.',
    );
    return "0.0.0.0";
  }

  console.warn(
    '[gateway] WARNING: unknown bind mode — falling back to 0.0.0.0 (all interfaces).',
  );
  return "0.0.0.0";
}

/**
 * Test if we can bind to a specific host address.
 * Creates a temporary server, attempts to bind, then closes it.
 *
 * @param host - The host address to test
 * @returns True if we can successfully bind to this address
 */
export async function canBindToHost(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const testServer = net.createServer();
    testServer.once("error", () => {
      resolve(false);
    });
    testServer.once("listening", () => {
      testServer.close();
      resolve(true);
    });
    // Use port 0 to let OS pick an available port for testing
    testServer.listen(0, host);
  });
}

export async function resolveGatewayListenHosts(
  bindHost: string,
  opts?: { canBindToHost?: (host: string) => Promise<boolean> },
): Promise<string[]> {
  if (bindHost !== "127.0.0.1") {
    return [bindHost];
  }
  const canBind = opts?.canBindToHost ?? canBindToHost;
  if (await canBind("::1")) {
    return [bindHost, "::1"];
  }
  return [bindHost];
}

/**
 * Validate if a string is a valid IPv4 address.
 *
 * @param host - The string to validate
 * @returns True if valid IPv4 format
 */
function isValidIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    const n = parseInt(part, 10);
    return !Number.isNaN(n) && n >= 0 && n <= 255 && part === String(n);
  });
}

export function isLoopbackHost(host: string): boolean {
  return isLoopbackAddress(host);
}

// ═══════════════════════════════════════════════════════════════════════════
// IP VALIDATION — Defense-in-depth for bind mode enforcement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check whether an IP address belongs to a private (RFC 1918 / RFC 4193) range.
 * Covers: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, and IPv4-mapped variants.
 */
export function isPrivateAddress(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  const normalized = normalizeIPv4MappedAddress(ip.trim());

  // Loopback is always considered private
  if (isLoopbackAddress(normalized)) {
    return true;
  }

  const parts = normalized.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map((p) => parseInt(p, 10));
  if (octets.some((o) => Number.isNaN(o))) {
    return false;
  }

  // 10.0.0.0/8
  if (octets[0] === 10) {
    return true;
  }
  // 172.16.0.0/12
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
    return true;
  }
  // 192.168.0.0/16
  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }
  // 169.254.0.0/16 (link-local)
  if (octets[0] === 169 && octets[1] === 254) {
    return true;
  }

  return false;
}

/**
 * Check whether an IP is in the Tailscale CGNAT range (100.64.0.0/10).
 */
export function isTailscaleAddress(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  const normalized = normalizeIPv4MappedAddress(ip.trim());
  const parts = normalized.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map((p) => parseInt(p, 10));
  if (octets.some((o) => Number.isNaN(o))) {
    return false;
  }

  // 100.64.0.0/10 = 100.64.x.x through 100.127.x.x
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

/**
 * Validate whether an incoming connection IP is allowed for the given bind mode.
 *
 * This is a defense-in-depth layer: the OS-level bind already restricts which
 * interfaces accept connections, but this provides application-level enforcement
 * in case of misconfiguration or proxy scenarios.
 *
 * @param clientIp - The connecting client's IP address
 * @param bindMode - The configured gateway bind mode
 * @returns Object with `allowed` flag and optional `reason` for rejection
 */
export function validateClientIp(
  clientIp: string | undefined,
  bindMode: import("../config/types.gateway.js").GatewayBindMode | undefined,
): { allowed: boolean; reason?: string } {
  if (!clientIp) {
    return { allowed: false, reason: "No client IP available" };
  }

  const mode = bindMode ?? "loopback";

  switch (mode) {
    case "loopback": {
      if (isLoopbackAddress(clientIp)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Bind mode "loopback" rejects non-loopback IP: ${clientIp}`,
      };
    }

    case "tailnet": {
      if (isLoopbackAddress(clientIp) || isTailscaleAddress(clientIp)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Bind mode "tailnet" rejects non-Tailscale IP: ${clientIp}`,
      };
    }

    case "lan": {
      if (isPrivateAddress(clientIp)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Bind mode "lan" rejects non-private IP: ${clientIp}`,
      };
    }

    case "auto":
    case "custom":
      // These modes don't impose additional IP restrictions beyond bind
      return { allowed: true };

    default:
      return { allowed: true };
  }
}
