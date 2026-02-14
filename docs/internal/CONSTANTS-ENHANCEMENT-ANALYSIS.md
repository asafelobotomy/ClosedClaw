# Constants Library Analysis & Enhancement Opportunities

**Date**: February 10, 2026  
**Review Type**: Constants consolidation and enhancement

## Executive Summary

Current state: ClosedClaw has good constants organization with domain-specific constants files. However, there are opportunities to:

1. Create a centralized constants barrel export
2. Extract repeated environment variable names
3. Consolidate network/port constants
4. Create shared path constants
5. Extract magic strings and numbers

## Current Constants Files

### Existing Files (Well-Organized)

1. **`src/daemon/constants.ts`** (61 lines)
   - Systemd service names
   - Service markers and kinds
   - Profile resolution functions
2. **`src/agents/auth-profiles/constants.ts`** (26 lines)
   - Auth store version and filenames
   - Profile IDs (Claude, Codex, Qwen, Minimax)
   - Lock options and TTLs
3. **`src/browser/constants.ts`** (9 lines)
   - Browser defaults (color, profile names)
   - AI snapshot limits
4. **`src/agents/sandbox/constants.ts`** (52 lines)
   - Sandbox images and paths
   - Docker container prefixes
   - Tool allow/deny lists
   - Browser-specific constants (ports, timeouts)
5. **`src/media/constants.ts`** (45 lines)
   - Media size limits (images, audio, video, documents)
   - Media kind utilities
6. **`src/gateway/server-constants.ts`** (33 lines)
   - WebSocket payload limits
   - Handshake timeouts
   - Tick intervals and deduplication settings
7. **`src/web/auto-reply/constants.ts`** (1 line)
   - Web media bytes limit

## Enhancement Opportunities

### 1. Environment Variables (High Priority)

**Problem**: Environment variable names scattered across 50+ files with string literals

**Current Pattern**:

```typescript
// Repeated throughout codebase
process.env.ClosedClaw_GATEWAY_PORT;
process.env.ClosedClaw_STATE_DIR;
process.env.ClosedClaw_ROOT;
process.env.ClosedClaw_PROFILE;
process.env.ANTHROPIC_API_KEY;
process.env.BRAVE_API_KEY;
// ... 30+ more
```

**Proposed**:
Create `src/config/env-constants.ts`:

```typescript
/**
 * Environment Variable Names
 *
 * Centralized constants for all environment variable names used in ClosedClaw.
 * Import from here instead of using string literals.
 */

// ============================================================================
// Core Environment Variables
// ============================================================================

export const ENV_CLOSEDCLAW_ROOT = "ClosedClaw_ROOT" as const;
export const ENV_CLOSEDCLAW_STATE_DIR = "ClosedClaw_STATE_DIR" as const;
export const ENV_CLOSEDCLAW_PROFILE = "ClosedClaw_PROFILE" as const;
export const ENV_CLOSEDCLAW_DEBUG = "ClosedClaw_DEBUG" as const;

// ============================================================================
// Gateway Environment Variables
// ============================================================================

export const ENV_CLOSEDCLAW_GATEWAY_PORT = "ClosedClaw_GATEWAY_PORT" as const;
export const ENV_CLOSEDCLAW_GATEWAY_TOKEN = "ClosedClaw_GATEWAY_TOKEN" as const;
export const ENV_CLOSEDCLAW_GATEWAY_PASSWORD = "ClosedClaw_GATEWAY_PASSWORD" as const;
export const ENV_CLOSEDCLAW_GATEWAY_LOCK = "ClosedClaw_GATEWAY_LOCK" as const;
export const ENV_CLOSEDCLAW_SKIP_CHANNELS = "ClosedClaw_SKIP_CHANNELS" as const;

// ============================================================================
// Testing Environment Variables
// ============================================================================

export const ENV_VITEST = "VITEST" as const;
export const ENV_NODE_ENV = "NODE_ENV" as const;
export const ENV_CI = "CI" as const;
export const ENV_GITHUB_ACTIONS = "GITHUB_ACTIONS" as const;
export const ENV_CLOSEDCLAW_LIVE_TEST = "ClosedClaw_LIVE_TEST" as const;
export const ENV_CLOSEDCLAW_TEST_SHARDS = "ClosedClaw_TEST_SHARDS" as const;
export const ENV_CLOSEDCLAW_TEST_WORKERS = "ClosedClaw_TEST_WORKERS" as const;

// ============================================================================
// Provider API Keys
// ============================================================================

export const ENV_ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY" as const;
export const ENV_ANTHROPIC_OAUTH_TOKEN = "ANTHROPIC_OAUTH_TOKEN" as const;
export const ENV_OPENAI_API_KEY = "OPENAI_API_KEY" as const;
export const ENV_MINIMAX_API_KEY = "MINIMAX_API_KEY" as const;
export const ENV_MINIMAX_BASE_URL = "MINIMAX_BASE_URL" as const;
export const ENV_BRAVE_API_KEY = "BRAVE_API_KEY" as const;
export const ENV_FIRECRAWL_API_KEY = "FIRECRAWL_API_KEY" as const;
export const ENV_FIRECRAWL_BASE_URL = "FIRECRAWL_BASE_URL" as const;

// ============================================================================
// Channel-Specific Environment Variables
// ============================================================================

export const ENV_TELEGRAM_BOT_TOKEN = "TELEGRAM_BOT_TOKEN" as const;
export const ENV_CLOSEDCLAW_TWITCH_ACCESS_TOKEN = "ClosedClaw_TWITCH_ACCESS_TOKEN" as const;

// ============================================================================
// System Environment Variables
// ============================================================================

export const ENV_SHELL = "SHELL" as const;
export const ENV_PATH = "PATH" as const;
export const ENV_PATHEXT = "PATHEXT" as const;
export const ENV_NODE_OPTIONS = "NODE_OPTIONS" as const;
export const ENV_RUNNER_OS = "RUNNER_OS" as const;

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return process.env[ENV_CI] === "true" || process.env[ENV_GITHUB_ACTIONS] === "true";
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return Boolean(process.env[ENV_VITEST]) || process.env[ENV_NODE_ENV] === "test";
}

/**
 * Check if running live tests
 */
export function isLiveTest(): boolean {
  return Boolean(process.env[ENV_CLOSEDCLAW_LIVE_TEST]);
}
```

