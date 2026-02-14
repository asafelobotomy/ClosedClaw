# Phase 4: Extended Migration Plan

**Date**: February 10, 2026  
**Status**: In Progress  
**Estimated Completion**: 5-10 hours (spread over multiple sessions)

---

## Migration Opportunities Identified

### Summary

- **Timing Constants**: 47 files with hardcoded timeouts/intervals
- **Path Constants**: 21 files with hardcoded path constructions
- **Environment Variables**: 11 files with untyped env var access
- **Network Constants**: 2 files with hardcoded IPs/ports

**Total**: ~50-60 files identified for migration

---

## Priority 1: Test Files (High Impact, Low Risk)

### Batch 1A: Process & Web Tests (~30 minutes)

**Files** (6 files):

- `src/process/exec.test.ts` - Replace `5_000` with `TIMEOUT_TEST_SHORT_MS`
- `src/process/child-process-bridge.test.ts` - Replace `10_000` with `TIMEOUT_TEST_DEFAULT_MS`
- `src/web/logout.test.ts` - Replace `60_000` with `TIMEOUT_TEST_LONG_MS`
- `src/web/auto-reply.web-auto-reply.reconnects-after-connection-close.test.ts` - Replace `15_000`, `60_000`
- `src/web/monitor-inbox.allows-messages-from-senders-allowfrom-list.test.ts` - Replace `60_000`
- `extensions/voice-call/src/webhook-security.test.ts` - Replace `"127.0.0.1:3334"`

**Impact**: 15-20 hardcoded values → constants

### Batch 1B: Telegram Tests (~30 minutes)

**Files** (3 files):

- `src/telegram/bot.media.includes-location-text-ctx-fields-pins.test.ts` - Platform-specific timeouts
- `src/telegram/bot.media.downloads-media-file-path-no-file-download.test.ts` - Platform-specific timeouts

**Impact**: 10+ hardcoded values → constants

### Batch 1C: Agent Tests (~45 minutes)

**Files** (5 files):

- `src/agents/models.profiles.live.test.ts` - Multiple env vars (`ClosedClaw_LIVE_TEST`, etc.)
- `src/agents/skills.buildworkspaceskillstatus.test.ts` - `ClosedClaw_BUNDLED_SKILLS_DIR`
- `src/agents/subagent-registry.persistence.test.ts` - `ClosedClaw_STATE_DIR`
- `src/agents/session-tool-result-guard.tool-result-persist-hook.test.ts` - `ClosedClaw_BUNDLED_PLUGINS_DIR`

**Impact**: 20+ env var accesses → typed constants

**Priority 1 Total**: 14 files, ~1.75 hours, ~45-50 magic values eliminated

---

## Priority 2: Implementation Files (Gateway, Web, Telegram)

### Batch 2A: Telegram Implementation (~30 minutes)

**Files** (3 files):

- `src/telegram/bot-updates.ts` - `5 * 60_000` → `TTL_DEDUPE_MS`
- `src/telegram/monitor.ts` - `30_000` → `TIMEOUT_HTTP_DEFAULT_MS`
- `src/telegram/download.ts` - `30_000`, `60_000` → timing constants

**Impact**: 4 hardcoded values → constants

### Batch 2B: Web Implementation (~30 minutes)

**Files** (2 files):

- `src/web/inbound/dedupe.ts` - `20 * 60_000` → `TTL_RECENT_WEB_MESSAGE_MS`
- `src/web/reconnect.ts` - `30_000` → `TIMEOUT_HTTP_DEFAULT_MS`

**Impact**: 2 hardcoded values → constants

### Batch 2C: Process Utilities (~15 minutes)

**Files** (1 file):

- `src/process/exec.ts` - Default timeout `10_000` → `TIMEOUT_HTTP_SHORT_MS`

**Impact**: 1 hardcoded value → constant

### Batch 2D: Workflows (~15 minutes)

**Files** (1 file):

- `src/workflows/schema.ts` - `60_000` → `TIMEOUT_HTTP_LONG_MS`

**Impact**: 1 hardcoded value → constant

**Priority 2 Total**: 7 files, ~1.5 hours, ~8 magic values eliminated

---

## Priority 3: Path Migrations (Security, Infra, Agents)

### Batch 3A: Security Files (~45 minutes)

**Files** (4 files):

- `src/security/keychain.ts` - Multiple `path.join(os.homedir(), ".closedclaw")` → `getStateDir()`
- `src/security/network-egress.ts` - `path.join(os.homedir(), ".closedclaw")` → `getStateDir()`
- `src/security/audit-logger.ts` - `path.join(os.homedir(), ".closedclaw")` → `getStateDir()`

**Impact**: 6+ path constructions → `getStateDir()`

### Batch 3B: Infra Files (~30 minutes)

**Files** (3 files):

