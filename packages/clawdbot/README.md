# clawdbot

**Backward-compatibility shim** — this package redirects users of the legacy `clawdbot` npm package name to `closedclaw`.

## What it Does

When users who previously installed `clawdbot` run `npm install clawdbot` or `pnpm add clawdbot`, this package:

1. Installs `closedclaw` as a peer dependency
2. Runs a `postinstall` script that informs the user to migrate to `closedclaw`
3. Provides a `clawdbot` binary that forwards to the `closedclaw` CLI

## Migration

Replace:
```bash
npm install -g clawdbot
```

With:
```bash
npm install -g closedclaw
```

This shim will be maintained until the next major version milestone.
