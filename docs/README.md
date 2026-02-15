# ClosedClaw Documentation

Welcome to the comprehensive documentation for **ClosedClaw** - your personal AI assistant that runs on your own devices.

This documentation covers installation, configuration, security, development, and all aspects of using and extending ClosedClaw.

---

## 🚀 Getting Started

**New to ClosedClaw?** Start here:

- **[Installation Guide](install/installation.md)** - System requirements and installation methods
- **[Getting Started](start/getting-started.md)** - First steps after installation
- **[Onboarding Wizard](start/wizard.md)** - Interactive setup walkthrough
- **[Quick Start](../README.md#quick-start-tldr)** - TL;DR version from main README
- **[FAQ](start/faq.md)** - Frequently asked questions
- **[Showcase](start/showcase.md)** - Real-world usage examples

---

## 🎯 Core Concepts

Understanding ClosedClaw's architecture:

- **[Agents & Profiles](agents/)** - Multiple AI agents with distinct personalities
- **[Channels](channels/)** - Messaging platform integrations (WhatsApp, Telegram, Discord, Slack, etc.)
- **[Sessions & Routing](concepts/)** - Message routing and session management
- **[Skills](agents/skills.md)** - Extending agent capabilities
- **[Memory & Context](concepts/)** - How agents remember and learn
- **[Gateway](gateway/)** - Control plane architecture
- **[Models](concepts/models.md)** - AI model selection and configuration

---

## 🔐 Security (Enterprise-Grade)

ClosedClaw implements comprehensive security infrastructure with OWASP/NIST compliance:

### Security Overview

- **[Security Model](gateway/security.md)** - Architecture and principles
- **[Encrypted Storage](security/encrypted-memory.md)** - AES-256-GCM at rest (Priority 3)
- **[Skill Signing](security/skill-signing.md)** - Ed25519 cryptographic verification (Priority 4)
- **[Audit Logging](security/audit-logging.md)** - Tamper-evident SHA-256 chains (Priority 6)
- **[Keychain Integration](security/keychain.md)** - OS native credential storage (Priority 7)
- **[Trusted Keyring](security/trusted-keyring.md)** - Public key trust management
- **[Encryption Audit](security/encryption-audit-20260209.md)** - Independent security review

### Security Features

- ✅ AES-256-GCM encryption at rest
- ✅ Argon2id key derivation (OWASP-compliant)
- ✅ Ed25519 digital signatures for skills
- ✅ SHA-256 hash-chain audit logging
- ✅ OS keychain integration (macOS/Linux/Windows)
- ✅ Network egress policies
- ✅ Sandbox isolation (Docker/Firejail)

### Additional Security

- **[Sandboxing](refactor/sandboxing-implementation-summary.md)** - Process isolation
- **[Network Egress](security/)** - Network policy enforcement
- **[Formal Verification](security/formal-verification.md)** - Cryptographic proofs (if available)
- **[Mandatory Sandboxing](security/mandatory-sandboxing.md)** - Enforced isolation
- **[Tailscale Enforcement](security/tailscale-enforcement.md)** - VPN requirements

---

## 💻 CLI Reference

Command-line interface documentation:

- **[Security Commands](cli/security.md)** - Encryption, signing, audit, keychain
- **[Gateway Commands](gateway/)** - Control plane management
- **[Agent Commands](agents/)** - AI agent interactions
- **[Channel Commands](channels/)** - Messaging platform control
- **[Status & Diagnostics](diagnostics/)** - System health and troubleshooting

### Common Commands

```bash
# Installation & Setup
closedclaw onboard --install-daemon

# Gateway Management
closedclaw gateway --port 18789 --verbose
closedclaw status

# Agent Interaction
closedclaw agent --message "Hello" --thinking high

# Security
closedclaw security audit
closedclaw security log query --since 1h
closedclaw security keychain status

# Diagnostics
closedclaw doctor
closedclaw health
```

---

## 📱 Channels

GTKGUI
Android (WIP)
---

## 🛠️ Development

Contributing to ClosedClaw:

### Getting Started

- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute
- **[Development Setup](development/)** - Local development environment
- **[Testing Guide](testing.md)** - Running and writing tests
- **[Debugging](debugging.md)** - Troubleshooting and debugging tools

### Architecture

- **[Fork Roadmap](refactor/closedclaw-fork-roadmap.md)** - Project history and direction
- **[Architecture Overview](refactor/)** - System design and components
- **[Plugin System](plugin.md)** - Extension architecture
- **[Hooks System](hooks.md)** - Event hooks and lifecycle

### Guides

- **[First Contribution](development/first-contribution.md)** - Step-by-step guide for new contributors (~600 lines)
- **[Path Aliases & Barrel Exports](development/path-aliases.md)** - Import patterns and migration guide (~500 lines)
- **Adding Tools** - Create new agent tools (see First Contribution guide)
- **Adding Channels** - Build channel extensions (see extension template in `extensions/.template/`)
- **Extension Development** - Plugin creation guide (see Plugin System docs)

---

## 🖥️ Platforms

Platform-specific documentation:

- **[macOS](platforms/mac/)** - Native macOS app, launchd, Keychain.app
- **[iOS](platforms/ios/)** - iOS app and configuration
- **[Android](platforms/android/)** - Android app setup
- **[Linux](platforms/linux/)** - systemd, Secret Service
- **[Windows WSL2](platforms/windows/)** - Windows Subsystem for Linux setup
- **[Docker](install/docker.md)** - Container deployment
- **[VPS Hosting](vps.md)** - Cloud deployment guides

---

## 📦 Deployment

Running ClosedClaw in production:

- **[Docker Deployment](install/docker.md)** - Containerized deployment
- **[Railway Guide](railway.mdx)** - Deploy to Railway
- **[Render Guide](render.mdx)** - Deploy to Render
- **[Northflank Guide](northflank.mdx)** - Deploy to Northflank
- **[VPS Setup](vps.md)** - Self-hosted on VPS
- **[Nix](https://github.com/ClosedClaw/nix-clawdbot)** - NixOS/Nix flakes

---

## 🧩 Extensions & Plugins

Extending ClosedClaw functionality:

- **[Plugin System Overview](plugin.md)** - Extension architecture
- **[Creating Plugins](plugins/)** - Plugin development guide
- **[Available Extensions](../extensions/)** - Browse all extensions
- **[Memory Systems](plugins/)** - Custom memory backends
- **[Authentication Providers](providers/)** - OAuth/API integrations

---

## 📊 Completion Reports

Detailed reports on completed development priorities:

- **[Security Hardening Summary](completion/security-hardening-summary.md)** - Complete security implementation
- **[Priority 4: Skill Signing](completion/priority-4-skill-signing.md)** - Ed25519 signatures (2,200 lines)
- **[Priority 6: Audit Logging](completion/priority-6-audit-logging.md)** - Tamper-evident logs (2,370 lines)
- **[Priority 7: Keychain Integration](completion/priority-7-keychain.md)** - OS credential storage (2,854 lines)
- **[All Completion Reports](completion/)** - View all priority reports

**Total Security Implementation**: ~12,200 lines (code + tests + docs) ✅

---

## 🔧 Troubleshooting

### Diagnostics

- **[Doctor Command](diagnostics/)** - Automated diagnostics (`closedclaw doctor`)
- **[Health Check](diagnostics/)** - System health monitoring
- **[Debugging Guide](debugging.md)** - Debug tools and techniques
- **[Common Issues](help/)** - FAQ and known issues
- **[Logging](logging.md)** - Log collection and analysis

### Getting Help

- **[Discord Community](https://discord.gg/clawd)** - Real-time community support
- **[GitHub Issues](https://github.com/ClosedClaw/ClosedClaw/issues)** - Bug reports and feature requests
- **[FAQ](start/faq.md)** - Frequently asked questions
- **[DeepWiki](https://deepwiki.com/ClosedClaw/ClosedClaw)** - Community wiki

---

## 📖 Additional Resources

### Reference

- **[Token Usage](token-use.md)** - Managing token consumption
- **[Environment Variables](environment.md)** - Configuration via env vars
- **[Network Configuration](network.md)** - Proxy, firewall, networking
- **[Date & Time](date-time.md)** - Timezone and date handling
- **[TTS (Text-to-Speech)](tts.md)** - Voice output configuration
- **[TUI (Terminal UI)](tui.md)** - Terminal interface guide
- **[Prose System](prose.md)** - Natural language programming
- **[Scripts](scripts.md)** - Automation and scripting

### Advanced Topics

- **[Multi-Agent Sandbox](multi-agent-sandbox-tools.md)** - Agent collaboration
- **[Broadcast Groups](broadcast-groups.md)** - Multi-channel messaging
- **[Brave Search](brave-search.md)** - Search integration
- **[Perplexity.ai](perplexity.md)** - External AI integration
- **[AWS Bedrock](bedrock.md)** - Bedrock model integration
- **[Experiments](experiments/)** - Experimental features

### Automation

- **[Cron Jobs](automation/)** - Scheduled tasks
- **[Auto-Reply](automation/)** - Automated responses
- **[Workflows](automation/)** - Task automation

## 📝 Project Files

- **[README.md](../README.md)** - Project overview
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[LICENSE](../LICENSE)** - MIT License
- **[SECURITY.md](../SECURITY.md)** - Security policy
- **[TODO.md](../TODO.md)** - Current development priorities

---

## 🔗 External Links

- **[Website](https://ClosedClaw.ai)** - Official website
- **[GitHub Repository](https://github.com/ClosedClaw/ClosedClaw)** - Source code
- **[DeepWiki](https://deepwiki.com/ClosedClaw/ClosedClaw)** - Community-maintained wiki
- **[Discord Server](https://discord.gg/clawd)** - Community chat
- **[npm Package](https://www.npmjs.com/package/ClosedClaw)** - npm registry

---

## 📊 Quick Stats

- **Security**: Enterprise-grade (AES-256, Ed25519, SHA-256 chains)
- **Test Coverage**: 70%+ (security: 90%+)
- **Platforms**: macOS, iOS, Android, Linux, Windows (WSL2)
- **Channels**: 10+ built-in, 20+ extension channels
- **Documentation**: 778+ markdown files
- **License**: MIT

---

**Last Updated**: February 10, 2026  
**Version**: 2026.2.1  
**Status**: Production-ready with enterprise security ✅

For the most up-to-date information, visit the [official website](https://ClosedClaw.ai) or join our [Discord community](https://discord.gg/clawd).
