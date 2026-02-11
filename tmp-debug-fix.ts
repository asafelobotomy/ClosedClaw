import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fixSecurityFootguns } from "./src/security/fix.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ClosedClaw-test-"));
const stateDir = path.join(tmp, "state");
fs.mkdirSync(stateDir, { recursive: true });
const configPath = path.join(stateDir, "ClosedClaw.json");
fs.writeFileSync(configPath, JSON.stringify({
  channels: { telegram: { groupPolicy: "open" } },
  logging: { redactSensitive: "off" }
}, null, 2) + "\n");
const env = { ...process.env, ClosedClaw_STATE_DIR: stateDir, ClosedClaw_CONFIG_PATH: "" };
const res = await fixSecurityFootguns({ env });
console.log(JSON.stringify({ ok: res.ok, errors: res.errors, changes: res.changes }, null, 2));
