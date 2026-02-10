import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

// All channels are now handled via the plugin outbound adapter pipeline.
// No per-channel send deps are needed.
export type CliDeps = Record<string, never>;

export function createOutboundSendDeps(_deps: CliDeps): OutboundSendDeps {
  return {};
}
