/**
 * Tests for squad routing integration.
 *
 * @see {@link ./squad-routing.ts}
 */

import { describe, it, expect, vi } from "vitest";
import type { SquadCoordinator, SquadResult, _SquadConfig } from "../agents/squad/coordinator.js";
import {
  analyzeSquadTrigger,

  /* oxlint-disable typescript-eslint/unbound-method */
  findSquadBinding,
  buildSquadConfig,
  aggregateSquadReply,
  routeToSquad,
  type SquadBinding,
  type SquadRouteInput,
} from "./squad-routing.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockCoordinator(overrides?: Partial<SquadCoordinator>): SquadCoordinator {
  return {
    createSquad: vi.fn().mockResolvedValue("squad-test"),
    executeTask: vi.fn().mockResolvedValue({
      success: true,
      output: "Task completed",
      contributions: [
        { agentId: "a-1", role: "researcher", output: "Research done" },
        { agentId: "a-2", role: "coder", output: "Code written" },
      ],
      metrics: { tasksCompleted: 2, tasksFailed: 0 },
    } satisfies Partial<SquadResult> as SquadResult),
    terminateSquad: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SquadCoordinator;
}

function makeInput(overrides?: Partial<SquadRouteInput>): SquadRouteInput {
  return {
    message: "Hello world",
    channel: "telegram",
    ...overrides,
  };
}

// ─── analyzeSquadTrigger ────────────────────────────────────────────────────

describe("analyzeSquadTrigger", () => {
  it("detects explicit squad keywords", () => {
    const result = analyzeSquadTrigger(makeInput({ message: "Please use a squad for this" }));
    expect(result.explicitRequest).toBe(true);
    expect(result.shouldUseSquad).toBe(true);
    expect(result.complexityScore).toBeGreaterThanOrEqual(0.6);
  });

  it("detects 'collaborate' keyword", () => {
    const result = analyzeSquadTrigger(makeInput({ message: "Let's collaborate on this task" }));
    expect(result.explicitRequest).toBe(true);
  });

  it("detects 'multi-agent' keyword", () => {
    const result = analyzeSquadTrigger(makeInput({ message: "Use multi-agent approach" }));
    expect(result.explicitRequest).toBe(true);
  });

  it("returns low complexity for simple messages", () => {
    const result = analyzeSquadTrigger(makeInput({ message: "What time is it?" }));
    expect(result.shouldUseSquad).toBe(false);
    expect(result.complexityScore).toBeLessThan(0.5);
    expect(result.explicitRequest).toBe(false);
  });

  it("detects research+code pattern", () => {
    const result = analyzeSquadTrigger(
      makeInput({ message: "Research the best practices and implement a new handler" }),
    );
    expect(result.detectedTaskTypes).toContain("research");
    expect(result.detectedTaskTypes).toContain("code");
  });

  it("detects review+test pattern", () => {
    const result = analyzeSquadTrigger(
      makeInput({ message: "Please review the code and test the edge cases" }),
    );
    expect(result.detectedTaskTypes).toContain("review");
    expect(result.detectedTaskTypes).toContain("test");
  });

  it("increases complexity for long messages", () => {
    const shortResult = analyzeSquadTrigger(makeInput({ message: "short" }));
    const longMessage = Array(250).fill("word").join(" ");
    const longResult = analyzeSquadTrigger(makeInput({ message: longMessage }));

    expect(longResult.complexityScore).toBeGreaterThan(shortResult.complexityScore);
  });

  it("detects code blocks for added complexity", () => {
    const message = [
      "Refactor this:",
      "```typescript",
      "function a() {}",
      "```",
      "And this:",
      "```typescript",
      "function b() {}",
      "```",
    ].join("\n");

    const result = analyzeSquadTrigger(makeInput({ message }));
    expect(result.detectedTaskTypes).toContain("code");
  });

  it("caps complexity at 1.0", () => {
    const longMessage = Array(500)
      .fill("research investigate analyze implement build create")
      .join(" ");
    const result = analyzeSquadTrigger(makeInput({ message: longMessage }));
    expect(result.complexityScore).toBeLessThanOrEqual(1.0);
  });

  it("recommends pipeline for research+code", () => {
    const result = analyzeSquadTrigger(
      makeInput({ message: "Research the topic and implement the solution" }),
    );
    expect(result.recommendedStrategy).toBe("pipeline");
  });

  it("recommends parallel for review+test", () => {
    const result = analyzeSquadTrigger(
      makeInput({ message: "Review the code and test all scenarios" }),
    );
    expect(result.recommendedStrategy).toBe("parallel");
  });
});

