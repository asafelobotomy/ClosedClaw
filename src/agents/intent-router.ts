/**
 * Intent Router — Classify messages and route to appropriate models
 *
 * Implements lightweight heuristic-based intent classification to route
 * incoming messages to specialized models:
 * - **triage**: Quick, cheap classification (Haiku-class)
 * - **reasoning**: Deep analysis, complex logic (Opus-class)
 * - **creative**: Writing, brainstorming (Sonnet-class)
 * - **sensitive**: Data that must stay local (Ollama/local model)
 * - **code**: Programming tasks (Sonnet-class)
 * - **general**: Everything else (default model)
 *
 * The router uses keyword matching, pattern detection, and message
 * characteristics (length, complexity) to classify intent without
 * requiring an LLM call — keeping routing fast and free.
 *
 * @module agents/intent-router
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Intent categories for model routing.
 */
export type IntentCategory =
  | "triage"
  | "reasoning"
  | "creative"
  | "sensitive"
  | "code"
  | "general";

/**
 * Model routing configuration for an agent.
 *
 * Maps intent categories to model IDs. Missing entries use the default model.
 */
export interface ModelRoutingConfig {
  /** Default model for unclassified messages */
  default: string;

  /** Fast/cheap model for triage and simple queries */
  triage?: string;

  /** Powerful model for complex reasoning */
  reasoning?: string;

  /** Creative-capable model for writing tasks */
  creative?: string;

  /** Local-only model for sensitive data */
  sensitive?: string;

  /** Code-optimized model */
  code?: string;
}

/**
 * Result of intent classification.
 */
export interface IntentClassification {
  /** Primary detected intent */
  intent: IntentCategory;

  /** Confidence score (0–1) */
  confidence: number;

  /** Model to use based on routing config */
  model: string;

  /** All detected signals with scores */
  signals: IntentSignal[];

  /** Whether the classification was a strong match or a default fallback */
  isStrongMatch: boolean;
}

/**
 * A signal that contributed to the classification.
 */
export interface IntentSignal {
  /** The intent this signal supports */
  intent: IntentCategory;

  /** Signal strength (0–1) */
  score: number;

  /** Why this signal was detected */
  reason: string;
}

// ─── Intent Detection Patterns ──────────────────────────────────────────────

/**
 * Keyword patterns for each intent category.
 */
