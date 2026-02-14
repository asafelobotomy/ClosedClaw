# Channel Architecture: Core vs Extensions

**Date**: February 9, 2026  
**Status**: Documentation  
**Related**: Repository Reorganization - Phase 3

## Executive Summary

ClosedClaw channels exist in **both** `src/` and `extensions/` directories. This is **intentional architecture**, not duplication.

- **`src/<channel>/`** = Core implementation (heavy logic, API clients, state management)
- **`extensions/<channel>/`** = Plugin wrapper (registration, runtime bridge)

This separation enables:

- ✅ **Clean plugin interface** while keeping core tightly coupled
- ✅ **Runtime isolation** between core and extensions
- ✅ **Plugin SDK exports** without circular dependencies

## Current Structure

### Core Channel Implementations (`src/`)

**Location**: Root `src/` directory (8 channels)

```
src/
├── discord/          # Discord Bot API implementation
├── telegram/         # Telegram Bot API implementation
├── slack/            # Slack Socket Mode implementation
├── signal/           # Signal (signal-cli) implementation
├── imessage/         # iMessage (imsg CLI) implementation
├── whatsapp/         # WhatsApp (moved to web/)
├── line/             # LINE Messaging API implementation
└── web/              # WhatsApp Web implementation
```

**Responsibilities**:

- API client creation and management (Bot instances, HTTP clients)
- Message sending/receiving logic
- Authentication and session management
- Platform-specific protocol handling
- Configuration validation and account resolution
- Directory/contact management
- Status probes and health checks
- Message action handlers (send, react, edit, delete)

**Key Characteristics**:

- Heavy, stateful implementations
- Direct dependencies on core modules (`config`, `routing`, `logging`, `infra`)
- Exported via `src/plugin-sdk/index.ts` for extension use
- Tightly coupled to `PluginRuntime`

**Example**: `src/telegram/bot.ts`

```typescript
import { Bot } from "grammy";
import type { ClosedClawConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { resolveAgentRoute } from "../routing/resolve-route.js";
import { resolveTelegramAccount } from "./accounts.js";

// Heavy implementation: 513 lines
// - Bot client management
// - Update handlers
// - Message processing
// - Error handling
```

### Extension Channel Plugins (`extensions/`)

**Location**: Extension workspace packages (7 matching channels)

```
extensions/
├── discord/          # Discord plugin wrapper
├── telegram/         # Telegram plugin wrapper
├── slack/            # Slack plugin wrapper
├── signal/           # Signal plugin wrapper
├── imessage/         # iMessage plugin wrapper
├── whatsapp/         # WhatsApp plugin wrapper
└── line/             # LINE plugin wrapper
```

**Responsibilities**:

- Plugin registration via `ClosedClawPluginApi`
- Runtime bridge setup (`setXYZRuntime()`)
- Channel plugin interface implementation
- Metadata and configuration schema
- Delegating to core implementation

**Key Characteristics**:

- Thin, stateless wrappers (~100-200 lines)
- Single dependency: `closedclaw/plugin-sdk`
- Runtime isolation: imports from SDK, not from `../../src/`
- Plugin lifecycle: `register(api) { ... }`

**Example**: `extensions/telegram/index.ts`

```typescript
import type { ClosedClawPluginApi } from "closedclaw/plugin-sdk";
import { telegramPlugin } from "./src/channel.js";
import { setTelegramRuntime } from "./src/runtime.js";

const plugin = {
  id: "telegram",
  name: "Telegram",
  description: "Telegram channel plugin",
  register(api: ClosedClawPluginApi) {
    setTelegramRuntime(api.runtime); // Bridge runtime
    api.registerChannel({ plugin: telegramPlugin }); // Register plugin
  },
};

export default plugin;
```

**Example**: `extensions/telegram/src/channel.ts`

```typescript
import { getChatChannelMeta, type ChannelPlugin } from "closedclaw/plugin-sdk";
import { getTelegramRuntime } from "./runtime.js";

export const telegramPlugin: ChannelPlugin = {
  id: "telegram",
  meta: getChatChannelMeta("telegram"),

  // Delegate to core implementation via runtime
  actions: {
    listActions: (ctx) => getTelegramRuntime().channel.telegram.messageActions.listActions(ctx),
    handleAction: async (ctx) =>
      await getTelegramRuntime().channel.telegram.messageActions.handleAction(ctx),
  },

  // More delegation to core...
};
```

**Example**: `extensions/telegram/src/runtime.ts`

```typescript
import type { PluginRuntime } from "closedclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setTelegramRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getTelegramRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Telegram runtime not initialized");
  return runtime;
}
```

## Data Flow

### 1. Plugin Registration

```
extensions/telegram/index.ts
  ↓ exports default plugin
Gateway loads plugin
  ↓ calls plugin.register(api)
setTelegramRuntime(api.runtime)  ← Runtime bridge
api.registerChannel({ plugin: telegramPlugin })  ← Plugin registration
```

### 2. Inbound Message (Telegram → Agent)

