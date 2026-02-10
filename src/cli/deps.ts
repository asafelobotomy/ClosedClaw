import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

// GTK GUI: outbound send is handled via the channel plugin outbound adapter
// (extensions/gtk-gui/src/channel.ts) and does not need a dedicated CliDeps entry
// since it flows through the standard plugin outbound pipeline (loadChannelOutboundAdapter).
//
// All third-party channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage)
// have been archived. CliDeps is kept as an empty shell for compatibility.

export type CliDeps = Record<string, never>;

export function createDefaultDeps(): CliDeps {
  return {};
}

// All channel outbound now flows through the plugin outbound adapter pipeline.
// No per-channel send deps are needed.
export function createOutboundSendDeps(_deps: CliDeps): OutboundSendDeps {
  return {};
}
