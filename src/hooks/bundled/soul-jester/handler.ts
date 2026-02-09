import { isSubagentSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";
import { isAgentBootstrapEvent, type HookHandler } from "../../hooks.js";
import { applySoulJesterOverride, resolveSoulJesterConfigFromHook } from "../../soul-jester.js";

const HOOK_KEY = "soul-jester";

const soulJesterHook: HookHandler = async (event) => {
  if (!isAgentBootstrapEvent(event)) {
    return;
  }

  const context = event.context;
  if (context.sessionKey && isSubagentSessionKey(context.sessionKey)) {
    return;
  }
  const cfg = context.cfg;
  const hookConfig = resolveHookConfig(cfg, HOOK_KEY);
  if (!hookConfig || hookConfig.enabled === false) {
    return;
  }

  const soulConfig = resolveSoulJesterConfigFromHook(hookConfig as Record<string, unknown>, {
    warn: (message) => console.warn(`[soul-jester] ${message}`),
  });
  if (!soulConfig) {
    return;
  }

  const workspaceDir = context.workspaceDir;
  if (!workspaceDir || !Array.isArray(context.bootstrapFiles)) {
    return;
  }

  const updated = await applySoulJesterOverride({
    files: context.bootstrapFiles,
    workspaceDir,
    config: soulConfig,
    userTimezone: cfg?.agents?.defaults?.userTimezone,
    log: {
      warn: (message) => console.warn(`[soul-jester] ${message}`),
      debug: (message) => console.debug?.(`[soul-jester] ${message}`),
    },
  });

  context.bootstrapFiles = updated;
};

export default soulJesterHook;
