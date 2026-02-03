---
summary: "CLI reference for `ClosedClaw agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `ClosedClaw agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
ClosedClaw agents list
ClosedClaw agents add work --workspace ~/.ClosedClaw/workspace-work
ClosedClaw agents set-identity --workspace ~/.ClosedClaw/workspace --from-identity
ClosedClaw agents set-identity --agent main --avatar avatars/ClosedClaw.png
ClosedClaw agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.ClosedClaw/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
ClosedClaw agents set-identity --workspace ~/.ClosedClaw/workspace --from-identity
```

Override fields explicitly:

```bash
ClosedClaw agents set-identity --agent main --name "ClosedClaw" --emoji "🦞" --avatar avatars/ClosedClaw.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "ClosedClaw",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/ClosedClaw.png",
        },
      },
    ],
  },
}
```
