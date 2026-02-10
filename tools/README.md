# Tools & Scripts

Utility scripts for building, testing, deploying, and maintaining ClosedClaw. Most are invoked via npm scripts in [package.json](../package.json) for convenience.

## Quick Reference

```bash
# Development
pnpm dev                   # Run CLI in dev mode (tsx hot-reload)
pnpm dev:agent            # Run agent directly
pnpm dev:gateway          # Run gateway with verbose logging
pnpm dev:tui              # Run TUI in dev mode
pnpm gateway:watch        # Gateway with hot-reload

# Quality Gates
pnpm check                # Lint + format check
pnpm lint                 # Oxlint with type-aware rules
pnpm format               # Oxfmt format check
pnpm build                # Full TypeScript build
pnpm test                 # Parallel test suite (unit/extensions/gateway)
pnpm test:coverage        # Coverage report (70% required)

# Testing Suites
pnpm test:unit            # Fast unit tests only
pnpm test:gateway         # Gateway control plane tests
pnpm test:extensions      # Plugin tests
pnpm test:e2e             # End-to-end integration tests
pnpm test:live            # Real provider tests (requires credentials)
pnpm test:security        # Security-critical test subset
pnpm test:watch:unit      # Watch mode for active development

# Docker Tests (Full E2E)
pnpm test:docker:all             # All Docker tests
pnpm test:docker:onboard         # Installation + onboarding flow
pnpm test:docker:plugins         # Plugin install/load/invoke
pnpm test:docker:gateway-network # Gateway networking
pnpm test:docker:live-models     # Real model providers
pnpm test:docker:cleanup         # Container cleanup

# Dependencies
pnpm deps:audit           # Security audit
pnpm deps:outdated        # Check for updates
pnpm deps:update          # Interactive update

# Utilities
pnpm doctor               # Run diagnostics
pnpm status               # Check gateway/channels status
pnpm plugins:sync         # Sync plugin versions
pnpm release:check        # Pre-release validation
```

## Organization

### build/
Build-time utilities for compilation and asset bundling.

- **bundle-a2ui.sh**: Bundle Canvas A2UI components (React subset for agent UIs)
- **canvas-a2ui-copy.ts**: Copy Canvas artifacts to dist/
- **copy-hook-metadata.ts**: Extract hook metadata for extension API docs
- **write-build-info.ts**: Embed build timestamp and git info into `dist/build-info.json`
- **build_icon.sh**: macOS app icon generation

**Invoked by**: `pnpm build` runs full sequence: `canvas:a2ui:bundle` → `tsc` → copy scripts

### ci/
Continuous integration utilities for linting, formatting, and Git hooks.

