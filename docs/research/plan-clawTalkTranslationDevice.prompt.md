# Plan: ClawTalk Translation Device

**TL;DR**: Refactor the dormant `Orchestrator` class into a `TranslationDevice` that acts as bidirectional middleware — encoding user NL to ClawTalk on the input side, and stripping/decoding any ClawTalk artifacts on the output side — completely transparent to both user and LLMs. Wire the already-typed-but-uncalled `message_sending` hook into the delivery path for output transformation. Switch from virtual subagent profiles to real subagent delegation via the existing `sessions_spawn` system, with ClawDense compression on inter-agent traffic. No LLM tokens spent on translation; all encoding/decoding is deterministic code.

## Phase 1: Fix the Immediate Bug (garbled output)

1. **Refactor `prependContext` construction** in `src/agents/clawtalk/clawtalk-hook.ts`. Currently it injects raw `[ClawTalk routing: intent=web_search → research (confidence=80%)]` + subagent system prompt directly into the user prompt. Qwen3 interprets this as foreign-language content. Change to:
   - Move the routing metadata into structured system prompt framing (e.g., XML-tagged `<routing>` block that models know to ignore)
   - Or remove the raw annotation entirely and rely on the subagent system prompt alone — the intent classification and routing happen in code, the LLM doesn't need to see CI metadata

2. **Strip ClawTalk leak patterns** from the `before_agent_start` result: ensure no CT/1 wire format (`CT/1 REQ ...`), no ClawDense opcodes (`@fs:r`, `?web:s`), and no routing annotations appear in `prependContext`

## Phase 2: Build the Translation Device

3. **Create `src/agents/clawtalk/translation-device.ts`** — refactor the dormant `src/agents/clawtalk/orchestrator.ts` into a `TranslationDevice` class. Core responsibilities:
   - `encodeInbound(userMessage: string): TranslationResult` — runs `encode()` + `routeMessage()` + `shouldEscalate()` + optional ClawDense compression. Returns structured routing decision + clean system prompt (no raw CT/1 in agent-visible content)
   - `decodeOutbound(llmResponse: string): string` — scans for leaked ClawTalk artifacts (CT/1 headers, ClawDense opcodes, routing annotations) and strips/translates them to clean NL. Uses `decode()` for structured CT messages, regex for partial leaks
   - `compressForSubagent(task: string): string` — full ClawDense encoding + lexicon compression for inter-agent hand-offs
   - `decompressFromSubagent(response: string): string` — reverse: lexicon expansion + ClawDense decoding + `decode()` to NL
   - Reuse `FallbackChain`, metrics tracking, and lexicon integration from the existing Orchestrator
   - Maintain singleton instance accessible via `getTranslationDevice()` / `initTranslationDevice(config)`

4. **Update types** in `src/agents/clawtalk/types.ts`:
   - Add `TranslationResult` type: `{ cleanSystemPrompt, toolAllowlist, modelOverride?, subagentTarget?, routing: ClawTalkRouting, densePayload? }`
   - Add `TranslationDeviceConfig` extending `ClawTalkConfig` with `stripPatterns: RegExp[]`, `compressionMode` settings

5. **Fix schema/type drift**: Add `fallbackChain` and `fallbackCooldownMs` to the TypeScript `ClawTalkAgentConfig` in `src/config/types.agents.ts` to match the Zod schema in `src/config/zod-schema.agent-runtime.ts`

## Phase 3: Wire the Output Hook

6. **Wire `message_sending` hook** into the delivery path. The hook is already fully typed in `src/plugins/types.ts` and the runner method `runMessageSending()` exists in `src/plugins/hooks.ts` — it just has zero call sites. Wire it into:
   - `src/auto-reply/reply/dispatch-from-config.ts` — call `hookRunner.runMessageSending({ content, channel, sessionKey })` before both `dispatcher.sendBlockReply()` (streaming path, ~line 320) and `dispatcher.sendFinalReply()` (final path, ~line 360)
   - This allows the TranslationDevice to register as a `message_sending` handler that calls `decodeOutbound()` on every outbound message

7. **Register the output hook** — in `src/plugins/loader.ts` alongside the existing `before_agent_start` registration (~line 465), register a `message_sending` hook with the TranslationDevice's `decodeOutbound()` as handler, priority 1000 (runs first, before other plugins)

8. **Update the input hook** — refactor `src/agents/clawtalk/clawtalk-hook.ts` `clawtalkBeforeAgentStartHandler` to delegate to `TranslationDevice.encodeInbound()` instead of calling `encode()` / `directory.routeMessage()` / `shouldEscalate()` directly. The hook becomes a thin adapter

## Phase 4: Real Subagent Delegation

9. **Add subagent dispatch to TranslationDevice** — when `encodeInbound()` routes to a non-conversation intent with sufficient confidence (e.g., >0.7), instead of just modifying the current session's system prompt, the TranslationDevice should:
   - Call the gateway RPC `agent` method (same mechanism as `src/agents/tools/sessions-spawn-tool.ts`) to spawn a real child session with key format `agent:<agentId>:subagent:<uuid>`
   - Pass the **ClawDense-compressed task** as the child session's prompt (token savings)
   - Set the child's system prompt to the subagent profile's `systemPrompt` + ClawDense instructions
   - Set `toolAllowlist` to only the subagent profile's tools

