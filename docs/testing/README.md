# Testing Documentation

This directory contains testing-related documentation, guides, and reports.

## Structure

### Guides (`*.md` files)
- **TEST-FIXES-GUIDE.md** — Comprehensive guide to test fixes and patterns used in the codebase

### Reports (`reports/` directory)
- **TEST-FIXES-2026-02-11.md** — Detailed documentation of all test failures fixed on 2026-02-11, including root causes and patterns

## Quick Links

- **Test Execution**: See `pnpm test` commands in main README
- **Coverage Requirements**: 70% lines/branches/functions/statements (see vitest.config.ts)
- **Test Configs**: Five Vitest configs in root:
  - `vitest.unit.config.ts` — Unit tests (fast, no real keys)
  - `vitest.extensions.config.ts` — Plugin tests
  - `vitest.gateway.config.ts` — Gateway control plane tests
  - `vitest.e2e.config.ts` — WebSocket/HTTP, node pairing
  - `vitest.live.config.ts` — Real provider tests (requires credentials)

## Key Patterns

See TEST-FIXES-2026-02-11.md for detailed patterns:

1. **Vi.Hoisting** — Mock variable declaration for factory functions
2. **ImportOriginal** — Preserve original exports with custom overrides
3. **Module-Level Capture** — Hoisted vi.mock + dynamic import for module state
4. **RuntimeEnv** — CLI command API (void return, `runtime.log()` output)
5. **Plugin Adapters** — Unified `deliverOutboundPayloads` API for outbound delivery

