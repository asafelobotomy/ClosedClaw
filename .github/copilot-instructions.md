# ClosedClaw Development Guide

ClosedClaw is a personal AI assistant gateway that connects multiple messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, etc.) to AI models through a unified control plane. This guide covers the essential patterns and workflows for contributing.

## Quick Reference

**Common Commands**:
```bash
# Development
pnpm closedclaw gateway --port 18789 --verbose  # Start gateway with logging
pnpm gateway:watch                              # Hot-reload development
pnpm closedclaw doctor                          # Run diagnostics

# Testing
pnpm test                                       # Run all tests (parallel)
pnpm test -- src/path/to/specific.test.ts      # Run specific test file
pnpm test:coverage                              # Coverage report (70% required)
pnpm test:live                                  # Real provider tests (costs money)

# Quality Gates
pnpm check                                      # Lint + format
pnpm build                                      # Type-check + compile
scripts/committer "msg" file1.ts file2.ts      # Scoped commit helper
```

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

**Tool Implementation Pattern**: Tools use factory functions returning `AnyAgentTool`. Example:
```typescript
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

export function createMyTool(options?: { config?: ClosedClawConfig }): AnyAgentTool {
  return {
    name: "my_tool",
    description: "What this tool does and when to use it",
    parameters: {
      param1: { type: "string", description: "...", required: true },
    },
    handler: async (params) => {
      const value = readStringParam(params, "param1", { required: true });
      // Implementation
      return jsonResult({ result: "data" });
    },
  };
}
```
Register in `src/agents/openclaw-tools.ts` or `src/agents/bash-tools.ts`

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

**Build process**: `pnpm build` runs:
1. `canvas:a2ui:bundle` - Bundle Canvas A2UI components
2. `tsc` - TypeScript compilation
3. `canvas-a2ui-copy.ts` - Copy Canvas artifacts
4. `copy-hook-metadata.ts` - Hook metadata extraction
5. `write-build-info.ts` - Embed build info

### Pre-Commit Gate

```bash
prek install          # Install pre-commit hooks (runs same checks as CI)
pnpm check            # Lint + format (oxlint/oxfmt)
pnpm build            # Type-check + build
pnpm test             # Vitest unit/integration tests (parallel split via scripts/test-parallel.mjs)
```

### Testing Strategy

**Test parallelization**: `pnpm test` runs `scripts/test-parallel.mjs` which splits tests across three configs in parallel (unit, extensions, gateway) with adaptive worker allocation. Windows CI uses sharding + serial gateway tests to avoid flakes.

**Five Vitest configs**:
- **Unit** (`vitest.unit.config.ts`): `src/**/*.test.ts` excluding gateway - fast, deterministic, no real keys
- **Extensions** (`vitest.extensions.config.ts`): `extensions/**/*.test.ts` - plugin tests isolated from core
- **Gateway** (`vitest.gateway.config.ts`): `src/gateway/**/*.test.ts` - gateway control plane tests
- **E2E** (`vitest.e2e.config.ts`): `src/**/*.e2e.test.ts` - WebSocket/HTTP, node pairing, multi-instance
- **Live** (`vitest.live.config.ts`): `src/**/*.live.test.ts` - real provider/model tests (requires credentials)

**Test commands**:
- `pnpm test` - Default parallelized unit/extensions/gateway suite
- `pnpm test -- path/to/file.test.ts` - Run specific test file
- `pnpm test -- path/to/file.test.ts -t "test name"` - Run specific test case
- `pnpm test:e2e` - Gateway smoke tests (heavier networking)
- `pnpm test:live` - Real providers (sources `~/.profile`; use `ClosedClaw_LIVE_ANTHROPIC_KEYS="sk-...,sk-..."` for key rotation)
- `pnpm test:coverage` - Enforces 70% lines/branches/functions/statements
- `pnpm test:docker:*` - Full install/onboard/plugin tests in Docker isolation

**Narrow test execution** (faster iteration):
```bash
# Run single file
pnpm test -- src/config/config.test.ts

# Run specific test within file
pnpm test -- src/config/config.test.ts -t "loads default config"

# Run multiple related files
pnpm test -- src/config src/security/crypto.test.ts

# Watch mode for active development
pnpm test:watch -- src/agents/tools/my-tool.test.ts
```

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
- **Error Handling**: Custom error classes extend `Error` for domain-specific failures (e.g., `ConfigIncludeError`, `MediaFetchError`, `FailoverError`, `GatewayLockError`). Check `src/config/includes.ts`, `src/media/fetch.ts`, `src/agents/failover-error.ts` for patterns
- **CLI Progress**: Use `src/cli/progress.ts` (`createCliProgress()`); handles OSC progress with fallbacks (spinner/line/log/none); don't hand-roll spinners
- **Terminal Output**: Keep tables + ANSI-safe wrapping via `src/terminal/table.ts`
- **Colors**: Use shared CLI palette from `src/terminal/palette.ts` (LOBSTER_PALETTE constants: `accent`, `accentBright`, `success`, `warn`, `error`, `muted`); no hardcoded colors

