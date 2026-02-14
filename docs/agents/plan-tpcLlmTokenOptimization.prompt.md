# Plan: Optimize LLM Token Usage in TPC System

**TL;DR**: Reduce LLM token consumption by 40-60% through four complementary strategies: (1) semantic compression of CT/1 parameter names, (2) structured tool parameters that bypass text serialization, (3) response payload compression with lazy expansion, and (4) shared context pooling for multi-turn conversations. All changes preserve TPC's security model (Ed25519, nonce deduplication, Reed-Solomon FEC) while maintaining the transparent compression architecture. Estimated total savings: **50-65% token reduction** without compromising functionality.

**Current Baseline** (from research):
- Natural language tool calls: ~55 tokens per request
- Current CT/1 wire format: ~15 tokens per request  
- Already achieving 60-70% reduction through transparent encoding
- **Goal**: Further reduce to ~8-10 tokens per request (additional 40-50% savings)

---

## Strategy 1: Semantic Compression of CT/1 Parameters

**Rationale**: Current CT/1 uses full parameter names (`q="query"`, `filter="critical"`, `since="30d"`, `limit=5`). A dictionary-based abbreviation system can halve wire format size.

**Changes**:

1. **Create compression dictionary** in [src/agents/clawtalk/compression.ts](src/agents/clawtalk/compression.ts) (new file):
   - Map common parameter names to 1-2 char codes: `q→q, filter→f, limit→l, since→s, depth→d`
   - Version the dictionary (v1, v2) for backward compatibility
   - Include compression metadata in envelope: `compressionVersion: 1`

2. **Update encoder** in [src/agents/clawtalk/encoder.ts](src/agents/clawtalk/encoder.ts):
   - Add `compressParameters(wire: string, version: number)` function
   - Apply compression after CT/1 wire format generation
   - Example: `CT/1 REQ web_search q="test" filter=critical limit=5` → `CT/1 REQ web_search q="test" f=crit l=5`

3. **Update parser** in [src/agents/clawtalk/parser.ts](src/agents/clawtalk/parser.ts):
   - Add `decompressParameters(wire: string, version: number)` function  
   - Expand abbreviated params before parsing
   - Fall back to uncompressed if version unknown

4. **Update TPC envelope** in [src/agents/clawtalk/tpc/types.ts](src/agents/clawtalk/tpc/types.ts):
   - Add `compressionVersion?: number` field to `SignedTPCEnvelope`
   - Encoder sets version on encode
   - Decoder reads version on decode

**Token Savings**: 30-40% reduction in CT/1 wire format length (15 tokens → 9-10 tokens)

---

## Strategy 2: Structured Tool Parameters

**Rationale**: Tools like `sessions_send` currently accept a `message: string` that gets parsed into CT/1. Using structured parameters bypasses string serialization entirely.

**Changes**:

1. **Add structured message parameter** in [src/agents/tools/sessions-send-tool.ts](src/agents/tools/sessions-send-tool.ts):
   ```typescript
   // Current (string-based)
   parameters: {
     message: { type: "string", description: "Message to send", required: true }
   }
   
   // New (structured)
   parameters: {
     // Keep message for backward compatibility
     message: { type: "string", description: "Message text (legacy)" },
     // Add structured alternative
     structuredMessage: {
       type: "object",
       description: "Structured message (preferred)",
       properties: {
         action: { type: "string", enum: ["web_search", "file_read", ...] },
         params: { type: "object" }
       }
     }
   }
   ```

2. **Update tool handler** to detect structured vs string:
   ```typescript
   if (structuredMessage) {
     // Direct CT/1 construction - no LLM tokenization of parameters
     wire = buildCT1Wire(structuredMessage.action, structuredMessage.params);
   } else {
     // Legacy: parse message string
     wire = await encodeToClawTalk(message);
   }
   ```

3. **Update agent prompts** in [src/agents/subagent-announce.ts](src/agents/subagent-announce.ts):
   - Add examples showing structured parameter usage
   - Encourage LLMs to use `structuredMessage` over `message` string

