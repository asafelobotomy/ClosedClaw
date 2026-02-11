# 🦞 ClosedClaw

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/ClosedClaw/ClosedClaw/main/docs/assets/ClosedClaw-logo-text-dark.png">
        <img src="https://raw.githubusercontent.com/ClosedClaw/ClosedClaw/main/docs/assets/ClosedClaw-logo-text.png" alt="ClosedClaw" width="500">
    </picture>
</p>

<p align="center">
  <strong>Personal AI assistant gateway — Connect any messaging channel to any AI model</strong>
</p>

<p align="center">
  <a href="https://github.com/ClosedClaw/ClosedClaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/ClosedClaw/ClosedClaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/ClosedClaw/ClosedClaw/releases"><img src="https://img.shields.io/github/v/release/ClosedClaw/ClosedClaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**ClosedClaw** is a self-hosted AI assistant gateway that bridges your messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, and more) to AI models through a unified control plane. Built on the [Pi agent runtime](https://github.com/badlogic/pi-mono), it enables powerful multi-agent coordination, tool orchestration, and workflow automation — all running on your own infrastructure.

🚀 **Quick Links:** [Getting Started](docs/start/getting-started.md) · [Documentation](docs/) · [Discord](https://discord.gg/clawd) · [Releases](https://github.com/ClosedClaw/ClosedClaw/releases)

---

## Why ClosedClaw?

- **🔐 Privacy-First**: Run on your own infrastructure — your data never leaves your control
- **💬 Universal Messaging**: Connect WhatsApp, Telegram, Discord, Slack, Signal, iMessage, and 10+ more channels
- **🤖 Multi-Agent Coordination**: Agent squads collaborate on complex tasks with automatic role assignment
- **🛠️ Extensible**: Plugin system for custom channels, tools, and workflows
- **⚡ Production-Ready**: Built-in security policies, network egress controls, and cost tracking

---

## Quick Start

**Requirements:** Node.js ≥22

### Install

```bash
npm install -g closedclaw@latest

# Run the onboarding wizard (recommended)
closedclaw onboard --install-daemon
```

The wizard installs the Gateway daemon (launchd/systemd) and walks you through channel setup.

### Basic Usage

```bash
# Start the gateway
closedclaw gateway --port 18789 --verbose

# Open the web dashboard
# → http://localhost:18789

# Send a message via CLI
closedclaw agent --message "What's the weather today?"
```

For production deployment and channel configuration, see [Getting Started](docs/start/getting-started.md).

---

## Architecture

ClosedClaw is built around three core components:

```
┌──────────────────────────────────────────┐
│        Messaging Channels                │
│  WhatsApp • Telegram • Discord • Slack   │
│  Signal • iMessage • Teams • Matrix      │
└─────────────┬────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────┐
│         Gateway Control Plane            │
│  • WebSocket/HTTP API                    │
│  • Session Management                    │
│  • Routing & Binding                     │
│  • Plugin System                         │
└─────────────┬────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────┐
│         Pi Agent Runtime                 │
│  • Tool Orchestration                    │
│  • Multi-Agent Squads                    │
│  • Workflow Engine                       │
│  • Model Failover                        │
└──────────────────────────────────────────┘
```

### Gateway Control Plane
Single WebSocket/HTTP control plane for sessions, channels, tools, and events. Supports hot-reload configuration via SIGUSR1.

### Channel Abstraction
Built-in channels in `src/{telegram,discord,slack,signal,imessage,web}/`. Extension channels in `extensions/{msteams,matrix,zalo,bluebubbles}/`. Each channel is a plugin that registers via `ClosedClawPluginApi`.

### Agent Runtime
Pi agent runtime (RPC mode) with tool streaming, subagent support, and block streaming in `src/agents/`. Recently enhanced with:
- **Agent Profiles**: Markdown-based role definitions with capability targeting
- **Squad System**: Multi-agent coordination with shared memory and synchronization primitives
- **Workflow Engine**: Declarative YAML/JSON5 workflows with DAG execution
- **Intent Router**: Automatic model selection based on task complexity
- **Cost Tracker**: Token usage and cost tracking per model/agent

---

## Features

### Core Capabilities

- **Multi-Channel Support**: WhatsApp (Baileys), Telegram (grammY), Discord, Slack (Bolt), Google Chat, Signal (signal-cli), iMessage (imsg), plus 6+ extension channels
- **Multi-Agent Routing**: Route messages to isolated agents based on channel/account/peer/group bindings
- **Session Management**: `main` session for direct chats, isolated sessions per peer/group/thread
- **Media Pipeline**: Images/audio/video handling with transcription and size caps (`src/media/`)
- **Tool Orchestration**: Browser control, canvas manipulation, system commands, Discord/Slack actions

### Developer Experience

- **Constants Library**: 150+ type-safe constants for environment variables, network, timing, paths, and sizes
- **Plugin SDK**: Extensible architecture with hooks, custom tools, and gateway handlers
- **Hot-Reload Config**: JSON5 configuration with live updates (SIGUSR1)
- **Comprehensive Testing**: 70% coverage requirement with parallel test execution
- **CLI Tooling**: `closedclaw doctor` for diagnostics, `closedclaw wizard` for setup

### Enterprise Features

- **Network Egress Controls**: Domain-based allowlist/denylist for outbound traffic
- **DM Pairing**: Unknown senders require pairing codes before processing
- **Cost Tracking**: Per-model and per-agent token usage with budget alerts
- **Audit Logging**: Circular buffer logs for compliance and debugging
- **Sandbox Mode**: Per-session Docker sandboxes for untrusted contexts

---

## Recent Development

### Constants Library (Phase 1-3) ✅
- 150+ constants covering environment variables, network, timing, paths, and sizes
- Single import point via `src/config/constants/`
- Type-safe utilities: `buildGatewayHttpUrl()`, `formatBytes()`, `getStateDir()`
- 133+ tests passing

### Agent Squad System (Phase 3-5) ✅
- **Squad-Aware Tools**: `delegate_to_agent`, `squad_memory_read/write`, `squad_broadcast`, `squad_status`
- **Coordination Primitives**: Mutex, Barrier, Semaphore, Event for multi-agent synchronization
- **Resource Management**: Token budgets, rate limiting, and monitoring
- **Agent Templates**: Pre-built profiles for researcher, coder, reviewer, tester, documenter, devops roles

### Workflow Engine (Phase 2) ✅
- **Declarative Workflows**: YAML/JSON5 schema with template interpolation
- **DAG Executor**: Parallel batch scheduling with per-step retry and timeout
- **State Serialization**: Crash recovery with event emission

See [CHANGELOG.md](CHANGELOG.md) for complete details.

---

## Configuration

Minimal `~/.closedclaw/config.json5`:

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5",
  },
  channels: {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN
    }
  }
}
```

**Configuration Docs:**
- [Full Reference](docs/gateway/configuration.md) — All config keys with examples
- [Security](docs/gateway/security.md) — DM policies, network egress, sandboxing
- [Channels](docs/channels/) — Channel-specific setup guides
- [Models](docs/concepts/models.md) — Model selection and failover

---

## Security

ClosedClaw connects to real messaging surfaces. Treat inbound messages as untrusted input.

**Default Security Posture:**
- **DM Pairing**: Unknown senders receive pairing codes (`dmPolicy="pairing"`)
- **Network Egress**: Allowlist-based outbound traffic filtering
- **Sandbox Mode**: Isolate non-main sessions in Docker containers
- **Config Validation**: Strict schema enforcement, unknown keys fail startup

Run `closedclaw doctor` to audit security policies.

**Key Docs:**
- [Security Guide](docs/gateway/security.md)
- [DM Policies](docs/gateway/security.md#dm-policies)
- [Network Egress](docs/security/network-egress.md)
- [Sandboxing](docs/gateway/configuration.md#sandbox-config)

---

## Development

### From Source

```bash
git clone https://github.com/ClosedClaw/ClosedClaw.git
cd ClosedClaw

