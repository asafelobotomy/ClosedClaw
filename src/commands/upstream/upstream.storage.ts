import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const UPSTREAM_TRACKING_FILE = ".closedclaw/upstream-tracking.json5";
const UPSTREAM_CONFIG_FILE = ".closedclaw/upstream-config.json5";

export async function getUpstreamTrackingPath(): Promise<string> {
  return path.join(homedir(), UPSTREAM_TRACKING_FILE);
}

export async function getUpstreamConfigPath(): Promise<string> {
  return path.join(homedir(), UPSTREAM_CONFIG_FILE);
}

export async function loadUpstreamTracking<T>(defaultValue: T): Promise<T> {
  try {
    const trackingPath = await getUpstreamTrackingPath();
    const content = await fs.readFile(trackingPath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

export async function saveUpstreamTracking<T>(data: T): Promise<void> {
  const trackingPath = await getUpstreamTrackingPath();
  await fs.mkdir(path.dirname(trackingPath), { recursive: true });
  await fs.writeFile(trackingPath, JSON.stringify(data, null, 2), "utf-8");
}

export async function loadUpstreamConfig<T>(defaultValue: T): Promise<T> {
  try {
    const configPath = await getUpstreamConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

export async function saveUpstreamConfig<T>(data: T): Promise<void> {
  const configPath = await getUpstreamConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(data, null, 2), "utf-8");
}