const INTENT_PATTERNS: Record<IntentCategory, Array<{ pattern: RegExp; weight: number }>> = {
  triage: [
    { pattern: /^(yes|no|ok|sure|thanks|hi|hello|hey)\b/i, weight: 0.8 },
    { pattern: /^(remind|alarm|timer|set|cancel|stop)\b/i, weight: 0.6 },
    { pattern: /^(what|who|when|where) (is|are|was|were)\b/i, weight: 0.4 },
    { pattern: /^(how much|how many|how old|how far)\b/i, weight: 0.5 },
    { pattern: /\b(weather|time|date|convert|translate)\b/i, weight: 0.6 },
    { pattern: /\b(emoji|sticker|gif)\b/i, weight: 0.7 },
  ],

  reasoning: [
    { pattern: /\b(explain|analyze|evaluate|compare|contrast)\b/i, weight: 0.6 },
    { pattern: /\b(why|how does|mechanism|underlying|theory)\b/i, weight: 0.5 },
    { pattern: /\b(prove|derive|logic|contradiction|fallacy)\b/i, weight: 0.7 },
    { pattern: /\b(philosophy|ethics|moral|dilemma)\b/i, weight: 0.6 },
    { pattern: /\b(math|equation|calcul|formula|theorem)\b/i, weight: 0.7 },
    { pattern: /\b(strategy|plan|architect|design pattern)\b/i, weight: 0.5 },
    { pattern: /\b(trade-?off|pros and cons|advantages|disadvantages)\b/i, weight: 0.5 },
    { pattern: /\b(step by step|reasoning|think through)\b/i, weight: 0.6 },
  ],

  creative: [
    { pattern: /\b(write|compose|draft|author|create)\b/i, weight: 0.4 },
    { pattern: /\b(story|poem|essay|article|blog|post)\b/i, weight: 0.7 },
    { pattern: /\b(brainstorm|ideas?|creative|imagine|invent)\b/i, weight: 0.6 },
    { pattern: /\b(rewrite|rephrase|edit|revise|improve writing)\b/i, weight: 0.5 },
    { pattern: /\b(tone|style|voice|narrative|metaphor)\b/i, weight: 0.6 },
    { pattern: /\b(lyrics|script|dialogue|monologue)\b/i, weight: 0.7 },
    { pattern: /\b(fiction|non-?fiction|genre|plot|character)\b/i, weight: 0.7 },
  ],

  sensitive: [
    { pattern: /\b(password|passphrase|secret|credential|api.?key)\b/i, weight: 0.8 },
    { pattern: /\b(ssn|social security|tax.?id|passport)\b/i, weight: 0.9 },
    { pattern: /\b(credit card|bank account|routing number)\b/i, weight: 0.9 },
    { pattern: /\b(medical|health|diagnosis|prescription)\b/i, weight: 0.6 },
    { pattern: /\b(private|confidential|classified|restricted)\b/i, weight: 0.5 },
    { pattern: /\b(encrypt|decrypt|hash|sign|verify)\b/i, weight: 0.4 },
    { pattern: /\b(personal data|pii|gdpr|hipaa)\b/i, weight: 0.7 },
    { pattern: /\b(never share|keep secret|don'?t tell|between us)\b/i, weight: 0.6 },
  ],

  code: [
    { pattern: /\b(function|class|interface|type|enum)\b/i, weight: 0.7 },
    { pattern: /\b(implement|refactor|debug|fix bug|patch)\b/i, weight: 0.6 },
    { pattern: /\b(typescript|javascript|python|rust|go|java|c\+\+)\b/i, weight: 0.5 },
    { pattern: /\b(npm|pnpm|pip|cargo|maven|gradle)\b/i, weight: 0.6 },
    { pattern: /\b(git|commit|push|branch|merge|rebase)\b/i, weight: 0.5 },
    { pattern: /\b(test|unit test|integration test|vitest|jest)\b/i, weight: 0.5 },
    { pattern: /\b(api|endpoint|rest|graphql|grpc)\b/i, weight: 0.4 },
    { pattern: /\b(docker|container|kubernetes|deploy)\b/i, weight: 0.4 },
    { pattern: /```[\s\S]*```/, weight: 0.8 }, // Code blocks
    { pattern: /\b(import|export|require|from)\s+['"]/, weight: 0.7 },
  ],

  general: [
    // General is the fallback — no specific patterns, just baseline
    { pattern: /.*/, weight: 0.1 },
  ],
};

/**
 * Minimum confidence to consider a classification "strong".
 */
const STRONG_MATCH_THRESHOLD = 0.4;

/**
 * Message length thresholds that influence classification.
 */
const LENGTH_THRESHOLDS = {
  /** Very short messages → likely triage */
  TRIAGE_MAX: 30,
  /** Long messages → likely reasoning or creative */
  COMPLEX_MIN: 200,
  /** Very long messages → boost reasoning */
  REASONING_BOOST_MIN: 500,
};

// ─── Intent Classification ──────────────────────────────────────────────────

/**
 * Classify the intent of an incoming message.
 *
 * Uses heuristic keyword matching + message characteristics.
 * No LLM calls — keeps routing fast and free.
 *
 * @param message - The user's incoming message
 * @param routing - Model routing configuration (optional)
 * @returns Classification result with model recommendation
 *
 * @example
 * ```typescript
 * const result = classifyIntent("remind me to call mom", {
 *   default: "claude-opus-4",
 *   triage: "claude-haiku-4",
 * });
 * // → { intent: "triage", model: "claude-haiku-4", confidence: 0.6 }
 * ```
 */
export function classifyIntent(
  message: string,
  routing?: ModelRoutingConfig,
): IntentClassification {
  const signals: IntentSignal[] = [];
  const scores = new Map<IntentCategory, number>();

  // Score each intent category by matching patterns
  for (const [category, patterns] of Object.entries(INTENT_PATTERNS) as Array<[IntentCategory, typeof INTENT_PATTERNS.triage]>) {
    if (category === "general") {continue;} // General is the baseline fallback

    let categoryScore = 0;

    for (const { pattern, weight } of patterns) {
      if (pattern.test(message)) {
        categoryScore += weight;
        signals.push({
          intent: category,
          score: weight,
          reason: `Matched pattern: ${pattern.source.slice(0, 40)}`,
        });
      }
    }

    if (categoryScore > 0) {
      scores.set(category, categoryScore);
    }
  }

  // Apply length-based adjustments
  const length = message.length;

  if (length <= LENGTH_THRESHOLDS.TRIAGE_MAX) {
    const existing = scores.get("triage") ?? 0;
    scores.set("triage", existing + 0.3);
    signals.push({ intent: "triage", score: 0.3, reason: `Short message (${length} chars)` });
  }

  if (length >= LENGTH_THRESHOLDS.COMPLEX_MIN) {
    const existing = scores.get("reasoning") ?? 0;
    scores.set("reasoning", existing + 0.2);
    signals.push({ intent: "reasoning", score: 0.2, reason: `Long message (${length} chars)` });
  }

  if (length >= LENGTH_THRESHOLDS.REASONING_BOOST_MIN) {
    const existing = scores.get("reasoning") ?? 0;
    scores.set("reasoning", existing + 0.2);
    signals.push({ intent: "reasoning", score: 0.2, reason: `Very long message (${length} chars)` });
  }

  // Apply question mark boost for reasoning
  const questionCount = (message.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    const existing = scores.get("reasoning") ?? 0;
    scores.set("reasoning", existing + 0.2 * Math.min(questionCount, 3));
    signals.push({ intent: "reasoning", score: 0.2, reason: `Multiple questions (${questionCount})` });
  }

  // Find the winning intent
  let bestIntent: IntentCategory = "general";
  let bestScore = 0;

  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = category;
    }
  }

  // Normalize confidence to 0–1
  const confidence = Math.min(1, bestScore / 2);
  const isStrongMatch = confidence >= STRONG_MATCH_THRESHOLD;

  // If not a strong match, fall back to general
  if (!isStrongMatch) {
    bestIntent = "general";
  }

  // Resolve model from routing config
  const model = resolveModel(bestIntent, routing);

  return {
    intent: bestIntent,
    confidence,
    model,
    signals,
    isStrongMatch,
  };
}

/**
 * Resolve the model to use for a given intent.
 */
function resolveModel(intent: IntentCategory, routing?: ModelRoutingConfig): string {
  if (!routing) {return "default";}

  switch (intent) {
    case "triage":
      return routing.triage ?? routing.default;
    case "reasoning":
      return routing.reasoning ?? routing.default;
    case "creative":
      return routing.creative ?? routing.default;
    case "sensitive":
      return routing.sensitive ?? routing.default;
    case "code":
      return routing.code ?? routing.default;
    case "general":
    default:
      return routing.default;
  }
}

/**
 * Get a human-readable description of why a particular intent was chosen.
 */
export function describeClassification(result: IntentClassification): string {
  const topSignals = result.signals
    .filter((s) => s.intent === result.intent)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 3);

  const reasons = topSignals.map((s) => s.reason).join("; ");

  return [
    `Intent: ${result.intent} (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
    `Model: ${result.model}`,
    result.isStrongMatch ? "Strong match" : "Weak match (using default)",
    reasons ? `Signals: ${reasons}` : "No specific signals",
  ].join("\n");
}
