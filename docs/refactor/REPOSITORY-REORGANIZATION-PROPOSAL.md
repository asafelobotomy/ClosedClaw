# Repository Reorganization Proposal

**Date**: February 9, 2026  
**Status**: Complete - All Phases Finished ✅  
**Impact**: High - Affects repository structure and import paths

## Progress Summary

- ✅ **Phase 1 Complete** (February 9, 2026): Scripts → tools reorganization (63 items migrated)
- ✅ **Phase 2 Complete** (February 9, 2026): Test utilities consolidated (3 files, 37 imports updated)
- ✅ **Phase 3 Complete** (February 9, 2026): Channel architecture documented (no migration needed)
- ✅ **Phase 4 Complete** (February 9, 2026): Skills relocated to .github/skills/ (52 skills, 75 files moved)

## Executive Summary

This document proposes a comprehensive reorganization of the ClosedClaw repository to improve:

- **Developer experience**: Clear, logical directory structure
- **Maintainability**: Separation of concerns by purpose
- **Discoverability**: Intuitive navigation
- **Consistency**: Aligned with modern TypeScript monorepo best practices

## Current Issues

### 1. Scripts Directory Chaos ✅ **RESOLVED - Phase 1 Complete**

**Previous Problem**: 49 scripts of different types mixed in single directory:

- Build/compilation (6 scripts)
- Development tools (8 scripts)
- Platform-specific (12 scripts)
- Docker/containers (6 scripts)
- DevOps/deployment (4 scripts)
- Testing (9 scripts)
- CI/Git (2 scripts)
- Documentation (2 scripts)

**Previous Impact**: Hard to find the right script, no clear ownership, difficult onboarding

**✅ Resolution**: **Phase 1 Complete** (February 9, 2026) - All 63 items (57 files + 6 directories) reorganized into `tools/` with 9 logical categories:

- `tools/build/` - Compilation & bundling
- `tools/ci/` - Git hooks & CI
- `tools/deployment/` - Cloud & systemd
- `tools/dev/` - Development utilities
- `tools/docker/` - Container & sandbox
- `tools/docs/` - Documentation generation
- `tools/maintenance/` - Release & sync
- `tools/platform/` - OS-specific (macos, linux, ios, mobile)
- `tools/testing/` - Test infrastructure

See [Phase 1 Complete Report](./PHASE-1-COMPLETE.md) for details.

### 2. Channel Implementation Inconsistency ✅ **RESOLVED - Phase 3 Complete**

**Previous Problem**: Some channels in `src/`, others in `extensions/`:

- `src/discord/`, `src/telegram/`, `src/slack/`, `src/whatsapp/`, `src/imessage/`, `src/line/`, `src/signal/`
- `extensions/discord/`, `extensions/telegram/`, etc. (different implementations)

**Previous Impact**: Confusion about where channels should live, inconsistent patterns

**✅ Resolution**: **Phase 3 Complete** (February 9, 2026) - Architecture documented, not duplication:

- **`src/<channel>/`** = Core implementations (API clients, heavy logic, ~3000 lines each)
- **`extensions/<channel>/`** = Plugin wrappers (registration, delegates to core, ~100 lines each)
- This separation is **intentional architecture**, not a problem to fix
- Extensions provide clean plugin interface while core stays tightly coupled
- **Decision**: Keep current structure (Option B from proposal)

See [Channel Architecture Documentation](./CHANNEL-ARCHITECTURE.md) for comprehensive details.

### 3. Test Utilities Fragmentation ✅ **RESOLVED - Phase 2 Complete**

**Previous Problem**: Test code scattered across:

- `test/` (root)
- `src/test-helpers/`
- `src/test-utils/`

**Previous Impact**: Unclear where to add test utilities

**✅ Resolution**: **Phase 2 Complete** (February 9, 2026) - All test utilities consolidated into `test/helpers/`:

- Migrated 3 files from `src/test-helpers/` and `src/test-utils/`
- Updated 37 import statements across project
- Removed old directories
- Result: 9 unified test helpers in single location

See [Phase 2 Complete Report](./PHASE-2-COMPLETE.md) for details.

### 4. Monorepo Structure Ambiguity

