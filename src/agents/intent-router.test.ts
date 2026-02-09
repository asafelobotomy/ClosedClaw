/**
 * Tests for Intent Router
 */

import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  describeClassification,
  type ModelRoutingConfig,
  type IntentClassification,
} from "./intent-router.js";

const ROUTING: ModelRoutingConfig = {
  default: "claude-opus-4",
  triage: "claude-haiku-4",
  reasoning: "claude-opus-4",
  creative: "claude-sonnet-4",
  sensitive: "ollama:llama3",
  code: "claude-sonnet-4",
};

// ─── Triage Intent ──────────────────────────────────────────────────────────

describe("classifyIntent - triage", () => {
  it("classifies short greetings", () => {
    const result = classifyIntent("hi", ROUTING);
    expect(result.intent).toBe("triage");
    expect(result.model).toBe("claude-haiku-4");
  });

  it("classifies simple yes/no", () => {
    const result = classifyIntent("yes", ROUTING);
    expect(result.intent).toBe("triage");
  });

  it("classifies quick factual questions", () => {
    const result = classifyIntent("what time is it?", ROUTING);
    expect(result.intent).toBe("triage");
  });

  it("classifies reminders", () => {
    const result = classifyIntent("remind me to call mom", ROUTING);
    expect(result.intent).toBe("triage");
  });

  it("uses triage model", () => {
    const result = classifyIntent("thanks", ROUTING);
    expect(result.model).toBe("claude-haiku-4");
  });
});

// ─── Reasoning Intent ───────────────────────────────────────────────────────

describe("classifyIntent - reasoning", () => {
  it("classifies complex analysis requests", () => {
    const result = classifyIntent(
      "Explain the underlying mechanism of quantum entanglement and why it challenges classical physics. Compare the Copenhagen and Many-Worlds interpretations.",
      ROUTING,
    );
    expect(result.intent).toBe("reasoning");
    expect(result.model).toBe("claude-opus-4");
  });

  it("classifies math questions", () => {
    const result = classifyIntent(
      "Derive the equation for gravitational potential energy using calculus",
      ROUTING,
    );
    expect(result.intent).toBe("reasoning");
  });

  it("classifies philosophy questions", () => {
    const result = classifyIntent(
      "What are the ethics of AI consciousness? Analyze the moral dilemma.",
      ROUTING,
    );
    expect(result.intent).toBe("reasoning");
  });

  it("boosts reasoning for multiple questions", () => {
    const result = classifyIntent(
      "Why does this happen? What are the implications? How can we fix it?",
      ROUTING,
    );
    // Multiple question marks should boost reasoning
    expect(result.signals.some((s) => s.intent === "reasoning")).toBe(true);
  });
});

// ─── Creative Intent ────────────────────────────────────────────────────────

describe("classifyIntent - creative", () => {
  it("classifies writing requests", () => {
    const result = classifyIntent(
      "Write a short story about a robot who discovers emotions",
      ROUTING,
    );
    expect(result.intent).toBe("creative");
    expect(result.model).toBe("claude-sonnet-4");
  });

  it("classifies brainstorming requests", () => {
    const result = classifyIntent(
      "Brainstorm some creative story ideas and draft a short narrative",
      ROUTING,
    );
    expect(result.intent).toBe("creative");
  });

  it("classifies poetry requests", () => {
    const result = classifyIntent("Compose a poem about autumn leaves", ROUTING);
    expect(result.intent).toBe("creative");
  });
});

// ─── Sensitive Intent ───────────────────────────────────────────────────────

describe("classifyIntent - sensitive", () => {
  it("classifies password-related messages", () => {
    const result = classifyIntent(
      "Generate a strong password for my bank account",
      ROUTING,
    );
    expect(result.intent).toBe("sensitive");
    expect(result.model).toBe("ollama:llama3");
  });

  it("classifies PII-related messages", () => {
    const result = classifyIntent(
      "My social security number is... just kidding, but how do I protect my SSN?",
      ROUTING,
    );
    expect(result.intent).toBe("sensitive");
  });

  it("classifies encryption tasks", () => {
    const result = classifyIntent(
      "Encrypt this message with my API key and sign it",
      ROUTING,
    );
    expect(result.intent).toBe("sensitive");
  });
});

// ─── Code Intent ────────────────────────────────────────────────────────────

describe("classifyIntent - code", () => {
  it("classifies implementation requests", () => {
    const result = classifyIntent(
      "Implement a binary search function in TypeScript",
      ROUTING,
    );
    expect(result.intent).toBe("code");
    expect(result.model).toBe("claude-sonnet-4");
  });

  it("classifies debugging requests", () => {
    const result = classifyIntent(
      "Debug this function that crashes when the array is empty, fix the bug",
      ROUTING,
    );
    expect(result.intent).toBe("code");
  });

  it("classifies messages with code blocks", () => {
    const result = classifyIntent(
      "What does this code do?\n```typescript\nconst x = 42;\n```",
      ROUTING,
    );
    expect(result.intent).toBe("code");
  });

  it("classifies npm/package manager tasks", () => {
    const result = classifyIntent(
      "Install express with npm and implement a REST api endpoint",
      ROUTING,
    );
    expect(result.intent).toBe("code");
  });
});

// ─── General Intent ─────────────────────────────────────────────────────────

describe("classifyIntent - general", () => {
  it("defaults to general for ambiguous messages", () => {
    const result = classifyIntent("I was thinking about lunch today", ROUTING);
    expect(result.intent).toBe("general");
    expect(result.model).toBe("claude-opus-4");
  });

  it("uses default model for general intent", () => {
    const result = classifyIntent("Something random", ROUTING);
    expect(result.model).toBe("claude-opus-4");
  });
});

// ─── Model Resolution ───────────────────────────────────────────────────────

describe("model resolution", () => {
  it("uses default model when no routing configured", () => {
    const result = classifyIntent("hi");
    expect(result.model).toBe("default");
  });

  it("falls back to default when intent has no model configured", () => {
    const partial: ModelRoutingConfig = {
      default: "claude-opus-4",
      // No triage model configured
    };
    const result = classifyIntent("hi", partial);
    expect(result.model).toBe("claude-opus-4");
  });
});

// ─── Confidence & Signals ───────────────────────────────────────────────────

describe("confidence and signals", () => {
  it("has higher confidence for strong matches", () => {
    const strong = classifyIntent("Write a poem about love in the style of Shakespeare", ROUTING);
    const weak = classifyIntent("hmm", ROUTING);

    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it("includes signals for detected patterns", () => {
    const result = classifyIntent(
      "Explain the mathematical proof for the Pythagorean theorem",
      ROUTING,
    );

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.intent === "reasoning")).toBe(true);
  });

  it("marks strong matches correctly", () => {
    const strong = classifyIntent(
      "Write a creative story about a dragon",
      ROUTING,
    );
    expect(strong.isStrongMatch).toBe(true);
  });
});

// ─── describeClassification ─────────────────────────────────────────────────

describe("describeClassification", () => {
  it("produces human-readable description", () => {
    const result = classifyIntent(
      "Implement a function to sort arrays in TypeScript",
      ROUTING,
    );
    const desc = describeClassification(result);

    expect(desc).toContain("Intent:");
    expect(desc).toContain("Model:");
    expect(desc).toContain(result.intent);
    expect(desc).toContain(result.model);
  });
});
