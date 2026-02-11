import type { ClosedClawConfig } from "../config/config.js";

/**
 * Legacy WhatsApp config migration removed in v2026.2 (platform removal).
 * WhatsApp channel has been removed from ClosedClaw.
 */
export function normalizeLegacyConfigValues(cfg: ClosedClawConfig): {
  config: ClosedClawConfig;
  changes: string[];
} {
  // No legacy migrations needed - all removed platforms clean.
  return { config: cfg, changes: [] };
}
