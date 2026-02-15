---
summary: "CLI reference for `ClosedClaw config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `ClosedClaw config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `ClosedClaw configure`).

## Examples

```bash
ClosedClaw config get browser.executablePath
ClosedClaw config set browser.executablePath "/usr/bin/google-chrome"
ClosedClaw config set agents.defaults.heartbeat.every "2h"
ClosedClaw config set agents.list[0].tools.exec.node "node-id-or-name"
ClosedClaw config unset tools.web.search.apiKey
```

## Diff

Compare your current config with ClosedClaw defaults.

```bash
ClosedClaw config diff           # human-readable summary
ClosedClaw config diff --json    # machine-readable output
```

## Paths

Paths use dot or bracket notation:

```bash
ClosedClaw config get agents.defaults.workspace
ClosedClaw config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
ClosedClaw config get agents.list
ClosedClaw config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
ClosedClaw config set agents.defaults.heartbeat.every "0m"
ClosedClaw config set gateway.port 19001 --json
ClosedClaw config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
