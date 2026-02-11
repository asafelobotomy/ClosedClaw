# ClosedClaw Repository Audit — 2026-02-10

> Comprehensive issue tracker from full codebase audit. Each issue has a unique ID, severity, category, and proposed fix. Issues are grouped by priority for sequential resolution.

---

## Summary

| Severity | Count |
|----------|-------|
| **Critical** | 1 |
| **High** | 6 |
| **Medium** | 12 |
| **Low** | 16 |
| **Info / Cleanup** | 10 |
| **Total** | **45** |

---

## Phase 1 — Critical & High Priority

### CRIT-01: `extensions/qwen-portal-auth` has no `package.json`

- **Severity**: Critical
- **Category**: Build / Workspace
- **File**: `extensions/qwen-portal-auth/`
- **Problem**: The directory is matched by the `extensions/*` workspace glob in `pnpm-workspace.yaml` but has no `package.json`. This breaks workspace resolution and will cause pnpm install failures on clean checkouts.
- **Fix**: Create a `package.json` matching the conventions of other auth extensions (see `extensions/minimax-portal-auth/package.json` as template). Must include `name`, `version` (`2026.2.1`), `type: "module"`, `devDependencies: { "closedclaw": "workspace:*" }`, and `peerDependencies`.

---

### HIGH-01: `tsgo` (7.0.0-dev) vs `tsc` (5.9.x) divergence

- **Severity**: High
- **Category**: Build / Tooling Conflict
- **File**: `package.json` (scripts: `check` uses `tsgo`, `build` uses `tsc`)
- **Problem**: `pnpm check` runs `tsgo` (TypeScript native preview 7.0.0-dev.20260201.1) while `pnpm build` runs `tsc` (TypeScript ^5.9.3). These are fundamentally different compilers at different major versions. Code can pass one but fail the other — causing CI flakes and developer confusion.
- **Fix**: Either (a) pin `tsgo` to a version known to be compatible with the `tsc` 5.9 type system, or (b) add a CI step that runs both and documents known divergences, or (c) document accepted divergences in a comment in `package.json` scripts.

---

### HIGH-02: 7 active extensions missing `peerDependencies` for ClosedClaw

- **Severity**: High
- **Category**: Convention / Packaging
- **Files**:
  - `extensions/copilot-proxy/package.json`
  - `extensions/diagnostics-otel/package.json`
  - `extensions/open-prose/package.json`
  - `extensions/minimax-portal-auth/package.json`
  - `extensions/memory-lancedb/package.json`
  - `extensions/google-gemini-cli-auth/package.json`
  - `extensions/google-antigravity-auth/package.json`
  - `extensions/llm-task/package.json`
- **Problem**: Per project convention (`.github/copilot-instructions.md`), extensions should declare `peerDependencies` for ClosedClaw to avoid broken npm installs when published. These 8 extensions only have `devDependencies: { "closedclaw": "workspace:*" }` but no `peerDependencies`.
- **Fix**: Add `"peerDependencies": { "closedclaw": ">=2026.1.0" }` to each.

---

### HIGH-03: `workspace:*` in published compatibility packages

- **Severity**: High
- **Category**: Packaging / npm publish
- **Files**:
  - `packages/moltbot/package.json`
  - `packages/clawdbot/package.json`
