# Agent Squad System - Implementation Plan

**Option B: Build Agent Squad** (1-2 weeks)
**Status**: Planning Phase
**Started**: February 9, 2026

## Vision

Enable multiple AI agents to collaborate on complex tasks through:

- Specialized role-based agents (researcher, coder, reviewer, tester)
- Shared memory and context across agent boundaries
- Coordination protocols for parallel work
- Dynamic task distribution and load balancing

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Squad Coordinator                        │
│  - Task decomposition & assignment                          │
│  - Agent lifecycle management                               │
│  - Result aggregation                                       │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│  Researcher   │    │     Coder     │    │    Reviewer   │
│   Agent       │    │     Agent     │    │     Agent     │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Shared Memory    │
                    │  - Squad state    │
                    │  - Task queue     │
                    │  - Results store  │
                    └───────────────────┘
```

## Implementation Phases

### MVP: Core Infrastructure (Phases 1-2, 6-7 days)

Goal: Establish foundation for multi-agent collaboration with brain-inspired memory

**Phase 1: Memory + Agent Lifecycle (3-4 days)**

- Brain-inspired memory system (working, short-term, long-term)
- Agent spawning and lifecycle management
- Inter-agent communication (message passing)

**Phase 2: Coordination Basics (2-3 days)**

- Task queue with priority support
- Basic coordinator (pipeline strategy only)
- Simple CLI commands

**MVP Success Criteria**:

- [ ] Spawn 2+ agents in a squad
- [ ] Agents share state via short-term memory
- [ ] Memory automatically consolidates to long-term
- [ ] Basic pipeline: Agent A → Agent B → User
- [ ] Task queue distributes work
- [ ] CLI: create, status, terminate squads
- [ ] 100+ tests passing
- [ ] Core documentation complete

### Full System: Advanced Features (Phases 3-5, 5-6 days)

**Phase 3: Integration (2-3 days)**

- Semantic and procedural memory stores
- Squad-aware tools
- Advanced retrieval (spreading activation, context-dependent)
- Routing integration

**Phase 4: Advanced Strategies (2-3 days)**

- Parallel strategy
- Map-reduce strategy
- Consensus strategy
- Agent templates (researcher, coder, reviewer, tester)

**Phase 5: Polish & Monitoring (1-2 days)**

- Web UI dashboard
- Resource management (budgets, rate limits)
- E2E tests
- Complete documentation

## Implementation Phases

### Phase 1: Core Infrastructure (3-4 days)

**Goal**: Build foundational components for multi-agent coordination

#### 1.1 Brain-Inspired Memory System (Day 1-2)

**Research**: Human cognitive memory architecture (working, short-term, long-term)
**See**: [`docs/agents/memory-architecture-research.md`](memory-architecture-research.md)

**Files**: `src/agents/squad/memory/`

##### Working Memory (Active Context)

**File**: `src/agents/squad/memory/working-memory.ts`

Immediate task context, limited capacity (7±2 items):

```typescript
class WorkingMemory {
  private items: Map<string, any> = new Map();
  private readonly maxSize: number = 10; // Miller's Law

  set(key: string, value: any): void;
  get(key: string): any | undefined;
  clear(): void;

  // LRU eviction when full
  private evictLeastRecentlyUsed(): void;
}
```

**MVP**: Simple in-memory map per agent, cleared on task completion

##### Short-Term Memory (Recent Cache)

**File**: `src/agents/squad/memory/short-term-memory.ts`

TTL-based cache for recent data (5 min default):

```typescript
interface ShortTermEntry {
  value: any;
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
  ttl: number;
  flaggedImportant?: boolean;
}

class ShortTermMemory {
  private cache: Map<string, ShortTermEntry> = new Map();

  get(key: string): any | undefined; // Auto-extends TTL on access
  set(key: string, value: any, ttl?: number): void;
  delete(key: string): void;

  // Consolidation
  getHotEntries(): Array<[string, ShortTermEntry]>; // Access count >= 5

  // Cleanup
  evictExpired(): void;
}
```

**MVP**: In-memory with automatic TTL expiration, access count tracking

##### Long-Term Memory (Persistent Store)

**File**: `src/agents/squad/memory/long-term-memory.ts`

Encrypted persistent storage:

```typescript
class LongTermMemory {
  episodic: EpisodicStore; // Task history (MVP focus)
  semantic: SemanticStore; // Facts (Phase 3)
  procedural: ProceduralStore; // Strategies (Phase 3)

