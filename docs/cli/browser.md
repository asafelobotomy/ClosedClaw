---
summary: "CLI reference for `ClosedClaw browser` (profiles, tabs, actions, extension relay)"
read_when:
  - You use `ClosedClaw browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to use the Chrome extension relay (attach/detach via toolbar button)
title: "browser"
---

# `ClosedClaw browser`

Manage ClosedClaw’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:

- Browser tool + API: [Browser tool](/tools/browser)
- Chrome extension relay: [Chrome extension](/tools/chrome-extension)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
ClosedClaw browser --browser-profile chrome tabs
ClosedClaw browser --browser-profile ClosedClaw start
ClosedClaw browser --browser-profile ClosedClaw open https://example.com
ClosedClaw browser --browser-profile ClosedClaw snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:

- `ClosedClaw`: launches/attaches to a dedicated ClosedClaw-managed Chrome instance (isolated user data dir).
- `chrome`: controls your existing Chrome tab(s) via the Chrome extension relay.

```bash
ClosedClaw browser profiles
ClosedClaw browser create-profile --name work --color "#FF5A36"
ClosedClaw browser delete-profile --name work
```

Use a specific profile:

```bash
ClosedClaw browser --browser-profile work tabs
```

## Tabs

```bash
ClosedClaw browser tabs
ClosedClaw browser open https://docs.ClosedClaw.ai
ClosedClaw browser focus <targetId>
ClosedClaw browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
ClosedClaw browser snapshot
```

Screenshot:

```bash
ClosedClaw browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
ClosedClaw browser navigate https://example.com
ClosedClaw browser click <ref>
ClosedClaw browser type <ref> "hello"
```

## Chrome extension relay (attach via toolbar button)

This mode lets the agent control an existing Chrome tab that you attach manually (it does not auto-attach).

Install the unpacked extension to a stable path:

```bash
ClosedClaw browser extension install
ClosedClaw browser extension path
```

Then Chrome → `chrome://extensions` → enable “Developer mode” → “Load unpacked” → select the printed folder.

Full guide: [Chrome extension](/tools/chrome-extension)

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
