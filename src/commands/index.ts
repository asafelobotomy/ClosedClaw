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

export { default as agentCommand } from './agent.js';
export { default as agentViaGatewayCommand } from './agent-via-gateway.js';
export { default as agentsCommand } from './agents.js';
export * from './agents.bindings.js';
export * from './agents.command-shared.js';
export * from './agents.commands.add.js';
export * from './agents.commands.delete.js';
export * from './agents.commands.identity.js';
export * from './agents.commands.list.js';
export * from './agents.config.js';
export * from './agents.providers.js';

// ============================================================================
// Authentication & Onboarding Commands
// ============================================================================

export { default as onboardCommand } from './onboard.js';
export { default as onboardAuthCommand } from './onboard-auth.js';
export { default as onboardChannelsCommand } from './onboard-channels.js';
export { default as onboardInteractiveCommand } from './onboard-interactive.js';
export { default as onboardRemoteCommand } from './onboard-remote.js';
export { default as onboardSkillsCommand } from './onboard-skills.js';
export { default as onboardHooksCommand } from './onboard-hooks.js';
export { default as onboardNonInteractiveCommand } from './onboard-non-interactive.js';

export * from './onboard-auth.config-core.js';
export * from './onboard-auth.config-minimax.js';
export * from './onboard-auth.config-opencode.js';
export * from './onboard-auth.credentials.js';
export * from './onboard-auth.models.js';
export * from './onboard-helpers.js';
export * from './onboard-types.js';

export { default as authChoiceCommand } from './auth-choice.js';
export * from './auth-choice-options.js';
export * from './auth-choice-prompt.js';
export * from './auth-choice.api-key.js';
export * from './auth-choice.apply.anthropic.js';
export * from './auth-choice.apply.api-providers.js';
export * from './auth-choice.apply.copilot-proxy.js';
export * from './auth-choice.apply.github-copilot.js';
export * from './auth-choice.apply.google-antigravity.js';
export * from './auth-choice.apply.google-gemini-cli.js';
export * from './auth-choice.apply.minimax.js';
export * from './auth-choice.apply.oauth.js';
export * from './auth-choice.apply.openai.js';
export * from './auth-choice.apply.plugin-provider.js';
export * from './auth-choice.apply.qwen-portal.js';
export * from './auth-choice.apply.js';
export * from './auth-choice.default-model.js';
export * from './auth-choice.model-check.js';
export * from './auth-choice.preferred-provider.js';

export { default as authTokenCommand } from './auth-token.js';
export { default as chutesOauthCommand } from './chutes-oauth.js';
export * from './oauth-env.js';
export * from './oauth-flow.js';

// ============================================================================
// Channel Commands
// ============================================================================

export { default as channelsCommand } from './channels.js';
export { default as signalInstallCommand } from './signal-install.js';

// ============================================================================
// Configuration Commands
// ============================================================================

export { default as configureCommand } from './configure.js';
export { default as configureChannelsCommand } from './configure.channels.js';
export { default as configureCommandsCommand } from './configure.commands.js';
export { default as configureDaemonCommand } from './configure.daemon.js';
export { default as configureGatewayCommand } from './configure.gateway.js';
export { default as configureGatewayAuthCommand } from './configure.gateway-auth.js';
export { default as configureWizardCommand } from './configure.wizard.js';
export * from './configure.shared.js';

// ============================================================================
// Diagnostics & Health Commands
// ============================================================================

export { default as doctorCommand } from './doctor.js';
export * from './doctor-auth.ts';
export * from './doctor-config-flow.js';
export * from './doctor-format.js';
export * from './doctor-gateway-daemon-flow.js';
export * from './doctor-gateway-health.js';
export * from './doctor-gateway-services.js';
export * from './doctor-install.js';
export * from './doctor-legacy-config.js';
export * from './doctor-platform-notes.js';
export * from './doctor-prompter.js';
export * from './doctor-sandbox.js';
export * from './doctor-security.js';
export * from './doctor-state-integrity.js';
export * from './doctor-state-migrations.js';
export * from './doctor-ui.js';
export * from './doctor-update.js';
export * from './doctor-workspace-status.js';
export * from './doctor-workspace.js';

export { default as healthCommand } from './health.js';
export * from './health-format.js';

// ============================================================================
// Gateway & Status Commands
// ============================================================================

export { default as gatewayStatusCommand } from './gateway-status.js';
export { default as statusCommand } from './status.ts';
export { default as statusAllCommand } from './status-all.js';

export * from './status.agent-local.js';
export * from './status.command.js';
export * from './status.daemon.js';
export * from './status.format.js';
export * from './status.gateway-probe.js';
export * from './status.link-channel.js';
export * from './status.scan.js';
export * from './status.summary.js';
export * from './status.types.js';
export * from './status.update.js';

// ============================================================================
// Messaging Commands
// ============================================================================

export { default as messageCommand } from './message.js';
export * from './message-format.js';

// ============================================================================
// Model Commands
// ============================================================================

export { default as modelsCommand } from './models.js';
export * from './model-picker.js';
export * from './google-gemini-model-default.js';
export * from './openai-codex-model-default.js';
export * from './opencode-zen-model-default.js';

// ============================================================================
// Security Commands
// ============================================================================

export { default as keychainCommand } from './keychain.js';
export { default as keysManagementCommand } from './keys-management.js';
export { default as skillSignCommand } from './skill-sign.js';
export { default as auditQueryCommand } from './audit-query.js';
export { default as securityEncryptCommand } from './security-encrypt.js';

// ============================================================================
// Session Commands
// ============================================================================

export { default as sessionsCommand } from './sessions.js';

// ============================================================================
// Sandbox Commands
// ============================================================================

export { default as sandboxCommand } from './sandbox.js';
export * from './sandbox-display.js';
export * from './sandbox-explain.js';
export * from './sandbox-formatters.js';

// ============================================================================
// Daemon & System Commands
// ============================================================================

export * from './daemon-install-helpers.js';
export * from './daemon-runtime.js';
export * from './node-daemon-install-helpers.js';
export * from './node-daemon-runtime.js';
export * from './systemd-linger.js';

// ============================================================================
// Dashboard & Documentation
// ============================================================================

export { default as dashboardCommand } from './dashboard.js';
export { default as docsCommand } from './docs.js';

// ============================================================================
// Utility Commands
// ============================================================================

export { default as setupCommand } from './setup.js';
export { default as resetCommand } from './reset.js';
export { default as uninstallCommand } from './uninstall.js';
export * from './cleanup-utils.js';
