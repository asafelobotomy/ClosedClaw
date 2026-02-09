# Constants Strategy for Agent Squad System

**Date**: February 9, 2026  
**Context**: Before implementing Phase 1.2 (Short-Term Memory)

## Current Situation

**Magic Numbers in Memory Architecture**:
```typescript
// working-memory.ts
constructor(private readonly maxSize: number = 10) // 10 = Miller's Law

// memory-architecture-research.md
- Working memory: 10 items (7±2 Miller's Law)
- Short-term TTL: 5 minutes (300,000ms)
- Short-term capacity: 10MB per squad
- Long-term retention: 90 days (successes), 30 days (failures)
- Consolidation trigger: 5 accesses
- Consolidation interval: 5 minutes
```

## Proposed Structure

Create **`src/constants/agents.ts`** following existing pattern:

```typescript
/**
 * Agent and squad system constants.
 * 
 * Centralizes all configuration for:
 * - Memory systems (working, short-term, long-term)
 * - Squad coordination
 * - Agent spawning and lifecycle
 * - Task queue configuration
 */

const MS = 1000;
const MINUTE = 60 * MS;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;

/**
 * Memory system configuration (brain-inspired architecture).
 */
export const MEMORY = {
  /** Working memory (active task context) */
  WORKING: {
    /** Max items in working memory (Miller's Law: 7±2) */
    DEFAULT_CAPACITY: 10,
    
    /** Minimum allowed capacity */
    MIN_CAPACITY: 1,
    
    /** Maximum allowed capacity (prevent memory abuse) */
    MAX_CAPACITY: 50,
  } as const,
  
  /** Short-term memory (recent data cache) */
  SHORT_TERM: {
    /** Default TTL for entries (5 minutes) */
    DEFAULT_TTL_MS: 5 * MINUTE,
    
    /** Maximum TTL to prevent unbounded growth (1 hour) */
    MAX_TTL_MS: 1 * HOUR,
    
    /** Memory budget per squad */
    MAX_SIZE_BYTES: 10 * MB,
    
    /** Access count threshold for consolidation */
    HOT_ENTRY_THRESHOLD: 5,
    
    /** Consolidation check interval */
    CONSOLIDATION_INTERVAL_MS: 5 * MINUTE,
  } as const,
  
  /** Long-term memory (persistent storage) */
  LONG_TERM: {
    /** Retention policy for episodic memories */
    RETENTION: {
      /** Keep successful task outcomes (days) */
      SUCCESS_DAYS: 90,
      
      /** Keep failed task outcomes (days) */
      FAILURE_DAYS: 30,
      
      /** Keep validated semantic facts (forever) */
      VALIDATED_FACTS_DAYS: Number.POSITIVE_INFINITY,
      
      /** Keep unvalidated semantic facts (days) */
      UNVALIDATED_FACTS_DAYS: 30,
      
      /** Keep procedures with success rate threshold */
      PROCEDURE_SUCCESS_RATE: 0.7,
      
      /** Keep recently used procedures (days) */
      PROCEDURE_RECENT_DAYS: 60,
    } as const,
    
    /** Cleanup schedule */
    CLEANUP_INTERVAL_MS: 1 * DAY,
    
    /** Search result limits */
    MAX_SEARCH_RESULTS: 100,
  } as const,
  
  /** Consolidation process configuration */
  CONSOLIDATION: {
    /** Run consolidation every N milliseconds */
    INTERVAL_MS: 5 * MINUTE,
    
    /** Batch size for consolidation */
    BATCH_SIZE: 100,
    
    /** Max time spent in consolidation per cycle */
    MAX_DURATION_MS: 30 * MS,
  } as const,
} as const;

/**
 * Agent spawning and lifecycle configuration.
 */
export const SPAWNING = {
  /** Agent initialization timeout */
  INIT_TIMEOUT_MS: 30 * MS,
  
  /** Heartbeat interval for health checks */
  HEARTBEAT_INTERVAL_MS: 10 * MS,
  
  /** Max missed heartbeats before considering agent dead */
  MAX_MISSED_HEARTBEATS: 3,
  
  /** Grace period for graceful shutdown */
  SHUTDOWN_GRACE_PERIOD_MS: 10 * MS,
  
  /** Max agents per squad */
  MAX_AGENTS_PER_SQUAD: 10,
  
  /** Max memory per agent (MB) */
  MAX_MEMORY_MB: 512,
  
  /** Max token budget per agent per task */
  DEFAULT_TOKEN_BUDGET: 100_000,
  
  /** Auto-restart on failure (max retries) */
  MAX_RESTART_ATTEMPTS: 3,
  
  /** Backoff between restart attempts */
  RESTART_BACKOFF_MS: 5 * MS,
} as const;

/**
 * Squad coordination configuration.
 */
export const COORDINATION = {
  /** Task queue configuration */
  QUEUE: {
    /** Max tasks in queue per squad */
    MAX_SIZE: 1000,
    
    /** Task claim timeout (ms) */
    CLAIM_TIMEOUT_MS: 5 * MINUTE,
    
    /** Max task execution time */
    MAX_EXECUTION_MS: 30 * MINUTE,
    
    /** Retry backoff (exponential) */
    RETRY_BASE_MS: 1 * MS,
    RETRY_MAX_MS: 1 * MINUTE,
    MAX_RETRIES: 3,
  } as const,
  
  /** Coordination primitives timeouts */
  PRIMITIVES: {
    /** Lock timeout (prevent deadlock) */
    LOCK_TIMEOUT_MS: 30 * MS,
    
    /** Barrier timeout (prevent infinite wait) */
    BARRIER_TIMEOUT_MS: 5 * MINUTE,
    
    /** Event wait timeout */
    EVENT_WAIT_TIMEOUT_MS: 1 * MINUTE,
  } as const,
  
  /** Squad lifecycle limits */
  SQUAD: {
    /** Max squad lifetime */
    MAX_LIFETIME_MS: 24 * HOUR,
    
    /** Inactivity timeout (auto-terminate idle squads) */
    INACTIVITY_TIMEOUT_MS: 1 * HOUR,
    
    /** Max squads per gateway */
    MAX_SQUADS: 50,
  } as const,
} as const;

/**
 * All agent-related constants namespace.
 */
export const AGENTS = {
  MEMORY,
  SPAWNING,
  COORDINATION,
} as const;
```