- **committer**: Scoped staging helper - `tools/ci/committer "msg" file1.ts file2.ts`
- **format-staged.js**: Pre-commit formatter (Oxfmt on staged files)
- **setup-git-hooks.js**: Install Git hooks from `git-hooks/`
- **pre-commit/**: Hook scripts (run via prek or Git)

**Invoked by**: `postinstall` sets up hooks automatically

**Usage**:
```bash
# Scoped commit (safer than `git add .`)
tools/ci/committer "fix: update config types" src/config/types.ts

# Manual hook setup
node tools/ci/setup-git-hooks.js
```

### deployment/
Cloud deployment configurations and systemd services.

- **cloud/**: PaaS configs (Render, Railway, Northflank, Fly.io)
- **systemd/**: Linux systemd unit files for gateway daemon

**Referenced by**: Deployment docs in [docs/](../docs/)

### dev/
Development workflow utilities (hot-reload, debugging, post-install).

- **run-node.mjs**: Development runner with tsx (TypeScript execution)
- **watch-node.mjs**: File watcher for hot-reload gateway
- **ui.js**: Web UI build/dev server wrapper
- **postinstall.js**: Post-install cleanup and Git hooks setup
- **auth-monitor.sh**: Monitor Claude auth status (cookies/sessions)
- **claude-auth-status.sh**: Check Claude authentication validity
- **debug-claude-usage.ts**: Debug Claude API usage tracking
- **bench-model.ts**: Benchmark model inference speed
- **check-ts-max-loc.ts**: Enforce max lines-of-code per file (~500-700)
- **fix-unused-vars.ts**: Auto-remove unused imports/variables

**Invoked by**:
- `pnpm dev` → `run-node.mjs`
- `pnpm gateway:watch` → `watch-node.mjs`
- `pnpm ui:build` / `pnpm ui:dev` → `ui.js`
- `pnpm postinstall` → `postinstall.js` (auto-run after install)

**Usage**:
```bash
# Run specific command in dev mode
pnpm dev gateway --verbose
pnpm dev agent --mode rpc

# Hot-reload gateway
pnpm gateway:watch

# Check LOC limits
pnpm check:loc

# Debug auth issues
bash tools/dev/auth-monitor.sh
bash tools/dev/claude-auth-status.sh
```

### docker/
Docker setup scripts for sandbox environments and test isolation.

- **sandbox-setup.sh**: Full sandbox environment (node pairing, security)
- **sandbox-browser-setup.sh**: Browser-enabled sandbox (Playwright/Puppeteer)
- **sandbox-common-setup.sh**: Shared setup utilities
- **sandbox-browser-entrypoint.sh**: Browser container entrypoint
- **legacy/**: Old Docker scripts (archived)

**Invoked by**: Dockerfiles (`Dockerfile.sandbox`, `Dockerfile.sandbox-browser`)

**Usage**:
```bash
# Build sandbox image
docker build -f Dockerfile.sandbox -t closedclaw-sandbox .

# Run sandbox container
docker run --rm -it closedclaw-sandbox
```

### docs/
Documentation generation and internationalization utilities.

- **build-docs-list.mjs**: Generate structured docs inventory (JSON)
- **docs-list.js**: List all documentation files with stats
- **changelog-to-html.sh**: Convert CHANGELOG.md → HTML for docs site
- **i18n/**: Internationalization scripts (Chinese, etc.)

**Invoked by**:
- `pnpm docs:bin` → `build-docs-list.mjs`
- `pnpm docs:list` → `docs-list.js`

**Usage**:
```bash
# Generate docs inventory
pnpm docs:bin

# List all docs
pnpm docs:list

# Start docs dev server
pnpm docs:dev
```

### maintenance/
Repository maintenance, migrations, and sync utilities.

- **sync-plugin-versions.ts**: Sync version numbers across extensions
- **sync-labels.ts**: Sync GitHub labels from `.github/labeler.yml`
- **sync-moonshot-docs.ts**: Sync Moonshot AI provider docs
- **update-clawtributors.ts**: Update contributors map (clawtributors-map.json)
- **release-check.ts**: Validate release readiness (CHANGELOG, versions, tests)
- **protocol-gen.ts**: Generate protocol types from schemas
- **migrate-scripts.ts**: Database/config migration utilities
- **consolidate-test-utils.ts**: Test utilities consolidation (one-time)
- **sqlite-vec-smoke.mjs**: Smoke test for sqlite-vec extension
- **firecrawl-compare.ts**: Compare Firecrawl scraping configs
- **readability-basic-compare.ts**: Compare readability parsers

**Invoked by**:
- `pnpm plugins:sync` → `sync-plugin-versions.ts`
- `pnpm release:check` → `release-check.ts`
- `pnpm protocol:gen` → `protocol-gen.ts`

**Usage**:
```bash
# Sync plugin versions before release
pnpm plugins:sync

# Pre-release checks
pnpm release:check

# Generate protocol types
pnpm protocol:gen

# Update contributors
node --import tsx tools/maintenance/update-clawtributors.ts
```

### platform/
Platform-specific build and deployment scripts.

- **linux/**: Linux packaging and systemd setup
- **mobile/**: iOS/Android build scripts

**Invoked by**: Platform-specific npm scripts (`android:*`, `ios:*`)

**Usage**:
```bash
# Android
pnpm android:assemble      # Build APK
pnpm android:install       # Install to device
pnpm android:run          # Build + install + launch

# iOS (macOS only)
pnpm ios:build            # Xcode build
pnpm ios:open             # Open in Xcode
```

### testing/
Test execution, parallelization, Docker isolation, and E2E scenarios.

- **test-parallel.mjs**: Parallel test runner (splits unit/extensions/gateway)
- **test-force.ts**: Force-run specific test files (bypass filters)
- **test-cleanup-docker.sh**: Clean up test containers
- **test-install-sh-docker.sh**: Test `install.sh` in Docker
- **test-install-sh-e2e-docker.sh**: E2E install flow with real models
- **test-live-models-docker.sh**: Test model providers in Docker
- **test-live-gateway-models-docker.sh**: Gateway + models integration
- **e2e/**: End-to-end test scenarios
  - `onboard-docker.sh`: Full onboarding flow
  - `gateway-network-docker.sh`: Gateway networking tests
  - `plugins-docker.sh`: Plugin install/load/invoke
  - `qr-import-docker.sh`: QR code import flow
  - `doctor-install-switch-docker.sh`: Doctor + install + channel switching
- **repro/**: Reproduction scripts for debugging issues

**Invoked by**: `pnpm test` → `test-parallel.mjs` (default)

**Usage**:
```bash
# Parallel test execution (default)
pnpm test

# Specific test suite
pnpm test:unit
pnpm test:gateway
pnpm test:extensions
pnpm test:e2e
pnpm test:live

# Docker E2E tests
pnpm test:docker:all
pnpm test:docker:onboard
pnpm test:docker:plugins

# Force-run specific test
node --import tsx tools/testing/test-force.ts src/config/config.test.ts

# Install script E2E
pnpm test:install:e2e              # Full flow
pnpm test:install:e2e:anthropic    # Anthropic models only
pnpm test:install:e2e:openai       # OpenAI models only
```

## Adding New Scripts

When adding utility scripts:

### 1. Choose Location

- **build/**: Build-time, runs during `pnpm build`
- **ci/**: Git hooks, pre-commit, linting
- **deployment/**: Cloud configs, systemd
- **dev/**: Development workflow (hot-reload, debugging)
- **docker/**: Container setup and isolation
- **docs/**: Documentation generation
- **maintenance/**: Repo maintenance, migrations
- **platform/**: Platform-specific builds
- **testing/**: Test execution and E2E scenarios

### 2. File Naming

- Use kebab-case: `my-script.ts`, `test-feature.sh`
- Prefix test scripts: `test-*.sh`, `test-*.ts`
- Suffix type utilities: `*-gen.ts`, `*-sync.ts`, `*-check.ts`

### 3. Add npm Script

Add convenience alias to [package.json](../package.json):

```json
{
  "scripts": {
    "my:command": "node --import tsx tools/category/my-script.ts"
  }
}
```

### 4. Documentation

Add inline comments and JSDoc:

```typescript
/**
 * My Script - Brief description
 * 
 * Longer explanation of what this script does and when to use it.
 * 
 * Usage: pnpm my:command [options]
 * 
 * Environment Variables:
 * - MY_VAR: Description
 */
