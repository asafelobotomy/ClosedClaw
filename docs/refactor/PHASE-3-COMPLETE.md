# Phase 3 Complete: Channel Architecture Documentation

**Date**: February 9, 2026  
**Phase**: Repository Reorganization - Phase 3

## ✅ Phase Complete (via Documentation)

Successfully analyzed and documented the channel architecture. **No migration needed** - the current structure is intentional and correct.

### Key Finding

Channels exist in **both** `src/` and `extensions/` directories by design:

| Location                | Role                    | Size        | Purpose                                    |
| ----------------------- | ----------------------- | ----------- | ------------------------------------------ |
| `src/<channel>/`        | **Core Implementation** | ~3000 lines | API clients, message handling, heavy logic |
| `extensions/<channel>/` | **Plugin Wrapper**      | ~100 lines  | Registration layer, delegates to core      |

This is **not duplication** - it's a deliberate architectural pattern for runtime isolation and clean plugin interfaces.

## 📊 Channel Coverage

### Channels with Core + Extension (7)

| Channel  | Core Location   | Extension Location     | Lines (Core) | Lines (Ext) |
| -------- | --------------- | ---------------------- | ------------ | ----------- |
| Discord  | `src/discord/`  | `extensions/discord/`  | ~3000        | ~120        |
| Telegram | `src/telegram/` | `extensions/telegram/` | ~3500        | ~150        |
| Slack    | `src/slack/`    | `extensions/slack/`    | ~2500        | ~140        |
| Signal   | `src/signal/`   | `extensions/signal/`   | ~2000        | ~130        |
| iMessage | `src/imessage/` | `extensions/imessage/` | ~1800        | ~110        |
| WhatsApp | `src/web/`      | `extensions/whatsapp/` | ~4000        | ~160        |
| LINE     | `src/line/`     | `extensions/line/`     | ~1500        | ~100        |

**Total**: ~20,300 lines of core implementation vs ~910 lines of plugin wrappers (95% in core, 5% in extensions)

### Extension-Only Channels (13)

These are pure plugins without core `src/` implementations:

- BlueBubbles, Google Chat, Matrix, Mattermost, MS Teams
- Nextcloud Talk, Nostr, Tlon, Twitch, Voice Call
- Web UI, Zalo, ZaloUser

## 🏗️ Architecture Pattern

### Core Implementation (`src/<channel>/`)

**Example**: `src/telegram/` (3500 lines)

```
src/telegram/
├── accounts.ts              # Account resolution & validation
├── api-logging.ts           # API error logging
├── bot.ts                   # Main Bot client (513 lines)
├── bot-handlers.ts          # Message/update handlers
├── bot-message.ts           # Message processing pipeline
├── bot-native-commands.ts   # Native /command support
├── bot-updates.ts           # Update deduplication
├── fetch.ts                 # Fetch adapter
├── inline-buttons.ts        # Inline keyboard support
├── monitor.ts               # Provider health monitoring
├── send.ts                  # Send message implementation
├── sent-message-cache.ts    # Sent message tracking
└── bot/
    ├── helpers.ts           # Telegram-specific utilities
    └── types.ts             # Bot type definitions
```

**Characteristics**:

- Heavy, stateful implementations
- Direct dependencies on core modules (config, routing, logging, infra)
- Tightly coupled to PluginRuntime
- Exported via `src/plugin-sdk/index.ts`

### Extension Wrapper (`extensions/<channel>/`)

**Example**: `extensions/telegram/` (150 lines)

```
extensions/telegram/
├── package.json             # Plugin metadata
├── index.ts                 # Plugin registration (30 lines)
└── src/
    ├── channel.ts           # ChannelPlugin implementation (100 lines)
    └── runtime.ts           # Runtime bridge (20 lines)
```

**Characteristics**:

- Thin, stateless wrappers
- Single dependency: `closedclaw/plugin-sdk`
- Delegates all work to core via runtime
- Plugin lifecycle management

## 🔄 Data Flow Example

### Outbound Message (Agent → Telegram)

```
1. Agent tool call
   { name: "telegram_send", params: { chat_id: "...", text: "..." } }
   ↓

2. Extension (plugin action adapter)
   extensions/telegram/src/channel.ts
   telegramPlugin.actions.handleAction(ctx)
   ↓

3. Runtime bridge
   getTelegramRuntime().channel.telegram.messageActions.handleAction(ctx)
   ↓

4. Core implementation
   src/telegram/send.ts
   sendMessageTelegram(chatId, text)
   ↓

5. API client
   bot.api.sendMessage(chatId, text)
   ↓

6. Telegram API
```

### Inbound Message (Telegram → Agent)

```
1. Telegram API
   → Update received
   ↓

2. Core bot client
   src/telegram/bot.ts
   Bot receives update via polling/webhook
   ↓

3. Message processing
   src/telegram/bot-message.ts
   Parse message, extract text, resolve sender
   ↓

4. Routing
   src/routing/resolve-route.ts
   Determine agent + session based on bindings
   ↓

5. Agent runtime
   Process message, generate response
```

## ✅ Benefits Realized

1. **No Breaking Changes**
   - Existing code untouched
   - No import path updates needed
   - No risk of regression

2. **Clear Mental Model**
   - Developers now understand why channels exist in both places
   - Documentation explains core vs extension responsibilities
   - Adding new channels follows documented pattern