**Problem**: Multi-purpose folders without clear hierarchy:

- `apps/` (Android, GTK GUI, shared)
- `packages/` (clawdbot, moltbot)
- `extensions/` (24+ plugins)

**Impact**: No clear mental model for code location

## Research: Industry Best Practices

Based on research from:

- TypeScript monorepo patterns (2025)
- Node.js/TS project structure recommendations
- DevOps tooling organization standards

### Key Principles

1. **Separation by Purpose**: Group by function, not technology
2. **Consistency**: Similar things in similar places
3. **Discoverability**: Intuitive paths
4. **Scalability**: Easy to add new modules
5. **Convention**: Follow ecosystem standards

## Proposed Structure

```
closedclaw/
├── .github/              # GitHub-specific config (unchanged)
│   ├── skills/          # Move from root /skills/
│   └── workflows/
├── apps/                # End-user applications
│   ├── cli/            # Main CLI (currently src/cli + entry.ts)
│   ├── android/        # Android mobile app
│   ├── ios/            # iOS mobile app (if exists)
│   ├── macos/          # macOS native app
│   ├── gtk-gui/        # GTK GUI app
│   └── web/            # Web UI
├── packages/           # Reusable libraries (workspace packages)
│   ├── core/          # NEW: Core business logic (from src/*)
│   ├── clawdbot/      # Existing
│   ├── moltbot/       # Existing
│   └── shared/        # NEW: Shared utilities
├── extensions/         # Channel & plugin extensions (unchanged structure)
├── src/               # NEW: Main application source (simplified)
│   ├── agents/
│   ├── config/
│   ├── gateway/
│   ├── providers/
│   ├── routing/
│   ├── security/
│   └── [core modules]
├── tools/             # NEW: Development & operations tooling
│   ├── build/         # Build & compilation scripts
│   │   ├── bundle-a2ui.sh
│   │   ├── canvas-a2ui-copy.ts
│   │   ├── copy-hook-metadata.ts
│   │   └── write-build-info.ts
│   ├── dev/           # Development utilities
│   │   ├── auth-monitor.sh
│   │   ├── bench-model.ts
│   │   ├── debug-claude-usage.ts
│   │   ├── fix-unused-vars.ts
│   │   ├── run-node.mjs
│   │   └── watch-node.mjs
│   ├── platform/      # Platform-specific scripts
│   │   ├── macos/
│   │   │   ├── package-mac-app.sh
│   │   │   ├── notarize-mac-artifact.sh
│   │   │   └── restart-mac.sh
│   │   ├── ios/
│   │   │   └── ios-team-id.sh
│   │   └── android/
│   ├── docker/        # Container & sandbox scripts
│   │   ├── sandbox-*.sh
│   │   └── [existing docker scripts]
│   ├── ci/            # CI/CD & git hooks
│   │   ├── committer
│   │   ├── format-staged.js
│   │   ├── setup-git-hooks.js
│   │   └── pre-commit/
│   ├── testing/       # Test infrastructure
│   │   ├── test-*.sh
│   │   └── test-parallel.mjs
│   ├── docs/          # Documentation generation
│   │   ├── build-docs-list.mjs
│   │   ├── docs-list.js
│   │   └── docs-i18n/
│   ├── deployment/    # Deployment & ops
│   │   ├── systemd/
│   │   └── cloud/
│   │       ├── tailscale-*.sh
│   │       └── setup-auth-system.sh
│   └── maintenance/   # Maintenance & sync
│       ├── release-check.ts
│       ├── sync-*.ts
│       └── protocol-gen*.ts
├── test/              # Test fixtures & integration tests
│   ├── fixtures/
│   ├── integration/
│   └── helpers/       # Test utilities (merged from src/test-*)
├── docs/              # Documentation (unchanged)
├── config/            # Configuration files (root level configs)
│   ├── tsconfig.json
│   ├── vitest.*.config.ts
│   └── [other configs]
└── [other root files]
```

## Detailed Changes

### Phase 1: Scripts Reorganization ⭐ PRIORITY

**Action**: Move `scripts/` → `tools/` with categorization

