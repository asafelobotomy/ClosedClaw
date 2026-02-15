# Per-Model Prompt Adaptation — Research Report

> **Date:** 2026-02-15
> **Scope:** How different LLMs interact with instructional files (SOUL.md, MEMORY.md, IDENTITY.md, etc.), and how the onboarding process can dynamically adapt based on the chosen model/provider.
> **Status:** ✅ **IMPLEMENTED** — Key recommendations from this research have been implemented:
> - Model family classification (`src/agents/model-family.ts`) — 15 families, 3 tiers
> - Adaptive context file formatting (XML vs markdown) per model preference
> - SOUL.md adherence hints calibrated by tier
> - Dynamic bootstrap budget based on context window
> - Onboarding deployment type selection (local vs cloud)
> - Ollama auth choice with model picker and download help

---

## Table of Contents

- [Per-Model Prompt Adaptation — Research Report](#per-model-prompt-adaptation--research-report)
  - [Table of Contents](#table-of-contents)
  - [Part 1: Current State — Zero Model-Specific Prompt Adaptation](#part-1-current-state--zero-model-specific-prompt-adaptation)
    - [What Already Varies Per Provider](#what-already-varies-per-provider)
    - [What Does NOT Vary (the Gap)](#what-does-not-vary-the-gap)
  - [Part 2: How Different LLMs Handle System Prompts \& Persona Files](#part-2-how-different-llms-handle-system-prompts--persona-files)
    - [Anthropic Claude Family](#anthropic-claude-family)
    - [OpenAI GPT Family](#openai-gpt-family)
    - [Google Gemini Family](#google-gemini-family)
    - [Meta Llama Family (via Ollama, OpenRouter, etc.)](#meta-llama-family-via-ollama-openrouter-etc)
    - [Alibaba Qwen Family](#alibaba-qwen-family)
    - [Mistral/Mixtral Family](#mistralmixtral-family)
    - [DeepSeek Family](#deepseek-family)
    - [Other Open Models (Phi, GLM, etc.)](#other-open-models-phi-glm-etc)
  - [Part 3: Comparison Matrix — Formatting Preferences](#part-3-comparison-matrix--formatting-preferences)
  - [Part 4: Impact on Instructional Files](#part-4-impact-on-instructional-files)
    - [SOUL.md — Persona \& Tone Adherence](#soulmd--persona--tone-adherence)
    - [MEMORY.md — Contextual Recall Behavior](#memorymd--contextual-recall-behavior)
    - [IDENTITY.md — Self-Concept Integration](#identitymd--self-concept-integration)
    - [AGENTS.md — Behavioral Rules](#agentsmd--behavioral-rules)
    - [USER.md — User Preferences and Context](#usermd--user-preferences-and-context)
    - [TOOLS.md — Tool Usage Guidance](#toolsmd--tool-usage-guidance)
    - [BOOTSTRAP.md — Onboarding Quality](#bootstrapmd--onboarding-quality)
  - [Part 5: Proposed Architecture — Model-Adaptive Prompt Assembly](#part-5-proposed-architecture--model-adaptive-prompt-assembly)
    - [A. Model Family Classification System](#a-model-family-classification-system)
    - [B. Per-Family Prompt Formatting Strategies](#b-per-family-prompt-formatting-strategies)
    - [C. Context Budget Adaptation](#c-context-budget-adaptation)
    - [D. Persona Adherence Calibration](#d-persona-adherence-calibration)
    - [E. Bootstrap Onboarding Calibration](#e-bootstrap-onboarding-calibration)
    - [F. File Priority Emphasis by Model](#f-file-priority-emphasis-by-model)
  - [Part 6: Implementation Roadmap](#part-6-implementation-roadmap)
  - [Key Source Files Reference](#key-source-files-reference)
  - [Summary of Key Findings](#summary-of-key-findings)

---

## Part 1: Current State — Zero Model-Specific Prompt Adaptation

The system prompt in `src/agents/system-prompt.ts` is **completely model-agnostic**. The `buildAgentSystemPrompt()` function takes no `provider` or `modelId` parameter and produces the **exact same system prompt** regardless of which model will consume it.

### What Already Varies Per Provider

The codebase has extensive per-provider adaptations, but they're all **below** the prompt layer:

| Adaptation | Where | Affected Providers |
|---|---|---|
| **Reasoning tags** (`<think>/<final>`) | `src/utils/provider-utils.ts` → `isReasoningTagProvider()` | `ollama`, `google-gemini-cli`, `google-generative-ai`, `minimax` variants |
| **Tool schema sanitization** | `src/agents/pi-embedded-runner/google.ts` | `google-antigravity`, `google-gemini-cli` (strips unsupported JSON Schema keywords) |
| **Transcript policies** | `src/agents/transcript-policy.ts` | Per-provider sanitization modes, tool call ID handling, turn ordering |
| **Turn ordering** | `src/agents/pi-embedded-runner/google.ts` | Google requires strict `user→assistant→tool→user` alternation |
| **Claude parameter compat** | `src/agents/pi-tools.read.ts` | All models (universal aliases for `file_path`/`old_string` etc.) |
| **Refusal string scrubbing** | `src/agents/pi-embedded-runner/run.ts` | Anthropic only |
| **Cache TTL** | `src/agents/pi-embedded-runner/extra-params.ts` | Anthropic, OpenRouter |
| **MiniMax XML stripping** | `src/agents/pi-embedded-utils.ts` | MiniMax (strips `<invoke>` tool call XML from text) |
| **Reasoning block downgrade** | `src/agents/pi-embedded-helpers/openai.ts` | OpenAI (strips incompatible reasoning blocks from cross-provider sessions) |
| **Model API routing** | `src/agents/opencode-zen-models.ts` | OpenCode Zen routes by model prefix to API shape |

### What Does NOT Vary (the Gap)

1. **System prompt formatting** — identical flat markdown for all models
2. **Instructional file injection** — same `## filename` headers for Claude, GPT, Gemini, Llama
3. **Priority signals** — no model-specific emphasis calibration
4. **Persona adherence hints** — same single SOUL.md sentence for all
5. **Context budget allocation** — same 20,000 chars/file regardless of context window
6. **Bootstrap onboarding instructions** — same free-form BOOTSTRAP.md for all
7. **No model family classification** — ad-hoc string matching, no centralized `getModelFamily()`

---

## Part 2: How Different LLMs Handle System Prompts & Persona Files

### Anthropic Claude Family

**Models:** claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5 (and older 3.x)

**System prompt handling:**
- System prompts have a **dedicated `system` parameter** in the Messages API, separate from conversation turns
- Claude was **explicitly trained to follow system message instructions with high fidelity**
- Anthropic's documentation explicitly recommends XML tags for structured prompts: `<instructions>`, `<context>`, `<example>`, `<formatting>`
- Claude excels at parsing nested XML and maintaining hierarchical priority from tags
- Role prompting via system parameter dramatically improves performance (Anthropic's own docs emphasize this)

**Persona adherence:**
- **Strongest** among major LLMs at maintaining character/persona across long conversations
- Responds well to explicit persona files with behavioral rules
- "Role prompting" in the system parameter is Anthropic's #1 recommended technique
- SOUL.md-style files map directly to Anthropic's recommended pattern

**Key strengths:**
- XML tag parsing (structure demarcation)
- Long system prompt comprehension (100k+ context)
- Consistent persona maintenance
- Strong instruction hierarchy following

**Key weaknesses:**
- Can be overly cautious/verbose when persona conflicts with safety guardrails
- Sometimes "breaks character" to explain limitations

**Optimal formatting for Claude:**
```xml
<system_identity>
  <persona>...</persona>
  <tone>...</tone>
</system_identity>
<priority_rules>
  1. Safety rules (highest)
  2. AGENTS.md behavioral directives
  3. SOUL.md persona and tone
  4. USER.md preferences
</priority_rules>
<workspace_context>
  <file name="SOUL.md">...</file>
  <file name="MEMORY.md">...</file>
</workspace_context>
```

---

### OpenAI GPT Family

**Models:** gpt-5.2, gpt-5.0, gpt-5.2-codex, gpt-5.1-codex (and older 4o, 4-turbo)

**System prompt handling:**
- Uses `system` role (older) or `developer` role (newer Responses API) for system instructions
- The `developer` role (introduced with newer models) has higher authority than `system` role
- OpenAI models are trained to follow markdown-structured system prompts effectively
- Supports structured output via JSON Schema but **does not natively parse XML in system prompts** the way Claude does — XML works but markdown is the native idiom

**Persona adherence:**
- **Moderate** — GPT models follow personas but tend to "drift" over long conversations
- More susceptible to user-side persona override attempts than Claude
- Stronger with explicit, repeated persona reminders
- Benefits from few-shot examples demonstrating the desired persona in action

**Key strengths:**
- Excellent at following markdown-formatted instructions
- Strong structured output (JSON mode, function calling)
- Good at following numbered rules and checklists
- Handles `developer` role as highest-priority instruction source (newer models)

**Key weaknesses:**
- Persona drift over long conversations without reinforcement
- Can conflate system instructions with user content when formatting is ambiguous
- XML parsing works but is not the native format — may not benefit from structural hierarchy the same way

**Optimal formatting for GPT:**
```markdown
# Identity
You are [persona from SOUL.md]. [behavioral rules]

# Priority Rules
1. Safety boundaries (highest)
2. Behavioral directives from AGENTS.md
3. Persona from SOUL.md
4. User preferences from USER.md

# Context Files

## SOUL.md
[content]

## MEMORY.md
[content]
```

---

### Google Gemini Family

**Models:** gemini-3-pro-preview, gemini-3-flash-preview (and older 2.5 pro/flash)

**System prompt handling:**
- System instructions via `system_instruction` config parameter (separate from messages)
- Google's own documentation (Feb 2026) **explicitly recommends XML-style tags** (`<context>`, `<task>`, `<role>`, `<constraints>`) or Markdown headings for structured prompts
- The Gemini 3 prompting guide says: *"Use consistent structure. XML-style tags (e.g., `<context>`, `<task>`) or Markdown headings are effective. Choose one format and use it consistently."*
- Gemini 3 models are described as working best with "direct, well-structured" prompts

**Persona adherence:**
- **Moderate to Good** — Gemini follows personas well when defined in system instructions
- Tends to be more "helpful assistant" by default — requires stronger persona cues to override
- Google recommends placing *"essential behavioral constraints, role definitions (persona), and output format requirements in the System Instruction or at the very beginning of the user prompt"*

**Key strengths:**
- Handles very long contexts (1M tokens for some models)
- Good at XML or markdown structured prompts (both work)
- Strong at following output format constraints
- Supports thinking modes with `<think>`/`</think>` tags (Gemini 3)

**Key weaknesses:**
- Strict turn ordering requirements (already handled by ClosedClaw's transcript policy)
- Temperature sensitivity — Gemini 3 docs warn against changing from default 1.0
- Tool schema restrictions (already handled by `sanitizeToolsForGoogle()`)
- Less tested with deeply nested XML hierarchies compared to Claude

**Optimal formatting for Gemini:**
```xml
<role>
You are [persona from SOUL.md].
</role>

<instructions>
[Behavioral directives from AGENTS.md]
</instructions>

<constraints>
[Priority rules, safety boundaries]
</constraints>

<context>
[SOUL.md, MEMORY.md, USER.md content]
</context>
```

---

### Meta Llama Family (via Ollama, OpenRouter, etc.)

**Models:** Llama 3.x (8B, 70B, 405B) and derivatives (Code Llama, Llama Guard)

**System prompt handling:**
- Uses ChatML-style template with special tokens: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>`
- **System prompt support varies dramatically by quantization, hosting, and fine-tune**
- When served via Ollama or OpenRouter using OpenAI-compatible API, system prompt goes into `system` role
- Llama 3 instruct models are trained on system prompts but with **much shorter system prompts** than Claude or GPT typically receive
- Smaller models (8B) have significantly weaker instruction following than 70B+

**Persona adherence:**
- **Weak to Moderate** — highly dependent on model size
  - 8B: Personas often ignored or partially followed, especially complex multi-faceted ones
  - 70B+: Decent persona adherence, but not at Claude/GPT level
  - 405B: Comparable to GPT for persona following
- Open models are more susceptible to "mode collapse" — falling back to generic assistant behavior
- Benefits greatly from **concise, direct persona instructions** rather than elaborate ones
- Shorter, punchier SOUL.md content works better than flowing prose

**Key strengths:**
- Local deployment (via Ollama — ClosedClaw's default provider)
- No API costs
- Can be fine-tuned for specific persona adherence
- Good at following simple, direct instructions

**Key weaknesses:**
- Limited context window (8k–128k depending on variant)
- Weaker at complex instruction hierarchies
- XML tags are understood but **less reliably than markdown** for instruction following
- Persona drift is more severe than closed models
- Smaller models may ignore or truncate long system prompts

**Optimal formatting for Llama:**
```markdown
# You are [short persona name]
[2-3 sentence SOUL.md essence — keep it punchy]

# Rules
- [Concise bullet points from AGENTS.md]
- [Keep rules short — one line each]

# Context
## MEMORY.md
[trimmed to essentials]
```

**Critical insight:** For Llama 8B (ClosedClaw's default `qwen3:8b` via Ollama), the current 20,000 char/file limit may be consuming a huge proportion of the 32k context window. Smaller models need **much more aggressive truncation** and **simpler formatting**.

---

### Alibaba Qwen Family

**Models:** Qwen3-8B, Qwen3-32B, Qwen3-30B-A3B (MoE), Qwen3-235B-A22B (MoE)

**System prompt handling:**
- Uses ChatML format with `<|im_start|>system` / `<|im_end|>` tokens
- Starting with Qwen3, **no default system messages are used** — the model is a blank slate
- Supports hybrid thinking modes (`<think>`/`</think>` for chain-of-thought)
- Tool calling uses XML-based format: `<tools>...</tools>` and `<tool_call>...</tool_call>`
- The model is natively comfortable with XML structure due to its tool calling training

**Persona adherence:**
- **Moderate** — Qwen3 models follow personas but default to a "helpful AI" baseline
- The models are trained on multilingual data (119 languages) which can cause tone inconsistency in some languages
- Larger models (32B+, 235B) have significantly better persona adherence
- The `qwen3:8b` model (ClosedClaw's default) has limited persona stability over long conversations

**Key strengths:**
- Native XML comprehension (from tool calling training)
- Hybrid thinking mode — can interleave reasoning and non-reasoning
- MoE variants are efficient for their capability level
- Good multilingual support

**Key weaknesses:**
- 8B variant (the default) struggles with complex, multi-faceted personas
- Can "collapse" into Chinese responses if persona/context triggers multilingual associations
- Context window of 32k for pre-training, extendable to 131k (but quality degrades at extremes)
- Less battle-tested with long system prompts than Claude or GPT

**Optimal formatting for Qwen:**
```xml
<role>
[Short persona description from SOUL.md]
</role>

<rules>
[Numbered directives from AGENTS.md — keep compact]
</rules>

<context>
[Essential files only — aggressive truncation for 8B]
</context>
```

---

### Mistral/Mixtral Family

**Models:** Mistral (7B, Large), Mixtral 8x7B, 8x22B

**System prompt handling:**
- Follows ChatML-style format similar to Qwen/Llama
- Mistral Large models have good system prompt following
- Smaller models (7B) have limited system prompt adherence
- ClosedClaw's transcript policy already handles Mistral-specific quirks: `sanitizeToolCallIds: "strict9"` (9-char tool call IDs)

**Persona adherence:**
- **Weak to Moderate** — similar to Llama at equivalent parameter counts
- Mistral Large has better persona adherence than 7B
- Mixtral MoE models fall somewhere in between

**Optimal formatting:** Same as Llama — markdown, concise, direct.

---

### DeepSeek Family

**Models:** DeepSeek-V3, DeepSeek-Coder

**System prompt handling:**
- Uses standard `system` role in OpenAI-compatible API
- Strong instruction following for coding tasks
- Reasoning models use `<think>` blocks similar to Qwen3

**Persona adherence:**
- **Moderate** — better for technical personas, weaker for creative/personality ones
- DeepSeek-V3 is comparable to GPT-4 level for instruction following

**Optimal formatting:** Markdown with clear section headers. Keep persona directives practical and task-focused.

---

### Other Open Models (Phi, GLM, etc.)

**General patterns for smaller/niche models:**
- Phi (Microsoft): Good instruction following for its size, markdown-native
- GLM (Z.AI): Bilingual Chinese-English, follows system prompts but with language drift risk
- Venice models: Variable quality, treat as "Llama-tier"
- Moonshot (Kimi): Strong at longer contexts, standard markdown formatting

**Universal rule:** The smaller the model, the simpler the system prompt should be. A 3B model cannot reliably process a 20,000 character SOUL.md.

---

## Part 3: Comparison Matrix — Formatting Preferences

| Model Family | Preferred Format | XML Understanding | Persona Strength | Max Useful System Prompt | Context Window |
|---|---|---|---|---|---|
| **Claude** (Anthropic) | XML tags (native) | ★★★★★ | ★★★★★ | 50k+ chars | 200k |
| **GPT** (OpenAI) | Markdown headers | ★★★☆☆ | ★★★★☆ | 30k+ chars | 128k–1M |
| **Gemini** (Google) | XML or Markdown | ★★★★☆ | ★★★★☆ | 50k+ chars | 1M–2M |
| **Llama 70B+** (Meta) | Markdown bullets | ★★★☆☆ | ★★★☆☆ | 10k chars | 128k |
| **Llama 8B** (Meta) | Markdown, minimal | ★★☆☆☆ | ★★☆☆☆ | 3k chars | 8k–32k |
| **Qwen 32B+** | XML (tool-native) | ★★★★☆ | ★★★☆☆ | 15k chars | 32k–131k |
| **Qwen 8B** | Markdown, compact | ★★★☆☆ | ★★☆☆☆ | 5k chars | 32k |
| **Mistral Large** | Markdown headers | ★★★☆☆ | ★★★☆☆ | 15k chars | 32k–128k |
| **Mistral 7B** | Markdown, minimal | ★★☆☆☆ | ★★☆☆☆ | 3k chars | 32k |
| **DeepSeek-V3** | Markdown headers | ★★★☆☆ | ★★★☆☆ | 15k chars | 128k |

**Legend:** ★ ratings are relative — ★★★★★ means best-in-class, ★★☆☆☆ means below average for the category.

---

## Part 4: Impact on Instructional Files

### SOUL.md — Persona & Tone Adherence

The **most model-sensitive** file. How well SOUL.md works depends heavily on the model:

| Model | SOUL.md Behavior |
|---|---|
| **Claude** | Deeply internalizes persona. Can maintain character for hundreds of turns. Follows tone, word choice, emotional coloring. |
| **GPT** | Follows persona initially but drifts over 20+ turn conversations. Benefits from periodic persona reinforcement. |
| **Gemini** | Good persona adherence when placed in system instructions. Defaults to "helpful" if persona is ambiguous. |
| **Llama 70B+** | Follows well with concise personas. Complex, multi-faceted SOUL.md files get partially ignored. |
| **Llama/Qwen 8B** | Frequently ignores nuanced persona aspects. May only pick up the most salient 1-2 traits. "Write like a pirate" works; "Be warm but not saccharine, with dry wit and occasional vulnerability" doesn't. |

**Recommendation:** SOUL.md should have a **short summary** (2-3 sentences) at the top optimized for smaller models, with detailed personality below for larger models. The system prompt injector should use the summary for small models and the full file for large models.

### MEMORY.md — Contextual Recall Behavior

MEMORY.md is less model-sensitive because it's used primarily through **tool-mediated access** (memory_search, memory_get). However:

| Model | MEMORY.md Behavior |
|---|---|
| **Claude** | Excellent at deciding when to search memory and synthesizing results. |
| **GPT** | Good at tool-mediated memory but may over-search or under-search without clear triggers. |
| **Gemini** | Follows memory search instructions well but may be slower to invoke tools proactively. |
| **Smaller models** | May forget to search memory even when instructed. Instructions need to be more explicit and include trigger phrases. |

**Recommendation:** For smaller models, the memory search instruction should include explicit trigger patterns: "When the user mentions a name, date, preference, or past event: ALWAYS search memory first."

### IDENTITY.md — Self-Concept Integration

| Model | IDENTITY.md Behavior |
|---|---|
| **Claude** | Integrates identity smoothly. Will introduce itself by name, use emoji, adopt creature metaphors. |
| **GPT** | Follows identity fields but may over-explain. "I'm Pi 🐙" becomes "As Pi, an octopus-themed AI assistant, I..." |
| **Gemini** | Good at using identity fields. May need explicit instruction not to be verbose about them. |
| **Smaller models** | Often ignore identity fields entirely. Parse extraction + injection as structured data is more effective than raw markdown. |

**Recommendation:** Already proposed in previous research: inject IDENTITY.md as structured `<agent_identity name="..." creature="..." emoji="..." />`. This helps all models, but especially smaller ones.

### AGENTS.md — Behavioral Rules

The primary behavioral directive file. Relatively model-robust because it contains explicit rules.

| Model | AGENTS.md Behavior |
|---|---|
| **All models** | Generally follow explicit numbered rules well. The more concise and structured, the better. |
| **Smaller models** | May only follow the first 3-5 rules in a long list. Prioritize by putting most important rules first. |

**Recommendation:** AGENTS.md should use numbered priority ordering. For smaller models, truncate to essential rules only.

### USER.md — User Preferences and Context

| Model | USER.md Behavior |
|---|---|
| **Claude** | Excellent at incorporating user preferences naturally into responses. |
| **GPT** | Good but may over-reference preferences ("As you mentioned you prefer metric units..."). |
| **Smaller models** | May ignore user preferences unless they directly conflict with a question. |

**Recommendation:** For smaller models, inject USER.md preferences as a brief bullet list rather than free-form text.

### TOOLS.md — Tool Usage Guidance

Relatively model-agnostic since tool calling has its own API-level handling. The file mainly provides usage hints.

### BOOTSTRAP.md — Onboarding Quality

The **second most model-sensitive** file. Bootstrap quality varies wildly by model:

| Model | BOOTSTRAP.md Behavior |
|---|---|
| **Claude** | Produces high-quality, creative onboarding conversations. Fills in SOUL.md, IDENTITY.md with rich detail. |
| **GPT** | Good onboarding but tends toward formulaic outputs. SOUL.md may be generic without strong guidance. |
| **Gemini** | Follows bootstrap instructions well but may produce verbose, over-structured outputs. |
| **Llama 70B+** | Can produce decent onboarding with clear templates. May need output format enforcement. |
| **Llama/Qwen 8B** | **Frequently fails bootstrap** — produces incomplete files, wrong format, generic content. Cannot reliably follow multi-step onboarding workflows. |

**Recommendation:** Bootstrap should include model-size-appropriate templates. For smaller models, provide pre-filled templates with blanks rather than open-ended generation. For larger models, allow more creative freedom.

---

## Part 5: Proposed Architecture — Model-Adaptive Prompt Assembly

### A. Model Family Classification System

Create a centralized `getModelFamily()` function that classifies models into tiers with known characteristics:

```typescript
// src/agents/model-family.ts

export type ModelFamily =
  | "anthropic"     // Claude family
  | "openai"        // GPT family
  | "google"        // Gemini family
  | "meta-large"    // Llama 70B+, 405B
  | "meta-small"    // Llama 8B, 3B
  | "qwen-large"    // Qwen 32B+, 235B MoE
  | "qwen-small"    // Qwen 8B, 3B
  | "mistral-large" // Mistral Large, Mixtral 8x22B
  | "mistral-small" // Mistral 7B, Mixtral 8x7B
  | "deepseek"      // DeepSeek-V3, coder
  | "unknown";      // Fallback

export type ModelTier = "frontier" | "mid" | "small";

export interface ModelFamilyInfo {
  family: ModelFamily;
  tier: ModelTier;
  preferredFormat: "xml" | "markdown" | "minimal-markdown";
  xmlComprehension: number;        // 0-5 scale
  personaAdherence: number;        // 0-5 scale
  maxUsefulSystemPromptChars: number;
  supportsComplexOnboarding: boolean;
}

export function getModelFamily(provider: string, modelId: string): ModelFamilyInfo {
  const p = provider.toLowerCase();
  const m = modelId.toLowerCase();

  // Anthropic — always frontier tier
  if (p === "anthropic" || m.startsWith("claude-")) {
    return {
      family: "anthropic",
      tier: "frontier",
      preferredFormat: "xml",
      xmlComprehension: 5,
      personaAdherence: 5,
      maxUsefulSystemPromptChars: 50_000,
      supportsComplexOnboarding: true,
    };
  }

  // OpenAI
  if (p === "openai" || p === "openai-codex" || m.startsWith("gpt-")) {
    return {
      family: "openai",
      tier: "frontier",
      preferredFormat: "markdown",
      xmlComprehension: 3,
      personaAdherence: 4,
      maxUsefulSystemPromptChars: 30_000,
      supportsComplexOnboarding: true,
    };
  }

  // Google Gemini
  if (p.includes("google") || p.includes("antigravity") || m.startsWith("gemini-")) {
    return {
      family: "google",
      tier: "frontier",
      preferredFormat: "xml",   // Google explicitly recommends XML or markdown
      xmlComprehension: 4,
      personaAdherence: 4,
      maxUsefulSystemPromptChars: 50_000,
      supportsComplexOnboarding: true,
    };
  }

  // Meta Llama — size matters hugely
  if (m.includes("llama")) {
    const isLarge = m.includes("70b") || m.includes("405b") || m.includes("65b");
    return {
      family: isLarge ? "meta-large" : "meta-small",
      tier: isLarge ? "mid" : "small",
      preferredFormat: isLarge ? "markdown" : "minimal-markdown",
      xmlComprehension: isLarge ? 3 : 2,
      personaAdherence: isLarge ? 3 : 2,
      maxUsefulSystemPromptChars: isLarge ? 10_000 : 3_000,
      supportsComplexOnboarding: isLarge,
    };
  }

  // Qwen — size matters
  if (p === "qwen-portal" || p === "ollama" && m.startsWith("qwen")) {
    const isLarge = m.includes("32b") || m.includes("72b") || m.includes("235b") || m.includes("110b");
    return {
      family: isLarge ? "qwen-large" : "qwen-small",
      tier: isLarge ? "mid" : "small",
      preferredFormat: isLarge ? "xml" : "minimal-markdown",
      xmlComprehension: isLarge ? 4 : 3,
      personaAdherence: isLarge ? 3 : 2,
      maxUsefulSystemPromptChars: isLarge ? 15_000 : 5_000,
      supportsComplexOnboarding: isLarge,
    };
  }

  // ... more families ...

  // Fallback: conservative defaults
  return {
    family: "unknown",
    tier: "mid",
    preferredFormat: "markdown",
    xmlComprehension: 3,
    personaAdherence: 3,
    maxUsefulSystemPromptChars: 10_000,
    supportsComplexOnboarding: true,
  };
}
```

**Impact:** This provides the foundation for all other adaptations. Every downstream decision about prompt formatting, truncation, and file injection can reference `getModelFamily()`.

---

### B. Per-Family Prompt Formatting Strategies

Instead of always using `## filename` headers, adapt the context file injection format based on model family:

```typescript
// Concept — in system-prompt.ts

function formatContextFile(
  file: EmbeddedContextFile,
  family: ModelFamilyInfo,
): string {
  switch (family.preferredFormat) {
    case "xml":
      return `<file name="${file.path}">\n${file.content}\n</file>`;
    case "markdown":
      return `## ${file.path}\n\n${file.content}`;
    case "minimal-markdown":
      // For small models: no header, just content with a separator
      return `--- ${file.path} ---\n${file.content}`;
  }
}

function wrapContextSection(
  files: string[],
  family: ModelFamilyInfo,
): string {
  switch (family.preferredFormat) {
    case "xml":
      return `<workspace_context>\n${files.join("\n")}\n</workspace_context>`;
    case "markdown":
      return `# Project Context\n\n${files.join("\n\n")}`;
    case "minimal-markdown":
      return files.join("\n\n");
  }
}
```

---

### C. Context Budget Adaptation

The current `DEFAULT_BOOTSTRAP_MAX_CHARS = 20_000` is a fixed value. It should scale with model capability:

```typescript
function resolveBootstrapMaxChars(
  family: ModelFamilyInfo,
  contextWindow: number,
): number {
  // Never use more than 15% of context window for bootstrap files
  const contextBudgetLimit = Math.floor(contextWindow * 0.15);

  // Per-family soft caps
  const familyCap = family.maxUsefulSystemPromptChars;

  return Math.min(contextBudgetLimit, familyCap);
}
```

**Example outcomes:**
- Claude with 200k context → min(30_000, 50_000) = **30,000 chars**
- GPT-5 with 128k context → min(19_200, 30_000) = **19,200 chars**
- Qwen3:8B with 32k context → min(4_800, 5_000) = **4,800 chars**
- Llama 8B with 8k context → min(1_200, 3_000) = **1,200 chars** (!!!)

This is a **major insight**: the default 20k chars is consuming 62% of the Qwen3:8B's context window. For the smallest models, we'd be drastically more economical.

---

### D. Persona Adherence Calibration

Adapt the SOUL.md injection based on model persona adherence capability:

```typescript
function buildSoulAdherenceHint(family: ModelFamilyInfo): string {
  if (family.personaAdherence >= 4) {
    // Frontier models: rich, detailed adherence instruction
    return [
      "SOUL.md defines your personality, tone, and behavioral identity.",
      "Fully embody this persona: word choice, humor, emotional coloring, topic preferences.",
      "Do NOT break character to explain you are an AI unless safety requires it.",
      "When uncertain, default to the persona's most likely response style.",
    ].join("\n");
  }

  if (family.personaAdherence >= 3) {
    // Mid-tier: clear but simple
    return [
      "SOUL.md is your personality. Follow its tone and style in every reply.",
      "Stay in character. Keep responses consistent with the persona.",
    ].join("\n");
  }

  // Small models: single, punchy directive
  return "IMPORTANT: Reply using the personality described in SOUL.md. Stay in character.";
}
```

---

### E. Bootstrap Onboarding Calibration

The BOOTSTRAP.md-driven onboarding process should adapt its expectations to model capability:

**For frontier models (Claude, GPT, Gemini):**
- Full creative license for SOUL.md generation
- Open-ended personality exploration questions
- Multi-step conversation with refinement

**For mid-tier models (Llama 70B, Qwen 32B, Mistral Large):**
- Provide output format templates with `[FILL_IN]` markers
- Fewer open-ended questions, more multiple-choice style
- Structured SOUL.md template rather than free-form generation

**For small models (Llama 8B, Qwen 8B, Mistral 7B):**
- Pre-filled templates with minimal generation required
- Yes/no or short-answer questions only
- Skip complex files (SOUL.md persona generation) — offer a curated persona library instead
- Or: use a different, larger model for the onboarding phase only, then switch to the small model for daily use

```typescript
function resolveBootstrapComplexity(family: ModelFamilyInfo): "full" | "guided" | "templated" {
  if (family.supportsComplexOnboarding) {
    return family.tier === "frontier" ? "full" : "guided";
  }
  return "templated";
}
```

**Persona Library Concept for Small Models:**
Instead of asking an 8B model to generate a custom SOUL.md, offer pre-built persona options:
```
Choose your assistant personality:
1. 🎯 Professional — Clear, concise, no-nonsense
2. 🌊 Chill — Relaxed, friendly, casual
3. 🧙 Wise — Thoughtful, considered, uses metaphors
4. 🎭 Playful — Witty, humorous, pop-culture references
5. 🤖 Minimal — Just the facts, no personality
```

---

### F. File Priority Emphasis by Model

Different models need different levels of explicit priority signaling:

| Model Tier | Priority Approach |
|---|---|
| **Frontier** | Implicit priority works (file order + section hierarchy). Can add explicit priority section for extra reliability. |
| **Mid** | Needs explicit numbered priority list in system prompt. |
| **Small** | Needs priority baked into file order AND explicit "Rule 1 overrides Rule 2" statements. Fewer files total. |

For small models, consider **skipping optional files** entirely:
- Always include: AGENTS.md, SOUL.md (summary only)
- Include if exists: USER.md
- Skip: MEMORY.md (use tool-mediated access only), HEARTBEAT.md, TOOLS.md (tool descriptions are in the API schema already)

---

## Part 6: Implementation Roadmap

| Phase | Change | Complexity | Impact | Files |
|---|---|---|---|---|
| **1** | Create `getModelFamily()` classification | Low | Foundation for all else | New: `src/agents/model-family.ts` |
| **2** | Thread `provider`+`modelId` into `buildAgentSystemPrompt()` | Medium | Enables all prompt adaptations | `src/agents/system-prompt.ts`, `src/agents/pi-embedded-runner/system-prompt.ts` |
| **3** | Adaptive context file formatting (XML vs markdown) | Low | Better parsing for Claude/Gemini | `src/agents/system-prompt.ts` |
| **4** | Dynamic bootstrap max chars by model | Low | Prevent context overflow on small models | `src/agents/pi-embedded-helpers/bootstrap.ts` |
| **5** | Per-family SOUL.md adherence hints | Low | Better persona maintenance | `src/agents/system-prompt.ts` |
| **6** | File priority/skip logic for small models | Medium | Dramatic improvement for 8B models | `src/agents/workspace.ts`, `src/agents/bootstrap-files.ts` |
| **7** | Bootstrap complexity modes | High | Better onboarding across model tiers | `docs/reference/templates/BOOTSTRAP.md`, new: `docs/reference/templates/BOOTSTRAP-guided.md`, `BOOTSTRAP-templated.md` |
| **8** | Persona library for small models | Medium | Reliable personas without generation | New: `src/agents/persona-library.ts`, config integration |

**Recommended order:** 1 → 2 → 4 → 3 → 5 → 6 → 7 → 8

Phase 1 and 2 are prerequisites for everything else. Phase 4 (dynamic budget) gives the biggest immediate win for users running the default Ollama/Qwen3:8B setup.

---

## Key Source Files Reference

| File | Role |
|---|---|
| `src/agents/system-prompt.ts` | System prompt assembly — target for formatting adaptations |
| `src/agents/pi-embedded-helpers/bootstrap.ts` | Truncation & context file building — target for budget adaptation |
| `src/agents/workspace.ts` | File loading, session filtering — target for file skip logic |
| `src/agents/model-selection.ts` | Model resolution — reference for provider/model identification |
| `src/agents/model-catalog.ts` | Model metadata (context window, capabilities) |
| `src/agents/defaults.ts` | Default model: `ollama` / `qwen3:8b` / 32k context |
| `src/agents/identity-file.ts` | IDENTITY.md parsing — target for structured injection |
| `src/agents/transcript-policy.ts` | Existing per-provider adaptations — pattern to follow |
| `src/utils/provider-utils.ts` | `isReasoningTagProvider()` — existing model classification pattern |
| `src/agents/bootstrap-files.ts` | Bootstrap file orchestration — target for complexity modes |
| `docs/reference/templates/` | All template files — targets for per-model variants |

---

## Summary of Key Findings

1. **The system prompt is completely model-blind.** The same flat markdown is sent to Claude (which benefits from XML structure), GPT (which prefers markdown), and Qwen3:8B (which can't absorb 20k chars of context).

2. **Model size matters more than model family for persona adherence.** An 8B model from any family (Llama, Qwen, Mistral) will struggle with complex SOUL.md personas. Frontier models (Claude, GPT, Gemini) all handle them well.

3. **XML formatting benefits Claude and Gemini but is neutral-to-harmful for GPT and small models.** Rather than universally adopting XML (as proposed in the previous research), a per-model strategy is better.

4. **The default model (Qwen3:8B via Ollama) is the worst case for the current system.** With 32k context and 20k chars per file, most of the context window is consumed by instructional files before the user even speaks.

5. **Bootstrap onboarding should be model-aware.** Asking an 8B model to generate a creative, nuanced SOUL.md is unreliable. A tiered approach (full creative / guided templates / persona library) would provide better outcomes across the model spectrum.

6. **Every major LLM provider now recommends structured formatting** (XML or markdown with clear delimiters). The question is which format works best for which provider — and the answer is model-family-dependent.
