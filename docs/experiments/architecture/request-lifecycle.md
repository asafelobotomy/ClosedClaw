---
summary: "Technical architecture documentation of request lifecycle in OpenClaw - from user input to tool execution and response"
status: "Current Implementation"
read_when:
  - Understanding OpenClaw system architecture
  - Debugging request flow issues
  - Designing new channel integrations
title: "OpenClaw Request Lifecycle"
date: "2026-02-09"
---

# OpenClaw Architecture: The Lifecycle of a Request

**Status:** Current Implementation (OpenClaw v2026.2)  
**Focus:** Technical flow from user input to tool execution and final response

## Overview

This document outlines the technical flow of an OpenClaw request, tracking messages through the system from inbound channels, through the Gateway, into the agent brain, and back out.

## System Architecture Diagram

```
┌─────────────────┐
│  Inbound        │
│  Adapters       │
│  (Triggers)     │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Gateway        │
│  (Routing)      │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Lane Queue     │
│  (Serialization)│
└────────┬────────┘
         ↓
┌─────────────────┐
│  Prompt         │
│  Assembly       │
│  (Context)      │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Agentic Loop   │
│  (LLM + Tools)  │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Memory Flush   │
│  (Persistence)  │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Response       │
│  (Outbound)     │
└─────────────────┘
```

## Phase 1: Triggering (The Entry Point)

A request enters the system via three primary **Inbound Adapters**:

### 1. Active Channels

Direct messages from messaging platforms:

- **Telegram** (Bot API / grammY)
- **WhatsApp** (Baileys / WhatsApp Web)
- **Discord** (Bot API / discord.js)
- **Slack** (Bot API / Bolt)
- **Signal** (signal-cli)
- **iMessage** (imsg CLI)
- **Matrix** (matrix-js-sdk plugin)
- **Mattermost** (Bot API plugin)

**Flow:**

```
User sends message via Telegram
  ↓
Telegram Bot API delivers webhook to ClosedClaw Gateway
  ↓
Gateway validates sender + permission
  ↓
Extracts: userID, messageText, channelID, attachments
  ↓
Routes to appropriate lane
```

### 2. The Gateway UI

Built-in WebChat interface at `http://127.0.0.1:18789`

**Features:**

- Real-time WebSocket connection
- Multi-agent selection
- Session management
- Media upload
- Transcript export

**Flow:**

```
User types message in web UI
  ↓
WebSocket sends JSON to Gateway
  ↓
{
  "type": "message",
  "agent": "main",
  "text": "Deploy the app",
  "sessionId": "web-abc123"
}
  ↓
Gateway processes like any other channel
```

### 3. Proactive Heartbeats

**HEARTBEAT.md** logic allows agents to trigger their own requests based on:

- **Cron schedules:** "Check CI status every 30 minutes"
- **External webhooks:** GitHub PR created, Stripe payment received
- **Time-based:** "Every morning at 8am, summarize overnight alerts"

**Flow:**

```
Cron schedule fires at configured time
  ↓
Gateway reads HEARTBEAT.md
  ↓
Generates synthetic "user message"
  ↓
Routes to agent as if user requested it
  ↓
Agent executes task and logs result
```

**Example HEARTBEAT.md:**

```markdown
# Proactive Tasks

## Daily Standup Summary

- **Schedule:** `0 9 * * 1-5` (9am, weekdays)
- **Task:** Summarize previous day's commits, open PRs, and CI status
- **Output:** Post to #engineering Slack channel

## Certificate Expiry Check

- **Schedule:** `0 0 * * 0` (midnight Sunday)
- **Task:** Check TLS certificate expiration dates
- **Alert:** If any cert expires <30 days
```

## Phase 2: The Gateway & Lane Queue

Once a request is received, the Gateway performs:

### 2.1 Authentication & Authorization

```typescript
// Simplified auth flow
if (channel === "telegram") {
  const userId = extractTelegramUserId(message);
  const isAuthorized = await checkWhitelist(userId);
  if (!isAuthorized) {
    return sendPairingCode(userId); // DM policy enforcement
  }
}
```

**DM Policy Options:**

- `pairing` (default): Unknown senders get pairing code, not processed
- `open`: Anyone can message (use with caution)
- `closed`: Only whitelisted users

**See:** [Security Documentation](/security/pairing)

### 2.2 Session Resolution

The Gateway assigns requests to a **session** based on:

