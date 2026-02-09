/**
 * Tests for Fallback Chain Handler
 */

import { describe, it, expect, _vi, _beforeEach } from "vitest";
import { FallbackChain } from "./fallback-chain.js";

// ─── Basic Execution ────────────────────────────────────────────────────────

describe("FallbackChain - basic execution", () => {
  it("succeeds on first model", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async (modelId) => {
      return `response from ${modelId}`;
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe("response from model-a");
    expect(result.successModelId).toBe("model-a");
    expect(result.chainIndex).toBe(0);
    expect(result.attemptsCount).toBe(1);
  });

  it("falls back to second model on first failure", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("rate limit 429");
      }
      return `response from ${modelId}`;
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe("response from model-b");
    expect(result.successModelId).toBe("model-b");
    expect(result.chainIndex).toBe(1);
    expect(result.attemptsCount).toBe(2);
  });

  it("falls back through entire chain", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b", "model-c"],
    });

    const result = await chain.execute(async (modelId) => {
      if (modelId !== "model-c") {
        throw new Error("unavailable");
      }
      return `response from ${modelId}`;
    });

    expect(result.success).toBe(true);
    expect(result.successModelId).toBe("model-c");
    expect(result.attemptsCount).toBe(3);
  });

  it("fails when all models fail", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async () => {
      throw new Error("all broken");
    });

    expect(result.success).toBe(false);
    expect(result.result).toBeUndefined();
    expect(result.lastError?.message).toBe("all broken");
    expect(result.attemptsCount).toBe(2);
  });
});

// ─── Event Logging ──────────────────────────────────────────────────────────

describe("FallbackChain - events", () => {
  it("logs attempt and success events", async () => {
    const chain = new FallbackChain({
      chain: ["model-a"],
    });

    const result = await chain.execute(async () => "ok");

    const types = result.events.map((e) => e.type);
    expect(types).toContain("attempt");
    expect(types).toContain("success");
  });

  it("logs fallback events on failure", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("rate limit");
      }
      return "ok";
    });

    const fallbackEvents = result.events.filter((e) => e.type === "fallback");
    expect(fallbackEvents).toHaveLength(1);
    expect(fallbackEvents[0].modelId).toBe("model-a");
    expect(fallbackEvents[0].nextModelId).toBe("model-b");
  });

  it("logs exhausted event when all fail", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async () => {
      throw new Error("failed");
    });

    const exhausted = result.events.filter((e) => e.type === "exhausted");
    expect(exhausted).toHaveLength(1);
  });

  it("persists events in event log", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    await chain.execute(async () => "ok");

    const log = chain.getEventLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].type).toBe("attempt");
  });
});

// ─── Circuit Breaker ────────────────────────────────────────────────────────

describe("FallbackChain - circuit breaker", () => {
  it("trips circuit breaker after consecutive failures", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
      circuitBreakerThreshold: 2,
      cooldownMs: 0, // Disable cooldown for testing
    });

    // First call: model-a fails, model-b succeeds
    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail");
      }
      return "ok";
    });

    // Second call: model-a fails again (2nd consecutive failure → circuit break)
    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail again");
      }
      return "ok";
    });

    const states = chain.getModelStates();
    const modelA = states.find((s) => s.modelId === "model-a");
    expect(modelA?.circuitBroken).toBe(true);
    expect(modelA?.consecutiveFailures).toBe(2);
  });

  it("skips circuit-broken models", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
      circuitBreakerThreshold: 1, // Break after 1 failure
      cooldownMs: 0,
      circuitBreakerResetMs: 300_000, // Long reset — won't reset during test
    });

    // Trip circuit breaker on model-a
    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail");
      }
      return "ok";
    });

    // Next call should skip model-a entirely
    const attempts: string[] = [];
    await chain.execute(async (modelId) => {
      attempts.push(modelId);
      return "ok";
    });

    expect(attempts).toEqual(["model-b"]);
  });

  it("resets circuit breaker after reset period", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
      circuitBreakerThreshold: 1,
      cooldownMs: 0,
      circuitBreakerResetMs: 10, // Very short reset for testing
    });

    // Trip circuit breaker
    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail");
      }
      return "ok";
    });

    // Wait for reset
    await new Promise((r) => setTimeout(r, 20));

    // Model-a should be tried again
    const attempts: string[] = [];
    await chain.execute(async (modelId) => {
      attempts.push(modelId);
      return "ok";
    });

    expect(attempts).toContain("model-a");
  });
});

// ─── Error Classification ───────────────────────────────────────────────────

describe("FallbackChain - error classification", () => {
  it("classifies rate limit errors", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("429 too many requests rate limit");
      }
      return "ok";
    });

    const fallback = result.events.find((e) => e.type === "fallback");
    expect(fallback?.reason).toBe("rate_limit");
  });

  it("classifies auth errors", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("401 unauthorized");
      }
      return "ok";
    });

    const fallback = result.events.find((e) => e.type === "fallback");
    expect(fallback?.reason).toBe("auth");
  });

  it("uses custom error classifier when provided", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
    });

    const result = await chain.execute(
      async (modelId) => {
        if (modelId === "model-a") {
          throw new Error("custom error");
        }
        return "ok";
      },
      () => "billing",
    );

    const fallback = result.events.find((e) => e.type === "fallback");
    expect(fallback?.reason).toBe("billing");
  });
});

// ─── Health Summary ─────────────────────────────────────────────────────────

describe("FallbackChain - health", () => {
  it("tracks health summary", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b", "model-c"],
    });

    // model-a succeeds
    await chain.execute(async () => "ok");

    const health = chain.getHealthSummary();
    expect(health.totalModels).toBe(3);
    expect(health.availableModels).toBe(3);
    expect(health.totalSuccesses).toBe(1);
    expect(health.totalFailures).toBe(0);
  });

  it("updates health on failures", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
      cooldownMs: 0,
    });

    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail");
      }
      return "ok";
    });

    const health = chain.getHealthSummary();
    expect(health.totalSuccesses).toBe(1);
    expect(health.totalFailures).toBe(1);
  });

  it("resets all models", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
      circuitBreakerThreshold: 1,
      cooldownMs: 0,
    });

    // Trip circuit breaker
    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail");
      }
      return "ok";
    });

    chain.resetAll();

    const health = chain.getHealthSummary();
    expect(health.availableModels).toBe(2);
    expect(health.circuitBrokenModels).toHaveLength(0);
  });

  it("resets individual model", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b"],
      circuitBreakerThreshold: 1,
      cooldownMs: 0,
    });

    // Trip circuit breaker
    await chain.execute(async (modelId) => {
      if (modelId === "model-a") {
        throw new Error("fail");
      }
      return "ok";
    });

    expect(chain.resetModel("model-a")).toBe(true);
    expect(chain.resetModel("nonexistent")).toBe(false);

    const states = chain.getModelStates();
    const modelA = states.find((s) => s.modelId === "model-a");
    expect(modelA?.circuitBroken).toBe(false);
    expect(modelA?.consecutiveFailures).toBe(0);
  });
});

// ─── Max Retries ────────────────────────────────────────────────────────────

describe("FallbackChain - max retries", () => {
  it("respects maxRetries limit", async () => {
    const chain = new FallbackChain({
      chain: ["model-a", "model-b", "model-c"],
      maxRetries: 2,
    });

    let _attempts = 0;
    const result = await chain.execute(async () => {
      attempts++;
      throw new Error("fail");
    });

    expect(result.success).toBe(false);
    expect(result.attemptsCount).toBe(2); // maxRetries = 2
  });
});
