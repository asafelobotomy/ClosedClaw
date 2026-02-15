import { describe, expect, it } from "vitest";
import {
  getModelFamily,
  isLocalProvider,
  modelTierLabel,
  resolveBootstrapComplexity,
} from "./model-family.js";

describe("getModelFamily", () => {
  it("classifies Anthropic Claude as frontier with XML preference", () => {
    const info = getModelFamily("anthropic", "claude-sonnet-4-5");
    expect(info.family).toBe("anthropic");
    expect(info.tier).toBe("frontier");
    expect(info.preferredFormat).toBe("xml");
    expect(info.personaAdherence).toBe(5);
    expect(info.isLocal).toBe(false);
  });

  it("classifies OpenAI GPT as frontier with markdown preference", () => {
    const info = getModelFamily("openai", "gpt-5.2");
    expect(info.family).toBe("openai");
    expect(info.tier).toBe("frontier");
    expect(info.preferredFormat).toBe("markdown");
    expect(info.isLocal).toBe(false);
  });

  it("classifies Google Gemini as frontier with XML preference", () => {
    const info = getModelFamily("google-antigravity", "gemini-3-pro");
    expect(info.family).toBe("google");
    expect(info.tier).toBe("frontier");
    expect(info.preferredFormat).toBe("xml");
    expect(info.isLocal).toBe(false);
  });

  it("classifies small Llama models as small tier with minimal-markdown", () => {
    const info = getModelFamily("ollama", "llama3.3:8b");
    expect(info.family).toBe("meta-small");
    expect(info.tier).toBe("small");
    expect(info.preferredFormat).toBe("minimal-markdown");
    expect(info.supportsComplexOnboarding).toBe(false);
    expect(info.isLocal).toBe(true);
  });

  it("classifies large Llama models as mid tier with markdown", () => {
    const info = getModelFamily("ollama", "llama3.3:70b");
    expect(info.family).toBe("meta-large");
    expect(info.tier).toBe("mid");
    expect(info.preferredFormat).toBe("markdown");
    expect(info.supportsComplexOnboarding).toBe(true);
    expect(info.isLocal).toBe(true);
  });

  it("classifies small Qwen models via Ollama as small tier", () => {
    const info = getModelFamily("ollama", "qwen3:8b");
    expect(info.family).toBe("qwen-small");
    expect(info.tier).toBe("small");
    expect(info.preferredFormat).toBe("minimal-markdown");
    expect(info.maxUsefulSystemPromptChars).toBeLessThanOrEqual(5000);
    expect(info.isLocal).toBe(true);
  });

  it("classifies Qwen portal as larger tier (cloud)", () => {
    const info = getModelFamily("qwen-portal", "qwen-max");
    expect(info.family).toBe("qwen-large");
    expect(info.tier).toBe("mid");
    expect(info.preferredFormat).toBe("xml");
    // qwen-portal runs on Qwen cloud, not local.
    expect(info.isLocal).toBe(false);
  });

  it("classifies MiniMax as frontier", () => {
    const info = getModelFamily("minimax", "m2.1");
    expect(info.family).toBe("minimax");
    expect(info.tier).toBe("frontier");
    expect(info.isLocal).toBe(false);
  });

  it("classifies Moonshot/Kimi as frontier", () => {
    const info = getModelFamily("moonshot", "kimi-k2");
    expect(info.family).toBe("moonshot");
    expect(info.tier).toBe("frontier");
    expect(info.isLocal).toBe(false);
  });

  it("extracts underlying family from OpenRouter model ids", () => {
    const info = getModelFamily("openrouter", "anthropic/claude-sonnet-4-5");
    expect(info.family).toBe("anthropic");
    expect(info.tier).toBe("frontier");
    expect(info.isLocal).toBe(false);
  });

  it("returns unknown fallback for unrecognized providers", () => {
    const info = getModelFamily("unknown-provider", "mystery-model");
    expect(info.family).toBe("unknown");
    expect(info.tier).toBe("mid");
  });

  it("classifies DeepSeek as mid tier", () => {
    const info = getModelFamily("deepseek", "deepseek-v3");
    expect(info.family).toBe("deepseek");
    expect(info.tier).toBe("mid");
  });

  it("classifies Mistral Large as mid tier", () => {
    const info = getModelFamily("mistral", "mistral-large-2501");
    expect(info.family).toBe("mistral-large");
    expect(info.tier).toBe("mid");
  });

  it("classifies Mistral 7B as small tier", () => {
    const info = getModelFamily("ollama", "mistral:7b");
    expect(info.family).toBe("mistral-small");
    expect(info.tier).toBe("small");
    expect(info.isLocal).toBe(true);
  });
});

describe("isLocalProvider", () => {
  it("returns true for ollama", () => {
    expect(isLocalProvider("ollama")).toBe(true);
    expect(isLocalProvider("OLLAMA")).toBe(true);
  });

  it("returns false for cloud providers", () => {
    expect(isLocalProvider("anthropic")).toBe(false);
    expect(isLocalProvider("openai")).toBe(false);
    expect(isLocalProvider("google")).toBe(false);
  });
});

describe("resolveBootstrapComplexity", () => {
  it("returns full for frontier tier", () => {
    const info = getModelFamily("anthropic", "claude-opus-4-5");
    expect(resolveBootstrapComplexity(info)).toBe("full");
  });

  it("returns guided for mid tier that supports complex onboarding", () => {
    const info = getModelFamily("ollama", "llama3.3:70b");
    expect(resolveBootstrapComplexity(info)).toBe("guided");
  });

  it("returns templated for small models that don't support complex onboarding", () => {
    const info = getModelFamily("ollama", "qwen3:8b");
    expect(resolveBootstrapComplexity(info)).toBe("templated");
  });
});

describe("modelTierLabel", () => {
  it("returns human-readable labels", () => {
    expect(modelTierLabel("frontier")).toBe("Frontier (high capability)");
    expect(modelTierLabel("mid")).toBe("Mid-range");
    expect(modelTierLabel("small")).toBe("Compact (resource-efficient)");
  });
});