```bash
# Build scripts
tools/build/
  bundle-a2ui.sh
  canvas-a2ui-copy.ts
  copy-hook-metadata.ts
  write-build-info.ts
  build_icon.sh

# Development
tools/dev/
  auth-monitor.sh
  bench-model.ts
  debug-claude-usage.ts
  fix-unused-vars.ts
  run-node.mjs
  watch-node.mjs
  check-ts-max-loc.ts

# Platform-specific
tools/platform/macos/
  package-mac-app.sh
  notarize-mac-artifact.sh
  restart-mac.sh
  make_appcast.sh
  clawlog-macos.sh

tools/platform/linux/
  clawlog-linux.sh

tools/platform/ios/
  ios-team-id.sh

tools/platform/mobile/
  mobile-reauth.sh

# Docker/Containers
tools/docker/
  [existing docker/ subfolder]
  sandbox-*.sh

# CI/CD
tools/ci/
  committer
  format-staged.js
  setup-git-hooks.js
  pre-commit/

# Testing
tools/testing/
  test-*.sh
  test-parallel.mjs
  e2e/

# Documentation
tools/docs/
  build-docs-list.mjs
  docs-list.js
  docs-i18n/
  changelog-to-html.sh

# Deployment
tools/deployment/systemd/
  [existing systemd/ subfolder]

tools/deployment/cloud/
  tailscale-*.sh
  setup-auth-system.sh

# Maintenance
tools/maintenance/
  release-check.ts
  sync-*.ts
  protocol-gen*.ts
  firecrawl-compare.ts
  readability-basic-compare.ts

# Repro/debugging
tools/repro/
  [existing repro/ subfolder]
```

**Benefits**:

- ✅ Clear categorization by purpose
- ✅ Easy to find scripts
- ✅ Natural ownership boundaries
- ✅ Aligned with "tools" convention (common in TS projects)

**Migration Impact**:

- Update `package.json` script references (47 scripts)
- Update documentation references
- Update CI/CD workflows
- Update any hardcoded paths in scripts

### Phase 2: Test Utilities Consolidation ✅ **COMPLETE**

**Status**: ✅ Completed on February 9, 2026

**Action**: ✅ Consolidated test utilities to unified location

```bash
# Before
src/test-helpers/workspace.ts        # 1 file
src/test-utils/ports.ts               # 2 files
src/test-utils/channel-plugins.ts
test/helpers/                         # 6 files

# After (9 files unified)
test/
  ├── helpers/                        # ✅ All test utilities
  │   ├── workspace.ts                ✨ migrated
  │   ├── ports.ts                    ✨ migrated
  │   ├── channel-plugins.ts          ✨ migrated
  │   ├── envelope-timestamp.ts
  │   ├── inbound-contract.ts
  │   ├── normalize-text.ts
  │   ├── paths.ts
  │   ├── poll.ts
  │   └── temp-home.ts
```

**Results**:

- ✅ 3 files migrated to test/helpers/
- ✅ 37 import statements updated across project
- ✅ 2 old directories removed (src/test-helpers/, src/test-utils/)
- ✅ Single source of truth for test utilities
- ✅ Clear separation: helpers vs actual tests
- ✅ Easier to share test utilities

**Migration Tool**: `tools/maintenance/consolidate-test-utils.ts`

See [Phase 2 Complete Report](./PHASE-2-COMPLETE.md) for comprehensive details.

### Phase 3: Channel Architecture Documentation ✅ **COMPLETE**

**Status**: ✅ Completed on February 9, 2026

**Decision Point**: Should channels in `src/` move to `extensions/`?

**Analysis Result**: Current structure is **intentional architecture**, not duplication.

#### Architecture Pattern (Documented)

```bash
# Core Implementations (heavy logic)
src/
├── discord/          # Discord API client, bot, ~3000 lines
├── telegram/         # Telegram Bot API, ~3500 lines
├── slack/            # Slack Socket Mode, ~2500 lines
├── signal/           # signal-cli wrapper, ~2000 lines
├── imessage/         # imsg CLI wrapper, ~1800 lines
├── line/             # LINE Messaging API, ~1500 lines
└── web/              # WhatsApp Web (baileys), ~4000 lines

# Plugin Wrappers (thin registration layer)
extensions/
├── discord/          # Plugin registration, ~120 lines
├── telegram/         # Plugin registration, ~150 lines
├── slack/            # Plugin registration, ~140 lines
├── signal/           # Plugin registration, ~130 lines
├── imessage/         # Plugin registration, ~110 lines
├── line/             # Plugin registration, ~100 lines
└── whatsapp/         # Plugin registration, ~160 lines
```

