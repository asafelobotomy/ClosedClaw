# Test Utilities

Shared utilities for testing ClosedClaw. Import from `test/utils` instead of navigating deep paths.

## Quick Start

```typescript
import {
  createTempHome,
  findFreePort,
  createTestConfig,
  assertValidSessionKey,
} from "../test/utils/index.js";

describe("My Test", () => {
  it("should work with test utilities", async () => {
    const port = await findFreePort();
    const config = createTestConfig({ gateway: { port } });

    await withTempHome(async (homeDir) => {
      // Test code here
    });
  });
});
```

## Organization

### Helpers (`test/helpers/`)

Core testing utilities re-exported via barrel:

- **channel-plugins.ts**: `createTestRegistry()` - Mock plugin registry for channel tests
- **envelope-timestamp.ts**: Message envelope timestamp utilities
- **inbound-contract.ts**: Contract testing helpers for inbound messages
- **normalize-text.ts**: Text normalization for assertion comparisons
- **paths.ts**: Path resolution helpers for test fixtures
- **poll.ts**: Polling utilities for async testing
- **ports.ts**: `findFreePort()`, `waitForPort()` - Port management
- **temp-home.ts**: `createTempHome()`, `withTempHome()` - Temporary home directory
- **workspace.ts**: Workspace setup and teardown utilities

### Mocks (`test/mocks/`)

Test doubles and stubs:

- **baileys.ts**: WhatsApp Baileys library mock

### Fixtures (`test/fixtures/`)

Static test data:

- **child-process-bridge/**: Fixture data for child process testing

### Utils (`test/utils/`)

Higher-level test utilities:

- **config.ts**: Config factory functions (`createTestConfig()`, `createTestAgentConfig()`, etc.)
- **sessions.ts**: Session factory functions (`createTestSession()`, `createTestSessionKey()`, etc.)
- **assertions.ts**: Custom assertions (`assertValidSessionKey()`, `assertToolSuccess()`, etc.)

## Usage Patterns

### Config Factories

```typescript
import { createTestConfig, createTestAgentConfig } from "../test/utils/index.js";

// Minimal config
const config = createTestConfig();

// Agent-specific config
const agentConfig = createTestAgentConfig("myagent", {
  model: "gpt-4",
  temperature: 0.7,
});

// Channel-specific config
const channelConfig = createTestChannelConfig("telegram", {
  token: "test-token",
});

// Security-enabled config
const secureConfig = createTestSecurityConfig({
  encryption: true,
  signing: true,
  audit: true,
});
```

### Session Factories

```typescript
import {
  createTestSession,
  createTestSessionKey,
  parseTestSessionKey,
} from "../test/utils/index.js";

// Create session key
const key = createTestSessionKey("telegram", "dm", "user123");
// => "agent:main:telegram:dm:user123"

// Create session with defaults
const session = createTestSession(key);

// Create session with message history
const sessionWithMessages = createTestSessionWithMessages(key, 10);

// Parse session key
const { agentId, channel, kind, peerId } = parseTestSessionKey(key);
```

### Custom Assertions

```typescript
import {
  assertValidSessionKey,
  assertToolSuccess,
  assertValidAuditEntry,
  assertValidSignature,
} from "../test/utils/index.js";

// Validate session keys
assertValidSessionKey("agent:main:telegram:dm:user123");

// Check tool results
const result = await agent.callTool("my_tool", params);
assertToolSuccess(result);

// Validate audit entries
const entry = await auditLog.getEntry(seq);
assertValidAuditEntry(entry);

// Validate signatures
assertValidSignature(signature);
assertValidSha256Hash(hash);
```

### Temporary Environments

```typescript
import { createTempHome, withTempHome } from "../test/utils/index.js";

// Manual cleanup
const tempDir = await createTempHome();
try {
  // Test code
} finally {
  await fs.rm(tempDir, { recursive: true });
}

// Automatic cleanup
await withTempHome(async (homeDir) => {
  // Test code - homeDir is cleaned up automatically
});
```

### Port Management

```typescript
import { findFreePort, waitForPort } from "../test/utils/index.js";

// Find available port
const port = await findFreePort();

// Start server
const server = startServer(port);

// Wait for server to be ready
await waitForPort(port, { timeout: 5000 });
```

### Channel Plugin Testing

```typescript
import { createTestRegistry } from "../test/utils/index.js";

const registry = createTestRegistry();

// Register test channel
registry.registerChannel({
  id: "test-channel",
  name: "Test Channel",
  send: async (msg) => {
    /* ... */
  },
});

// Use in tests
const channel = registry.getChannel("test-channel");
await channel.send({ text: "Hello" });
```

## Adding New Utilities

When adding new test utilities:

1. **Location**: Add to appropriate directory:
   - `test/helpers/` for low-level utilities
   - `test/mocks/` for test doubles
   - `test/fixtures/` for static data
   - `test/utils/` for high-level patterns

2. **Documentation**: Include JSDoc comments:

   ```typescript
   /**
    * Create a test configuration with security enabled
    *
    * @param features - Security features to enable
    * @returns Test config with security settings
    */
   export function createTestSecurityConfig(features: SecurityFeatures): ClosedClawConfig {
     // ...
   }
   ```

3. **Export**: Add to `test/utils/index.ts` barrel export:

   ```typescript
   export * from "./new-utility.js";
   ```

4. **Testing**: Test utilities should have their own tests when complex

## Related Documentation

- [Testing Guide](../docs/testing.md) - Overall testing strategy
- [First Contribution](../docs/development/first-contribution.md) - Developer onboarding
- [Repository Review](../REPOSITORY-REVIEW-2026-02-10.md) - Architecture decisions

## Test Configs

ClosedClaw uses 5 Vitest configs for different test types:

- **Unit** (`vitest.unit.config.ts`): `src/**/*.test.ts` - Fast, isolated tests
- **Extensions** (`vitest.extensions.config.ts`): `extensions/**/*.test.ts` - Plugin tests
- **Gateway** (`vitest.gateway.config.ts`): `src/gateway/**/*.test.ts` - Gateway control plane
- **E2E** (`vitest.e2e.config.ts`): `src/**/*.e2e.test.ts` - Network/integration tests
- **Live** (`vitest.live.config.ts`): `src/**/*.live.test.ts` - Real provider tests

These utilities work across all test configs.
