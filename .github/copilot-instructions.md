# ClosedClaw Development Guide

ClosedClaw is a personal AI assistant gateway that connects multiple messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, etc.) to AI models through a unified control plane. This guide covers the essential patterns and workflows for contributing.

## Architecture Overview

- **Gateway Control Plane**: `src/gateway/` coordinates sessions, channels, tools, and agent execution. Supports RPC methods, WebSocket/HTTP, config hot-reload via SIGUSR1
- **Channel Abstraction**: Built-in channels in `src/{telegram,discord,slack,signal,imessage,web}/`; extension channels in `extensions/{msteams,matrix,zalo,bluebubbles,etc}/`. Each channel is a plugin that registers via `ClosedClawPluginApi`
- **Agent Runtime**: Pi agent runtime (RPC mode) with tool streaming in `src/agents/`. Agents support subagents, tool calls, and block streaming
- **Media Pipeline**: `src/media/` handles images/audio/video with transcription and size caps. Media understanding integrates with agent context
- **Plugin System**: Extensions live under `extensions/*` as workspace packages; runtime resolves via `closedclaw/plugin-sdk`. Plugins register tools, hooks, channels, providers, CLI commands, and gateway handlers
- **Routing Layer**: `src/routing/` maps incoming messages to agent sessions via bindings (peer/guild/team/account/channel). Session keys format: `agent:<agentId>:<channel>:<kind>:<peerId>`

### Key Patterns

**Dependency Injection**: Commands use `createDefaultDeps()` from `src/cli/deps.ts` to wire messaging backends. Extend `CliDeps` when adding new channels. Pattern: add send method to `CliDeps` interface + register in `createDefaultDeps()` + add to `createOutboundSendDeps()`

**Configuration**: Config lives at `~/.closedclaw/config.json5` (JSON5 format). Load via `loadConfig()` from `src/config/config.ts`. The Gateway watches config and hot-reloads via SIGUSR1. Strict validation enforces schema compliance—unknown keys fail startup. Split config types in `src/config/types.*.ts` files for modularity

**Session Model**: `main` session for direct chats; isolated sessions per peer/group/thread. Session keys: `agent:<agentId>:<channel>:<kind>:<peerId>`. Default agent: `main`. See routing logic in `src/routing/resolve-route.ts` for binding resolution hierarchy (peer → guild → team → account → channel → default)

**Channel Plugins**: Keep plugin-only deps in the extension's `package.json`. Use `peerDependencies` for `closedclaw`, never `workspace:*` in `dependencies` (breaks npm install). Plugins register via `api.registerChannel()` in their exported `register()` function. Each channel must have unique `id` and implement `ChannelPlugin` interface

**Plugin SDK**: Runtime resolves `closedclaw/plugin-sdk` via jiti alias. SDK exports types and helpers (no runtime state). Plugins can register: tools, hooks (with priority), channels, providers, CLI commands, gateway RPC methods, HTTP routes, services. See `src/plugins/types.ts` for full API surface

**Config Schema**: Config types in `src/config/types.*.ts`, Zod schemas in `src/config/zod-schema.ts`. Plugins can register `configSchema` (JSON Schema) + `uiHints` for form rendering. Breaking changes require migration in `src/config/legacy-migrate.ts`

## Development Workflow

### Setup

```bash
# Runtime: Node ≥22 required
pnpm install          # Install dependencies
pnpm ui:build         # Build web UI (first run auto-installs UI deps)
pnpm build            # TypeScript → dist/

# Development (TypeScript hot-reload)
pnpm closedclaw ...     # Run CLI directly via tsx
pnpm gateway:watch    # Watch mode for gateway
```

### Pre-Commit Gate

```bash
prek install          # Install pre-commit hooks (runs same checks as CI)
pnpm check            # Lint + format (oxlint/oxfmt)
pnpm build            # Type-check + build
pnpm test             # Vitest unit/integration tests
```

### Testing Strategy

- **Unit/Integration** (`pnpm test`): Fast, deterministic, no real keys. Files: `src/**/*.test.ts`. Config: `vitest.config.ts`
- **E2E** (`pnpm test:e2e`): Gateway smoke tests with WebSocket/HTTP, node pairing, multi-instance. Files: `src/**/*.e2e.test.ts`. Config: `vitest.e2e.config.ts`
- **Live** (`pnpm test:live`): Real provider/model tests. Requires credentials. Files: `src/**/*.live.test.ts`. Config: `vitest.live.config.ts`. Sources `~/.profile` for env vars. Use `ClosedClaw_LIVE_ANTHROPIC_KEYS="sk-...,sk-..."` for key rotation on rate limits
- **Coverage**: `pnpm test:coverage` enforces 70% lines/branches/functions/statements. Run before pushing logic changes
- **Docker E2E**: Full install/onboard/plugin tests in isolation via `pnpm test:docker:*` scripts

Before pushing logic changes: `pnpm build && pnpm check && pnpm test`

