// Stub: iMessage probing is not available on Linux.

export type IMessageProbe = {
  ok: boolean;
  error?: string | null;
  fatal?: boolean;
};

export type IMessageProbeOptions = {
  cliPath?: string;
  dbPath?: string;
};

export async function probeIMessage(
  _timeoutMs = 2000,
  _opts: IMessageProbeOptions = {},
): Promise<IMessageProbe> {
  return { ok: false, error: "iMessage is not available on Linux", fatal: true };
}
