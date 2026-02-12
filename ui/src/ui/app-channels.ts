import type { ClosedClawApp } from "./app";
import { loadChannels } from "./controllers/channels";
import { loadConfig, saveConfig } from "./controllers/config";

export async function handleChannelConfigSave(host: ClosedClawApp) {
  await saveConfig(host);
  await loadConfig(host);
  await loadChannels(host, true);
}

export async function handleChannelConfigReload(host: ClosedClawApp) {
  await loadConfig(host);
  await loadChannels(host, true);
}