```
Telegram API → src/telegram/bot.ts (Bot client receives update)
  ↓ processMessage()
src/telegram/bot-message.ts (Parse message, extract text)
  ↓ resolveAgentRoute()
src/routing/resolve-route.ts (Determine agent + session)
  ↓ route to agent
Agent processes message
```

### 3. Outbound Message (Agent → Telegram)

```
Agent tool call: { name: "telegram_send", params: {...} }
  ↓ tool handler
extensions/telegram/src/channel.ts (Plugin action adapter)
  ↓ getTelegramRuntime().channel.telegram.sendMessageTelegram()
src/telegram/send.ts (Core implementation)
  ↓ bot.api.sendMessage()
Telegram API
```

### 4. Configuration Access

```
Extension reads config:
  getTelegramRuntime().config.loadConfig()
    ↓ plugin-sdk export
  src/config/config.ts (loadConfig)
    ↓ read ~/.closedclaw/config.json5
  Return: ClosedClawConfig
```

## Plugin SDK Bridge

**File**: `src/plugin-sdk/index.ts`

The Plugin SDK exports core channel functions for extension use:

```typescript
// telegram exports
export {
  listTelegramAccountIds,
  resolveDefaultTelegramAccountId,
  resolveTelegramAccount,
  type ResolvedTelegramAccount,
} from "../telegram/accounts.js";

export { telegramOnboardingAdapter } from "../channels/plugins/onboarding/telegram.js";
export { normalizeTelegramMessagingTarget } from "../channels/plugins/normalize/telegram.js";
export { collectTelegramStatusIssues } from "../channels/plugins/status-issues/telegram.js";

// Similar exports for discord, slack, signal, imessage, whatsapp, line...
```

Extensions import via:

```typescript
import {
  resolveTelegramAccount,
  telegramOnboardingAdapter,
  type ClosedClawPluginApi,
} from "closedclaw/plugin-sdk";
```

## Why This Architecture?

### ✅ Benefits

1. **Runtime Isolation**
   - Extensions don't have `../../src/` imports
   - Clean plugin SDK boundary
   - Easier to reason about plugin dependencies

2. **Plugin Interface**
   - Extensions implement `ChannelPlugin` interface
   - Uniform registration via `api.registerChannel()`
   - Gateway can load/unload plugins dynamically

3. **Core Coupling**
   - Core implementations tightly coupled to `PluginRuntime`
   - Direct access to config, logging, routing, infra
   - No need to pass context through plugin API

4. **Code Organization**
   - Clear separation: implementation vs interface
   - Extensions are thin (100-200 lines)
   - Core is focused (message handling, not plugin ceremony)

5. **Backwards Compatibility**
   - Existing `src/` code doesn't need refactoring
   - Plugin wrappers added incrementally
   - No breaking changes to core APIs

### ❌ Alternative Rejected: Move All Channels to Extensions

**Why Not?**

- Breaking change: would require massive refactoring of `src/`
- Core modules deeply depend on channel implementations
- Loss of tight coupling benefits (direct config/logging access)
- Increased complexity in extension packages (dependencies)
- Runtime would need to import from extensions (circular)

**From Proposal**:

> **Option B**: Keep as-is with clear documentation
>
> - Document that core channel implementations stay in `src/`
> - Extensions in `extensions/` are plugin wrappers
>
> **Recommendation**: **Option B** - Document the pattern, avoid breaking changes

## File Organization Patterns

### Core Channel Module (`src/<channel>/`)

**Typical structure**:

```
src/telegram/
├── accounts.ts           # Account resolution
├── api-logging.ts        # API error logging
├── bot.ts                # Main Bot client (heavy)
├── bot-handlers.ts       # Update handlers
├── bot-message.ts        # Message processing
├── bot-native-commands.ts # Native commands
├── bot-updates.ts        # Update deduplication
├── fetch.ts              # Fetch adapter
├── inline-buttons.ts     # Inline keyboard support
├── monitor.ts            # Provider monitoring
├── send.ts               # Send message implementation
├── sent-message-cache.ts # Sent message tracking
└── bot/
    ├── helpers.ts        # Telegram-specific utilities
    └── types.ts          # Bot types
```

**Size**: 2000-5000 lines total per channel

### Extension Plugin (`extensions/<channel>/`)

**Typical structure**:

```
extensions/telegram/
├── package.json          # Plugin metadata
├── index.ts              # Plugin entry (register)
└── src/
    ├── channel.ts        # ChannelPlugin implementation
    └── runtime.ts        # Runtime bridge
```

**Size**: 100-300 lines total per plugin

## Adding a New Channel

**1. Create Core Implementation** (`src/<channel>/`)

```bash
mkdir -p src/newchannel
# Implement: accounts.ts, bot.ts, send.ts, monitor.ts
```

**2. Export from Plugin SDK** (`src/plugin-sdk/index.ts`)

```typescript
// Channel: NewChannel
export {
  listNewChannelAccountIds,
  resolveNewChannelAccount,
  type ResolvedNewChannelAccount,
} from "../newchannel/accounts.js";
```

**3. Create Extension Plugin** (`extensions/newchannel/`)