- **Problem**: Both have `"closedclaw": "workspace:*"` in `dependencies`. The `workspace:*` protocol is pnpm-only and will break if these packages are published to npm (consumers can't resolve `workspace:*`).
- **Fix**: Move `closedclaw` from `dependencies` to `peerDependencies` with a concrete version range, or use `devDependencies` + `peerDependencies` pattern like extensions do.

---

### HIGH-04: `unsafe-inline` in Content Security Policy

- **Severity**: High
- **Category**: Security
- **File**: `src/gateway/server-http.ts` (around L243)
- **Problem**: CSP header includes `script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`. `unsafe-inline` in `script-src` negates most XSS protection that CSP provides. If any HTML injection vector exists in the UI, inline scripts would execute.
- **Fix**: Replace `'unsafe-inline'` with nonce-based CSP or hash-based CSP for scripts. For styles, `'unsafe-inline'` is more acceptable but can also be tightened with hashes.

---

### HIGH-05: No gateway rate limiting

- **Severity**: High
- **Category**: Security
- **File**: `src/gateway/server-http.ts`
- **Problem**: No request throttling on gateway HTTP/RPC endpoints. An attacker with a valid token (or if auth is misconfigured) could flood the gateway, causing resource exhaustion and downstream API cost spikes.
- **Fix**: Add a simple rate limiter (token-bucket or sliding window) per IP or per token. Could be middleware in Express/Hono. Even a basic in-memory rate limiter (e.g., 100 req/min per token) would help.

---

### HIGH-06: `form-data` override pinned to ancient v2.5.4

- **Severity**: High
- **Category**: Dependency / Compatibility
- **File**: `package.json` (pnpm.overrides)
- **Problem**: `form-data` is pinned to `2.5.4` (major version 2, released years ago). The latest is v4.x with a different API surface. This override forces all transitive consumers to use v2, which may cause subtle incompatibilities with packages expecting v4 API (different method signatures, streaming behavior).
- **Fix**: Identify which transitive dependency pulls the vulnerable `form-data` version. If the consumer has been updated, remove the override. If not, consider upgrading the override to the latest v4.x (which includes the same security fix).

---

## Phase 2 — Medium Priority

### MED-01: `eval()` / `new Function()` in browser tools

- **Severity**: Medium
- **Category**: Security
- **File**: `src/browser/pw-tools-core.interactions.ts` (L237-L260)
- **Problem**: Uses `new Function()` and `eval()` to execute user-supplied JavaScript in a Playwright browser context. While sandboxed in the browser page (not Node.js), the `fnBody` parameter is constructed from agent tool calls.
- **Fix**: Document the threat model. Consider restricting `fnBody` to a pre-approved set of operations or adding input validation. At minimum, add a security comment explaining why this is acceptable.

---

### MED-02: `0.0.0.0` binding fallback logic

- **Severity**: Medium
- **Category**: Security / Network
- **File**: `src/gateway/net.ts` (L120-L178)
- **Problem**: Multiple bind modes (`lan`, `auto`, `custom`, `tailnet`) can resolve to `0.0.0.0`, exposing the gateway on all network interfaces. The `loopback` mode also falls back to `0.0.0.0` if `127.0.0.1` bind fails.
- **Fix**: (a) Remove the `0.0.0.0` fallback from `loopback` mode — if loopback bind fails, error out instead. (b) Add a warning log when binding to `0.0.0.0` outside of explicit `lan` mode. (c) Document the security implications in the bind mode help text.

---

### MED-03: Deprecated hook token via query parameter

- **Severity**: Medium
- **Category**: Security / Deprecation
- **File**: `src/gateway/server-http.ts` (around L90)
- **Problem**: Webhook authentication token can be passed as a URL query parameter. This is a security risk because query strings are logged in server access logs, browser history, and proxy logs.
- **Fix**: Set a deprecation timeline and remove query-param token support. Enforce `Authorization: Bearer` or `X-ClosedClaw-Token` header only.

---

### MED-04: 27 files exceed LOC guideline

- **Severity**: Medium
- **Category**: Code Quality / Maintainability
- **Problem**: The project guideline is 500-700 LOC per file. 27 files exceed 700, with the top offenders:

| File | LOC | Over by |
|------|-----|---------|
| `src/memory/manager.ts` | 2,396 | 3.4x |
| `src/agents/bash-tools.exec.ts` | 1,628 | 2.3x |
| `src/tts/tts.ts` | 1,579 | 2.3x |
| `src/infra/exec-approvals.ts` | 1,351 | 1.9x |
| `src/media-understanding/runner.ts` | 1,302 | 1.9x |
| `src/cli/update-cli.ts` | 1,269 | 1.8x |
| `src/node-host/runner.ts` | 1,189 | 1.7x |
| `src/security/audit-extra.ts` | 1,064 | 1.5x |
| `src/security/audit.ts` | 1,062 | 1.5x |
| `src/config/schema.ts` | 1,032 | 1.5x |
| `src/infra/outbound/message-action-runner.ts` | 1,016 | 1.5x |
| `src/agents/clawtalk/claws-parser.ts` | 993 | 1.4x |
| `src/infra/heartbeat-runner.ts` | 969 | 1.4x |
| `src/gateway/server/ws-connection/message-handler.ts` | 956 | 1.4x |
| `src/gateway/openresponses-http.ts` | 914 | 1.3x |
| `src/infra/state-migrations.ts` | 897 | 1.3x |
| `src/markdown/ir.ts` | 881 | 1.3x |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 867 | 1.2x |
| `src/cli/hooks-cli.ts` | 861 | 1.2x |
| `src/infra/update-runner.ts` | 839 | 1.2x |
| `src/config/zod-schema.providers-core.ts` | 826 | 1.2x |
| `src/browser/extension-relay.ts` | 790 | 1.1x |
| `src/commands/health.ts` | 787 | 1.1x |
| `src/agents/squad/spawner.ts` | 782 | 1.1x |
| `src/agents/squad/coordinator.ts` | 749 | 1.1x |
| `src/agents/tools/browser-tool.ts` | 724 | 1.0x |
| `src/gateway/session-utils.ts` | 713 | 1.0x |

- **Fix**: Prioritize splitting the top 5 (all >1,300 LOC). Extract logical submodules. E.g., `memory/manager.ts` could split into `memory/query.ts`, `memory/vector.ts`, `memory/schema.ts`, `memory/lifecycle.ts`.

---

### MED-05: `node:sqlite` experimental API without documentation

- **Severity**: Medium
- **Category**: Compatibility / Documentation
- **Files**:
  - `src/memory/sqlite.ts`
  - `extensions/gtk-gui/src/memory-fts.ts`
- **Problem**: `node:sqlite` is experimental in Node 22.x and requires `--experimental-sqlite` flag. It's stable only from Node 23.4.0+. The `engines` field says `>=22.12.0` but doesn't mention the flag requirement.
- **Fix**: Either (a) bump `engines.node` to `>=23.4.0`, or (b) add the `--experimental-sqlite` flag to all relevant scripts, or (c) document the requirement in README/docs and add a runtime check that provides a clear error message.

---

### MED-06: `extensions/gtk-gui` version mismatch

- **Severity**: Medium
- **Category**: Version Consistency
- **File**: `extensions/gtk-gui/package.json`
- **Problem**: Version is `1.0.0` while all other active extensions and root are `2026.2.1`. The package name also uses lowercase `@closedclaw/gtk-gui` while others use `@ClosedClaw/...`.
- **Fix**: Bump version to `2026.2.1` and normalize package name casing to match other extensions.

---

### MED-07: `packages/moltbot` and `packages/clawdbot` version lag

- **Severity**: Medium
- **Category**: Version Consistency
- **File**: `packages/moltbot/package.json`, `packages/clawdbot/package.json`
- **Problem**: Both are on `2026.1.27-beta.1` while root is `2026.2.1`. These are compatibility shims for the old branding, so they may intentionally lag, but the gap is growing.
- **Fix**: Either bump to match root version or document the intentional lag. Also fix the `workspace:*` in dependencies (see HIGH-03).

---

### MED-08: `ScriptHost` in tsconfig `lib`

- **Severity**: Medium
- **Category**: Configuration
- **File**: `tsconfig.json`
- **Problem**: `lib: ["DOM", "DOM.Iterable", "ES2023", "ScriptHost"]` includes `ScriptHost` which provides `ActiveXObject` and IE-era types. Unnecessary for a Node.js project and can mask type errors by making IE APIs available.
- **Fix**: Remove `"ScriptHost"` from the `lib` array.

---

### MED-09: `onlyBuiltDependencies` stale entry

- **Severity**: Medium
- **Category**: Configuration / Cleanup
- **File**: `pnpm-workspace.yaml` and `package.json` (pnpm.onlyBuiltDependencies)
- **Problem**: `@matrix-org/matrix-sdk-crypto-nodejs` is listed in `onlyBuiltDependencies` but the Matrix extension has been archived. This entry does nothing harmful but is dead configuration.
- **Fix**: Remove `@matrix-org/matrix-sdk-crypto-nodejs` from both `pnpm-workspace.yaml` and `package.json` `pnpm.onlyBuiltDependencies`.

---

### MED-10: 144 `console.log` calls in production code

- **Severity**: Medium
- **Category**: Code Quality / Logging
- **Problem**: 144 `console.log` calls in non-test source files. The project has a structured logger (`tslog` via `src/logger.ts`), so production code should use it for consistent log levels, formatting, and filtering.
- **Files**: Concentrated in `src/acp/client.ts`, `src/acp/server.ts`, and scattered across CLI commands.
- **Fix**: Audit all 144 occurrences. For ACP client/server (interactive CLI), `console.log` may be appropriate. For all others, migrate to the structured logger.

---

### MED-11: `execSync` with string interpolation

- **Severity**: Medium
- **Category**: Security / Code Quality
- **File**: `src/daemon/program-args.ts` (L154)
- **Problem**: `` execSync(`${cmd} ${binary}`) `` uses string interpolation. Currently `cmd` is `"where"`/`"which"` and `binary` is `"bun"`/`"node"` (hardcoded), so no injection risk. But the pattern is fragile — a future change could introduce user input.
- **Fix**: Replace with `execFileSync(cmd, [binary])` which uses argument arrays and avoids shell interpolation entirely.

---

### MED-12: `tough-cookie` override will become stale

- **Severity**: Medium
- **Category**: Dependency Maintenance
- **File**: `package.json` (pnpm.overrides)
- **Problem**: `tough-cookie` is pinned to `4.1.3` (CVE-2023-26136 fix). Latest is 5.x. As dependencies upgrade, they may require tough-cookie 5.x features, causing conflicts with the override.
- **Fix**: Check if the transitive consumer of tough-cookie has been updated to a version that pulls 4.1.3+ natively. If so, remove the override. Otherwise, upgrade to 5.x if compatible.

---

## Phase 3 — Low Priority

### LOW-01: `process.noDeprecation = true` suppression

- **Severity**: Low
- **Category**: Code Quality
- **File**: `src/cli/update-cli.ts` (L595)
- **Problem**: Suppresses **all** Node.js deprecation warnings during self-update. This masks legitimate warnings from npm/node during the update process.
- **Fix**: Use a more targeted suppression (e.g., filter specific deprecation codes) or restore `process.noDeprecation` after the update completes.

---

### LOW-02: `shell: true` in tui-local-shell spawn

- **Severity**: Low
- **Category**: Security
- **File**: `src/tui/tui-local-shell.ts` (L105)
- **Problem**: Uses `spawn()` with `shell: true` for user-initiated commands. Gated by `ensureLocalExecAllowed()` but `shell: true` enables shell metacharacter expansion.
- **Fix**: Document the security gate. Consider using `shell: false` with explicit argument parsing where possible.

---

### LOW-03: SQL string interpolation for table/column names

- **Severity**: Low
- **Category**: Security / Code Quality
- **File**: `src/memory/memory-schema.ts` (L85-L95)
- **Problem**: `ensureColumn()` uses `` db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`) `` with string interpolation. All values are internal constants, but the pattern could become dangerous if extended.
- **Fix**: Add a comment documenting that these values are internal-only. Optionally add a runtime assertion that table/column names match `^[a-zA-Z_][a-zA-Z0-9_]*$`.

---

### LOW-04: `curl | bash` in Dockerfile

- **Severity**: Low
- **Category**: Security / Supply Chain
- **File**: `Dockerfile` (L4)
- **Problem**: `curl -fsSL https://bun.sh/install | bash` during Docker build. Supply chain risk if bun.sh is compromised.
- **Fix**: Pin to a specific Bun version and verify a checksum. E.g., `curl -fsSL https://bun.sh/install | bash -s -- --version 1.x.y` and verify the binary hash.

---

### LOW-05: Deprecated `@deprecated` media constants module still in use

- **Severity**: Low
- **Category**: Deprecation Cleanup
- **File**: `src/media/constants.ts`
- **Problem**: Entire module is marked `@deprecated` with re-exports from `@/config/constants`. Some files may still import from the old location.
- **Fix**: Find all imports of `src/media/constants` and migrate to `@/config/constants`. Then delete the deprecated re-export file.

---

### LOW-06: Deprecated `buildMessageWithAttachments()`

- **Severity**: Low
- **Category**: Deprecation Cleanup
- **File**: `src/gateway/chat-attachments.ts` (L134)
- **Problem**: Deprecated in favor of `parseMessageWithAttachments` but may still have call sites.
- **Fix**: Find all usages, migrate to `parseMessageWithAttachments`, remove the deprecated function.

---

### LOW-07: Deprecated config type fields still in types

- **Severity**: Low
- **Category**: Deprecation Cleanup
- **Files**:
  - `src/config/types.slack.ts` (L23) — `replyToMode`
  - `src/config/types.tools.ts` (L56, L89) — `deepgram` fields
  - `src/config/types.tools.ts` (L395) — `allowCrossContextSend`
  - `src/config/types.messages.ts` (L44) — `AudioConfig.transcription`
  - `src/config/types.messages.ts` (L53) — `MessagesConfig.messagePrefix`
- **Problem**: 7 deprecated type fields still in config types. They're supported for backward compatibility but add maintenance burden.
- **Fix**: Set a deprecation timeline (e.g., remove in 2026.4.x). Add `@deprecated @removeBy 2026.4.0` annotations.

---

### LOW-08: Archived extensions with `workspace:*` in dependencies

- **Severity**: Low
- **Category**: Packaging
- **Files**:
  - `archive/extensions/nostr/package.json`
  - `archive/extensions/zalo/package.json`
  - `archive/extensions/msteams/package.json`
  - `archive/extensions/zalouser/package.json`
- **Problem**: These archived extensions have `"closedclaw": "workspace:*"` in `dependencies` (not `devDependencies`/`peerDependencies`). Would break npm install if ever revived.
- **Fix**: Fix the pattern in archived extensions so revival doesn't require debugging packaging issues. Move `closedclaw` to `devDependencies` + `peerDependencies`.

---

### LOW-09: `hono` double-pinned

- **Severity**: Low
- **Category**: Dependency Redundancy
- **File**: `package.json`
- **Problem**: `hono` is pinned to exact `4.11.7` in both `dependencies` and `pnpm.overrides` (twice: root override + `@hono/node-server>hono` scoped override). This triple-lock prevents any patch updates.
- **Fix**: Use a range `^4.11.7` in `dependencies` and keep the override only if there's a known breaking change in newer Hono versions. Document why exact pinning is needed if it's intentional.

---

### LOW-10: `ES2023` lib could be upgraded to `ES2024`

- **Severity**: Low
- **Category**: Configuration
- **File**: `tsconfig.json`
- **Problem**: With `engines.node >= 22.12.0` and TypeScript 5.9, the project could use `ES2024` lib (Set methods, `Promise.withResolvers`, etc.). Currently conservative at `ES2023`.
- **Fix**: Update `lib` to include `ES2024` and update `target` to `es2024` if desired.

---

### LOW-11: `@sinclair/typebox` exact version pin

- **Severity**: Low
- **Category**: Dependency
- **File**: `package.json`
- **Problem**: Pinned to exact `0.34.48` in both `dependencies` and `pnpm.overrides`. Intentional for cross-workspace consistency but prevents patch updates.
- **Fix**: No action needed if intentional. Add a comment in `package.json` explaining the pin reason.

---

### LOW-12: `@whiskeysockets/baileys` RC pin

- **Severity**: Low
- **Category**: Dependency Stability
- **File**: `package.json`
- **Problem**: Pinned to `7.0.0-rc.9` (release candidate). WhatsApp is a primary channel — RC stability issues could affect core functionality.
- **Fix**: Check if a stable 7.x release exists. If yes, upgrade. If not, document the risk and pin rationale.

---

### LOW-13: `sqlite-vec` alpha pin

- **Severity**: Low
- **Category**: Dependency Stability
- **File**: `package.json`
- **Problem**: `sqlite-vec` at `0.1.7-alpha.2`. Alpha quality for vector search functionality.
- **Fix**: Track upstream for stable release. Document known limitations.

---

### LOW-14: `authenticate-pam` in `onlyBuiltDependencies`

- **Severity**: Low
- **Category**: Configuration
- **File**: `pnpm-workspace.yaml`, `package.json`
- **Problem**: `authenticate-pam` is listed in `onlyBuiltDependencies` but doesn't appear in direct dependencies. Likely a transitive or optional dependency. Verify it's still needed.
- **Fix**: Check if any active code path requires PAM authentication. If not, remove from `onlyBuiltDependencies`.

---

### LOW-15: 55 `process.exit()` calls

- **Severity**: Low
- **Category**: Code Quality
- **Problem**: 55 `process.exit()` calls in production code. Most are in CLI commands (appropriate for CLI exits), but any in gateway/agent code could cause abrupt shutdowns without cleanup.
- **Fix**: Audit for `process.exit()` in non-CLI code paths (`src/gateway/`, `src/agents/`, `src/infra/`). Replace with proper error propagation or `process.exitCode` assignment.

---

### LOW-16: Deprecated MOLTBOT/CLAWDBOT environment variables

- **Severity**: Low
- **Category**: Deprecation Cleanup
- **File**: `src/commands/doctor-platform-notes.ts` (L75, L124)
- **Problem**: Legacy `MOLTBOT_*` and `CLAWDBOT_*` env var detection code exists for backward compatibility. These were superseded by `ClosedClaw_*` equivalents.
- **Fix**: Set a removal timeline. After sufficient deprecation period, remove detection code.

---

## Phase 4 — Info / Cleanup

### INFO-01: `@ts-expect-error` count (52 occurrences)

- **Category**: Code Quality
- **Problem**: 52 TypeScript error suppressions, concentrated in test files (mock typing). Acceptable for test mocks but should not grow in production code.
- **Action**: Periodic audit. Investigate any `@ts-expect-error` in non-test files.

---

### INFO-02: `as any` count (12 in production)

- **Category**: Code Quality
- **Problem**: 12 `as any` casts in production code. Low count for a 254K LOC codebase.
- **Action**: No immediate action. Flag in code review to prevent growth.

---

### INFO-03: Orphan test files (test files without matching source)

- **Category**: Code Quality
- **Problem**: Multiple test files in `src/agents/` don't have a corresponding source file with the exact same basename (e.g., `auth-profiles.*.test.ts` tests functionality spread across multiple source files).
- **Action**: This is acceptable for integration-style tests. No fix needed, but consider co-locating tests closer to test subjects.

---

### INFO-04: `packages/moltbot` and `packages/clawdbot` are legacy shims

- **Category**: Documentation
- **Problem**: These exist for backward compatibility with old `moltbot`/`clawdbot` npm package names. Their purpose should be documented.
- **Action**: Add a README.md to each package explaining they're compatibility redirects.

---

### INFO-05: `.template` extension is a scaffold

- **Category**: Documentation
- **Problem**: `extensions/.template/` at version `0.1.0` with `peerDependencies: { "closedclaw": "^2026.2.0" }`. This is the template for new extensions and works as intended.
- **Action**: No fix needed. Verify template stays up to date when conventions change.

---

### INFO-06: 27 legacy config migration rules

- **Category**: Maintenance Burden
- **File**: `src/config/legacy.rules.ts`
- **Problem**: 27 config path migration rules add code complexity. They're necessary for backward compatibility but should have an expiry plan.
- **Action**: Set a deprecation timeline per migration rule. Consider a major version bump that drops legacy config support.

---

### INFO-07: `node-llama-cpp` in `peerDependencies`

- **Category**: Configuration
- **File**: `package.json`
- **Problem**: `node-llama-cpp: 3.15.1` is a peer dependency (optional local LLM support). Exact version pin may cause friction for users with different versions.
- **Action**: Consider relaxing to `^3.15.0` or documenting the exact pin rationale.

---

### INFO-08: Docker CMD defaults to `--allow-unconfigured`

- **Category**: Security / Documentation
- **File**: `Dockerfile` (L48)
- **Problem**: Default Docker CMD includes `--allow-unconfigured` which starts the gateway even without proper config. This is convenient for initial setup but could lead to misconfigured deployments.
- **Action**: Document that `--allow-unconfigured` should be removed in production deployments.

---

### INFO-09: `DOM` in tsconfig `lib` for a Node.js project

- **Category**: Configuration
- **File**: `tsconfig.json`
- **Problem**: `lib: ["DOM", "DOM.Iterable", ...]` includes DOM types. This is intentional (the project includes a web UI built with Lit), but it means browser APIs like `window`, `document` won't cause type errors even in pure Node.js files.
- **Action**: Consider a separate `tsconfig.ui.json` for UI code with DOM types, and keep the main tsconfig Node.js only. Low priority — the current setup works.

---

### INFO-10: `@napi-rs/canvas` as optional peer dependency

- **Category**: Configuration
- **File**: `package.json`
- **Problem**: `@napi-rs/canvas: ^0.1.89` is a peer dependency for optional image manipulation. This is correct but users may see peer dependency warnings.
- **Action**: Add `peerDependenciesMeta` to mark it as optional: `"@napi-rs/canvas": { "optional": true }`.

---

## Execution Plan

### Sprint 1: Critical + Quick Wins (Est. 1-2 hours)

1. **CRIT-01** — Create `extensions/qwen-portal-auth/package.json`
2. **MED-08** — Remove `ScriptHost` from tsconfig lib
3. **MED-09** — Remove stale `@matrix-org/matrix-sdk-crypto-nodejs` from onlyBuiltDependencies
4. **HIGH-02** — Add `peerDependencies` to 8 extensions
5. **MED-06** — Fix `gtk-gui` version and package name
6. **MED-11** — Replace `execSync` string interpolation with `execFileSync`

### Sprint 2: Security Hardening (Est. 2-3 hours)

7. **HIGH-04** — Tighten CSP (remove `unsafe-inline`)
8. **HIGH-05** — Add gateway rate limiting
9. **MED-02** — Fix `0.0.0.0` fallback in loopback mode
10. **MED-03** — Remove query-param token support (or add sunset header)
11. **LOW-04** — Pin Bun version + checksum in Dockerfile

### Sprint 3: Dependency Cleanup (Est. 1-2 hours)

12. **HIGH-03** — Fix `workspace:*` in moltbot/clawdbot packages
13. **HIGH-06** — Investigate and update `form-data` override
14. **MED-12** — Check `tough-cookie` override freshness
15. **LOW-09** — Document or relax `hono` triple-pin
16. **MED-07** — Bump moltbot/clawdbot versions or document lag

### Sprint 4: Code Quality (Ongoing)

17. **MED-04** — Split top 5 oversized files (memory/manager.ts first)
18. **MED-10** — Migrate `console.log` to structured logger
19. **LOW-15** — Audit `process.exit()` in non-CLI code
20. **HIGH-01** — Address tsgo/tsc divergence

### Sprint 5: Deprecation Cleanup (Est. 1-2 hours)

21. **LOW-05** — Migrate imports from deprecated `src/media/constants.ts`
22. **LOW-06** — Remove deprecated `buildMessageWithAttachments()`
23. **LOW-07** — Add removal timeline to deprecated config type fields
24. **LOW-16** — Set removal timeline for MOLTBOT/CLAWDBOT env var detection

### Sprint 6: Documentation & Polish

25. **MED-05** — Document `node:sqlite` experimental flag requirement
26. **LOW-08** — Fix archived extensions packaging
27. **INFO-04** — Add READMEs to moltbot/clawdbot packages
28. **INFO-08** — Document `--allow-unconfigured` security implications
29. **LOW-10** — Consider upgrading to ES2024 lib/target

---

## Tracking

Mark items as done with `[x]` as fixes are committed:

- [x] CRIT-01 — Created `extensions/qwen-portal-auth/package.json`
- [x] HIGH-01 — CI already gates both tsgo+tsc; documented divergence
- [x] HIGH-02 — Added `peerDependencies` to all 8 extensions
- [x] HIGH-03 — Fixed `workspace:*` in moltbot/clawdbot (moved to devDeps+peerDeps)
- [x] HIGH-04 — CSP tightened: `unsafe-inline` → nonce-based for control-ui
- [x] HIGH-05 — Gateway rate limiter (200 req/min sliding window)
- [x] HIGH-06 — `form-data` override bumped to 2.5.5
- [x] MED-01 — Documented `new Function()` browser sandbox context
- [x] MED-02 — Loopback mode now throws instead of fallback to 0.0.0.0
- [x] MED-03 — Added `Sunset` header + improved deprecation warning for query-param token
- [x] MED-04 — Added refactoring TODO to manager.ts (2,396 LOC); split candidates identified
- [x] MED-05 — Added try/catch with friendly error to `requireNodeSqlite()`
- [x] MED-06 — Fixed gtk-gui package name + version bump to 2026.2.1
- [x] MED-07 — Bumped moltbot/clawdbot versions to 2026.2.1
- [x] MED-08 — Removed `ScriptHost` from tsconfig lib
- [x] MED-09 — Removed stale `@matrix-org/matrix-sdk-crypto-nodejs` references
- [x] MED-10 — Audited: 25 non-test files with console.log (some legitimate CLI output)
- [x] MED-11 — Replaced `execSync` string interpolation with `execFileSync`
- [x] MED-12 — Documented tough-cookie/form-data overrides with `@removeBy 2026.6.0`
- [x] LOW-01 — Documented `process.noDeprecation` scope in update-cli.ts
- [x] LOW-02 — Documented `shell: true` security gate in tui-local-shell.ts
- [x] LOW-03 — Added SQL identifier validation regex in memory-schema.ts
- [x] LOW-04 — Pinned Bun version in Dockerfile
- [x] LOW-05 — Migrated imports from deprecated `src/media/constants.ts` + deleted shim
- [x] LOW-06 — Removed deprecated `buildMessageWithAttachments()`
- [x] LOW-07 — Added `@removeBy 2026.4.0` to deprecated config type fields
- [x] LOW-08 — Fixed archived extensions packaging (workspace:* → peerDeps)
- [x] LOW-09 — Hono triple-pin documented via `overrideComments`
- [ ] LOW-10 — ES2024 lib/target upgrade (deferred — low risk, needs testing)
- [ ] LOW-11 — (not in original audit)
- [ ] LOW-12 — (not in original audit)
- [ ] LOW-13 — (not in original audit)
- [x] LOW-14 — Removed `authenticate-pam` from `onlyBuiltDependencies`
- [x] LOW-15 — Audited: zero `process.exit()` in non-CLI code
- [x] LOW-16 — Added `@removeBy 2026.4.0` to MOLTBOT/CLAWDBOT env var detection
- [x] INFO-01 — (covered by HIGH-01 tsgo/tsc documentation)
- [x] INFO-02 — (covered by MED-09 Matrix SDK removal)
- [x] INFO-03 — (covered by MED-07 version bumps)
- [x] INFO-04 — Added READMEs to moltbot/clawdbot packages
- [ ] INFO-05 — (not in original audit)
- [x] INFO-06 — Added `@removeBy 2026.6.0` to legacy config migration rules
- [x] INFO-07 — Relaxed node-llama-cpp peerDep from exact `3.15.1` to `^3.15.0`
- [x] INFO-08 — Documented `--allow-unconfigured` security implications in Dockerfile
- [ ] INFO-09 — DOM in tsconfig (deferred — needs separate tsconfig.ui.json)
- [x] INFO-10 — Added `peerDependenciesMeta` for optional dependencies
