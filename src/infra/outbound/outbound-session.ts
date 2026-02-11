import type { MsgContext } from "../../auto-reply/templating.js";
import type { ChannelId } from "../../channels/plugins/types.js";
import type { ClosedClawConfig } from "../../config/config.js";
import type { ResolvedMessagingTarget } from "./target-resolver.js";
import { getChannelPlugin } from "../../channels/plugins/index.js";
import { recordSessionMetaFromInbound, resolveStorePath } from "../../config/sessions.js";
import {
  buildAgentSessionKey,
  type RoutePeer,
  type RoutePeerKind,
} from "../../routing/resolve-route.js";
import { resolveThreadSessionKeys } from "../../routing/session-key.js";

export type OutboundSessionRoute = {
  sessionKey: string;
  baseSessionKey: string;
  peer: RoutePeer;
  chatType: "direct" | "group" | "channel";
  from: string;
  to: string;
  threadId?: string | number;
};

export type ResolveOutboundSessionRouteParams = {
  cfg: ClosedClawConfig;
  channel: ChannelId;
  agentId: string;
  accountId?: string | null;
  target: string;
  resolvedTarget?: ResolvedMessagingTarget;
  replyToId?: string | null;
  threadId?: string | number | null;
};

function stripProviderPrefix(raw: string, channel: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const prefix = `${channel.toLowerCase()}:`;
  if (lower.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

function stripKindPrefix(raw: string): string {
  return raw.replace(/^(user|channel|group|conversation|room|dm):/i, "").trim();
}

function inferPeerKind(params: {
  channel: ChannelId;
  resolvedTarget?: ResolvedMessagingTarget;
}): RoutePeerKind {
  const resolvedKind = params.resolvedTarget?.kind;
  if (resolvedKind === "user") {
    return "dm";
  }
  if (resolvedKind === "channel") {
    return "channel";
  }
  if (resolvedKind === "group") {
    const plugin = getChannelPlugin(params.channel);
    const chatTypes = plugin?.capabilities?.chatTypes ?? [];
    const supportsChannel = chatTypes.includes("channel");
    const supportsGroup = chatTypes.includes("group");
    if (supportsChannel && !supportsGroup) {
      return "channel";
    }
    return "group";
  }
  return "dm";
}

function buildBaseSessionKey(params: {
  cfg: ClosedClawConfig;
  agentId: string;
  channel: ChannelId;
  accountId?: string | null;
  peer: RoutePeer;
}): string {
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: params.channel,
    accountId: params.accountId,
    peer: params.peer,
    dmScope: params.cfg.session?.dmScope ?? "main",
    identityLinks: params.cfg.session?.identityLinks,
  });
}

// All channel-specific session resolvers removed (third-party channels archived).
// Every channel now uses the generic fallback resolver which handles common
// target patterns: kind prefixes (channel:/group:/user:), Telegram-style
// topic syntax (-digits:topic:N), and chat_guid/chat_id prefixes.

const TOPIC_RE = /^(-?\d+):topic:(\d+)$/i;
const CHAT_PREFIX_RE = /^chat_(guid|id|identifier):/i;
const KIND_PREFIX_RE = /^(channel|group|user|dm):/i;

