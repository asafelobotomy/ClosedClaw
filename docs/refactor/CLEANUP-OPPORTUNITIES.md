# Repository Cleanup & Organization Opportunities

**Date**: February 9, 2026  
**Status**: Analysis & Recommendations  
**Priority**: Medium-High (Phase 1 incomplete cleanup)

## Executive Summary

Analysis reveals **Phase 1 migration was incomplete** - the `scripts/` directory still exists with duplicate content. Additionally, several opportunities exist for further organization improvements and archiving unused content.

**Critical Issue**: Phase 1 moved files to `tools/` but didn't remove `scripts/`, creating duplicates and wasting ~320KB.

## 🚨 Critical Issues

### 1. Phase 1 Incomplete: `scripts/` Directory Still Exists

**Problem**: Phase 1 documentation claims 63 items migrated from `scripts/` to `tools/`, but the original `scripts/` folder was never removed.

**Evidence**:
```bash
$ du -sh scripts/ tools/
320K    scripts/
1.1M    tools/

$ diff -r scripts/ tools/ | grep "^Only in scripts:" | wc -l
57  # 57 items only in scripts/ (duplicates or unmigrated)
```

**Impact**:
- Duplicated files waste space
- Confusion about which version is authoritative
- Broken migration narrative in Phase 1 documentation

**Root Cause**: Files were copied to `tools/` but not removed from `scripts/` via `git mv` or `git rm`.

**Affected Files** (sample):
- `scripts/auth-monitor.sh` duplicated in `tools/dev/`
- `scripts/bench-model.ts` duplicated in `tools/dev/`
- `scripts/committer` duplicated in `tools/ci/`
- `scripts/build_icon.sh` duplicated in `tools/build/`
- ... and 53 more files

### 2. Broken Package.json References

**Problem**: Two package.json scripts still reference `scripts/` directory:

```json
"mac:package": "bash scripts/package-mac-app.sh",
"mac:restart": "bash scripts/restart-mac.sh"
```

**Issue**: These files don't exist in `tools/platform/macos/` with those exact names!

```bash
$ ls tools/platform/macos/
package-mac-dist.sh   # Different name!
notarize-mac-artifact.sh
make_appcast.sh
# restart-mac.sh is missing!
```

**Impact**: Commands may fail or run stale versions from `scripts/`.

## 📋 Organization Opportunities

### 3. Root Directory Clutter

**Files to Relocate**:

| File | Current Location | Suggested Location | Reason |
|------|------------------|-------------------|---------|
| `docs.acp.md` | Root | `docs/reference/acp.md` | Documentation belongs in docs/ |
| `.directory` | Root | Add to `.gitignore` | Desktop file, not version controlled |

**Config Files** (optional consolidation):
```
Root configs (OK to keep at root):
├── .oxlintrc.json
├── .oxfmtrc.jsonc
├── tsconfig.json
├── tsconfig.oxlint.json
├── vitest.*.config.ts (6 files)
└── package.json
```

**Opinion**: Current config layout is acceptable. Moving to `config/` would be overkill for this project.

### 4. `.pi/` Directory Investigation

**Location**: `/home/solon/Documents/ClosedClaw/.pi/` (48KB)

**Contents**:
```
.pi/
├── extensions/
│   ├── diff.ts
│   ├── files.ts
│   ├── prompt-url-widget.ts
│   └── redraws.ts
├── git/
└── prompts/
```

**Usage Analysis**:
- Documentation references `~/.pi/` (user home directory for Pi agent)
- Repo `.pi/` folder is NOT referenced in active code
- Likely legacy or development artifacts

**Recommendation**: **Archive or Remove**
- These appear to be Pi agent extensions/utilities
- If needed, should be in `src/pi/` or `extensions/pi-*`
- If unused, move to `archive/.pi/` or delete

### 5. Archive Directory Content

**Current State**:
```bash
$ ls archive/
update_clawdbot.md  # Only file (12KB)
```

**Analysis**: Near-empty archive directory with single outdated document.

