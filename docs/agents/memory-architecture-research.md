# Brain-Inspired Memory Architecture - Research

**Research Date**: February 9, 2026
**Purpose**: Design agent squad memory system based on human cognitive architecture

## Human Memory Systems

### 1. Working Memory (Immediate Awareness)
**Capacity**: 7±2 items (Miller's Law)
**Duration**: Seconds while actively maintained
**Function**: Hold and manipulate information for current task
**Speed**: Fastest access (~milliseconds)

**Real-world analogy**: Remembering a phone number while dialing

**Brain regions**: Prefrontal cortex, parietal cortex

### 2. Short-Term Memory (Recent Buffer)
**Capacity**: Limited, easily overwritten
**Duration**: Seconds to minutes without rehearsal
**Function**: Temporary storage of recent experiences
**Speed**: Fast access (~100ms)

**Real-world analogy**: Remembering what someone just said in conversation

**Characteristics**:
- Fragile (disrupted by interference)
- Not yet consolidated
- Automatic decay (forgetting curve)

### 3. Long-Term Memory (Persistent Storage)
**Capacity**: Virtually unlimited
**Duration**: Minutes to lifetime
**Function**: Permanent knowledge and experience storage
**Speed**: Slower access (~seconds), varies by retrieval strength

**Types**:

#### 3a. Episodic Memory
- **What**: Personal experiences, events
- **Examples**: "Yesterday's meeting", "Last time I debugged this"
- **Characteristics**: Time-stamped, context-rich, narrative

#### 3b. Semantic Memory
- **What**: Facts, concepts, general knowledge
- **Examples**: "Python uses indentation", "JWT tokens expire"
- **Characteristics**: Context-free, abstract, conceptual

#### 3c. Procedural Memory
- **What**: Skills, how-to knowledge
- **Examples**: "How to write a test", "Pattern for error handling"
- **Characteristics**: Often unconscious, motor/cognitive skills

### 4. Memory Consolidation (Sleep/Rest)
**Process**: Short-term → Long-term transfer
**Trigger**: Repetition, importance, emotional salience
**Mechanism**: Synaptic strengthening, neural replay

**Factors affecting consolidation**:
- **Frequency**: Repeatedly accessed data consolidates faster
- **Recency**: Recent memories prioritized
- **Importance**: Flagged as significant
- **Connections**: Related to existing knowledge

### 5. Retrieval & Forgetting

**Retrieval Cues**: Context, associations trigger recall
**Retrieval Strength**: 
- Recent memories: easier to recall
- Frequently accessed: stronger retrieval
- Connected knowledge: spreading activation

**Forgetting Mechanisms**:
- **Decay**: Unused memories fade over time
- **Interference**: New memories overwrite similar old ones
- **Retrieval failure**: Memory exists but can't be accessed

## Translation to Agent Squad System

### Working Memory → Active Context Store
**Purpose**: Agent's immediate task context
**Storage**: In-memory (RAM), per-agent namespace
**Capacity**: Limited to prevent cognitive overload (configurable, default: 10 items)
**Duration**: Task lifetime (cleared when task completes)
**Access**: Instant (direct memory access)

**Contents**:
- Current task description
- User's last message
- Tool call results from this task
- Temporary calculations
- Agent's "attention" focus

**Implementation**:
```typescript
class WorkingMemory {
  private items: Map<string, any> = new Map();
  private readonly maxSize = 10;  // Miller's Law: 7±2
  
  set(key: string, value: any): void {
    if (this.items.size >= this.maxSize) {
      // Evict least recently used
      const firstKey = this.items.keys().next().value;
      this.items.delete(firstKey);
    }
    this.items.set(key, value);
  }
}
```

### Short-Term Memory → Recent Data Cache
**Purpose**: Recently used data, temporary squad state
**Storage**: In-memory with TTL (default: 5 minutes)
**Capacity**: Moderate (10MB per squad)
**Duration**: Expires automatically, extended on access
**Access**: Fast (~1ms)

**Contents**:
- Recent agent communications
- Task queue items (pending/in-progress)
- Intermediate results
- Temporary flags/state

**Consolidation Triggers**:
- Access count > 5 → Promote to long-term
- Manually flagged as important
- Referenced by multiple agents

**Implementation**:
```typescript
interface ShortTermEntry {
  value: any;
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
  ttl: number;  // milliseconds
}

class ShortTermMemory {
  private cache: Map<string, ShortTermEntry> = new Map();
  
  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check expiration
    if (Date.now() - entry.createdAt.getTime() > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    
    // Trigger consolidation if frequently accessed
    if (entry.accessCount >= 5) {
      this.consolidateToLongTerm(key, entry);
    }
    
    return entry.value;
  }
}
```

### Long-Term Memory → Persistent Knowledge Store
**Purpose**: Accumulated knowledge, learned patterns
**Storage**: Encrypted file-based store (SQLite or JSON)
**Capacity**: Large (GB scale)
**Duration**: Persistent until explicitly deleted
**Access**: Moderate speed (~10-100ms with indexing)

**Types**:

#### Episodic Store
**What**: Squad execution history, task outcomes
**Schema**:
```typescript
interface Episode {
  id: string;
  timestamp: Date;
  squadId: string;
  taskDescription: string;
  agentsInvolved: string[];
  actions: Array<{agentId: string; action: string; result: any}>;
  outcome: "success" | "failure";
  duration: number;
  tokensUsed: number;
}
```

**Retrieval**: "Find similar past tasks", "What happened last time we tried X?"

#### Semantic Store
**What**: Facts, patterns, learned knowledge
**Schema**:
```typescript
interface SemanticKnowledge {
  id: string;
  concept: string;          // "JWT authentication"
  facts: string[];          // ["Tokens expire", "Use Bearer prefix"]
  relationships: Array<{
    related: string;        // Related concept ID
    type: "requires" | "enables" | "conflicts";
  }>;
  confidence: number;       // 0-1, based on sources/validation
  sources: string[];        // Where we learned this
}
```

**Retrieval**: "What do we know about X?", "How is X related to Y?"

#### Procedural Store
**What**: Strategies, workflows, patterns that worked
**Schema**:
```typescript
interface Procedure {
  id: string;
  name: string;             // "Research-Code-Review Pipeline"
  taskPattern: string;      // Regex or description of applicable tasks
  steps: Array<{
    role: string;           // Which agent role
    action: string;         // What to do
    input: string;          // From where
    output: string;         // To where
  }>;
  successRate: number;      // Historical performance
  avgDuration: number;
  avgTokens: number;
}
```

**Retrieval**: "What's the best strategy for this task type?"

### Memory Consolidation → Background Process
**Trigger**: Scheduled (every 5 minutes) or on-demand
**Function**: Promote hot short-term data to long-term storage

**Algorithm**:
```typescript
async function consolidateMemory(squad: Squad): Promise<void> {
  const shortTerm = squad.shortTermMemory;
  const longTerm = squad.longTermMemory;
  
  for (const [key, entry] of shortTerm.entries()) {
    // Consolidation criteria
    const shouldConsolidate = 
      entry.accessCount >= 5 ||              // Frequently accessed
      entry.flaggedImportant ||              // Manually marked
      (Date.now() - entry.createdAt.getTime() > 60000 && entry.accessCount > 2);  // Old + accessed
    
    if (shouldConsolidate) {
      // Determine memory type
      const memoryType = classifyMemory(entry);
      
      // Store in appropriate long-term store
      switch (memoryType) {
        case "episodic":
          await longTerm.episodic.store(entry);
          break;
        case "semantic":
          await longTerm.semantic.store(entry);
          break;
        case "procedural":
          await longTerm.procedural.store(entry);
          break;
      }
      
      // Remove from short-term
      shortTerm.delete(key);
    }
  }
}
```

### Forgetting → Cleanup Process
**Trigger**: Scheduled (daily) or when storage limit reached
**Function**: Remove unused long-term memories

**Retention Policy**:
```typescript
interface RetentionPolicy {
  episodic: {
    keepSuccesses: "90 days";    // Recent wins
    keepFailures: "30 days";     // Learn from recent mistakes
    keepAll: false;              // Don't keep everything
  };
  semantic: {
    keepValidated: "forever";    // Proven facts
    keepUnvalidated: "30 days";  // Unverified claims
  };
  procedural: {
    keepIfSuccessRate: "> 0.7";  // Keep procedures that work
    keepRecentlyUsed: "60 days"; // Even if not perfect
  };
}
```

## Retrieval Strategies

### 1. Recency-Weighted Search
Recent memories are easier to recall:
```typescript
function computeRetrievalScore(memory: Memory): number {
  const age = Date.now() - memory.timestamp.getTime();
  const daysSinceCreated = age / (1000 * 60 * 60 * 24);
  
  const recencyScore = Math.exp(-daysSinceCreated / 30);  // Exponential decay
  const frequencyScore = Math.log(memory.accessCount + 1);
  
  return recencyScore * 0.6 + frequencyScore * 0.4;
}
```

### 2. Spreading Activation
Related memories activate each other:
```typescript
async function searchWithActivation(query: string, longTerm: LongTermMemory): Promise<Memory[]> {
  // Find direct matches
  const directMatches = await longTerm.search(query);
  
  // Activate related memories
  const relatedIds = directMatches.flatMap(m => m.relationships.map(r => r.related));
  const relatedMatches = await longTerm.getByIds(relatedIds);
  
  // Combine with activation scores
  return [...directMatches, ...relatedMatches].sort((a, b) => 
    computeRetrievalScore(b) - computeRetrievalScore(a)
  );
}
```

### 3. Context-Dependent Retrieval
Memories are easier to recall in similar context:
```typescript
function findSimilarEpisodes(currentTask: Task, episodic: EpisodicStore): Episode[] {
  return episodic.query({
    similarTo: currentTask.description,     // Semantic similarity
    sameAgentRoles: currentTask.requiredRoles,  // Same squad composition
    sameTaskType: currentTask.type,         // Same category
    withinDays: 30,                         // Recent context
  });
}
```

## Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Process                           │
├─────────────────────────────────────────────────────────────┤
│  Working Memory (RAM)                                        │
│  - Current task context                                      │
│  - 7±2 items, instant access                                 │
│  - Cleared on task completion                                │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Short-Term Memory (TTL Cache)                   │
│  - Recent communications (5 min TTL)                         │
│  - Task queue state (extended on access)                     │
│  - Intermediate results                                      │
│  - Auto-eviction + consolidation triggers                    │
└────────────────────┬────────────────────────────────────────┘
                     │ Consolidation (every 5 min)
                     │ Criteria: access count, importance, age
┌────────────────────▼────────────────────────────────────────┐
│            Long-Term Memory (Encrypted SQLite)               │
├─────────────────────────────────────────────────────────────┤
│  Episodic Store                                              │
│  - Task history, outcomes                                    │
│  - "What happened when..."                                   │
│                                                              │
│  Semantic Store                                              │
│  - Facts, concepts, relationships                            │
│  - "What do we know about..."                                │
│                                                              │
│  Procedural Store                                            │
│  - Strategies, workflows                                     │
│  - "What's the best way to..."                               │
│                                                              │
│  Cleanup (daily): Remove old/unused memories                 │
└─────────────────────────────────────────────────────────────┘
```

## Benefits of Brain-Inspired Design

1. **Natural Performance Gradient**: Fast access for recent data, slower for archives
2. **Automatic Optimization**: Hot data stays in cache, cold data archived
3. **Forgetting is a Feature**: Prevents storage bloat, focuses on useful knowledge
4. **Learning Over Time**: Procedures improve as we track success rates
5. **Context Awareness**: Similar past experiences inform current decisions
6. **Cognitive Load Management**: Working memory limits prevent overwhelm
7. **Explainable**: Matches human mental models ("Where did I learn that?")

## MVP Priorities (Phase 1)

For initial implementation, focus on:
1. **Working Memory**: Agent's active context (simplest, most critical)
2. **Short-Term Memory**: TTL-based cache for recent data
3. **Basic Long-Term**: File-based episodic store (task history)
4. **Simple Consolidation**: Access count threshold only

Save for later:
- Semantic and procedural stores (Phase 3)
- Advanced retrieval (spreading activation, context-dependent)
- Sophisticated cleanup policies

## References

- Baddeley, A. D., & Hitch, G. (1974). "Working memory". Psychology of Learning and Motivation, 8, 47-89.
- Atkinson, R. C., & Shiffrin, R. M. (1968). "Human memory: A proposed system and its control processes".
- Tulving, E. (1985). "Memory and consciousness". Canadian Psychology, 26(1), 1-12.
- Anderson, J. R. (1983). "A spreading activation theory of memory". Journal of Verbal Learning and Verbal Behavior, 22(3), 261-295.

---

**Next**: Apply this research to implement `src/agents/squad/memory/` system