10. **Handle subagent response flow** — integrate with the existing announce system in `src/agents/subagent-announce.ts`:
    - When the child completes, `runSubagentAnnounceFlow()` reads the child's reply
    - Add a **pre-announce interceptor** that runs `decompressFromSubagent()` on the child's response before it gets injected into the parent session
    - The parent then receives clean NL, ready to present to the user

11. **Multi-subagent support (MULTI verb)** — the CT/1 protocol already defines `MULTI` verb in the parser. When the TranslationDevice detects a complex request needing multiple subagents (e.g., "Research X then write code for Y"):
    - Decompose into multiple `REQ` messages using intent extraction
    - Spawn multiple real subagents in parallel
    - Collect and merge results via the announce system
    - Compose a unified NL response for the user

## Phase 5: ClawDense Compression Pipeline

12. **Activate ClawDense for inter-agent traffic** — currently built but dormant. In the TranslationDevice:
    - `compressForSubagent()` calls `toDense()` + `applyLexiconCompression()` before dispatching to child sessions
    - `decompressFromSubagent()` calls `applyLexiconExpansion()` + `fromDense()` + `decode()` on child responses
    - Track compression metrics via the existing `src/agents/clawtalk/metrics.ts`

13. **Teach subagents to respond in ClawDense** — inject ClawDense instructions into child session system prompts (loaded from the subagent profile + relevant `.claws` skill file lexicon). The child LLM generates ClawDense-structured responses that compress well and parse deterministically

14. **Context window auto-switch** — in `encodeInbound()`, check context usage. When approaching 70% capacity, switch from NL system prompts to ClawDense-compressed ones (as described in the research roadmap). This is where the lexicon from `.claws` skill files becomes active

## Phase 6: Testing & Safety

15. **Create test file** `src/agents/clawtalk/translation-device.test.ts`:
    - Unit tests for `encodeInbound()` — verify clean output, no CT/1 leaks in system prompts
    - Unit tests for `decodeOutbound()` — verify ClawTalk artifact stripping, partial leak handling
    - Unit tests for `compressForSubagent()` / `decompressFromSubagent()` roundtrip
    - Integration test: full flow user NL → encode → route → compress → decompress → decode → clean NL
    - Edge cases: empty input, ambiguous intent, ClawDense parse failures, lexicon corruption

16. **Create test file** `src/agents/clawtalk/clawtalk-hook.test.ts`:
    - Test the `before_agent_start` hook handler integration
    - Test that `prependContext` never contains raw CT/1 wire format or ClawDense opcodes

17. **Create test file** `src/auto-reply/reply/dispatch-from-config.test.ts` (or extend existing):
    - Test that `message_sending` hook is called on both streaming and final delivery paths
    - Test that ClawTalk artifacts are stripped from outbound messages

18. **Add regression test** for the garbled-text bug: a test in `clawtalk-hook.test.ts` that verifies `prependContext` output does not contain multi-script characters or CT/1 metadata strings

## Phase 7: Cleanup & Barrel Exports

19. **Remove or deprecate the standalone Orchestrator** — since its logic is absorbed into TranslationDevice. Mark `src/agents/clawtalk/orchestrator.ts` as deprecated or remove it, updating `src/agents/clawtalk/index.ts` barrel exports

20. **Update index.ts** — add `TranslationDevice`, `getTranslationDevice()`, `initTranslationDevice()` to barrel exports

21. **Resolve duplicate intent classification** — the pre-existing `src/agents/intent-router.ts` (model routing) and ClawTalk's encoder (subagent routing) run independently. Determine if intent-router should delegate to TranslationDevice or remain separate. If both are active, ensure they don't produce conflicting decisions (e.g., intent-router says "use cloud model" but TranslationDevice says "use local")

## Verification

- `pnpm test -- src/agents/clawtalk/` — all new unit tests pass
- `pnpm test -- src/auto-reply/` — message_sending hook wiring verified
- `pnpm build` — no type errors, schema/type drift resolved
- `pnpm check` — lint clean
- Manual test: start gateway with Qwen3, send "Tell me about yourself" — response should be clean NL, no garbled multi-script characters
- Manual test: send "Search for the latest Node.js vulnerabilities" — should route to research subagent (real child session), compress task via ClawDense, return clean NL summary
- Check metrics: `getMetrics()` should show compression ratios and subagent routing counts

## Key Decisions

- **Repurpose Orchestrator over building fresh**: The Orchestrator already has encode→route→execute→decode + FallbackChain + metrics. Refactoring saves ~200 LOC of duplicate logic
- **Wire existing `message_sending` hook over new hook**: The hook type, runner method, and merge logic already exist — zero new plugin infrastructure needed, just needs call sites
- **Real subagents via `sessions_spawn` mechanism**: Matches the diagram architecture (Scientist, Historian, etc. as real entities). Uses existing gateway RPC + announce system rather than inventing new IPC
- **ClawDense only for inter-agent traffic**: User-facing I/O stays NL. ClawDense is purely for the wire between TranslationDevice ↔ subagent child sessions, saving tokens on the most frequent communication path
- **Structured system prompt framing over raw annotations**: Replace `[ClawTalk routing: ...]` with clean model-friendly framing (or remove entirely) to prevent the Qwen3 garbled-text bug
