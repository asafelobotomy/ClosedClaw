/**
 * iMessage send stub (Linux-only build).
 * iMessage is macOS-only; this stub keeps the CliDeps type compilable.
 * Original source archived in archive/platform-apple/src-imessage/send.ts.
 */

export type IMessageSendOpts = {
  cliPath?: string;
  dbPath?: string;
  service?: string;
  region?: string;
  accountId?: string;
  mediaUrl?: string;
  maxBytes?: number;
  timeoutMs?: number;
  chatId?: number;
};

export type IMessageSendResult = {
  messageId: string;
};

export async function sendMessageIMessage(
  _to: string,
  _text: string,
  _opts: IMessageSendOpts = {},
): Promise<IMessageSendResult> {
  throw new Error("iMessage is not available on Linux. This channel requires macOS.");
}