```typescript
const sessionKey = resolveSessionKey({
  agentId: config.defaultAgent || "main",
  channel: "telegram",
  kind: isGroupChat ? "guild" : "peer",
  peerId: extractPeerId(message),
});

// Example: "agent:main:telegram:peer:12345"
```

**Session Isolation:** Each user/channel gets unique `sessionId`, ensuring private files aren't leaked if agent is also used in group chats.

**See:** [Session Management Reference](/reference/session-management-compaction)

### 2.3 Lane Queue Assignment

**Default:** OpenClaw uses **Serial Execution** (one request at a time per session).

```typescript
class LaneQueue {
  private queue: Request[] = [];
  private processing = false;

  async enqueue(request: Request) {
    this.queue.push(request);
    if (!this.processing) {
      await this.processNext();
    }
  }

  private async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const request = this.queue.shift();
    await this.executeRequest(request);
    await this.processNext(); // Recursive serial processing
  }
}
```

**Why Serial?** Prevents race conditions:

- ❌ Reading a file while agent is still writing to it
- ❌ Deploying v1.0 and v1.1 simultaneously
- ❌ Two agents modifying MEMORY.md concurrently

**Future:** Support parallel lanes with explicit opt-in for read-only operations.

## Phase 3: Prompt Assembly (The Brain)

Before the model sees the request, OpenClaw builds a **Dynamic System Prompt** by pulling from multiple sources.

### 3.1 Core Context Files

| File            | Purpose                               | Token Budget | Refresh Frequency |
| --------------- | ------------------------------------- | ------------ | ----------------- |
| **USER.md**     | User preferences, bio, facts          | ~500 tokens  | On session start  |
| **IDENTITY.md** | Agent persona, tone, style            | ~200 tokens  | On session start  |
| **SOUL.md**     | Behavioral rules, safety constraints  | ~300 tokens  | On session start  |
| **TOOLS.md**    | Available skills and when to use them | ~2000 tokens | On session start  |
| **MEMORY.md**   | Long-term distilled knowledge         | ~1000 tokens | On session start  |

### 3.2 Recent Conversation History

```typescript
const recentHistory = await getRecentMessages(sessionId, {
  maxMessages: 20, // Last 20 turns
  maxTokens: 8000, // Stay within context window
  includeToolCalls: true, // Show what tools were used
});
```

**Compaction:** When history exceeds limit, OpenClaw runs `/compact` command to summarize old messages while preserving essential context.

**See:** [Session Management & Compaction](/reference/session-management-compaction)

### 3.3 Prompt Structure

```
SYSTEM:
You are an AI assistant. Your configuration:

[IDENTITY.md contents]
- Name: ClosedClaw
- Tone: Helpful, concise, lobster-themed

[SOUL.md contents]
Safety Rules:
- Always ask before deleting files
- Never expose credentials in responses
- Explain financial transactions before executing

[TOOLS.md contents - truncated for brevity]
Available tools:
1. pi_shell - Execute shell commands
2. web_browse - Fetch and extract web content
3. file_read - Read file contents
...

[USER.md contents]
User preferences:
- Name: Alice
- Timezone: America/Los_Angeles
- Prefers dark mode
- Tech stack: TypeScript, React, Node

[MEMORY.md recent facts]
- Project XYZ deployed to staging on 2026-02-07
- CI pipeline currently passing (checked 2h ago)
- Database migration pending review

CONVERSATION HISTORY:
User: What's the CI status?
Assistant: Let me check... [tool call: check_ci_status]
CI is passing. All 42 tests passed in 3m 24s.

User: Deploy the app
```

### 3.4 Token Optimization

**Strategies:**

1. **Lazy Loading:** Only load MEMORY.md chunks relevant to current request
2. **Tool Filtering:** Show only tools likely needed based on request keywords
3. **History Summarization:** Replace old messages with summary
4. **Streaming Context:** For long files, use `file_preview` tool instead of full embed

## Phase 4: The Agentic Loop (The Action Phase)

Where OpenClaw differs from ChatGPT—instead of just answering, the model enters a **loop**.

### 4.1 Loop Structure

```
┌─→ Plan
│     ↓
│   Execute
│     ↓
│   Observe
│     ↓
│   Adjust?
└─────┘
```

### 4.2 Example: Deploy Request

