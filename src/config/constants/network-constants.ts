/**
 * Network Constants
 *
 * Centralized constants for ports, URLs, and network configuration used across ClosedClaw.
 * Use these instead of hardcoding values to enable easier testing and configuration.
 *
 * @example
 * ```typescript
 * // Before
 * const url = "http://127.0.0.1:18789";
 *
 * // After
 * import { buildGatewayHttpUrl, DEFAULT_GATEWAY_PORT } from '@/config/constants';
 * const url = buildGatewayHttpUrl();
 * ```
 */

// ============================================================================
// IP Addresses & Hostnames
// ============================================================================

export const LOCALHOST_IPV4 = "127.0.0.1" as const;
export const LOCALHOST_IPV6 = "::1" as const;
export const LOCALHOST_HOSTNAME = "localhost" as const;
export const BIND_ALL_INTERFACES = "0.0.0.0" as const;

// ============================================================================
// Default Ports
// ============================================================================

export const DEFAULT_GATEWAY_PORT = 18789 as const;
export const DEFAULT_SIGNAL_PORT = 8080 as const;
export const DEFAULT_ORACLE_PORT = 1234 as const;
export const DEFAULT_OLLAMA_PORT = 11434 as const;
export const DEFAULT_BRAVE_LOCAL_PORT = 8880 as const;
export const DEFAULT_FIRECRAWL_PORT = 3002 as const;
export const DEFAULT_IPFS_API_PORT = 5001 as const;

// Test-specific ports
export const TEST_PORT_GATEWAY = DEFAULT_GATEWAY_PORT;
export const TEST_PORT_CUSTOM_GATEWAY = 38789 as const;

// ============================================================================
// Protocol Schemes
// ============================================================================

export const PROTOCOL_HTTP = "http" as const;
export const PROTOCOL_HTTPS = "https" as const;
export const PROTOCOL_WS = "ws" as const;
export const PROTOCOL_WSS = "wss" as const;

// ============================================================================
// URL Builders
// ============================================================================

/**
 * Build Gateway HTTP URL
 *
 * @param port - Gateway port (defaults to DEFAULT_GATEWAY_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 * @returns HTTP URL for gateway
 *
 * @example
 * ```typescript
 * buildGatewayHttpUrl() // "http://127.0.0.1:18789"
 * buildGatewayHttpUrl(8080) // "http://127.0.0.1:8080"
 * buildGatewayHttpUrl(18789, "localhost") // "http://localhost:18789"
 * ```
 */
export function buildGatewayHttpUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${PROTOCOL_HTTP}://${host}:${port}`;
}

/**
 * Build Gateway WebSocket URL
 *
 * @param port - Gateway port (defaults to DEFAULT_GATEWAY_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 * @returns WebSocket URL for gateway
 *
 * @example
 * ```typescript
 * buildGatewayWsUrl() // "ws://127.0.0.1:18789"
 * ```
 */
export function buildGatewayWsUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${PROTOCOL_WS}://${host}:${port}`;
}

/**
 * Build Signal HTTP URL
 *
 * @param port - Signal port (defaults to DEFAULT_SIGNAL_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 * @returns HTTP URL for Signal
 */
export function buildSignalHttpUrl(
  port: number = DEFAULT_SIGNAL_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${PROTOCOL_HTTP}://${host}:${port}`;
}

/**
 * Build Ollama HTTP URL
 *
 * @param port - Ollama port (defaults to DEFAULT_OLLAMA_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 * @returns HTTP URL for Ollama
 */
export function buildOllamaHttpUrl(
  port: number = DEFAULT_OLLAMA_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${PROTOCOL_HTTP}://${host}:${port}`;
}

/**
 * Build generic HTTP URL
 *
 * @param host - Host address
 * @param port - Port number
 * @param path - Optional path (with leading slash)
 * @returns HTTP URL
 */
export function buildHttpUrl(host: string, port: number, path?: string): string {
  const base = `${PROTOCOL_HTTP}://${host}:${port}`;
  return path ? `${base}${path}` : base;
}

/**
 * Build generic WebSocket URL
 *
 * @param host - Host address
 * @param port - Port number
 * @param path - Optional path (with leading slash)
 * @returns WebSocket URL
 */
export function buildWsUrl(host: string, port: number, path?: string): string {
  const base = `${PROTOCOL_WS}://${host}:${port}`;
  return path ? `${base}${path}` : base;
}

// ============================================================================
// Common Endpoints
// ============================================================================

export const GATEWAY_ENDPOINT_RPC = "/rpc" as const;
export const GATEWAY_ENDPOINT_WS = "/ws" as const;
export const GATEWAY_ENDPOINT_STATUS = "/gateway/status" as const;

/**
 * Build Gateway RPC URL
 *
 * @param port - Gateway port (defaults to DEFAULT_GATEWAY_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 */
export function buildGatewayRpcUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${buildGatewayHttpUrl(port, host)}${GATEWAY_ENDPOINT_RPC}`;
}

/**
 * Build Gateway WebSocket endpoint URL
 *
 * @param port - Gateway port (defaults to DEFAULT_GATEWAY_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 */
export function buildGatewayWsEndpointUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${buildGatewayWsUrl(port, host)}${GATEWAY_ENDPOINT_WS}`;
}

/**
 * Build Gateway status endpoint URL
 *
 * @param port - Gateway port (defaults to DEFAULT_GATEWAY_PORT)
 * @param host - Host address (defaults to LOCALHOST_IPV4)
 */
export function buildGatewayStatusUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `${buildGatewayHttpUrl(port, host)}${GATEWAY_ENDPOINT_STATUS}`;
}

// ============================================================================
// Network Timeouts & Limits
// ============================================================================

export const HTTP_TIMEOUT_DEFAULT_MS = 30_000 as const; // 30 seconds
export const HTTP_TIMEOUT_SHORT_MS = 10_000 as const; // 10 seconds
export const HTTP_TIMEOUT_LONG_MS = 60_000 as const; // 60 seconds

export const WS_RECONNECT_DELAY_MS = 1_000 as const; // 1 second
export const WS_PING_INTERVAL_MS = 30_000 as const; // 30 seconds
export const WS_PONG_TIMEOUT_MS = 5_000 as const; // 5 seconds

// ============================================================================
// External Service URLs (common defaults)
// ============================================================================

export const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev" as const;
export const DEFAULT_BRAVE_SEARCH_BASE_URL = "https://api.search.brave.com" as const;
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com" as const;
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1" as const;
