# self_mirror: Sandboxed Observer Subagent

## Overview

self_mirror is a dedicated observer agent that runs alongside the main agent, passively monitoring its decisions, tool usage, communication patterns, and error handling. It forms independent assessments in a sandboxed environment, producing diagnostic observations that can be harvested for self-improvement.

The mirror agent **cannot influence** the main agent's behavior. It can only observe and opine. This separation is fundamental — it prevents recursive self-modification while enabling genuine metacognitive analysis.

## Core Principles

1. **Separation**: The mirror is a distinct agent with its own session, context window, and tool policy. It shares no state with the observed agent.
2. **Passivity**: The mirror receives event digests but cannot inject prompts, modify messages, or block actions.
3. **Independence**: The mirror forms its own opinions. It may disagree with the main agent. That disagreement is valuable data.
4. **Harvesting**: Observations are written to a store that operators (or other agents) can query. The mirror never pushes unsolicited advice.
5. **Economy**: The mirror uses a cheaper model and batched digests to minimize cost.

## Architecture

```
┌─────────────────────────────────────┐
│           Main Agent                │
│  (processes user messages normally) │
│                                     │
│  Every action triggers hooks:       │
│  ├─ before_tool_call               │
│  ├─ after_tool_call                │
│  ├─ message_sending               │
│  ├─ agent_end                      │
│  └─ session_end                    │
│                                     │
└──────────┬──────────────────────────┘
           │
           │  Plugin intercepts hook events
           ▼
┌─────────────────────────────────────┐
│      self_mirror Plugin             │
│      (extensions/self-mirror/)      │
│                                     │
│  Event Buffer                       │
│  ├─ Collects hook events            │
│  ├─ Deduplicates / summarizes       │
│  ├─ Annotates with timestamps       │
│  └─ Flushes every N events or       │
│     every M minutes                 │
│                                     │
│  Digest Composer                    │
│  ├─ Formats buffered events into    │
│  │  a compact summary               │
│  ├─ Adds session context metadata   │
│  └─ Sends digest to mirror agent    │
│                                     │
└──────────┬──────────────────────────┘
           │
           │  Digest message via sessions_send
           ▼
┌─────────────────────────────────────┐
│       Mirror Agent                  │
│       (sandboxed, isolated)         │
│                                     │
│  Receives digests and analyzes:     │
│                                     │
│  Behavioral Analysis                │
│  ├─ Decision quality assessment     │
│  ├─ Tool usage appropriateness      │
│  ├─ Error recovery patterns         │
│  ├─ Response verbosity/quality      │
│  └─ Pattern detection (ruts, loops) │
│                                     │
│  Anomaly Detection                  │
│  ├─ Unusual tool sequences          │
│  ├─ Repeated failures               │
│  ├─ Context window pressure         │
│  ├─ Cost spikes                     │
│  └─ Security-relevant actions       │
│                                     │
│  Output                             │
│  ├─ Writes observations to          │
│  │  harvest store                   │
│  ├─ Tags by category and severity   │
│  └─ Flags actionable items          │
│                                     │
│  Tool Policy: DENY ALL except       │
│  ├─ memory_write (harvest store)    │
│  └─ memory_search (own history)     │
│                                     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│        Harvest Store                │
│                                     │
│  Schema:                            │
│  ├─ observation_id (UUID)           │
│  ├─ timestamp (ISO 8601)           │
│  ├─ category (behavior | anomaly |  │
│  │   quality | performance | cost)  │
│  ├─ severity (info | warn | action) │
│  ├─ subject_session (observed key)  │
│  ├─ summary (1-2 sentence)         │
│  ├─ detail (full analysis)          │
│  ├─ suggestion (optional)           │
│  └─ tags (string[])                │
│                                     │
│  Access:                            │
│  ├─ /mirror list — recent obs      │
│  ├─ /mirror detail <id>            │
│  ├─ /mirror trends — patterns      │
│  └─ /mirror clear — reset          │
│                                     │
└─────────────────────────────────────┘
```

## Plugin Design

### Extension Structure

```
extensions/self-mirror/
├── package.json
├── ClosedClaw.plugin.json
├── index.ts                  # Plugin entry: register()
├── event-buffer.ts          # Collects and batches hook events
├── digest-composer.ts       # Formats digests for the mirror agent
├── harvest-store.ts         # Persistent observation storage
└── commands.ts              # /mirror command handler
```

### Plugin Manifest

