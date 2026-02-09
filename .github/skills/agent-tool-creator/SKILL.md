---
name: agent-tool-creator
description: Guide for implementing new agent tools for ClosedClaw's AI assistant. Use when adding capabilities like web search, file operations, API integrations, or custom actions. Covers tool factory pattern, parameter validation, registration, and testing.
---

# Agent Tool Creator

This skill helps you create new tools that extend ClosedClaw's AI agent capabilities. Tools are implemented as factory functions that return `AnyAgentTool` objects and are registered in tool assembly modules.

## When to Use

- Adding new agent capabilities (web search, file ops, API calls)
- Implementing custom tool logic
- Understanding tool factory patterns
- Setting up tool parameters and validation

## Prerequisites

- Review existing tools in `src/agents/tools/`
- Understand `AnyAgentTool` type from `src/agents/tools/common.ts`
- Familiarize yourself with tool registration in `src/agents/openclaw-tools.ts`

## Step-by-Step Workflow

### 1. Create Tool File

Create `src/agents/tools/my-tool.ts`:

```typescript
import type { ClosedClawConfig } from "../../config/config.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

export type MyToolOptions = {
  config?: ClosedClawConfig;
  agentDir?: string;
  sandboxed?: boolean;
};

export function createMyTool(options?: MyToolOptions): AnyAgentTool {
  return {
    name: "my_tool",
    description: "Clear, concise description of what this tool does and when to use it. The AI uses this to decide when to invoke the tool.",
    parameters: {
      input: {
        type: "string",
        description: "Description of the input parameter",
        required: true,
      },
      mode: {
        type: "string",
        description: "Optional mode parameter",
        required: false,
      },
    },
    handler: async (params) => {
      // Extract and validate parameters
      const input = readStringParam(params, "input", { required: true });
      const mode = readStringParam(params, "mode") ?? "default";
      
      // Implement tool logic
      try {
        const result = await processInput(input, mode);
        
        // Return result
        return jsonResult({
          success: true,
          data: result,
        });
      } catch (error) {
        // Handle errors gracefully
        return jsonResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

async function processInput(input: string, mode: string): Promise<unknown> {
  // Implementation
  return { processed: input, mode };
}
```

### 2. Parameter Helpers

Use helpers from `src/agents/tools/common.ts`:

```typescript
// String parameters
const required = readStringParam(params, "key", { required: true });
const optional = readStringParam(params, "key"); // Returns undefined if not present
const trimmed = readStringParam(params, "key", { trim: true }); // Default behavior
const raw = readStringParam(params, "key", { trim: false });
const allowEmpty = readStringParam(params, "key", { allowEmpty: true });

// String or number parameters
const value = readStringOrNumberParam(params, "key", { required: true });

// Boolean parameters
const enabled = readBooleanParam(params, "enabled", { defaultValue: true });

// Number parameters
const count = readNumberParam(params, "count", { required: true });
const bounded = readNumberParam(params, "count", { min: 0, max: 100 });

// Array parameters
const items = readArrayParam(params, "items", { required: true });
const numbers = readNumberArrayParam(params, "numbers");
```

### 3. Result Helpers

Use result helpers for consistent output:

```typescript
// JSON result
return jsonResult({ key: "value" });

// Text result
return textResult("Plain text response");

// Image result (from file)
return imageResultFromFile({
  path: "/path/to/image.png",
  mimeType: "image/png",
});

// Image result (from data)
return imageResult({
  data: buffer,
  mimeType: "image/png",
});
```

### 4. Register Tool

Add to appropriate assembly module:

**For OpenClaw tools** (`src/agents/openclaw-tools.ts`):

```typescript
import { createMyTool } from "./tools/my-tool.js";

export function createClosedClawTools(options?: {
  config?: ClosedClawConfig;
  agentDir?: string;
  // ... other options
}): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [
    // ... existing tools
    createMyTool({
      config: options?.config,
      agentDir: options?.agentDir,
    }),
  ];
  
  return tools;
}
```

**For Bash tools** (`src/agents/bash-tools.ts`):

```typescript
import { createMyTool } from "./tools/my-tool.js";

export function createBashTools(options?: {
  config?: ClosedClawConfig;
  // ... other options
}): AnyAgentTool[] {
  return [
    // ... existing tools
    createMyTool(options),
  ];
}
```

### 5. Create Tests

Create `src/agents/tools/my-tool.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createMyTool } from "./my-tool.js";

describe("createMyTool", () => {
  it("processes input successfully", async () => {
    const tool = createMyTool();
    
    const result = await tool.handler({
      input: "test input",
      mode: "fast",
    });
    
    expect(result).toEqual({
      type: "json",
      json: {
        success: true,
        data: expect.objectContaining({
          processed: "test input",
          mode: "fast",
        }),
      },
    });
  });
  
  it("requires input parameter", async () => {
    const tool = createMyTool();
    
    await expect(tool.handler({})).rejects.toThrow(/input required/i);
  });
  
  it("handles errors gracefully", async () => {
    const tool = createMyTool();
    
    const result = await tool.handler({
      input: "invalid-input-that-causes-error",
    });
    
    expect(result).toMatchObject({
      type: "json",
      json: {
        success: false,
        error: expect.any(String),
      },
    });
  });
  
  it("uses default mode when not specified", async () => {
    const tool = createMyTool();
    
    const result = await tool.handler({ input: "test" });
    
    expect(result).toMatchObject({
      type: "json",
      json: {
        data: expect.objectContaining({ mode: "default" }),
      },
    });
  });
});
```

### 6. Add Documentation

Create `docs/tools/my-tool.md`:

