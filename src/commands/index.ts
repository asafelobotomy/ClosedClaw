/**
 * Commands Barrel Export
 *
 * Centralized exports for all CLI commands. Import from here instead of deep paths:
 *
 * ```typescript
 * import { agentCommand, onboardCommand, doctorCommand } from '@/commands';
 * ```
 *
 * Commands are organized by category for better discoverability.
 */

// ============================================================================
// Agent Commands
// ============================================================================

export * from "./agent.js";
export * from "./agent-via-gateway.js";
export * from "./agents.js";
export * from "./agents.bindings.js";
export * from "./agents.command-shared.js";
export * from "./agents.commands.add.js";
export * from "./agents.commands.delete.js";
export * from "./agents.commands.identity.js";
export * from "./agents.commands.list.js";
export * from "./agents.config.js";
export * from "./agents.providers.js";

// ============================================================================
// Authentication & Onboarding Commands
// ============================================================================

export * from "./onboard.js";
export * from "./onboard-auth.js";
export * from "./onboard-channels.js";
export * from "./onboard-interactive.js";
export * from "./onboard-remote.js";
export * from "./onboard-skills.js";
export * from "./onboard-hooks.js";
export * from "./onboard-non-interactive.js";

export * from "./onboard-auth.config-core.js";
export * from "./onboard-auth.config-minimax.js";
export * from "./onboard-auth.config-opencode.js";
export * from "./onboard-auth.credentials.js";
export * from "./onboard-auth.models.js";
export * from "./onboard-helpers.js";
export * from "./onboard-types.js";

export * from "./auth-choice.js";
export * from "./auth-choice-options.js";
export * from "./auth-choice-prompt.js";
export * from "./auth-choice.api-key.js";
export * from "./auth-choice.apply.anthropic.js";
export * from "./auth-choice.apply.api-providers.js";
export * from "./auth-choice.apply.copilot-proxy.js";
export * from "./auth-choice.apply.github-copilot.js";
export * from "./auth-choice.apply.google-antigravity.js";
export * from "./auth-choice.apply.google-gemini-cli.js";
export * from "./auth-choice.apply.minimax.js";
export * from "./auth-choice.apply.oauth.js";
export * from "./auth-choice.apply.openai.js";
export * from "./auth-choice.apply.plugin-provider.js";
export * from "./auth-choice.apply.qwen-portal.js";
export * from "./auth-choice.apply.js";
export * from "./auth-choice.default-model.js";
export * from "./auth-choice.model-check.js";
export * from "./auth-choice.preferred-provider.js";

export * from "./auth-token.js";
export * from "./chutes-oauth.js";
export * from "./oauth-env.js";
export * from "./oauth-flow.js";

// ============================================================================
// Channel Commands
// ============================================================================

export * from "./channels.js";
export * from "./signal-install.js";

// ============================================================================
// Configuration Commands
// ============================================================================

export * from "./configure.js";
export * from "./configure.channels.js";
export * from "./configure.commands.js";
export * from "./configure.daemon.js";
export * from "./configure.gateway.js";
export * from "./configure.gateway-auth.js";
export * from "./configure.wizard.js";
export * from "./configure.shared.js";

// ============================================================================
// Diagnostics & Health Commands
// ============================================================================

export * from "./doctor.js";
export * from "./doctor-auth.js";
export * from "./doctor-config-flow.js";
export * from "./doctor-format.js";
export * from "./doctor-gateway-daemon-flow.js";
export * from "./doctor-gateway-health.js";
export * from "./doctor-gateway-services.js";
export * from "./doctor-install.js";
export * from "./doctor-legacy-config.js";
export * from "./doctor-platform-notes.js";
export * from "./doctor-prompter.js";
export * from "./doctor-sandbox.js";
export * from "./doctor-security.js";
export * from "./doctor-state-integrity.js";
export * from "./doctor-state-migrations.js";
export * from "./doctor-ui.js";
export * from "./doctor-update.js";
export * from "./doctor-workspace-status.js";
export * from "./doctor-workspace.js";

export * from "./health.js";
export * from "./health-format.js";

// ============================================================================
// Gateway & Status Commands
// ============================================================================

export * from "./gateway-status.js";
export * from "./status.js";
export * from "./status-all.js";

export * from "./status.agent-local.js";
export * from "./status.command.js";
export * from "./status.daemon.js";
export * from "./status.format.js";
export * from "./status.gateway-probe.js";
export * from "./status.link-channel.js";
export * from "./status.scan.js";
export * from "./status.summary.js";
export * from "./status.types.js";
export * from "./status.update.js";

// ============================================================================
// Messaging Commands
// ============================================================================

export * from "./message.js";
export * from "./message-format.js";

// ============================================================================
// Model Commands
// ============================================================================

export * from "./models.js";
export * from "./model-picker.js";
export * from "./google-gemini-model-default.js";
export * from "./openai-codex-model-default.js";
export * from "./opencode-zen-model-default.js";

// ============================================================================
// Security Commands
// ============================================================================

export * from "./keychain.js";
export * from "./keys-management.js";
export * from "./skill-sign.js";
export * from "./audit-query.js";
export * from "./security-encrypt.js";

// ============================================================================
// Session Commands
// ============================================================================

export * from "./sessions.js";

// ============================================================================
// Sandbox Commands
// ============================================================================

export * from "./sandbox.js";
export * from "./sandbox-display.js";
export * from "./sandbox-explain.js";
export {
  formatStatus,
  formatSimpleStatus,
  formatImageMatch,
  type ContainerItem,
  countRunning,
  countMismatches,
} from "./sandbox-formatters.js";

// ============================================================================
// Daemon & System Commands
// ============================================================================

export * from "./daemon-install-helpers.js";
export * from "./daemon-runtime.js";
export * from "./node-daemon-install-helpers.js";
export * from "./node-daemon-runtime.js";
export * from "./systemd-linger.js";

// ============================================================================
// Dashboard & Documentation
// ============================================================================

export * from "./dashboard.js";
export * from "./docs.js";

// ============================================================================
// Utility Commands
// ============================================================================

export * from "./setup.js";
export * from "./reset.js";
export * from "./uninstall.js";
export * from "./cleanup-utils.js";
