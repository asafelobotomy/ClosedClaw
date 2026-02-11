/**
 * Test shim — the Signal channel extension was archived.
 */
import type { PluginRuntime } from "../../../src/plugins/runtime/index.js";

let _runtime: PluginRuntime | undefined;

export function setSignalRuntime(rt: PluginRuntime) {
  _runtime = rt;
}

export function getSignalRuntime(): PluginRuntime | undefined {
  return _runtime;
}