- `src/infra/device-identity.ts` - `path.join(os.homedir(), ".ClosedClaw", "identity")`
- `src/infra/exec-approvals.ts` - Tilde expansion (already has helper)
- `src/infra/provider-usage.auth.ts` - `path.join(os.homedir(), ".pi", "agent", "auth.json")`

**Impact**: 3+ path constructions → path constants

### Batch 3C: Agent Files (~45 minutes)

**Files** (4 files):

- `src/agents/sandbox/constants.ts` - Multiple paths → path builders
- `src/agents/agent-scope.ts` - `path.join(os.homedir(), ".ClosedClaw", "workspace-*")`
- `src/agents/skills/bundled-dir.ts` - Env var + path construction

**Impact**: 5+ path constructions → path builders

### Batch 3D: CLI & Hooks (~30 minutes)

**Files** (4 files):

- `src/cli/update-cli.ts` - `DEFAULT_GIT_DIR`
- `src/hooks/bundled/session-memory/handler.ts` - Workspace path
- `src/hooks/bundled/command-logger/handler.ts` - State dir with env var
- `src/canvas-host/server.ts` - Canvas dir construction

**Impact**: 4+ path constructions → path builders

**Priority 3 Total**: 15 files, ~2.5 hours, ~18 path constructions eliminated

---

## Priority 4: Extensions & Specialized Files

### Batch 4A: Voice Call Extension (~30 minutes)

**Files** (2 files):

- `extensions/voice-call/src/manager.ts` - Voice calls dir
- `extensions/voice-call/src/cli.ts` - Voice calls dir

**Impact**: 2 path constructions → `getVoiceCallsDir()`

### Batch 4B: Browser & Other (~30 minutes)

**Files** (2 files):

- `src/browser/trash.ts` - Trash directory (macOS-specific, keep as-is or add constant)
- `src/browser/chrome.executables.ts` - Desktop file path (keep as-is, too specific)
- `src/infra/update-global.ts` - Bun install path (external, keep as-is)

**Impact**: Review only, might keep external paths as-is

**Priority 4 Total**: 2-4 files, ~1 hour, ~2 values may be migrated

---

## Total Phase 4 Estimation

| Priority           | Files     | Time      | Values Eliminated |
| ------------------ | --------- | --------- | ----------------- |
| P1: Test Files     | 14        | 1.75h     | ~45-50            |
| P2: Implementation | 7         | 1.5h      | ~8                |
| P3: Paths          | 15        | 2.5h      | ~18               |
| P4: Extensions     | 2-4       | 1h        | ~2                |
| **TOTAL**          | **38-40** | **6.75h** | **~73-78**        |

---

## Migration Strategy

### Approach

1. **Batch by domain**: Group related files together
2. **Test after each batch**: Run relevant test suite
3. **Incremental commits**: One batch per commit
4. **Non-breaking**: All changes backward compatible
5. **Document patterns**: Update examples as we go

### Testing Strategy

- After each batch: Run affected test files
- After priority level: Run full test suite segment (unit/gateway/extensions)
- Final validation: Full `pnpm test` run

### Rollback Plan

- Each batch is one commit
- Easy to revert individual batches if issues arise
- No breaking changes means low risk

---

## Session Plan

### Session 1 (Today) - Suggested (~2 hours)

- ✅ Batch 1A: Process & Web Tests (30 min)
- ✅ Batch 1B: Telegram Tests (30 min)
- ✅ Batch 1C: Agent Tests (45 min)
- ✅ Validate Priority 1 (15 min)

**Outcome**: 14 test files migrated, ~45-50 values eliminated

### Session 2 (Optional) - Implementation (~1.5 hours)

- Batch 2A: Telegram Implementation (30 min)
- Batch 2B: Web Implementation (30 min)
- Batch 2C: Process Utilities (15 min)
- Batch 2D: Workflows (15 min)

**Outcome**: 7 implementation files migrated, ~8 values eliminated

### Session 3 (Optional) - Paths (~2.5 hours)

- Batch 3A: Security Files (45 min)
- Batch 3B: Infra Files (30 min)
- Batch 3C: Agent Files (45 min)
- Batch 3D: CLI & Hooks (30 min)

**Outcome**: 15 files migrated, ~18 path constructions eliminated

### Session 4 (Optional) - Extensions & Final (~1 hour)

- Batch 4A: Voice Call Extension (30 min)
- Batch 4B: Review & Document (30 min)

**Outcome**: 2-4 files migrated, final report created

---

## Success Criteria

- ✅ All tests passing after each batch
- ✅ No breaking changes introduced
- ✅ Code more readable and maintainable
- ✅ Documentation updated with examples
- ✅ ~70-80 magic values eliminated

---

## Next Steps

**Immediate**: Start with Batch 1A (Process & Web Tests)  
**Timeline**: Can complete Priority 1 today (~2 hours)  
**Optional**: Continue with Priorities 2-4 in future sessions

Let's proceed! 🚀