### CLI Tooling

- **From source** (dev): `pnpm closedclaw ...` runs via tsx; `node scripts/run-node.mjs` for custom dev runner
- **Installed binary**: `closedclaw ...` (post-install via npm/pnpm -g)
- **Watch mode**: `pnpm gateway:watch` hot-reloads TypeScript changes

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

### Minimal Plugin Template
```typescript
// extensions/my-plugin/index.ts
import type { ClosedClawPluginApi } from "closedclaw/plugin-sdk";

export function register(api: ClosedClawPluginApi) {
  // Register a tool
  api.registerTool({
    factory: (ctx) => ({
      name: "my_plugin_tool",
      description: "What this tool does",
      parameters: { input: { type: "string", required: true } },
      handler: async (params) => ({ result: "success" }),
    }),
  });

  // Register a hook
  api.registerHook({
    entry: "message:received",
    priority: 100,
    handler: async (ctx, next) => {
      // Pre-process
      const result = await next();
      // Post-process
      return result;
    },
  });

  // Register a CLI command
  api.registerCommand({
    name: "my-command",
    description: "Command description",
    handler: async (args) => {
      console.log("Command executed");
    },
  });
}
```

```json5
// extensions/my-plugin/ClosedClaw.plugin.json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "apiKey": { "type": "string" }
    }
  },
  "uiHints": {
    "apiKey": { "sensitive": true, "label": "API Key" }
  }
}
```

```json
// extensions/my-plugin/package.json
{
  "name": "@closedclaw/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "devDependencies": {
    "closedclaw": "workspace:*"
  },
  "closedclaw": {
    "extensions": ["./index.ts"]
  }
}
```

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

### Add a New Tool (Checklist)
1. Create `src/agents/tools/my-tool.ts` with factory function
2. Export tool factory from appropriate module (`openclaw-tools.ts` or `bash-tools.ts`)
3. Add tool to assembly function (e.g., in `createClosedClawTools()`)
4. Create `src/agents/tools/my-tool.test.ts` with unit tests
5. Document in `docs/tools/my-tool.md`
6. Run `pnpm test -- src/agents/tools/my-tool.test.ts` to verify

### Add a New Channel (Checklist)
1. Create extension: `extensions/my-channel/`
2. Add `package.json` with `devDependencies: { "closedclaw": "workspace:*" }`
3. Create `ClosedClaw.plugin.json` with `id` and `configSchema`
4. Implement `register(api: ClosedClawPluginApi)` in `index.ts`
5. Extend `CliDeps` in `src/cli/deps.ts`: add `sendMessageMyChannel` method
6. Update `createDefaultDeps()` and `createOutboundSendDeps()` in `src/cli/deps.ts`
7. Add routing logic in `src/routing/`
8. Add docs in `docs/channels/my-channel.md`
9. Update UI surfaces (web, macOS, mobile)
10. Add tests in `extensions/my-channel/*.test.ts`

### Modify Config Schema (Workflow)
1. Update types in `src/config/types.*.ts`
2. Update Zod schema in `src/config/zod-schema.ts`
3. If breaking: add migration in `src/config/legacy-migrate.ts`
4. Test validation: `pnpm test -- src/config/`
5. Update docs in `docs/` if user-facing
6. Run `closedclaw doctor` to catch issues

### Debug Gateway Issues
```bash
pnpm gateway:watch               # Hot-reload for iterative debugging
tail -f ~/.closedclaw/logs/*     # Watch logs
closedclaw channels status       # Check channel connectivity
closedclaw doctor                # Run full diagnostics
closedclaw gateway --reset       # Fresh start (careful: clears state)
```

## Troubleshooting Patterns

### Common Error Classes
- **ConfigIncludeError** (`src/config/includes.ts`): Config file includes failed (circular/missing)
  - Fix: Check `~/.closedclaw/config.json5` for `$include` paths
- **MediaFetchError** (`src/media/fetch.ts`): Failed to fetch/process media
  - Fix: Check network, size limits, MIME type support
- **FailoverError** (`src/agents/failover-error.ts`): All model providers failed
  - Fix: Check credentials, rate limits, provider status
