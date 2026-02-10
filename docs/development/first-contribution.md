# First Contribution Guide

Welcome to ClosedClaw! This guide will walk you through making your first contribution, from setup to submitting a pull request.

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js ≥ 22.12.0** (check with `node --version`)
- **pnpm** (recommended) - Install: `npm install -g pnpm`
  - Alternative: npm or bun also work
- **Git** for version control
- A **GitHub account**
- A code editor (VS Code, Cursor, or your preference)

### Optional but Recommended

- **Docker** (for testing containerized features)
- **Platform-specific tools**:
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential` or equivalent
  - Windows: WSL2 strongly recommended

---

## 🚀 Getting Started

### 1. Fork and Clone

1. **Fork the repository** on GitHub: [ClosedClaw/ClosedClaw](https://github.com/ClosedClaw/ClosedClaw)
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ClosedClaw.git
   cd ClosedClaw
   ```
3. **Add upstream remote** (to sync with main repo):
   ```bash
   git remote add upstream https://github.com/ClosedClaw/ClosedClaw.git
   ```

### 2. Install Dependencies

```bash
# Install all dependencies (this may take a few minutes)
pnpm install

# Build the UI (auto-installs UI dependencies on first run)
pnpm ui:build

# Build the project
pnpm build
```

**Troubleshooting**:
- If `pnpm install` fails, try `pnpm install --force`
- If native modules fail, check platform-specific docs in `docs/platforms/`
- On Windows, use WSL2 for best compatibility

### 3. Verify Installation

```bash
# Run tests to ensure everything works
pnpm test

# Run linter and formatter
pnpm check

# Try running the CLI
pnpm closedclaw --version
```

If all commands succeed, you're ready to contribute! ✅

---

## 🛠️ Development Workflow

### Creating a Feature Branch

```bash
# Sync with upstream first
git checkout main
git pull upstream main

# Create a feature branch (use descriptive names)
git checkout -b feature/add-awesome-feature
# or: git checkout -b fix/bug-description
```

**Branch naming conventions**:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/improvements

### Making Changes

1. **Make your changes** in the appropriate files
2. **Test your changes**:
   ```bash
   # Run relevant tests
   pnpm test -- src/path/to/changed-file.test.ts
   
   # Run full test suite
   pnpm test
   
   # Check code quality
   pnpm check
   ```

3. **Build the project**:
   ```bash
   pnpm build
   ```

### Code Style Guidelines

ClosedClaw uses:
- **TypeScript strict mode** - No `any` types
- **ESM imports** - Always use `.js` extensions in imports
- **Oxlint** for linting
- **Oxfmt** for formatting

**Auto-fix issues**:
```bash
pnpm lint:fix
```

### Committing Changes

We use a **commit script** for proper staging:

```bash
# Stage and commit specific files
./scripts/committer "feat: add awesome feature" src/file1.ts src/file2.ts

# Or manually:
git add src/file1.ts src/file2.ts
git commit -m "feat: add awesome feature"
```

**Commit message format**:
```
<type>: <short description>

[optional longer description]

[optional breaking changes]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring
- `chore`: Build/tooling changes
- `security`: Security improvements

**Examples**:
```bash
feat: add skill signature verification
fix: resolve keychain access on Linux
docs: update installation guide
test: add audit logging integration tests
```

---

## 🎯 Common Contribution Patterns

### Adding a New Agent Tool

See detailed guide: [Adding Tools](adding-tools.md)

**Quick steps**:
1. Create `src/agents/tools/my-tool.ts`
2. Implement factory function returning `AnyAgentTool`
3. Add tests in `src/agents/tools/my-tool.test.ts`
4. Register in `src/agents/openclaw-tools.ts` or `bash-tools.ts`
5. Document in `docs/tools/my-tool.md`

### Adding a New Channel

See detailed guide: [Adding Channels](adding-channels.md)

**Quick steps**:
1. Create extension: `extensions/my-channel/`
2. Implement `ChannelPlugin` interface
3. Add `ClosedClaw.plugin.json` manifest
4. Extend `CliDeps` in `src/cli/deps.ts`
5. Add tests and documentation

### Fixing a Bug

**Quick steps**:
1. Create a failing test that reproduces the bug
2. Fix the bug
3. Verify the test passes
4. Add regression test if needed
5. Update relevant documentation

### Writing Documentation

**Quick steps**:
1. Create/edit markdown files in `docs/`
2. Follow existing structure and style
3. Add internal links (root-relative, no `.md` extensions)
4. Test locally with `pnpm docs:dev`
5. Update `docs/README.md` index if adding new doc

---

## 🧪 Testing

### Running Tests

```bash
# All tests (parallelized)
pnpm test

# Specific test file
pnpm test -- src/security/crypto.test.ts

# Specific test case
pnpm test -- src/security/crypto.test.ts -t "encrypts data"

# Watch mode (auto-rerun on changes)
pnpm test:watch:unit

# Test coverage
pnpm test:coverage

# E2E tests (heavier, requires networking)
pnpm test:e2e
```

### Writing Tests

ClosedClaw uses **Vitest**. Tests are co-located with source files:

```typescript
// src/my-module.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from './my-module';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('should handle edge cases', () => {
    expect(() => myFunction('')).toThrow();
  });
});
```

**Test types**:
- `*.test.ts` - Unit tests (fast, no networking)
- `*.e2e.test.ts` - End-to-end tests (networking, multi-instance)
- `*.live.test.ts` - Live provider tests (requires credentials, costs money)

**Coverage requirements**: 70%+ overall, 90%+ for security-critical paths

---

## 🔍 Debugging

### Running in Development Mode

```bash
# Gateway with hot-reload
pnpm gateway:watch