```markdown
# My Tool

Description of what the tool does and when to use it.

## Parameters

- `input` (string, required): Description of input
- `mode` (string, optional): Description of mode options

## Examples

### Basic Usage

\`\`\`typescript
const tool = createMyTool();
const result = await tool.handler({ input: "test" });
\`\`\`

### With Options

\`\`\`typescript
const tool = createMyTool({
  config: myConfig,
  agentDir: "/path/to/agent",
});
\`\`\`

## Configuration

Respects these config options:
- `myTool.enabled`: Enable/disable tool
- `myTool.mode`: Default mode

## Error Handling

Returns errors in result object:
\`\`\`json
{
  "success": false,
  "error": "Error message"
}
\`\`\`
```

### 7. Test Integration

```bash
# Run tool tests
pnpm test -- src/agents/tools/my-tool.test.ts

# Run with specific test case
pnpm test -- src/agents/tools/my-tool.test.ts -t "processes input"

# Watch mode during development
pnpm test:watch -- src/agents/tools/my-tool.test.ts

# Full test suite
pnpm build && pnpm check && pnpm test
```

## Common Patterns

### Config-Based Gating

```typescript
export function createMyTool(options?: MyToolOptions): AnyAgentTool | null {
  const config = options?.config;
  
  // Return null to disable tool
  if (!config?.myTool?.enabled) {
    return null;
  }
  
  return {
    name: "my_tool",
    // ... tool implementation
  };
}
```

### Action Gating

```typescript
import { createActionGate } from "./common.js";

export function createMyTool(options?: MyToolOptions): AnyAgentTool {
  const actions = options?.config?.myTool?.actions;
  const can = createActionGate(actions);
  
  return {
    name: "my_tool",
    handler: async (params) => {
      if (!can("perform_action", true)) {
        return jsonResult({ error: "Action not allowed" });
      }
      // ... implementation
    },
  };
}
```

### File Operations

```typescript
import fs from "node:fs/promises";
import path from "node:path";

// Safe file reading
const content = await fs.readFile(filePath, "utf-8");

// Safe file writing with temp + atomic rename
const tempPath = `${targetPath}.tmp`;
await fs.writeFile(tempPath, content, "utf-8");
await fs.rename(tempPath, targetPath);

// Directory operations
await fs.mkdir(dirPath, { recursive: true });
const files = await fs.readdir(dirPath);
```

### Sandbox Safety

```typescript
export function createMyTool(options?: MyToolOptions): AnyAgentTool {
  const sandboxed = options?.sandboxed ?? false;
  
  return {
    name: "my_tool",
    handler: async (params) => {
      if (sandboxed) {
        // Restrict operations in sandbox mode
        return jsonResult({ error: "Not available in sandbox" });
      }
      // ... normal implementation
    },
  };
}
```

### Async Operations

```typescript
// Use AbortSignal for cancellation
handler: async (params, context) => {
  const controller = new AbortController();
  
  try {
    const result = await fetch(url, { signal: controller.signal });
    return jsonResult({ data: await result.json() });
  } catch (error) {
    if (error.name === "AbortError") {
      return jsonResult({ error: "Operation cancelled" });
    }
    throw error;
  }
}
```

## Tool Types and Use Cases

### Information Retrieval
- Web search, API queries, database lookups
- Return `jsonResult()` with structured data
- Example: `web-search.ts`, `web-fetch.ts`

### Action/Command
- File operations, system commands, external services
- Return `jsonResult()` with success/error status
- Example: `bash-tools.exec.ts`, `message-tool.ts`

### Transformation
- Data processing, format conversion, analysis
- Return `jsonResult()` or `textResult()`
- Example: `image-tool.ts`, `canvas-tool.ts`

### Session Management
- Agent spawning, session control, state management
- Return `jsonResult()` with session info
- Example: `sessions-spawn-tool.ts`, `sessions-send-tool.ts`

## Reference Implementations

- **Simple tool**: `src/agents/tools/agents-list-tool.ts`
- **Config gating**: `src/agents/tools/memory-tool.ts`
- **Action gating**: `src/agents/tools/web-tools.ts`
- **File operations**: `src/agents/tools/image-tool.ts`
- **External API**: `src/agents/tools/web-fetch.ts`
- **Session management**: `src/agents/tools/sessions-spawn-tool.ts`

## Checklist

- [ ] Tool file created (`src/agents/tools/my-tool.ts`)
- [ ] Factory function implements `AnyAgentTool` return type
- [ ] Clear `description` explains when to use tool
- [ ] Parameters defined with descriptions and required flags
- [ ] Parameter validation uses helper functions
- [ ] Handler implements error handling
- [ ] Results use appropriate helper (jsonResult, textResult, etc.)
- [ ] Tool registered in assembly module (`openclaw-tools.ts` or `bash-tools.ts`)
- [ ] Test file created (`src/agents/tools/my-tool.test.ts`)
- [ ] Tests cover success, errors, edge cases
- [ ] Tests verify parameter validation
- [ ] Documentation added (`docs/tools/my-tool.md`)
- [ ] Config options documented (if any)
- [ ] Integration tested with agent

## Troubleshooting

**Tool not showing up**: Check registration in `createClosedClawTools()` or `createBashTools()`

**Parameter validation failing**: Use correct helper function and check `required` flag

**Tests failing**: Ensure mock data matches expected types, check async/await

**Tool not invoked**: Make `description` more specific about when to use

**Type errors**: Import types from `common.ts` and ensure correct return type

## Related Files

- `src/agents/tools/common.ts` - Tool types and helpers
- `src/agents/openclaw-tools.ts` - OpenClaw tool assembly
- `src/agents/bash-tools.ts` - Bash tool assembly
- `src/config/types.ts` - Config types for tool options
- `docs/tools/` - Tool documentation
