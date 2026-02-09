# Entropy Injection & Observer Effects

## Overview

This proposal explores how information-theoretic concepts — entropy, observer effects, and randomness — can be applied to improve ClosedClaw's agent behavior. It is inspired by (but not endorsing) research on quantum consciousness and random number generators.

## Research Background

### The Paper: Maier et al. (2018)

**"Intentional Observer Effects on Quantum Randomness: A Bayesian Analysis Reveals Evidence Against Micro-Psychokinesis"** (PMC5872141)

- **Setup**: 12,571 participants attempted to mentally influence a quantum RNG (Quantis hardware) to produce more positive vs negative stimuli
- **Main finding**: BF01 = 10.07 — **strong evidence for the null hypothesis**. Mean positive rate: 50.02% (indistinguishable from chance). Micro-psychokinesis was NOT found.
- **Secondary finding**: The temporal oscillation pattern of cumulative z-scores had a higher frequency in human-observed data (omega=0.0018) vs simulated data (omega=0.00076). Authors speculate about entropy countermechanisms but note this is post-hoc and not evidence for micro-PK.
- **Conclusion**: The paper **refutes** direct mental influence on RNG output, supporting standard quantum mechanics (observer has no active influence on outcome probabilities).

### What This Means for ClosedClaw

A literal "consciousness affects randomness" implementation has no scientific basis. However, three software-valid concepts emerge from this research domain:

1. **Entropy injection** — deliberate randomness to prevent deterministic ruts
2. **Observer effect as software pattern** — monitoring changes runtime behavior (true in engineering)
3. **Dampened oscillation for self-correction** — overcorrection-settlement patterns in feedback loops

## Concept 1: Entropy Injection for Behavioral Diversity

### Problem

LLM agents with fixed parameters produce deterministic-adjacent behavior. Given similar inputs, they choose the same tools, follow the same patterns, and converge on the same approaches. This creates blind spots — the agent never discovers alternative strategies.

### Solution

Inject controlled randomness into agent decision-making at specific points:

```
┌─────────────────────────────────────────────────────┐
│                  Entropy Sources                     │
│                                                      │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ /dev/     │  │ Crypto    │  │ User-seeded    │  │
│  │ urandom   │  │ .random   │  │ (input hash)   │  │
│  │           │  │ Bytes()   │  │                 │  │
│  └─────┬─────┘  └─────┬─────┘  └───────┬────────┘  │
│        │              │                 │            │
│        └──────────────┼─────────────────┘            │
│                       ▼                              │
│              Entropy Pool                            │
│              (deterministic seed +                   │
│               true randomness blend)                 │
│                                                      │
└───────────────────────┬──────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              Injection Points                        │
│                                                      │
│  1. Temperature variation                            │
│     Base temp ± entropy_delta                        │
│     Range: [0.5, 1.2] (configurable bounds)          │
│                                                      │
│  2. System prompt rotation                           │
│     Random selection from prompt variations:         │
│     "Consider unconventional approaches"             │
│     "What would a different expert suggest?"         │
│     "Challenge your first instinct"                  │
│                                                      │
│  3. Tool order shuffling                             │
│     When presenting available tools to the model,    │
│     randomize order to reduce position bias          │
│                                                      │
│  4. Exploration nudges                               │
│     Epsilon-greedy: with probability ε, suggest      │
│     the agent try a different approach than usual     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Configuration

```json5
{
  agents: {
    defaults: {
      entropy: {
        enabled: false,              // opt-in
        temperatureVariance: 0.1,    // ± this amount from base temp
        promptRotation: false,       // rotate system prompt suffixes
        toolOrderShuffle: false,     // randomize tool presentation order
        explorationRate: 0.0,        // epsilon for exploration (0.0 = off, 0.1 = 10% explore)
        seed: null                   // null = true random, string = deterministic seed
      }
    }
  }
}
```

### Implementation via Hook

```typescript
// Conceptual: before_agent_start hook
api.on("before_agent_start", {
  priority: 50,
  handler: async (event, next) => {
    const entropy = resolveEntropyConfig(event.agentId);
    if (!entropy?.enabled) return next();

    // Temperature variation
    if (entropy.temperatureVariance > 0) {
      const delta = (cryptoRandom() - 0.5) * 2 * entropy.temperatureVariance;
      event.temperature = clamp(event.temperature + delta, 0.0, 2.0);
    }

    // Prompt rotation
    if (entropy.promptRotation) {
      const suffix = pickRandom(EXPLORATION_PROMPTS);
      event.systemPrompt += `\n\n${suffix}`;
    }

    return next();
  }
});
```

## Concept 2: Observer Effect as Software Pattern

### The Principle

In software, observation genuinely changes behavior:
- Adding logging changes timing (I/O overhead)
- Profiling changes memory allocation patterns
- Monitoring dashboards change operator behavior which changes system config
- The self_mirror plugin, by existing, causes the system to produce diagnostic artifacts

### Application: Observation-Aware Agents

Rather than fighting the observer effect, embrace it. The agent should know when it's being observed and may behave differently:

```json5
{
  agents: {
    list: {
      "main": {
        observability: {
          mode: "aware",          // "unaware" | "aware" | "transparent"
          // "unaware": agent doesn't know it's being monitored
          // "aware": agent knows monitoring exists but not specifics
          // "transparent": agent can read its own mirror observations
        }
      }
    }
  }
}
```

**Trade-off analysis:**

| Mode | Benefit | Risk |
|---|---|---|
| **unaware** | Most natural behavior, best for diagnostics | Agent may make errors it would avoid if watched |
| **aware** | Agent self-corrects knowing observations happen | May perform differently (Hawthorne effect) — but this could be desirable |
| **transparent** | Agent can learn from mirror feedback | Feedback loop risk; agent may game the mirror's metrics |

### Measuring the Observer Effect

The self_mirror can run controlled experiments:
1. Observe agent with monitoring hooks active for 1 week
2. Observe agent with hooks disabled for 1 week (mirror only sees session logs post-hoc)
3. Compare: response quality, tool efficiency, error rates, cost
4. Quantify the delta attributable to observation overhead and behavioral change

## Concept 3: Dampened Oscillation for Self-Correction

### The Pattern

From the Maier et al. paper: effects oscillate and settle. This maps to a control systems concept — overcorrection followed by dampening:

```
Quality  │    ╭─╮
Score    │   ╱   ╲      ╭╮
         │  ╱     ╲    ╱  ╲     ╭╮