```bash
mkdir -p extensions/newchannel/src
# Create: index.ts, src/channel.ts, src/runtime.ts, package.json
```

**4. Register in Core**

- Add to `src/channels/registry.ts` (CHAT_CHANNEL_ORDER, CHAT_CHANNEL_META)
- Add to `src/channels/dock.ts` (DOCKS)
- Add to `src/plugins/runtime/index.ts` (channel runtime methods)

**5. Update Configuration**

- Add to `src/config/types.channels.ts` (ChannelsConfig)
- Add Zod schema to `src/config/zod-schema.ts`
- Add to plugin auto-enable logic

See: [Channel Plugin Creator Skill](/.github/skills/channel-plugin-creator/SKILL.md)

## Channel Coverage

### Channels with Core + Extension (7)

| Channel  | Core (`src/`)   | Extension (`extensions/`) | Status    |
| -------- | --------------- | ------------------------- | --------- |
| Discord  | `src/discord/`  | `extensions/discord/`     | ✅ Active |
| Telegram | `src/telegram/` | `extensions/telegram/`    | ✅ Active |
| Slack    | `src/slack/`    | `extensions/slack/`       | ✅ Active |
| Signal   | `src/signal/`   | `extensions/signal/`      | ✅ Active |
| iMessage | `src/imessage/` | `extensions/imessage/`    | ✅ Active |
| WhatsApp | `src/web/`      | `extensions/whatsapp/`    | ✅ Active |
| LINE     | `src/line/`     | `extensions/line/`        | ✅ Active |

### Extension-Only Channels (13)

These channels are implemented purely as plugins without core implementations:

| Channel        | Location                     | Type                   |
| -------------- | ---------------------------- | ---------------------- |
| BlueBubbles    | `extensions/bluebubbles/`    | iMessage proxy         |
| Google Chat    | `extensions/googlechat/`     | Google Workspace       |
| Matrix         | `extensions/matrix/`         | Federated chat         |
| Mattermost     | `extensions/mattermost/`     | Open-source team chat  |
| MS Teams       | `extensions/msteams/`        | Microsoft Teams        |
| Nextcloud Talk | `extensions/nextcloud-talk/` | Nextcloud messaging    |
| Nostr          | `extensions/nostr/`          | Decentralized protocol |
| Tlon           | `extensions/tlon/`           | Urbit messaging        |
| Twitch         | `extensions/twitch/`         | Live streaming chat    |
| Voice Call     | `extensions/voice-call/`     | Voice assistant        |
| Web UI         | `extensions/web/`            | Browser interface      |
| Zalo           | `extensions/zalo/`           | Vietnamese messenger   |
| ZaloUser       | `extensions/zalouser/`       | Zalo user mode         |

## Maintenance Guidelines

### When Core Implementation Changes

1. **Update `src/<channel>/`** with new functionality
2. **Export from Plugin SDK** (`src/plugin-sdk/index.ts`) if new public API
3. **Extension may need updates** only if plugin interface changes
4. **Test both** core and extension integration

### When Plugin Interface Changes

1. **Update `src/channels/plugins/types.ts`** (ChannelPlugin interface)
2. **Update all channel extensions** implementing new interface
3. **Maintain backwards compatibility** when possible
4. **Document in CHANGELOG** as breaking change if needed

### Adding New Plugin Capabilities

1. **Define in plugin types** (`src/channels/plugins/types.ts`)
2. **Implement in core** (`src/<channel>/`)
3. **Export from SDK** (`src/plugin-sdk/index.ts`)
4. **Extension delegates** to runtime
5. **Document** in channel docs (`docs/channels/<channel>.md`)

## Common Questions

**Q: Why not consolidate everything into `extensions/`?**  
A: Core implementations are tightly coupled to runtime internals. Extensions are designed for loose coupling.

**Q: Is the code duplicated between `src/` and `extensions/`?**  
A: No. Extensions are thin wrappers (~100 lines). Core is heavy implementation (~3000 lines).

**Q: When should I add to `src/` vs `extensions/`?**  
A: New channels typically start in `extensions/`. Move to `src/` only if deep core integration is needed.

**Q: Can I add a channel without touching `src/`?**  
A: Yes! Extension-only channels (like Twitch, Tlon, Matrix) don't need `src/` implementations.

**Q: Why does `.github/labeler.yml` reference both locations?**  
A: Labels trigger on changes to either core implementation or extension wrapper.

## Related Documentation

- [Repository Reorganization Proposal](./REPOSITORY-REORGANIZATION-PROPOSAL.md) - Overall structure plan
- [Phase 1 Complete](./PHASE-1-COMPLETE.md) - Scripts reorganization
- [Phase 2 Complete](./PHASE-2-COMPLETE.md) - Test utilities consolidation
- [Channel Plugin Creator Skill](/.github/skills/channel-plugin-creator/SKILL.md) - How to add channels
- [Plugin Development Guide](../plugin.md) - Extension development
- [Copilot Instructions](/.github/copilot-instructions.md) - Development workflow

---

**Architecture Status**: ✅ Documented (February 9, 2026)  
**Phase 3 Decision**: Keep current structure, document pattern (no migration needed)
