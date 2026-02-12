import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixSecurityFootguns } from "./fix.js";

const isWindows = process.platform === "win32";

const expectPerms = (actual: number, expected: number) => {
  if (isWindows) {
    expect([expected, 0o666, 0o777]).toContain(actual);
    return;
  }
  expect(actual).toBe(expected);
};

describe("security fix", () => {
  it("tightens webchat groupPolicy + filesystem perms", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ClosedClaw-security-fix-"));
    const stateDir = path.join(tmp, "state");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.chmod(stateDir, 0o755);

    const configPath = path.join(stateDir, "ClosedClaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            webchat: {
              groupPolicy: "open",
              accounts: {
                main: { groupPolicy: "open" },
              },
            },
          },
          logging: { redactSensitive: "off" },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.chmod(configPath, 0o644);

    const env = {
      ...process.env,
      ClosedClaw_STATE_DIR: stateDir,
      ClosedClaw_CONFIG_PATH: "",
    };

    const res = await fixSecurityFootguns({ env });
    expect(res.ok).toBe(true);
    expect(res.configWritten).toBe(true);
    expect(res.changes).toEqual(
      expect.arrayContaining([
        "channels.webchat.groupPolicy=open -> allowlist",
        "channels.webchat.accounts.main.groupPolicy=open -> allowlist",
        'logging.redactSensitive=off -> "tools"',
      ]),
    );

    expectPerms((await fs.stat(stateDir)).mode & 0o777, 0o700);
    expectPerms((await fs.stat(configPath)).mode & 0o777, 0o600);

    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8")) as {
      channels: {
        webchat: {
          groupPolicy: string;
          accounts: { main: { groupPolicy: string } };
        };
      };
      logging: { redactSensitive: string };
    };

    expect(parsed.channels.webchat.groupPolicy).toBe("allowlist");
    expect(parsed.channels.webchat.accounts.main.groupPolicy).toBe("allowlist");
    expect(parsed.logging.redactSensitive).toBe("tools");
  });

  it("returns ok=false for invalid config but still tightens perms", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ClosedClaw-security-fix-"));
    const stateDir = path.join(tmp, "state");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.chmod(stateDir, 0o755);

    const configPath = path.join(stateDir, "ClosedClaw.json");
    await fs.writeFile(configPath, "{ this is not json }\n", "utf-8");
    await fs.chmod(configPath, 0o644);

    const env = {
      ...process.env,
      ClosedClaw_STATE_DIR: stateDir,
      ClosedClaw_CONFIG_PATH: "",
    };

    const res = await fixSecurityFootguns({ env });
    expect(res.ok).toBe(false);
    expect(res.configWritten).toBe(false);

    expectPerms((await fs.stat(stateDir)).mode & 0o777, 0o700);
    expectPerms((await fs.stat(configPath)).mode & 0o777, 0o600);
  });

  it("tightens perms for include files + credentials + agent auth/sessions", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ClosedClaw-security-fix-"));
    const stateDir = path.join(tmp, "state");
    await fs.mkdir(stateDir, { recursive: true });

    const includesDir = path.join(stateDir, "includes");
    await fs.mkdir(includesDir, { recursive: true });
    const includePath = path.join(includesDir, "extra.json5");
    await fs.writeFile(includePath, "{ logging: { redactSensitive: 'off' } }\n", "utf-8");
    await fs.chmod(includePath, 0o644);

    const configPath = path.join(stateDir, "ClosedClaw.json");
    await fs.writeFile(
      configPath,
      `{ "$include": "./includes/extra.json5", channels: { webchat: { groupPolicy: "open" } } }\n`,
      "utf-8",
    );
    await fs.chmod(configPath, 0o644);

    const credsDir = path.join(stateDir, "credentials");
    await fs.mkdir(credsDir, { recursive: true });
    const credsPath = path.join(credsDir, "tokens.json");
    await fs.writeFile(credsPath, "{}\n", "utf-8");
    await fs.chmod(credsPath, 0o644);

    const agentDir = path.join(stateDir, "agents", "main", "agent");
    await fs.mkdir(agentDir, { recursive: true });
    const authProfilesPath = path.join(agentDir, "auth-profiles.json");
    await fs.writeFile(authProfilesPath, "{}\n", "utf-8");
    await fs.chmod(authProfilesPath, 0o644);

    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    const sessionsStorePath = path.join(sessionsDir, "sessions.json");
    await fs.writeFile(sessionsStorePath, "{}\n", "utf-8");
    await fs.chmod(sessionsStorePath, 0o644);

    const env = {
      ...process.env,
      ClosedClaw_STATE_DIR: stateDir,
      ClosedClaw_CONFIG_PATH: "",
    };

    const res = await fixSecurityFootguns({ env });
    expect(res.ok).toBe(true);

    expectPerms((await fs.stat(includePath)).mode & 0o777, 0o600);
    expectPerms((await fs.stat(credsDir)).mode & 0o777, 0o700);
    expectPerms((await fs.stat(credsPath)).mode & 0o777, 0o600);
    expectPerms((await fs.stat(agentDir)).mode & 0o777, 0o700);
    expectPerms((await fs.stat(authProfilesPath)).mode & 0o777, 0o600);
    expectPerms((await fs.stat(sessionsDir)).mode & 0o777, 0o700);
    expectPerms((await fs.stat(sessionsStorePath)).mode & 0o777, 0o600);
  });

  it("leaves config unchanged when no fixes are needed", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ClosedClaw-security-fix-"));
    const stateDir = path.join(tmp, "state");
    await fs.mkdir(stateDir, { recursive: true });

    const configPath = path.join(stateDir, "ClosedClaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            webchat: { groupPolicy: "allowlist" },
          },
          logging: { redactSensitive: "tools" },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const env = {
      ...process.env,
      ClosedClaw_STATE_DIR: stateDir,
      ClosedClaw_CONFIG_PATH: "",
    };

    const res = await fixSecurityFootguns({ env });
    expect(res.ok).toBe(true);
    expect(res.configWritten).toBe(false);
    expect(res.changes).toEqual([]);
  });

  it("records skipped actions for type mismatches and symlink include", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ClosedClaw-security-fix-"));

    const fakeStateDir = path.join(tmp, "state-file");
    await fs.writeFile(fakeStateDir, "not a directory\n", "utf-8");

    const fakeConfigPath = path.join(tmp, "config-dir");
    await fs.mkdir(fakeConfigPath, { recursive: true });

    const realConfig = path.join(tmp, "ClosedClaw.json");
    const includeTarget = path.join(tmp, "include-target.json5");
    const includeLink = path.join(tmp, "include-link.json5");

    await fs.writeFile(includeTarget, "{ logging: { redactSensitive: 'tools' } }\n", "utf-8");
    await fs.symlink(includeTarget, includeLink);
    await fs.writeFile(realConfig, `{ "$include": "./include-link.json5" }\n`, "utf-8");

    const env = {
      ...process.env,
      ClosedClaw_STATE_DIR: tmp,
      ClosedClaw_CONFIG_PATH: "",
    };

    const res = await fixSecurityFootguns({
      env,
      stateDir: fakeStateDir,
      configPath: fakeConfigPath,
    });

    const hasNotDir = res.actions.some(
      (action) => action.kind === "chmod" && action.path === fakeStateDir && action.skipped === "not-a-directory",
    );
    const hasNotFile = res.actions.some(
      (action) => action.kind === "chmod" && action.path === fakeConfigPath && action.skipped === "not-a-file",
    );

    expect(hasNotDir).toBe(true);
    expect(hasNotFile).toBe(true);

    const includeRes = await fixSecurityFootguns({ env, stateDir: tmp, configPath: realConfig });
    const hasSymlinkSkip = includeRes.actions.some(
      (action) => action.kind === "chmod" && action.path === includeLink && action.skipped === "symlink",
    );
    expect(hasSymlinkSkip).toBe(true);
  });
});