3. **Improved Onboarding**
   - New contributors can read architecture docs
   - Pattern is now explicit, not implicit
   - Channel Plugin Creator skill updated

4. **Runtime Isolation**
   - Extensions don't have `../../src/` imports
   - Clean plugin SDK boundary
   - Plugin dependencies isolated from core

5. **Maintainability**
   - Clear separation of concerns
   - Extensions are thin (easy to review)
   - Core is focused (no plugin ceremony)

## 📝 Documentation Created

### [CHANNEL-ARCHITECTURE.md](./CHANNEL-ARCHITECTURE.md)

Comprehensive architecture documentation covering:

- **Executive Summary**: Core vs extensions pattern
- **Current Structure**: All 7 core channels + 13 extension-only channels
- **Responsibilities**: What belongs in core vs extensions
- **Data Flow**: Inbound/outbound message lifecycle
- **Plugin SDK Bridge**: How extensions access core functionality
- **Why This Architecture**: Benefits analysis
- **File Organization Patterns**: Typical structure examples
- **Adding a New Channel**: Step-by-step guide
- **Maintenance Guidelines**: When to update core vs extensions
- **Common Questions**: FAQ for developers

**Size**: 480 lines of comprehensive documentation

## 🎯 Decision Summary

### Original Proposal Options

**Option A**: Move all channels to `extensions/` (Rejected)

- Would be massive breaking change
- Loss of tight coupling benefits
- Increased extension complexity
- Runtime circular dependencies

**Option B**: Keep as-is, document the pattern ✅ **Selected**

- No breaking changes
- Preserves architectural benefits
- Improves developer understanding
- Enables informed future decisions

### Why Option B Won

1. ✅ Current architecture is sound (not technical debt)
2. ✅ Separation serves clear purpose (core vs interface)
3. ✅ No user-facing impact
4. ✅ Documentation solves confusion issue
5. ✅ Enables future optimization without rush

## 🔗 Integration with Development Workflow

### Copilot Instructions Updated

`.github/copilot-instructions.md` now references:

```markdown
**Channel Development Pattern**: Core implementations in `src/` with plugin wrappers
in `extensions/`. See docs/refactor/CHANNEL-ARCHITECTURE.md for architecture details.
```

### Channel Plugin Creator Skill

`.github/skills/channel-plugin-creator/SKILL.md` now includes reference to architecture docs.

### Labeler Configuration

`.github/labeler.yml` correctly labels PRs touching either core or extension:

```yaml
"channel: telegram":
  - changed-files:
      - any-glob-to-any-file:
          - "src/telegram/**"
          - "extensions/telegram/**"
          - "docs/channels/telegram.md"
```

## 📚 Related Documentation

- [Repository Reorganization Proposal](./REPOSITORY-REORGANIZATION-PROPOSAL.md) - Overall plan
- [Phase 1 Complete](./PHASE-1-COMPLETE.md) - Scripts → tools reorganization
- [Phase 2 Complete](./PHASE-2-COMPLETE.md) - Test utilities consolidation
- [Channel Architecture](./CHANNEL-ARCHITECTURE.md) - Comprehensive architecture docs
- [Channel Plugin Creator Skill](/.github/skills/channel-plugin-creator/SKILL.md) - Adding channels

## 💡 Lessons Learned

1. **Not all "inconsistency" is a problem**: Sometimes apparent duplication is intentional design
2. **Documentation > Migration**: Explaining existing patterns often better than changing them
3. **Analyze before acting**: Deep dive revealed sound architecture, not technical debt
4. **Preserve working systems**: Don't fix what isn't broken
5. **Improve understanding**: Documentation makes implicit patterns explicit

## 🚀 Future Recommendations

### Short Term

- ✅ Keep current architecture (already working well)
- ✅ Reference architecture docs in onboarding
- ✅ Use pattern for new channels

### Long Term (Optional)

- Consider whether new channels need core implementations
- Evaluate if extension-only pattern can handle more use cases
- Monitor for true architectural issues vs perceived ones

## 📂 Final Structure

```
src/
├── discord/          # Core: Discord Bot API client
├── telegram/         # Core: Telegram Bot API client
├── slack/            # Core: Slack Socket Mode client
├── signal/           # Core: signal-cli wrapper
├── imessage/         # Core: imsg CLI wrapper
├── line/             # Core: LINE Messaging API client
└── web/              # Core: WhatsApp Web (baileys)

extensions/
├── discord/          # Plugin: Discord channel registration
├── telegram/         # Plugin: Telegram channel registration
├── slack/            # Plugin: Slack channel registration
├── signal/           # Plugin: Signal channel registration
├── imessage/         # Plugin: iMessage channel registration
├── line/             # Plugin: LINE channel registration
├── whatsapp/         # Plugin: WhatsApp channel registration
└── [13 extension-only channels]
```

## ✅ Validation

### Developer Understanding

- ✅ Architecture pattern now documented
- ✅ New channel guide available
- ✅ Common questions answered

### Code Organization

- ✅ No changes needed (already correct)
- ✅ Pattern is sound and maintainable
- ✅ Clear separation of concerns

### Documentation Quality

- ✅ Comprehensive architecture guide (480 lines)
- ✅ Diagrams and examples included
- ✅ FAQ addresses common confusion

---

**Phase 3 Complete**: February 9, 2026  
**Result**: Channel architecture documented and understood - no migration needed ✅  
**Outcome**: Preserved working architecture, improved developer understanding
