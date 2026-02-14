# Path Aliases & Barrel Exports

TypeScript path aliases and barrel exports for cleaner imports and better refactoring support.

## Quick Start

**Before** (deep relative imports):

```typescript
import { loadConfig } from "../../../config/config.js";
import { doctorCommand } from "../../../commands/doctor.js";
import { createWebTools } from "../../../agents/tools/web-tools.js";
```

**After** (path aliases + barrel exports):

```typescript
import { loadConfig } from "@/config/config.js";
import { doctorCommand } from "@/commands";
import { createWebTools } from "@/agents/tools";
```

## Path Aliases

Configured in `tsconfig.json` and all Vitest configs:

- **`@/*`** → `./src/*` - Source code (production)
- **`@test/*`** → `./test/*` - Test utilities and fixtures

### Usage Examples

```typescript
// Config
import { loadConfig, type ClosedClawConfig } from "@/config/config.js";

// Commands (via barrel export)
import { agentCommand, doctorCommand, onboardCommand, gatewayStatusCommand } from "@/commands";

// Agent tools (via barrel export)
import {
  createWebTools,
  createDiscordActions,
  createMemoryTool,
  createSessionsSendTool,
} from "@/agents/tools";

// Test utilities
import { createTempHome, findFreePort, createTestConfig, assertValidSessionKey } from "@test/utils";

// Channels
import { getChannelPlugin } from "@/channels/plugins";
import type { ChannelPlugin } from "@/channels/plugins/types.js";

// Gateway
import { GatewayService } from "@/gateway/service.js";
import type { GatewayConfig } from "@/gateway/types.js";

// Security
import { encrypt, decrypt } from "@/security/crypto.js";
import { auditLog } from "@/security/audit-log.js";
import { KeychainBackend } from "@/security/keychain";
```

## Barrel Exports

Barrel exports aggregate related modules for single-import convenience. Currently implemented:

### 1. Commands (`src/commands/index.ts`)

Exports all CLI commands organized by category:

```typescript
import {
  // Agent commands
  agentCommand,
  agentViaGatewayCommand,
  agentsCommand,

  // Auth & onboarding
  onboardCommand,
  authChoiceCommand,

  // Channels
  channelsCommand,
  signalInstallCommand,

  // Configuration
  configureCommand,
  configureGatewayCommand,

  // Diagnostics
  doctorCommand,
  healthCommand,

  // Gateway & status
  gatewayStatusCommand,
  statusCommand,

  // Security
  keychainCommand,
  skillSignCommand,
  auditQueryCommand,

  // Sandbox
  sandboxCommand,

  // Utilities
  setupCommand,
  resetCommand,
  uninstallCommand,
} from "@/commands";
```

**Categories**:

- Agent Commands (10+ exports)
- Authentication & Onboarding (30+ exports)
- Channel Commands
- Configuration Commands (10+ exports)
- Diagnostics & Health (20+ exports)
- Gateway & Status (10+ exports)
- Messaging Commands
- Model Commands
- Security Commands (5+ exports)
- Session Commands
- Sandbox Commands
- Daemon & System Commands
- Dashboard & Documentation
- Utility Commands

### 2. Agent Tools (`src/agents/tools/index.ts`)

Exports all agent tools by category:

```typescript
import {
  // Core utilities
  jsonResult,
  textResult,
  readStringParam,

  // Web & browser
  createWebTools,
  createWebFetchTool,
  createWebSearchTool,
  createBrowserTool,

  // Channel-specific actions
  createDiscordActions,
  createSlackActions,
  createTelegramActions,
  createWhatsappActions,

  // Session & messaging
  createSessionsListTool,
  createSessionsSendTool,
  createMessageTool,

  // Memory & agents
  createMemoryTool,
  createAgentsListTool,

  // Gateway & nodes
  createGatewayTool,
  createNodesTool,

  // Media & UI
  createImageTool,
  createTtsTool,
  createCanvasTool,

  // Automation
  createCronTool,
} from "@/agents/tools";
```

**Categories**:

- Core Tool Utilities
- Web & Browser Tools
- Channel-Specific Action Tools (Discord, Slack, Telegram, WhatsApp)
- Session & Message Tools
- Memory & Agent Tools
- Gateway & Nodes Tools
- Media & UI Tools
- Automation Tools

### 3. Test Utilities (`test/utils/index.ts`)

See [test/utils/README.md](../../test/utils/README.md) for full documentation.

```typescript
import {
  // Helpers (re-exported)
  createTestRegistry,
  findFreePort,
  createTempHome,
  withTempHome,

  // Config factories
  createTestConfig,
  createTestAgentConfig,
  createTestChannelConfig,
  createTestSecurityConfig,

  // Session factories
  createTestSession,
  createTestSessionKey,
  parseTestSessionKey,

  // Custom assertions
  assertValidSessionKey,
  assertToolSuccess,
  assertValidAuditEntry,
  assertValidSignature,
} from "@test/utils";
```

## Migration Guide

### Finding Candidates

Use grep to find deep relative imports:

```bash
# Find triple-dot imports
grep -r "from '\.\.\./\.\.\./\.\.\." src/

# Find any relative imports going up 2+ levels
grep -r "from '\.\./\.\." src/ | wc -l
```

### Migration Strategy