**Why This Works**:

- ✅ **Core** (`src/`): Tightly coupled to runtime, direct config/logging/routing access
- ✅ **Extensions** (`extensions/`): Plugin interface, delegates to core via runtime bridge
- ✅ **Clean separation**: Implementation vs interface
- ✅ **No duplication**: Extensions are thin wrappers (~100 lines), core is heavy (~3000 lines)
- ✅ **Runtime isolation**: Extensions import from plugin SDK, not `../../src/`

**Data Flow Example** (Telegram):

```
Agent sends message
  ↓
extensions/telegram/src/channel.ts (Plugin action adapter)
  ↓ getTelegramRuntime().channel.telegram.sendMessageTelegram()
src/telegram/send.ts (Core implementation with Bot API)
  ↓ bot.api.sendMessage()
Telegram API
```

**Decision**: **Option B** - Keep current structure, document the pattern

**Benefits Realized**:

- ✅ No breaking changes
- ✅ Clear architectural documentation
- ✅ Developer understanding improved
- ✅ Pattern documented for new channel additions

**Documentation Created**: [CHANNEL-ARCHITECTURE.md](./CHANNEL-ARCHITECTURE.md)

See [Channel Architecture Documentation](./CHANNEL-ARCHITECTURE.md) for:

- Detailed architecture explanation
- Core vs extension responsibilities
- Data flow diagrams
- Adding new channels guide
- Common questions answered

### Phase 4: Skills Directory Relocation ✅ **COMPLETE**

**Status**: ✅ Completed on February 9, 2026

**Action**: ✅ Moved `/skills/` → `/.github/skills/`

```bash
# Before
ClosedClaw/
├── skills/                    # 52 skill directories at root
│   ├── 1password/
│   ├── discord/
│   ├── github/
│   └── ... (49 more)
└── .github/
    └── skills/                # 8 development skills

# After (60 skills unified)
ClosedClaw/
└── .github/
    └── skills/                # All 60 skills ✨
        ├── README.md
        ├── [8 development skills]
        └── [52 tool skills]   ✨ migrated
```

**Results**:

- ✅ 52 skills migrated to `.github/skills/`
- ✅ 75 files moved with git history preserved
- ✅ Root `skills/` directory removed
- ✅ Aligned with GitHub Copilot best practices
- ✅ Improved skill discovery in VS Code

**Migration Method**: `git mv skills/* .github/skills/` - preserves file history

Per the copilot-instructions, `.github/skills/` is the recommended location for proper GitHub Copilot integration.

See [Phase 4 Complete Report](./PHASE-4-COMPLETE.md) for comprehensive details.

### Phase 5: Configuration Files

**Action** (Optional): Group root configs in `/config/`

```bash
tsconfig.json          → config/tsconfig.json
tsconfig.oxlint.json   → config/tsconfig.oxlint.json
vitest.*.config.ts     → config/vitest.*.config.ts
.oxlintrc.json         → config/oxlintrc.json
.oxfmtrc.jsonc         → config/oxfmtrc.jsonc
```

**Consideration**: Many tools expect configs at root, so this is **LOW PRIORITY / OPTIONAL**

## Migration Strategy

### Approach: Incremental, Non-Breaking

1. **Phase 1a**: Create new structure alongside existing (no breaking changes)
2. **Phase 1b**: Copy scripts to new locations
3. **Phase 1c**: Update package.json to use new paths
4. **Phase 1d**: Deprecation notice in old scripts (with redirect)
5. **Phase 1e**: Remove old scripts (after 1-2 releases)

### Automation Script

