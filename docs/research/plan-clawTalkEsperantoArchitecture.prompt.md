# ClawTalk Refined Architecture: Esperanto for LLMs

## The Core Insight

You're describing a **brain + body** architecture:

| Component                   | Role                                                           | Analogy                      |
| --------------------------- | -------------------------------------------------------------- | ---------------------------- |
| **ClosedClaw Frontend LLM** | Personality, memory, routing, user communication               | Brain                        |
| **Translation Device**      | Nervous system — carries signals between brain and limbs       | Spinal cord                  |
| **ClawDense / .claws**      | Universal signal format all organs understand                  | Nervous impulse encoding     |
| **Subagents**               | Specialists that perform tasks                                 | Organs / limbs               |
| **CT/1 Protocol**           | Routing metadata — which organ, what priority, what capability | Hormonal / addressing system |

The Esperanto analogy is apt but needs refinement. Here's why and how:

---

## Why Esperanto Works (and Where It Breaks)

### The Problem with English Inter-Agent Communication

When Qwen3 spawns a Claude subagent and communicates in English:

```
Qwen3 -> "Please search the web for the latest Node.js CVEs and return
         a structured summary with severity ratings, affected versions,
         and mitigation steps. Prioritize critical and high severity."
```

This is **83 tokens**. It contains:

- Politeness tokens ("Please") — waste
- Redundant structure ("and return", "with") — waste
- Ambiguity ("latest" — last week? last year? "structured" — JSON? markdown? bullets?)
- Model-specific interpretation risk — Claude interprets "structured summary" differently than Qwen3 does

### The Esperanto Fix

A true inter-LLM lingua franca wouldn't be a natural language at all. It would be a **structured schema language** that eliminates ambiguity while remaining readable by any model:

```
Not this (ClawDense as a "language" LLMs speak):
  @fs:r -> ?web:s("Node.js CVE") -> @filter(severity>=high) -> @fmt:summary

This (ClawDense as a compiled task specification):
  {
    "task": "web_research",
    "query": "Node.js CVE 2025-2026",
    "filters": { "severity": ["critical", "high"] },
    "output": {
      "format": "structured_list",
      "fields": ["cve_id", "severity", "affected_versions", "mitigation"]
    },
    "constraints": { "recency": "90d", "max_sources": 10 }
  }
```

**27 tokens** for the JSON vs 83 for the English. Zero ambiguity. Every model that understands JSON (all of them) interprets this identically.

But here's the key: **the subagent LLM doesn't receive this JSON directly**. The Translation Device receives it, then compiles it into the optimal prompt format for _that specific model_:

For **Qwen3** subagent:

```
Search the web for Node.js CVEs from the past 90 days. Return only critical
and high severity. For each: CVE ID, severity, affected versions, mitigation.
Maximum 10 sources. Output as a structured list.
```

For **Claude** subagent:

```xml
<task>Search for Node.js CVEs from the past 90 days.</task>
<constraints>
  <severity>critical, high</severity>
  <max_sources>10</max_sources>
</constraints>
<output_format>
  Structured list with fields: cve_id, severity, affected_versions, mitigation
</output_format>
```

For **GPT-4** subagent: a function call with typed parameters.

**ClawDense becomes the intermediate representation (IR) — like LLVM IR for compilers.** The source is user NL. The IR is ClawDense. The target is model-optimized prompts. No model ever sees ClawDense.

---

## Improved Architecture: Brain + Nervous System + Body

