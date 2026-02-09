/**
 * Passphrase management for end-to-end encryption.
 *
 * Handles passphrase sourcing from environment, files, or interactive prompts.
 * Future: integrate with OS keychain (Priority 7).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PassphraseSource } from "./encryption-types.js";
import { STATE_DIR } from "../config/config.js";
import { SECURITY, PATHS } from "../constants/index.js";

/**
 * Default passphrase environment variable.
 * Re-exported from centralized constants library.
 * @see {@link ../constants/security.ts}
 */
export const DEFAULT_PASSPHRASE_ENV_VAR = SECURITY.PASSPHRASE.ENV_VAR;

/**
 * Default passphrase file location (if user opts for file storage).
 * Computed from state directory + constant filename.
 */
export const DEFAULT_PASSPHRASE_FILE = path.join(STATE_DIR, PATHS.PASSPHRASE.FILENAME);

/**
 * Passphrase manager singleton state.
 */
let cachedPassphrase: string | null = null;
let passphraseSource: PassphraseSource | null = null;

/**
 * Set the passphrase source configuration.
 */
export function setPassphraseSource(source: PassphraseSource): void {
  passphraseSource = source;
  cachedPassphrase = null; // Clear cache when source changes
}

/**
 * Get the current passphrase source.
 */
export function getPassphraseSource(): PassphraseSource | null {
  return passphraseSource;
}

/**
 * Clear cached passphrase (e.g., on logout or security timeout).
 */
export function clearPassphrase(): void {
  cachedPassphrase = null;
}

/**
 * Resolve passphrase from configured source.
 * Caches the passphrase in memory for the session.
 */
export async function resolvePassphrase(params?: {
  source?: PassphraseSource;
  cache?: boolean;
}): Promise<string> {
  const cache = params?.cache ?? true;
  const source = params?.source ?? passphraseSource;

  if (!source) {
    throw new Error(
      "No passphrase source configured. " +
        "Set encryption passphrase via ClosedClaw_PASSPHRASE env var or run 'closedclaw security encrypt --setup'.",
    );
  }

  // Return cached passphrase if available
  if (cache && cachedPassphrase) {
    return cachedPassphrase;
  }

  let passphrase: string;

  switch (source.type) {
    case "env": {
      const value = process.env[source.envVar];
      if (!value) {
        throw new Error(`Passphrase environment variable ${source.envVar} is not set`);
      }
      passphrase = value;
      break;
    }

    case "file": {
      try {
        passphrase = (await fs.readFile(source.path, "utf-8")).trim();
        if (!passphrase) {
          throw new Error("Passphrase file is empty");
        }
      } catch (err) {
        throw new Error(`Failed to read passphrase file ${source.path}: ${err}`, { cause: err });
      }
      break;
    }

    case "prompt": {
      throw new Error(
        "Interactive passphrase prompt not yet implemented. " +
          "Set ClosedClaw_PASSPHRASE environment variable or use passphrase file.",
      );
    }

    case "inline": {
      passphrase = source.value;
      break;
    }

    default: {
      const exhaustive: never = source;
      throw new Error(`Unknown passphrase source type: ${(exhaustive as { type: string }).type}`);
    }
  }

  if (cache) {
    cachedPassphrase = passphrase;
  }

  return passphrase;
}

/**
 * Auto-detect passphrase source from environment.
 */
export function autoDetectPassphraseSource(): PassphraseSource | null {
  // Check default environment variable
  if (process.env[DEFAULT_PASSPHRASE_ENV_VAR]) {
    return { type: "env", envVar: DEFAULT_PASSPHRASE_ENV_VAR };
  }

  // Check for passphrase file (sync check for performance)
  try {
    const fs = require("node:fs");
    if (fs.existsSync(DEFAULT_PASSPHRASE_FILE)) {
      return { type: "file", path: DEFAULT_PASSPHRASE_FILE };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Initialize passphrase source from environment or config.
 * Called at Gateway startup.
 */
export function initPassphraseSource(): void {
  const detected = autoDetectPassphraseSource();
  if (detected) {
    setPassphraseSource(detected);
  }
}

/**
 * Validate passphrase strength.
 * Returns error message if weak, null if acceptable.
 */
export function validatePassphrase(passphrase: string): string | null {
  if (passphrase.length < SECURITY.PASSPHRASE.MIN_LENGTH) {
    return `Passphrase must be at least ${SECURITY.PASSPHRASE.MIN_LENGTH} characters long`;
  }

  // Check for variety (at least 3 character types)
  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasDigit = /[0-9]/.test(passphrase);
  const hasSpecial = /[^a-zA-Z0-9]/.test(passphrase);

  const variety = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (variety < SECURITY.PASSPHRASE.REQUIRED_CHAR_TYPES) {
    return `Passphrase should contain at least ${SECURITY.PASSPHRASE.REQUIRED_CHAR_TYPES} of: lowercase, uppercase, digits, special characters`;
  }

  // Check for common weak patterns (from centralized constants)
  const lower = passphrase.toLowerCase();
  for (const pattern of SECURITY.PASSPHRASE.WEAK_PATTERNS) {
    if (lower.includes(pattern)) {
      return `Passphrase contains common weak pattern: "${pattern}"`;
    }
  }

  return null;
}
