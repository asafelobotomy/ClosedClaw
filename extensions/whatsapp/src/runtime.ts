/**
 * Test shim — the WhatsApp channel extension was archived.
 */
import type { PluginRuntime } from "../../../src/plugins/runtime/index.js";

let _runtime: PluginRuntime | undefined;

export function setWhatsAppRuntime(rt: PluginRuntime) {
  _runtime = rt;
}

export function getWhatsAppRuntime(): PluginRuntime | undefined {
  return _runtime;
}
