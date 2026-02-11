// Split into focused modules to keep files small and improve edit locality.

export * from "./types.agent-defaults.js";
export * from "./types.agents.js";
export * from "./types.approvals.js";
export * from "./types.auth.js";
export * from "./types.base.js";
export * from "./types.browser.js";
export * from "./types.channels.js";
export * from "./types.openclaw.js";
export * from "./types.cron.js";
export * from "./types.googlechat.js";
export * from "./types.gateway.js";
export * from "./types.hooks.js";
export * from "./types.messages.js";
export * from "./types.models.js";
export * from "./types.node-host.js";
export * from "./types.msteams.js";
export * from "./types.plugins.js";
export * from "./types.queue.js";
export * from "./types.sandbox.js";
export * from "./types.skills.js";
export * from "./types.tts.js";
export * from "./types.tools.js";

/**
 * Removed platform type exports (v2026.2 platform removal):
 * - types.discord.js (Discord channel removed)
 * - types.imessage.js (iMessage channel removed)
 * - types.signal.js (Signal channel removed)
 * - types.slack.js (Slack channel removed)
 * - types.telegram.js (Telegram channel removed)
 * - types.whatsapp.js (WhatsApp channel removed)
 */
