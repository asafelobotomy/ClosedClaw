/**
 * iMessage target parsing stubs (Linux-only build).
 * iMessage is macOS-only; these stubs keep the channel routing compilable.
 * Original source archived in archive/platform-apple/src-imessage/targets.ts.
 */
import { normalizeE164 } from "../utils.js";

export type IMessageService = "imessage" | "sms" | "auto";

export type IMessageTarget =
  | { kind: "chat_id"; chatId: number }
  | { kind: "chat_guid"; chatGuid: string }
  | { kind: "chat_identifier"; chatIdentifier: string }
  | { kind: "handle"; to: string; service: IMessageService };

export type IMessageAllowTarget =
  | { kind: "chat_id"; chatId: number }
  | { kind: "chat_guid"; chatGuid: string }
  | { kind: "chat_identifier"; chatIdentifier: string }
  | { kind: "handle"; handle: string };

export function normalizeIMessageHandle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (/^\+?\d[\d\s()-]+$/.test(trimmed)) {
    return normalizeE164(trimmed) || trimmed;
  }
  return trimmed.toLowerCase();
}

export function parseIMessageTarget(raw: string): IMessageTarget {
  const trimmed = raw.trim();
  if (trimmed.startsWith("chat_id:") || trimmed.startsWith("chatid:") || trimmed.startsWith("chat:")) {
    const id = Number.parseInt(trimmed.replace(/^[^:]+:/, "").trim(), 10);
    if (Number.isFinite(id)) {
      return { kind: "chat_id", chatId: id };
    }
  }
  return { kind: "handle", to: trimmed, service: "auto" };
}

export function parseIMessageAllowTarget(raw: string): IMessageAllowTarget {
  const trimmed = raw.trim();
  return { kind: "handle", handle: normalizeIMessageHandle(trimmed) };
}

export function isAllowedIMessageSender(_params: {
  from: string;
  allowTargets: IMessageAllowTarget[];
}): boolean {
  return false;
}

export function formatIMessageChatTarget(chatId?: number | null): string {
  if (chatId == null) {
    return "";
  }
  return `chat_id:${chatId}`;
}