**Token Savings**: 40-50% for tool calls (avoid serializing parameters as text)

---

## Strategy 3: Response Payload Compression

**Rationale**: Large responses (search results, file contents) waste tokens when fully included in LLM context. Use lazy expansion with retrieval handles.

**Changes**:

1. **Create payload compression module** in [src/agents/clawtalk/payload-compression.ts](src/agents/clawtalk/payload-compression.ts) (new file):
   ```typescript
   interface CompressedPayload {
     summary: string;      // Concise summary (always included)
     retrievalHandle: string;  // Reference to full data
     bytesSaved: number;   // Metrics
   }
   
   function compressLargePayload(
     payload: string,
     maxSummaryTokens: number = 200
   ): CompressedPayload
   ```

2. **Update response handling** in [src/agents/tools/sessions-send-tool.a2a.ts](src/agents/tools/sessions-send-tool.a2a.ts):
   - Detect large responses (>1000 tokens)
   - Extract summary using truncation or LLM summarization
   - Store full payload with retrieval key: `tpc://msg-{messageId}/full`
   - Return compressed response to requester

3. **Add retrieval tool** in [src/agents/tools/payload-retrieve-tool.ts](src/agents/tools/payload-retrieve-tool.ts) (new file):
   ```typescript
   // Allows LLM to expand compressed payloads on demand
   name: "payload_retrieve"
   parameters: {
     handle: { type: "string", pattern: "^tpc://msg-.*" }
   }
   handler: async ({ handle }) => {
     // Fetch full payload from storage
     return fullPayload;
   }
   ```

4. **Update TPC storage** to cache payloads in [src/agents/clawtalk/tpc/dead-drop.ts](src/agents/clawtalk/tpc/dead-drop.ts):
   - Add payload cache with TTL (24 hours)
   - Store by messageId for retrieval

**Token Savings**: 70-80% for large responses by default, with full expansion available on demand

---

## Strategy 4: Shared Context Pooling

**Rationale**: Multi-turn agent conversations repeat context. Use context references to amortize costs across turns.

**Changes**:

1. **Create context pool** in [src/agents/clawtalk/context-pool.ts](src/agents/clawtalk/context-pool.ts) (new file):
   ```typescript
   interface SharedContext {
     contextId: string;
     content: string;
     createdAt: number;
     lastAccessedAt: number;
     accessCount: number;
   }
   
   class ContextPool {
     store(content: string): string;  // Returns contextId
     retrieve(contextId: string): string | null;
     cleanup(maxAge: number): void;
   }
   ```

2. **Update CT/1 wire format** to support context references:
   - New parameter: `ctx` (context ID)
   - Example: `CT/1 REQ analyze ctx=abc123 focus="performance"`
   - Parser expands context before processing

3. **Update encoder** in [src/agents/clawtalk/encoder.ts](src/agents/clawtalk/encoder.ts):
   - Detect repeated context patterns (project info, file contents)
   - Auto-create context pool entries
   - Replace with context references in wire format

4. **Update sessions_send tool**:
   - Add optional `contextId` parameter
   - Attach context automatically if conversation has prior turns

**Token Savings**: 60-80% for follow-up turns in multi-turn conversations

---

## Implementation Steps

**Phase 1: Compression Dictionary** (1-2 days)
1. Create compression.ts with v1 dictionary
2. Update encoder.ts to compress parameters
3. Update parser.ts to decompress parameters
4. Update TPC types to include compressionVersion
5. Add tests: [src/agents/clawtalk/compression.test.ts](src/agents/clawtalk/compression.test.ts)

**Phase 2: Structured Parameters** (2-3 days)
1. Update sessions-send-tool.ts with structuredMessage parameter
2. Update tool handler to detect and build CT/1 directly
3. Update agent prompts with examples
4. Add tests: [src/agents/tools/sessions-send-tool.test.ts](src/agents/tools/sessions-send-tool.test.ts)

