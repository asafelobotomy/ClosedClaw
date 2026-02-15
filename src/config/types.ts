// Split into focused modules to keep files small and improve edit locality.

export * from "./types.agent-defaults.js";
export * from "./types.agents.js";
export * from "./types.approvals.js";
export * from "./types.auth.js";
export * from "./types.base.js";
export * from "./types.browser.js";
export * from "./types.channels.js";
export * from "./types.closedclaw.js";
export * from "./types.cron.js";
export * from "./types.gateway.js";
export * from "./types.hooks.js";
export * from "./types.messages.js";
export * from "./types.models.js";
export * from "./types.node-host.js";
export * from "./types.plugins.js";
export * from "./types.queue.js";
export * from "./types.sandbox.js";
export * from "./types.security.js";
export * from "./types.skills.js";
export * from "./types.tts.js";
export * from "./types.tools.js";

/**
 * Removed platform type exports (v2026.2 platform removal):
 * All external messaging channel types removed:
 * - types.discord.js, types.imessage.js, types.signal.js
 * - types.slack.js, types.telegram.js, types.whatsapp.js
 * - types.googlechat.js, types.msteams.js (v2026.2.12)
 */
