---
name: release-manager
description: Version bumping, changelog updates, and npm publishing workflow for ClosedClaw. Use when preparing releases, updating versions, managing semantic versioning, creating release tags, or publishing to npm. Covers stable, beta, and dev release channels.
---

# Release Manager

This skill helps you manage the ClosedClaw release process, from version bumping to npm publishing. ClosedClaw uses calendar versioning (`vYYYY.M.D`) with stable, beta, and dev channels.

## When to Use

- Preparing a new release
- Bumping version numbers
- Updating CHANGELOG.md
- Creating release tags
- Publishing to npm
- Managing release channels (stable/beta/dev)
- Hotfix releases

## Prerequisites

- Maintainer access to npm package
- Git repository access with push rights
- Understanding of semantic versioning and calendar versioning
- Familiarity with npm dist-tags

## Release Channels

ClosedClaw uses three release channels:

### Stable (latest)
- **Version format**: `vYYYY.M.D` or `vYYYY.M.D-<patch>`
- **NPM dist-tag**: `latest`
- **Purpose**: Production-ready releases
- **Example**: `v2026.2.9`, `v2026.2.9-hotfix.1`

### Beta (prerelease)
- **Version format**: `vYYYY.M.D-beta.N`
- **NPM dist-tag**: `beta`
- **Purpose**: Testing releases before stable
- **Example**: `v2026.2.9-beta.1`

### Dev (development)
- **Version format**: No tag, just publish
- **NPM dist-tag**: `dev`
- **Purpose**: Development builds from `main`
- **Example**: Continuous from `main` branch

## Version Format

ClosedClaw uses **calendar versioning**:
- `YYYY` - Year (e.g., 2026)
- `M` - Month (1-12, no leading zero)
- `D` - Day (1-31, no leading zero)

Examples:
- `2026.2.9` - Release on February 9, 2026
- `2026.2.9-beta.1` - First beta for Feb 9 release
- `2026.2.9-hotfix.1` - First hotfix for Feb 9 release

## Release Workflow

### Stable Release

#### Step 1: Prepare Release Branch

```bash
# Ensure main is clean
git checkout main
git pull origin main

# Create release branch (optional, for safety)
git checkout -b release/2026.2.9
```

#### Step 2: Bump Version

```bash
# Update package.json version
npm version 2026.2.9 --no-git-tag-version

# Or edit manually
# package.json: "version": "2026.2.9"
```

#### Step 3: Update CHANGELOG.md

```markdown
# CHANGELOG.md

## [2026.2.9] - 2026-02-09

### Added
- New feature description (#PR_NUMBER)
- Another feature (@contributor)

### Changed
- Modified behavior (#PR_NUMBER)

### Fixed
- Bug fix description (#PR_NUMBER)
- Security fix (@security-researcher)

### Breaking Changes
- Breaking change description (migration guide in docs)

---
**Thank you to all contributors**: @contributor1, @contributor2

---

## [2026.2.1] - 2026-02-01
...
```

**Changelog Guidelines**:
- Keep latest release at top (no `Unreleased` section)
- Use semantic categories: Added, Changed, Fixed, Breaking Changes
- Include PR numbers: `(#123)`
- Thank contributors: `(@username)` or at end
- Link to issues: `Fixes #123`
- Breaking changes get own section

#### Step 4: Build and Test

```bash
# Clean build
rm -rf dist node_modules
pnpm install
pnpm build

# Run full test suite
pnpm check
pnpm test
pnpm test:e2e

# Test coverage
pnpm test:coverage

# Verify installation
npm pack
npm install -g ./ClosedClaw-2026.2.9.tgz
closedclaw --version
```

#### Step 5: Commit and Tag

```bash
# Commit version bump
git add package.json CHANGELOG.md
git commit -m "Release: v2026.2.9"

# Create annotated tag
git tag -a v2026.2.9 -m "Release v2026.2.9

## Highlights
- Feature 1
- Feature 2
- Bug fix

See CHANGELOG.md for full details."

# Push to remote
git push origin main
git push origin v2026.2.9
```

#### Step 6: Publish to npm

```bash
# Ensure you're logged in
npm whoami

# Publish to npm (dist-tag: latest)
npm publish

# Verify
npm view closedclaw version
npm view closedclaw dist-tags
```

#### Step 7: Create GitHub Release

```bash
# Using GitHub CLI
gh release create v2026.2.9 \
  --title "v2026.2.9" \
  --notes-file RELEASE_NOTES.md

# Or manually on GitHub:
# https://github.com/ClosedClaw/ClosedClaw/releases/new
```