```typescript
// tools/maintenance/reorganize-repo.ts

import fs from "fs/promises";
import path from "path";

const MIGRATIONS = [
  // Build scripts
  { from: "scripts/bundle-a2ui.sh", to: "tools/build/bundle-a2ui.sh" },
  { from: "scripts/canvas-a2ui-copy.ts", to: "tools/build/canvas-a2ui-copy.ts" },
  // ... (full mapping)
];

async function migrate() {
  for (const { from, to } of MIGRATIONS) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    console.log(`Copied: ${from} → ${to}`);
  }

  // Update package.json
  const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));
  pkg.scripts = Object.fromEntries(
    Object.entries(pkg.scripts).map(([key, cmd]: [string, string]) => {
      let updated = cmd;
      for (const { from, to } of MIGRATIONS) {
        updated = updated.replace(from, to);
      }
      return [key, updated];
    }),
  );
  await fs.writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
}

migrate().catch(console.error);
```

## Impact Assessment

### Files Affected

- **Scripts**: ~49 files to move
- **Package.json**: ~47 script references to update
- **Documentation**: ~15 docs referencing script paths
- **CI/CD**: 3-5 workflow files

### Risk Level

- **Low Risk**: Scripts are mostly developer-facing
- **Breaking Change**: NO (gradual migration with symlinks)
- **User Impact**: Minimal (mainly maintainer experience)

### Timeline

- ✅ **Phase 1 (Scripts)**: **COMPLETE** (February 9, 2026)
  - Reorganized 63 items (57 files + 6 directories) from `scripts/` to `tools/` with 9 categories
  - Updated 38 package.json references
  - See: [PHASE-1-COMPLETE.md](./PHASE-1-COMPLETE.md)
- ✅ **Phase 2 (Tests)**: **COMPLETE** (February 9, 2026)
  - Consolidated test utilities from 3 locations to unified `test/helpers/`
  - Migrated 3 files, updated 37 imports
  - See: [PHASE-2-COMPLETE.md](./PHASE-2-COMPLETE.md)

- ✅ **Phase 3 (Channels)**: **COMPLETE** (February 9, 2026)
  - Analyzed channel architecture (core vs extensions)
  - Documented intentional separation pattern
  - Decision: Keep current structure (no migration needed)
  - See: [CHANNEL-ARCHITECTURE.md](./CHANNEL-ARCHITECTURE.md)
- ✅ **Phase 4 (Skills)**: **COMPLETE** (February 9, 2026)
  - Relocated 52 skills from `skills/` to `.github/skills/`
  - Moved 75 files with git history preserved
  - Aligned with GitHub Copilot best practices
  - See: [PHASE-4-COMPLETE.md](./PHASE-4-COMPLETE.md)

- **Total**: 2 days (All 4 phases complete via migration + documentation)

## Success Metrics

- ✅ Scripts organized into <10 categories
- ✅ Zero broken CI/CD pipelines
- ✅ Developer survey: "easier to find scripts"
- ✅ Onboarding docs: reduced from X to Y pages

## Alternatives Considered

### Alternative 1: Keep scripts/ as-is

**Rejected**: Doesn't solve discoverability problem

### Alternative 2: Single "scripts" with prefixes

Example: `scripts/build-bundle.sh`, `scripts/dev-auth.sh`

**Rejected**: Doesn't scale, still cluttered

### Alternative 3: Complete monorepo restructure

Move all `src/` into `packages/core`

**Rejected**: Too disruptive, not necessary

## References

- [TypeScript Monorepo Patterns](https://monorepo.tools/typescript)
- [Node.js Project Structure 2025](https://dev.to/pramodboda/recommended-folder-structure-for-nodets-2025-39jl)
- [ClosedClaw Copilot Instructions](/.github/copilot-instructions.md)

## Approval & Next Steps

### Approval Required From

- [ ] @solon (repository owner)
- [ ] Core maintainers

### Next Steps After Approval

1. Create `tools/` directory structure
2. Run migration script
3. Update package.json
4. Update documentation
5. Create symlinks for backwards compatibility
6. Monitor for issues
7. Remove old paths (after 2 releases)

### Discussion Points

- Should we rename `scripts/` → `tools/` or keep both temporarily?
- Timeline: Should this be done in main branch or feature branch?
- Do we want automated checks to prevent scripts being added to wrong locations?

---

**Document Owner**: Repository Maintainers  
**Last Updated**: February 9, 2026  
**Status**: Awaiting Approval