```

Update this README under appropriate category.

### 5. Error Handling

Scripts should:
- Exit with non-zero on failure
- Print clear error messages
- Support `--help` flag when arguments are expected

```typescript
if (process.argv.includes('--help')) {
  console.log('Usage: ...');
  process.exit(0);
}

try {
  // Script logic
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
```

## Script Patterns

### TypeScript Execution

Use tsx loader for TypeScript scripts:

```bash
node --import tsx tools/path/to/script.ts
```

Or via package.json:
```json
{
  "scripts": {
    "my:script": "node --import tsx tools/my-script.ts"
  }
}
```

### Environment Variables

Common variables used across scripts:

- **ClosedClaw_SKIP_CHANNELS**: Skip channel initialization (faster gateway start)
- **ClosedClaw_PROFILE**: Switch config profile (`dev`, `test`, `prod`)
- **ClosedClaw_LIVE_TEST**: Enable live provider tests (requires credentials)
- **ClosedClaw_E2E_MODELS**: Model filter for E2E tests (`anthropic`, `openai`)
- **DEBUG**: Enable debug logging (`ClosedClaw:*`, `@mariozechner:*`)

### Parallel Execution

Use xargs for parallel file processing:

```bash
find src -name '*.ts' | xargs -P 4 -I {} bash -c 'process_file "$1"' _ {}
```

### Docker Isolation

Test scripts often run in Docker for clean environments:

```bash
docker build -f Dockerfile.sandbox -t test-image .
docker run --rm -e ClosedClaw_LIVE_TEST=1 test-image pnpm test:live
```

## Related Documentation

- [Testing Guide](../docs/testing.md) - Test strategy and execution
- [First Contribution](../docs/development/first-contribution.md) - Developer setup
- [Repository Review](../REPOSITORY-REVIEW-2026-02-10.md) - Architecture decisions
- [Release Process](../docs/reference/RELEASING.md) - Version management

## Troubleshooting

### Script Not Found

Check that:
1. Script exists at `tools/<category>/<script>`
2. File is executable (chmod +x for `.sh`)
3. npm script points to correct path

### TypeScript Import Errors

Use tsx loader:
```bash
node --import tsx tools/script.ts
```

Not:
```bash
ts-node tools/script.ts  # Don't use ts-node
```

### Permission Denied

Make shell scripts executable:
```bash
chmod +x tools/**/*.sh
```

### Docker Test Failures

Clean up containers:
```bash
pnpm test:docker:cleanup
docker system prune -f
```

Check Docker daemon:
```bash
docker info
```