**Release Notes Template**:
```markdown
## 🦞 ClosedClaw v2026.2.9

### ✨ Highlights

- **New Feature**: Description of marquee feature
- **Improvement**: Notable improvement
- **Fix**: Critical bug fix

### 📦 What's Changed

See [CHANGELOG.md](CHANGELOG.md) for full details.

### 🙏 Contributors

Thank you to everyone who contributed to this release:
- @contributor1
- @contributor2

### 📚 Resources

- [Documentation](https://docs.openclaw.ai)
- [Getting Started](https://docs.openclaw.ai/start/getting-started)
- [Discord](https://discord.gg/clawd)
```

### Beta Release

#### Step 1: Bump to Beta Version

```bash
# Create beta version
npm version 2026.2.9-beta.1 --no-git-tag-version
```

#### Step 2: Update Changelog

```markdown
## [2026.2.9-beta.1] - 2026-02-08

Beta release for testing. Stable release planned for 2026-02-09.

### Added (beta)
- Feature in testing

### Known Issues
- Issue to address before stable
```

#### Step 3: Publish to Beta Channel

```bash
# Build and test
pnpm build
pnpm test

# Publish with beta dist-tag
npm publish --tag beta

# Verify
npm view closedclaw dist-tags
# Should show: beta: 2026.2.9-beta.1
```

#### Step 4: Test Beta

```bash
# Install beta in test environment
npm install -g closedclaw@beta

# Verify version
closedclaw --version
# Should show: 2026.2.9-beta.1
```

#### Step 5: Promote to Stable (when ready)

```bash
# Bump to stable version
npm version 2026.2.9 --no-git-tag-version

# Update changelog (remove "beta" notes)
# Remove "Known Issues" section

# Publish to latest
npm publish

# Tag in git
git tag -a v2026.2.9 -m "Release v2026.2.9"
git push origin v2026.2.9
```

### Hotfix Release

For urgent fixes to stable releases:

#### Step 1: Create Hotfix Branch

```bash
# Branch from release tag
git checkout -b hotfix/2026.2.9-hotfix.1 v2026.2.9
```

#### Step 2: Apply Fix

```bash
# Make fix
vim src/path/to/bug.ts

# Commit
git commit -am "Fix: critical bug description"
```

#### Step 3: Bump Version

```bash
# Hotfix version
npm version 2026.2.9-hotfix.1 --no-git-tag-version
```

#### Step 4: Update Changelog

```markdown
## [2026.2.9-hotfix.1] - 2026-02-10

### Fixed
- **CRITICAL**: Security vulnerability in auth (#123)
- Crash on startup with certain configs (#124)

This is a hotfix release. All users on 2026.2.9 should upgrade immediately.
```

#### Step 5: Publish

```bash
# Test
pnpm build && pnpm test

# Publish
npm publish

# Tag
git tag -a v2026.2.9-hotfix.1 -m "Hotfix v2026.2.9-hotfix.1"
git push origin v2026.2.9-hotfix.1

# Merge back to main
git checkout main
git merge hotfix/2026.2.9-hotfix.1
git push origin main
```

### Dev Channel Release

For continuous development builds:

```bash
# Ensure main is current
git checkout main
git pull origin main

# Build
pnpm build

# Publish to dev channel (no version bump needed)
npm publish --tag dev

# Verify
npm view closedclaw dist-tags
# Should show: dev: <current-version>
```

## Pre-Release Checklist

- [ ] All tests pass: `pnpm test && pnpm test:e2e`
- [ ] Coverage threshold met: `pnpm test:coverage`
- [ ] Build succeeds: `pnpm build`
- [ ] Linting passes: `pnpm check`
- [ ] CHANGELOG.md updated with changes
- [ ] package.json version bumped
- [ ] Breaking changes documented
- [ ] Migration guide written (if breaking)
- [ ] Docs updated with new features
- [ ] Contributors thanked in changelog
- [ ] No sensitive data in commit history
- [ ] License headers correct
- [ ] Dependencies audited: `npm audit`

## npm Publishing

### First-Time Setup

```bash
# Login to npm
npm login

# Verify account
npm whoami

# Check registry
npm config get registry
# Should be: https://registry.npmjs.org/

# Two-factor auth (recommended)
npm profile enable-2fa auth-and-writes
```

### Publishing Commands

```bash
# Dry-run (see what would be published)
npm publish --dry-run

# Publish to latest
npm publish

# Publish to beta
npm publish --tag beta

# Publish to dev
npm publish --tag dev

# Publish with 2FA
npm publish --otp=123456
```

