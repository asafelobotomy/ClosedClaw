/**
 * Standardized note types and display helpers for wizard/onboarding flows.
 * Provides consistent visual feedback across all CLI interactions.
 *
 * Usage pattern:
 *   await prompter.note(formatWizardNote(NOTE_TYPES.success, "Auth configured"), "Done");
 *   await prompter.note(...noteSuccess("Configured 2 models", "Ollama"));
 */

// ---------------------------------------------------------------------------
// Note Type Icons (Unicode, terminal-safe)
// ---------------------------------------------------------------------------

/**
 * Icons for different note types. Unicode symbols that render well in most terminals.
 */
export const NOTE_ICONS = {
  success: "✓",
  warning: "⚠",
  error: "✗",
  info: "ℹ",
  tip: "💡",
  progress: "→",
  config: "⚙",
  security: "🔒",
  network: "🌐",
  model: "🤖",
  channel: "📨",
  skip: "─",
} as const;

// ---------------------------------------------------------------------------
// Standardized Note Titles
// ---------------------------------------------------------------------------

/**
 * Standardized titles for common wizard notes.
 * Use these instead of ad-hoc strings for consistency.
 */
export const NOTE_TITLES = {
  // Auth/providers
  modelConfigured: "Model Configured",
  providerReady: "Provider Ready",
  authComplete: "Auth Complete",
  authFailed: "Auth Failed",

  // Status
  success: "Success",
  warning: "Warning",
  error: "Error",
  info: "Info",
  note: "Note",
  tip: "Tip",

  // Process
  skipped: "Skipped",
  cancelled: "Cancelled",
  dryRun: "Dry Run",
  inProgress: "In Progress",

  // Categories
  security: "Security",
  gateway: "Gateway",
  channels: "Channels",
  skills: "Skills",
  hooks: "Hooks",
  workspace: "Workspace",
  config: "Configuration",
  summary: "Summary",
  nextSteps: "Next Steps",

  // Platform
  gpu: "GPU Detected",
  cpuMode: "CPU Mode",
  systemd: "Systemd",
  daemon: "Daemon",
} as const;

export type NoteTitle = (typeof NOTE_TITLES)[keyof typeof NOTE_TITLES];

// ---------------------------------------------------------------------------
// Note Formatting Helpers
// ---------------------------------------------------------------------------

export type NoteType = "success" | "warning" | "error" | "info" | "tip" | "skip";

/**
 * Format a note message with an icon prefix.
 */
export function formatNoteWithIcon(type: NoteType, message: string): string {
  const icons: Record<NoteType, string> = {
    success: NOTE_ICONS.success,
    warning: NOTE_ICONS.warning,
    error: NOTE_ICONS.error,
    info: NOTE_ICONS.info,
    tip: NOTE_ICONS.tip,
    skip: NOTE_ICONS.skip,
  };
  return `${icons[type]} ${message}`;
}

/**
 * Create a success note tuple [message, title] for use with prompter.note().
 */
export function noteSuccess(message: string, context?: string): [string, string] {
  const formatted = formatNoteWithIcon("success", message);
  return [formatted, context ?? NOTE_TITLES.success];
}

/**
 * Create a warning note tuple [message, title] for use with prompter.note().
 */
export function noteWarning(message: string, context?: string): [string, string] {
  const formatted = formatNoteWithIcon("warning", message);
  return [formatted, context ?? NOTE_TITLES.warning];
}

/**
 * Create an error note tuple [message, title] for use with prompter.note().
 */
export function noteError(message: string, context?: string): [string, string] {
  const formatted = formatNoteWithIcon("error", message);
  return [formatted, context ?? NOTE_TITLES.error];
}

/**
 * Create an info note tuple [message, title] for use with prompter.note().
 */
export function noteInfo(message: string, context?: string): [string, string] {
  const formatted = formatNoteWithIcon("info", message);
  return [formatted, context ?? NOTE_TITLES.info];
}

/**
 * Create a skipped note tuple [message, title] for use with prompter.note().
 */