**Phase 3: Payload Compression** (3-4 days)
1. Create payload-compression.ts module
2. Update sessions-send-tool.a2a.ts response handling
3. Create payload-retrieve-tool.ts
4. Update dead-drop.ts with payload cache
5. Add tests: [src/agents/clawtalk/payload-compression.test.ts](src/agents/clawtalk/payload-compression.test.ts)

**Phase 4: Context Pooling** (2-3 days)
1. Create context-pool.ts
2. Update CT/1 wire format to support `ctx` parameter
3. Update encoder.ts with auto-context detection
4. Update sessions_send tool with contextId param
5. Add tests: [src/agents/clawtalk/context-pool.test.ts](src/agents/clawtalk/context-pool.test.ts)

**Phase 5: Integration & Metrics** (1-2 days)
1. Add token usage metrics to [src/agents/clawtalk/metrics.ts](src/agents/clawtalk/metrics.ts) (new file)
2. Track: tokens saved, compression ratio, cache hit rate
3. Update [docs/agents/tpc-overview.md](docs/agents/tpc-overview.md) with optimization details
4. Create migration guide for existing agents

---

## Verification

**Unit Tests:**
- Compression dictionary bidirectional correctness
- Structured parameters build valid CT/1
- Payload compression preserves semantics
- Context pool handles TTL and cleanup

**Integration Tests:**
- End-to-end agent communication with all strategies enabled
- Backward compatibility (compressed ↔ uncompressed)
- Security preservation (signatures still valid)

**Performance Tests:**
- Token reduction metrics (before/after)
- Latency impact (<10ms acceptable)
- Memory usage for context pool (<50MB)

**Commands:**
```bash
# Run tests
pnpm test -- src/agents/clawtalk/

# Measure token savings
pnpm test -- src/agents/clawtalk/metrics.test.ts

# End-to-end validation
pnpm test:e2e -- src/agents/tools/sessions-send-tool.e2e.test.ts
```

---

## Decisions

**Decision 1: Compression Dictionary Versioning**
- **Choice**: Include `compressionVersion` in TPC envelope
- **Rationale**: Allows future dictionary updates without breaking old messages
- **Alternative**: Fixed dictionary (rejected - no upgrade path)

**Decision 2: Structured Parameters as Additive**
- **Choice**: Keep `message` string parameter, add `structuredMessage` alongside
- **Rationale**: Backward compatibility for existing agents
- **Alternative**: Replace message entirely (rejected - breaking change)

**Decision 3: Payload Compression Threshold**
- **Choice**: Compress responses >1000 tokens
- **Rationale**: Balance between token savings and retrieval latency
- **Alternative**: Always compress (rejected - overhead for small responses)

**Decision 4: Context Pool TTL**
- **Choice**: 24-hour TTL, 10k max entries
- **Rationale**: Matches nonce store TTL; prevents unbounded growth
- **Alternative**: No expiration (rejected - memory leak risk)

**Decision 5: Preserve TPC Security**
- **Choice**: All compression happens AFTER signature generation
- **Rationale**: Signatures cover original data; compression is transport optimization
- **Alternative**: Compress before signing (rejected - signature verification would fail on decompression errors)

---

## Trade-offs

**Pros:**
✅ 50-65% additional token savings  
✅ No security compromises (Ed25519, nonces, FEC unchanged)  
✅ Backward compatible (phased rollout)  
✅ Minimal latency impact (<10ms per message)  
✅ Amortized savings grow with conversation length  

**Cons:**
⚠️ Increased code complexity (~500 LOC added)  
⚠️ Memory overhead for context pool (~50MB)  
⚠️ Compression dictionary requires coordination if agents diverge  
⚠️ Payload retrieval adds round-trip for full expansion  

**Mitigations:**
- Comprehensive test coverage (unit + integration + e2e)
- Metrics dashboard to monitor savings vs overhead
- Graceful degradation (fall back to uncompressed on errors)
- Documentation and migration guide

---

**This plan achieves maximum token efficiency while preserving TPC's security guarantees and transparent compression architecture.**
