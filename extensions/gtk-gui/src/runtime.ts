import type { PluginRuntimeApi } from "ClosedClaw/plugin-sdk";

let gtkRuntime: PluginRuntimeApi | undefined;

export function setGtkRuntime(runtime: PluginRuntimeApi): void {
  gtkRuntime = runtime;
}

export function getGtkRuntime(): PluginRuntimeApi {
  if (!gtkRuntime) {
    throw new Error("GTK GUI runtime not initialized");
  }
  return gtkRuntime;
}
