/**
 * Tests for coordination primitives.
 *
 * @see {@link ../primitives.ts}
 */

import { describe, it, expect, vi } from "vitest";
import {
  Mutex,
  Barrier,
  Semaphore,
  Event,
  SyncTimeoutError,
  waitForAny,
  waitForAll,
} from "./primitives.js";

// ─── Mutex ──────────────────────────────────────────────────────────────────

describe("Mutex", () => {
  it("allows immediate acquire when unlocked", async () => {
    const mutex = new Mutex("test");
    expect(mutex.locked).toBe(false);
    await mutex.acquire("agent-1");
    expect(mutex.locked).toBe(true);
    expect(mutex.owner).toBe("agent-1");
  });

  it("releases and allows next acquire", async () => {
    const mutex = new Mutex("test");
    await mutex.acquire("agent-1");
    mutex.release();
    expect(mutex.locked).toBe(false);
    expect(mutex.owner).toBeUndefined();

    await mutex.acquire("agent-2");
    expect(mutex.owner).toBe("agent-2");
    mutex.release();
  });

  it("queues waiters in FIFO order", async () => {
    const mutex = new Mutex("test");
    const order: string[] = [];

    await mutex.acquire("holder");

    // Queue two waiters
    const p1 = mutex.acquire("waiter-1", { timeout: 5000 }).then(() => order.push("waiter-1"));
    const p2 = mutex.acquire("waiter-2", { timeout: 5000 }).then(() => order.push("waiter-2"));

    expect(mutex.queueLength).toBe(2);

    // Release to let waiter-1 through
    mutex.release();
    await p1;
    expect(mutex.owner).toBe("waiter-1");

    // Release to let waiter-2 through
    mutex.release();
    await p2;

    expect(order).toEqual(["waiter-1", "waiter-2"]);
    mutex.release();
  });

  it("throws SyncTimeoutError on timeout", async () => {
    const mutex = new Mutex("test");
    await mutex.acquire("holder");

    await expect(mutex.acquire("waiter", { timeout: 50 })).rejects.toThrow(SyncTimeoutError);
    mutex.release();
  });

  it("throws when releasing an unlocked mutex", () => {
    const mutex = new Mutex("test");
    expect(() => mutex.release()).toThrow("not locked");
  });

  it("withLock releases on normal completion", async () => {
    const mutex = new Mutex("test");
    const result = await mutex.withLock("agent", () => 42);
    expect(result).toBe(42);
    expect(mutex.locked).toBe(false);
  });

  it("withLock releases on error", async () => {
    const mutex = new Mutex("test");
    await expect(
      mutex.withLock("agent", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(mutex.locked).toBe(false);
  });

  it("withLock releases on async completion", async () => {
    const mutex = new Mutex("test");
    const result = await mutex.withLock("agent", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "done";
    });
    expect(result).toBe("done");
    expect(mutex.locked).toBe(false);
  });
});

// ─── Barrier ────────────────────────────────────────────────────────────────

describe("Barrier", () => {
  it("throws for parties < 1", () => {
    expect(() => new Barrier(0)).toThrow("at least 1 party");
  });

  it("resolves immediately for single party", async () => {
    const barrier = new Barrier(1);
    await barrier.arrive("solo");
    expect(barrier.generation).toBe(1);
  });

  it("blocks until all parties arrive", async () => {
    const barrier = new Barrier(3);
    const arrived: string[] = [];

    const p1 = barrier.arrive("a", { timeout: 5000 }).then(() => arrived.push("a"));
    const p2 = barrier.arrive("b", { timeout: 5000 }).then(() => arrived.push("b"));

    expect(barrier.arrivedCount).toBe(2);
    expect(barrier.remaining).toBe(1);

    // Third arrival trips the barrier
    const p3 = barrier.arrive("c", { timeout: 5000 }).then(() => arrived.push("c"));

    await Promise.all([p1, p2, p3]);
    expect(arrived).toHaveLength(3);
    expect(barrier.generation).toBe(1);
  });

  it("resets after trip for reuse", async () => {
    const barrier = new Barrier(2);

    // First generation
    const p1 = barrier.arrive("a", { timeout: 5000 });
    const p2 = barrier.arrive("b", { timeout: 5000 });
    await Promise.all([p1, p2]);
    expect(barrier.generation).toBe(1);

    // Second generation
    const p3 = barrier.arrive("a", { timeout: 5000 });
    const p4 = barrier.arrive("b", { timeout: 5000 });
    await Promise.all([p3, p4]);
    expect(barrier.generation).toBe(2);
  });

  it("throws on duplicate participant", async () => {
    const barrier = new Barrier(3);
    await expect(async () => {
      barrier.arrive("a", { timeout: 5000 });
      await barrier.arrive("a", { timeout: 5000 });
    }).rejects.toThrow("already arrived");
  });

  it("throws SyncTimeoutError if parties don't arrive", async () => {
    const barrier = new Barrier(5);
    await expect(barrier.arrive("solo", { timeout: 50 })).rejects.toThrow(SyncTimeoutError);
  });

  it("reset rejects waiting participants", async () => {
    const barrier = new Barrier(3);
    const p = barrier.arrive("a", { timeout: 5000 });
    barrier.reset();
    await expect(p).rejects.toThrow("was reset");
  });
});

// ─── Semaphore ──────────────────────────────────────────────────────────────

describe("Semaphore", () => {
  it("throws for maxPermits < 1", () => {
    expect(() => new Semaphore(0)).toThrow("at least 1 permit");
  });

  it("allows immediate acquire up to max permits", async () => {
    const sem = new Semaphore(3, "test");
    expect(sem.available).toBe(3);

    await sem.acquire();
    expect(sem.available).toBe(2);

    await sem.acquire();
    expect(sem.available).toBe(1);

    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  it("blocks when permits exhausted", async () => {
    const sem = new Semaphore(1, "test");
    await sem.acquire();

    await expect(sem.acquire({ timeout: 50 })).rejects.toThrow(SyncTimeoutError);
    sem.release();
  });

  it("wakes queued waiter on release", async () => {
    const sem = new Semaphore(1, "test");
    await sem.acquire();

    let acquired = false;
    const p = sem.acquire({ timeout: 5000 }).then(() => { acquired = true; });

    expect(sem.queueLength).toBe(1);
    sem.release();
    await p;
    expect(acquired).toBe(true);

    sem.release();
  });

  it("throws on over-release", async () => {
    const sem = new Semaphore(1, "test");
    expect(() => sem.release()).toThrow("already at max permits");
  });

  it("tryAcquire returns true when available", () => {
    const sem = new Semaphore(2, "test");
    expect(sem.tryAcquire()).toBe(true);
    expect(sem.available).toBe(1);
    expect(sem.tryAcquire()).toBe(true);
    expect(sem.available).toBe(0);
    expect(sem.tryAcquire()).toBe(false);
  });

  it("withPermit releases on completion", async () => {
    const sem = new Semaphore(1, "test");
    const result = await sem.withPermit(() => "done");
    expect(result).toBe("done");
    expect(sem.available).toBe(1);
  });

  it("withPermit releases on error", async () => {
    const sem = new Semaphore(1, "test");
    await expect(sem.withPermit(() => { throw new Error("fail"); })).rejects.toThrow("fail");
    expect(sem.available).toBe(1);
  });
});

// ─── Event ──────────────────────────────────────────────────────────────────

describe("Event", () => {
  it("wait resolves when signaled", async () => {
    const event = new Event("test");
    expect(event.signaled).toBe(false);

    setTimeout(() => event.signal(), 10);

    await event.wait({ timeout: 5000 });
    // One-shot: auto-resets
    expect(event.signaled).toBe(false);
  });

  it("persistent event stays signaled", async () => {
    const event = new Event("test", true);
    event.signal();
    expect(event.signaled).toBe(true);

    await event.wait(); // Should resolve immediately
    expect(event.signaled).toBe(true);

    event.reset();
    expect(event.signaled).toBe(false);
  });

  it("releases all waiters on signal", async () => {
    const event = new Event("test");
    const results: number[] = [];

    const p1 = event.wait({ timeout: 5000 }).then(() => results.push(1));
    const p2 = event.wait({ timeout: 5000 }).then(() => results.push(2));
    const p3 = event.wait({ timeout: 5000 }).then(() => results.push(3));

    expect(event.waiterCount).toBe(3);
    event.signal();
    await Promise.all([p1, p2, p3]);

    expect(results).toHaveLength(3);
  });

  it("throws SyncTimeoutError on timeout", async () => {
    const event = new Event("test");
    await expect(event.wait({ timeout: 50 })).rejects.toThrow(SyncTimeoutError);
  });

  it("pulse wakes waiters but doesn't stay signaled", async () => {
    const event = new Event("test", true);
    const p = event.wait({ timeout: 5000 });

    event.pulse();
    await p;

    expect(event.signaled).toBe(false);
  });
});

// ─── SyncTimeoutError ──────────────────────────────────────────────────────

describe("SyncTimeoutError", () => {
  it("includes primitive and resource name", () => {
    const err = new SyncTimeoutError("Mutex", "config-file", 30000);
    expect(err.name).toBe("SyncTimeoutError");
    expect(err.primitive).toBe("Mutex");
    expect(err.resourceName).toBe("config-file");
    expect(err.message).toContain("Mutex");
    expect(err.message).toContain("config-file");
    expect(err.message).toContain("30000");
  });
});

// ─── waitForAny / waitForAll ───────────────────────────────────────────────

describe("waitForAny", () => {
  it("resolves with the name of the first signaled event", async () => {
    const e1 = new Event("first");
    const e2 = new Event("second");

    setTimeout(() => e1.signal(), 10);

    const result = await waitForAny([e1, e2], { timeout: 5000 });
    expect(result).toBe("first");
  });

  it("throws on timeout if no event fires", async () => {
    const e1 = new Event("a");
    const e2 = new Event("b");
    await expect(waitForAny([e1, e2], { timeout: 50 })).rejects.toThrow(SyncTimeoutError);
  });
});

describe("waitForAll", () => {
  it("resolves when all events are signaled", async () => {
    const e1 = new Event("a");
    const e2 = new Event("b");

    setTimeout(() => { e1.signal(); e2.signal(); }, 10);

    await waitForAll([e1, e2], { timeout: 5000 });
  });

  it("throws if not all events fire within timeout", async () => {
    const e1 = new Event("a");
    const e2 = new Event("b");

    setTimeout(() => e1.signal(), 10);
    // e2 never fires

    await expect(waitForAll([e1, e2], { timeout: 100 })).rejects.toThrow(SyncTimeoutError);
  });
});
