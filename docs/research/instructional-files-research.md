# Instructional File System — Research & Improvement Plan

> **Date:** 2026-02-15
> **Scope:** How `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `BOOTSTRAP.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md`, and `BOOT.md` influence the LLM after onboarding — and how to improve them.

---

## Table of Contents

- [Instructional File System — Research \& Improvement Plan](#instructional-file-system--research--improvement-plan)
  - [Table of Contents](#table-of-contents)
  - [Part 1: How the System Works Today](#part-1-how-the-system-works-today)
    - [File Inventory](#file-inventory)
    - [The Loading Pipeline](#the-loading-pipeline)
      - [1. Workspace Initialization (`src/agents/workspace.ts` — `ensureAgentWorkspace()`)](#1-workspace-initialization-srcagentsworkspacets--ensureagentworkspace)
      - [2. Bootstrap File Loading (`src/agents/workspace.ts` — `loadWorkspaceBootstrapFiles()`)](#2-bootstrap-file-loading-srcagentsworkspacets--loadworkspacebootstrapfiles)
      - [3. Session Filtering (`src/agents/workspace.ts` — `filterBootstrapFilesForSession()`)](#3-session-filtering-srcagentsworkspacets--filterbootstrapfilesforsession)
      - [4. Hook Overrides (`src/agents/bootstrap-hooks.ts` — `applyBootstrapHookOverrides()`)](#4-hook-overrides-srcagentsbootstrap-hooksts--applybootstraphookoverrides)
      - [5. Truncation \& Context Building (`src/agents/pi-embedded-helpers/bootstrap.ts` — `buildBootstrapContextFiles()`)](#5-truncation--context-building-srcagentspi-embedded-helpersbootstrapts--buildbootstrapcontextfiles)
      - [6. System Prompt Assembly (`src/agents/system-prompt.ts` — `buildAgentSystemPrompt()`)](#6-system-prompt-assembly-srcagentssystem-promptts--buildagentsystemprompt)
      - [7. Context Pruning Protection (`src/agents/pi-extensions/context-pruning/pruner.ts`)](#7-context-pruning-protection-srcagentspi-extensionscontext-pruningprunerts)
    - [What Each File Actually Does](#what-each-file-actually-does)
    - [Dev vs Production Templates](#dev-vs-production-templates)
    - [The Priority Hierarchy (Implicit)](#the-priority-hierarchy-implicit)
  - [Part 2: Research Findings](#part-2-research-findings)
    - [Anthropic Prompt Engineering Guidance](#anthropic-prompt-engineering-guidance)
    - [OpenAI Best Practices](#openai-best-practices)
  - [Part 3: Current Weaknesses](#part-3-current-weaknesses)
    - [A. No Structural Demarcation Between System Rules and User Content](#a-no-structural-demarcation-between-system-rules-and-user-content)
    - [B. SOUL.md Adherence Hint Is Too Weak](#b-soulmd-adherence-hint-is-too-weak)
    - [C. IDENTITY.md Is Just Dumped as Raw Text](#c-identitymd-is-just-dumped-as-raw-text)
    - [D. No Explicit Priority Ordering in the Prompt](#d-no-explicit-priority-ordering-in-the-prompt)
    - [E. Missing Files Produce Noisy Markers](#e-missing-files-produce-noisy-markers)
    - [F. BOOTSTRAP.md Instructions Are Detached from the System Prompt](#f-bootstrapmd-instructions-are-detached-from-the-system-prompt)
  - [Part 4: Proposed Improvements](#part-4-proposed-improvements)
    - [1. XML Tags for Workspace Context Injection](#1-xml-tags-for-workspace-context-injection)
    - [2. Explicit Priority Hierarchy in System Prompt](#2-explicit-priority-hierarchy-in-system-prompt)
    - [3. Stronger SOUL.md Adherence Instructions](#3-stronger-soulmd-adherence-instructions)
    - [4. Structured Identity Injection](#4-structured-identity-injection)
    - [5. Clean Up Missing File Markers](#5-clean-up-missing-file-markers)
    - [6. Enhanced Bootstrap Onboarding Flow](#6-enhanced-bootstrap-onboarding-flow)
  - [Part 5: Implementation Summary](#part-5-implementation-summary)
    - [Key Source Files Reference](#key-source-files-reference)

---

## Part 1: How the System Works Today

### File Inventory

There are **9 named file slots** defined in `src/agents/workspace.ts` (lines 22-30), plus one hook-triggered file:

| File | Purpose | Injected Into Prompt? | Subagent Access? |
|---|---|---|---|
| **AGENTS.md** | Master operational instructions | Yes | **Yes** (allowlisted) |
| **SOUL.md** | Personality, tone, values, boundaries | Yes | No |
| **IDENTITY.md** | Name, creature, vibe, emoji, avatar | Yes (+ parsed for UI) | No |
| **USER.md** | Human profile (name, pronouns, timezone) | Yes | No |
| **TOOLS.md** | Environment-specific notes for skills | Yes | **Yes** (allowlisted) |
| **BOOTSTRAP.md** | First-run onboarding ritual | Yes (deleted after first run) | No |
| **HEARTBEAT.md** | Periodic check tasks | Yes | No |
| **MEMORY.md** / **memory.md** | Long-term curated memory | Yes | No |
| **BOOT.md** | Gateway startup hook instructions | Not injected — executed separately | No |

### The Loading Pipeline

#### 1. Workspace Initialization (`src/agents/workspace.ts` — `ensureAgentWorkspace()`)

When the workspace is first created (brand new, no files exist), templates from `docs/reference/templates/` are copied in via `writeFileIfMissing()`. A git repo is also initialized. `BOOTSTRAP.md` is **only** written for brand-new workspaces — it's a one-time birth certificate.

#### 2. Bootstrap File Loading (`src/agents/workspace.ts` — `loadWorkspaceBootstrapFiles()`)

At session start, all 9 file slots are read from disk. Missing files get a `{ missing: true }` entry (which becomes `[MISSING] Expected at: <path>` in the prompt). `MEMORY.md` and `memory.md` are both checked, deduplicated by realpath.

#### 3. Session Filtering (`src/agents/workspace.ts` — `filterBootstrapFilesForSession()`)

For **subagent sessions** (detected via `isSubagentSessionKey()`), only `AGENTS.md` and `TOOLS.md` are passed through. This is a security boundary — subagents don't see SOUL, IDENTITY, USER, or MEMORY files. The allowlist is hardcoded:

```typescript
const SUBAGENT_BOOTSTRAP_ALLOWLIST = new Set([DEFAULT_AGENTS_FILENAME, DEFAULT_TOOLS_FILENAME]);
```

#### 4. Hook Overrides (`src/agents/bootstrap-hooks.ts` — `applyBootstrapHookOverrides()`)

Before injection, an `agent:bootstrap` internal hook fires, allowing plugins to **mutate the bootstrap file list** — adding, removing, or modifying files before they reach the prompt.

#### 5. Truncation & Context Building (`src/agents/pi-embedded-helpers/bootstrap.ts` — `buildBootstrapContextFiles()`)

Each file's content is trimmed to a configurable max (default **20,000 chars**, from `agents.defaults.bootstrapMaxChars`). Over-long files get head/tail truncation (70% head + 20% tail) with a marker:
```
[...truncated, read TOOLS.md for full content...]
```

#### 6. System Prompt Assembly (`src/agents/system-prompt.ts` — `buildAgentSystemPrompt()`)

The final system prompt is structured as:
1. **Hardcoded sections** — Tooling, Safety, CLI Reference, Skills, Memory Recall, Messaging, etc.
2. **`# Project Context`** header
3. **Each workspace file** rendered as `## <filename>` followed by its content

