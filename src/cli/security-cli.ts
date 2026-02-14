import type { Command } from "commander";
import {
  auditQueryCommand,
  auditStatsCommand,
  auditExportCommand,
  auditVerifyCommand,
} from "../commands/audit-query.js";
import {
  keychainStatusCommand,
  keychainMigrateCommand,
  keychainListCommand,
} from "../commands/keychain.js";
import {
  listKeysCommand,
  addKeyCommand,
  removeKeyCommand,
  trustKeyCommand,
} from "../commands/keys-management.js";
import { securityEncryptCommand } from "../commands/security-encrypt.js";
import { generateKeyCommand, signSkillCommand } from "../commands/skill-sign.js";
import { loadConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { runSecurityAudit } from "../security/audit.js";
import { fixSecurityFootguns } from "../security/fix.js";
import { formatDocsLink } from "../terminal/links.js";
import { isRich, theme } from "../terminal/theme.js";
import { shortenHomeInString, shortenHomePath } from "../utils.js";
import { formatCliCommand } from "./command-format.js";

type SecurityAuditOptions = {
  json?: boolean;
  deep?: boolean;
  fix?: boolean;
};

function formatSummary(summary: { critical: number; warn: number; info: number }): string {
  const rich = isRich();
  const c = summary.critical;
  const w = summary.warn;
  const i = summary.info;
  const parts: string[] = [];
  parts.push(rich ? theme.error(`${c} critical`) : `${c} critical`);
  parts.push(rich ? theme.warn(`${w} warn`) : `${w} warn`);
  parts.push(rich ? theme.muted(`${i} info`) : `${i} info`);
  return parts.join(" · ");
}

export function registerSecurityCli(program: Command) {
  const security = program
    .command("security")
    .description("Security tools (audit)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/security", "docs.OpenClaw.ai/cli/security")}\n`,
    );

  security
    .command("audit")
    .description("Audit config + local state for common security foot-guns")
    .option("--deep", "Attempt live Gateway probe (best-effort)", false)
    .option("--fix", "Apply safe fixes (tighten defaults + chmod state/config)", false)
    .option("--json", "Print JSON", false)
    .action(async (opts: SecurityAuditOptions) => {
      const fixResult = opts.fix ? await fixSecurityFootguns().catch((_err) => null) : null;

      const cfg = loadConfig();
      const report = await runSecurityAudit({
        config: cfg,
        deep: Boolean(opts.deep),
        includeFilesystem: true,
        includeChannelSecurity: true,
      });

      if (opts.json) {
        defaultRuntime.log(
          JSON.stringify(fixResult ? { fix: fixResult, report } : report, null, 2),
        );
        return;
      }

      const rich = isRich();
      const heading = (text: string) => (rich ? theme.heading(text) : text);
      const muted = (text: string) => (rich ? theme.muted(text) : text);

      const lines: string[] = [];
      lines.push(heading("ClosedClaw security audit"));
      lines.push(muted(`Summary: ${formatSummary(report.summary)}`));
      lines.push(muted(`Run deeper: ${formatCliCommand("ClosedClaw security audit --deep")}`));

      if (opts.fix) {
        lines.push(muted(`Fix: ${formatCliCommand("ClosedClaw security audit --fix")}`));
        if (!fixResult) {
          lines.push(muted("Fixes: failed to apply (unexpected error)"));
        } else if (
          fixResult.errors.length === 0 &&
          fixResult.changes.length === 0 &&
          fixResult.actions.every((a) => !a.ok)
        ) {
          lines.push(muted("Fixes: no changes applied"));
        } else {
          lines.push("");
          lines.push(heading("FIX"));
          for (const change of fixResult.changes) {
            lines.push(muted(`  ${shortenHomeInString(change)}`));
          }
          for (const action of fixResult.actions) {
            if (action.kind === "chmod") {
              const mode = action.mode.toString(8).padStart(3, "0");
              if (action.ok) {
                lines.push(muted(`  chmod ${mode} ${shortenHomePath(action.path)}`));
              } else if (action.skipped) {
                lines.push(
                  muted(`  skip chmod ${mode} ${shortenHomePath(action.path)} (${action.skipped})`),
                );
              } else if (action.error) {
                lines.push(
                  muted(`  chmod ${mode} ${shortenHomePath(action.path)} failed: ${action.error}`),
                );
              }
              continue;
            }
            const command = shortenHomeInString(action.command);
            if (action.ok) {
              lines.push(muted(`  ${command}`));
            } else if (action.skipped) {
              lines.push(muted(`  skip ${command} (${action.skipped})`));
            } else if (action.error) {
              lines.push(muted(`  ${command} failed: ${action.error}`));
            }
          }
          if (fixResult.errors.length > 0) {
            for (const err of fixResult.errors) {
              lines.push(muted(`  error: ${shortenHomeInString(err)}`));
            }
          }
        }
      }

      const bySeverity = (sev: "critical" | "warn" | "info") =>
        report.findings.filter((f) => f.severity === sev);

      const render = (sev: "critical" | "warn" | "info") => {
        const list = bySeverity(sev);
        if (list.length === 0) {
          return;
        }
        const label =
          sev === "critical"
            ? rich
              ? theme.error("CRITICAL")
              : "CRITICAL"
            : sev === "warn"
              ? rich
                ? theme.warn("WARN")
                : "WARN"
              : rich
                ? theme.muted("INFO")
                : "INFO";
        lines.push("");
        lines.push(heading(label));
        for (const f of list) {
          lines.push(`${theme.muted(f.checkId)} ${f.title}`);
          lines.push(`  ${f.detail}`);
          if (f.remediation?.trim()) {
            lines.push(`  ${muted(`Fix: ${f.remediation.trim()}`)}`);
          }
        }
      };

      render("critical");
      render("warn");
      render("info");

      defaultRuntime.log(lines.join("\n"));
    });

  // Audit log query commands
  const auditLog = security
    .command("log")
    .description("Query and analyze immutable audit log")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Examples:")}\n` +
        `  ${formatCliCommand("closedclaw security log query --since 1h")}\n` +
        `  ${formatCliCommand("closedclaw security log query --type tool_exec --failed-only")}\n` +
        `  ${formatCliCommand("closedclaw security log stats --verify")}\n` +
        `  ${formatCliCommand("closedclaw security log export --output audit.csv")}\n`,
    );

  auditLog
    .command("query")
    .description("Query audit log entries with filtering")
    .option("--type <types...>", "Filter by event type(s)", [])
    .option("--severity <severities...>", "Filter by severity level(s)", [])
    .option("--since <time>", "Start of time range (ISO or relative: 1h, 30m, 2d)", undefined)
    .option("--until <time>", "End of time range (ISO or relative)", undefined)
    .option("--actor <actor>", "Filter by actor", undefined)
    .option("--session <session>", "Filter by session key pattern", undefined)
    .option("--grep <pattern>", "Grep pattern for summary/details", undefined)
    .option("--failed-only", "Only show failed/blocked events", false)
    .option("--limit <n>", "Maximum entries to return", undefined)
    .option("--reverse", "Return entries in reverse order (newest first)", false)
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await auditQueryCommand(defaultRuntime, {
        types: opts.type?.length > 0 ? opts.type : undefined,
        severities: opts.severity?.length > 0 ? opts.severity : undefined,
        since: opts.since,
        until: opts.until,
        actor: opts.actor,
        session: opts.session,
        grep: opts.grep,
        failedOnly: Boolean(opts.failedOnly),
        limit: opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
        reverse: Boolean(opts.reverse),
        json: Boolean(opts.json),
      });
    });

  auditLog
    .command("stats")
    .description("Show audit log statistics")
    .option("--verify", "Verify hash chain integrity", false)
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await auditStatsCommand(defaultRuntime, {
        verify: Boolean(opts.verify),
        json: Boolean(opts.json),
      });
    });

  auditLog
    .command("export")
    .description("Export audit log entries to CSV or JSON")
    .requiredOption("--output <path>", "Output file path")
    .option("--format <format>", "Export format: csv or json", "csv")
    .option("--type <types...>", "Filter by event type(s)", [])
    .option("--since <time>", "Start of time range (ISO or relative)", undefined)
    .option("--until <time>", "End of time range (ISO or relative)", undefined)
    .action(async (opts) => {
      await auditExportCommand(defaultRuntime, {
        output: opts.output,
        format: opts.format as "csv" | "json",
        types: opts.type?.length > 0 ? opts.type : undefined,
        since: opts.since,
        until: opts.until,
      });
    });

  auditLog
    .command("verify")
    .description("Verify audit log integrity (hash chain)")
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await auditVerifyCommand(defaultRuntime, {
        json: Boolean(opts.json),
      });
    });

  security
    .command("encrypt")
    .description("Manage encryption for data at rest")
    .option("--status", "Check encryption status of stores", false)
    .option("--migrate", "Migrate plaintext stores to encrypted storage", false)
    .option("--backups", "Encrypt all config backup files", false)
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await securityEncryptCommand(defaultRuntime, {
        status: Boolean(opts.status),
        migrate: Boolean(opts.migrate),
        backups: Boolean(opts.backups),
        json: Boolean(opts.json),
      });
    });

  // Keychain management commands
  const keychain = security
    .command("keychain")
    .description("OS keychain integration for credential storage")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Examples:")}\n` +
        `  ${formatCliCommand("closedclaw security keychain status")}\n` +
        `  ${formatCliCommand("closedclaw security keychain migrate")}\n` +
        `  ${formatCliCommand("closedclaw security keychain list")}\n`,
    );

  keychain
    .command("status")
    .description("Check keychain backend status and availability")
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await keychainStatusCommand(defaultRuntime, {
        json: Boolean(opts.json),
      });
    });

  keychain
    .command("migrate")
    .description("Migrate credentials from JSON files to keychain")
    .option("--dry-run", "Show what would be migrated without making changes", false)
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await keychainMigrateCommand(defaultRuntime, {
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
      });
    });

  keychain
    .command("list")
    .description("List stored credentials (file backend only)")
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await keychainListCommand(defaultRuntime, {
        json: Boolean(opts.json),
      });
    });

  // Skill signing commands
  const skill = security
    .command("skill")
    .description("Skill signing and verification")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Examples:")}\n` +
        `  ${formatCliCommand("closedclaw skill keygen --add-to-keyring")}\n` +
        `  ${formatCliCommand("closedclaw skill sign ./my-skill.md")}\n`,
    );

  skill
    .command("keygen")
    .description("Generate a new Ed25519 signing key pair")
    .option("--output <dir>", "Output directory for key files", undefined)
    .option("--signer-name <name>", "Your name or email", undefined)
    .option("--add-to-keyring", "Add public key to trusted keyring", false)
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await generateKeyCommand(defaultRuntime, {
        output: opts.output,
        signerName: opts.signerName,
        addToKeyring: Boolean(opts.addToKeyring),
        json: Boolean(opts.json),
      });
    });

  skill
    .command("sign <skillPath>")
    .description("Sign a skill file with Ed25519")
    .option("--key <path>", "Path to private key file or directory", undefined)
    .option("--generate-key", "Generate ephemeral key for one-time signing", false)
    .option("--signer-name <name>", "Your name or email", undefined)
    .option("--output <path>", "Output path for signature file", undefined)
    .option("--json", "Print JSON output", false)
    .action(async (skillPath: string, opts) => {
      await signSkillCommand(defaultRuntime, skillPath, {
        keyPath: opts.key,
        generateKey: Boolean(opts.generateKey),
        signerName: opts.signerName,
        output: opts.output,
        json: Boolean(opts.json),
      });
    });

  // Trusted keyring commands
  const keys = security
    .command("keys")
    .description("Manage trusted keyring for skill verification")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Examples:")}\n` +
        `  ${formatCliCommand("closedclaw keys list")}\n` +
        `  ${formatCliCommand("closedclaw keys add abc123... ./public-key.pub --trust full")}\n` +
        `  ${formatCliCommand("closedclaw keys trust abc123... --trust marginal")}\n`,
    );

  keys
    .command("list")
    .description("List all trusted keys")
    .option("--trust-level <level>", "Filter by trust level (full|marginal|none)", undefined)
    .option("--json", "Print JSON output", false)
    .action(async (opts) => {
      await listKeysCommand(defaultRuntime, {
        trustLevel: opts.trustLevel,
        json: Boolean(opts.json),
      });
    });

  keys
    .command("add <keyId> <publicKeyPath>")
    .description("Add a public key to the trusted keyring")
    .option("--name <name>", "Display name for the key owner", undefined)
    .option("--trust <level>", "Trust level (full|marginal|none)", "marginal")
    .option(
      "--verified-via <method>",
      "Verification method (manual|web-of-trust|certificate|self)",
      "manual",
    )
    .option("--notes <text>", "Additional notes about the key", undefined)
    .option("--json", "Print JSON output", false)
    .action(async (keyId: string, publicKeyPath: string, opts) => {
      await addKeyCommand(defaultRuntime, keyId, publicKeyPath, {
        name: opts.name,
        trust: opts.trust,
        verifiedVia: opts.verifiedVia,
        notes: opts.notes,
        json: Boolean(opts.json),
      });
    });

  keys
    .command("remove <keyId>")
    .description("Remove a key from the trusted keyring")
    .option("--json", "Print JSON output", false)
    .action(async (keyId: string, opts) => {
      await removeKeyCommand(defaultRuntime, keyId, {
        json: Boolean(opts.json),
      });
    });

  keys
    .command("trust <keyId>")
    .description("Change the trust level of a key")
    .requiredOption("--trust <level>", "New trust level (full|marginal|none)")
    .option("--json", "Print JSON output", false)
    .action(async (keyId: string, opts) => {
      await trustKeyCommand(defaultRuntime, keyId, {
        trust: opts.trust,
        json: Boolean(opts.json),
      });
    });
}
