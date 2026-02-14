---
name: test-runner
description: Efficient test execution patterns for ClosedClaw. Use when running tests, debugging test failures, checking coverage, or understanding the multi-config test architecture. Covers unit, gateway, extensions, e2e, and live test suites.
---

# Test Runner

This skill helps you efficiently run and debug tests in ClosedClaw's multi-config Vitest architecture. The project uses five separate test configurations with parallel execution and intelligent test splitting.

## When to Use

- Running tests locally or in CI
- Debugging failing tests
- Checking test coverage
- Understanding test architecture
- Narrowing test execution for faster iteration
- Running live provider tests

## Prerequisites

- Understanding of Vitest framework
- Familiarity with the codebase structure
- Node ≥22 installed

## Test Architecture

ClosedClaw uses **five Vitest configurations**:

1. **Unit** (`vitest.unit.config.ts`)
   - Pattern: `src/**/*.test.ts` (excluding gateway and extensions)
   - Purpose: Fast, deterministic unit tests
   - No real credentials required
   - Example: `src/config/config.test.ts`

2. **Extensions** (`vitest.extensions.config.ts`)
   - Pattern: `extensions/**/*.test.ts`
   - Purpose: Plugin tests isolated from core
   - Example: `extensions/telegram/send.test.ts`

3. **Gateway** (`vitest.gateway.config.ts`)
   - Pattern: `src/gateway/**/*.test.ts`
   - Purpose: Gateway control plane tests
   - Example: `src/gateway/server.test.ts`

4. **E2E** (`vitest.e2e.config.ts`)
   - Pattern: `src/**/*.e2e.test.ts`
   - Purpose: WebSocket/HTTP, node pairing, multi-instance
   - Example: `src/gateway/server.e2e.test.ts`

5. **Live** (`vitest.live.config.ts`)
   - Pattern: `src/**/*.live.test.ts`
   - Purpose: Real provider/model tests (requires credentials)
   - Example: `src/agents/models.profiles.live.test.ts`

## Quick Commands

### Standard Test Runs

```bash
# All tests (parallel: unit + extensions + gateway)
pnpm test

# E2E tests (networking, multi-instance)
pnpm test:e2e

# Live tests (real providers, costs money/quotas)
pnpm test:live

# Coverage report (70% required)
pnpm test:coverage

# Watch mode for active development
pnpm test:watch
```

### Narrow Test Execution (Faster Iteration)

```bash
# Run specific file
pnpm test -- src/config/config.test.ts

# Run specific test case
pnpm test -- src/config/config.test.ts -t "loads default config"

# Run multiple related files
pnpm test -- src/config src/security/crypto.test.ts

# Watch specific file during development
pnpm test:watch -- src/agents/tools/my-tool.test.ts

# Run all tests in a directory
pnpm test -- src/agents/tools

# Run tests matching pattern
pnpm test -- src/agents/tools/*tool*.test.ts
```

### Docker Test Suites

```bash
# All Docker tests
pnpm test:docker:all

# Specific Docker tests
pnpm test:docker:live-models      # Live model tests
pnpm test:docker:live-gateway     # Gateway + models
pnpm test:docker:onboard          # Onboarding flow
pnpm test:docker:plugins          # Plugin tests
pnpm test:docker:cleanup          # Cleanup
```

## Test Parallelization

`pnpm test` runs `scripts/test-parallel.mjs`:

- **Parallel runs**: Unit + Extensions (on Linux/macOS)
- **Serial runs**: Gateway (to avoid WebSocket flakes on Windows)
- **Adaptive workers**: Allocates workers based on CPU count
- **Windows CI**: Uses sharding + serial execution

## Pre-Push Workflow

```bash
# Complete quality gate (before pushing)
pnpm build && pnpm check && pnpm test

# With coverage check
pnpm build && pnpm check && pnpm test:coverage

# Include e2e tests
pnpm build && pnpm check && pnpm test && pnpm test:e2e
```

## Debugging Test Failures

### Isolate the failure

```bash
# Run only the failing test file
pnpm test -- path/to/failing.test.ts

# Run only the failing test case
pnpm test -- path/to/failing.test.ts -t "exact test name"

# Run with verbose output
pnpm test -- path/to/failing.test.ts --reporter=verbose

# Run without parallelism
pnpm test -- path/to/failing.test.ts --no-threads
```

### Check test type

```bash
# If networking tests fail
pnpm test:e2e -- path/to/test.e2e.test.ts

# If provider integration fails
pnpm test:live -- path/to/test.live.test.ts
```

### Common Issues

**Port conflicts**: Gateway tests bind to ports, ensure no other instance running

```bash
lsof -i :18789  # Check if port in use
pkill -f closedclaw  # Kill stray processes
```

**Stale lock files**: Clean up gateway lock files

```bash
rm ~/.closedclaw/gateway.lock
```

**Timeout issues**: Increase timeout for slow operations

```typescript
it("slow operation", { timeout: 30000 }, async () => {
  // ... test
});
```

**Flaky tests**: Run multiple times to verify

```bash
pnpm test -- path/to/flaky.test.ts --repeat=10
```

## Coverage Requirements

Coverage enforced at **70%** for:

- Lines
- Branches
- Functions
- Statements

### Check coverage

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html

# Check specific file coverage
pnpm test:coverage -- src/agents/tools/my-tool.test.ts
```

### Improve coverage

```typescript
// Cover error paths
it("handles errors", async () => {
  await expect(fn()).rejects.toThrow();
});

// Cover branches
it("handles true case", () => {
  /* ... */
});
it("handles false case", () => {
  /* ... */
});