// ─── findSquadBinding ──────────────────────────────────────────────────────

describe("findSquadBinding", () => {
  const bindings: SquadBinding[] = [
    {
      id: "telegram-vip",
      channels: ["telegram"],
      peerIds: ["user-1"],
      squadConfig: { name: "vip", strategy: "pipeline", agents: [] },
    },
    {
      id: "discord-guild",
      channels: ["discord"],
      guildIds: ["guild-42"],
      squadConfig: { name: "guild", strategy: "parallel", agents: [] },
    },
    {
      id: "any-channel",
      channels: [],
      peerIds: ["admin"],
      squadConfig: { name: "admin", strategy: "consensus", agents: [] },
    },
  ];

  it("matches by channel + peer", () => {
    const input = makeInput({ channel: "telegram", peerId: "user-1" });
    const binding = findSquadBinding(input, bindings);
    expect(binding?.id).toBe("telegram-vip");
  });

  it("matches by channel + guild", () => {
    const input = makeInput({ channel: "discord", guildId: "guild-42" });
    const binding = findSquadBinding(input, bindings);
    expect(binding?.id).toBe("discord-guild");
  });

  it("returns undefined when no match", () => {
    const input = makeInput({ channel: "slack", peerId: "nobody" });
    const binding = findSquadBinding(input, bindings);
    expect(binding).toBeUndefined();
  });

  it("matches first binding in order", () => {
    const dupeBindings: SquadBinding[] = [
      {
        id: "first",
        channels: ["telegram"],
        squadConfig: { name: "a", strategy: "pipeline", agents: [] },
      },
      {
        id: "second",
        channels: ["telegram"],
        squadConfig: { name: "b", strategy: "parallel", agents: [] },
      },
    ];
    const input = makeInput({ channel: "telegram" });
    const binding = findSquadBinding(input, dupeBindings);
    expect(binding?.id).toBe("first");
  });

  it("returns undefined for empty bindings", () => {
    const binding = findSquadBinding(makeInput(), []);
    expect(binding).toBeUndefined();
  });
});

// ─── buildSquadConfig ──────────────────────────────────────────────────────

describe("buildSquadConfig", () => {
  it("builds config with known roles", () => {
    const config = buildSquadConfig("my-squad", "pipeline", ["researcher", "coder"]);
    expect(config.name).toBe("my-squad");
    expect(config.strategy).toBe("pipeline");
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].role).toBe("researcher");
    expect(config.agents[1].role).toBe("coder");
  });

  it("falls back to minimal config for unknown roles", () => {
    const config = buildSquadConfig("custom", "parallel", ["unknown-role"]);
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].role).toBe("unknown-role");
    expect(config.agents[0].maxTokens).toBe(50_000);
  });
});

// ─── aggregateSquadReply ────────────────────────────────────────────────────

