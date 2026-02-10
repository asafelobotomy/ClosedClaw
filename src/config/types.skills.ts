export type SkillConfig = {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
};

export type SkillsLoadConfig = {
  /**
   * Additional skill folders to scan (lowest precedence).
   * Each directory should contain skill subfolders with `SKILL.md`.
   */
  extraDirs?: string[];
  /** Watch skill folders for changes and refresh the skills snapshot. */
  watch?: boolean;
  /** Debounce for the skills watcher (ms). */
  watchDebounceMs?: number;
};

export type SkillsInstallConfig = {
  preferBrew?: boolean;
  nodeManager?: "npm" | "pnpm" | "yarn" | "bun";
};

export type SkillsSecurityConfig = {
  /**
   * Require cryptographic signatures for skill installation.
   *
   * When enabled:
   * - Skills must have a valid `.sig` file signed by a trusted key
   * - Installation fails if signature is missing or invalid
   * - Protects against supply chain attacks
   *
   * Default: false (for backward compatibility; will be true in future versions)
   */
  requireSignature?: boolean;

  /**
   * Prompt for confirmation when installing unsigned skills.
   * Only relevant if requireSignature is false.
   *
   * Default: true
   */
  promptOnUnsigned?: boolean;

  /**
   * Minimum trust level required for skill signatures.
   * Keys with lower trust levels will be rejected.
   *
   * Options:
   * - "full": Only fully trusted keys accepted
   * - "marginal": Both full and marginal trust accepted
   *
   * Default: "marginal"
   */
  minTrustLevel?: "full" | "marginal";
};

export type SkillsConfig = {
  /** Optional bundled-skill allowlist (only affects bundled skills). */
  allowBundled?: string[];
  load?: SkillsLoadConfig;
  install?: SkillsInstallConfig;
  security?: SkillsSecurityConfig;
  entries?: Record<string, SkillConfig>;
};