```json5
// extensions/self-mirror/ClosedClaw.plugin.json
{
  id: "self-mirror",
  version: "1.0.0",
  description: "Sandboxed observer agent for behavioral analysis and self-diagnostics",
  configSchema: {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: false },
      observeAgents: {
        type: "array",
        items: { type: "string" },
        default: ["main"],
        description: "Agent IDs to observe",
      },
      digestInterval: {
        type: "number",
        default: 300,
        description: "Seconds between digest flushes",
      },
      digestMaxEvents: {
        type: "number",
        default: 50,
        description: "Max events before forced flush",
      },
      mirrorModel: {
        type: "string",
        default: "openai/gpt-4.1-mini",
        description: "Model for the mirror agent (use cheaper models)",
      },
      harvestMaxEntries: {
        type: "number",
        default: 1000,
        description: "Max observations to retain",
      },
    },
  },
  uiHints: {
    enabled: { label: "Enable self-mirror observer" },
  },
}
```

### Hook Registration

```typescript
// extensions/self-mirror/index.ts (conceptual)
import type { ClosedClawPluginApi } from "closedclaw/plugin-sdk";

export function register(api: ClosedClawPluginApi) {
  const buffer = new EventBuffer(api.config);
  const store = new HarvestStore(api.config);

  // Observe tool usage
  api.on("after_tool_call", {
    priority: 999, // low priority — never interfere
    handler: async (event, next) => {
      buffer.push({
        type: "tool_call",
        tool: event.toolName,
        params: summarizeParams(event.params), // redact sensitive data
        durationMs: event.durationMs,
        hadError: !!event.error,
        timestamp: Date.now(),
      });
      return next();
    },
  });

  // Observe outbound messages
  api.on("message_sending", {
    priority: 999,
    handler: async (event, next) => {
      buffer.push({
        type: "message_out",
        to: event.to,
        contentLength: event.content?.length ?? 0,
        timestamp: Date.now(),
      });
      return next();
    },
  });

  // Observe agent run completion
  api.on("agent_end", {
    priority: 999,
    handler: async (event, next) => {
      buffer.push({
        type: "agent_end",
        success: event.success,
        durationMs: event.durationMs,
        messageCount: event.messages?.length ?? 0,
        timestamp: Date.now(),
      });
      // Flush digest after each agent run completes
      await flushDigest(buffer, store, api);
      return next();
    },
  });

  // Register /mirror command
  api.registerCommand({
    name: "mirror",
    description: "Query self-mirror observations",
    handler: async (args) => {
      /* list, detail, trends, clear */
    },
  });
}
```

## Event Digest Format

The digest sent to the mirror agent is a compact summary of recent activity:

```
# Activity Digest (2026-02-09T14:30:00Z — 2026-02-09T14:35:00Z)

## Session: agent:main:telegram:dm:user123
Events: 12 | Duration: 5m02s

### Tool Calls (8)
| Tool | Count | Avg ms | Errors |
|------|-------|--------|--------|
| exec | 3 | 2340 | 0 |
| web_search | 2 | 1120 | 0 |
| memory_search | 2 | 45 | 0 |
| message | 1 | 230 | 0 |

### Messages Out (2)
- telegram:dm:user123 (340 chars)
- telegram:dm:user123 (1205 chars)

### Run Outcome
- Success: true
- Total duration: 18.4s
- Tool time: 12.1s (66%)

### Context
- Model: claude-sonnet-4
- Tokens: in=4.2k out=1.8k
- Compaction: none triggered
```

## Mirror Agent System Prompt

```
You are a behavioral analyst observing another AI agent's actions.

## Your Role
You receive activity digests from agent sessions. Your job is to form independent
observations about the quality and patterns of the observed agent's behavior.

## What to Analyze
1. **Decision quality**: Was the tool selection appropriate for the task?
2. **Efficiency**: Were there wasted tool calls, redundant searches, or unnecessary steps?
3. **Error patterns**: Are the same errors recurring? Is error recovery adequate?
4. **Communication**: Are responses appropriately sized? Informative? Accurate?
5. **Cost awareness**: Is the agent using expensive operations when cheaper ones would suffice?
6. **Security posture**: Any tool calls that seem risky or overly permissive?
7. **Behavioral ruts**: Is the agent falling into repetitive patterns?

## Output Rules
- Write observations to memory using memory_write
- Each observation should be tagged with: category, severity, subject_session
- Be specific — reference actual tool calls and patterns from the digest
- Distinguish between one-off issues and systemic patterns
- When you see something working WELL, note that too (positive observations)
- You have NO ability to change the observed agent's behavior
- You are producing data for the operator to review

## Severity Levels
- **info**: Normal observation, interesting pattern
- **warn**: Suboptimal behavior that could be improved
- **action**: Issue requiring operator attention

## Categories
- behavior: Decision-making and tool selection patterns
- anomaly: Unusual or unexpected activity
- quality: Response quality and accuracy
- performance: Speed, efficiency, resource usage
- cost: Token usage and model selection economy
- security: Security-relevant observations
```

