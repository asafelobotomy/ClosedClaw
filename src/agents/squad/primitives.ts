/**
 * Coordination Primitives — Locks, Barriers, Semaphores, Events
 *
 * Low-level synchronization building blocks for multi-agent coordination:
 * - **Mutex**: Exclusive access to shared resources (timeout + deadlock prevention)
 * - **Barrier**: Synchronize N agents at a checkpoint, release all at once
 * - **Semaphore**: Limit concurrent access to bounded resources (API quotas)
 * - **Event**: Signal completion or state changes (one-shot and persistent)
 *
 * All primitives use timeouts to prevent deadlocks and starvation.
 * Constants sourced from AGENTS.COORDINATION.PRIMITIVES.
 *
 * @module agents/squad/primitives
 */

import { AGENTS } from "../../constants/index.js";

const { PRIMITIVES } = AGENTS.COORDINATION;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A waiter queued for a resource.
 */
interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Options for acquiring a mutex.
 */
export interface MutexOptions {
  /** Timeout in ms (default: PRIMITIVES.LOCK_TIMEOUT_MS) */
  timeout?: number;
}

/**
 * Options for barrier synchronization.
 */
export interface BarrierOptions {
  /** Timeout in ms (default: PRIMITIVES.BARRIER_TIMEOUT_MS) */
  timeout?: number;
}

/**
 * Options for semaphore acquisition.
 */
export interface SemaphoreOptions {
  /** Timeout in ms (default: PRIMITIVES.SEMAPHORE_TIMEOUT_MS) */
  timeout?: number;
}

/**
 * Options for event waiting.
 */
export interface EventOptions {
  /** Timeout in ms (default: PRIMITIVES.EVENT_WAIT_TIMEOUT_MS) */
  timeout?: number;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when a synchronization primitive times out.
 */
export class SyncTimeoutError extends Error {
  readonly primitive: string;
  readonly resourceName: string;

  constructor(primitive: string, resourceName: string, timeoutMs: number) {
    super(`${primitive} timeout on "${resourceName}" after ${timeoutMs}ms`);
    this.name = "SyncTimeoutError";
    this.primitive = primitive;
    this.resourceName = resourceName;
  }
}

// ─── Mutex (Exclusive Lock) ─────────────────────────────────────────────────

/**
 * Mutex — mutual exclusion lock for shared resources.
 *
 * Ensures only one agent can access a resource at a time.
 * Uses FIFO queue with timeout to prevent deadlocks.
 *
 * @example
 * ```typescript
 * const mutex = new Mutex("config-file");
 * await mutex.acquire();
 * try {
 *   // exclusive access
 * } finally {
 *   mutex.release();
 * }
 * ```
 */
export class Mutex {
  readonly name: string;
  private _locked = false;
  private _owner: string | undefined = undefined;
  private readonly queue: Array<Waiter & { owner: string }> = [];

  constructor(name: string) {
    this.name = name;
  }

  /** Whether the mutex is currently held. */
  get locked(): boolean {
    return this._locked;
  }

  /** The ID of the current holder, if any. */
  get owner(): string | undefined {
    return this._owner;
  }

  /** Number of waiters in the queue. */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Acquire the mutex. Blocks until the lock is available or timeout expires.
   *
   * @param ownerId - Identifier for the acquiring agent (for debugging)
   * @param opts - Acquisition options
   * @throws {SyncTimeoutError} If lock not acquired within timeout
   */
  async acquire(ownerId = "anonymous", opts?: MutexOptions): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      this._owner = ownerId;
      return;
    }

