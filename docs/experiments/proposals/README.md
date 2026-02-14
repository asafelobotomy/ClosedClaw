---
summary: "Index of active proposals for OpenClaw and ClosedClaw features"
read_when:
  - Exploring future feature proposals
  - Contributing new ideas
  - Planning roadmap items
title: "Proposals Index"
---

# Proposals

This directory contains **active proposals** for future OpenClaw and ClosedClaw features. These are polished, detailed specifications ready for community discussion and implementation.

## Active Proposals

### [.claws File Format](claws-file-format.md)

**Status:** Active Proposal | **Target:** OpenClaw v3.0

Literate executable format combining semantic intent, executable code, runtime verification, and telemetry. Enables autonomous tool creation, hot-swapping, and self-healing capabilities.

**Key Features:**

- WASM-based sandboxed execution
- Semantic firewall for input/output
- Formal verification proofs
- State hydration for long-running tasks
- Trust scoring system

**Use When:** Designing autonomous tool creation systems, agent safety frameworks, or self-modifying code systems.

---

### [ClawDense Notation](clawdense-notation.md)

**Status:** Active Proposal (Partial Implementation) | **Target:** ClosedClaw v2.2+

Token-optimized shorthand for machine-to-machine communication between Kernel and LLM.

**Key Features:**

- 60% token reduction vs. Markdown
- Prefix-based syntax (`!`, `@`, `?`, `>>`, `$`)
- Integration with Kernel Shield
- Hardware-in-the-Loop support

**Use When:** Optimizing agent token usage, designing internal protocols, or working on security systems.

---

### [Model Configuration](model-config.md)

**Status:** Active Proposal

_[Existing proposal - refer to file for details]_

---

## Proposal Guidelines

### Submitting a Proposal

1. **Template:** Use the frontmatter format from existing proposals
2. **Clarity:** Explain the problem, solution, and alternatives
3. **Examples:** Include code samples and use cases
4. **References:** Link to academic papers, prior art, related work
5. **Status:** Mark as "Draft", "Active Proposal", or "Under Review"

### Proposal Lifecycle

```
Draft → Review → Active Proposal → Implementation → Integrated
   ↓                                                      ↑
Archived ←───────────────────────────────────────────────┘
```

**Draft:** Early stage, seeking feedback  
**Review:** Under community evaluation  
**Active Proposal:** Approved for implementation  
**Implementation:** Work in progress  
**Integrated:** Merged into main codebase  
**Archived:** Superseded or no longer relevant

### Discussion

For proposal discussions:

- Open GitHub Issues tagged with `proposal`
- Join Discord #proposals channel
- Comment on related pull requests

## Proposal Template

```markdown
---
summary: "One-line description of the proposal"
status: "Draft | Active Proposal | Under Review"
read_when:
  - When this proposal is relevant
title: "Proposal Title"
date: "YYYY-MM-DD"
---

# Proposal Title

**Status:** [Draft/Active/Review]  
**Target:** [Version/Timeline]

## Problem Statement

What problem does this solve?

## Proposed Solution

Detailed explanation of the approach.

## Alternatives Considered

What other approaches were evaluated?

## Implementation Roadmap

### Phase 1: Foundation

- [ ] Task 1
- [ ] Task 2

### Phase 2: Integration

...

## Related Documentation

- [Link to related docs]

## References

- Academic papers, prior art, etc.
```

## Related Documentation

- [Research](../research/) - Active research exploring new concepts
- [Architecture](../architecture/) - System architecture documentation
- [Plans](../plans/) - Concrete implementation plans
- [Reference](/reference/) - Implementation details and APIs

---

**Last Updated:** 2026-02-09