  constructor(storePath: string, passphrase: string);
}

// MVP: Episodic only
class EpisodicStore {
  async store(episode: Episode): Promise<void>;
  async search(query: string): Promise<Episode[]>;
  async getRecent(limit: number): Promise<Episode[]>;
  async cleanup(olderThanDays: number): Promise<void>;
}

interface Episode {
  id: string;
  timestamp: Date;
  squadId: string;
  taskDescription: string;
  agentsInvolved: string[];
  outcome: "success" | "failure";
  duration: number;
  tokensUsed: number;
}
```

**MVP**: File-based episodic store using EncryptedStore, simple search

##### Memory Consolidation (Background Process)

**File**: `src/agents/squad/memory/consolidation.ts`

Promotes hot short-term data to long-term:

```typescript
async function consolidateMemory(squad: Squad): Promise<ConsolidationResult> {
  const shortTerm = squad.shortTermMemory;
  const longTerm = squad.longTermMemory;

  const hotEntries = shortTerm.getHotEntries(); // Access count >= 5

  for (const [key, entry] of hotEntries) {
    // Classify and store
    const episode = convertToEpisode(entry);
    await longTerm.episodic.store(episode);

    // Remove from short-term
    shortTerm.delete(key);
  }

  return { consolidated: hotEntries.length };
}
```

**MVP**: Simple threshold-based (access count >= 5), scheduled every 5 minutes

**Tests**: 25 tests covering all memory tiers, consolidation, retrieval

#### 1.2 Agent Spawning Mechanism (Day 1-2)

**File**: `src/agents/squad/spawner.ts`

- **AgentSpawner class**: Creates and manages agent instances
  - Spawn agents with custom profiles (role, skills, tools, model)
  - Agent templates (researcher.md, coder.md, reviewer.md, tester.md)
  - Resource limits (max agents, memory per agent, token budgets)
  - Graceful shutdown and cleanup
- **Agent Lifecycle**:
  - INITIALIZING → READY → WORKING → IDLE → TERMINATING → TERMINATED
  - Heartbeat monitoring (detect hung/crashed agents)
  - Auto-restart on failure (configurable retries)
  - Orphan cleanup (agents whose squad terminated)

- **API Design**:

```typescript
interface AgentSpawner {
  spawn(config: AgentSpawnConfig): Promise<AgentHandle>;
  terminate(agentId: string): Promise<void>;
  getStatus(agentId: string): Promise<AgentStatus>;
  listAgents(squadId: string): Promise<AgentHandle[]>;
}

interface AgentSpawnConfig {
  role: string; // "researcher" | "coder" | "reviewer" | "tester"
  profile: string; // Path to agent profile markdown
  model?: string; // Override default model
  tools?: string[]; // Subset of available tools
  maxTokens?: number; // Budget per task
  environment?: Record<string, string>; // Agent-specific env vars
}

interface AgentHandle {
  id: string;
  role: string;
  status: AgentStatus;
  send(message: string): Promise<AgentResponse>;
  terminate(): Promise<void>;
}
```

**Tests**: 12 tests covering spawn, lifecycle, resource limits, failure recovery

#### 1.3 Inter-Agent Communication (Day 2)

**File**: `src/agents/squad/ipc.ts`

- **Message Passing**: Typed messages between agents
  - Request/response pattern
  - Fire-and-forget notifications
  - Broadcast to all squad members
  - Message serialization (JSON, with tool call support)

- **Communication Patterns**:
  - **Direct**: Agent A → Agent B (point-to-point)
  - **Broadcast**: Agent A → All agents in squad
  - **Publish-Subscribe**: Agents subscribe to topics
  - **Request-Reply**: Agent A asks, Agent B responds

- **API Design**:

```typescript
interface AgentIPC {
  send(toAgentId: string, message: AgentMessage): Promise<void>;
  broadcast(squadId: string, message: AgentMessage): Promise<void>;
  request(toAgentId: string, request: any, timeout?: number): Promise<any>;
  subscribe(topic: string, handler: (msg: AgentMessage) => void): void;
}

interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  type: "task" | "result" | "notification" | "question";
  payload: any;
  timestamp: string;
  replyTo?: string; // For request-response
}
```

**Tests**: 10 tests covering send, broadcast, request-reply, timeouts

### Phase 2: Coordination Layer (3-4 days)

**Goal**: Enable squads to work together on complex tasks

#### 2.1 Task Queue & Distribution (Day 3)

**File**: `src/agents/squad/task-queue.ts`

- **Task Queue**: FIFO queue with priority support
  - Add tasks with priority (high, normal, low)
  - Claim tasks (atomic, no double-assignment)
  - Complete/fail tasks
  - Retry failed tasks (exponential backoff)
  - Task dependencies (task B waits for task A)

- **Load Balancing**:
  - Round-robin assignment
  - Role-based routing (assign coding tasks to coder agents)
  - Workload-aware (prefer idle agents)
  - Capability matching (only assign if agent has required tools)

- **API Design**:

```typescript
interface TaskQueue {
  enqueue(task: Task): Promise<string>;
  claim(agentId: string, capabilities?: string[]): Promise<Task | null>;
  complete(taskId: string, result: any): Promise<void>;
  fail(taskId: string, error: Error): Promise<void>;
  getStatus(taskId: string): Promise<TaskStatus>;
}

interface Task {
  id: string;
  type: string; // "research" | "code" | "review" | "test"
  description: string;
  input: any;
  priority: "high" | "normal" | "low";
  requiredCapabilities?: string[]; // ["coding", "web_search"]
  dependsOn?: string[]; // Wait for these task IDs
  timeout?: number; // Max execution time (ms)
  retries?: number; // Max retry attempts
}
```

**Tests**: 18 tests covering enqueue, claim, dependencies, retries, priority

#### 2.2 Squad Coordinator (Day 3-4)

**File**: `src/agents/squad/coordinator.ts`

- **SquadCoordinator class**: Orchestrates multi-agent workflows
  - Task decomposition (break complex task into subtasks)
  - Agent assignment (match tasks to agent roles)
  - Progress tracking (which tasks are in flight)
  - Result aggregation (combine outputs from multiple agents)
  - Error handling (retry, reassign, escalate)

- **Coordination Strategies**:
  - **Pipeline**: Task A → Task B → Task C (sequential)
  - **Parallel**: Tasks A, B, C run simultaneously
  - **Map-Reduce**: Split work, process in parallel, merge results
  - **Consensus**: Multiple agents vote on best solution

- **API Design**:

```typescript
interface SquadCoordinator {
  createSquad(config: SquadConfig): Promise<Squad>;
  executeTask(squadId: string, task: ComplexTask): Promise<SquadResult>;
  getSquadStatus(squadId: string): Promise<SquadStatus>;
  terminateSquad(squadId: string): Promise<void>;
}

interface SquadConfig {
  name: string;
  strategy: "pipeline" | "parallel" | "map-reduce" | "consensus";
  agents: AgentSpawnConfig[];
  sharedMemory?: SquadMemoryConfig;
  maxDuration?: number; // Squad lifetime (ms)
}

interface ComplexTask {
  description: string;
  decomposition?: Task[]; // Pre-decomposed subtasks
  successCriteria?: string; // How to evaluate completion
}

