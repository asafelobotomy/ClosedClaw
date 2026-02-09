---
name: documentation-writer
description: Guide for writing and maintaining ClosedClaw documentation. Use when creating docs for new features, channels, tools, or updating existing documentation. Covers markdown conventions, link styles, formatting rules, and documentation structure.
---

# Documentation Writer

This skill helps you write consistent, high-quality documentation for ClosedClaw. All docs live in `docs/` and follow specific conventions for links, formatting, and structure.

## When to Use

- Writing documentation for new features
- Creating channel setup guides
- Documenting new tools or CLI commands
- Updating existing documentation
- Creating tutorial content
- Writing API reference docs
- Documenting configuration options

## Prerequisites

- Understanding of Markdown/MDX syntax
- Familiarity with ClosedClaw architecture
- Knowledge of the feature being documented

## Documentation Structure

### File Organization

```
docs/
├── index.md                  # Homepage
├── agents/                   # Agent system docs
│   ├── pi.md
│   └── devops-subagent.md
├── channels/                 # Channel setup guides
│   ├── whatsapp.md
│   ├── telegram.md
│   └── discord.md
├── cli/                      # CLI command reference
│   ├── commands.md
│   └── wizard.md
├── concepts/                 # Conceptual guides
│   ├── agent-workspace.md
│   └── timezone.md
├── gateway/                  # Gateway documentation
│   ├── api.md
│   └── remote-gateway-readme.md
├── install/                  # Installation guides
│   ├── getting-started.md
│   └── nix.md
├── platforms/                # Platform-specific docs
│   ├── mac/
│   ├── ios/
│   └── android/
├── plugins/                  # Plugin documentation
│   ├── plugin-sdk.md
│   └── voice-call.md
├── providers/                # Provider setup guides
│   ├── anthropic.md
│   └── openai.md
├── reference/                # Reference documentation
│   ├── RELEASING.md
│   └── api-reference.md
├── security/                 # Security documentation
│   ├── pairing.md
│   └── allowlists.md
├── start/                    # Getting started guides
│   ├── getting-started.md
│   └── wizard.md
├── tools/                    # Tool documentation
│   ├── bash-tools.md
│   └── openclaw-tools.md
└── zh-CN/                    # Chinese translations
```

## Documentation Conventions

### Internal Links

**CRITICAL**: Use root-relative paths without `.md` or `.mdx` extensions.

✅ **Correct**:
```markdown
[Getting Started](/start/getting-started)
[Configuration](/configuration)
[WhatsApp](/channels/whatsapp)
[Tools](/tools/bash-tools)
```

❌ **Incorrect**:
```markdown
[Getting Started](./start/getting-started.md)
[Configuration](../configuration.md)
[WhatsApp](/channels/whatsapp.md)
[Tools](/docs/tools/bash-tools)
```

**Why**: Root-relative links work consistently across:
- GitHub Pages (where docs are served)
- GitHub markdown preview
- Local development servers
- VS Code markdown preview

### Headings