**Phase 1**: Update high-traffic files first (most imported modules)
**Phase 2**: Update by directory (one module at a time)
**Phase 3**: Gradual migration of remaining files

**Workflow**:

1. Identify file to migrate
2. Replace deep relative imports with path aliases
3. Use barrel exports where available
4. Run tests: `pnpm test -- path/to/file.test.ts`
5. Fix any import errors
6. Commit when tests pass

### Example Migration

**Before** (`src/gateway/service.ts`):

```typescript
import { loadConfig } from "../config/config.js";
import { doctorCommand } from "../commands/doctor.js";
import { healthCommand } from "../commands/health.js";
import { getChannelPlugin } from "../channels/plugins/index.js";
import { encrypt } from "../security/crypto.js";
import { auditLog } from "../security/audit-log.js";
import { createWebTools } from "../agents/tools/web-tools.js";
import { createMemoryTool } from "../agents/tools/memory-tool.js";
```

**After**:

```typescript
import { loadConfig } from "@/config/config.js";
import { doctorCommand, healthCommand } from "@/commands";
import { getChannelPlugin } from "@/channels/plugins";
import { encrypt } from "@/security/crypto.js";
import { auditLog } from "@/security/audit-log.js";
import { createWebTools, createMemoryTool } from "@/agents/tools";
```

**Benefits**:

- 7 imports → 6 imports (simpler)
- No `../` navigation
- Easier to refactor (paths are absolute-like)
- Barrel exports group related imports

### Automated Migration

Use VS Code's "Find and Replace in Files" with regex:

**Pattern**: `from ['"](\.\./){3,}(.*?)['"]`  
**Replace**: Review case-by-case (context-dependent)

Or use TypeScript's built-in refactoring:

1. Right-click on import path
2. Select "Convert to ES6 module" or "Organize imports"
3. Adjust manually to use path aliases

## When to Use Barrel Exports

**✅ Use barrel exports when**:

- Importing multiple related modules from same package
- Module is part of public API
- Simplifies common import patterns

**❌ Avoid barrel exports when**:

- Causes circular dependency
- Large module with many exports (tree-shaking issues)
- Internal-only utilities (not part of public API)

## When to Use Path Aliases

**✅ Use path aliases when**:

- Importing from 3+ levels up (`../../../`)
- Cross-cutting concerns (config, security, logging)
- Common utilities used across many files
- Test utilities in test files

**❌ Keep relative imports when**:

- Same directory (`./file.js`)
- One level up (`../sibling.js`)
- Highly coupled modules in same package

## Testing

Path aliases work in all test configs:

- `vitest.config.ts` (default)
- `vitest.unit.config.ts`
- `vitest.gateway.config.ts`
- `vitest.extensions.config.ts`
- `vitest.e2e.config.ts`
- `vitest.live.config.ts`

```typescript
// Test file using path aliases
import { describe, it, expect } from "vitest";
import { loadConfig } from "@/config/config.js";
import { createTempHome, createTestConfig } from "@test/utils";

describe("My Test", () => {
  it("should work with path aliases", async () => {
    await withTempHome(async (homeDir) => {
      const config = createTestConfig();
      // Test code...
    });
  });
});
```

## IDE Support

VS Code, WebStorm, and other TypeScript-aware editors automatically resolve path aliases via `tsconfig.json` paths configuration. Features work out of the box:

- Go to Definition (F12)
- Find All References (Shift+F12)
- Auto-imports use path aliases
- Refactoring preserves imports

## Troubleshooting

### Import not found

Check that:

1. Path alias matches `tsconfig.json` configuration
2. File exists at target path
3. Export exists in barrel file

### Circular dependency

If barrel export causes circular dependencies:

1. Import directly instead: `from '@/path/to/file.js'`
2. Restructure modules to break cycle
3. Use dynamic imports for optional dependencies

### Test failures after migration

1. Check Vitest config has path aliases (`resolve.alias`)
2. Verify imports use `.js` extension (ESM requirement)
3. Run specific test: `pnpm test -- path/to/file.test.ts`

### Type errors

Ensure:

1. `baseUrl` is set in `tsconfig.json`
2. `paths` mapping is correct
3. Run `pnpm build` to check types

## Future Enhancements

### Additional Barrel Exports (Proposed)

- `src/config/index.ts` - Config loading and types
- `src/security/index.ts` - Security utilities
- `src/channels/index.ts` - Channel registry and plugins
- `src/gateway/index.ts` - Gateway service and types
- `src/sessions/index.ts` - Session management

### Module Boundaries (Optional)

Add `eslint-plugin-boundaries` to enforce architectural boundaries:

```json
{
  "boundaries/element-types": [
    {
      "type": "core",
      "pattern": "src/(config|security|logging)/**"
    },
    {
      "type": "gateway",
      "pattern": "src/gateway/**"
    },
    {
      "type": "channels",
      "pattern": "src/channels/**"
    },
    {
      "type": "agents",
      "pattern": "src/agents/**"
    }
  ]
}
```

## Related Documentation

- [First Contribution](../development/first-contribution.md) - Developer setup
- [Testing Guide](../testing.md) - Test patterns and utilities
- [Repository Review](../../REPOSITORY-REVIEW-2026-02-10.md) - Architecture decisions
- [Test Utils README](../../test/utils/README.md) - Test utilities documentation
