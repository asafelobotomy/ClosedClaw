// Defaults for agent metadata when upstream does not supply them.
// Default to local Ollama Qwen3 unless overridden by config/env.
export const DEFAULT_PROVIDER = "ollama";
export const DEFAULT_MODEL = "qwen3:8b";
// Context window: Qwen3:8b commonly uses 32k context in local Ollama setups.
export const DEFAULT_CONTEXT_TOKENS = 32_768;