### Verify Publication

```bash
# Check version
npm view closedclaw version

# Check dist-tags
npm view closedclaw dist-tags

# Check all versions
npm view closedclaw versions

# Test installation
npm install -g closedclaw@latest
closedclaw --version
```

### Unpublish (Emergency Only)

```bash
# Unpublish specific version (within 72 hours)
npm unpublish closedclaw@2026.2.9

# Deprecate instead (preferred)
npm deprecate closedclaw@2026.2.9 "Critical bug, use 2026.2.9-hotfix.1"
```

## Git Tagging

### Create Tags

```bash
# Lightweight tag
git tag v2026.2.9

# Annotated tag (recommended)
git tag -a v2026.2.9 -m "Release v2026.2.9"

# Tag with full message
git tag -a v2026.2.9 -F- << EOF
Release v2026.2.9

## Changes
- Feature 1
- Feature 2

See CHANGELOG.md
EOF
```

### Manage Tags

```bash
# List tags
git tag -l

# Show tag details
git show v2026.2.9

# Push single tag
git push origin v2026.2.9

# Push all tags
git push origin --tags

# Delete local tag
git tag -d v2026.2.9

# Delete remote tag
git push origin :refs/tags/v2026.2.9
```

## Version Management

### Check Current Version

```bash
# Check package.json
node -p "require('./package.json').version"

# Check installed version
closedclaw --version

# Check npm registry
npm view closedclaw version
```

### Update Dependencies

```bash
# Before release, update deps
npm outdated

# Update non-breaking
npm update

# Update major versions (careful)
npm install package@latest

# Verify nothing broke
pnpm test
```

## Release Scripts

### Automated Release Script

```bash
#!/usr/bin/env bash
# scripts/release.sh

set -euo pipefail

VERSION=$1
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  exit 1
fi

echo "🦞 Releasing ClosedClaw v${VERSION}"

# Pre-flight checks
echo "Running tests..."
pnpm test && pnpm test:e2e

echo "Building..."
pnpm build

echo "Bumping version..."
npm version "$VERSION" --no-git-tag-version

echo "Update CHANGELOG.md manually, then press Enter"
read -r

echo "Committing..."
git add package.json CHANGELOG.md
git commit -m "Release: v${VERSION}"

echo "Tagging..."
git tag -a "v${VERSION}" -m "Release v${VERSION}"

echo "Pushing..."
git push origin main
git push origin "v${VERSION}"

echo "Publishing to npm..."
npm publish

echo "✅ Released v${VERSION}"
```

Usage:
```bash
./scripts/release.sh 2026.2.9
```

## Troubleshooting

### npm Publish Fails

```bash
# Check authentication
npm whoami

# Re-login
npm logout
npm login

# Check permissions
npm access ls-collaborators closedclaw

# Check 2FA
npm profile enable-2fa
```

### Version Conflicts

```bash
# If version already published
npm view closedclaw versions

# Bump to next version
npm version patch --no-git-tag-version

# Or use hotfix version
npm version 2026.2.9-hotfix.1 --no-git-tag-version
```

### Tag Already Exists

```bash
# Delete local tag
git tag -d v2026.2.9

# Delete remote tag
git push origin :refs/tags/v2026.2.9

# Recreate
git tag -a v2026.2.9 -m "Release v2026.2.9"
git push origin v2026.2.9
```

### Build Fails

```bash
# Clean and rebuild
rm -rf dist node_modules
pnpm install
pnpm build

# Check Node version
node --version
# Should be ≥22

# Check for breaking changes in deps
npm ls
```

## Best Practices

1. **Test thoroughly**: Run full test suite before release
2. **Update docs**: Ensure documentation reflects new features
3. **Breaking changes**: Clearly mark and provide migration guide
4. **Semantic releases**: Use beta for testing, stable for production
5. **Hotfixes**: Separate branch, minimal changes, quick turnaround
6. **Communication**: Announce in Discord, update website
7. **Rollback plan**: Know how to deprecate/unpublish if needed
8. **Automation**: Use scripts to reduce human error
9. **Verification**: Test installation after publish
10. **Gratitude**: Thank contributors in changelog and release notes

## Related Files

- `package.json` - Version number
- `CHANGELOG.md` - Release notes
- `scripts/release.sh` - Release automation
- `docs/reference/RELEASING.md` - Detailed release process
- `.github/workflows/release.yml` - CI/CD for releases