**Benefits**:

- Type safety (typos caught at compile time)
- Single source of truth
- Easier refactoring
- IDE autocomplete for env var names
- ~30 seconds saved per lookup across team

### 2. Network Constants (Medium Priority)

**Problem**: Ports and URLs repeated as magic numbers/strings

**Current Pattern**:

```typescript
// Repeated across 20+ test files
"http://127.0.0.1:18789";
"ws://127.0.0.1:18789";
"http://127.0.0.1:8080"; // Signal
"http://localhost:1234";
```

**Proposed**:
Create `src/config/network-constants.ts`:

```typescript
/**
 * Network Constants
 *
 * Centralized network addresses, ports, and URL patterns.
 */

// ============================================================================
// Default Ports
// ============================================================================

export const DEFAULT_GATEWAY_PORT = 18789 as const;
export const DEFAULT_SIGNAL_PORT = 8080 as const;
export const DEFAULT_WEBHOOK_PORT = 8788 as const;

// ============================================================================
// Localhost Addresses
// ============================================================================

export const LOCALHOST_IPV4 = "127.0.0.1" as const;
export const LOCALHOST_NAME = "localhost" as const;
export const BIND_ALL_IPV4 = "0.0.0.0" as const;

// ============================================================================
// URL Builders
// ============================================================================

/**
 * Build gateway HTTP URL
 */
export function buildGatewayHttpUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `http://${host}:${port}`;
}

/**
 * Build gateway WebSocket URL
 */
export function buildGatewayWsUrl(
  port: number = DEFAULT_GATEWAY_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `ws://${host}:${port}`;
}

/**
 * Build Signal base URL
 */