When to run live tests: Debugging provider-specific failures, tool calling quirks, auth issues. Narrow via env vars instead of running full suite (costs money/quotas)

See `docs/testing.md` for detailed test harness info, credential discovery, and model selection patterns

### Commits & Pull Requests

- Use `scripts/committer "<msg>" <file...>` (not manual `git add`/`git commit`) to scope staging
- Commit format: concise, action-oriented (e.g., "CLI: add verbose flag to send")
- Changelog: keep latest release at top (no `Unreleased`); bump version after publishing
- When working on a PR: add changelog entry with PR # + thank contributor
- When merging: prefer rebase for clean history; squash when messy. Add PR author as co-contributor if squashing

## Code Style

- **Language**: TypeScript (ESM), strict mode, avoid `any`
- **LOC guideline**: ~500-700 lines per file (not a hard limit; split when it improves clarity)
- **Formatting**: Oxlint + Oxfmt (run `pnpm check` before commits)
- **CLI Progress**: Use `src/cli/progress.ts` (osc-progress + @clack/prompts); don't hand-roll spinners
- **Terminal Output**: Keep tables + ANSI-safe wrapping via `src/terminal/table.ts`
- **Colors**: Use shared CLI palette from `src/terminal/palette.ts` (no hardcoded colors)

## Channel Development

When adding/modifying channels:
1. Update **all** UI surfaces (macOS app, web UI, mobile if applicable)
2. Update docs in `docs/channels/`
3. Add matching status + configuration forms
4. Review `.github/labeler.yml` for label coverage
5. Consider routing, allowlists, pairing, command gating, onboarding flows

## Security & Configuration

- **DM Policy**: Default is `dmPolicy="pairing"` (unknown senders get pairing code, not processed)
- **Credentials**: OAuth tokens at `~/.closedclaw/credentials/`; sessions at `~/.closedclaw/sessions/`
- **Run Diagnostics**: `closedclaw doctor` surfaces risky/misconfigured policies and legacy config issues
- **Never commit**: Real phone numbers, videos, live config values. Use placeholders in docs/tests

## Platform-Specific Notes

### macOS App
- Build: `scripts/package-mac-app.sh` (defaults to current arch)
- Restart: `scripts/restart-mac.sh` or via ClosedClaw Mac app (not ad-hoc tmux)
- Logs: `./scripts/clawlog.sh` queries unified logs (ClosedClaw subsystem)
- SwiftUI: Prefer `Observation` framework (`@Observable`, `@Bindable`) over `ObservableObject`

### Mobile (iOS/Android)
- Before simulator use, check for connected real devices and prefer them
- iOS build: `pnpm ios:build`, open Xcode: `pnpm ios:open`
- Android build: `pnpm android:assemble`, install: `pnpm android:install`

## Extension Development

Extensions are workspace packages under `extensions/*`:
- Plugin install: `npm install --omit=dev` in plugin dir
- Runtime deps: must live in `dependencies` (not `devDependencies`)
- Avoid `workspace:*` in `dependencies`; put `closedclaw` in `devDependencies` or `peerDependencies`
- Runtime resolves `closedclaw/plugin-sdk` via jiti alias
- Each plugin must have `ClosedClaw.plugin.json` manifest with `id` and `configSchema` (JSON Schema)
- Plugins register via exported `register(api: ClosedClawPluginApi)` function
- Can register: tools, hooks (with priority), channels, providers, CLI commands, gateway RPC methods, HTTP routes, services
- Plugin commands: use `validateCommandName()` to check reserved names. Namespace collision detection prevents duplicate registrations
- Config validation is strict: unknown keys in plugin config sections cause Gateway startup failure

## Release Channels

- **stable**: Tagged releases (`vYYYY.M.D`), npm dist-tag `latest`
- **beta**: Prerelease tags (`vYYYY.M.D-beta.N`), npm dist-tag `beta`
- **dev**: Moving head of `main` (no tag)

Switch channels: `closedclaw update --channel stable|beta|dev`

## Documentation

- Internal links: root-relative, no `.md`/`.mdx` (e.g., `[Config](/configuration)`)
- Avoid em dashes and apostrophes in headings
- README: use relative links for documentation compatibility

## Common Tasks

**Add a new channel**: Extend `CliDeps` in `src/cli/deps.ts`, add send method, update routing in `src/routing/`, add docs in `docs/channels/`, update all UIs

**Add a tool**: Implement in `src/tools/`, register in agent tool catalog, add tests, document in `docs/tools/`

**Modify config schema**: Update `src/config/types.ts` + `src/config/zod-schema.ts`, run validation, test migration in `src/config/legacy-migrate.ts` if breaking

**Debug Gateway**: `pnpm gateway:watch` for hot-reload, check `~/.closedclaw/logs/`, use `closedclaw channels status --probe`

## Resources

- Testing guide: `docs/testing.md`
- Release process: `docs/reference/RELEASING.md`
- Platform guides: `docs/platforms/{mac,ios,android}/`