- **GatewayLockError** (`src/infra/gateway-lock.ts`): Gateway already running
  - Fix: `pkill -f closedclaw` or check `~/.closedclaw/gateway.lock`
- **DuplicateAgentDirError** (`src/config/agent-dirs.ts`): Multiple agents share same directory
  - Fix: Ensure unique `agentDir` per agent in config

### Test Failures
```bash
# Run failing test in isolation
pnpm test -- path/to/failing.test.ts

# Check for test environment issues
pnpm test:e2e                    # If networking/gateway tests fail
pnpm test:live                   # If provider integration fails (needs creds)

# Coverage failures
pnpm test:coverage               # See what's not covered (need 70%)
```

### Build Failures
```bash
# TypeScript errors
pnpm build                       # Full type check
pnpm check                       # Lint + format issues

# Circular dependency
# Look for import cycles in error output, refactor to break cycle

# Missing types
# Add to src/types/ or import from @types/*
```

### Gateway Not Starting
1. Check port in use: `lsof -i :18789` (default port)
2. Check lock file: `rm ~/.closedclaw/gateway.lock` if stale
3. Check config validity: `closedclaw doctor`
4. Check logs: `~/.closedclaw/logs/gateway-*.log`
5. Try clean start: `closedclaw gateway --reset --verbose`

## File Patterns & Guidelines

**When editing `src/config/types.*.ts`**: Always update `src/config/zod-schema.ts` in parallel. Config types must match Zod validation.

**When editing `src/agents/tools/*.ts`**: Include test file with same basename. Tools must have clear `description` (AI uses this for selection).

**When editing `extensions/*/index.ts`**: Plugin `register()` function is entry point. Use `api.register*()` methods, never direct imports from core.

**When editing `src/gateway/**/*.ts`**: Gateway tests go in separate config (`vitest.gateway.config.ts`). Be mindful of RPC/WebSocket state.

**When editing test files**: Use appropriate config:
- `*.test.ts` → unit tests (fast, no network)
- `*.e2e.test.ts` → e2e tests (networking, multi-instance)
- `*.live.test.ts` → provider tests (requires credentials, costs money)

## Agent Skills (Recommended)

**Skills vs Instructions**: This file (`.github/copilot-instructions.md`) provides always-on coding guidelines. **Agent Skills** (`.github/skills/`) are task-specific capabilities that load on-demand with scripts and resources. Skills are portable across VS Code, Copilot CLI, and coding agent.

**How Skills Work**:
- **Level 1 (Discovery)**: Copilot always knows available skills via `name`/`description` in YAML frontmatter
- **Level 2 (Instructions)**: `SKILL.md` body loads when skill matches your request
- **Level 3 (Resources)**: Additional files (scripts, examples) load only when referenced

**Create a Skill**:
```bash
mkdir -p .github/skills/my-skill
cat > .github/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Description of what this skill does and when to use it
---

# My Skill

Detailed instructions, guidelines, and examples...

## When to Use
- Scenario 1
- Scenario 2

## Workflow
1. Step 1
2. Step 2

## Examples
[Example script](./example.sh)
EOF
```

**Recommended Skills for ClosedClaw**:

1. **`channel-plugin-creator`** - Guide for creating new messaging channel extensions
   - Template files, routing setup, CliDeps extension, test scaffolding
   
2. **`agent-tool-creator`** - Guide for implementing new agent tools
   - Tool factory pattern, parameter helpers, test structure, registration
   
3. **`gateway-debugger`** - Troubleshooting gateway issues
   - Log analysis, port checks, config validation, lock file cleanup
   
4. **`config-migrator`** - Help with config schema changes
   - Type updates, Zod schema sync, migration scripts, validation
   
5. **`test-runner`** - Efficient test execution patterns
   - Narrow execution, coverage checks, live test management
   
6. **`release-manager`** - Version bumping and release workflow
   - Changelog updates, version tagging, npm publishing

**Skill Locations**:
- **Project**: `.github/skills/` (recommended) or `.claude/skills/` (legacy)
- **Personal**: `~/.copilot/skills/` or `~/.claude/skills/`
- **Custom**: Use `chat.agentSkillsLocations` setting for shared skill libraries

**Use Shared Skills**: Browse [github/awesome-copilot](https://github.com/github/awesome-copilot) and [anthropics/skills](https://github.com/anthropics/skills) for community skills. Always review before using.

More info: [VS Code Agent Skills docs](https://code.visualstudio.com/docs/copilot/customization/agent-skills) | [agentskills.io](https://agentskills.io/)

## Resources

- Testing guide: `docs/testing.md`
- Release process: `docs/reference/RELEASING.md`
- Platform guides: `docs/platforms/{mac,ios,android}/`