```
USER: "Deploy the app to staging"

LOOP ITERATION 1:
  Plan: Need to check git status first
  Execute: Run `git status`
  Observe: "working tree clean"
  Adjust: Proceed to build

LOOP ITERATION 2:
  Plan: Build the application
  Execute: Run `npm run build`
  Observe: "Build completed successfully. Output: dist/"
  Adjust: Build succeeded, proceed to deploy

LOOP ITERATION 3:
  Plan: Deploy to staging server
  Execute: Run deployment script
  Observe: "Deployed version 1.2.3 to staging.example.com"
  Adjust: Deployment successful, verify health

LOOP ITERATION 4:
  Plan: Verify health endpoint
  Execute: HTTP GET https://staging.example.com/health
  Observe: "200 OK - All systems operational"
  Adjust: Task complete, respond to user

RESPONSE: "✅ Deployed to staging. Version 1.2.3 is live and healthy."
```

### 4.3 Tool Execution

**Flow:**

```typescript
// Agent decides to call tool
const toolCall = {
  name: "pi_shell",
  arguments: {
    cmd: "git status",
    cwd: "/home/user/project",
  },
};

// Gateway routes to Pi Runner
const result = await piRunner.executeTool(toolCall);

// Result fed back into LLM context
return {
  stdout: "On branch main\nYour branch is up to date...",
  stderr: "",
  exit_code: 0,
};
```

**Tool Types:**

1. **Shell Execution:** `pi_shell`, `pi_bash`
2. **File Operations:** `file_read`, `file_write`, `mkdir`
3. **Web:** `web_browse`, `web_search`
4. **APIs:** `github_*`, `slack_*`, `stripe_*`
5. **Media:** `transcribe_audio`, `analyze_image`
6. **Specialized:** `mcp_*` (Model Context Protocol servers)

**See:** [Tool Documentation](/tools)

### 4.4 Multi-Turn Conversations

The loop continues until:

- ✅ Task successfully completed
- ❌ Irrecoverable error (report to user)
- ⏱️ Timeout (configurable, default 5 minutes)
- 🚫 Safety rule violation (blocked by SOUL.md)
- 🔀 User sends interruption message

## Phase 5: Memory Flush & Compaction

After task completion, OpenClaw performs **Post-Action Cleanup**.

### 5.1 Durable Notes

If the agent learned something new:

```typescript
if (shouldPersist(fact)) {
  await appendToMemory("MEMORY.md", fact);
}

// Example:
("User prefers dark mode - updated 2026-02-09");
("Project XYZ staging deploy successful at 14:30:00 UTC");
("Database migration script location: /scripts/migrate-2026-02.sql");
```

### 5.2 Context Compaction

To save tokens and costs, OpenClaw runs `/compact`:

```typescript
// Before compaction (3000 tokens)
User: What's the weather?
Assistant: Let me check... [tool call] It's 72°F and sunny.
User: Thanks. What about tomorrow?
Assistant: [tool call] Tomorrow: 75°F, partly cloudy.
User: Perfect. Now deploy the app.

// After compaction (800 tokens)
[Previous conversation: User asked about weather (72°F today, 75°F tomorrow). Now requesting deployment.]
User: Now deploy the app.
```

**Triggers:**

- Manual: User sends `/compact` command
- Automatic: Context window >80% full
- Scheduled: Daily compaction of old sessions

**See:** [Compaction Documentation](/reference/session-management-compaction)

### 5.3 Transcript Archival

Full raw transcripts saved to:

```
~/.closedclaw/sessions/<agentId>/<sessionId>/transcripts/YYYY-MM-DD.jsonl
```

**Format (JSONL):**

```jsonl
{"role":"user","content":"Deploy the app","timestamp":"2026-02-09T14:30:00Z"}
{"role":"assistant","content":"Checking git status...","timestamp":"2026-02-09T14:30:01Z"}
{"role":"tool","name":"pi_shell","result":"clean","timestamp":"2026-02-09T14:30:02Z"}
```

**Benefits:**

- Audit trail for security/compliance
- Replay sessions for debugging
- Training data for fine-tuning (privacy-respecting)

## Phase 6: Response Delivery

### 6.1 Outbound Routing

The Gateway routes responses back through the appropriate channel:

```typescript
const response = {
  sessionId: "telegram:peer:12345",
  content: "✅ Deployed to staging. Version 1.2.3 is live.",
  media: [{ type: "image", url: "https://..." }],
  replyTo: originalMessageId,
};

await channelAdapter.send(response);
```

