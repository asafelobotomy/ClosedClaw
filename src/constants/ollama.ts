/**
 * Shared Ollama constants used across the codebase.
 * These are centralized to avoid duplication and ensure consistency.
 */

import { DEFAULT_OLLAMA_PORT } from "../config/constants/index.js";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export const OLLAMA_BASE_URL = `http://127.0.0.1:${DEFAULT_OLLAMA_PORT}/v1`;
export const OLLAMA_API_BASE_URL = `http://127.0.0.1:${DEFAULT_OLLAMA_PORT}`;

// ---------------------------------------------------------------------------
// Model Defaults
// ---------------------------------------------------------------------------

/** Default context window for Ollama models (tokens). */
export const OLLAMA_DEFAULT_CONTEXT_WINDOW = 128000;

/** Default max output tokens for Ollama models. */
export const OLLAMA_DEFAULT_MAX_TOKENS = 8192;

/** Ollama models are free (local compute). */
export const OLLAMA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

// ---------------------------------------------------------------------------
// API Types
// ---------------------------------------------------------------------------

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  modified_at: string;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
    family?: string;
  };
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

export interface OllamaShowResponse {
  modelfile: string;
  parameters: string;
  template: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
    family?: string;
  };
  model_info?: {
    "general.parameter_count"?: number;
    "llama.context_length"?: number;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// GPU/VRAM Estimation
// ---------------------------------------------------------------------------

/**
 * Rough VRAM requirements for different quantization levels.
 * These are estimates based on common model sizes.
 */
export const VRAM_REQUIREMENTS: Record<string, { basePerB: number; description: string }> = {
  // q4_0: ~0.5GB per billion parameters
  q4_0: { basePerB: 0.5, description: "4-bit (smallest, lower quality)" },
  q4_k_m: { basePerB: 0.55, description: "4-bit K-quant medium" },
  q5_0: { basePerB: 0.6, description: "5-bit" },
  q5_k_m: { basePerB: 0.65, description: "5-bit K-quant medium" },
  q6_k: { basePerB: 0.75, description: "6-bit K-quant" },
  q8_0: { basePerB: 1.0, description: "8-bit (good balance)" },
  fp16: { basePerB: 2.0, description: "16-bit (full precision)" },
  fp32: { basePerB: 4.0, description: "32-bit (maximum precision)" },
};

/**
 * Estimate VRAM needed for a model based on parameter count and quantization.
 * @param paramBillions - Parameter count in billions (e.g., 8 for 8B model)
 * @param quantization - Quantization level (e.g., "q4_k_m", "fp16")
 * @returns Estimated VRAM in GB
 */
export function estimateVramGb(paramBillions: number, quantization: string): number {
  const q = quantization.toLowerCase();
  // Find matching quantization or use q4_k_m as default
  const match = Object.entries(VRAM_REQUIREMENTS).find(([key]) => q.includes(key));
  const { basePerB } = match?.[1] ?? VRAM_REQUIREMENTS.q4_k_m;
  // Add ~1GB overhead for KV cache and runtime
  return paramBillions * basePerB + 1;
}

/**
 * Parse parameter size from model name or details (e.g., "8b", "70b", "7B").
 * Returns 0 if unknown.
 */
export function parseParamSize(modelNameOrSize: string): number {
  const match = modelNameOrSize.match(/(\d+(?:\.\d+)?)[bB]/);
  return match ? Number(match[1]) : 0;
}

/**
 * Parse quantization from model name (e.g., ":q4_k_m", ":fp16").
 * Returns "q4_k_m" as default if unknown.
 */
export function parseQuantization(modelName: string): string {
  const match = modelName.match(/:([qfQ]\w+)/);
  return match?.[1]?.toLowerCase() ?? "q4_k_m";
}

// ---------------------------------------------------------------------------
// Model Recommendations
// ---------------------------------------------------------------------------

export interface SuggestedModel {
  id: string;
  name: string;
  size: string;
  description: string;
  vramRequired: string;
  paramSize: number;
  quantization: string;
  recommended?: boolean;
}

/**
 * Popular models that work well with ClosedClaw, sorted by VRAM requirement.
 */
export const SUGGESTED_MODELS: SuggestedModel[] = [
  {
    id: "qwen3:4b",
    name: "Qwen3 4B",
    size: "2.6GB",
    description: "Lightweight, good for low VRAM",
    vramRequired: "4GB",
    paramSize: 4,
    quantization: "q4_k_m",
  },
  {
    id: "mistral:7b",
    name: "Mistral 7B",
    size: "4.1GB",
    description: "Fast and efficient",
    vramRequired: "5GB",
    paramSize: 7,
    quantization: "q4_k_m",
  },
  {
    id: "llama3.3:8b",
    name: "Llama 3.3 8B",
    size: "4.9GB",
    description: "Meta's latest small model",
    vramRequired: "6GB",
    paramSize: 8,
    quantization: "q4_k_m",
  },
  {
    id: "qwen3:8b",
    name: "Qwen3 8B",
    size: "5.2GB",
    description: "Best balance of capability and speed",
    vramRequired: "6GB",
    paramSize: 8,
    quantization: "q4_k_m",
    recommended: true,
  },
  {
    id: "deepseek-r1:8b",
    name: "DeepSeek R1 8B",
    size: "4.9GB",
    description: "Reasoning-focused model",
    vramRequired: "6GB",
    paramSize: 8,
    quantization: "q4_k_m",
  },
  {
    id: "qwen3:14b",
    name: "Qwen3 14B",
    size: "9.0GB",
    description: "Better capability, needs more VRAM",
    vramRequired: "10GB",
    paramSize: 14,
    quantization: "q4_k_m",
  },
  {
    id: "qwen3:32b",
    name: "Qwen3 32B",
    size: "19GB",
    description: "High capability",
    vramRequired: "20GB",
    paramSize: 32,
    quantization: "q4_k_m",
  },
  {
    id: "llama3.3:70b",
    name: "Llama 3.3 70B",
    size: "40GB",
    description: "Near-frontier capability",
    vramRequired: "42GB",
    paramSize: 70,
    quantization: "q4_k_m",
  },
];
