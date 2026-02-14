---
summary: "Index of active research on agent architectures, memory systems, and protocols"
read_when:
  - Researching agent capabilities and limitations
  - Planning major architectural changes
  - Academic or theoretical questions
title: "Research Index"
---

# Research

This directory contains **active research** on agent systems, exploring new concepts, evaluating alternatives, and documenting emerging patterns. Research documents are more exploratory than proposals—they investigate possibilities rather than specify implementations.

## Active Research

### [Autonomous Evolution & Self-Healing](autonomous-evolution.md)

**Status:** Active Research | **Target:** ClosedClaw v2.2+

Explores autonomous agent evolution, self-healing tools, Shadow Factory for tool creation, and Kernel Shield for hardware-level security.

**Key Concepts:**

- Encapsulated Living Binaries (ELB)
- Shadow Factory autonomous development
- Kernel Shield hardware protection
- Probabilistic risk scoring
- State hydration for multi-day workflows

**Use When:** Researching autonomous tool creation, self-modifying agents, or hardware-backed security.

---

### [Scaling Memory Beyond Markdown](scaling-memory.md)

**Status:** Active Research

Evaluates memory alternatives (vector databases, knowledge graphs, SQLite, JSONL) for agent systems as they scale beyond simple Markdown files.

**Comparison:**

- Vector DBs → Semantic search (RAG-native)
- Knowledge Graphs → Relational intelligence
- JSONL → High-speed streaming
- SQLite + FTS5 → Searchable standard

**Decision Matrix:** Includes when to migrate from Markdown and hybrid architecture patterns.

**Use When:** Planning memory storage solutions, evaluating recall performance, or designing high-scale agent systems.

---

### [Orchestration Dialect](orchestration-dialect.md)

**Status:** Active Research | **Current:** OpenClaw v2026.2

Documents OpenClaw communication layers: Markdown context files, XML-style orchestration tags, Moltbook agent-to-agent dialect, and MCP (JSON-RPC) protocol.

**Communication Layers:**

1. **Intent:** Natural language
2. **Planning:** Markdown tags (`<thought>`, `<plan>`, `<call>`)
3. **Execution:** MCP (JSON-RPC)
4. **Social:** Moltbook dialect (agent-to-agent)
5. **Persistence:** Markdown files

**Use When:** Designing agent communication protocols, understanding internal language, or planning multi-agent coordination.

---

### [Workspace Memory](memory.md)

**Status:** Active Research

_[Existing research - refer to file for details]_

Proposes offline-first memory architecture for Clawd-style workspaces, keeping Markdown as canonical source with derived indexes for structured recall.

---

### [Agent Security: Neural Fingerprinting & Kernel Shield](agent-security.md)

**Status:** Active Research | **Target:** ClosedClaw v2.2+

Explores hardware-backed security beyond prompt-based safety: Kernel Shield architecture (three-layer defense), Neural Fingerprinting for behavioral attestation, and integration with stenographic ClawDense.

**Key Concepts:**

- **Kernel Shield Layers:** Structural enforcement, semantic filtering, neural attestation
- **Neural Fingerprinting:** Activation pattern signatures to detect prompt injection
- **Hardware Anchoring:** TPM/Secure Enclave binding for trust chain
- **Block 8 (Lexicon):** Stenographic mappings for token efficiency
- **Block 9 (Neural Fingerprint):** Behavioral signature storage

**Use When:** Researching agent security beyond traditional sandboxing, designing behavioral attestation systems, or planning hardware-backed protection.

---

## Research Guidelines

### Research vs. Proposals

| Research              | Proposals               |
| --------------------- | ----------------------- |
| **Exploratory**       | **Prescriptive**        |
| Evaluates options     | Specifies solution      |
| Compares alternatives | Defines implementation  |
| Asks questions        | Answers questions       |
| Academic tone         | Technical specification |

### Contributing Research

1. **Scope:** Focus on a specific problem or concept
2. **Evidence:** Include benchmarks, comparisons, references
3. **Neutrality:** Present alternatives fairly
4. **Academic Rigor:** Cite papers, prior art, related work
5. **Practical:** Ground in real ClosedClaw use cases

### Research Process

```
Question → Literature Review → Experimentation → Documentation → Proposal
    ↓                                                                  ↓
Review ←──────────────────────────────────────────────────────── Archive
```

**Question:** Identify problem or opportunity  
**Literature Review:** Survey existing solutions  
**Experimentation:** Prototype and benchmark  
**Documentation:** Write up findings  
**Proposal:** If promising, write formal proposal  
**Archive:** If not viable, document why

## Research Areas

### Current Focus (2026)

- **Agent Safety:** Formal verification, sandboxing, kill switches
- **Memory Systems:** Scaling beyond Markdown, hybrid architectures
- **Autonomous Capabilities:** Self-healing, tool creation, optimization
- **Multi-Agent:** Coordination protocols, skill sharing, consensus
- **Performance:** Token optimization, context management, caching

### Future Directions

- **Predictive Maintenance:** Anticipate tool failures before they occur
- **Cross-Platform:** Universal `.claws` runtime across different systems
- **Learning from Failures:** Collective intelligence across agent instances
- **Privacy-Preserving RAG:** Semantic search without cloud embeddings

## Related Documentation

- [Proposals](../proposals/) - Formal specifications ready for implementation
- [Architecture](../architecture/) - System architecture documentation
- [Plans](../plans/) - Concrete implementation plans
- [Reference](/reference/) - Implementation details and APIs

## Academic Resources

### Key Papers

- **"Formal Verification of AI-Generated Code"** (Stanford, 2025)
- **"Trusted Execution Environments for Autonomous Agents"** (Intel/IEEE, 2026)
- **"Chain of Agents Framework"** (Google Research, 2025)
- **"StreamingLLM / KV Cache Persistence"** (MIT, 2025)
- **"AgentGuard Protocol"** (Invariant Labs, 2025)
- **"Hindsight: Memory Substrate for Agents"** (Anthropic, 2025)
- **"Graphiti: Temporal Knowledge Graphs"** (Zep, 2025)

### Further Reading

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP specification
- [WASM Component Model](https://component-model.bytecodealliance.org/) - Sandboxing foundation
- [ReAct: Reasoning and Acting](https://arxiv.org/abs/2210.03629) - Agentic loop patterns

---

**Last Updated:** 2026-02-09
