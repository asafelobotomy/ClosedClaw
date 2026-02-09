/**
 * Channel-specific constants for ClosedClaw.
 *
 * This module centralizes all channel defaults:
 * - Account IDs
 * - Default voices (TTS)
 * - Channel-specific limits
 * - DM policies
 * - Command prefixes
 *
 * Each channel extension can reference these as fallbacks.
 */

/**
 * Default account identifiers.
 * Used when user hasn't configured multiple accounts per channel.
 */
export const CHANNELS_ACCOUNTS = {
  /** Default account ID for all channels */
  DEFAULT: "default",

  /** Matrix default account key */
  MATRIX: "default",

  /** Twitch default bot account */
  TWITCH: "default",

  /** Line default account */
  LINE: "default",

  /** Nostr default keypair */
  NOSTR: "default",
} as const;

/**
 * Voice and TTS configuration.
 */
export const CHANNELS_VOICE = {
  /** Default Polly voice for voice calls */
  POLLY_DEFAULT: "Polly.Joanna",

  /** OpenAI TTS available voices */
  OPENAI_VOICES: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const,
} as const;

/**
 * Assistant identity defaults.
 * Used when no custom identity configured.
 */
export const CHANNELS_IDENTITY = {
  /** Default assistant name */
  NAME: "Assistant",

  /** Default assistant avatar (single letter) */
  AVATAR: "A",
} as const;

/**
 * Session and routing defaults.
 */
export const CHANNELS_SESSION = {
  /** Default agent ID for routing */
  AGENT_ID: "main",

  /** Default session key for direct chats */
  MAIN_KEY: "main",

  /** Default account ID for bindings */
  ACCOUNT_ID: "default",
} as const;

/**
 * DM policy defaults.
 * Controls how to handle messages from unknown senders.
 */
export const CHANNELS_DM_POLICY = {
  /** Default DM policy (pairing code required for unknown) */
  DEFAULT: "pairing" as const,

  /** Typing indicator mode for groups */
  GROUP_TYPING_MODE: "message" as const,
} as const;

/**
 * Command prefix defaults.
 * Some channels (Mattermost, IRC) use command prefixes.
 */
export const CHANNELS_COMMANDS = {
  /** Mattermost on-char triggers */
  MATTERMOST_PREFIXES: [">", "!"] as const,
} as const;

/**
 * Gateway daemon runtime.
 */
export const CHANNELS_DAEMON = {
  /** Default Gateway daemon runtime */
  RUNTIME: "node" as const,
} as const;

/**
 * Cron channel special values.
 */
export const CHANNELS_CRON = {
  /** Special channel value: target last active channel */
  CHANNEL_LAST: "last",
} as const;

/**
 * Embedding model defaults.
 */
export const CHANNELS_EMBEDDINGS = {
  /** OpenAI default embedding model */
  OPENAI_MODEL: "text-embedding-3-small",

  /** Gemini default embedding model */
  GEMINI_MODEL: "gemini-embedding-001",
} as const;

/**
 * Audio transcription defaults.
 */
export const CHANNELS_AUDIO = {
  /** Deepgram default model */
  DEEPGRAM_MODEL: "nova-3",
} as const;

/**
 * Browser profile defaults.
 */
export const CHANNELS_BROWSER = {
  /** Enable browser automation by default */
  ENABLED: true,

  /** Enable evaluate command by default */
  EVALUATE_ENABLED: true,

  /** ClosedClaw browser profile color */
  COLOR: "#FF4500",

  /** ClosedClaw browser profile name */
  PROFILE_NAME: "ClosedClaw",

  /** Default Chrome profile name */
  DEFAULT_PROFILE_NAME: "chrome",
} as const;

/**
 * Gmail hook defaults.
 */
export const CHANNELS_GMAIL = {
  /** Default label to watch */
  LABEL: "INBOX",

  /** Pub/Sub topic name */
  TOPIC: "gog-gmail-watch",

  /** Pub/Sub subscription name */
  SUBSCRIPTION: "gog-gmail-watch-push",
} as const;

/**
 * Minimax provider defaults.
 */
export const CHANNELS_MINIMAX = {
  /** Default context window */
  CONTEXT_WINDOW: 200000,

  /** Default max tokens */
  MAX_TOKENS: 8192,
} as const;

/**
 * Upstream fork management defaults.
 */
export const CHANNELS_UPSTREAM = {
  /** Default upstream remote name */
  REMOTE: "openclaw",

  /** Default upstream branch */
  BRANCH: "main",

  /** Check interval (hours) */
  CHECK_INTERVAL_HOURS: 24,
} as const;

/**
 * Master channels configuration export.
 * Namespaced for IDE autocomplete and easy refactoring.
 */
export const CHANNELS = {
  ACCOUNTS: CHANNELS_ACCOUNTS,
  VOICE: CHANNELS_VOICE,
  IDENTITY: CHANNELS_IDENTITY,
  SESSION: CHANNELS_SESSION,
  DM_POLICY: CHANNELS_DM_POLICY,
  COMMANDS: CHANNELS_COMMANDS,
  DAEMON: CHANNELS_DAEMON,
  CRON: CHANNELS_CRON,
  EMBEDDINGS: CHANNELS_EMBEDDINGS,
  AUDIO: CHANNELS_AUDIO,
  BROWSER: CHANNELS_BROWSER,
  GMAIL: CHANNELS_GMAIL,
  MINIMAX: CHANNELS_MINIMAX,
  UPSTREAM: CHANNELS_UPSTREAM,
} as const;