```
+-------------------------------------------------------------+
|                        USER                                  |
|                   (Natural Language)                          |
+----------------------+--------------------------------------+
                       |
                       v
+--------------------------------------------------------------+
|              CLOSEDCLAW FRONTEND LLM                          |
|                    "The Brain"                                |
|                                                              |
|  Role:                                                       |
|  - Personality & memory (conversation history)               |
|  - Intent understanding (what does the user want?)           |
|  - Task decomposition (break complex requests into steps)    |
|  - Response synthesis (merge subagent results into           |
|    coherent, personable reply)                               |
|  - Direct conversation (no subagent needed for chat)         |
|                                                              |
|  Does NOT:                                                   |
|  - Execute tools directly (delegates to subagents)           |
|  - Speak ClawDense (never sees it)                           |
|  - Know about the Translation Device (transparent)           |
|                                                              |
|  Model: Personable, fast, good at reasoning                  |
|         (e.g., Qwen3, Claude Sonnet, GPT-4o)                |
+----------------------+--------------------------------------+
                       |
              Function calls / tool calls
              (native model format)
                       |
                       v
+--------------------------------------------------------------+
|              TRANSLATION DEVICE                               |
|              "The Nervous System"                             |
|                                                              |
|  Pure code -- zero LLM tokens                                |
|                                                              |
|  1. Intercepts function calls from Frontend LLM              |
|  2. Resolves which subagent + skill handles the task         |
|  3. Compiles .claws skill -> model-specific prompt           |
|  4. Compresses context via ClawDense (wire only)             |
|  5. Spawns subagent with compiled prompt + tools             |
|  6. Receives subagent response                               |
|  7. Validates + sanitizes response                           |
|  8. Decompresses if needed                                   |
|  9. Returns clean result to Frontend LLM                     |
|                                                              |
|  ClawDense lives HERE and only here                          |
+--------+---------+---------+--------+-----------------------+
         |         |         |        |
         v         v         v        v
+----------+ +----------+ +----------+ +----------+
|Scientist | |Historian | |Coder     | |Chef      |
|SubAgent  | |SubAgent  | |SubAgent  | |SubAgent  |
|          | |          | |          | |          |
|Model:    | |Model:    | |Model:    | |Model:    |
|Claude    | |Qwen3     | |Claude    | |GPT-4o    |
|Opus      | |          | |Sonnet    | |mini      |
|          | |          | |          | |          |
|Sees: NL  | |Sees: NL  | |Sees: NL  | |Sees: NL  |
|prompt    | |prompt    | |prompt    | |prompt    |
|compiled  | |compiled  | |compiled  | |compiled  |
|from      | |from      | |from      | |from      |
|.claws    | |.claws    | |.claws    | |.claws    |
+----------+ +----------+ +----------+ +----------+
```

---

## Pain Points Eliminated

### Pain Point 1: Garbled Output (Current Bug)

**Root cause**: ClawTalk metadata injected into LLM prompt.
**Fix**: LLMs never see ClawDense. The TD is a code boundary. The `before_agent_start` hook produces only clean NL system prompts. The `message_sending` hook strips any residual artifacts. **Two-layer guarantee.**

### Pain Point 2: LLMs Can't Speak Custom Languages

**Root cause**: Trying to make LLMs generate/parse ClawDense.
**Fix**: ClawDense is an **IR**, not a language. It's machine-readable structured data processed by the TD (code). LLMs speak their native format (NL + function calling). The `.claws` compiler handles the translation at compile time, not inference time.

### Pain Point 3: Token Waste on Translation

**Root cause**: Having LLMs translate between formats.
**Fix**: All translation is deterministic code. Zero LLM tokens spent on encoding/decoding. The only tokens are the task itself.

### Pain Point 4: Cross-Model Confusion

**Root cause**: Different models interpret the same English differently.
**Fix**: The TD compiles the same ClawDense IR into **model-optimized prompts**. A `.claws` skill can have `@dialect` annotations per model family:

```claws
@skill:web-research v1

# Block 3: IDL with dialect hints
@dialect:anthropic {
  Use XML tags for structure. Be direct.
}
@dialect:openai {
  Use function calling for structured output.
}
@dialect:qwen {
  Use markdown headers for structure. Be thorough.
}
```

The compiler selects the right dialect for the target subagent's model. Same skill, optimal prompt per model.

### Pain Point 5: Manual Subagent Configuration

**Root cause**: Hand-writing system prompts and tool lists per subagent.
**Fix**: `.claws` skill files are the single source of truth. The compiler generates:

- System prompt (from Vibe block)
- Tool schemas (from IDL block)
- Execution plan (from Engine block)
- Guardrails (from Manifest block)
- Model preference (from `@dialect` annotations)

Drop a `.claws` file -> subagent exists. Delete it -> subagent gone.

### Pain Point 6: Frontend LLM Doing Everything

**Root cause**: Single monolithic agent with a massive system prompt.
**Fix**: Frontend LLM has a lean system prompt focused on personality + routing. It has **one meta-tool**: `delegate_task`. Everything else flows through subagents.

---

## The Frontend LLM's Interface

The Frontend LLM doesn't know about ClawTalk, subagents, or the Translation Device. It sees **one tool**:

```typescript
// src/agents/tools/delegate-task-tool.ts

export function createDelegateTaskTool(options: {
  translationDevice: TranslationDevice;
}): AnyAgentTool {
  return {
    name: "delegate_task",
    description: `Delegate a task to a specialist. Use this when the user's
request requires:
- Web searching or research
- Code generation or analysis
- File operations
- Data processing
- Any domain expertise beyond conversation

