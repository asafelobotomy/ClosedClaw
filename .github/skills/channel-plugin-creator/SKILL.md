---
name: channel-plugin-creator
description: Guide for creating new messaging channel plugins/extensions for ClosedClaw. Use when adding support for new messaging platforms (e.g., Matrix, Teams, BlueBubbles). Covers plugin structure, CliDeps extension, routing setup, and testing.
---

# Channel Plugin Creator

This skill helps you create new messaging channel plugins for ClosedClaw. Each channel is implemented as an extension under `extensions/` that registers via the plugin API.

## When to Use

- Adding a new messaging platform (WhatsApp, Telegram, Discord, Slack, Signal, etc.)
- Creating a channel extension from scratch
- Understanding channel plugin architecture
- Setting up routing and dependency injection for a channel

## Prerequisites

- Understand TypeScript and ESM modules
- Review existing channel plugins in `extensions/{telegram,discord,slack,signal}/`
- Familiarize yourself with `src/cli/deps.ts` and `src/routing/`

## Step-by-Step Workflow

### 1. Create Extension Structure

```bash
# Create extension directory
mkdir -p extensions/my-channel

# Create package.json
cat > extensions/my-channel/package.json << 'EOF'
{
  "name": "@closedclaw/my-channel",
  "version": "1.0.0",
  "type": "module",
  "devDependencies": {
    "closedclaw": "workspace:*"
  },
  "closedclaw": {
    "extensions": ["./index.ts"]
  }
}
EOF

# Create plugin manifest
cat > extensions/my-channel/ClosedClaw.plugin.json << 'EOF'
{
  "id": "my-channel",
  "version": "1.0.0",
  "description": "My Channel integration for ClosedClaw",
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable My Channel integration"
      },
      "botToken": {
        "type": "string",
        "description": "Bot authentication token"
      }
    }
  },
  "uiHints": {
    "botToken": {
      "sensitive": true,
      "label": "Bot Token"
    }
  }
}
EOF
```

### 2. Implement Plugin Registration

Create `extensions/my-channel/index.ts`:

```typescript
import type { ClosedClawPluginApi } from "closedclaw/plugin-sdk";
import type { ChannelPlugin } from "closedclaw/plugin-sdk";

export function register(api: ClosedClawPluginApi) {
  const channel: ChannelPlugin = {
    id: "my-channel",
    name: "My Channel",
    
    // Implement required channel methods
    async start(config) {
      // Initialize channel connection
      console.log("Starting My Channel...");
    },
    
    async stop() {
      // Clean up resources
      console.log("Stopping My Channel...");
    },
    
    async sendMessage(params) {
      // Send message implementation
      const { to, message } = params;
      // ... send logic
    },
    
    async getStatus() {
      return {
        connected: true,
        accountId: "user-id",
      };
    },
  };
  
  api.registerChannel(channel);
}
```

### 3. Extend CliDeps

Add your channel to `src/cli/deps.ts`:

```typescript
// 1. Import send function
import { sendMessageMyChannel } from "../my-channel/send.js";

// 2. Add to CliDeps type
export type CliDeps = {
  // ... existing channels
  sendMessageMyChannel: typeof sendMessageMyChannel;
};

// 3. Register in createDefaultDeps()
export function createDefaultDeps(): CliDeps {
  return {
    // ... existing channels
    sendMessageMyChannel,
  };
}

// 4. Add to createOutboundSendDeps()
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return {
    // ... existing channels
    sendMyChannel: deps.sendMessageMyChannel,
  };
}
```

### 4. Implement Send Function

Create `extensions/my-channel/send.ts`:

```typescript
import type { ClosedClawConfig } from "closedclaw/plugin-sdk";

export async function sendMessageMyChannel(params: {
  to: string;
  message: string;
  config?: ClosedClawConfig;
}): Promise<void> {
  const { to, message, config } = params;
  
  // Validate config
  const channelConfig = config?.myChannel;
  if (!channelConfig?.enabled) {
    throw new Error("My Channel is not enabled in config");
  }
  
  // Send message logic
  console.log(`Sending to ${to}: ${message}`);
  
  // ... implementation
}
```

