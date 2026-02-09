/**
 * Network and API endpoint constants for ClosedClaw.
 *
 * This module centralizes all network-related configuration:
 * - API base URLs
 * - Webhook paths
 * - Default ports
 * - Public/private endpoints
 *
 * **Security note**: All URLs use HTTPS except localhost development.
 */

/**
 * Provider API base URLs.
 */
export const NETWORK_PROVIDERS = {
  /** GitHub Copilot API */
  GITHUB_COPILOT: "https://api.individual.githubcopilot.com",

  /** OpenAI API (audio transcription, TTS) */
  OPENAI: "https://api.openai.com/v1",

  /** Google Gemini API (audio, video) */
  GOOGLE_GEMINI: "https://generativelanguage.googleapis.com/v1beta",

  /** Deepgram API (audio transcription) */
  DEEPGRAM: "https://api.deepgram.com/v1",

  /** Minimax API */
  MINIMAX: "https://api.minimax.io/v1",
} as const;

/**
 * Webhook and callback paths.
 * Used for incoming channel messages (BlueBubbles, Gmail, Slack, etc.).
 */
export const NETWORK_WEBHOOKS = {
  /** BlueBubbles webhook path */
  BLUEBUBBLES: "/bluebubbles-webhook",

  /** Gmail PubSub webhook path */
  GMAIL: "/gmail-pubsub",

  /** Generic hooks path */
  HOOKS: "/hooks",
} as const;

/**
 * Gateway and service ports.
 */
export const NETWORK_PORTS = {
  /** Default Gateway WebSocket/HTTP port */
  GATEWAY: 18789,

  /** Gmail webhook server default bind address */
  GMAIL_BIND: "127.0.0.1",

  /** Gmail webhook server default port */
  GMAIL_PORT: 8788,
} as const;

/**
 * Relay and bridge endpoints.
 */
export const NETWORK_RELAYS = {
  /** Default Nostr relays */
  NOSTR: ["wss://relay.damus.io", "wss://nos.lol"] as const,
} as const;

/**
 * Host allowlists for external content.
 * Used by SSRF protection and media proxy.
 */
export const NETWORK_ALLOWLIST = {
  /** MS Teams media authentication hosts (Microsoft domains) */
  MSTEAMS_AUTH_HOSTS: [
    "*.api.teams.microsoft.com",
    "*.teams.microsoft.com",
    "*.sharepoint.com",
  ] as const,

  /** MS Teams public media hosts (CDN) */
  MSTEAMS_MEDIA_HOSTS: ["*.cdn.office.net", "statics.teams.cdn.office.net"] as const,
} as const;

/**
 * Update channels and sources.
 */
export const NETWORK_UPDATE = {
  /** Default package update channel (npm) */
  PACKAGE_CHANNEL: "stable" as const,

  /** Default git update channel */
  GIT_CHANNEL: "dev" as const,

  /** NPM registry URL */
  NPM_REGISTRY: "https://registry.npmjs.org",
} as const;

/**
 * Master network configuration export.
 * Namespaced for IDE autocomplete and easy refactoring.
 */
export const NETWORK = {
  PROVIDERS: NETWORK_PROVIDERS,
  WEBHOOKS: NETWORK_WEBHOOKS,
  PORTS: NETWORK_PORTS,
  RELAYS: NETWORK_RELAYS,
  ALLOWLIST: NETWORK_ALLOWLIST,
  UPDATE: NETWORK_UPDATE,
} as const;
