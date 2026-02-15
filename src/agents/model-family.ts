/**
 * Model family classification — provides centralized metadata about model
 * capabilities, preferred prompt formatting, and context budgets.
 *
 * Used by system-prompt assembly, bootstrap file injection, and onboarding
 * to tailor behavior based on the running model's strengths and constraints.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelFamily =
  | "anthropic"
  | "openai"
  | "google"
  | "meta-large"
  | "meta-small"
  | "qwen-large"
  | "qwen-small"
  | "mistral-large"
  | "mistral-small"
  | "deepseek"
  | "minimax"
  | "moonshot"
  | "glm"
  | "phi"
  | "unknown";

export type ModelTier = "frontier" | "mid" | "small";

export type PreferredFormat = "xml" | "markdown" | "minimal-markdown";

export interface ModelFamilyInfo {
  family: ModelFamily;
  tier: ModelTier;
  /** Best prompt structure format for this model family. */
  preferredFormat: PreferredFormat;
  /** 0–5 scale: how well the model parses XML-tagged prompts. */
  xmlComprehension: number;
  /** 0–5 scale: how reliably the model maintains a persona across turns. */
  personaAdherence: number;
  /** Soft cap on useful system prompt content (chars). Beyond this, returns diminish. */
  maxUsefulSystemPromptChars: number;
  /** Whether the model can handle open-ended BOOTSTRAP.md onboarding. */
  supportsComplexOnboarding: boolean;
  /** Whether this is typically a local/open-source model. */
  isLocal: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a rough parameter-count hint from a model id string.  Returns 0 if unknown. */
function extractParamSize(modelId: string): number {
  const match = modelId.match(/(\d+)[bB]/);
  return match ? Number(match[1]) : 0;
}

