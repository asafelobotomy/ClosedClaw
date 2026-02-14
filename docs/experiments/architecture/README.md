---
summary: "System architecture documentation for OpenClaw and ClosedClaw"
read_when:
  - Understanding how the system works internally
  - Debugging request flow issues
  - Designing new integrations
title: "Architecture Documentation Index"
---

# Architecture

This directory contains **current implementation** documentation of OpenClaw and ClosedClaw system architecture. These are not proposals or research—they document how the system actually works today.

## Architecture Documents

### [Request Lifecycle](request-lifecycle.md)

**Status:** Current Implementation | **Version:** OpenClaw v2026.2

Complete technical flow from user input through Gateway, agent brain, tool execution, and response delivery.

**Phases Documented:**

1. **Triggering** - Active channels, Gateway UI, proactive heartbeats
2. **Gateway & Lane Queue** - Auth, session resolution, serial execution
3. **Prompt Assembly** - Context loading from core files
4. **Agentic Loop** - Plan → Execute → Observe → Adjust
5. **Memory Flush** - Durable notes, compaction, transcript archival
6. **Response Delivery** - Outbound routing, channel-specific formatting

**Use When:** Debugging request flow, understanding session management, designing channel integrations.

---

## Related Architecture Documentation

Beyond this directory, architecture documentation lives in several places:

### Gateway

- [Gateway Architecture](/gateway/architecture) - Control plane, RPC methods, WebSocket/HTTP
- [Gateway Config Hot-Reload](/gateway/config) - SIGUSR1 reload mechanism
- [Gateway Lock Management](/gateway/lock) - Single-instance enforcement

### Channels

- [Channel Architecture](/refactor/CHANNEL-ARCHITECTURE.md) - Plugin system, CliDeps pattern
- [Channel Plugin Developer Guide](/.github/skills/channel-plugin-creator/SKILL.md)
- Per-channel docs in [/docs/channels/](/channels/)

### Agents

- [Pi Agent Runtime](/agents/pi-dev) - RPC mode, tool streaming
- [Agent Configuration](/agents/) - Config schema, tool assembly
- [Default Agent Behavior](/reference/AGENTS.default.md)

### Routing

- [Session Management](/reference/session-management-compaction.md) - Session keys, compaction
- Routing logic source: `src/routing/resolve-route.ts`

### Memory & Context

- [Workspace Memory Research](../research/memory.md) - Offline-first architecture
- [Scaling Memory](../research/scaling-memory.md) - Alternatives to Markdown
- Memory extensions: `extensions/memory-*/`

### Security

- [Pairing System](/security/pairing) - DM policy enforcement
- [Gateway Authentication](/security/gateway-auth) - WebSocket auth
- [Crypto](/security/crypto) - Key derivation, session encryption

### Plugin System

- [Plugin SDK](/plugins/sdk) - Plugin API surface
- [Plugin Development](/plugin.md) - Extension guidelines
- Plugin SDK source: `src/plugins/types.ts`

## Architectural Principles

### 1. Gateway as Control Plane

- All messages flow through Gateway
- Centralized auth, routing, session management
- Supports RPC methods, WebSocket, HTTP
- Hot-reload via SIGUSR1 for config changes

### 2. Channel Abstraction

- Built-in channels in `src/{telegram,discord,slack,...}/`
- Extension channels in `extensions/{matrix,msteams,...}/`
- Each channel is a plugin registered via `ClosedClawPluginApi`
- Unified `ChannelPlugin` interface for consistency

### 3. Agent Runtime

- Pi agent runtime in RPC mode
- Tool streaming with block-based responses
- Support for subagents and tool calls
- Media understanding integrated into context

### 4. Session Model

- Main session for direct chats
- Isolated sessions per peer/group/thread
- Session keys: `agent:<agentId>:<channel>:<kind>:<peerId>`
- Binding resolution hierarchy: peer → guild → team → account → channel → default