    const timeout = opts?.timeout ?? PRIMITIVES.LOCK_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {this.queue.splice(idx, 1);}
        reject(new SyncTimeoutError("Mutex", this.name, timeout));
      }, timeout);

      if (typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }

      this.queue.push({ resolve, reject, timer, owner: ownerId });
    });
  }

  /**
   * Release the mutex. Wakes the next waiter in FIFO order.
   *
   * @throws {Error} If mutex is not currently held
   */
  release(): void {
    if (!this._locked) {
      throw new Error(`Mutex "${this.name}" is not locked`);
    }

    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      this._owner = next.owner;
      next.resolve();
    } else {
      this._locked = false;
      this._owner = undefined;
    }
  }

  /**
   * Execute a function while holding the lock.
   * Lock is automatically released when the function completes or throws.
   */
  async withLock<T>(ownerId: string, fn: () => T | Promise<T>, opts?: MutexOptions): Promise<T> {
    await this.acquire(ownerId, opts);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ─── Barrier ────────────────────────────────────────────────────────────────

/**
 * Barrier — synchronize N participants at a checkpoint.
 *
 * All participants must arrive before any are released.
 * Automatically resets after release for reuse.
 *
 * @example
 * ```typescript
 * const barrier = new Barrier(3); // Wait for 3 agents
 *
 * // Each agent calls:
 * await barrier.arrive("agent-1"); // blocks until all 3 arrive
 * ```
 */
export class Barrier {
  readonly name: string;
  readonly parties: number;
  private arrived = new Set<string>();
  private waiters: Waiter[] = [];
  private _generation = 0;

  constructor(parties: number, name = "barrier") {
    if (parties < 1) {
      throw new Error("Barrier requires at least 1 party");
    }
    this.parties = parties;
    this.name = name;
  }

  /** Current number of arrived participants. */
  get arrivedCount(): number {
    return this.arrived.size;
  }

  /** How many more participants are needed. */
  get remaining(): number {
    return Math.max(0, this.parties - this.arrived.size);
  }

  /** Generation counter (increments each time barrier trips). */
  get generation(): number {
    return this._generation;
  }

  /**
   * Arrive at the barrier. Blocks until all parties have arrived.
   *
   * @param participantId - Unique identifier for this participant
   * @param opts - Wait options
   * @throws {SyncTimeoutError} If not all parties arrive within timeout
   * @throws {Error} If participant already arrived in this generation
   */
  async arrive(participantId: string, opts?: BarrierOptions): Promise<void> {
    if (this.arrived.has(participantId)) {
      throw new Error(`Participant "${participantId}" already arrived at barrier "${this.name}"`);
    }

    this.arrived.add(participantId);

    if (this.arrived.size >= this.parties) {
      // All parties arrived — trip the barrier
      this._generation++;
      const waiters = [...this.waiters];
      this.waiters = [];
      this.arrived.clear();

      for (const w of waiters) {
        clearTimeout(w.timer);
        w.resolve();
      }
      return;
    }

    // Wait for remaining parties
    const timeout = opts?.timeout ?? PRIMITIVES.BARRIER_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {this.waiters.splice(idx, 1);}
        this.arrived.delete(participantId);
        reject(new SyncTimeoutError("Barrier", this.name, timeout));
      }, timeout);

      if (typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }

      this.waiters.push({ resolve, reject, timer });
    });
  }

  /**
   * Reset the barrier, rejecting all current waiters.
   */
  reset(): void {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(new Error(`Barrier "${this.name}" was reset`));
    }
    this.waiters = [];
    this.arrived.clear();
  }
}

// ─── Semaphore ──────────────────────────────────────────────────────────────

/**
 * Counting Semaphore — limit concurrent access to a bounded resource.
 *
 * Useful for rate-limiting API calls, file handles, or other limited resources.
 *
 * @example
 * ```typescript
 * const sem = new Semaphore(3, "api-calls"); // Max 3 concurrent
 *
 * await sem.acquire();
 * try {
 *   await callApi();
 * } finally {
 *   sem.release();
 * }
 * ```
 */
export class Semaphore {
  readonly name: string;
  readonly maxPermits: number;
  private _available: number;
  private readonly queue: Waiter[] = [];

  constructor(maxPermits: number, name = "semaphore") {
    if (maxPermits < 1) {
      throw new Error("Semaphore requires at least 1 permit");
    }
    this.name = name;
    this.maxPermits = maxPermits;
    this._available = maxPermits;
  }

  /** Currently available permits. */
  get available(): number {
    return this._available;
  }

  /** Number of waiters in the queue. */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Acquire a permit. Blocks until one is available or timeout.
   *
   * @throws {SyncTimeoutError} If permit not acquired within timeout
   */
  async acquire(opts?: SemaphoreOptions): Promise<void> {
    if (this._available > 0) {
      this._available--;
      return;
    }

    const timeout = opts?.timeout ?? PRIMITIVES.SEMAPHORE_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {this.queue.splice(idx, 1);}
        reject(new SyncTimeoutError("Semaphore", this.name, timeout));
      }, timeout);

      if (typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }

      this.queue.push({ resolve, reject, timer });
    });
  }

  /**
   * Release a permit. Wakes the next waiter if any.
   *
   * @throws {Error} If releasing would exceed max permits
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else {
      if (this._available >= this.maxPermits) {
        throw new Error(`Semaphore "${this.name}" already at max permits (${this.maxPermits})`);
      }
      this._available++;
    }
  }

  /**
   * Execute a function while holding a permit.
   */
  async withPermit<T>(fn: () => T | Promise<T>, opts?: SemaphoreOptions): Promise<T> {
    await this.acquire(opts);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Try to acquire a permit without blocking.
   *
   * @returns true if acquired, false if no permits available
   */
  tryAcquire(): boolean {
    if (this._available > 0) {
      this._available--;
      return true;
    }
    return false;
  }
}