**Avoid em dashes (—) and apostrophes (') in headings** for better URL compatibility:

✅ **Correct**:
```markdown
## Getting Started
## Channel Setup
## Using the CLI
## Agent Configuration
```

❌ **Incorrect**:
```markdown
## Getting Started — The Easy Way
## Channel's Setup
## Using the CLI—Advanced
## Agent's Configuration
```

**Why**: Headings become URL anchors; em dashes and apostrophes cause problems in some markdown processors.

### README Links

When linking to repository files (not docs), use **relative links** from repository root:

✅ **Correct in README.md**:
```markdown
[Contributing](CONTRIBUTING.md)
[License](LICENSE)
[Changelog](CHANGELOG.md)
```

✅ **Correct in docs/ (linking to repo files)**:
```markdown
For release notes, see [CHANGELOG.md](https://github.com/ClosedClaw/ClosedClaw/blob/main/CHANGELOG.md)
[macOS README](https://github.com/ClosedClaw/ClosedClaw/blob/main/apps/macos/README.md)
```

**Why**: README.md needs to work on GitHub, npm, and other platforms. Relative links ensure compatibility.

## Documentation Template

### Feature Documentation Template

```markdown
---
summary: "Brief one-line description of the feature"
read_when:
  - When user needs this feature
  - Another scenario
title: "Feature Name"
---

# Feature Name

> Brief tagline or quote explaining the feature's purpose

## Overview

High-level explanation of what this feature does and why it exists.

## Quick Start

Minimal example to get started immediately:

\`\`\`bash
ClosedClaw command --flag value
\`\`\`

## Prerequisites

- Requirement 1
- Requirement 2
- Requirement 3

## Installation / Setup

Step-by-step setup instructions:

### Step 1: Initial Configuration

\`\`\`json5
// ~/.ClosedClaw/config.json5
{
  feature: {
    enabled: true,
    option: "value",
  },
}
\`\`\`

### Step 2: Additional Setup

Further configuration or installation steps.

## Usage

### Basic Usage

Common use cases with examples:

\`\`\`bash
ClosedClaw command example
\`\`\`

### Advanced Usage

More complex scenarios:

\`\`\`bash
ClosedClaw command --advanced --flags
\`\`\`

## Configuration

Complete configuration reference:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable feature |
| `timeout` | `number` | `30000` | Timeout in ms |

## Examples

### Example 1: Common Use Case

\`\`\`bash
# Command
ClosedClaw example command

# Expected output
Success: Feature activated
\`\`\`

### Example 2: Advanced Pattern

\`\`\`json5
// Configuration
{
  advanced: {
    mode: "expert",
  },
}
\`\`\`

## Troubleshooting

### Issue: Common Problem

**Symptom**: Description of the problem

**Solution**:
1. Step to resolve
2. Another step
3. Verify fix

### Issue: Another Problem

**Symptom**: Description

**Diagnosis**:
\`\`\`bash
ClosedClaw diagnostic command
\`\`\`

**Solution**:
- Fix step 1
- Fix step 2

## Reference

- [Related Feature](/path/to/related)
- [API Reference](/reference/api)
- [External Resource](https://example.com)

## See Also

- Related topic 1
- Related topic 2
\`\`\`
```

### Channel Setup Guide Template

```markdown
---
summary: "How to connect ClosedClaw to [Channel Name]"
read_when:
  - Setting up [Channel] for the first time
  - Troubleshooting [Channel] connection issues
title: "[Channel Name]"
---

# [Channel Name]

> Connect ClosedClaw to [Channel] using [method]

## Overview

Brief explanation of the channel and how ClosedClaw integrates.

## Prerequisites

- [Channel] account
- Any API access or permissions needed
- Other requirements

## Installation

### Method 1: Wizard (Recommended)

\`\`\`bash
ClosedClaw onboard
\`\`\`

Select "[Channel]" from the channel list.

### Method 2: Manual Setup

#### Step 1: Get Credentials

1. Navigate to [Channel Platform]
2. Create bot/application
3. Copy API token

#### Step 2: Configure ClosedClaw

\`\`\`json5
// ~/.ClosedClaw/config.json5
{
  channels: {
    [channel]: {
      enabled: true,
      token: "your-token-here",
    },
  },
}
\`\`\`

#### Step 3: Start Gateway

\`\`\`bash
ClosedClaw gateway
\`\`\`

## Configuration

### Basic Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | `boolean` | No | Enable channel (default: false) |
| `token` | `string` | Yes | Bot token or API key |
| `allowFrom` | `string[]` | No | Allowlist (default: []) |

### Advanced Configuration

\`\`\`json5
{
  channels: {
    [channel]: {
      enabled: true,
      token: process.env.[CHANNEL]_TOKEN,
      allowFrom: ["+1234567890"],
      options: {
        // Channel-specific options
      },
    },
  },
}
\`\`\`

## Usage

### Sending Messages

From [Channel], message the bot:

\`\`\`
Hello ClosedClaw!
\`\`\`

### Commands

Special commands available:

- `/help` - Show help
- `/reset` - Reset session
- `/model` - Change model

## Security

### Allowlists

Restrict access to specific users:

\`\`\`json5
{
  channels: {
    [channel]: {
      allowFrom: ["user1", "user2"],
    },
  },
}
\`\`\`

### DM Policy

Control how unknown users are handled:

\`\`\`json5
{
  channels: {
    [channel]: {
      dmPolicy: "pairing", // "open" | "pairing" | "deny"
    },
  },
}
\`\`\`

## Troubleshooting

### Channel Not Connecting

1. Verify token is correct
2. Check channel is enabled in config
3. Restart gateway: \`ClosedClaw gateway --restart\`

### Messages Not Received

1. Check allowlists
2. Verify bot permissions
3. Check logs: \`tail -f ~/.ClosedClaw/logs/gateway-*.log\`

## Limitations

- Known limitation 1
- Known limitation 2

## Reference

- [Channel API Docs](https://example.com)
- [ClosedClaw Gateway](/gateway/api)
- [Security](/security/allowlists)
\`\`\`
```

### Tool Documentation Template

```markdown
---
summary: "Documentation for [tool_name] tool"
read_when:
  - Implementing or using [tool_name]
title: "[Tool Name]"
---

# [Tool Name]

> Brief description of what the tool does

## Overview

Detailed explanation of the tool's purpose and when to use it.

## Tool Signature

\`\`\`typescript
{
  name: "tool_name",
  description: "What this tool does and when to use it",
  parameters: {
    param1: { type: "string", description: "Parameter 1", required: true },
    param2: { type: "number", description: "Parameter 2", required: false },
  },
}
\`\`\`

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param1` | `string` | Yes | Description |
| `param2` | `number` | No | Description (default: 0) |

## Return Value

\`\`\`typescript
{
  result: "success",
  data: { /* ... */ },
}
\`\`\`

## Examples

### Example 1: Basic Usage

**Input**:
\`\`\`json
{
  "param1": "value",
}
\`\`\`

**Output**:
\`\`\`json
{
  "result": "success",
  "data": { "processed": "value" },
}
\`\`\`

### Example 2: Advanced Usage

**Input**:
\`\`\`json
{
  "param1": "value",
  "param2": 42,
}
\`\`\`

**Output**:
\`\`\`json
{
  "result": "success",
  "data": { "processed": "value", "count": 42 },
}
\`\`\`

## Error Handling

### Error: InvalidParameter

**Cause**: Parameter value is invalid

**Solution**: Ensure parameter matches expected format

### Error: ToolFailed

**Cause**: Tool execution failed

**Solution**: Check tool requirements and permissions

## Implementation

Location: \`src/agents/tools/tool-name.ts\`

\`\`\`typescript
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

export function createToolName(options?: { config?: ClosedClawConfig }): AnyAgentTool {
  return {
    name: "tool_name",
    description: "What this tool does and when to use it",
    parameters: {
      param1: { type: "string", description: "Parameter 1", required: true },
    },
    handler: async (params) => {
      const value = readStringParam(params, "param1", { required: true });
      // Implementation
      return jsonResult({ result: "success" });
    },
  };
}
\`\`\`

## See Also

- [Tool Creation Guide](/agents/tools)
- [OpenClaw Tools](/tools/openclaw-tools)
- [Bash Tools](/tools/bash-tools)
\`\`\`
```

## Formatting Guidelines

### Code Blocks

Use appropriate language tags:

\`\`\`markdown
\`\`\`bash
ClosedClaw command
\`\`\`

\`\`\`json5
// Configuration
{ key: "value" }
\`\`\`

\`\`\`typescript
const example: string = "code";
\`\`\`
\`\`\`

### Tables

Use consistent alignment:

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value A  | Value B  | Value C  |
```

### Lists

Use consistent formatting:

```markdown
## Ordered Lists

1. First item
2. Second item
3. Third item

## Unordered Lists

- Item 1
- Item 2
- Item 3

## Nested Lists

1. Top level
   - Nested item
   - Another nested item
2. Another top level
```

### Admonitions

Use blockquotes for important notes:

```markdown
> **Warning**: This action is destructive

> **Note**: Remember to restart the gateway

> **Tip**: Use the wizard for easier setup
```

## Frontmatter

All docs should include YAML frontmatter:

```yaml
---
summary: "Brief one-line description (appears in search/previews)"
read_when:
  - Scenario when user should read this
  - Another scenario
title: "Page Title"
---
```

## Writing Style

### Voice & Tone

- **Direct and actionable**: Use imperative verbs (Run, Configure, Create)
- **Concise**: Keep sentences short, avoid unnecessary words
- **Helpful**: Anticipate user questions and pain points
- **Technical but approachable**: Explain complex concepts clearly

### Examples

✅ **Good**:
```markdown
Configure your token in the config file:

\`\`\`json5
{ token: "your-token-here" }
\`\`\`
```

❌ **Bad**:
```markdown
You might want to consider configuring your token, which you can do by editing
the configuration file and adding a token field with your actual token value.
```

### Terminology

Use consistent terminology:

- **Gateway** (not "server" or "daemon")
- **Channel** (not "integration" or "connector")
- **Agent** (not "bot" or "assistant")
- **Tool** (not "function" or "capability")
- **Session** (not "conversation" or "thread")
- **Config** (not "configuration file" after first mention)

## Common Patterns

### Prerequisites Section

```markdown
## Prerequisites

- [ ] Node.js ≥22 installed
- [ ] ClosedClaw installed: `npm install -g ClosedClaw`
- [ ] [Channel] account with API access
- [ ] Gateway running: `ClosedClaw gateway`
```

### Configuration Section

```markdown
## Configuration

Edit `~/.ClosedClaw/config.json5`:

\`\`\`json5
{
  feature: {
    enabled: true,
    option: "value",
  },
}
\`\`\`

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable feature |
```

### Troubleshooting Section

```markdown
## Troubleshooting

### Issue Name

**Symptom**: What the user sees

**Diagnosis**:
\`\`\`bash
ClosedClaw diagnostic command
\`\`\`

**Solution**:
1. Step to fix
2. Another step
3. Verify solution worked
```

### Examples Section

```markdown
## Examples

### Example 1: Common Use Case

Description of the example.

\`\`\`bash
# Command
ClosedClaw example

# Expected output
Success!
\`\`\`

### Example 2: Advanced Pattern

\`\`\`json5
// Complex configuration
{
  advanced: { /* ... */ },
}
\`\`\`
```

## Documentation Checklist

- [ ] File in correct `docs/` subdirectory
- [ ] YAML frontmatter with `summary`, `read_when`, `title`
- [ ] Root-relative links without `.md`/`.mdx`
- [ ] No em dashes or apostrophes in headings
- [ ] Code blocks with language tags
- [ ] Tables with consistent alignment
- [ ] Prerequisites section
- [ ] Configuration examples
- [ ] Troubleshooting section
- [ ] Examples with expected output
- [ ] Cross-references to related docs
- [ ] Consistent terminology
- [ ] Proofread for clarity and accuracy

## Testing Documentation

### Local Preview

If using a docs server:
```bash
# Start docs server (if available)
npm run docs:dev

# Open browser
open http://localhost:3000
```

### Link Validation

Check that all links work:
```bash
# Find broken internal links
grep -r '\[.*\](.*\.md)' docs/
grep -r '\[.*\](\.\./' docs/

# Should return nothing (all links should be root-relative)
```

### Markdown Linting

```bash
# If using markdownlint
npx markdownlint docs/**/*.md
```

## Common Mistakes

### ❌ Relative Links with Extensions

```markdown
[Guide](./getting-started.md)
```

✅ **Fix**: Use root-relative without extension
```markdown
[Guide](/start/getting-started)
```

### ❌ Em Dashes in Headings

```markdown
## Installation — The Easy Way
```

✅ **Fix**: Use simple headings
```markdown
## Installation (Easy Method)
```

### ❌ Platform-Specific Paths

```markdown
Configure at `C:\Users\You\.ClosedClaw\config.json5`
```

✅ **Fix**: Use cross-platform notation
```markdown
Configure at `~/.ClosedClaw/config.json5`
```

### ❌ Missing Code Language Tags

\`\`\`markdown
\`\`\`
ClosedClaw command
\`\`\`
\`\`\`

✅ **Fix**: Always specify language
\`\`\`markdown
\`\`\`bash
ClosedClaw command
\`\`\`
\`\`\`

## Updates & Maintenance

When updating documentation:

1. **Check related docs**: Update cross-references
2. **Update examples**: Ensure examples match current version
3. **Update screenshots**: If UI changed
4. **Update version info**: If version-specific
5. **Test commands**: Verify all commands work
6. **Check links**: Ensure no broken links
7. **Review changelog**: Mention in CHANGELOG.md if significant

## Translations

Chinese translations live in `docs/zh-CN/`:

- Maintain same file structure as English docs
- Keep same filename (just in `zh-CN/` subdirectory)
- Update both English and Chinese when possible
- Use root-relative links (works for both languages)

## Related Files

- `docs/` - All documentation
- `README.md` - Repository README (uses relative links)
- `CONTRIBUTING.md` - Contributor guidelines
- `CHANGELOG.md` - Release notes
- `.github/copilot-instructions.md` - Coding guidelines (mentions doc conventions)

## See Also

- [Contributing Guidelines](https://github.com/ClosedClaw/ClosedClaw/blob/main/CONTRIBUTING.md)
- [GitHub Markdown Guide](https://guides.github.com/features/mastering-markdown/)
- [MDX Documentation](https://mdxjs.com/)