function resolveFallbackSession(
  params: ResolveOutboundSessionRouteParams,
): OutboundSessionRoute | null {
  const trimmed = stripProviderPrefix(params.target, params.channel).trim();
  if (!trimmed) {
    return null;
  }

  let targetBody = trimmed;
  let parsedKind: RoutePeerKind | undefined;
  let parsedTopicId: number | undefined;

  // Detect kind prefix: "channel:X", "group:X", "user:X", "dm:X"
  const kindMatch = KIND_PREFIX_RE.exec(targetBody);
  if (kindMatch) {
    const prefix = kindMatch[1]!.toLowerCase();
    parsedKind = prefix === "channel" ? "channel" : prefix === "group" ? "group" : "dm";
    targetBody = targetBody.slice(kindMatch[0].length);
  }

  // Detect chat_guid/chat_id/chat_identifier prefix (e.g. BlueBubbles) → group
  const chatPrefixMatch = CHAT_PREFIX_RE.exec(targetBody);
  if (chatPrefixMatch) {
    parsedKind = "group";
    targetBody = targetBody.slice(chatPrefixMatch[0].length);
  }

  // Detect Telegram-style topic: "-digits:topic:N"
  const topicMatch = TOPIC_RE.exec(targetBody);
  if (topicMatch) {
    targetBody = topicMatch[1]!;
    parsedTopicId = Number(topicMatch[2]);
    if (!parsedKind) {
      parsedKind = "group";
    }
  }

  if (!targetBody) {
    return null;
  }

  // Determine peer kind: resolvedTarget takes priority over parsed prefix
  const resolvedKind = params.resolvedTarget?.kind;
  let peerKind: RoutePeerKind;
  if (resolvedKind === "user") {
    peerKind = "dm";
  } else if (resolvedKind === "channel") {
    peerKind = "channel";
  } else if (resolvedKind === "group") {
    const plugin = getChannelPlugin(params.channel);
    const chatTypes = plugin?.capabilities?.chatTypes ?? [];
    const supportsChannel = chatTypes.includes("channel");
    const supportsGroup = chatTypes.includes("group");
    peerKind = supportsChannel && !supportsGroup ? "channel" : "group";
  } else if (parsedKind) {
    peerKind = parsedKind;
  } else {
    peerKind = "dm";
  }

  const peerId = targetBody;
  const peer: RoutePeer = { kind: peerKind, id: peerId };
  const baseSessionKey = buildBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    channel: params.channel,
    peer,
  });

  // Thread handling: topic from target, or explicit threadId/replyToId
  let sessionKey: string;
  const effectiveThreadId: string | number | undefined =
    parsedTopicId ?? params.threadId ?? params.replyToId ?? undefined;

  if (parsedTopicId != null) {
    // Use :topic: suffix for Telegram-style topics
    sessionKey = `${baseSessionKey}:topic:${parsedTopicId}`;
  } else {
    const resolved = resolveThreadSessionKeys({
      baseSessionKey,
      threadId: effectiveThreadId != null ? String(effectiveThreadId) : undefined,
    });
    sessionKey = resolved.sessionKey;
  }

  const chatType = peerKind === "dm" ? "direct" : peerKind === "channel" ? "channel" : "group";

  let from: string;
  if (peerKind === "dm") {
    from = `${params.channel}:${peerId}`;
  } else if (parsedTopicId != null) {
    from = `${params.channel}:${peerKind}:${peerId}:topic:${parsedTopicId}`;
  } else {
    from = `${params.channel}:${peerKind}:${peerId}`;
  }

  const toPrefix = peerKind === "dm" ? "user" : "channel";
  return {
    sessionKey,
    baseSessionKey,
    peer,
    chatType,
    from,
    to: `${toPrefix}:${peerId}`,
    threadId: effectiveThreadId,
  };
}

export async function resolveOutboundSessionRoute(
  params: ResolveOutboundSessionRouteParams,
): Promise<OutboundSessionRoute | null> {
  const target = params.target.trim();
  if (!target) {
    return null;
  }
  // All channel-specific resolvers removed; use generic fallback for all channels.
  return resolveFallbackSession({ ...params, target });
}

export async function ensureOutboundSessionEntry(params: {
  cfg: ClosedClawConfig;
  agentId: string;
  channel: ChannelId;
  accountId?: string | null;
  route: OutboundSessionRoute;
}): Promise<void> {
  const storePath = resolveStorePath(params.cfg.session?.store, {
    agentId: params.agentId,
  });
  const ctx: MsgContext = {
    From: params.route.from,
    To: params.route.to,
    SessionKey: params.route.sessionKey,
    AccountId: params.accountId ?? undefined,
    ChatType: params.route.chatType,
    Provider: params.channel,
    Surface: params.channel,
    MessageThreadId: params.route.threadId,
    OriginatingChannel: params.channel,
    OriginatingTo: params.route.to,
  };
  try {
    await recordSessionMetaFromInbound({
      storePath,
      sessionKey: params.route.sessionKey,
      ctx,
    });
  } catch {
    // Do not block outbound sends on session meta writes.
  }
}
