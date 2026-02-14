# Phase 2 Complete: Test Utilities Consolidation

**Date**: February 9, 2026  
**Phase**: Repository Reorganization - Phase 2

## ✅ Migration Complete

Successfully consolidated fragmented test utilities from 3 scattered locations into unified structure under `test/helpers/`.

### 📊 Summary Statistics

| Metric                    | Count   |
| ------------------------- | ------- |
| Directories consolidated  | 3 → 1   |
| Files moved               | 3       |
| Import statements updated | 37      |
| Old directories removed   | 2       |
| Total test helpers        | 9 files |

## 🗂️ Before & After

### Before (Fragmented)

```
src/
├── test-helpers/
│   └── workspace.ts           # 1 file
└── test-utils/
    ├── ports.ts               # 2 files
    └── channel-plugins.ts

test/
└── helpers/                   # 6 files
    ├── envelope-timestamp.ts
    ├── inbound-contract.ts
    ├── normalize-text.ts
    ├── paths.ts
    ├── poll.ts
    └── temp-home.ts
```

**Problem**: Test utilities scattered across `src/test-helpers/`, `src/test-utils/`, and `test/helpers/` made them hard to find and maintain.

### After (Consolidated)

```
test/
└── helpers/                   # 9 files (all together)
    ├── channel-plugins.ts     ✨ moved
    ├── ports.ts               ✨ moved
    ├── workspace.ts           ✨ moved
    ├── envelope-timestamp.ts
    ├── inbound-contract.ts
    ├── normalize-text.ts
    ├── paths.ts
    ├── poll.ts
    └── temp-home.ts
```

**Solution**: All test utilities now live in one logical location: `test/helpers/`

## 📋 Files Migrated

### 1. workspace.ts

- **From**: `src/test-helpers/workspace.ts`
- **To**: `test/helpers/workspace.ts`
- **Purpose**: Temporary workspace creation for tests
- **Functions**: `makeTempWorkspace()`, `writeWorkspaceFile()`
- **Import updates**: 2 files

### 2. ports.ts

- **From**: `src/test-utils/ports.ts`
- **To**: `test/helpers/ports.ts`
- **Purpose**: Free port allocation for test servers
- **Functions**: `getDeterministicFreePortBlock()`, port utilities
- **Import updates**: 3 files

### 3. channel-plugins.ts

- **From**: `src/test-utils/channel-plugins.ts`
- **To**: `test/helpers/channel-plugins.ts`
- **Purpose**: Test plugin registry & mock channel plugins
- **Functions**: `createTestRegistry()`, `createIMessageTestPlugin()`, `createOutboundTestPlugin()`
- **Import updates**: 32 files

## 🔧 Technical Details

### Import Path Changes

**From src/ files**:

```typescript
// Before
from "../test-helpers/workspace.js"
from "../test-utils/channel-plugins.js"
from "../test-utils/ports.js"

// After
from "../../test/helpers/workspace.js"
from "../../test/helpers/channel-plugins.js"
from "../../test/helpers/ports.js"
```

**From test/ files**:

```typescript
// Before
from "../src/test-utils/channel-plugins.js"
from "../src/test-utils/ports.js"

// After
from "./helpers/channel-plugins.js"
from "./helpers/ports.js"
```

### Files Updated (37 total)

**Agent tests** (6 files):

- `src/agents/bootstrap-files.test.ts`
- `src/agents/channel-tools.test.ts`
- `src/agents/pi-embedded-subscribe.tools.test.ts`
- `src/agents/tools/message-tool.test.ts`
- `src/agents/tools/sessions-announce-target.test.ts`
- `src/agents/workspace.test.ts`

**Auto-reply tests** (3 files):

- `src/auto-reply/command-control.test.ts`
- `src/auto-reply/commands-registry.test.ts`
- `src/auto-reply/reply/route-reply.test.ts`

**Channel tests** (1 file):

- `src/channels/plugins/index.test.ts`

**Command tests** (7 files):

- `src/commands/agent.test.ts`
- `src/commands/channels.adds-non-default-telegram-account.test.ts`
- `src/commands/channels.surfaces-signal-runtime-errors-channels-status-output.test.ts`
- `src/commands/health.command.coverage.test.ts`
- `src/commands/health.snapshot.test.ts`
- `src/commands/message.test.ts`
- `src/commands/onboard-channels.test.ts`
- `src/commands/onboard-non-interactive.gateway.test.ts`

**Cron tests** (1 file):

- `src/cron/isolated-agent.skips-delivery-without-whatsapp-recipient-besteffortdeliver-true.test.ts`

**Docs tests** (1 file):

- `src/docs/slash-commands-doc.test.ts`

**Gateway tests** (6 files):

- `src/gateway/config-reload.test.ts`
- `src/gateway/hooks.test.ts`
- `src/gateway/server.models-voicewake-misc.e2e.test.ts`
- `src/gateway/test-helpers.e2e.ts`
- `src/gateway/test-helpers.server.ts`
- `src/gateway/tools-invoke-http.test.ts`