// Cover optional parameters
it("works without options", () => {
  /* ... */
});
it("works with options", () => {
  /* ... */
});
```

## Live Tests

Live tests use **real providers** and cost money/quotas. Use sparingly.

### Environment Setup

Live tests source `~/.profile` for credentials:

```bash
# In ~/.profile or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export ClosedClaw_LIVE_ANTHROPIC_KEYS="sk-ant-1,sk-ant-2,sk-ant-3"
```

### Running Live Tests

```bash
# Enable live tests
ClosedClaw_LIVE_TEST=1 pnpm test:live

# Or use the script (sources ~/.profile)
pnpm test:live

# Narrow to specific provider
pnpm test:live -- src/agents/models.profiles.live.test.ts -t "anthropic"

# Narrow to specific model
pnpm test:live -- src/agents/models.profiles.live.test.ts -t "opus-4"
```

### Key Rotation

Use multiple API keys to avoid rate limits:

```bash
# In ~/.profile
export ClosedClaw_LIVE_ANTHROPIC_KEYS="key1,key2,key3"
export ClosedClaw_LIVE_OPENAI_KEYS="key1,key2,key3"
```

Tests will rotate through keys automatically.

## File Naming Conventions

Choose correct suffix for test type:

- `*.test.ts` → Unit/integration tests (fast, no network)
- `*.e2e.test.ts` → End-to-end tests (networking, multi-instance)
- `*.live.test.ts` → Live provider tests (real credentials, costs money)

## Mock Patterns

### Mock Config

```typescript
import type { ClosedClawConfig } from "../../config/config.js";

const mockConfig: ClosedClawConfig = {
  myTool: {
    enabled: true,
    apiKey: "test-key",
  },
};
```

### Mock Functions

```typescript
import { vi } from "vitest";

const mockFn = vi.fn().mockResolvedValue({ success: true });
const spyFn = vi.spyOn(obj, "method").mockReturnValue("value");

// Verify calls
expect(mockFn).toHaveBeenCalledWith(expectedArg);
expect(mockFn).toHaveBeenCalledTimes(1);
```

### Mock Modules

```typescript
vi.mock("./external-service.js", () => ({
  externalFunction: vi.fn().mockResolvedValue("mocked"),
}));
```

## Test Helpers

Located in `src/test-helpers/` and `src/gateway/test-helpers.e2e.ts`:

```typescript
// Gateway test helpers (e2e only)
import { createTestGateway, waitForGatewayReady } from "../test-helpers.e2e.js";

// Start test gateway
const gateway = await createTestGateway({ port: 18790 });
await waitForGatewayReady(gateway);

// Cleanup
await gateway.stop();
```

## CI Test Strategy

### GitHub Actions

Tests run on:

- **Linux**: Full parallel execution
- **macOS**: Reduced workers (avoid OOM)
- **Windows**: Sharded + serial gateway tests

### Environment Variables

```bash
# CI detection
CI=true
GITHUB_ACTIONS=true
RUNNER_OS=Linux|Windows|macOS

# Test control
ClosedClaw_TEST_SHARDS=2        # Number of shards (Windows)
ClosedClaw_TEST_WORKERS=4       # Override worker count
ClosedClaw_LIVE_TEST=1          # Enable live tests
```

## Troubleshooting

### Tests hang

```bash
# Check for leaked processes
ps aux | grep closedclaw

# Kill all processes
pkill -f closedclaw

# Check for orphaned ports
lsof -i :18789-18799
```

### Tests fail in CI but pass locally

- Check platform-specific behavior (Windows vs Linux)
- Verify environment variables are set
- Review CI logs for timing issues
- Consider rate limits or network issues

### Coverage too low

```bash
# Find uncovered files
pnpm test:coverage

# Open HTML report to see coverage details
open coverage/index.html

# Add tests for uncovered branches/lines
```

### Live tests fail

- Check credentials in `~/.profile`
- Verify API keys are valid
- Check rate limits and quotas
- Try with single key (no rotation)
- Use `--reporter=verbose` for details

## Best Practices

1. **Run narrow tests during development**: Use `pnpm test -- path/to/file.test.ts` for fast iteration
2. **Use watch mode**: `pnpm test:watch` automatically reruns on changes
3. **Check coverage before PR**: `pnpm test:coverage` ensures 70% threshold
4. **Avoid live tests in dev**: Save provider calls for CI or debugging
5. **Name tests clearly**: Use descriptive test names with "should" or "handles"
6. **Test error paths**: Don't just test happy paths
7. **Keep tests isolated**: No shared state between tests
8. **Mock external dependencies**: Use `vi.mock()` for external services
9. **Use meaningful assertions**: Prefer specific matchers over toBeTruthy()
10. **Clean up resources**: Close connections, delete temp files

## Checklist

- [ ] Tests pass locally: `pnpm test`
- [ ] Coverage meets threshold: `pnpm test:coverage`
- [ ] E2E tests pass (if applicable): `pnpm test:e2e`
- [ ] Tests are isolated (no shared state)
- [ ] Tests have descriptive names
- [ ] Error cases are covered
- [ ] Mocks are used for external dependencies
- [ ] Resources are cleaned up (files, connections)
- [ ] Tests run in reasonable time (< 30s for unit tests)
- [ ] No console.log left in tests (use expect)

## Related Files

- `vitest.config.ts` - Base Vitest config
- `vitest.unit.config.ts` - Unit test config
- `vitest.extensions.config.ts` - Extension test config
- `vitest.gateway.config.ts` - Gateway test config
- `vitest.e2e.config.ts` - E2E test config
- `vitest.live.config.ts` - Live test config
- `scripts/test-parallel.mjs` - Parallel test runner
- `docs/testing.md` - Detailed testing guide