## Integration Plan

### Phase 1: Immediate (with Phase 1.2)
1. Create `src/constants/agents.ts` with memory constants
2. Update `src/constants/index.ts`:
   ```typescript
   export { AGENTS } from "./agents.js";
   ```
3. Refactor `working-memory.ts` to use constants:
   ```typescript
   import { AGENTS } from "../../constants/index.js";
   
   constructor(
     private readonly maxSize: number = AGENTS.MEMORY.WORKING.DEFAULT_CAPACITY
   ) {
     if (maxSize < AGENTS.MEMORY.WORKING.MIN_CAPACITY) {
       throw new Error(`Working memory maxSize must be >= ${AGENTS.MEMORY.WORKING.MIN_CAPACITY}`);
     }
   }
   ```

### Phase 2: As We Build (Phases 1.2+)
- Add constants as we implement each component
- Update test files to use constants
- Document rationale in JSDoc

### Phase 3: Audit & Test (End of MVP)
- Comprehensive test in `src/constants/agents.test.ts`
- Verify all magic numbers replaced
- Document tuning guidance

## Benefits

**For Current Work**:
- Clear defaults for short-term/long-term memory
- Consistent retention policies
- Easy to tune without hunting code

**For Future Growth**:
- Single place to adjust all memory settings
- Easy to add squad/spawning constants
- Configuration drift prevention
- Better security audits

**For Testing**:
- Mock constants in one place
- Test different configurations easily
- Document expected behavior

## Alternative: Configuration vs Constants

**Constants (recommended)**:
- Hardcoded defaults (can be overridden by config)
- Type-safe, compile-time checked
- Good for system limits (prevent abuse)
- Example: `AGENTS.MEMORY.WORKING.DEFAULT_CAPACITY`

**Configuration** (user-adjustable):
- Runtime config in `~/.closedclaw/config.json5`
- User can tune for their use case
- Example: `agents.memory.workingCapacity`

**Best Practice**: Constants define **safe bounds**, config allows **tuning within bounds**.

```typescript
// Constants define limits
const userCapacity = config.agents?.memory?.workingCapacity ?? AGENTS.MEMORY.WORKING.DEFAULT_CAPACITY;

// Enforce safety bounds
const safeCapacity = Math.max(
  AGENTS.MEMORY.WORKING.MIN_CAPACITY,
  Math.min(userCapacity, AGENTS.MEMORY.WORKING.MAX_CAPACITY)
);
```

## Questions for Decision

1. **Timing**: Add `agents.ts` now (with Phase 1.2) or wait until Phase 2?
   - **Recommend**: Now. Prevents accumulating more magic numbers.

2. **Scope**: Just memory constants now, or full `AGENTS` namespace?
   - **Recommend**: Full namespace structure, fill in as we go.

3. **Granularity**: Should consolidation interval be configurable?
   - **Recommend**: Constant for MVP, make configurable in Phase 3+ if users request it.

4. **Documentation**: Add constants rationale to memory-architecture-research.md?
   - **Recommend**: Yes, cross-reference constants in research doc.

## Recommended Action

✅ **Create `src/constants/agents.ts` with Phase 1.2** because:
- Prevents accumulating more magic numbers in upcoming code
- Establishes pattern for Phase 2 components
- Makes retention policies explicit and auditable
- Easy refactor now vs. hunting 10+ files later

**Time investment**: 30 minutes (write constants + refactor working-memory + tests)  
**Value**: Prevents 2-3 hours of cleanup later + ongoing maintainability

---

**Your call**: Should I proceed with creating `agents.ts` now, or wait?
