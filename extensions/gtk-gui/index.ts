/**
 * GTK GUI Channel Plugin Entry Point
 * 
 * This plugin provides a custom channel for communicating with a GTK GUI
 * desktop application on Linux. It uses Unix sockets or file-based IPC.
 * 
 * Configuration (in config.json5):
 * {
 *   plugins: {
 *     entries: {
 *       "gtk-gui": {
 *         enabled: true,
 *         config: {
 *           socketPath: "/tmp/closedclaw-gtk.sock",
 *           // OR file-based:
 *           // inboxPath: "/tmp/closedclaw-gtk/inbox.jsonl",
 *           // outboxPath: "/tmp/closedclaw-gtk/outbox.jsonl",
 *           userId: "desktop-user"
 *         }
 *       }
 *     }
 *   }
 * }
 */

import type { ClosedClawPluginApi } from "ClosedClaw/plugin-sdk";
import { emptyPluginConfigSchema } from "ClosedClaw/plugin-sdk";
import { gtkGuiPlugin } from "./src/channel.js";
import { setGtkRuntime } from "./src/runtime.js";

const plugin = {
  id: "gtk-gui",
  name: "GTK GUI",
  description: "Custom GTK GUI channel for Linux desktop applications",
  configSchema: emptyPluginConfigSchema(),
  
  register(api: ClosedClawPluginApi) {
    setGtkRuntime(api.runtime);
    api.registerChannel({ plugin: gtkGuiPlugin });
    
    api.log?.info?.("GTK GUI channel plugin registered");
  },
};

export default plugin;