### 6.2 Channel-Specific Formatting

Different channels have different capabilities:

| Feature       | Telegram | WhatsApp | Discord | Slack | iMessage |
| ------------- | -------- | -------- | ------- | ----- | -------- |
| **Markdown**  | ✅       | ✅       | ✅      | ✅    | ❌       |
| **Images**    | ✅       | ✅       | ✅      | ✅    | ✅       |
| **Audio**     | ✅       | ✅       | ✅      | ✅    | ✅       |
| **Video**     | ✅       | ✅       | ✅      | ✅    | ✅       |
| **Buttons**   | ✅       | ✅       | ✅      | ✅    | ❌       |
| **Threads**   | ❌       | ❌       | ✅      | ✅    | ❌       |
| **Reactions** | ✅       | ✅       | ✅      | ✅    | ✅       |

**Adapter Layer:** Automatically downgrades features not supported by channel.

### 6.3 Error Handling

```typescript
try {
  await channelAdapter.send(response);
} catch (error) {
  if (error.code === "RATE_LIMIT") {
    await delay(error.retryAfter);
    await channelAdapter.send(response);
  } else if (error.code === "MESSAGE_TOO_LONG") {
    // Split into multiple messages
    await sendInChunks(response, maxLength: 4096);
  } else {
    logger.error("Failed to send response", { error, sessionId });
    await sendFallbackNotification(user, "Response delivery failed");
  }
}
```

## Component Responsibilities

| Component            | Responsibility                            | Documentation                                      |
| -------------------- | ----------------------------------------- | -------------------------------------------------- |
| **Gateway**          | Message routing, auth, session management | [Gateway Docs](/gateway)                           |
| **Pi Runner**        | Tool execution ("The Hands")              | [Pi Runner Docs](/agents/pi-dev)                   |
| **Lane Queue**       | Preventing race conditions                | [Architecture Queues](/concepts)                   |
| **ClawHub**          | Registry of 100+ community skills         | [ClawHub Registry](https://registry.closedclaw.ai) |
| **Tailscale**        | Secure remote access                      | [Tailscale Security](/security/tailscale)          |
| **Channel Adapters** | Platform-specific integration             | [Channels Docs](/channels)                         |

## Performance Characteristics

### Typical Request Timing

| Phase                 | Duration  | Notes            |
| --------------------- | --------- | ---------------- |
| **Inbound (webhook)** | 10-50ms   | Network latency  |
| **Auth & routing**    | 5-20ms    | Local checks     |
| **Prompt assembly**   | 50-200ms  | File I/O         |
| **LLM inference**     | 1-5s      | Depends on model |
| **Tool execution**    | 100ms-60s | Varies by tool   |
| **Response delivery** | 50-200ms  | Network latency  |

**Total:** ~2-65 seconds for typical request with 1-3 tool calls

### Optimization Strategies

1. **Caching:** Reuse prompt components across requests
2. **Streaming:** Show partial responses while tools execute
3. **Parallel Tools:** Execute independent tools concurrently (future)
4. **Lazy Loading:** Defer loading large context files until needed

## Debugging Tips

### View active sessions

```bash
closedclaw sessions list
```

### Inspect session state

```bash
closedclaw sessions inspect <sessionId>
```

### Monitor live requests

```bash
closedclaw gateway --verbose
# Or tail Gateway logs:
tail -f ~/.closedclaw/logs/gateway-*.log
```

### Test prompt assembly

```bash
# See what context will be sent to LLM
closedclaw debug prompt-preview --session <sessionId>
```

## Related Documentation

- [Gateway Architecture](/gateway/architecture)
- [Session Management](/reference/session-management-compaction)
- [Channel Development](/channels)
- [Tool Development](/tools)
- [Security & Pairing](/security/pairing)
- [Orchestration Dialect](../research/orchestration-dialect.md)
- [Memory Scaling](../research/scaling-memory.md)

## References

- **Model Context Protocol (MCP)** - Anthropic, 2024
- **Pi Agent Runtime** - Mario Zechner, 2024-2025
- **ReAct: Reasoning and Acting** - Princeton, 2023
- **LangChain Agents** - Harrison Chase, 2023

---

**Contributors:** ClosedClaw Development Team  
**Last Updated:** 2026-02-09  
**Status:** Current implementation documented for OpenClaw v2026.2