If any file has the basename `soul.md`, a special instruction is injected:
> "If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it."

#### 7. Context Pruning Protection (`src/agents/pi-extensions/context-pruning/pruner.ts`)

The context pruner has a safety rail: it **never prunes messages before the first user message**. This protects the initial "identity reads" (SOUL.md, USER.md, etc.) that tool-read calls load before the user's first inbound message.

### What Each File Actually Does

**AGENTS.md** — The "operating system." Defines session-start protocol (read SOUL → USER → memory), memory system (daily logs + MEMORY.md), safety defaults (trash > rm), group chat etiquette (when to speak vs. `HEARTBEAT_OK`), and internal/external action boundaries. This is the file the agent reads *first* and follows as its main instruction set.

**SOUL.md** — The "personality firmware." Core truths ("be genuinely helpful, not performatively helpful"), opinions policy ("you're allowed to disagree"), resourcefulness mandate ("try to figure it out, then ask"), trust model ("earn trust through competence"), and the continuity rule ("these files ARE your memory"). Gets special treatment in prompt assembly — triggers the "embody its persona" instruction.

**IDENTITY.md** — Structured metadata (name, creature, vibe, emoji, avatar). Parsed by `src/agents/identity-file.ts` for both prompt injection AND UI display (avatar in Control UI). Template placeholders are detected and skipped so unfilled identities don't pollute the prompt.