### 5. Plugin System

- Extensions as workspace packages under `extensions/*`
- Runtime resolves `closedclaw/plugin-sdk` via jiti alias
- Plugins register: tools, hooks, channels, providers, CLI commands, gateway handlers
- Config validation strict: unknown keys fail startup

### 6. Dependency Injection

- Commands use `createDefaultDeps()` from `src/cli/deps.ts`
- Extend `CliDeps` when adding channels
- Pattern: add send method to `CliDeps` + register in `createDefaultDeps()` + add to `createOutboundSendDeps()`

## Architecture Diagrams

### High-Level System Overview

```
┌───────────────────────────────────────────────────────────┐
│                    Messaging Channels                      │
│  Telegram • WhatsApp • Discord • Slack • Signal • iMessage│
└─────────────────────────┬─────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   Gateway Control Plane                      │
│  • Auth & DM Policy   • Session Routing   • Lane Queuing   │
│  • RPC Methods        • WebSocket/HTTP    • Config Reload   │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    Agent Runtime (Pi)                        │
│  • Prompt Assembly    • Tool Execution    • Subagents       │
│  • Memory Management  • Media Pipeline    • Block Streaming │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     Tool & Plugin Layer                      │
│  • Built-in Tools     • MCP Servers       • Plugin Registry │
│  • Channel Extensions • Provider Plugins  • Hooks System    │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow (Simplified)

```
User Message
    ↓
Channel Webhook/API
    ↓
Gateway (auth, route, queue)
    ↓
Agent (load context, plan, execute)
    ↓
Tools (file ops, shell, web, APIs)
    ↓
Agent (observe, adjust, respond)
    ↓
Gateway (format, deliver)
    ↓
Channel Response
```

## Performance Considerations

### Typical Request Timing

- **Inbound:** 10-50ms (network latency)
- **Auth & routing:** 5-20ms (local checks)
- **Prompt assembly:** 50-200ms (file I/O)
- **LLM inference:** 1-5s (model-dependent)
- **Tool execution:** 100ms-60s (varies by tool)
- **Response delivery:** 50-200ms (network latency)

**Total:** ~2-65 seconds for typical request with 1-3 tool calls

### Scaling Strategies

- **Caching:** Reuse prompt components
- **Streaming:** Partial responses
- **Lazy Loading:** Defer large context files
- **Parallel Tools:** Independent tool execution (future)

## Debugging Architecture

### Gateway Logs

```bash
tail -f ~/.closedclaw/logs/gateway-*.log
```

### Session Inspection

```bash
closedclaw sessions list
closedclaw sessions inspect <sessionId>
```

### Prompt Preview

```bash
closedclaw debug prompt-preview --session <sessionId>
```

### Channel Status

```bash
closedclaw channels status
```

### Full Diagnostics

```bash
closedclaw doctor
```

## Contributing Architecture Docs

### When to Add Architecture Docs

- **New subsystem:** Major component with complex interactions
- **Request flow changes:** Modifications to how messages flow through system
- **Integration patterns:** New channel, tool, or plugin patterns
- **Performance characteristics:** Benchmarks and optimization strategies

### Documentation Standards

1. **Diagrams:** Use ASCII/Unicode for simple flows, Mermaid for complex
2. **Code Examples:** Show real patterns from codebase
3. **Cross-references:** Link to related docs, source files
4. **Current State:** Describe what IS, not what SHOULD BE (use proposals for future)
5. **Version Tags:** Note when features were added/changed

## Related Documentation

- [Research](../research/) - Exploring new concepts
- [Proposals](../proposals/) - Future feature specifications
- [Plans](../plans/) - Implementation roadmaps
- [Reference](/reference/) - API details and specifications
- [Development Guide](/.github/copilot-instructions.md) - Contributing workflow

---

**Last Updated:** 2026-02-09  
**Maintained By:** ClosedClaw Development Team
