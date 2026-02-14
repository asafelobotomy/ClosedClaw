
Enact the spec by wiring scan+sandbox outbound, auto-discovered subagents from `.claws`, semantic response cache, tiered skills, streaming-safe security, and token budget controls. Leverage existing ClawTalk hooks and sandbox infra; extend config/types and tests to keep changes gated and observable.

### Steps
1) Outbound Scan + Sandbox: Extend `clawtalk-hook` `message_sending` with rules-based scan (prompt-injection, PII, policy, anomalous patterns) and pass/block responses; strip artifacts. Wire to Kernel Shield configs, add toggles in config/zod, log/telemetry.
2) Sandbox Integration: Route untrusted subagent runs via sandbox runtime (docker/registry/tool-policy). Outbound scan should reflect sandbox status and return guidance when blocking.
3) Auto-Discovery of Subagents: Replace static directory profiles with registry built from parsed `.claws` manifests (scan skills dir; SIGUSR1 reload). Fallback to built-ins if no skills dir.
4) Tiered `.claws` Handling: Surface tier info; require only manifest/vibe/IDL, warn (optionally) on missing recommended blocks; ignore future blocks for now.
5) Skill Compilation → Routing: Compile `.claws` blocks into NL/tool schemas and feed directory/router so selection uses discovered capabilities. Guard behind `clawtalk.dynamicSkills` flag.
6) Semantic Response Cache: Add similarity-based cache with per-skill TTL, enable/max/similarity/ttl config. Check cache pre-dispatch; write post-clean-response.
7) Streaming Compatibility: Make outbound scan streaming-safe (minimal buffer, allow partial stream, abort with warning on risk). Add opt-out flag.
8) Token Budget Controls: Add per-component budgeting (frontend/system prompt reuse, subagent prompt size, cache hits); integrate compaction/window guard; emit metrics.
9) MCP Coexistence: Ensure CT/1 routing doesn’t break MCP tool calls; document bypass; small guard/test for MCP pass-through.
10) Telemetry & Metrics: Emit events for scan verdicts, sandbox usage, cache hits/misses, skill load/unload, budget enforcement. Reuse logger/telemetry.
11) Tests: Unit (directory discovery, scan rules, cache similarity/TTL, tier validation, config parsing); Integration (scan blocks risky streaming, sandbox path, dynamic skills routing, cache hit short-circuit); Gateway/e2e (sessions-send with scan/sandbox warnings).
12) Docs & Spec Sync: Update operator/dev docs with flags, defaults, and any deviations.

### Verification
- `pnpm test -- src/agents/clawtalk`
- `pnpm test -- src/plugins/loader.test.ts src/agents/intent-router.test.ts`
- `pnpm test -- src/gateway/server.sessions-send.e2e.test.ts`
- `pnpm check && pnpm build`
- Manual: run gateway with skills dir + SIGUSR1; send benign/malicious prompts; confirm scan, streaming behavior, cache hits.