**USER.md** — Human profile. Name, pronouns, timezone, contextual notes. Grows over time as the agent learns about its user. The template explicitly says "you're learning about a person, not building a dossier."

**BOOTSTRAP.md** — One-time first-run ritual. Instructs the agent to have a natural conversation ("Hey. I just came online. Who am I?"), co-create identity with the user, fill in IDENTITY.md/USER.md/SOUL.md, then **delete itself**. It's the agent's birth certificate.

**TOOLS.md** — Environment-specific notes (camera names, SSH hosts, voice preferences, device nicknames). Explicitly separated from Skills: "Skills are shared. Your setup is yours." Does NOT control tool availability — just user guidance for how to use tools.

**HEARTBEAT.md** — Periodic task checklist. When empty/blank, heartbeat checks are skipped. When populated, the heartbeat poll fires and the agent follows these instructions. The agent replies `HEARTBEAT_OK` if nothing needs attention.

**MEMORY.md** / **memory.md** — Long-term curated memory. Only loaded in **main sessions** (direct chat with the human), NOT in group chats or shared contexts (security: prevents personal context leaking). The agent also has `memory_search` and `memory_get` tools for semantic retrieval from memory files.

**BOOT.md** — NOT injected into the system prompt. Instead, it's **executed as a separate agent command** by the gateway's `boot-md` hook (`src/gateway/boot.ts`) on every gateway startup. It's for startup tasks like "send a good morning message" or "check the calendar."

### Dev vs Production Templates

The `*.dev.md` variants (e.g., `SOUL.dev.md`, `IDENTITY.dev.md`) define **C-3PO**, a debug companion persona used in `--dev` mode. In production, users get blank templates they fill in during the BOOTSTRAP conversation. In dev mode, the agent is pre-configured as an anxious protocol droid "fluent in over six million error messages."

All template files live in `docs/reference/templates/`:

| Template | Production | Dev |
|---|---|---|
| AGENTS.md | Generic operating instructions | C-3PO origin story + workspace rules |
| SOUL.md | Blank personality scaffold | Full C-3PO personality and operating style |
| IDENTITY.md | Empty fields to fill | C-3PO name, creature, vibe, emoji |
| USER.md | Empty profile to fill | "The Clawdributors" collective profile |
| TOOLS.md | Example-driven cheat sheet | Dev tool notes (imsg, sag) |
| BOOTSTRAP.md | Conversational first-run ritual | N/A (dev agents are pre-configured) |
| HEARTBEAT.md | Empty (skip heartbeats by default) | Same |
| BOOT.md | Gateway startup instructions template | Same |

### The Priority Hierarchy (Implicit)

From the system prompt structure, the effective priority is:
1. **Hardcoded system prompt** (Safety, Tooling, CLI) — highest
2. **AGENTS.md** — operational protocol
3. **SOUL.md** — personality (with explicit "embody its persona" trigger)
4. **IDENTITY.md** — structured metadata
5. **USER.md** — human context
6. **TOOLS.md** — environment notes
7. **MEMORY.md** — historical context
8. **HEARTBEAT.md** / **BOOTSTRAP.md** — situational

The system prompt explicitly states: "follow its guidance unless **higher-priority instructions** override it" for SOUL.md, establishing that the hardcoded safety/tooling sections take precedence over user-editable personality files. However, this hierarchy is **never stated explicitly in the prompt itself** — the LLM must infer it from document ordering.

---

## Part 2: Research Findings

### Anthropic Prompt Engineering Guidance

**Source:** https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/

Key takeaways relevant to ClosedClaw:

1. **XML tags for structure** — Using `<instructions>`, `<identity>`, `<context>` tags "clearly separate different parts of your prompt and ensure your prompt is well structured." They "reduce errors caused by Claude misinterpreting parts of your prompt." Tags should be consistent and nested for hierarchy.

2. **Role prompting in system parameter** — "Use the system parameter to set Claude's role. Put task-specific instructions in the user turn." Specificity matters: "data scientist" works worse than "data scientist specializing in customer insight analysis for Fortune 500 companies."