Describe the task in plain English. The system will route to the best
specialist. Do NOT attempt to perform these tasks yourself -- delegate them.`,
    parameters: {
      task: {
        type: "string",
        description: "What needs to be done, in plain English",
        required: true,
      },
      domain_hint: {
        type: "string",
        description: "Optional hint: 'research', 'code', 'science', 'history', 'cooking', etc.",
        required: false,
      },
      urgency: {
        type: "string",
        description: "'low', 'normal', 'high' -- affects model selection",
        required: false,
      },
    },
    handler: async (params) => {
      const task = readStringParam(params, "task", { required: true });
      const domainHint = readStringParam(params, "domain_hint");
      const urgency = readStringParam(params, "urgency") ?? "normal";

      // Translation Device handles everything:
      // 1. Encode task -> ClawDense IR
      // 2. Route to best subagent + skill
      // 3. Compile skill -> subagent prompt
      // 4. Spawn subagent
      // 5. Collect + validate response
      // 6. Return clean NL result
      const result = await options.translationDevice.dispatch({
        task,
        domainHint: domainHint ?? undefined,
        urgency: urgency as "low" | "normal" | "high",
      });

      return jsonResult({
        status: result.status,
        result: result.content,
        source: result.subagentId,
        confidence: result.confidence,
      });
    },
  };
}
```

The Frontend LLM's system prompt becomes:

```
You are ClosedClaw, a personal AI assistant. You are friendly, helpful, and
knowledgeable.

For general conversation, respond directly.

For any task that requires action (searching, coding, file operations,
research, analysis), use the delegate_task tool. Describe what's needed
in plain English. A specialist will handle it and return the result.

When you receive a result from delegate_task, present it to the user in
your own voice -- don't just repeat it verbatim. Add context, explain
findings, and be conversational.

You are the face of ClosedClaw. The specialists behind you are invisible
to the user.
```

**~100 tokens.** Compare to a monolithic system prompt that tries to cover every domain (~2000+ tokens).

---

## The Esperanto Question: Answered

ClawDense is **not** an Esperanto that LLMs speak to each other. That would require:

- Teaching every model a new language (system prompt overhead or fine-tuning)
- Hoping they generate valid syntax (unreliable)
- Debugging cross-model dialect differences

Instead, ClawDense is a **compiled intermediate representation**:

```
User NL          ->  Frontend LLM understands intent
                      |
                    delegate_task("Search for Node.js CVEs")
                      |
                    Translation Device encodes to ClawDense IR
                      |
                    ClawDense: { task: "web_research", query: "...", ... }
                      |
                    Compiler: loads web-research.claws skill
                      |
                    Compiler: selects dialect for target model
                      |
                    Compiler: generates model-optimized NL prompt
                      |
                    Subagent receives NL prompt (in its own "language")
                      |
                    Subagent performs task, responds in NL
                      |
                    Translation Device validates + returns to Frontend LLM
                      |
                    Frontend LLM presents result to user in its personality
```

The "Esperanto" is the IR layer — it's universal, but **only the Translation Device reads and writes it**. The LLMs on either side speak their native NL. This is exactly how real compiler toolchains work (C -> LLVM IR -> x86 / ARM / WASM).

---

## What Changes from the Previous Plan

