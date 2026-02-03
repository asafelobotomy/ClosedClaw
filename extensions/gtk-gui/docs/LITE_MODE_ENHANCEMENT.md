# Enhanced Lite Mode Implementation Plan

> **Status:** Implemented (Phase 1-5 Complete)  
> **Created:** 2026-02-02  
> **Last Updated:** 2026-02-03

---

## Table of Contents

- [Overview](#overview)
- [Research Findings](#research-findings)
- [Architecture Decision](#architecture-decision)
- [Implementation Checklist](#implementation-checklist)
- [Technical Specifications](#technical-specifications)
- [Testing Plan](#testing-plan)
- [Future Improvements](#future-improvements)
- [Notes & Observations](#notes--observations)

---

## Overview

### Problem Statement

The current lite mode provides fast responses (1-3 seconds) by bypassing the full Pi agent system prompt (~5000+ tokens), but lacks any tool/action capabilities. Users want:

- Fast response times (maintained)
- File operations (read/write/list)
- Shell command execution
- Simple memory/notes system
- Web search capability
- All running locally with no paid subscriptions

### Goal

Implement enhanced lite mode with agent-like capabilities while keeping prompts small enough for 1-2B parameter models running on CPU.

### Constraints

- Must work with small models (1-2B parameters)
- CPU inference only (no GPU)
- Response time target: < 5 seconds for simple queries
- System prompt budget: < 500 tokens
- No external paid APIs

---

## Research Findings

### Ollama Tool Support

| Finding | Source | Implication |
|---------|--------|-------------|
| Native tool calling via `tools` parameter | Ollama API docs | Can use structured JSON function calls |
| `qwen3:0.6b` (523MB) supports tools | ollama.com/search?c=tools | Smallest tool-capable model available |
| `qwen3:1.7b` (1.4GB) supports tools | ollama.com/library/qwen3 | Good balance of size and capability |
| Structured outputs via `format` parameter | Ollama API docs | Model can return reliable JSON |
| Tool response flow: call → execute → feed back | Ollama API docs | Multi-turn for tool results |

### Small Model Considerations

| Model | Size | Tool Support | Notes |
|-------|------|--------------|-------|
| `llama3.2:1b` | 1.3GB | Limited | Current model, patterns unreliable |
| `qwen3:0.6b` | 523MB | ✅ Native | Smallest option, may struggle with complex |
| `qwen3:1.7b` | 1.4GB | ✅ Native | **Recommended** - good capability/size ratio |
| `qwen3:4b` | 2.5GB | ✅ Native | Better quality, larger memory footprint |

### Agent Architecture Patterns

| Pattern | Description | Suitability for Small Models |
|---------|-------------|------------------------------|
| ReAct | Thought → Action → Observation loop | ⚠️ May be too complex |
| Native Tool Calling | Model outputs structured tool calls | ✅ Recommended |
| Pattern Matching | Parse `[COMMAND: args]` from output | ✅ Simple fallback |
| JSON Mode | Force JSON output with action field | ✅ Good middle ground |

### Key Insight from Research

> "Reliability of natural language interface is questionable... much of the agent demo code focuses on parsing model output. Shift complexity from model to host system."
> — Lilian Weng, LLM Powered Autonomous Agents

**Takeaway:** Don't rely on the model to format things perfectly. Build robust parsing on the host side.

---

## Architecture Decision

### Recommended: Hybrid Three-Tier Approach

```
┌─────────────────────────────────────────────────────────────┐
│                     User Message                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Model Capability Detection                   │
│         Does model support native tool calling?              │
└─────────────────────────────────────────────────────────────┘
                    │                    │
            ┌───────┴───────┐    ┌───────┴───────┐
            │  Yes (Tier 1) │    │   No (Tier 2) │
            └───────────────┘    └───────────────┘
                    │                    │
                    ▼                    ▼
┌───────────────────────────┐ ┌───────────────────────────────┐
│   Native Tool Calling     │ │   Pattern-Based Parsing       │
│   via Ollama tools API    │ │   [READ: path] [EXEC: cmd]    │
└───────────────────────────┘ └───────────────────────────────┘
                    │                    │
                    └────────┬───────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Executor                             │
│     read_file, run_command, list_dir, save_note, etc.       │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Feed Result Back to Model                       │
│            (for natural language response)                   │
└─────────────────────────────────────────────────────────────┘
```

### Why This Approach?

1. **Tier 1 (Native Tools):** Best reliability when model supports it
2. **Tier 2 (Patterns):** Fallback for any model, simple to implement
3. **Shared Executor:** Single implementation for all tool execution
4. **Result Integration:** Model explains tool output naturally

---

## Implementation Checklist

### Phase 0: Preparation
- [ ] Document current lite mode behavior
- [ ] Benchmark current response times
- [ ] Test `qwen3:1.7b` installation and basic chat

### Phase 1: Model Upgrade
- [ ] Pull `qwen3:1.7b` model
  ```bash
  ollama pull qwen3:1.7b
  ```
- [ ] Update `~/.ClosedClaw/ClosedClaw.json` with new model
- [ ] Test basic chat works with new model
- [ ] Benchmark response times with new model

### Phase 2: Tool System Foundation
- [ ] Create `extensions/gtk-gui/src/lite-tools.ts`
- [ ] Implement core tools:
  - [ ] `read_file` - Read file contents
  - [ ] `run_command` - Execute shell command
  - [ ] `list_directory` - List directory contents
  - [ ] `save_note` - Persist a note
  - [ ] `recall_notes` - Retrieve saved notes
  - [ ] `current_time` - Get current date/time
- [ ] Add `getOllamaTools()` - Convert to Ollama format
- [ ] Add `executeTool()` - Execute by name
- [ ] Add tool execution timeout handling
- [ ] Add output truncation for large results

### Phase 3: Native Tool Calling
- [ ] Implement `callOllamaLiteWithTools()` in monitor.ts
- [ ] Handle tool_calls in response
- [ ] Execute tools and feed results back
- [ ] Handle multi-tool calls in single response
- [ ] Test with various tool-requiring queries

### Phase 4: Pattern-Based Fallback
- [ ] Implement `callOllamaLiteWithPatterns()` 
- [ ] Define pattern syntax: `[COMMAND: args]`
- [ ] Implement `executePatterns()` parser
- [ ] Test with llama3.2:1b (non-tool model)

### Phase 5: Integration
- [ ] Implement `modelSupportsTools()` detection
- [ ] Update `handleLiteMode()` to auto-select approach
- [ ] Update conversation history management
- [ ] Update config schema with new options
- [ ] Test end-to-end flow

### Phase 6: Polish & Documentation
- [ ] Add error handling for all failure modes
- [ ] Add logging for debugging
- [ ] Update GTK-GUI README
- [ ] Test on fresh install

---

## Technical Specifications

### New Files to Create

```
extensions/gtk-gui/
├── src/
│   ├── lite-tools.ts      # Tool definitions and executor
│   └── monitor.ts         # (update existing)
└── docs/
    └── LITE_MODE_ENHANCEMENT.md  # This document
```

### Configuration Schema Updates

```jsonc
// ClosedClaw.plugin.json additions
{
  "settings": {
    "liteMode": {
      "type": "boolean",
      "default": true,
      "description": "Use lightweight mode for small models"
    },
    "liteModeTools": {
      "type": "boolean",
      "default": true,
      "description": "Enable tool execution in lite mode"
    },
    "liteModeMaxHistory": {
      "type": "number",
      "default": 10,
      "description": "Maximum conversation turns to remember"
    },
    "liteModeToolTimeout": {
      "type": "number",
      "default": 30000,
      "description": "Tool execution timeout in milliseconds"
    }
  }
}
```

### System Prompt Budget

**Target: < 200 tokens for Tier 1 (native tools)**

```
You are {name}, a helpful assistant running on Linux.
Be concise and friendly. Use tools when needed to help the user.
```

**Target: < 300 tokens for Tier 2 (pattern-based)**

```
You are {name}, a helpful Linux assistant.

To perform actions, use these exact patterns:
[READ: /path] - Read a file
[EXEC: command] - Run shell command
[LIST: /path] - List directory
[NOTE: text] - Save a note
[RECALL] - Show saved notes
[TIME] - Get current time

Be concise. Use patterns only when needed.
```

### Tool Definitions

| Tool | Parameters | Description | Safety |
|------|------------|-------------|--------|
| `read_file` | `path: string` | Read file contents | Truncate at 4KB |
| `run_command` | `command: string` | Execute shell command | 30s timeout, 1MB output cap |
| `list_directory` | `path: string` | List directory | Limit 50 entries |
| `save_note` | `content: string` | Save to notes file | Append only |
| `recall_notes` | (none) | Get last 10 notes | Read only |
| `current_time` | (none) | Get current time | Read only |

---

## Testing Plan

### Unit Tests

```typescript
// lite-tools.test.ts
describe('lite-tools', () => {
  describe('read_file', () => {
    it('reads existing file');
    it('truncates large files at 4KB');
    it('handles missing file gracefully');
    it('handles permission denied');
  });
  
  describe('run_command', () => {
    it('executes simple command');
    it('times out after 30 seconds');
    it('captures stderr');
    it('truncates large output');
  });
  
  // ... etc
});
```

### Integration Tests

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Simple chat | "Hello" | Friendly greeting, no tools |
| File read | "What's in /etc/hostname?" | Tool call → file contents → natural response |
| Command exec | "What's my IP address?" | Tool call → ip output → formatted response |
| Save note | "Remember: meeting at 3pm" | Note saved confirmation |
| Recall | "What did I ask you to remember?" | Shows saved notes |
| Multi-step | "List my Downloads and tell me the biggest file" | List → analysis |

### Performance Benchmarks

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Simple chat response | < 3 sec | `time curl ...` |
| Tool call + response | < 5 sec | `time curl ...` (with tool) |
| Memory usage | < 2 GB | `ps aux \| grep ollama` |

---

## Multi-step ReAct Implementation

### Overview

The ReAct (Reasoning + Acting) pattern enables complex query decomposition by allowing the model to:
1. **Think** about what information or actions are needed
2. **Act** by calling one or more tools
3. **Observe** the results
4. **Repeat** until a final answer is formulated

### Configuration

```json5
{
  "plugins": {
    "entries": {
      "gtk-gui": {
        "config": {
          "liteMode": true,
          "liteModeTools": true,
          "liteModeMaxIterations": 8  // Default: 8, Range: 1-20
        }
      }
    }
  }
}
```

### Implementation Details

**Location:** `extensions/gtk-gui/src/monitor.ts` - `callOllamaWithTools()`

**Loop Logic:**
```
while (iteration < maxIterations) {
  1. Send history to model
  2. If model returns tool_calls → execute tools, add results to history, continue
  3. If no tool_calls → model has final answer, break
}
```

**Safety:**
- Default max iterations: 8
- Configurable via `liteModeMaxIterations` (clamped 1-20)
- Graceful fallback message if max iterations exceeded

### Example Multi-step Query

**User:** "What is the current time and save it to /tmp/time.txt?"

**ReAct Loop:**
1. **Iteration 1:** Model calls `current_time()` and `write_file()` in parallel
2. **Iteration 2:** Model synthesizes results into final answer

**Response:** "The current time is Tuesday, February 3, 2026 at 01:27:38 AM GMT, and it has been successfully saved to /tmp/time.txt."

---

## Future Improvements

### Backlog

| Priority | Feature | Description | Status |
|----------|---------|-------------|--------|
| P1 | Web search | DuckDuckGo HTML scraping | ✅ Complete |
| P1 | Write file | Create/update files | ✅ Complete |
| P2 | Clipboard | Read/write system clipboard | ✅ Complete |
| P2 | Reminders | Schedule notifications | ✅ Complete |
| P2 | Calculator | Evaluate math expressions | ✅ Complete |
| P3 | Image OCR | Read text from images | ✅ Complete |
| P3 | Screenshot | Capture screen region | ✅ Complete |
| P3 | Multi-step ReAct | Complex query decomposition | ✅ Complete |

### Security Considerations (For Review)

- [ ] Should commands be sandboxed?
- [ ] Should file access be restricted to certain paths?
- [ ] Should there be a command allowlist/blocklist?
- [ ] How to handle sudo/root commands?
- [ ] Should notes be encrypted?

### Performance Optimizations (For Review)

- [ ] Cache model capability detection
- [ ] Preload model on gateway start
- [ ] Streaming responses for long outputs
- [ ] Batch multiple tool calls

---

## Notes & Observations

### Session Log

| Date | Note |
|------|------|
| 2026-02-02 | Initial research completed. Qwen3:1.7b identified as best small tool-capable model. |
| 2026-02-02 | Created this planning document. |
| 2026-02-03 | Implementation complete! Created lite-tools.ts, updated monitor.ts with native tool calling. |
| 2026-02-03 | Tested: qwen3:1.7b correctly calls tools (current_time, read_file verified). |
| 2026-02-03 | P1 complete: Added web_search (DDG HTML), write_file (64KB max, path safety). |
| 2026-02-03 | P2 complete: clipboard_read/write (Wayland+X11), calculator (safe eval), set_reminder (notify-send). |
| 2026-02-03 | P3 complete: screenshot/screenshot_region (grim+slurp), ocr_image/screenshot_ocr (tesseract). |
| 2026-02-03 | Multi-step ReAct complete: Implemented loop in callOllamaWithTools() with max 8 iterations. Model can now chain multiple tool calls for complex queries. |

### Open Questions

1. **Model choice:** Should we default to qwen3:1.7b or keep llama3.2:1b with pattern fallback?
2. **Tool scope:** Start minimal (6 tools) or include web search from day 1?
3. **Error handling:** How verbose should tool errors be to the user?
4. **History:** Should tool calls be visible in conversation history?

### References

- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama Tool-Capable Models](https://ollama.com/search?c=tools)
- [LLM Powered Autonomous Agents (Lilian Weng)](https://lilianweng.github.io/posts/2023-06-23-agent/)
- [ReAct Prompting Guide](https://www.promptingguide.ai/techniques/react)
- [Qwen3 Model Card](https://ollama.com/library/qwen3)

---

## Appendix: Quick Commands

```bash
# Pull recommended model
ollama pull qwen3:1.7b

# Test tool calling works
curl -s http://127.0.0.1:11434/api/chat -d '{
  "model": "qwen3:1.7b",
  "messages": [{"role": "user", "content": "What time is it?"}],
  "tools": [{
    "type": "function",
    "function": {
      "name": "current_time",
      "description": "Get current time",
      "parameters": {"type": "object", "properties": {}, "required": []}
    }
  }],
  "stream": false
}' | jq .

# Check model is loaded
curl -s http://127.0.0.1:11434/api/ps | jq .

# Benchmark response time
time curl -s http://127.0.0.1:11434/api/chat -d '{
  "model": "qwen3:1.7b",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}' | jq -r '.message.content'
```