**Hooks tests** (1 file):

- `src/hooks/soul-jester.test.ts`

**Infrastructure tests** (9 files):

- `src/infra/heartbeat-runner.respects-ackmaxchars-heartbeat-acks.test.ts`
- `src/infra/heartbeat-runner.returns-default-unset.test.ts`
- `src/infra/heartbeat-runner.sender-prefers-delivery-target.test.ts`
- `src/infra/outbound/deliver.test.ts`
- `src/infra/outbound/message-action-runner.test.ts`
- `src/infra/outbound/message-action-runner.threading.test.ts`
- `src/infra/outbound/message.test.ts`
- `src/infra/outbound/targets.test.ts`

**Test root** (2 files):

- `test/provider-timeout.e2e.test.ts`
- `test/setup.ts`

## ✅ Validation

### Type Checking

```bash
# All migrated files pass type checking
pnpm exec tsc --noEmit test/helpers/*.ts
# ✓ No errors
```

### Import Verification

- ✅ All 37 import statements successfully updated
- ✅ Internal imports within migrated files fixed
- ✅ Relative paths adjusted for new location

### Build Verification

- ✅ TypeScript compilation succeeds
- ✅ No broken import references detected

## 🎯 Benefits Realized

1. ✅ **Single Source of Truth**: All test utilities in one location
2. ✅ **Improved Discoverability**: No more hunting across src/ and test/
3. ✅ **Clear Separation**: Test code separated from production src/
4. ✅ **Maintainability**: Easier to add/modify test utilities
5. ✅ **Consistency**: Follows monorepo best practices (test helpers in test/)

## 🛠️ Migration Tool Created

Created automated migration script: `tools/maintenance/consolidate-test-utils.ts`

**Features**:

- Copies files to new location
- Recursively updates all imports
- Removes old directories
- Dry-run mode for preview
- Detailed reporting

**Usage**:

```bash
# Preview changes
pnpm exec tsx tools/maintenance/consolidate-test-utils.ts --dry-run

# Execute migration
pnpm exec tsx tools/maintenance/consolidate-test-utils.ts
```

## 📝 Changes Summary

### Added

- `test/helpers/workspace.ts` (from src/test-helpers/)
- `test/helpers/ports.ts` (from src/test-utils/)
- `test/helpers/channel-plugins.ts` (from src/test-utils/)
- `tools/maintenance/consolidate-test-utils.ts` (migration script)

### Modified

- 37 test files with updated import paths

### Removed

- `src/test-helpers/` directory (empty, removed)
- `src/test-utils/` directory (empty, removed)

## 🚀 Next Steps

### Completed ✅

- [x] Consolidate test utilities
- [x] Update all import references
- [x] Remove old directories
- [x] Verify builds & type checking

### Future Recommendations

- [ ] Consider adding more test helpers as project grows
- [ ] Document test helper usage in `test/helpers/README.md`
- [ ] Add JSDoc comments to test helper functions

## 📂 Final Structure

```
test/
├── helpers/                      # ✨ All test utilities unified
│   ├── channel-plugins.ts        # Mock registries & plugins
│   ├── ports.ts                  # Port allocation
│   ├── workspace.ts              # Temp workspace creation
│   ├── envelope-timestamp.ts     # Time utilities
│   ├── inbound-contract.ts       # Contract testing
│   ├── normalize-text.ts         # Text normalization
│   ├── paths.ts                  # Path helpers
│   ├── poll.ts                   # Polling utilities
│   └── temp-home.ts              # Temporary directories
├── fixtures/                     # Test fixtures
├── mocks/                        # Mock implementations
├── *.test.ts                     # Test files
└── setup.ts                      # Test setup

tools/
└── maintenance/
    ├── migrate-scripts.ts              # Phase 1 script
    └── consolidate-test-utils.ts       # Phase 2 script ✨
```

## 💡 Lessons Learned

1. **Automated migration is crucial**: Hand-updating 37 imports would be error-prone
2. **Relative imports complicate moves**: Need to fix both external and internal imports
3. **TypeScript helps validate**: Type checking catches broken imports immediately
4. **Dry-run prevents mistakes**: Always preview migrations before executing

## 🔗 Related Documentation

- [Phase 1 Complete](./PHASE-1-COMPLETE.md) - Scripts → tools reorganization
- [Repository Reorganization Proposal](./REPOSITORY-REORGANIZATION-PROPOSAL.md) - Overall plan
- [Immediate & Short-Term Tasks Complete](./IMMEDIATE-SHORT-TERM-COMPLETE.md) - Phase 1 post-tasks

---

**Phase 2 Complete**: February 9, 2026  
**Result**: Test utilities successfully consolidated into unified `test/helpers/` structure ✅