# Agent in dev mode
pnpm dev:agent

# TUI in dev mode
pnpm dev:tui
```

### Debug Tools

```bash
# System diagnostics
pnpm doctor

# Current status
pnpm status

# View logs
tail -f ~/.closedclaw/logs/*.log
```

### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Gateway",
      "program": "${workspaceFolder}/tools/dev/run-node.mjs",
      "args": ["gateway", "--verbose"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${file}"],
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 📤 Submitting Your Contribution

### Before Submitting

**Pre-flight checklist**:
- [ ] Code builds without errors: `pnpm build`
- [ ] All tests pass: `pnpm test`
- [ ] Linter passes: `pnpm lint`
- [ ] Formatter passes: `pnpm format`
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow convention

**Quick check**:
```bash
pnpm build && pnpm check && pnpm test
```

### Push Your Branch

```bash
git push origin feature/add-awesome-feature
```

### Open a Pull Request

1. Go to [ClosedClaw/ClosedClaw](https://github.com/ClosedClaw/ClosedClaw)
2. Click **"Pull requests"** → **"New pull request"**
3. Click **"compare across forks"**
4. Select your fork and branch
5. Fill in the PR template:
   - **Title**: Clear, concise description
   - **Description**: What, why, and how
   - **Related issues**: Link with `Fixes #123`
   - **Testing**: Describe how you tested
   - **Screenshots**: If UI changes

### PR Review Process

1. **Automated checks** run (tests, lints, builds)
2. **Maintainers review** your code
3. **Address feedback** if requested:
   ```bash
   # Make changes
   git add .
   git commit -m "fix: address review feedback"
   git push origin feature/add-awesome-feature
   ```
4. **Approval and merge** by maintainers

---

## 💡 Finding Your First Issue

### Good First Issues

Look for issues labeled:
- `good first issue` - Perfect for newcomers
- `help wanted` - Community contributions welcome
- `documentation` - Doc improvements
- `tests` - Test additions

**Browse**: [Good First Issues](https://github.com/ClosedClaw/ClosedClaw/labels/good%20first%20issue)

### Contribution Ideas

**Easy**:
- Fix typos in documentation
- Add examples to existing docs
- Improve error messages
- Add unit tests for uncovered code

**Medium**:
- Implement new agent tools
- Add platform-specific features
- Improve CLI output formatting
- Add integration tests

**Challenging**:
- New channel integrations
- Performance optimizations
- Security enhancements
- Multi-agent collaboration features

---

## 📚 Additional Resources

### Documentation
- [Main Documentation Index](../README.md)
- [Contributing Guidelines](../../CONTRIBUTING.md)
- [Testing Guide](../testing.md)
- [Debugging Guide](../debugging.md)
- [Security Documentation](../security/)

### Development Guides
- [Adding Tools](adding-tools.md) *(coming soon)*
- [Adding Channels](adding-channels.md) *(coming soon)*
- [Extension Development](../plugins/creating-extensions.md) *(coming soon)*
- [Architecture Overview](../refactor/closedclaw-fork-roadmap.md)

### Community
- [Discord Server](https://discord.gg/clawd) - #dev-help channel
- [GitHub Discussions](https://github.com/ClosedClaw/ClosedClaw/discussions)
- [DeepWiki](https://deepwiki.com/ClosedClaw/ClosedClaw)

---

## 🆘 Getting Help

### Stuck on Setup?
- Check [platform-specific docs](../platforms/)
- Ask in Discord #dev-help
- Open a GitHub Discussion

### Code Questions?
- Review [architecture docs](../refactor/)
- Search existing issues/PRs
- Ask in Discord #dev-help

### Not Sure Where to Start?
- Look for `good first issue` labels
- Ask maintainers in Discord
- Read other contributors' PRs

---

## 🎉 After Your First Contribution

**Congratulations!** You're now a ClosedClaw contributor!

### Next Steps

1. **Celebrate** 🎉 - You've made an impact!
2. **Join Discord** - Introduce yourself in #introductions
3. **Find more issues** - Keep contributing!
4. **Help others** - Answer questions in #dev-help
5. **Become a regular** - Consistent contributions lead to recognition

### Recognition

- Your name appears in [CHANGELOG.md](../../CHANGELOG.md)
- Contributors are listed in GitHub insights
- Active contributors may become maintainers

---

## 📝 Common Questions

### Q: How long does review take?
**A**: Usually 1-7 days. Ping maintainers in Discord if > 1 week.

### Q: Can I work on multiple issues?
**A**: Yes, but finish one before starting another for best results.

### Q: What if I can't finish?
**A**: No problem! Comment on the issue/PR letting us know.

### Q: How do I become a maintainer?
**A**: Consistent, quality contributions + active community participation.

### Q: Can I contribute to docs only?
**A**: Absolutely! Documentation is crucial and very welcome.

### Q: What's the code of conduct?
**A**: Be respectful, inclusive, and constructive. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## 🔗 Quick Links

- [Repository](https://github.com/ClosedClaw/ClosedClaw)
- [Issues](https://github.com/ClosedClaw/ClosedClaw/issues)
- [Pull Requests](https://github.com/ClosedClaw/ClosedClaw/pulls)
- [Discord](https://discord.gg/clawd)
- [Documentation](../README.md)

---

**Thank you for contributing to ClosedClaw!** Every contribution, no matter how small, makes a difference. We're excited to have you as part of the community! 🦞

---

**Last Updated**: February 10, 2026  
**Maintainers**: See [CONTRIBUTING.md](../../CONTRIBUTING.md) for maintainer list