function isLargeLocalModel(modelId: string): boolean {
  const size = extractParamSize(modelId);
  return size >= 30;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const FALLBACK_INFO: ModelFamilyInfo = {
  family: "unknown",
  tier: "mid",
  preferredFormat: "markdown",
  xmlComprehension: 3,
  personaAdherence: 3,
  maxUsefulSystemPromptChars: 10_000,
  supportsComplexOnboarding: true,
  isLocal: false,
};

/**
 * Classify a model into a family with capability metadata.
 *
 * @param provider - The normalized provider id (e.g. "anthropic", "ollama", "openai-codex").
 * @param modelId  - The model id/name (e.g. "claude-sonnet-4-5", "qwen3:8b", "gpt-5.2").
 */
export function getModelFamily(provider: string, modelId: string): ModelFamilyInfo {
  const p = provider.trim().toLowerCase();
  const m = modelId.trim().toLowerCase();

  // --- Anthropic Claude ---
  if (p === "anthropic" || p === "synthetic" || m.startsWith("claude-") || m.startsWith("claude_")) {
    return {
      family: "anthropic",
      tier: "frontier",
      preferredFormat: "xml",
      xmlComprehension: 5,
      personaAdherence: 5,
      maxUsefulSystemPromptChars: 50_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- OpenAI GPT ---
  if (
    p === "openai" ||
    p === "openai-codex" ||
    m.startsWith("gpt-") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  ) {
    return {
      family: "openai",
      tier: "frontier",
      preferredFormat: "markdown",
      xmlComprehension: 3,
      personaAdherence: 4,
      maxUsefulSystemPromptChars: 30_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- Google Gemini ---
  if (
    p.includes("google") ||
    p.includes("antigravity") ||
    p.includes("gemini") ||
    m.startsWith("gemini-")
  ) {
    return {
      family: "google",
      tier: "frontier",
      preferredFormat: "xml",
      xmlComprehension: 4,
      personaAdherence: 4,
      maxUsefulSystemPromptChars: 50_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- Moonshot / Kimi ---
  if (p === "moonshot" || p.includes("kimi") || m.includes("kimi") || m.includes("moonshot")) {
    return {
      family: "moonshot",
      tier: "frontier",
      preferredFormat: "markdown",
      xmlComprehension: 3,
      personaAdherence: 4,
      maxUsefulSystemPromptChars: 30_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- MiniMax ---
  if (p.includes("minimax") || m.includes("minimax") || m.startsWith("m2")) {
    return {
      family: "minimax",
      tier: "frontier",
      preferredFormat: "markdown",
      xmlComprehension: 3,
      personaAdherence: 4,
      maxUsefulSystemPromptChars: 30_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- Z.AI / GLM ---
  if (p === "zai" || m.includes("glm")) {
    return {
      family: "glm",
      tier: "mid",
      preferredFormat: "markdown",
      xmlComprehension: 3,
      personaAdherence: 3,
      maxUsefulSystemPromptChars: 15_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- DeepSeek ---
  if (p.includes("deepseek") || m.includes("deepseek")) {
    return {
      family: "deepseek",
      tier: "mid",
      preferredFormat: "markdown",
      xmlComprehension: 3,
      personaAdherence: 3,
      maxUsefulSystemPromptChars: 15_000,
      supportsComplexOnboarding: true,
      isLocal: false,
    };
  }

  // --- Meta Llama (local via Ollama or OpenRouter) ---
  if (m.includes("llama")) {
    const large = isLargeLocalModel(m);
    return {
      family: large ? "meta-large" : "meta-small",
      tier: large ? "mid" : "small",
      preferredFormat: large ? "markdown" : "minimal-markdown",
      xmlComprehension: large ? 3 : 2,
      personaAdherence: large ? 3 : 2,
      maxUsefulSystemPromptChars: large ? 10_000 : 3_000,
      supportsComplexOnboarding: large,
      isLocal: true,
    };
  }

  // --- Qwen (local via Ollama or via qwen-portal) ---
  if (p === "qwen-portal" || m.includes("qwen")) {
    const large = isLargeLocalModel(m);
    // Qwen via portal (cloud) is always "large" tier
    const cloudLarge = p === "qwen-portal" || large;
    return {
      family: cloudLarge ? "qwen-large" : "qwen-small",
      tier: cloudLarge ? "mid" : "small",
      preferredFormat: cloudLarge ? "xml" : "minimal-markdown",
      xmlComprehension: cloudLarge ? 4 : 3,
      personaAdherence: cloudLarge ? 3 : 2,
      maxUsefulSystemPromptChars: cloudLarge ? 15_000 : 5_000,
      supportsComplexOnboarding: cloudLarge,
      isLocal: p === "ollama",
    };
  }

  // --- Mistral / Mixtral ---
  if (p.includes("mistral") || m.includes("mistral") || m.includes("mixtral")) {
    const large = isLargeLocalModel(m) || m.includes("large") || m.includes("8x22b");
    return {
      family: large ? "mistral-large" : "mistral-small",
      tier: large ? "mid" : "small",
      preferredFormat: large ? "markdown" : "minimal-markdown",
      xmlComprehension: large ? 3 : 2,
      personaAdherence: large ? 3 : 2,
      maxUsefulSystemPromptChars: large ? 10_000 : 3_000,
      supportsComplexOnboarding: large,
      isLocal: p === "ollama",
    };
  }

  // --- Microsoft Phi (local) ---
  if (m.includes("phi-")) {
    const large = isLargeLocalModel(m);
    return {
      family: "phi",
      tier: large ? "mid" : "small",
      preferredFormat: large ? "markdown" : "minimal-markdown",
      xmlComprehension: large ? 3 : 2,
      personaAdherence: large ? 3 : 2,
      maxUsefulSystemPromptChars: large ? 10_000 : 3_000,
      supportsComplexOnboarding: large,
      isLocal: true,
    };
  }

  // --- Ollama fallback (any unknown model on Ollama is local) ---
  if (p === "ollama") {
    const large = isLargeLocalModel(m);
    return {
      ...FALLBACK_INFO,
      tier: large ? "mid" : "small",
      preferredFormat: large ? "markdown" : "minimal-markdown",
      maxUsefulSystemPromptChars: large ? 10_000 : 5_000,
      supportsComplexOnboarding: large,
      isLocal: true,
    };
  }

  // --- OpenRouter / AI Gateway / Copilot Proxy / Venice / OpenCode Zen ---
  // These are routing layers — try to classify based on model id.
  if (
    p === "openrouter" ||
    p === "ai-gateway" ||
    p === "copilot-proxy" ||
    p === "venice" ||
    p === "opencode"
  ) {
    // Recurse with the model id only to try to extract the underlying family.
    // e.g. openrouter/anthropic/claude-sonnet-4-5 → detects "claude-"
    if (m.includes("claude") || m.includes("anthropic")) {
      return { ...getModelFamily("anthropic", m), isLocal: false };
    }
    if (m.includes("gpt-") || m.includes("openai")) {
      return { ...getModelFamily("openai", m), isLocal: false };
    }
    if (m.includes("gemini")) {
      return { ...getModelFamily("google", m), isLocal: false };
    }
    if (m.includes("llama")) {
      return { ...getModelFamily("meta-llama", m), isLocal: false };
    }
    if (m.includes("qwen")) {
      return { ...getModelFamily("qwen-portal", m), isLocal: false };
    }
    if (m.includes("mistral") || m.includes("mixtral")) {
      return { ...getModelFamily("mistral", m), isLocal: false };
    }
    if (m.includes("deepseek")) {
      return { ...getModelFamily("deepseek", m), isLocal: false };
    }
    // Unknown model on a routing provider — assume cloud, mid tier.
    return { ...FALLBACK_INFO, isLocal: false };
  }

  return FALLBACK_INFO;
}

// ---------------------------------------------------------------------------
// Convenience queries
// ---------------------------------------------------------------------------

/**
 * Returns true when the provider/model pair refers to a local / open-source
 * model that typically runs on the user's own hardware.
 */
export function isLocalProvider(provider: string): boolean {
  const p = provider.trim().toLowerCase();
  return p === "ollama";
}

/**
 * Convenience: resolve the bootstrap complexity mode based on the model.
 */
export function resolveBootstrapComplexity(
  family: ModelFamilyInfo,
): "full" | "guided" | "templated" {
  if (!family.supportsComplexOnboarding) {
    return "templated";
  }
  return family.tier === "frontier" ? "full" : "guided";
}

/**
 * Returns a short human-readable label describing the model tier.
 */
export function modelTierLabel(tier: ModelTier): string {
  switch (tier) {
    case "frontier":
      return "Frontier (high capability)";
    case "mid":
      return "Mid-range";
    case "small":
      return "Compact (resource-efficient)";
  }
}