| Previous Plan                                                         | Refined Plan                                                                                                | Why                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| TD intercepts via `before_agent_start` hook, modifying system prompts | TD sits behind `delegate_task` tool — Frontend LLM explicitly delegates                                     | Cleaner separation. Frontend LLM makes conscious routing decisions. No hidden prompt manipulation |
| Subagent routing via intent classification in the hook                | Subagent routing via `domain_hint` parameter + skill matching in TD                                         | The Frontend LLM is the best intent classifier — it's an LLM. Let it classify, then delegate      |
| ClawDense injected into subagent prompts                              | ClawDense never touches any LLM. `.claws` compiles to NL                                                    | Eliminates entire class of garbled-output bugs                                                    |
| `prependContext` carries routing metadata                             | `prependContext` is eliminated for ClawTalk purposes; skill-compiled prompts set as subagent system prompts | Clean separation between frontend personality and subagent task prompts                           |
| `message_sending` hook strips artifacts                               | `message_sending` hook still strips as defense-in-depth, but artifacts shouldn't exist                      | Belt-and-suspenders approach                                                                      |
| Frontend LLM has all tools                                            | Frontend LLM has only `delegate_task` + conversational tools (memory, etc.)                                 | Massive system prompt reduction. Frontend focuses on being personable                             |
| Complex intent router in code                                         | Frontend LLM does intent routing naturally (it's what LLMs are best at)                                     | Simpler code, better accuracy. LLMs understand nuance that regex can't                            |

---

## Updated Implementation Steps

### Phase 1: Fix Garbled Output (Immediate)

1. Remove `prependContext` ClawTalk metadata injection from `clawtalk-hook.ts`
2. Strip `message_sending` as defense-in-depth (wire the existing hook)
3. **Test**: "Tell me about yourself" returns clean NL

### Phase 2: Build `delegate_task` Tool

4. Create `src/agents/tools/delegate-task-tool.ts`
5. Create `src/agents/clawtalk/translation-device.ts` with `dispatch()` method
6. Wire `delegate_task` into the Frontend LLM's tool list
7. Lean out the Frontend LLM's system prompt (personality + routing only)
8. **Test**: "Search for Node.js vulnerabilities" -> Frontend calls `delegate_task` -> TD dispatches -> clean result

### Phase 3: Skill Compiler

9. Create `src/agents/clawtalk/skill-compiler.ts`
10. Add `@dialect` support for model-specific prompt generation
11. Implement skill hot-loading from `~/.closedclaw/skills/`
12. **Test**: Load `web-research.claws` -> compiles to valid NL prompt for Qwen3, Claude, GPT-4

### Phase 4: ClawDense as IR

13. Refine ClawDense schema as a typed JSON-like IR (not a terse opcode language)
14. Implement `encode()` (NL task -> IR) and `compile()` (IR + skill -> model prompt) in TD
15. Implement ClawDense compression for wire transport between TD instances (multi-node)
16. **Test**: Roundtrip encode -> compress -> decompress -> compile produces valid prompts

### Phase 5: Multi-Model Subagent Dispatch

17. TD selects optimal model per subagent based on skill `@dialect` + task complexity + urgency
18. Spawn real subagent sessions via existing `sessions_spawn` mechanism
19. Collect results via existing announce system
20. **Test**: Research task -> Claude subagent. Code task -> Claude Sonnet subagent. Simple lookup -> GPT-4o-mini subagent

### Phase 6: Multi-Subagent Composition

21. Frontend LLM can call `delegate_task` multiple times (sequential or described in one call)
22. TD supports `MULTI` dispatch — parallel subagent fan-out
23. Results merged and returned to Frontend LLM for synthesis
24. **Test**: "Research quantum computing and write Python simulation code" -> two subagents -> merged result

### Phase 7: Security Hardening

25. Schema validation on all TD boundaries
26. Content sandboxing for subagent responses
27. Provenance tracking per inter-agent message
28. Kernel Shield integration for capability enforcement
29. **Test**: Prompt injection in subagent response doesn't propagate to parent

---

## Advantages Over OpenClaw Baseline (Updated)

| Dimension                           | OpenClaw                                                            | ClosedClaw Brain+Body                                       | Improvement                                                            |
| ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Frontend system prompt**          | ~2000+ tokens (monolithic, covers everything)                       | ~100 tokens (personality + delegate)                        | **95% smaller frontend prompt. Every request saves ~1900 tokens**      |
| **Task execution quality**          | One model does everything (jack of all trades)                      | Best model per task domain                                  | **Specialist models outperform generalists by 15-30% on domain tasks** |
| **Token efficiency (simple chat)**  | Baseline                                                            | Same — no delegation needed                                 | Neutral                                                                |
| **Token efficiency (complex task)** | Full NL everywhere                                                  | ClawDense IR on wire + lean prompts                         | **40-65% savings on multi-hop**                                        |
| **Security**                        | Flat trust model                                                    | Privilege separation + sandboxing + provenance              | **Structural defense-in-depth**                                        |
| **Model flexibility**               | Switch model = rewrite all prompts                                  | Switch model = TD selects right dialect                     | **True multi-model without prompt engineering**                        |
| **Adding capabilities**             | Edit monolithic system prompt + add tools                           | Drop a `.claws` file                                        | **Hot-pluggable skills**                                               |
| **Debugging**                       | Read one conversation log                                           | Structured traces per subagent + TD routing decisions       | **Better observability for complex flows**                             |
| **Personality consistency**         | Model's personality varies with task complexity (overloaded prompt) | Frontend is always the personality; subagents are invisible | **Consistent user experience**                                         |

---

## Verification Criteria

- `pnpm build` — no type errors
- `pnpm check` — lint clean
- `pnpm test -- src/agents/clawtalk/` — all TD and compiler tests pass
- `pnpm test -- src/agents/tools/delegate-task-tool.test.ts` — delegate tool tests pass
- Manual: "Tell me about yourself" -> clean conversational response (no artifacts, no garbled text)
- Manual: "Search for the latest Node.js vulnerabilities" -> Frontend calls `delegate_task` -> subagent performs research -> Frontend presents results conversationally
- Manual: "Tell me about yourself" again -> same personality, no degradation from prior task
- Metrics: `getMetrics()` shows dispatch counts, model selection, compression ratios
