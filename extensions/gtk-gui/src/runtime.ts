import type { PluginRuntime } from "ClosedClaw/plugin-sdk";

let gtkRuntime: PluginRuntime | undefined;

export function setGtkRuntime(runtime: PluginRuntime): void {
  gtkRuntime = runtime;
}

export function getGtkRuntime(): PluginRuntime {
  if (!gtkRuntime) {
    throw new Error("GTK GUI runtime not initialized");
  }
  return gtkRuntime;
}
