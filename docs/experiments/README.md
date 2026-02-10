---
summary: "Index of experiments, research, proposals, and architecture documentation"
read_when:
  - Exploring future features and research
  - Understanding system architecture
  - Contributing ideas or implementations
title: "Experiments & Research"
---

# Experiments & Research

This directory contains forward-looking research, active proposals for new features, system architecture documentation, and implementation plans for OpenClaw and ClosedClaw.

## Directory Structure

### [architecture/](architecture/)
**Current implementation** documentation of OpenClaw and ClosedClaw systems.

Includes:
- [Request Lifecycle](architecture/request-lifecycle.md) - Complete request flow from user input to response
- Gateway architecture, session management, agent runtime
- Channel plugin system, routing layer, memory pipeline

**Use When:** Understanding how the system works today, debugging, designing integrations.

---

### [research/](research/)
**Active research** exploring new concepts, evaluating alternatives, and documenting emerging patterns.

Includes:
- [Autonomous Evolution](research/autonomous-evolution.md) - Self-healing, Shadow Factory, Kernel Shield
- [Scaling Memory](research/scaling-memory.md) - Beyond Markdown: vector DBs, knowledge graphs, SQLite
- [Orchestration Dialect](research/orchestration-dialect.md) - Communication layers and protocols
- [Workspace Memory](research/memory.md) - Offline-first memory architecture

**Use When:** Researching agent capabilities, planning major changes, academic/theoretical questions.

---

### [proposals/](proposals/)
**Active proposals** for future features—polished specifications ready for community discussion and implementation.

Includes:
- [.claws File Format](proposals/claws-file-format.md) - Literate executables for autonomous tools
- [ClawDense Notation](proposals/clawdense-notation.md) - Token-optimized communication protocol
- [Model Configuration](proposals/model-config.md) - Model selection and routing

**Use When:** Exploring future features, contributing ideas, planning roadmap.

---

### [plans/](plans/)
**Concrete implementation plans** with specific tasks, timelines, and milestones.

Includes:
- OpenResponses gateway integration (complete)

**Archived** (in `plans/archived/`):
- Cron add hardening (complete)
- Group policy hardening (complete)

**Use When:** Coordinating implementation work, tracking progress, assigning tasks.

---

### [onboarding-config-protocol.md](onboarding-config-protocol.md)
Onboarding configuration protocol specification.

---

## Content Types

| Directory | Type | Status | Focus |
|-----------|------|--------|-------|
| **architecture/** | Documentation | Current | How it works now |
| **research/** | Exploration | Active | What's possible |
| **proposals/** | Specification | Active | What we'll build |
| **plans/** | Implementation | Complete/Active | How we'll build it |

## Document Lifecycle

```
Research Question
    ↓
Literature Review & Experimentation
    ↓
Research Document (research/)
    ↓
Formalize if promising
    ↓
Proposal Document (proposals/)
    ↓
Community discussion & refinement
    ↓
Implementation Plan (plans/)
    ↓
Development & testing
    ↓
Architecture Documentation (architecture/)
    ↓
Integrated into main docs (/)
```

## Contributing

### Research Contributions

**Goal:** Explore possibilities, evaluate alternatives, document findings.

**Process:**
1. Identify problem or opportunity
2. Survey existing solutions and academic literature
3. Prototype and benchmark if applicable
4. Document findings in `research/`
5. If promising, move to proposal stage

**Best Practices:**
- Compare alternatives fairly
- Include benchmarks and references
- Cite papers and prior art
- Ground in real ClosedClaw use cases

---

### Proposal Contributions

**Goal:** Specify solution for implementation.

**Process:**
1. Use proposal template (see `proposals/README.md`)
2. Clearly define problem and solution
3. Include implementation roadmap
4. Link to related research and docs
5. Open GitHub issue for discussion

**Best Practices:**
- Be prescriptive, not exploratory
- Include code examples
- Define success criteria
- Address security and performance

---

### Architecture Documentation

**Goal:** Document current implementation.

**Process:**
1. Describe what IS, not what SHOULD BE
2. Include diagrams and code examples
3. Cross-reference source files
4. Note version where features were added

**Best Practices:**
- Keep synchronized with code
- Use diagrams for complex flows
- Link to related docs
- Include debugging tips

---

### Implementation Plans

**Goal:** Coordinate development work.

**Process:**
1. Break proposal into phases and tasks
2. Assign owners and timelines
3. Track progress and blockers
4. Update as work progresses

**Best Practices:**
- Specific, measurable tasks
- Realistic timelines
- Clear dependencies
- Regular updates

## Recent Updates (2026-02-09)

### New Content

- ✅ **[.claws File Format Proposal](proposals/claws-file-format.md)** - Consolidated from previous research, now includes Block 8 (Lexicon) and Block 9 (Neural Fingerprint)
- ✅ **[ClawDense Notation Proposal](proposals/clawdense-notation.md)** - Token-optimized protocol with advanced stenographic compression (A-Script, Teeline, Orthic, Pitman)
- ✅ **[Autonomous Evolution Research](research/autonomous-evolution.md)** - Self-healing systems and Shadow Factory
- ✅ **[Request Lifecycle Architecture](architecture/request-lifecycle.md)** - Complete flow documentation
- ✅ **[Agent Security Research](research/agent-security.md)** - Neural Fingerprinting, Kernel Shield three-layer defense, hardware anchoring

### Reorganization Complete

Migrated content from `docs/research-9_2_26/` into proper structure:
- Proposals now in `proposals/`
- Research in `research/`
- Architecture docs in `architecture/`
- Added comprehensive READMEs for each section
- Cross-referenced all related documents

## Related Documentation

### Main Documentation
- [Getting Started](/start/getting-started) - First-time setup
- [Configuration](/configuration) - Config reference
- [Channels](/channels) - Messaging platform integrations
- [Tools](/tools) - Available agent capabilities
- [Security](/security) - Auth, pairing, encryption

### Development
- [Development Guide](/.github/copilot-instructions.md) - Contributing workflow
- [Testing Guide](/testing.md) - Test patterns and execution
- [Release Process](/reference/RELEASING.md) - Version management

### Reference
- [API Reference](/reference/) - Detailed specifications
- [Agent Configuration](/reference/AGENTS.default.md) - Default behaviors
- [Session Management](/reference/session-management-compaction.md) - Session lifecycle

## Quick Links

**Want to understand the system?** → Start with [Request Lifecycle](architecture/request-lifecycle.md)

**Exploring future features?** → Browse [Proposals](proposals/)

**Researching possibilities?** → Check [Research](research/)

**Planning implementation?** → Review [Plans](plans/)

**Contributing ideas?** → Read contribution guidelines above

---

**Last Updated:** 2026-02-09  
**Maintained By:** ClosedClaw Research & Development Team

For questions or suggestions, open an issue on GitHub or join the Discord community.