// ─── Event ──────────────────────────────────────────────────────────────────

/**
 * Event — signal completion or state changes.
 *
 * Supports two modes:
 * - **One-shot** (auto-reset): fires once, then resets (default)
 * - **Persistent** (manual-reset): stays signaled until explicitly reset
 *
 * @example
 * ```typescript
 * const done = new Event("task-done");
 *
 * // Waiter
 * await done.wait(); // blocks until signaled
 *
 * // Signaler
 * done.signal(); // releases all waiters
 * ```
 */
export class Event {
  readonly name: string;
  readonly persistent: boolean;
  private _signaled = false;
  private waiters: Waiter[] = [];

  constructor(name: string, persistent = false) {
    this.name = name;
    this.persistent = persistent;
  }

  /** Whether the event is currently signaled. */
  get signaled(): boolean {
    return this._signaled;
  }

  /** Number of waiters. */
  get waiterCount(): number {
    return this.waiters.length;
  }

  /**
   * Wait for the event to be signaled.
   *
   * If already signaled (persistent mode), returns immediately.
   *
   * @throws {SyncTimeoutError} If not signaled within timeout
   */
  async wait(opts?: EventOptions): Promise<void> {
    if (this._signaled) {
      if (!this.persistent) {
        this._signaled = false;
      }
      return;
    }

    const timeout = opts?.timeout ?? PRIMITIVES.EVENT_WAIT_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {this.waiters.splice(idx, 1);}
        reject(new SyncTimeoutError("Event", this.name, timeout));
      }, timeout);

      if (typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }

      this.waiters.push({ resolve, reject, timer });
    });
  }

  /**
   * Signal the event, releasing all waiters.
   *
   * In persistent mode, stays signaled. In one-shot mode, auto-resets.
   */
  signal(): void {
    this._signaled = true;

    const waiters = [...this.waiters];
    this.waiters = [];

    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve();
    }

    if (!this.persistent && waiters.length > 0) {
      this._signaled = false;
    }
  }

  /**
   * Reset the event to unsignaled state.
   * Only meaningful for persistent events.
   */
  reset(): void {
    this._signaled = false;
  }

  /**
   * Signal and reset (for persistent events that should pulse).
   */
  pulse(): void {
    const waiters = [...this.waiters];
    this.waiters = [];

    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve();
    }

    this._signaled = false;
  }
}

// ─── Compound Utilities ─────────────────────────────────────────────────────

/**
 * Wait for any of several events to be signaled.
 *
 * Returns the name of the event that was signaled first.
 *
 * @throws {SyncTimeoutError} If no event fires within timeout
 */
export async function waitForAny(events: Event[], opts?: EventOptions): Promise<string> {
  const timeout = opts?.timeout ?? PRIMITIVES.EVENT_WAIT_TIMEOUT_MS;

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new SyncTimeoutError("waitForAny", events.map((e) => e.name).join(","), timeout));
      }
    }, timeout);

    if (typeof timer === "object" && "unref" in timer) {
      (timer as { unref: () => void }).unref();
    }

    for (const event of events) {
      event.wait({ timeout }).then(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(event.name);
        }
      }).catch(() => {
        // Timeout on individual event — ignore, outer timeout handles
      });
    }
  });
}

/**
 * Wait for all events to be signaled.
 *
 * @throws {SyncTimeoutError} If not all events fire within timeout
 */
export async function waitForAll(events: Event[], opts?: EventOptions): Promise<void> {
  const timeout = opts?.timeout ?? PRIMITIVES.EVENT_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeout;

  for (const event of events) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SyncTimeoutError("waitForAll", events.map((e) => e.name).join(","), timeout);
    }
    await event.wait({ timeout: remaining });
  }
}