**Options**:
1. **Keep as-is** - Ready for future archived content
2. **Move to docs/archive/** - Consolidate with documentation
3. **Remove if truly obsolete** - Clean slate

**Recommendation**: Keep `archive/` directory for future use, but move `update_clawdbot.md` to `docs/archive/` or delete if obsolete.

## 🗂️ Active Directories (Keep As-Is)

### ✅ Swabble/ - Active Project

**Purpose**: macOS 26 wake-word daemon using Speech.framework  
**Size**: 160KB  
**Status**: **KEEP** - Active, documented, integrated

**Evidence**:
- Referenced in `docs/platforms/mac/voicewake.md`
- Swift package with own README, tests, documentation
- Part of voice wake-word functionality

**Structure**:
```
Swabble/
├── README.md
├── Package.swift
├── Sources/
├── Tests/
├── docs/
└── .github/
```

### ✅ vendor/ - Vendored Dependencies

**Purpose**: Bundled a2ui components  
**Size**: 3.3MB  
**Status**: **KEEP** - Legitimate vendored dependency

**Contents**:
```
vendor/
└── a2ui/  # Canvas A2UI components
```

Referenced in build process via `tools/build/bundle-a2ui.sh` and `canvas-a2ui-copy.ts`.

## 📊 Technical Debt Summary

**Code Quality** (from grep analysis):
```bash
# Very low technical debt!
TODO/FIXME/XXX/HACK comments in src/: 2
Disabled/WIP files: 0
```

**Unused patterns**: None found (no `*.backup`, `*.old`, `*.deprecated` files)

## 🎯 Recommended Actions

### Priority 1: Critical (Complete Phase 1)

**Action 1.1**: Remove duplicate `scripts/` directory
```bash
# After verifying tools/ is complete
git rm -r scripts/
```

**Action 1.2**: Fix package.json references
```json
- "mac:package": "bash scripts/package-mac-app.sh",
+ "mac:package": "bash tools/platform/macos/package-mac-dist.sh",

- "mac:restart": "bash scripts/restart-mac.sh",
+ "mac:restart": "bash tools/platform/macos/restart-mac.sh",
```

**Action 1.3**: Verify or create missing script
```bash
# If restart-mac.sh is missing from tools/platform/macos/
# Either copy from scripts/ or verify alternate naming
```

**Impact**: Completes Phase 1 migration, removes 320KB duplicates, fixes broken references.

### Priority 2: Medium (Organization)

**Action 2.1**: Relocate misplaced documentation
```bash
git mv docs.acp.md docs/reference/acp.md
```

**Action 2.2**: Add `.directory` to `.gitignore`
```bash
echo ".directory" >> .gitignore
git rm --cached .directory
```

**Action 2.3**: Investigate `.pi/` directory
```bash
# Option A: Archive if unused
git mv .pi/ archive/.pi/

# Option B: Remove if confirmed obsolete
git rm -r .pi/

# Option C: Move to proper location if needed
git mv .pi/ src/pi-legacy/
```

**Impact**: Cleaner root directory, proper doc organization.

### Priority 3: Low (Optional)

**Action 3.1**: Archive cleanup
```bash
# If update_clawdbot.md is obsolete
git rm archive/update_clawdbot.md

# Or move to docs
git mv archive/update_clawdbot.md docs/archive/
```

**Action 3.2**: Add archive README
```bash
# Document what belongs in archive/
cat > archive/README.md << 'EOF'
# Archive

This directory contains deprecated or historical content that is not actively maintained but preserved for reference.

## Contents

- (Empty) - Ready for future archived content
EOF
```

**Impact**: Clear archive purpose, organized historical content.

## 📝 Phase 1 Correction Needed

### Documentation Updates Required

**File**: `docs/refactor/PHASE-1-COMPLETE.md`

Current status claims:
> ✅ Old directories removed (scripts/)

**Correction needed**: 
> ⚠️ **Note**: Initial Phase 1 left `scripts/` directory intact. Full cleanup completed in Phase 5 (February 9, 2026).

**File**: `docs/refactor/REPOSITORY-REORGANIZATION-PROPOSAL.md`

Add note to Phase 1 section about follow-up cleanup.

## 🔍 Verification Commands

Before removing `scripts/`:
```bash
# 1. Verify all package.json references point to tools/
grep -r "scripts/" package.json

# 2. Check for any code imports from scripts/
grep -r "\./scripts/" src/ extensions/ --include="*.ts" --include="*.js"

# 3. List what would be removed
ls -la scripts/

# 4. Final size check
du -sh scripts/ tools/
```

## 📈 Impact Assessment

### Disk Space Savings
- Remove `scripts/`: **~320KB**
- Remove `.pi/` (if obsolete): **~48KB**
- Total: **~368KB** (minimal but reduces clutter)

### Developer Experience
- ✅ Eliminates confusion about authoritative script location
- ✅ Completes Phase 1 migration narrative
- ✅ Cleaner root directory
- ✅ Proper documentation organization

### Risk Level
- **Low Risk**: Scripts in `scripts/` are duplicates of `tools/`
- **Medium Risk**: Package.json references need careful verification
- **Low Risk**: `.pi/` removal (appears unused)

## 🚀 Execution Plan

### Phase 5: Repository Cleanup (Est. 30 minutes)

**Step 1**: Verify Migration (5 min)
```bash
# Compare scripts/ and tools/ thoroughly
diff -rq scripts/ tools/ > /tmp/scripts-diff.txt
# Review differences
```

**Step 2**: Fix Package.json (5 min)
```bash
# Update references
# Test affected commands
pnpm mac:package  # Verify it works
```

**Step 3**: Remove Duplicates (5 min)
```bash
git rm -r scripts/
git commit -m "Phase 5: Complete Phase 1 cleanup - remove duplicate scripts/ directory"
```

**Step 4**: Organize Root (10 min)
```bash
git mv docs.acp.md docs/reference/acp.md
echo ".directory" >> .gitignore
git rm --cached .directory
git commit -m "Phase 5: Organize root directory - move docs, ignore desktop files"
```

**Step 5**: Address `.pi/` (5 min)
```bash
# After verification of usage
git mv .pi/ archive/.pi/
git commit -m "Phase 5: Archive unused .pi/ directory"
```

**Step 6**: Documentation (5 min)
- Update Phase 1 completion doc with note
- Create Phase 5 completion doc
- Update main proposal

## ✅ Success Criteria

After Phase 5 completion:
- [ ] `scripts/` directory removed
- [ ] All package.json scripts reference `tools/`
- [ ] All commands tested and working
- [ ] Root directory organized (docs.acp.md moved)
- [ ] `.directory` in .gitignore
- [ ] `.pi/` archived or removed
- [ ] Documentation updated
- [ ] No broken references or imports

## 📚 Related Documentation

- [Phase 1 Complete](./PHASE-1-COMPLETE.md) - Needs correction note
- [Repository Reorganization Proposal](./REPOSITORY-REORGANIZATION-PROPOSAL.md) - Add Phase 5
- `.github/copilot-instructions.md` - Tool usage patterns

---

**Analysis Complete**: February 9, 2026  
**Priority**: Complete Phase 1 cleanup (Phase 5)  
**Estimated Effort**: 30 minutes  
**Risk**: Low (mostly duplicate removal)