Optimal ─│─╱───────╲──╱────╲───╱──╲─────── → convergence
         │╱         ╲╱      ╲╱    ╲╱
         │          correction   correction
         │          overshoots   undershoots
         └──────────────────────────────── time
```

### Application: Adaptive Prompt Modulation

When the self_mirror detects a quality trend:

1. **Drift detected**: Agent responses becoming too verbose (quality score declining)
2. **Correction applied**: System prompt addendum: "Be more concise"
3. **Overcorrection risk**: Agent becomes too terse
4. **Dampening**: Reduce correction strength by 50% each cycle
5. **Convergence**: After 3-4 cycles, agent settles at optimal verbosity

### Implementation

```typescript
interface CorrectionState {
  metric: string;           // "verbosity" | "tool_efficiency" | "error_rate"
  targetValue: number;      // desired score
  currentValue: number;     // latest measured score
  correctionStrength: number; // starts at 1.0, halves each cycle
  dampingFactor: number;    // 0.5 default
  cycleCount: number;       // how many corrections applied
  maxCycles: number;        // stop after N corrections (prevent infinite loop)
}

function computeCorrection(state: CorrectionState): string | null {
  const delta = state.currentValue - state.targetValue;
  if (Math.abs(delta) < EPSILON) return null;  // converged

  if (state.cycleCount >= state.maxCycles) return null;  // give up

  const strength = state.correctionStrength * Math.pow(state.dampingFactor, state.cycleCount);

  // Generate proportional correction prompt
  if (state.metric === "verbosity" && delta > 0) {
    return `Note: Your recent responses have been somewhat verbose. Aim for ${Math.round(strength * 100)}% more concise answers.`;
  }
  // ... other metrics

  return null;
}
```

### Integration with self_mirror

The self_mirror is the natural home for oscillation detection and correction:

1. Mirror observes quality metrics over time
2. Mirror detects oscillation patterns (alternating deviations from optimal)
3. Mirror writes correction suggestions to harvest store
4. Operator-approved corrections become system prompt modulations
5. Mirror measures correction effect in next cycle
6. Dampening factor prevents runaway oscillation

## Information-Theoretic Metrics

### Entropy of Agent Behavior

Measure behavioral diversity using Shannon entropy:

$$H(X) = -\sum_{i=1}^{n} p(x_i) \log_2 p(x_i)$$

Where $X$ is the distribution of tool choices over a window of $N$ actions.

| Metric | Low entropy (< 1.0) | High entropy (> 3.0) |
|---|---|---|
| **Tool distribution** | Agent stuck on 1-2 tools | Agent using diverse toolkit |
| **Response length** | Uniform response sizes | Varied (appropriate to context) |
| **Decision time** | Constant deliberation | Variable (simple = fast, complex = slow) |

The mirror agent computes these periodically and flags when entropy drops below a threshold (behavioral rut) or spikes above (erratic behavior).

### Mutual Information Between Agents

For squad operations, measure how much information one agent's actions tell us about another's:

$$I(A;B) = \sum_{a,b} p(a,b) \log \frac{p(a,b)}{p(a)p(b)}$$

High mutual information = agents are tightly coupled (good for pipeline, bad for parallel exploration).

## Implementation Checklist

- [ ] Define entropy config schema (agents.defaults.entropy.*)
- [ ] Implement entropy pool (crypto-based randomness source)
- [ ] Build temperature variance injection (before_agent_start hook)
- [ ] Build tool order shuffling middleware
- [ ] Build exploration rate (epsilon-greedy) for tool selection
- [ ] Add prompt rotation pool with exploration-encouraging suffixes
- [ ] Implement behavioral entropy measurement in self_mirror
- [ ] Build dampened oscillation tracker for self-correction
- [ ] Add observation mode config (unaware/aware/transparent)
- [ ] Create metrics dashboard for entropy and quality tracking
- [ ] Write tests for entropy injection (verify randomness bounds)

## Estimated Effort

- **Entropy injection (hook + config)**: 1 day
- **Behavioral entropy measurement**: 0.5 days (in self_mirror)
- **Dampened oscillation tracker**: 1 day
- **Observation mode config**: 0.5 days
- **Total**: ~3 days

## Dependencies

- self_mirror plugin (for measurement and correction)
- Hook system (for injection points)
- Agent config schema (for new entropy settings)

## Cost Impact

Entropy injection itself has **zero token cost** — it modifies parameters, not content. The measurement components run inside the self_mirror which is already budgeted separately.

Temperature variance may slightly increase output token variance, but the effect on cost is negligible (<1%).

## Synergies

- **self_mirror**: Primary consumer of entropy metrics; drives oscillation correction
- **Internal consciousness**: Randomized audit focus prevents predictable scanning patterns
- **ClawTalk**: Information-theoretic metrics (entropy, mutual information) apply directly to protocol optimization — measuring information density of inter-agent messages