export function buildSignalUrl(
  port: number = DEFAULT_SIGNAL_PORT,
  host: string = LOCALHOST_IPV4,
): string {
  return `http://${host}:${port}`;
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Get test gateway HTTP URL (for tests)
 */
export function getTestGatewayHttpUrl(): string {
  const port = Number.parseInt(
    process.env.ClosedClaw_GATEWAY_PORT ?? `${DEFAULT_GATEWAY_PORT}`,
    10,
  );
  return buildGatewayHttpUrl(port);
}

/**
 * Get test gateway WebSocket URL (for tests)
 */
export function getTestGatewayWsUrl(): string {
  const port = Number.parseInt(
    process.env.ClosedClaw_GATEWAY_PORT ?? `${DEFAULT_GATEWAY_PORT}`,
    10,
  );
  return buildGatewayWsUrl(port);
}
```

**Benefits**:

- Single source of truth for ports
- Type-safe URL construction
- Easier to change default ports
- Test helpers reduce boilerplate

### 3. Path Constants (Medium Priority)

**Problem**: `.ClosedClaw` paths repeated throughout codebase

**Current Pattern**:

```typescript
// Repeated 20+ times
path.join(os.homedir(), ".ClosedClaw");
path.join(os.homedir(), ".ClosedClaw", "sandboxes");
path.join(os.homedir(), ".ClosedClaw", "voice-calls");
path.join(os.homedir(), ".ClosedClaw", "workspace", "memory");
```

**Proposed**:
Enhance `src/config/paths.ts` with additional constants:

```typescript
/**
 * Path Constants
 *
 * Centralized path definitions for ClosedClaw directories and files.
 */

import os from "node:os";
import path from "node:path";

// ============================================================================
// Base Directories
// ============================================================================

export const CLOSEDCLAW_DIR_NAME = ".ClosedClaw" as const;
export const CLOSEDCLAW_LOWERCASE_DIR_NAME = ".closedclaw" as const;

/**
 * Get ClosedClaw root directory
 */
export function getClosedClawRoot(): string {
  const override = process.env.ClosedClaw_ROOT?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), CLOSEDCLAW_DIR_NAME);
}

// ============================================================================
// Subdirectory Paths
// ============================================================================

export function getSandboxesDir(): string {
  return path.join(getClosedClawRoot(), "sandboxes");
}

export function getVoiceCallsDir(): string {
  return path.join(getClosedClawRoot(), "voice-calls");
}

export function getWorkspaceDir(): string {
  return path.join(getClosedClawRoot(), "workspace");
}

export function getMemoryDir(): string {
  return path.join(getWorkspaceDir(), "memory");
}

export function getMemoryBankDir(): string {
  return path.join(getWorkspaceDir(), "bank");
}

export function getNotesDir(): string {
  return path.join(getClosedClawRoot(), "notes");
}

export function getScreenshotsDir(): string {
  return path.join(getClosedClawRoot(), "screenshots");
}

export function getCredentialsDir(): string {
  return path.join(getClosedClawRoot(), "credentials");
}

export function getSessionsDir(): string {
  return path.join(getClosedClawRoot(), "sessions");
}

export function getLogsDir(): string {
  return path.join(getClosedClawRoot(), "logs");
}

// ============================================================================
// Common File Paths
// ============================================================================

export function getConfigPath(): string {
  return path.join(getClosedClawRoot(), "config.json5");
}

export function getLockFilePath(): string {
  return path.join(getClosedClawRoot(), "gateway.lock");
}

export function getAuthProfilesPath(): string {
  return path.join(getClosedClawRoot(), "auth-profiles.json");
}

export function getSandboxRegistryPath(): string {
  return path.join(getClosedClawRoot(), "sandbox", "containers.json");
}
```

**Benefits**:

- Single source of truth for paths
- Environment variable overrides centralized
- Type-safe path construction
- Easier to test with temp directories

### 4. Timeout & Retry Constants (Low Priority)

**Problem**: Timeout values scattered as magic numbers

**Current Pattern**:

```typescript
// Various timeouts across files
10_000; // handshake timeout
30_000; // tick interval
60_000; // health refresh
12_000; // browser autostart
5000; // port wait timeout
```

**Proposed**:
Create `src/config/timing-constants.ts`:

```typescript
/**
 * Timing Constants
 *
 * Centralized timeout, interval, and retry configurations.
 */

// ============================================================================
// Timeouts (milliseconds)
// ============================================================================

export const TIMEOUT_HANDSHAKE_MS = 10_000 as const;
export const TIMEOUT_BROWSER_AUTOSTART_MS = 12_000 as const;
export const TIMEOUT_PORT_WAIT_MS = 5_000 as const;
export const TIMEOUT_HTTP_REQUEST_MS = 30_000 as const;

// ============================================================================
// Intervals (milliseconds)
// ============================================================================

export const INTERVAL_TICK_MS = 30_000 as const;
export const INTERVAL_HEALTH_REFRESH_MS = 60_000 as const;
export const INTERVAL_DEDUPE_TTL_MS = (5 * 60_000) as const;

// ============================================================================
// TTLs (milliseconds)
// ============================================================================

export const TTL_EXTERNAL_CLI_SYNC_MS = (15 * 60 * 1000) as const;
export const TTL_EXTERNAL_CLI_NEAR_EXPIRY_MS = (10 * 60 * 1000) as const;
export const TTL_AUTH_STORE_STALE_MS = 30_000 as const;

