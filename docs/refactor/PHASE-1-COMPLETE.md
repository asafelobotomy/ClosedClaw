# Phase 1 Complete: Scripts → Tools Reorganization

## Summary

Successfully migrated 63 items from flat `scripts/` directory to organized `tools/` structure with 9 logical categories.

## Migration Stats

- **Files migrated**: 57 individual scripts
- **Directories migrated**: 6 subdirectories
- **package.json updates**: 38 script references
- **Total reorganized**: 63 items

## New Structure

```
tools/
├── build/          (5 files)  - Compilation & bundling
├── ci/             (3 files)  - Git hooks, formatting, CI
├── deployment/     (7 files)  - Cloud & ops
│   ├── cloud/      - Tailscale, auth system setup
│   └── systemd/    - Service management
├── dev/            (10 files) - Development utilities
├── docker/         (4 files)  - Container & sandbox
├── docs/           (3 files)  - Documentation generation
├── maintenance/    (11 files) - Release, sync, protocol gen
├── platform/       (6 files)  - Platform-specific
│   ├── ios/        - iOS tooling
│   ├── linux/      - Linux utilities
│   ├── macos/      - macOS packaging & notarization
│   └── mobile/     - Mobile auth scripts
└── testing/        (8 files)  - Test infrastructure
    ├── e2e/        - E2E test scripts
    └── repro/      - Reproduction cases
```

## Category Breakdown

| Category    | Files | Purpose                           |
| ----------- | ----- | --------------------------------- |
| build       | 5     | Compilation, bundling, build info |
| ci          | 3     | Git hooks, formatting, CI setup   |
| deployment  | 7     | Cloud services, systemd           |
| dev         | 10    | Development tools & utilities     |
| docker      | 4     | Containers & sandbox setup        |
| docs        | 3     | Documentation generation          |
| maintenance | 11    | Release checks, syncing, codegen  |
| platform    | 6     | OS-specific scripts               |
| testing     | 8     | Test runners, docker tests        |

## Files Migrated

### Build (5 files)

- `bundle-a2ui.sh` → `tools/build/`
- `canvas-a2ui-copy.ts` → `tools/build/`
- `copy-hook-metadata.ts` → `tools/build/`
- `write-build-info.ts` → `tools/build/`
- `build_icon.sh` → `tools/build/`

### CI/CD (3 files)

- `committer` → `tools/ci/`
- `format-staged.js` → `tools/ci/`
- `setup-git-hooks.js` → `tools/ci/`

### Deployment (7 files)

- `tailscale-enforce.sh` → `tools/deployment/cloud/`
- `tailscale-mullvad.sh` → `tools/deployment/cloud/`
- `tailscale-preflight.sh` → `tools/deployment/cloud/`
- `setup-auth-system.sh` → `tools/deployment/cloud/`
- `termux-auth-widget.sh` → `tools/deployment/cloud/`
- `termux-quick-auth.sh` → `tools/deployment/cloud/`
- `termux-sync-widget.sh` → `tools/deployment/cloud/`

### Development (10 files)

- `auth-monitor.sh` → `tools/dev/`
- `bench-model.ts` → `tools/dev/`
- `debug-claude-usage.ts` → `tools/dev/`
- `fix-unused-vars.ts` → `tools/dev/`
- `run-node.mjs` → `tools/dev/`
- `watch-node.mjs` → `tools/dev/`
- `check-ts-max-loc.ts` → `tools/dev/`
- `postinstall.js` → `tools/dev/`
- `claude-auth-status.sh` → `tools/dev/`
- `ui.js` → `tools/dev/`

### Docker (4 files)

- `sandbox-browser-entrypoint.sh` → `tools/docker/`
- `sandbox-browser-setup.sh` → `tools/docker/`
- `sandbox-common-setup.sh` → `tools/docker/`
- `sandbox-setup.sh` → `tools/docker/`

### Documentation (3 files)

- `build-docs-list.mjs` → `tools/docs/`
- `docs-list.js` → `tools/docs/`
- `changelog-to-html.sh` → `tools/docs/`

### Maintenance (11 files)

- `release-check.ts` → `tools/maintenance/`
- `sync-labels.ts` → `tools/maintenance/`
- `sync-moonshot-docs.ts` → `tools/maintenance/`
- `sync-plugin-versions.ts` → `tools/maintenance/`
- `protocol-gen-swift.ts` → `tools/maintenance/`
- `protocol-gen.ts` → `tools/maintenance/`
- `firecrawl-compare.ts` → `tools/maintenance/`
- `readability-basic-compare.ts` → `tools/maintenance/`
- `sqlite-vec-smoke.mjs` → `tools/maintenance/`
- `update-clawtributors.ts` → `tools/maintenance/`
- `update-clawtributors.types.ts` → `tools/maintenance/`