3. **Long context: put data at top, queries at bottom** — "Place your long documents and inputs (~20K+ tokens) near the top of your prompt, above your query, instructions, and examples. This can significantly improve Claude's performance." "Queries at the end can improve response quality by up to 30%."

4. **Ground responses in quotes** — "For long document tasks, ask Claude to quote relevant parts of the documents first before carrying out its task."

5. **XML tag best practices** — "Be consistent: Use the same tag names throughout your prompts, and refer to those tag names when talking about the content. Nest tags for hierarchical content."

6. **Chain of thought + structure** — Combine XML tags with CoT. `<thinking>` and `<answer>` tags create "super-structured, high-performance prompts." Useful for complex persona maintenance.

### OpenAI Best Practices

(Summarized from public documentation and cookbook resources)

1. **System message anchoring** — The system message sets the behavioral frame. Persona instructions should be near the top.

2. **Delimiter-based separation** — Use clear delimiters (`###`, `"""`, `---`, XML) to separate instructions from content.

3. **Specify output format** — When you want structured data (like an identity file), provide the exact output format.

4. **Reduce ambiguity** — Explicit > implicit. If you want the model to always do something, say "always" not "should."

---

## Part 3: Current Weaknesses

### A. No Structural Demarcation Between System Rules and User Content

In `src/agents/system-prompt.ts` (line 542-551), workspace files are injected using the same markdown heading hierarchy as system sections:

```
## Safety                    ← system section
...
## Workspace Files (injected)
...
# Project Context
## AGENTS.md                 ← user-editable file
## SOUL.md                   ← user-editable file
## Silent Replies            ← system section again
```

The LLM has no clear signal that "this section is user-editable persona content" vs "this section is immutable system constraint." This can cause:
- SOUL.md personality directives being deprioritized vs nearby system headers
- AGENTS.md instructions conflating with hardcoded system instructions

### B. SOUL.md Adherence Hint Is Too Weak

The only guidance is a single sentence:
> "If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it."

This doesn't tell the LLM *how* to apply the soul — in every response? Only in personality? In reasoning style? In word choice?

### C. IDENTITY.md Is Just Dumped as Raw Text

The parsed fields (name, creature, vibe, emoji) are available from `identity-file.ts` but the system prompt doesn't use them — it just dumps the raw markdown. The LLM gets `**Name:** Clawd` as unparsed markdown rather than a structured identity block it can easily reference.

### D. No Explicit Priority Ordering in the Prompt

The system prompt mentions "higher-priority instructions override it" for SOUL.md but never actually states the priority order. The LLM must guess.

### E. Missing Files Produce Noisy Markers

When a file is missing, it injects `[MISSING] Expected at: /home/user/.ClosedClaw/workspace/HEARTBEAT.md`. This wastes tokens and confuses the LLM with filesystem paths that aren't actionable.

### F. BOOTSTRAP.md Instructions Are Detached from the System Prompt

The BOOTSTRAP conversation relies entirely on the agent reading `AGENTS.md` which says "If BOOTSTRAP.md exists... follow it." But there's no system-level guidance about how to *conduct* the bootstrap — the quality of onboarding depends entirely on the LLM's interpretation of plain markdown.

---

## Part 4: Proposed Improvements

### 1. XML Tags for Workspace Context Injection

**Impact:** High | **Complexity:** Low

**Problem:**
Workspace files use the same markdown heading hierarchy as system sections. Anthropic's documentation explicitly recommends XML tags to "clearly separate different parts of your prompt."

**Proposed Change:**
In `buildAgentSystemPrompt()` (`src/agents/system-prompt.ts`), change the Project Context injection from:

```typescript
lines.push("# Project Context", "", "The following project context files have been loaded:");
// ...
for (const file of contextFiles) {
  lines.push(`## ${file.path}`, "", file.content, "");
}
```

To:

```typescript
lines.push(
  "# Workspace Context",
  "",
  "The following user-editable workspace files define your identity, instructions, and memory.",
  "Refer to them by their tag name (e.g., 'the guidance in <file name=\"SOUL.md\">').",
  ""
);
lines.push("<workspace_context>");
for (const file of contextFiles) {
  lines.push(`<file name="${file.path}">`, file.content, `</file>`, "");
}
lines.push("</workspace_context>");
```

**Files to change:**
- `src/agents/system-prompt.ts` (lines 535-553)
- `src/agents/system-prompt.test.ts` (lines 289-302)

**Why it matters:** XML-structured prompts have measurably higher instruction following in Anthropic's testing. It lets the LLM clearly distinguish "this is the user's personality definition" from "this is a system safety constraint."

---

### 2. Explicit Priority Hierarchy in System Prompt

**Impact:** High | **Complexity:** Low

**Problem:**
SOUL.md says "follow its guidance unless higher-priority instructions override it" but the prompt never defines priority ordering.

**Proposed Change:**
Add a new section after the Safety section in `buildAgentSystemPrompt()`:

```typescript
function buildPrioritySection(isMinimal: boolean) {
  if (isMinimal) return [];
  return [
    "## Instruction Priority",
    "When workspace files conflict with system rules, follow this precedence (highest first):",
    "1. Safety constraints (above) — always override everything",
    "2. System sections in this prompt (Tooling, CLI, Messaging, etc.)",
    "3. AGENTS.md — operational protocol and behavioral rules",
    "4. SOUL.md — personality, tone, and values",
    "5. IDENTITY.md / USER.md — identity metadata and user context",
    "6. TOOLS.md / MEMORY.md — environment notes and historical context",
    "Lower-priority files inform your personality and knowledge; higher-priority sections constrain your behavior.",
    "",
  ];
}
```

**Files to change:**
- `src/agents/system-prompt.ts` (after `buildSafetySection()`, around line 399)
- `src/agents/system-prompt.test.ts`

---

### 3. Stronger SOUL.md Adherence Instructions

**Impact:** Medium | **Complexity:** Low

**Problem:**
A single vague adherence hint that doesn't specify *how* to apply the persona.

**Proposed Change:**
Replace the SOUL.md hint (line 545 in `system-prompt.ts`) with:

```typescript
const soulGuidance = [
  "SOUL.md defines your personality, tone, and values. Apply it as follows:",
  "- Adopt the communication style, vocabulary, and emotional register described in SOUL.md for ALL responses.",
  "- If SOUL.md defines boundaries or preferences, respect them unless safety constraints override.",
  "- If SOUL.md describes a persona or character, stay in that persona consistently across the session.",
  "- Your IDENTITY.md fields (name, creature, vibe, emoji) are part of this persona — use them naturally.",
  "- Do not break character to explain you are an AI unless directly asked about your nature.",
].join("\n");
```

**Files to change:**
- `src/agents/system-prompt.ts` (lines 543-547)
- `src/agents/system-prompt.test.ts`

---

### 4. Structured Identity Injection

**Impact:** Medium | **Complexity:** Medium

**Problem:**
`IDENTITY.md` is parsed into structured fields for UI use but dumped as raw markdown in the prompt. The LLM has to parse markdown formatting to extract the name.

**Proposed Change:**
When building context files, if IDENTITY.md is present and parseable, inject a structured XML summary before the workspace context section:

```typescript
const identity = loadAgentIdentityFromWorkspace(workspaceDir);
if (identity && identityHasValues(identity)) {
  const fields = [
    identity.name && `name="${identity.name}"`,
    identity.creature && `creature="${identity.creature}"`,
    identity.vibe && `vibe="${identity.vibe}"`,
    identity.emoji && `emoji="${identity.emoji}"`,
  ].filter(Boolean);
  lines.push(`<agent_identity ${fields.join(" ")} />`);
  lines.push("");
}
```

**Files to change:**
- `src/agents/system-prompt.ts` (new section before workspace context)
- `src/agents/bootstrap-files.ts` (optional: pass identity through)

---

### 5. Clean Up Missing File Markers

**Impact:** Low-Medium | **Complexity:** Low

**Problem:**
Missing files inject `[MISSING] Expected at: /home/user/.ClosedClaw/workspace/HEARTBEAT.md` — wasting tokens with unusable filesystem paths.

**Proposed Change:**
In `buildBootstrapContextFiles()` (`src/agents/pi-embedded-helpers/bootstrap.ts`):

```typescript
const REQUIRED_BOOTSTRAP_FILES = new Set(["AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md"]);