pnpm install
pnpm ui:build    # Build web UI
pnpm build       # Compile TypeScript

# Development mode (hot-reload)
pnpm gateway:watch
```

### Testing

```bash
pnpm test                 # Run all tests (parallel)
pnpm test:coverage        # Coverage report (70% required)
pnpm test:e2e            # Gateway integration tests
pnpm check               # Lint + format
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. AI/vibe-coded PRs welcome! 🤖

**Development Updates**: Check the [CHANGELOG](CHANGELOG.md) for latest progress on:
- ✅ End-to-end encrypted memory storage (Priority 3)
- ✅ Constants library consolidation (Priority 3.5)
- ✅ DevOps subagent for meta-development (Priority 12.5)

---

## Release Channels

- **stable**: Tagged releases (`vYYYY.M.D`), npm dist-tag `latest`
- **beta**: Prerelease tags (`vYYYY.M.D-beta.N`), npm dist-tag `beta`
- **dev**: Moving head of `main` (no tag)

Switch channels: `closedclaw update --channel stable|beta|dev`

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ClosedClaw/ClosedClaw&type=date&legend=top-left)](https://www.star-history.com/#ClosedClaw/ClosedClaw&type=date&legend=top-left)

---

## Community

Join the community on [Discord](https://discord.gg/clawd) for support, discussions, and updates.

**Built by:**
- [Peter Steinberger](https://steipete.me) ([@ClosedClaw](https://x.com/ClosedClaw))
- The ClosedClaw community

**Special thanks:**
- [Mario Zechner](https://mariozechner.at/) for [pi-mono](https://github.com/badlogic/pi-mono)
- Adam Doppelt for lobster.bot
- All [contributors](https://github.com/ClosedClaw/ClosedClaw/graphs/contributors) 🙏

---

## Related Projects

- **Molty**: ClosedClaw powers Molty, a space lobster AI assistant 🦞
- **[ClawHub](https://clawhub.com)**: Skill registry for ClosedClaw agents
- **[Nix package](https://github.com/ClosedClaw/nix-clawdbot)**: Declarative config for NixOS

---

## License

[MIT License](LICENSE)
