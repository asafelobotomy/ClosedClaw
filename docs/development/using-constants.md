# Using ClosedClaw Constants

**Quick Guide** for using the new centralized constants library.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Network Configuration](#network-configuration)
- [Platform Detection](#platform-detection)
- [Migration Examples](#migration-examples)
- [Best Practices](#best-practices)

## Quick Start

```typescript
// Single import point for all constants
import {
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  DEFAULT_GATEWAY_PORT,
  buildGatewayHttpUrl,
  isCI,
  isTest,
} from "@/config/constants";

// Use type-safe environment variable names
const port = parseInt(process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? String(DEFAULT_GATEWAY_PORT), 10);

// Use URL builders instead of string concatenation
const gatewayUrl = buildGatewayHttpUrl(port);

// Use platform/environment detectors
if (isCI()) {
  console.log("Running in CI environment");
}
```

## Environment Variables

### Reading Environment Variables

```typescript
import {
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  ENV_ANTHROPIC_API_KEY,
  ENV_CLOSEDCLAW_STATE_DIR,
} from "@/config/constants";

// ❌ Before (prone to typos)
const port = process.env.ClosedClaw_GATEWAY_PORT;
const key = process.env.ANTROPIC_API_KEY; // Typo!

// ✅ After (autocomplete prevents typos)
const port = process.env[ENV_CLOSEDCLAW_GATEWAY_PORT];
const key = process.env[ENV_ANTHROPIC_API_KEY];
```

### Environment Detection

```typescript
import { isCI, isTest, isLiveTest } from "@/config/constants";

// ❌ Before
const ci = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const testing = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";

// ✅ After
const ci = isCI();
const testing = isTest();

// Conditional logic based on environment
if (isLiveTest()) {
  // Run tests with real API keys (costs money)
} else {
  // Use mocks
}
```

## Network Configuration

### URL Building

```typescript
import {
  buildGatewayHttpUrl,
  buildGatewayWsUrl,
  buildGatewayRpcUrl,
  DEFAULT_GATEWAY_PORT,
} from "@/config/constants";

// ❌ Before (repeated across 30+ files)
const httpUrl = "http://127.0.0.1:18789";
const wsUrl = `ws://127.0.0.1:${port}`;
const rpcUrl = `http://127.0.0.1:${port}/rpc`;

// ✅ After (single source of truth)
const httpUrl = buildGatewayHttpUrl();
const wsUrl = buildGatewayWsUrl(port);
const rpcUrl = buildGatewayRpcUrl(port);
```

### Port Configuration

```typescript
import {
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNAL_PORT,
  DEFAULT_OLLAMA_PORT,
  ENV_CLOSEDCLAW_GATEWAY_PORT,
} from "@/config/constants";

// ❌ Before (magic numbers)
const gatewayPort = parseInt(process.env.ClosedClaw_GATEWAY_PORT ?? "18789", 10);
const signalPort = 8080;

// ✅ After (named constants)
const gatewayPort = parseInt(
  process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? String(DEFAULT_GATEWAY_PORT),
  10,
);
const signalPort = DEFAULT_SIGNAL_PORT;
```

### Custom Hosts and Ports

```typescript
import { buildGatewayHttpUrl, buildHttpUrl } from "@/config/constants";

// Default (127.0.0.1:18789)
const localUrl = buildGatewayHttpUrl();

// Custom port
const customPortUrl = buildGatewayHttpUrl(8080);

// Custom host
const customHostUrl = buildGatewayHttpUrl(18789, "localhost");

// Fully custom
const customUrl = buildHttpUrl("example.com", 9999, "/api/v1");
```

## Platform Detection

### OS Detection

```typescript
import { isWindows, isMacOS, isLinux, getRunnerOS } from "@/config/constants";

// ❌ Before
const isWin = process.platform === "win32" || process.env.RUNNER_OS === "Windows";
const isMac = process.platform === "darwin";

// ✅ After
const isWin = isWindows();
const isMac = isMacOS();

// CI-specific logic
if (getRunnerOS() === "macOS") {
  // macOS-specific CI setup
}

// Platform-specific paths
const configPath = isWindows()
  ? path.join(process.env.USERPROFILE!, ".closedclaw")
  : path.join(process.env.HOME!, ".closedclaw");
```

## Migration Examples

### Test Files

```typescript
// Before
describe("gateway tests", () => {
  const gatewayUrl = "http://127.0.0.1:18789";

  beforeAll(async () => {
    if (process.env.CI === "true") {
      // CI-specific setup
    }
  });
});

// After
import { buildGatewayHttpUrl, isCI } from "@/config/constants";

describe("gateway tests", () => {
  const gatewayUrl = buildGatewayHttpUrl();

  beforeAll(async () => {
    if (isCI()) {
      // CI-specific setup
    }
  });
});
```

### Configuration Files

```typescript
// Before
export const config = {
  port: parseInt(process.env.ClosedClaw_GATEWAY_PORT ?? "18789", 10),
  apiKey: process.env.ANTHROPIC_API_KEY,
  isProduction: process.env.NODE_ENV === "production",
};

// After
import {
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  ENV_ANTHROPIC_API_KEY,
  ENV_NODE_ENV,
  DEFAULT_GATEWAY_PORT,
} from "@/config/constants";

export const config = {
  port: parseInt(process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? String(DEFAULT_GATEWAY_PORT), 10),
  apiKey: process.env[ENV_ANTHROPIC_API_KEY],
  isProduction: process.env[ENV_NODE_ENV] === "production",
};
```

### Gateway Initialization

```typescript
// Before
const port = parseInt(process.env.ClosedClaw_GATEWAY_PORT ?? "18789", 10);
const server = createServer();
server.listen(port, "127.0.0.1", () => {
  console.log(`Gateway listening on http://127.0.0.1:${port}`);
});

// After
import {
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  DEFAULT_GATEWAY_PORT,
  LOCALHOST_IPV4,
  buildGatewayHttpUrl,
} from "@/config/constants";

const port = parseInt(process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? String(DEFAULT_GATEWAY_PORT), 10);
const server = createServer();
server.listen(port, LOCALHOST_IPV4, () => {
  console.log(`Gateway listening on ${buildGatewayHttpUrl(port)}`);
});
```

## Best Practices

### 1. Always Import Constants (Never Hardcode)

```typescript
// ❌ Bad
const port = 18789;
const url = "http://127.0.0.1:18789";

// ✅ Good
import { DEFAULT_GATEWAY_PORT, buildGatewayHttpUrl } from "@/config/constants";
const port = DEFAULT_GATEWAY_PORT;
const url = buildGatewayHttpUrl(port);
```

### 2. Use URL Builders for Consistency

```typescript
// ❌ Bad (inconsistent formatting)
const url1 = `http://127.0.0.1:${port}`;
const url2 = "http://localhost:" + port;

// ✅ Good (consistent)
import { buildGatewayHttpUrl } from "@/config/constants";
const url1 = buildGatewayHttpUrl(port);
const url2 = buildGatewayHttpUrl(port, "localhost");
```

### 3. Use Platform Helpers for Cross-Platform Code

```typescript
// ❌ Bad (verbose, error-prone)
const isWindowsCI = process.env.RUNNER_OS === "Windows" || process.platform === "win32";

// ✅ Good (clear intent)
import { isWindows } from "@/config/constants";
const isWindowsCI = isWindows();
```

### 4. Use Environment Detectors for Test Logic

```typescript
// ❌ Bad
if (process.env.VITEST || process.env.NODE_ENV === "test") {
  // Test-specific logic
}

// ✅ Good
import { isTest } from "@/config/constants";
if (isTest()) {
  // Test-specific logic
}
```

### 5. Group Related Imports

```typescript
// ✅ Good organization
import {
  // Environment variables
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  ENV_ANTHROPIC_API_KEY,

  // Default values
  DEFAULT_GATEWAY_PORT,

  // URL builders
  buildGatewayHttpUrl,

  // Platform detection
  isCI,
  isTest,
} from "@/config/constants";
```

## Finding Constants to Use

### 1. Check Available Constants

```typescript
// See all available constants
import * as constants from "@/config/constants";
console.log(Object.keys(constants));
```

### 2. Search Before Hardcoding

Before writing a hardcoded value:

1. Check if a constant already exists
2. If not, add it to the appropriate constants file
3. Update the barrel export in `index.ts`

### 3. Follow Naming Conventions

- Environment variables: `ENV_CLOSEDCLAW_*`, `ENV_ANTHROPIC_*`, etc.
- Default values: `DEFAULT_*`
- Builders: `build*()`, `create*()`, `get*()`
- Detectors: `is*()`, `has*()`

## Related Documentation

- **Phase 1 Completion**: [constants-phase-1-complete.md](../completion/constants-phase-1-complete.md)
- **Full Analysis**: [CONSTANTS-ENHANCEMENT-ANALYSIS.md](../../CONSTANTS-ENHANCEMENT-ANALYSIS.md)
- **Path Aliases Guide**: [path-aliases.md](./path-aliases.md)
- **First Contribution**: [first-contribution.md](./first-contribution.md)

## Questions?

- Check existing usage in test files: `src/config/constants/*.test.ts`
- Review the implementation: `src/config/constants/*.ts`
- See the analysis document: `CONSTANTS-ENHANCEMENT-ANALYSIS.md`