### Platform-Specific (6 files)

- `package-mac-dist.sh` → `tools/platform/macos/`
- `notarize-mac-artifact.sh` → `tools/platform/macos/`
- `make_appcast.sh` → `tools/platform/macos/`
- `clawlog-linux.sh` → `tools/platform/linux/`
- `ios-team-id.sh` → `tools/platform/ios/`
- `mobile-reauth.sh` → `tools/platform/mobile/`

### Testing (8 files)

- `test-parallel.mjs` → `tools/testing/`
- `test-cleanup-docker.sh` → `tools/testing/`
- `test-install-sh-docker.sh` → `tools/testing/`
- `test-install-sh-e2e-docker.sh` → `tools/testing/`
- `test-live-gateway-models-docker.sh` → `tools/testing/`
- `test-live-models-docker.sh` → `tools/testing/`
- `test-force.ts` → `tools/testing/`
- `zai-fallback-repro.ts` → `tools/testing/repro/`

### Directories (6 subdirectories)

- `scripts/docker/` → `tools/docker/legacy/`
- `scripts/docs-i18n/` → `tools/docs/i18n/`
- `scripts/e2e/` → `tools/testing/e2e/`
- `scripts/pre-commit/` → `tools/ci/pre-commit/`
- `scripts/repro/` → `tools/testing/repro/`
- `scripts/systemd/` → `tools/deployment/systemd/`

## Validation

✅ **Build scripts verified**

```bash
# package.json now references:
tools/build/canvas-a2ui-copy.ts
tools/build/copy-hook-metadata.ts
tools/build/write-build-info.ts
tools/build/bundle-a2ui.sh
```

✅ **Dev scripts verified**

```bash
# All dev commands use new paths:
pnpm dev → node tools/dev/run-node.mjs
pnpm gateway:watch → node tools/dev/watch-node.mjs
```

✅ **File integrity verified**

- All files copied successfully
- Executable permissions preserved
- Original files remain in scripts/ for backwards compatibility

## Backwards Compatibility

**Status**: Old `scripts/` directory remains intact alongside new `tools/` structure.

**Rationale**:

- Zero-risk migration (no files deleted)
- External scripts referencing old paths still work
- Can remove `scripts/` directory in future release after transition period

## Benefits

1. **Improved Discoverability**: Clear categories vs. 49-file flat directory
2. **Maintainability**: Related scripts grouped together
3. **Onboarding**: New contributors can find tools easily
4. **Scalability**: Room for growth within each category
5. **Best Practice Alignment**: Follows 2025 TypeScript/Node.js conventions

## Next Steps

### Immediate

- ✅ Migration complete
- ✅ package.json updated
- ✅ Build validated

### Short-term (1-2 weeks)

- [ ] Update documentation references (README, docs/)
- [ ] Update CI/CD configs if needed
- [ ] Add `tools/` to .github/labeler.yml
- [ ] Communicate change to team

### Medium-term (next release)

- [ ] Monitor for any scripts still referencing old paths
- [ ] Update external documentation/wikis
- [ ] Add deprecation notice in old scripts/

### Long-term (1-2 releases later)

- [ ] Remove old `scripts/` directory
- [ ] Update archive docs referencing old structure

## Migration Script

Automated migration script created at: `tools/maintenance/migrate-scripts.ts`

**Usage**:

```bash
# Dry run (preview only)
pnpm exec tsx tools/maintenance/migrate-scripts.ts --dry-run

# Execute migration
pnpm exec tsx tools/maintenance/migrate-scripts.ts

# Execute without symlinks
pnpm exec tsx tools/maintenance/migrate-scripts.ts --no-symlinks
```

## Impact

**Risk Level**: ✅ **LOW**

- Non-breaking change (old paths still work)
- Package manager automatically uses updated package.json
- Build validated, no runtime changes

**Developer Experience**: ⬆️ **HIGH POSITIVE IMPACT**

- Clear categorization
- Easier navigation
- Professional structure
- Future-proof organization

## Related Documents

- [Repository Reorganization Proposal](./REPOSITORY-REORGANIZATION-PROPOSAL.md)
- [Phase 2 Plan](./REPOSITORY-REORGANIZATION-PROPOSAL.md#phase-2-consolidate-test-utilities)

---

**Completed**: February 9, 2026  
**Executed by**: GitHub Copilot (AI Assistant)  
**Reviewed by**: Repository maintainer