### 5. Add Routing Support

Update `src/routing/` to handle your channel's message format and session keys.

Session key format: `agent:<agentId>:<channel>:<kind>:<peerId>`
- Channel: `"my-channel"`
- Kind: `"dm"` | `"group"` | `"channel"`
- PeerId: Platform-specific identifier

### 6. Add Tests

Create `extensions/my-channel/send.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sendMessageMyChannel } from "./send.js";

describe("sendMessageMyChannel", () => {
  it("sends message successfully", async () => {
    const params = {
      to: "test-user-id",
      message: "Hello from test",
      config: {
        myChannel: { enabled: true, botToken: "test-token" },
      },
    };
    
    await expect(sendMessageMyChannel(params)).resolves.toBeUndefined();
  });
  
  it("throws when channel disabled", async () => {
    const params = {
      to: "test-user-id",
      message: "Test",
      config: { myChannel: { enabled: false } },
    };
    
    await expect(sendMessageMyChannel(params)).rejects.toThrow(/not enabled/);
  });
});
```

### 7. Update Documentation

1. Create `docs/channels/my-channel.md` with setup instructions
2. Update `.github/labeler.yml` for PR labeling
3. Add channel to README and overview docs
4. Document config schema and authentication flow

### 8. Update UI Surfaces

1. **Web UI**: Add channel status and config forms
2. **macOS App**: Add channel management UI
3. **Mobile**: Update channel list (if applicable)

### 9. Test Integration

```bash
# Run channel tests
pnpm test -- extensions/my-channel

# Run full test suite
pnpm build && pnpm check && pnpm test

# Test with real config
pnpm closedclaw gateway --verbose

# Check channel status
pnpm closedclaw channels status
```

## Common Patterns

### Authentication
- OAuth tokens: Store in `~/.closedclaw/credentials/my-channel/`
- Sessions: Store in `~/.closedclaw/sessions/my-channel/`
- Config keys: Use `configSchema` in `ClosedClaw.plugin.json`

### Message Handling
- Direct messages: `kind: "dm"`, `peerId: userId`
- Groups/channels: `kind: "group"`, `peerId: groupId`
- Threads: Use routing layer for session isolation

### Error Handling
- Create custom error class extending `Error`
- Reference pattern in `src/discord/send.types.ts` and `src/media/fetch.ts`

## Reference Implementations

- **Telegram**: `extensions/telegram/` (bot-based, long polling)
- **Discord**: `extensions/discord/` (bot commands, slash commands)
- **Slack**: `extensions/slack/` (socket mode, event subscriptions)
- **Signal**: `extensions/signal/` (CLI integration)

## Checklist

- [ ] Extension structure created (`extensions/my-channel/`)
- [ ] `package.json` with correct `devDependencies`
- [ ] `ClosedClaw.plugin.json` with `id` and `configSchema`
- [ ] `index.ts` with `register()` function
- [ ] Channel plugin implements required interface
- [ ] `CliDeps` extended in `src/cli/deps.ts`
- [ ] `createDefaultDeps()` registers send function
- [ ] `createOutboundSendDeps()` maps channel
- [ ] Send function implemented with error handling
- [ ] Routing logic handles channel's message format
- [ ] Tests cover send, status, error cases
- [ ] Documentation added (`docs/channels/my-channel.md`)
- [ ] UI surfaces updated (web, macOS, mobile)
- [ ] `.github/labeler.yml` updated
- [ ] Integration tested with gateway

## Troubleshooting

**Plugin not loading**: Check `ClosedClaw.plugin.json` is valid JSON and in correct location

**Send function not found**: Verify export in `src/cli/deps.ts` and function signature matches

**Config validation failing**: Run `closedclaw doctor` to check config schema

**Tests failing**: Ensure Vitest config includes extension tests (`vitest.extensions.config.ts`)

## Related Files

- `src/cli/deps.ts` - Dependency injection
- `src/routing/resolve-route.ts` - Session routing
- `src/plugins/types.ts` - Plugin API types
- `src/channels/plugins/types.ts` - Channel plugin interface
- `docs/channels/` - Channel documentation