export function noteSkipped(message: string, context?: string): [string, string] {
  const formatted = formatNoteWithIcon("skip", message);
  return [formatted, context ?? NOTE_TITLES.skipped];
}

// ---------------------------------------------------------------------------
// Summary Note Helpers
// ---------------------------------------------------------------------------

export type SummaryItem = {
  label: string;
  value: string;
  icon?: keyof typeof NOTE_ICONS;
};

/**
 * Format a list of summary items into a consistent multi-line string.
 */
export function formatSummary(items: SummaryItem[]): string {
  const maxLabelLen = Math.max(...items.map((item) => item.label.length));
  return items
    .map((item) => {
      const icon = item.icon ? `${NOTE_ICONS[item.icon]} ` : "";
      const padding = " ".repeat(maxLabelLen - item.label.length);
      return `${icon}${item.label}:${padding} ${item.value}`;
    })
    .join("\n");
}

/**
 * Create a model configuration summary.
 */
export function formatModelSummary(options: {
  provider: string;
  models: string[];
  defaultModel?: string;
  contextWindow?: number;
  isLocal?: boolean;
}): string {
  const items: SummaryItem[] = [
    { label: "Provider", value: options.provider, icon: "model" },
    {
      label: "Models",
      value: options.models.length === 1 ? options.models[0] : `${options.models.length} configured`,
    },
  ];

  if (options.defaultModel) {
    items.push({ label: "Default", value: options.defaultModel });
  }

  if (options.contextWindow) {
    items.push({ label: "Context", value: `${options.contextWindow.toLocaleString()} tokens` });
  }

  if (options.isLocal !== undefined) {
    items.push({
      label: "Location",
      value: options.isLocal ? "Local" : "Cloud",
      icon: options.isLocal ? "config" : "network",
    });
  }

  return formatSummary(items);
}

/**
 * Create a GPU/hardware summary for local models.
 */
export function formatHardwareSummary(options: {
  gpuName?: string;
  vramGb?: number;
  cpuMode?: boolean;
}): string {
  if (options.cpuMode || !options.gpuName) {
    return formatNoteWithIcon("warning", "No GPU detected. Models will run on CPU (slower).");
  }

  const vramStr = options.vramGb ? ` (${options.vramGb.toFixed(1)}GB VRAM)` : "";
  return formatNoteWithIcon("success", `${options.gpuName}${vramStr}`);
}

// ---------------------------------------------------------------------------
// Progress Message Helpers
// ---------------------------------------------------------------------------

/**
 * Standardized progress message formats.
 */
export const PROGRESS_MESSAGES = {
  authStarting: (provider: string) => `Starting ${provider} authentication…`,
  authComplete: (provider: string) => `${provider} authentication complete`,
  oauthStarting: "Starting OAuth flow…",
  oauthWaiting: "Waiting for browser authorization…",
  oauthComplete: "OAuth authorization received",
  deviceCodeWaiting: "Waiting for device authorization…",
  modelDownloading: (model: string) => `Downloading ${model}…`,
  configSaving: "Saving configuration…",
  healthChecking: "Checking gateway health…",
  gatewayStarting: "Starting gateway…",
  gatewayRestarting: "Restarting gateway…",
  daemonInstalling: "Installing daemon…",
} as const;

// ---------------------------------------------------------------------------
// Onboarding Step Helpers
// ---------------------------------------------------------------------------

/**
 * Format a step label with progress indicator.
 * Example: "[2/5 · 40%] Configure Model"
 */
export function formatStepLabel(current: number, total: number, title: string): string {
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  return `[${current}/${total} · ${percent}%] ${title}`;
}

/**
 * Common step titles for onboarding.
 */
export const STEP_TITLES = {
  mode: "Onboarding mode",
  deploymentType: "Deployment type",
  configHandling: "Config handling",
  gatewaySetup: "Gateway setup",
  modelAuth: "Model provider",
  channels: "Channels",
  skills: "Skills",
  hooks: "Hooks",
  daemon: "Daemon",
  healthCheck: "Health check",
  finish: "Finish",
} as const;