interface SquadResult {
  success: boolean;
  output: any;
  agentContributions: Array<{ agentId: string; role: string; output: any }>;
  metrics: {
    duration: number;
    tasksCompleted: number;
    tokenCount: number;
  };
}
```

**Tests**: 20 tests covering strategies, decomposition, aggregation, error handling

#### 2.3 Coordination Primitives (Day 4)

**File**: `src/agents/squad/primitives.ts`

- **Locks**: Prevent concurrent access to shared resources
  - Distributed locks (via shared memory)
  - Timeout-based release (prevent deadlock)
  - Lock queues (FIFO fairness)

- **Barriers**: Synchronize multiple agents at checkpoints
  - Wait for N agents to reach barrier
  - Release all agents simultaneously
  - Timeout handling (proceed if some agents stuck)

- **Semaphores**: Limit concurrent operations
  - Control access to limited resources (API quotas, file handles)
  - Fair queuing (FIFO)

- **Events**: Signal completion or state changes
  - Wait for event (blocking)
  - Wait for any/all events (Promise.race/all semantics)
  - One-time vs. persistent events

**Tests**: 15 tests covering locks, barriers, semaphores, events

### Phase 3: Integration & Features (2-3 days)

#### 3.1 Tool Integration (Day 5)

**File**: `src/agents/squad/tools.ts`

- **Squad-Aware Tools**: New tools for agent coordination
  - `delegate_to_agent`: Assign subtask to another agent
  - `spawn_subagent`: Create specialized agent for task
  - `query_squad_memory`: Read from shared memory
  - `write_squad_memory`: Write to shared memory
  - `broadcast_message`: Notify all squad members
  - `wait_for_agents`: Block until other agents complete

- **Tool Access Control**:
  - Coordinator-only tools (spawn, terminate)
  - Agent-to-agent tools (delegate, message)
  - Shared memory tools (all agents)

**Tests**: 12 tests covering tool registration, access control, execution

#### 3.2 Routing Integration (Day 5-6)

**File**: `src/routing/squad-routing.ts`

- **Squad Bindings**: Route messages to squads instead of single agents
  - Config: `squads: { id: "research-squad", agents: [...], strategy: "..." }`
  - Routing: Incoming message → Squad coordinator → Task queue → Agents
  - Reply aggregation: Multiple agent responses → Single user-facing reply

- **Squad Triggers**:
  - Complexity threshold (long message → spawn squad)
  - Explicit user request ("use squad for this")
  - Task type detection (research + coding → mixed squad)

**Tests**: 10 tests covering squad routing, triggers, reply aggregation

#### 3.3 CLI Commands (Day 6)

**File**: `src/cli/squad-cli.ts`

New commands:

- `closedclaw squad create --name research-team --agents researcher,coder`
- `closedclaw squad list`: Show active squads
- `closedclaw squad status <squad-id>`: Show squad progress
- `closedclaw squad terminate <squad-id>`: Shut down squad
- `closedclaw squad execute <squad-id> "task description"`: Run task
- `closedclaw squad logs <squad-id>`: View squad activity logs

**Tests**: 8 tests covering all CLI commands

#### 3.4 Web UI Monitoring (Day 7)

**Files**: `ui/src/ui/views/squads.ts`, `src/web/routes/squads.ts`

- **Squad Dashboard**: Real-time view of active squads
  - Squad list with status (agents, tasks, progress)
  - Agent status grid (idle, working, terminated)
  - Task queue visualization (pending, in-progress, completed)
  - Live logs (agent communications, task events)

- **Squad Controls**:
  - Create squad (select agents, strategy)
  - Terminate squad
  - View squad memory
  - Reassign tasks

**Tests**: 6 tests covering UI rendering, interactions

### Phase 4: Advanced Features (2-3 days)

#### 4.1 Agent Templates (Day 8)

**Files**: `~/.closedclaw/agents/squad-templates/`

Pre-built agent profiles:

- **researcher.md**: Web search expert, fact verification, source analysis
- **coder.md**: Code generation, refactoring, debugging
- **reviewer.md**: Code review, security audit, best practices
- **tester.md**: Write tests, run tests, report failures
- **documenter.md**: Generate docs from code, keep docs in sync
- **devops.md**: Infrastructure, deployment, monitoring (from Priority 12.5)

Each template includes:

- System prompt (role, capabilities, constraints)
- Tool allowlist (only relevant tools)
- Model recommendation (fast for simple agents, powerful for complex)
- Example interactions

**Tests**: 5 tests per template (25 total)

#### 4.2 Squad Strategies (Day 8-9)

**File**: `src/agents/squad/strategies/`

Implement coordination strategies:

- **Pipeline Strategy** (`pipeline.ts`):
  ```
  User request → Researcher (gather info) → Coder (implement) → Reviewer (check) → User
  ```
- **Parallel Strategy** (`parallel.ts`):

  ```
  User request → [Agent A, Agent B, Agent C] → Merge results → User
  ```

  Use case: Generate 3 alternative solutions, user picks best

- **Map-Reduce Strategy** (`map-reduce.ts`):

  ```
  Large task → Split into subtasks → Distribute to agents → Merge outputs → User
  ```

  Use case: Analyze 100 files in parallel

- **Consensus Strategy** (`consensus.ts`):
  ```
  Question → Ask 3 agents → Vote on best answer → Return majority opinion
  ```
  Use case: Reduce hallucinations, verify facts

**Tests**: 10 tests per strategy (40 total)

#### 4.3 Resource Management (Day 9)

**File**: `src/agents/squad/resources.ts`

- **Token Budget Tracking**: Prevent overspending
  - Per-agent budgets
  - Per-squad budgets
  - Alert when approaching limit
  - Auto-terminate if exceeded

- **Rate Limiting**: Respect API quotas
  - Requests per minute (RPM) limits
  - Tokens per minute (TPM) limits
  - Queue requests when rate-limited
  - Spread load across multiple keys

- **Memory Limits**: Prevent OOM crashes
  - Max agents per squad
  - Max memory per agent (via V8 flags)
  - Evict idle agents if memory pressure

**Tests**: 12 tests covering budgets, rate limits, memory

### Phase 5: Testing & Documentation (1-2 days)

#### 5.1 Integration Tests (Day 10)

**File**: `src/agents/squad/squad.e2e.test.ts`

End-to-end scenarios:

- **Research Squad**: User asks complex question → Researcher gathers info → Coder writes analysis script → Tester verifies → User gets answer
- **Code Review Squad**: User commits code → Reviewer finds issues → Coder fixes → Tester runs tests → User gets PR
- **Parallel Analysis**: User uploads 10 files → Map-reduce distributes → Agents analyze → Results merged → User gets report

**Tests**: 5 e2e tests (slow, comprehensive)

#### 5.2 Documentation (Day 10-11)

**Files**: `docs/agents/squad-system.md`, `docs/agents/squad-strategies.md`, `docs/agents/squad-examples.md`

- **User Guide**: How to create and use squads
- **Strategy Guide**: When to use each coordination pattern
- **Template Reference**: Using and customizing agent templates
- **API Reference**: For plugin developers
- **Examples**: Common squad configurations
- **Troubleshooting**: Debug squad issues

#### 5.3 Example Configurations (Day 11)

**Files**: `examples/squads/`

Pre-built squad configs:

- `research-squad.json5`: Researcher + coder for data analysis
- `code-review-squad.json5`: Reviewer + tester for PR gating
- `documentation-squad.json5`: Documenter + reviewer for doc generation
- `security-squad.json5`: DevOps + reviewer for security audits

## Timeline

Total: **11 days** (can compress to 8-9 with aggressive focus)

| Phase                        | Duration | Tasks                               |
| ---------------------------- | -------- | ----------------------------------- |
| Phase 1: Core Infrastructure | 3-4 days | Shared memory, spawning, IPC        |
| Phase 2: Coordination        | 3-4 days | Task queue, coordinator, primitives |
| Phase 3: Integration         | 2-3 days | Tools, routing, CLI, web UI         |
| Phase 4: Advanced Features   | 2-3 days | Templates, strategies, resources    |
| Phase 5: Testing & Docs      | 1-2 days | E2E tests, docs, examples           |

## Dependencies

**External**: None (uses existing crypto, config, routing infrastructure)

**Internal**:

- Shared memory layer → Agent spawning, IPC
- Agent spawning + IPC → Task queue, coordination
- Coordination → Tool integration, routing
- All of the above → CLI, web UI

## Success Criteria

- [ ] Spawn 3+ agents in a squad
- [ ] Agents share state via shared memory
- [ ] Coordinator decomposes task into subtasks
- [ ] Agents execute subtasks in parallel
- [ ] Results aggregated and returned to user
- [ ] All tests passing (200+ tests)
- [ ] Documentation complete
- [ ] Example squad configs work

## Risk Mitigation

**Risk**: Complexity explosion (too many moving parts)
**Mitigation**: Start with simplest patterns (pipeline), add complexity incrementally

**Risk**: Performance (spawning agents is slow)
**Mitigation**: Agent pooling (pre-spawn idle agents), reuse agents across tasks

**Risk**: Deadlocks in coordination
**Mitigation**: Timeouts everywhere, deadlock detection in primitives

**Risk**: Cost (multiple agents = multiple API calls)
**Mitigation**: Token budgets, rate limiting, alert when approaching limits

## Future Enhancements (Post-v1)

- **Distributed Squads**: Agents run on different machines (Redis backend)
- **Learning**: Squads improve over time (store successful strategies)
- **Dynamic Scaling**: Auto-spawn more agents if queue is long
- **Agent Specialization**: Fine-tuned models for specific roles
- **Squad Monitoring**: Prometheus metrics, alerting, dashboards
- **Squad Marketplace**: Community-contributed squad templates

## Next Steps

1. Review and refine this plan
2. Create GitHub issues for each major component
3. Set up project board for tracking
4. Begin Phase 1, Day 1: Shared Memory Layer

---

**Ready to begin?** Start with Phase 1.1 (Shared Memory Layer).
