# Agent Intelligence Roadmap

## Executive Summary

Four interconnected capabilities that give ClosedClaw metacognitive ability — the capacity to observe, analyze, and improve its own behavior over time.

| Capability                                                    | One-liner                                                                 | Effort    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| [Internal Consciousness](internal-consciousness.md)           | Security agent that thinks about vulnerabilities, not just scans for them | 3 days    |
| [self_mirror](self-mirror.md)                                 | Sandboxed observer that forms independent opinions on agent behavior      | 4 days    |
| [Entropy & Observer Effects](entropy-and-observer-effects.md) | Controlled randomness injection and information-theoretic measurement     | 3 days    |
| [ClawTalk](clawtalk.md)                                       | Evolved internal protocol for token-efficient inter-agent communication   | 7-10 days |

**Total estimated effort**: 17-20 days (phased, with meaningful value at each milestone)

## How They Connect

```
                    ┌─────────────────────┐
                    │    ClawTalk          │
                    │    (communication    │
                    │     substrate)       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Internal    │  │  self_mirror  │  │  Entropy &   │
    │  Conscious-  │  │  (observes   │  │  Observer     │
    │  ness        │  │   everything) │  │  Effects     │
    │  (security)  │  │              │  │  (randomness) │
    └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
           │                │                  │
           │                ▼                  │
           │       ┌──────────────┐            │
           │       │ Harvest Store │            │
           │       │ (observations,│            │
           │       │  metrics,     │◄───────────┘
           │       │  proposals)   │
           │       └──────┬───────┘
           │              │
           └──────────────┘
                  │
                  ▼
         ┌──────────────┐
         │   Operator    │
         │   Dashboard   │
         │   & Commands  │
         └──────────────┘
```

### Dependency Graph

```
Phase 1: ClawTalk DSL ─────────────────────────► standalone
Phase 1: Internal Consciousness ────────────────► standalone (existing infra)
Phase 1: self_mirror plugin ────────────────────► standalone

Phase 2: Entropy injection ─────────────────────► depends on self_mirror (for measurement)
Phase 2: ClawTalk Dictionary ───────────────────► depends on self_mirror (for proposals)

Phase 3: ClawTalk Self-Optimization ────────────► depends on self_mirror + entropy metrics
Phase 3: Dampened Oscillation Correction ───────► depends on self_mirror + entropy metrics
```

## Implementation Phases

### Phase 1: Foundations (Week 1-2)

Three independent workstreams that can proceed in parallel:

| Workstream                 | Deliverables                                                                    | Days |
| -------------------------- | ------------------------------------------------------------------------------- | ---- |
| **Internal Consciousness** | Security agent config, system prompt, memory schema, cron templates             | 2    |
| **self_mirror**            | Plugin skeleton, event buffer, digest composer, harvest store, /mirror commands | 4    |
| **ClawTalk DSL**           | Parser, encoder, decoder, IPC integration, fallback behavior                    | 4    |

**Milestone**: Security agent runs scheduled audits. Mirror agent produces observations. ClawTalk encodes/decodes basic messages.

### Phase 2: Integration (Week 3)

Workstreams begin to connect:

| Workstream                 | Deliverables                                                                | Days |
| -------------------------- | --------------------------------------------------------------------------- | ---- |
| **Entropy Injection**      | Temperature variance, tool shuffling, exploration rate (measured by mirror) | 2    |
| **ClawTalk Dictionary**    | Macro system, abbreviations, proposal workflow, /clawtalk commands          | 3    |
| **Consciousness + Mirror** | Mirror observes security audits; audit findings persist with trend tracking | 1    |

**Milestone**: Entropy varies agent behavior measurably. ClawTalk dictionary reduces inter-agent token usage. Mirror tracks security audit trends.

### Phase 3: Self-Improvement (Week 4-5)

The pieces form a feedback loop:

| Workstream                 | Deliverables                                                 | Days |
| -------------------------- | ------------------------------------------------------------ | ---- |
| **ClawTalk Optimization**  | Frequency analysis, auto-propose, comprehension verification | 3    |
| **Oscillation Correction** | Quality tracking, dampened correction, homeostatic prompting | 2    |
| **LLM Protocol Exposure**  | A/B testing of hybrid mode, gradual CT format exposure       | 2    |