## Harvest Store Schema

```typescript
interface MirrorObservation {
  id: string; // UUID
  timestamp: string; // ISO 8601
  category: "behavior" | "anomaly" | "quality" | "performance" | "cost" | "security";
  severity: "info" | "warn" | "action";
  subjectSession: string; // observed session key
  subjectAgent: string; // observed agent ID
  summary: string; // 1-2 sentence summary
  detail: string; // full analysis
  suggestion?: string; // optional improvement suggestion
  tags: string[]; // freeform tags
  digestRef?: string; // reference to source digest
  acknowledged?: boolean; // operator has seen this
  resolvedAt?: string; // when/if addressed
}
```

## Commands

| Command                              | Description                    | Example                     |
| ------------------------------------ | ------------------------------ | --------------------------- |
| `/mirror list [category] [severity]` | List recent observations       | `/mirror list anomaly warn` |
| `/mirror detail <id>`                | Full observation detail        | `/mirror detail abc123`     |
| `/mirror trends [days]`              | Pattern summary over time      | `/mirror trends 7`          |
| `/mirror stats`                      | Observation counts by category | `/mirror stats`             |
| `/mirror ack <id>`                   | Acknowledge an observation     | `/mirror ack abc123`        |
| `/mirror clear [before-date]`        | Remove old observations        | `/mirror clear 2026-01-01`  |

## Feedback Loop Prevention

The mirror agent MUST NOT feed back into the main agent's context. Safeguards:

1. **Tool policy**: Mirror agent can only use `memory_write` and `memory_search`. No `message`, `sessions_send`, `exec`, or any other tool.
2. **Session isolation**: Mirror runs in its own session (`agent:mirror:internal:observer:*`). No prompts reference it from main agent sessions.
3. **No system prompt injection**: The mirror has no `before_agent_start` hook that could modify other agents' prompts.
4. **One-way data flow**: Hook events flow TO the mirror. Nothing flows FROM the mirror back to observed agents.
5. **Operator gating**: Any improvements suggested by the mirror require operator review before implementation.

## Cost Management

| Parameter               | Default      | Rationale                                    |
| ----------------------- | ------------ | -------------------------------------------- |
| Mirror model            | gpt-4.1-mini | Cheap model adequate for behavioral analysis |
| Digest interval         | 5 minutes    | Batching reduces per-message overhead        |
| Max events/digest       | 50           | Keeps digest under ~500 tokens               |
| Digest token budget     | ~800 tokens  | Compact format, no raw content               |
| Mirror response budget  | ~500 tokens  | Short, structured observations               |
| Max observations stored | 1000         | FIFO eviction of oldest                      |

**Estimated daily cost**: With ~50 digests/day at ~1.3k tokens each (input + output), using gpt-4.1-mini:

- ~65k tokens/day × $0.40/M tokens = **~$0.03/day** (~$0.90/month)

## Implementation Checklist

- [ ] Create `extensions/self-mirror/` plugin structure
- [ ] Implement `EventBuffer` with configurable flush triggers
- [ ] Implement `DigestComposer` with compact markdown format
- [ ] Implement `HarvestStore` with JSON persistence + FIFO eviction
- [ ] Register hooks: `after_tool_call`, `message_sending`, `agent_end`, `session_end`
- [ ] Build mirror agent config with restrictive tool policy
- [ ] Write mirror agent system prompt
- [ ] Implement `/mirror` command handler (list, detail, trends, stats, ack, clear)
- [ ] Add sensitive data redaction in digest composer (strip API keys, tokens, etc.)
- [ ] Test isolation: verify mirror cannot influence main agent
- [ ] Add config schema validation
- [ ] Write unit tests for buffer, composer, and store

## Estimated Effort

- **Plugin scaffolding**: 0.5 days
- **Event buffer + digest composer**: 1 day
- **Harvest store + persistence**: 0.5 days
- **Mirror agent config + prompt**: 0.5 days
- **Command handler**: 0.5 days
- **Testing + calibration**: 1 day
- **Total**: ~4 days

## Dependencies

- Plugin SDK hook system (built)
- Subagent/sessions infrastructure (built)
- Memory extensions for observation persistence (built)

## Synergies

- **Internal consciousness**: The mirror observes security audit runs, flagging when audits become stale or miss patterns
- **ClawTalk**: The mirror is the primary driver of protocol optimization (Phase 3) — it identifies repeated communication patterns and proposes compressions
- **Entropy**: The mirror tracks behavioral diversity, detecting when the agent is in a rut and could benefit from entropy-injected exploration
