// Stub: iMessage monitoring is not available on Linux.

export type MonitorIMessageOpts = Record<string, unknown>;

export async function monitorIMessageProvider(_opts: MonitorIMessageOpts = {}): Promise<void> {
  throw new Error("iMessage monitoring is not available on Linux");
}