**Milestone**: System proposes its own protocol optimizations. Quality metrics converge via dampened correction. Proven macros optionally exposed to LLMs.

## Cost Summary

| Component                               | Monthly cost   | Notes                                     |
| --------------------------------------- | -------------- | ----------------------------------------- |
| Internal Consciousness (daily + weekly) | ~$4            | Sonnet for daily, Opus for weekly scans   |
| self_mirror                             | ~$1            | GPT-4.1-mini, batched digests             |
| Entropy injection                       | $0             | Parameter changes only, no token cost     |
| ClawTalk                                | -$0.45 to -$5  | Net savings from compression              |
| **Net monthly impact**                  | **~$0 to +$5** | Roughly cost-neutral to slightly positive |

The system pays for its own metacognition through communication efficiency gains.

## Success Metrics

| Metric                              | Baseline                | Target                 | Measured by            |
| ----------------------------------- | ----------------------- | ---------------------- | ---------------------- |
| Security findings per audit         | —                       | >5 meaningful findings | Internal Consciousness |
| Finding false positive rate         | —                       | <20%                   | Operator feedback      |
| Behavioral anomalies detected       | 0                       | >3/week                | self_mirror            |
| Agent quality score trend           | —                       | Stable or improving    | self_mirror + entropy  |
| Inter-agent token usage             | 100% (natural language) | <40% (ClawTalk)        | ClawTalk metrics       |
| Protocol proposals accepted         | —                       | >50%                   | ClawTalk dictionary    |
| Behavioral entropy (tool diversity) | —                       | >2.0 bits              | Entropy measurement    |

## Existing Infrastructure Leveraged

These proposals are built almost entirely on existing ClosedClaw components:

| Component                    | Used by                                  | Status                                           |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Security audit engine        | Internal Consciousness                   | Built (`src/security/audit.ts`)                  |
| Subagent system              | Internal Consciousness, self_mirror      | Built (`src/agents/subagent-*`)                  |
| Plugin hook system           | self_mirror, Entropy                     | Built (`src/plugins/types.ts`)                   |
| Squad IPC                    | ClawTalk                                 | Built (`src/agents/squad/ipc.ts`)                |
| Squad memory (3-tier)        | ClawTalk Dictionary, self_mirror Harvest | Built (`src/agents/squad/memory/`)               |
| Diagnostic events            | self_mirror, Entropy                     | Built (`src/infra/diagnostic-events.ts`)         |
| Cron scheduling              | Internal Consciousness                   | Built (`src/agents/tools/cron-tool.ts`)          |
| Memory extensions            | Internal Consciousness, self_mirror      | Built (`extensions/memory-*`)                    |
| sessions_send                | ClawTalk, self_mirror                    | Built (`src/agents/tools/sessions-send-tool.ts`) |
| Agent config + tool policies | All                                      | Built (`src/config/types.agents.ts`)             |

## Open Questions

1. **Mirror recursion**: Should the mirror observe other specialized agents (security, ClawTalk optimizer), or only the main agent? Broader observation = more insight but higher cost.

2. **ClawTalk adoption**: Should ClawTalk be mandatory for squad IPC or opt-in per agent? Mandatory = consistent savings but harder to debug.

3. **Correction authority**: Should the oscillation correction system auto-modify system prompts, or only propose changes for operator approval? Auto = faster convergence but risk of instability.

4. **Cross-instance protocol**: If multiple ClosedClaw instances communicate (ClawNet), should ClawTalk be shared across instances? Shared = network effects but version coordination complexity.

5. **Entropy source**: Use `/dev/urandom` (fast, pseudo-random) or a hardware RNG (true random, requires hardware)? Pseudo-random is sufficient for behavioral diversity.

## Related Documentation

- [DevOps Subagent Usage Guide](../agents/devops-subagent.md)
- [ClosedClaw Fork Roadmap](../refactor/closedclaw-fork-roadmap.md) — Phase 2.5 (Meta-Development)
- [Multi-Agent Concepts](multi-agent.md)
- [Plugin Development](../plugin.md)
- [Hook System](../hooks.md)
