import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ClosedClawConfig } from "../config/config.js";
import { resolveStorePath } from "../config/sessions.js";
import { noteStateIntegrity } from "./doctor-state-integrity.js";

const { note } = vi.hoisted(() => ({ note: vi.fn() }));
vi.mock("../terminal/note.js", () => ({ note }));

describe("doctor state integrity", () => {
  it("skips cross-home scan when disabled", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-state-skip-"));
    const stateDir = path.join(tempHome, "state-alt");
    const defaultStateDir = path.join(tempHome, ".ClosedClaw");
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(defaultStateDir, { recursive: true, mode: 0o700 });

    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
    const oauthDir = path.join(stateDir, "credentials");
    fs.mkdirSync(oauthDir, { recursive: true, mode: 0o700 });

    const cfg: ClosedClawConfig = {
      session: { store: path.join(stateDir, "store", "store.json") },
    } as ClosedClawConfig;

    const storePath = resolveStorePath(cfg.session?.store, { agentId: "main" });
    fs.mkdirSync(path.dirname(storePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(storePath, "{}", { mode: 0o600 });

    const configPath = path.join(stateDir, "ClosedClaw.json");
    fs.writeFileSync(configPath, "{}", { mode: 0o600 });

    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    const prevStateDir = process.env.ClosedClaw_STATE_DIR;
    process.env.ClosedClaw_STATE_DIR = stateDir;

    const prompter = {
      confirmSkipInNonInteractive: vi.fn().mockResolvedValue(false),
    } as Parameters<typeof noteStateIntegrity>[1];

    await noteStateIntegrity(cfg, prompter, configPath, { skipCrossHomeScan: true });

    expect(note).not.toHaveBeenCalled();

    if (prevStateDir === undefined) {
      delete process.env.ClosedClaw_STATE_DIR;
    } else {
      process.env.ClosedClaw_STATE_DIR = prevStateDir;
    }
    homedirSpy.mockRestore();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });
});
