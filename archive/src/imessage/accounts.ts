/**
 * iMessage account resolution stubs (Linux-only build).
 * iMessage is macOS-only; these stubs keep the channel routing framework compilable.
 * Original source archived in archive/platform-apple/src-imessage/accounts.ts.
 */
import type { ClosedClawConfig } from "../config/config.js";
import type { IMessageAccountConfig } from "../config/types.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";

export type ResolvedIMessageAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  config: IMessageAccountConfig;
  configured: boolean;
};

export function listIMessageAccountIds(_cfg: ClosedClawConfig): string[] {
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultIMessageAccountId(_cfg: ClosedClawConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function resolveIMessageAccount(params: {
  cfg: ClosedClawConfig;
  accountId?: string | null;
}): ResolvedIMessageAccount {
  const accountId = normalizeAccountId(params.accountId);
  return {
    accountId,
    enabled: false,
    config: {} as IMessageAccountConfig,
    configured: false,
  };
}

export function listEnabledIMessageAccounts(_cfg: ClosedClawConfig): ResolvedIMessageAccount[] {
  return [];
}
