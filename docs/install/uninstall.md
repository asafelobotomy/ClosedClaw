---
summary: "Uninstall ClosedClaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove ClosedClaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `ClosedClaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
ClosedClaw uninstall
```

Non-interactive (automation / npx):

```bash
ClosedClaw uninstall --all --yes --non-interactive
npx -y ClosedClaw uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
ClosedClaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
ClosedClaw gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${ClosedClaw_STATE_DIR:-$HOME/.ClosedClaw}"
```

If you set `ClosedClaw_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.ClosedClaw/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g ClosedClaw
pnpm remove -g ClosedClaw
bun remove -g ClosedClaw
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/ClosedClaw.app
```

Notes:

- If you used profiles (`--profile` / `ClosedClaw_PROFILE`), repeat step 3 for each state dir (defaults are `~/.ClosedClaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `ClosedClaw` is missing.

### macOS (launchd)

Default label is `bot.molt.gateway` (or `bot.molt.<profile>`; legacy `com.ClosedClaw.*` may still exist):

```bash
launchctl bootout gui/$UID/bot.molt.gateway
rm -f ~/Library/LaunchAgents/bot.molt.gateway.plist
```

If you used a profile, replace the label and plist name with `bot.molt.<profile>`. Remove any legacy `com.ClosedClaw.*` plists if present.

### Linux (systemd user unit)

Default unit name is `ClosedClaw-gateway.service` (or `ClosedClaw-gateway-<profile>.service`):

```bash
systemctl --user disable --now ClosedClaw-gateway.service
rm -f ~/.config/systemd/user/ClosedClaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `ClosedClaw Gateway` (or `ClosedClaw Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "ClosedClaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.ClosedClaw\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.ClosedClaw-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://ClosedClaw.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g ClosedClaw@latest`.
Remove it with `npm rm -g ClosedClaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `ClosedClaw ...` / `bun run ClosedClaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