// ============================================================================
// Retry Configurations
// ============================================================================

export const RETRY_AUTH_STORE_CONFIG = {
  retries: 10,
  factor: 2,
  minTimeout: 100,
  maxTimeout: 10_000,
  randomize: true,
} as const;

// ============================================================================
// Sandbox Limits
// ============================================================================

export const SANDBOX_IDLE_HOURS = 24 as const;
export const SANDBOX_MAX_AGE_DAYS = 7 as const;
```

**Benefits**:

- Named constants instead of magic numbers
- Easier to adjust timing globally
- Self-documenting code

### 5. File Size Limits (Already Good, Could Extract)

**Current State**: Already well-organized in `src/media/constants.ts`

**Minor Enhancement**:

```typescript
// Could add min size constants
export const MIN_IMAGE_BYTES = 100 as const; // Prevent tiny/corrupt images
export const MIN_AUDIO_BYTES = 1024 as const;
export const MIN_VIDEO_BYTES = 1024 as const;
```

## Proposed Barrel Export

Create `src/config/constants/index.ts` to aggregate all constants:

```typescript
/**
 * Constants Barrel Export
 *
 * Centralized access to all ClosedClaw constants.
 */

// Environment variables
export * from "./env-constants.js";

// Network (ports, URLs)
export * from "./network-constants.js";

// Paths
export * from "./path-constants.js";

// Timing (timeouts, intervals, TTLs)
export * from "./timing-constants.js";

// Re-export existing domain-specific constants
export * from "../daemon/constants.js";
export * from "../agents/auth-profiles/constants.js";
export * from "../browser/constants.js";
export * from "../agents/sandbox/constants.js";
export * from "../media/constants.js";
export * from "../gateway/server-constants.js";
export * from "../web/auto-reply/constants.js";
```

**Usage**:

```typescript
// Before
import { DEFAULT_GATEWAY_PORT } from "../../../gateway/server-constants.js";
const port = Number.parseInt(process.env.ClosedClaw_GATEWAY_PORT ?? "18789", 10);

// After
import {
  DEFAULT_GATEWAY_PORT,
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  buildGatewayHttpUrl,
} from "@/config/constants";

const port = Number.parseInt(
  process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? `${DEFAULT_GATEWAY_PORT}`,
  10,
);
const url = buildGatewayHttpUrl(port);
```

## Implementation Priority

### Phase 1: High Impact (1-2 hours)

1. Create `src/config/env-constants.ts` (40+ env vars)
2. Create `src/config/network-constants.ts` (ports, URLs)
3. Update path aliases documentation

### Phase 2: Medium Impact (2-3 hours)

4. Enhance `src/config/paths.ts` with helper functions
5. Create `src/config/timing-constants.ts`
6. Create barrel export `src/config/constants/index.ts`

### Phase 3: Migration (5-10 hours, gradual)

7. Migrate high-traffic files to use new constants
8. Update tests to use constants
9. Update documentation with best practices

## Benefits Summary

**For Developers**:

- Autocomplete for env var names (no more typos)
- Single source of truth (no hunting for values)
- Easier refactoring (change once, apply everywhere)
- Self-documenting code (named constants)

**For Maintenance**:

- Easier to change defaults globally
- Type safety prevents runtime errors
- Clearer dependencies between modules
- Better test compatibility

**Time Savings**:

- ~30-60 seconds per env var lookup (multiply by frequency)
- ~15 minutes per port/URL change (no grep needed)
- ~5 minutes saved when onboarding new developers

**Estimated ROI**: 2-4 hours saved per developer per month

## Risks & Mitigation

**Risk 1**: Breaking changes during migration

- **Mitigation**: Gradual migration, both patterns coexist

**Risk 2**: Import cycles with new barrel export

- **Mitigation**: Keep constants pure (no dependencies)

**Risk 3**: Developer resistance to change

- **Mitigation**: Document benefits, provide examples

## Related Work

- **Priority 3.5**: Constants Consolidation (~1,200 lines) - Already complete
- **Option C**: Path aliases and barrel exports - Infrastructure ready
- **Testing**: All test configs support path aliases

## Next Steps

1. Review this analysis with team
2. Approve Phase 1 scope (env vars + network)
3. Implement in batches (TDD: create constant → write test → migrate usage)
4. Update documentation
5. Gradual migration over 2-4 weeks