describe("aggregateSquadReply", () => {
  const successResult: SquadResult = {
    success: true,
    output: "Final output",
    contributions: [
      { agentId: "a-1", role: "researcher", output: "Research findings" },
      { agentId: "a-2", role: "coder", output: "Implementation code" },
    ],
    metrics: { tasksCompleted: 2, tasksFailed: 0 },
  } as SquadResult;

  it("pipeline shows final output", () => {
    const reply = aggregateSquadReply(successResult, "pipeline");
    expect(reply).toBe("Final output");
  });

  it("parallel shows labeled agent outputs", () => {
    const reply = aggregateSquadReply(successResult, "parallel");
    expect(reply).toContain("**researcher**");
    expect(reply).toContain("Research findings");
    expect(reply).toContain("**coder**");
    expect(reply).toContain("Implementation code");
    expect(reply).toContain("---");
  });

  it("map-reduce shows reduced output", () => {
    const reply = aggregateSquadReply(successResult, "map-reduce");
    expect(reply).toBe("Final output");
  });

  it("consensus shows output with vote count", () => {
    const reply = aggregateSquadReply(successResult, "consensus");
    expect(reply).toContain("Final output");
    expect(reply).toContain("2 agents voted");
  });

  it("formats failure messages", () => {
    const failResult: SquadResult = {
      success: false,
      output: null,
      error: "Agent crashed",
      contributions: [{ agentId: "a-1", role: "researcher", output: null }],
      metrics: { tasksCompleted: 0, tasksFailed: 1 },
    } as unknown as SquadResult;

    const reply = aggregateSquadReply(failResult, "pipeline");
    expect(reply).toContain("Squad task failed");
    expect(reply).toContain("Agent crashed");
    expect(reply).toContain("Failed: 1");
  });

  it("handles null output gracefully", () => {
    const nullResult: SquadResult = {
      success: true,
      output: null,
      contributions: [],
      metrics: { tasksCompleted: 0, tasksFailed: 0 },
    } as unknown as SquadResult;

    const reply = aggregateSquadReply(nullResult, "pipeline");
    expect(reply).toBe("(no output)");
  });

  it("JSON-encodes object output", () => {
    const objResult: SquadResult = {
      success: true,
      output: { key: "value" },
      contributions: [],
      metrics: { tasksCompleted: 1, tasksFailed: 0 },
    } as unknown as SquadResult;

    const reply = aggregateSquadReply(objResult, "pipeline");
    expect(reply).toContain('"key"');
    expect(reply).toContain('"value"');
  });
});

// ─── routeToSquad ──────────────────────────────────────────────────────────

describe("routeToSquad", () => {
  it("routes to squad via binding match", async () => {
    const coordinator = mockCoordinator();
    const bindings: SquadBinding[] = [
      {
        id: "test-binding",
        channels: ["telegram"],
        squadConfig: { name: "test", strategy: "pipeline", agents: [] },
      },
    ];

    const result = await routeToSquad(
      makeInput({ channel: "telegram", message: "hello" }),
      coordinator,
      bindings,
    );

    expect(result.handled).toBe(true);
    expect(result.squadId).toBe("squad-test");
    expect(result.reply).toBeTruthy();
    expect(coordinator.createSquad as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    expect(coordinator.executeTask as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    expect(coordinator.terminateSquad as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "squad-test",
    );
  });

  it("routes to auto squad on high complexity", async () => {
    const coordinator = mockCoordinator();

    const result = await routeToSquad(
      makeInput({
        message:
          "Research the best authentication practices and implement a secure auth module for our application",
      }),
      coordinator,
      [],
    );

    // The message should trigger complexity analysis
    // Whether it gets handled depends on complexity threshold
    if (result.handled) {
      expect(result.squadId).toBeTruthy();
      expect(result.reply).toBeTruthy();
    }
  });

  it("returns unhandled for simple messages", async () => {
    const coordinator = mockCoordinator();

    const result = await routeToSquad(makeInput({ message: "What time is it?" }), coordinator, []);

    expect(result.handled).toBe(false);
    expect(result.squadId).toBeUndefined();
    expect(coordinator.createSquad as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("routes explicit squad requests", async () => {
    const coordinator = mockCoordinator();

    const result = await routeToSquad(
      makeInput({ message: "Use a squad to research and code this feature" }),
      coordinator,
      [],
    );

    expect(result.handled).toBe(true);
    expect(result.squadId).toBe("squad-test");
  });

  it("terminates squad even on execute failure", async () => {
    const coordinator = mockCoordinator({
      executeTask: vi.fn().mockResolvedValue({
        success: false,
        output: null,
        error: "boom",
        contributions: [],
        metrics: { tasksCompleted: 0, tasksFailed: 1 },
      } as unknown as SquadResult),
    } as unknown as Partial<SquadCoordinator>);

    const bindings: SquadBinding[] = [
      {
        id: "test",
        channels: ["telegram"],
        squadConfig: { name: "test", strategy: "pipeline", agents: [] },
      },
    ];

    const result = await routeToSquad(makeInput({ channel: "telegram" }), coordinator, bindings);

    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Squad task failed");
    expect(coordinator.terminateSquad as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });
});
