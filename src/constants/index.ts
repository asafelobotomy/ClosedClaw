/**
 * Centralized constants library for ClosedClaw.
 *
 * This module consolidates all constants scattered across the codebase into
 * a single, well-organized, type-safe location.
 *
 * **Benefits**:
 * - Single source of truth (no configuration drift)
 * - Easy security audits (one directory to review)
 * - Simplified testing (mock one import vs hunting 40+ files)
 * - Type-safe constants prevent typos
 * - Better IDE autocomplete and documentation
 * - Easier onboarding for contributors
 *
 * **Usage**:
 * ```typescript
 * import { SECURITY, LIMITS, PATHS, NETWORK, CHANNELS } from '../constants';
 *
 * // Security
 * const kdfParams = SECURITY.ENCRYPTION.KDF_PARAMS;
 * const minLength = SECURITY.PASSPHRASE.MIN_LENGTH;
 *
 * // Limits
 * const timeout = LIMITS.TIMEOUT.LINK_TIMEOUT_MS;
 * const maxBytes = LIMITS.MEDIA.MAX_BYTES.video;
 *
 * // Paths
 * const configFile = PATHS.CONFIG.FILENAME;
 * const sessionsDir = PATHS.SUBDIRS.SESSIONS;
 *
 * // Network
 * const openaiUrl = NETWORK.PROVIDERS.OPENAI;
 * const gatewayPort = NETWORK.PORTS.GATEWAY;
 *
 * // Channels
 * const defaultAgent = CHANNELS.SESSION.AGENT_ID;
 * const pollyVoice = CHANNELS.VOICE.POLLY_DEFAULT;
 * ```
 *
 * @module constants
 */

// Re-export all constant namespaces
export { SECURITY } from "./security.js";
export { PATHS, resolveSubdir, resolveGatewayLockDir } from "./paths.js";
export { LIMITS } from "./limits.js";
export { NETWORK } from "./network.js";
export { CHANNELS } from "./channels.js";
export { AGENTS } from "./agents.js";

// Re-export types for external consumers
export type {
  Argon2idParams,
  EncryptionConfig,
  EncryptionAlgorithm,
  KeyDerivationFunction,
} from "../security/encryption-types.js";

/**
 * Version information.
 *
 * **Note**: This is dynamically resolved at build time.
 * See `src/version.ts` for implementation.
 */
export { VERSION } from "../version.js";
