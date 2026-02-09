# ClosedClaw Agent Skills

This directory contains [Agent Skills](https://agentskills.io/) for GitHub Copilot to enhance development workflows on the ClosedClaw project. Skills are automatically discovered and loaded on-demand when relevant to your request.

## Available Skills

### [channel-plugin-creator](./channel-plugin-creator/)
Guide for creating new messaging channel plugins/extensions. Use when adding support for new messaging platforms (e.g., Matrix, Teams, BlueBubbles).

**When to use**: Creating channel extensions, understanding plugin architecture, setting up routing and dependency injection.

**Covers**:
- Extension structure and package.json setup
- Plugin registration via `ClosedClawPluginApi`
- CliDeps extension pattern
- Routing and session key format
- Testing channel plugins
- Documentation and UI updates

### [agent-tool-creator](./agent-tool-creator/)
Guide for implementing new agent tools. Use when adding capabilities like web search, file operations, API integrations, or custom actions.

**When to use**: Adding agent capabilities, implementing tool logic, understanding tool factory patterns.

**Covers**:
- Tool factory pattern with `AnyAgentTool`
- Parameter validation helpers
- Result formatting (json, text, image)
- Tool registration in assembly modules
- Testing tools with Vitest
- Config-based and action gating patterns

### [test-runner](./test-runner/)
Efficient test execution patterns for ClosedClaw's multi-config architecture. Use when running tests, debugging failures, or checking coverage.

**When to use**: Running tests locally or CI, debugging test failures, understanding test architecture.

**Covers**:
- Five Vitest configurations (unit, extensions, gateway, e2e, live)
- Narrow test execution for faster iteration
- Test parallelization with `test-parallel.mjs`
- Coverage requirements (70% threshold)
- Live test setup with provider credentials
- Debugging and troubleshooting patterns

### [gateway-debugger](./gateway-debugger/)
Troubleshooting guide for gateway issues. Use when debugging gateway startup, WebSocket failures, channel disconnections, or performance problems.

**When to use**: Gateway not starting, connection issues, channel problems, hot-reload failures.

**Covers**:
- Seven common gateway issues with diagnosis and solutions
- Port conflicts, stale locks, config validation
- WebSocket failures and channel disconnections
- Resource usage and hot-reload issues
- Log analysis patterns and locations
- Recovery procedures (graceful and nuclear options)

### [config-migrator](./config-migrator/)
Guide for config schema changes and migrations. Use when adding config fields, making breaking changes, or updating Zod schemas.

**When to use**: Schema changes, breaking config updates, type/Zod synchronization, migrations.

**Covers**:
- Config architecture (types, Zod schemas, migrations)
- Five common tasks with step-by-step examples
- Schema design patterns (optional/required, enums, nested)
- Validation patterns (custom rules, transforms)
- Testing strategies for schemas and migrations
- Common pitfalls and prevention

### [release-manager](./release-manager/)
Version bumping, changelog updates, and npm publishing workflow. Use when preparing releases, updating versions, or managing release channels.

**When to use**: Preparing releases, version bumping, changelog updates, npm publishing, hotfixes.

**Covers**:
- Calendar versioning format (vYYYY.M.D)
- Three release channels (stable, beta, dev)
- Complete workflows for each release type
- Changelog conventions and contributor thanks
- npm publishing and dist-tag management
- Git tagging and GitHub release creation

### [e2e-test-writer](./e2e-test-writer/)
Guide for writing e2e tests for gateway and channels. Use when testing multi-instance gateway behavior, WebSocket/HTTP surfaces, or node pairing.

**When to use**: Testing gateway networking, multi-instance coordination, WebSocket/RPC methods.

**Covers**:
- Multi-instance gateway test patterns
- Agent workflow tests with mock models
- WebSocket RPC test examples
- Test helpers (temp home, gateway client, port management)
- Mocking patterns (embedded agent, model catalog, usage)
- Common scenarios (pairing, sessions, RPC validation)

### [documentation-writer](./documentation-writer/)
Guide for writing and maintaining ClosedClaw documentation. Use when creating docs for features, channels, tools, or updating existing documentation.

**When to use**: Writing feature docs, channel guides, tool documentation, updating existing docs.

**Covers**:
- Documentation structure and file organization
- Link conventions (root-relative without .md)
- Heading rules (no em dashes or apostrophes)
- Templates (feature, channel, tool documentation)
- Formatting guidelines (code blocks, tables, lists)
- Testing and validation procedures

## How Skills Work

Skills use **progressive disclosure** with three levels:

1. **Discovery**: Copilot always knows available skills via `name`/`description` in YAML frontmatter
2. **Instructions**: `SKILL.md` body loads when skill matches your request
3. **Resources**: Additional files load only when referenced

Skills are **automatically activated** based on your prompts—you don't need to manually select them.

## Using Skills

Skills work across:
- **VS Code**: Available in chat and agent mode
- **Copilot CLI**: Accessible in terminal
- **Copilot coding agent**: Used during automated tasks

Simply ask Copilot about tasks related to the skill, and it will load the relevant instructions automatically.

**Examples**:
- "Help me create a new channel plugin for Matrix"
- "I need to implement a new tool for the agent"
- "How do I run tests for a specific file?"
- "Debug the failing test in src/config/"

## Creating Additional Skills

To create a new skill:

```bash
mkdir -p .github/skills/my-skill
cat > .github/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Clear description of what this skill does and when to use it
---

# My Skill

Detailed instructions, guidelines, and examples...
EOF
```

See [VS Code Agent Skills docs](https://code.visualstudio.com/docs/copilot/customization/agent-skills) for more information.

## Potential Additional Skills

Based on review of [anthropics/skills](https://github.com/anthropics/skills) and [github/awesome-copilot](https://github.com/github/awesome-copilot):

**From Anthropic's skills repository (65k+ stars):**
- **skill-creator** - Meta-skill for generating new skills with templates
- **api-design** - RESTful API design patterns and OpenAPI spec generation
- **performance-optimizer** - Code performance analysis and optimization
- Document creation skills (DOCX, PDF, PPTX, XLSX) - complex production skills

**From GitHub's awesome-copilot (20k+ stars):**
- **code-reviewer** - PR review checklist and common issue patterns
- **security-auditor** - Security best practices and vulnerability scanning
- **migration-helper** - Framework/library migration patterns
- Custom agents for specialized workflows (DevOps, database, cloud)

**ClosedClaw-specific opportunities:**
- **provider-integrator** - Add new model provider (Anthropic, OpenAI, Google, etc.)
- **security-reviewer** - Security patterns (allowlists, pairing, credentials)
- **mobile-developer** - iOS/Android app development patterns
- **mac-app-developer** - macOS SwiftUI app patterns and Observation framework

## Resources

- [Agent Skills Standard](https://agentskills.io/)
- [VS Code Agent Skills Docs](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [GitHub Awesome Copilot](https://github.com/github/awesome-copilot) - Community skills (20k+ stars)
- [Anthropics Skills](https://github.com/anthropics/skills) - Reference implementations (65k+ stars)
- [.github/copilot-instructions.md](../ copilot-instructions.md) - Always-on coding guidelines