// In the loop:
if (file.missing) {
  if (REQUIRED_BOOTSTRAP_FILES.has(file.name)) {
    result.push({
      path: file.name,
      content: `[MISSING — run the bootstrap ritual or create this file manually]`,
    });
  }
  // Skip optional missing files entirely (HEARTBEAT.md, TOOLS.md, MEMORY.md, etc.)
  continue;
}
```

**Files to change:**
- `src/agents/pi-embedded-helpers/bootstrap.ts` (lines 168-176)
- `src/agents/pi-embedded-helpers.buildbootstrapcontextfiles.test.ts`

---

### 6. Enhanced Bootstrap Onboarding Flow

**Impact:** Medium | **Complexity:** Medium

**Problem:**
BOOTSTRAP.md is charming but unstructured. Bootstrapping quality varies wildly by model.

**Proposed Change A (Template):**
Enhance `docs/reference/templates/BOOTSTRAP.md` with structured output guidance:

```markdown
## After You Know Who You Are

Update these files with what you learned:

- `IDENTITY.md` — Use this exact format:
  ```
  - **Name:** <chosen name>
  - **Creature:** <what kind of being>
  - **Vibe:** <communication style, 2-3 adjectives>
  - **Emoji:** <one emoji>
  ```
- `USER.md` — Use this exact format:
  ```
  - **Name:** <their name>
  - **What to call them:** <preferred address>
  - **Timezone:** <their timezone>
  - **Notes:** <anything notable>
  ```
- `SOUL.md` — Write freely, but include sections for:
  - Core personality traits
  - Communication style preferences
  - Boundaries (what to avoid)
  - Relationship with the user
```

**Proposed Change B (System Prompt):**
Add bootstrap detection in `buildAgentSystemPrompt()`:

```typescript
const hasBootstrap = contextFiles.some(f =>
  f.path.toLowerCase().includes("bootstrap.md") &&
  !f.content.includes("[MISSING]")
);
if (hasBootstrap) {
  lines.push(
    "## Bootstrap Mode",
    "BOOTSTRAP.md is present — this is a first-run workspace.",
    "Your primary task is the bootstrap ritual: get to know the user, co-create your identity, and populate IDENTITY.md, USER.md, and SOUL.md.",
    "Be conversational and warm. Ask one question at a time. Don't interrogate.",
    "After bootstrapping, delete BOOTSTRAP.md. Do not perform the ritual again once it's deleted.",
    ""
  );
}
```

**Files to change:**
- `docs/reference/templates/BOOTSTRAP.md`
- `src/agents/system-prompt.ts`

---

## Part 5: Implementation Summary

| # | Improvement | Impact | Complexity | Files Touched |
|---|---|---|---|---|
| 1 | XML tags for workspace context | **High** | Low | `system-prompt.ts`, test |
| 2 | Explicit priority hierarchy | **High** | Low | `system-prompt.ts`, test |
| 3 | Stronger SOUL.md adherence | **Medium** | Low | `system-prompt.ts`, test |
| 4 | Structured identity injection | **Medium** | Medium | `system-prompt.ts`, `bootstrap-files.ts` |
| 5 | Clean up missing file markers | **Low-Med** | Low | `bootstrap.ts`, test |
| 6 | Enhanced bootstrap flow | **Medium** | Medium | `BOOTSTRAP.md` template, `system-prompt.ts` |

All changes are **backward-compatible** — they improve prompt quality without changing the file format contract. Existing workspaces would benefit immediately from improvements 1-3 and 5 without any user action. Improvement 6 only affects new workspaces (existing ones have already deleted BOOTSTRAP.md).

### Key Source Files Reference

| File | Role |
|---|---|
| `src/agents/workspace.ts` | File constants, workspace init, bootstrap file loading, subagent filtering |
| `src/agents/system-prompt.ts` | System prompt assembly (the core of how files become LLM instructions) |
| `src/agents/pi-embedded-helpers/bootstrap.ts` | Content truncation, context file building |
| `src/agents/bootstrap-files.ts` | Orchestrates loading + hook overrides + context building |
| `src/agents/bootstrap-hooks.ts` | Plugin hook for mutating bootstrap files |
| `src/agents/identity-file.ts` | Parses IDENTITY.md into structured fields |
| `src/agents/pi-embedded-runner/run/attempt.ts` | The main session startup that wires everything together |
| `src/agents/pi-extensions/context-pruning/pruner.ts` | Context window management (protects identity reads) |
| `src/agents/system-prompt-report.ts` | Diagnostic reporting for prompt composition |
| `docs/reference/templates/*.md` | All template files for workspace bootstrapping |
