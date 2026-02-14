/**
 * Audit hooks for logging security-relevant events.
 *
 * Provides centralized logging for all critical operations:
 * - Tool executions (shell commands, file operations)
 * - Configuration changes
 * - Skill/plugin installations
 * - Credential access
 * - Channel message sends
 * - Network egress events
 *
 * @see {@link /docs/security/audit-logging.md Audit Logging Documentation}
 */

import { resolveStateDir } from "../config/paths.js";
import { logDebug, logWarn } from "../logger.js";
import {
  AuditLogger,
  getAuditLogPath,
  type AuditEventType,
  type AuditSeverity,
} from "../security/audit-logger.js";

// ---------------------------------------------------------------------------
// Singleton Audit Logger
// ---------------------------------------------------------------------------

let _auditLogger: AuditLogger | null = null;
let _initializationPromise: Promise<void> | null = null;

/**
 * Get or create the global audit logger instance.
 * Automatically creates and initializes the logger on first access.
 */
async function getAuditLogger(): Promise<AuditLogger | null> {
  if (_auditLogger) {
    return _auditLogger;
  }

  // Prevent concurrent initialization
  if (_initializationPromise) {
    await _initializationPromise;
    return _auditLogger;
  }

  _initializationPromise = (async () => {
    try {
      const logPath = getAuditLogPath(resolveStateDir());
      _auditLogger = new AuditLogger(logPath);
      await _auditLogger.init();
      logDebug(`Audit logger initialized: ${logPath}`);
    } catch (err) {
      logWarn(`Failed to initialize audit logger: ${(err as Error).message}`);
      _auditLogger = null;
    } finally {
      _initializationPromise = null;
    }
  })();

  await _initializationPromise;
  return _auditLogger;
}

/**
 * Close the global audit logger (flush pending writes).
 * Called during graceful shutdown.
 */
export async function closeAuditLogger(): Promise<void> {
  if (_auditLogger) {
    await _auditLogger.close();
    _auditLogger = null;
  }
}

// ---------------------------------------------------------------------------
// Audit Event Logging
// ---------------------------------------------------------------------------

/**
 * Log a tool execution event.
 */
export async function logToolExecution(opts: {
  tool: string;
  command?: string;
  args?: Record<string, unknown>;
  result?: "success" | "failure";
  error?: string;
  actor?: string;
  session?: string;
  channel?: string;
  exitCode?: number;
  duration?: number;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const severity: AuditSeverity =
    opts.result === "failure"
      ? "warn"
      : opts.tool === "bash" || opts.tool === "exec"
        ? "info"
        : "info";

  const summary = opts.command
    ? `Tool: ${opts.tool} | Command: ${opts.command.slice(0, 100)}${opts.command.length > 100 ? "…" : ""}`
    : `Tool: ${opts.tool}`;

  await logger.log({
    type: "tool_exec",
    severity,
    summary,
    details: {
      tool: opts.tool,
      command: opts.command,
      args: opts.args,
      result: opts.result,
      error: opts.error,
      exitCode: opts.exitCode,
      duration: opts.duration,
    },
    actor: opts.actor,
    session: opts.session,
    channel: opts.channel,
  });
}

/**
 * Log a configuration change event.
 */
export async function logConfigChange(opts: {
  action: "create" | "update" | "delete";
  path: string;
  keys?: string[];
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Config ${opts.action}: ${opts.path}${opts.keys ? ` (keys: ${opts.keys.join(", ")})` : ""}`;

  await logger.log({
    type: "config_change",
    severity: "info",
    summary,
    details: {
      action: opts.action,
      path: opts.path,
      keys: opts.keys,
    },
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log a skill/plugin installation event.
 */
export async function logSkillInstall(opts: {
  skillId: string;
  skillPath: string;
  action: "install" | "uninstall";
  verified?: boolean;
  signer?: string;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const type: AuditEventType = opts.action === "install" ? "skill_install" : "skill_uninstall";
  const summary = `Skill ${opts.action}: ${opts.skillId} (verified: ${opts.verified ? "yes" : "no"})`;

  await logger.log({
    type,
    severity: opts.verified === false ? "warn" : "info",
    summary,
    details: {
      skillId: opts.skillId,
      skillPath: opts.skillPath,
      verified: opts.verified,
      signer: opts.signer,
    },
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log credential access event.
 */
export async function logCredentialAccess(opts: {
  action: "read" | "write" | "delete";
  service: string;
  account?: string;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Credential ${opts.action}: ${opts.service}${opts.account ? `/${opts.account}` : ""}`;

  await logger.log({
    type: "credential_access",
    severity: "info",
    summary,
    details: {
      action: opts.action,
      service: opts.service,
      account: opts.account,
    },
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log channel message send event.
 */
export async function logChannelSend(opts: {
  channel: string;
  recipient: string;
  messageType: string;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Channel send: ${opts.channel} → ${opts.recipient} (${opts.messageType})`;

  await logger.log({
    type: "channel_send",
    severity: "info",
    summary,
    details: {
      messageType: opts.messageType,
      recipient: opts.recipient,
    },
    actor: opts.actor,
    session: opts.session,
    channel: opts.channel,
  });
}

/**
 * Log network egress blocked event.
 */
export async function logEgressBlocked(opts: {
  url: string;
  reason: string;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Egress blocked: ${opts.url} (${opts.reason})`;

  await logger.log({
    type: "egress_blocked",
    severity: "warn",
    summary,
    details: {
      url: opts.url,
      reason: opts.reason,
    },
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log network egress allowed event (only if egress logging is enabled).
 */
export async function logEgressAllowed(opts: {
  url: string;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Egress allowed: ${opts.url}`;

  await logger.log({
    type: "egress_allowed",
    severity: "info",
    summary,
    details: {
      url: opts.url,
    },
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log authentication event.
 */
export async function logAuthEvent(opts: {
  action: "login" | "logout" | "token_refresh" | "token_revoke";
  provider: string;
  account?: string;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Auth ${opts.action}: ${opts.provider}${opts.account ? `/${opts.account}` : ""}`;

  await logger.log({
    type: "auth_event",
    severity: "info",
    summary,
    details: {
      action: opts.action,
      provider: opts.provider,
      account: opts.account,
    },
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log session lifecycle event.
 */
export async function logSessionEvent(opts: {
  action: "create" | "destroy" | "timeout";
  sessionKey: string;
  actor?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const summary = `Session ${opts.action}: ${opts.sessionKey}`;

  await logger.log({
    type: "session_event",
    severity: "info",
    summary,
    details: {
      action: opts.action,
    },
    actor: opts.actor,
    session: opts.sessionKey,
  });
}

/**
 * Log security alert.
 */
export async function logSecurityAlert(opts: {
  alert: string;
  details?: Record<string, unknown>;
  actor?: string;
  session?: string;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  await logger.log({
    type: "security_alert",
    severity: "critical",
    summary: opts.alert,
    details: opts.details ?? {},
    actor: opts.actor,
    session: opts.session,
  });
}

/**
 * Log gateway event.
 */
export async function logGatewayEvent(opts: {
  action: "start" | "stop" | "config_reload" | "crash";
  details?: Record<string, unknown>;
}): Promise<void> {
  const logger = await getAuditLogger();
  if (!logger) {
    return;
  }

  const severity: AuditSeverity = opts.action === "crash" ? "error" : "info";
  const summary = `Gateway ${opts.action}`;

  await logger.log({
    type: "gateway_event",
    severity,
    summary,
    details: opts.details ?? {},
  });
}
