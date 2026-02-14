import { TTL_RECENT_WEB_MESSAGE_MS } from "../../config/constants/index.js";
import { createDedupeCache } from "../../infra/dedupe.js";

const RECENT_WEB_MESSAGE_TTL_MS = TTL_RECENT_WEB_MESSAGE_MS;
const RECENT_WEB_MESSAGE_MAX = 5000;

const recentInboundMessages = createDedupeCache({
  ttlMs: RECENT_WEB_MESSAGE_TTL_MS,
  maxSize: RECENT_WEB_MESSAGE_MAX,
});

export function resetWebInboundDedupe(): void {
  recentInboundMessages.clear();
}

export function isRecentInboundMessage(key: string): boolean {
  return recentInboundMessages.check(key);
}
