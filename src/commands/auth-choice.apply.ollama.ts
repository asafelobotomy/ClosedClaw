import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyPrimaryModel } from "./model-picker.js";
import { DEFAULT_OLLAMA_PORT } from "../config/constants/index.js";
import {
  OLLAMA_DEFAULT_CONTEXT_WINDOW,
  OLLAMA_DEFAULT_MAX_TOKENS,
  OLLAMA_DEFAULT_COST,
  SUGGESTED_MODELS,
  estimateVramGb,
  type OllamaModel,
  type OllamaTagsResponse,
  type OllamaShowResponse,
} from "../constants/ollama.js";
import {
  NOTE_TITLES,
  NOTE_ICONS,
  formatHardwareSummary,
  formatModelSummary,
  formatNoteWithIcon,
} from "../wizard/display-helpers.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GPU info from nvidia-smi or other detection.
 */
interface GpuInfo {
  name: string;
  vramMb: number;
  available: boolean;
}

/**
 * Detect NVIDIA GPU and VRAM using nvidia-smi.
 */
async function detectNvidiaGpu(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits",
      { timeout: 5000 },
    );
    const lines = stdout.trim().split("\n");
    if (lines.length > 0 && lines[0]) {
      const [name, memMb] = lines[0].split(",").map((s) => s.trim());
      const vramMb = parseInt(memMb ?? "0", 10);
      if (name && vramMb > 0) {
        return { name, vramMb, available: true };
      }
    }
  } catch {
    // nvidia-smi not available or failed
  }
  return null;
}

/**
 * Detect AMD GPU using rocm-smi.
 */
async function detectAmdGpu(): Promise<GpuInfo | null> {
  try {
    // Try rocm-smi for AMD GPUs
    const { stdout } = await execAsync("rocm-smi --showmeminfo vram --json", {
      timeout: 5000,
    });
    const data = JSON.parse(stdout) as Record<string, { "VRAM Total Memory (B)"?: string; "Card series"?: string }>;
    const card = Object.values(data)[0];
    if (card) {
      const vramBytes = parseInt(card["VRAM Total Memory (B)"] ?? "0", 10);
      const vramMb = Math.floor(vramBytes / (1024 * 1024));
      const name = card["Card series"] ?? "AMD GPU";
      if (vramMb > 0) {
        return { name, vramMb, available: true };
      }
    }
  } catch {
    // rocm-smi not available
  }
  return null;
}

/**
 * Detect GPU and VRAM (NVIDIA first, then AMD).
 */
async function detectGpu(): Promise<GpuInfo | null> {
  const nvidia = await detectNvidiaGpu();
  if (nvidia) return nvidia;

  const amd = await detectAmdGpu();
  if (amd) return amd;

  return null;
}

/**
 * Check if Ollama is running by querying the /api/tags endpoint.
 */
async function checkOllamaRunning(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of models available in Ollama.
 */
async function getOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as OllamaTagsResponse;
    return data.models ?? [];
  } catch {
    return [];
  }
}

/**
 * Get detailed model info including context window from Ollama /api/show.
 */
async function getModelInfo(baseUrl: string, modelName: string): Promise<OllamaShowResponse | null> {
  try {
    const response = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as OllamaShowResponse;
  } catch {
    return null;
  }
}

/**
 * Extract context window from model info.
 */
function extractContextWindow(modelInfo: OllamaShowResponse | null): number {
  if (!modelInfo?.model_info) {
    return OLLAMA_DEFAULT_CONTEXT_WINDOW;
  }
  // Try common context window keys
  const info = modelInfo.model_info;
  for (const key of Object.keys(info)) {
    if (key.toLowerCase().includes("context") && key.toLowerCase().includes("length")) {
      const value = info[key];
      if (typeof value === "number" && value > 0) {
        return value;
      }
    }
  }
  return OLLAMA_DEFAULT_CONTEXT_WINDOW;
}

/**
 * Format model size in human-readable format.
 */
function formatSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

export async function applyAuthChoiceOllama(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "ollama") {
    return null;
  }

  const baseUrl = `http://127.0.0.1:${DEFAULT_OLLAMA_PORT}`;
  let nextConfig = params.config;

  // Detect GPU for VRAM warnings
  const gpu = await detectGpu();
  const vramGb = gpu ? gpu.vramMb / 1024 : 0;

  // Check if Ollama is running
  const ollamaRunning = await checkOllamaRunning(baseUrl);

  if (!ollamaRunning) {
    const gpuNote = gpu
      ? `\n${NOTE_ICONS.success} GPU: ${gpu.name} (${vramGb.toFixed(1)}GB VRAM)`
      : `\n${NOTE_ICONS.warning} No GPU detected - models will run on CPU (slower)`;

    await params.prompter.note(
      [
        `${NOTE_ICONS.error} Ollama is not running on your machine.`,
        gpuNote,
        "",
        "To install Ollama:",
        "  1. Visit https://ollama.com/download",
        "  2. Download and install for your platform",
        "  3. Start Ollama (it runs as a background service)",
        "  4. Run: ollama pull qwen3:8b",
        "",
        "Then restart onboarding.",
      ].join("\n"),
      NOTE_TITLES.error,
    );
    return { config: nextConfig };
  }

  // Show GPU info
  if (gpu) {
    await params.prompter.note(
      formatHardwareSummary({ gpuName: gpu.name, vramGb }),
      NOTE_TITLES.gpu,
    );
  } else {
    await params.prompter.note(
      formatHardwareSummary({ cpuMode: true }),
      NOTE_TITLES.cpuMode,
    );
  }

  // Get available models
  const models = await getOllamaModels(baseUrl);

  if (models.length === 0) {
    // No models - offer to help download with VRAM-appropriate suggestions
    const downloadChoice = await params.prompter.select<"download" | "skip">({
      message: "No Ollama models found. Would you like to download one?",
      options: [
        { value: "download", label: "Yes, help me download a model" },
        { value: "skip", label: "No, I'll download one manually" },
      ],
    });

    if (downloadChoice === "download") {
      // Filter suggestions by VRAM
      const suitableModels = vramGb > 0
        ? SUGGESTED_MODELS.filter((m) => {
            const estVram = estimateVramGb(m.paramSize, m.quantization);
            return estVram <= vramGb * 0.9; // 90% of VRAM for safety margin
          })
        : SUGGESTED_MODELS.filter((m) => m.paramSize <= 8); // CPU: suggest small models

      const modelList = suitableModels.length > 0 ? suitableModels : SUGGESTED_MODELS.slice(0, 3);

      await params.prompter.note(
        [
          vramGb > 0
            ? `Based on your ${vramGb.toFixed(1)}GB VRAM, these models should work well:`
            : "Recommended models for CPU inference:",
          "",
          ...modelList.map((m) => {
            const estVram = estimateVramGb(m.paramSize, m.quantization);
            const vramHint = vramGb > 0 && estVram > vramGb ? " (may not fit!)" : "";
            return `  ollama pull ${m.id.padEnd(20)} # ${m.name} (~${estVram.toFixed(1)}GB VRAM)${vramHint}`;
          }),
          "",
          "After downloading, run onboarding again.",
        ].join("\n"),
        "Download a Model",
      );
    }
    return { config: nextConfig };
  }

  // Build model options with VRAM estimates and warnings
  const modelOptions = models.map((m) => {
    const paramSize = m.details?.parameter_size;
    const quantLevel = m.details?.quantization_level;
    let hint = formatSize(m.size);

    // Add VRAM estimate if we have model details
    if (paramSize) {
      const sizeNum = parseFloat(paramSize.replace(/[^0-9.]/g, ""));
      const quantMatch = quantLevel?.match(/Q(\d)/)?.[1];
      const quantBits = quantMatch ? parseInt(quantMatch, 10) : 4;
      const estVram = estimateVramGb(sizeNum, `Q${quantBits}`);

      if (gpu && estVram > vramGb) {
        hint = `${paramSize} - ${formatSize(m.size)} ⚠️ May exceed ${vramGb.toFixed(0)}GB VRAM`;
      } else {
        hint = `${paramSize} - ${formatSize(m.size)} (~${estVram.toFixed(1)}GB VRAM)`;
      }
    }

    return {
      value: m.name,
      label: m.name,
      hint,
    };
  });

  // Add option to download more
  const downloadMoreOption = {
    value: "__download_more__",
    label: "Download a different model...",
    hint: "See suggested models",
  };

  // Multi-model selection
  const selectionMode = await params.prompter.select<"single" | "multi">({
    message: "How many models would you like to configure?",
    options: [
      { value: "single", label: "Just one model (recommended for most users)" },
      { value: "multi", label: "Multiple models (for failover or switching)" },
    ],
  });

  let selectedModels: string[];

  if (selectionMode === "multi") {
    // Multi-select mode
    const selected = await params.prompter.multiselect<string>({
      message: "Select models to configure (space to toggle, enter to confirm):",
      options: modelOptions,
    });
    selectedModels = Array.isArray(selected) ? selected : [selected];

    if (selectedModels.length === 0) {
      await params.prompter.note(
        formatNoteWithIcon("skip", "No models selected. Please run onboarding again."),
        NOTE_TITLES.cancelled,
      );
      return { config: nextConfig };
    }
  } else {
    // Single select mode
    const selectedModel = await params.prompter.select<string>({
      message: "Select a model to use with ClosedClaw:",
      options: [...modelOptions, downloadMoreOption],
    });

    if (selectedModel === "__download_more__") {
      // Show suggested models with VRAM-aware recommendations
      const suitableModels = vramGb > 0
        ? SUGGESTED_MODELS.filter((m) => estimateVramGb(m.paramSize, m.quantization) <= vramGb * 0.9)
        : SUGGESTED_MODELS.filter((m) => m.paramSize <= 8);

      const modelList = suitableModels.length > 0 ? suitableModels : SUGGESTED_MODELS.slice(0, 3);

      await params.prompter.note(
        [
          "Suggested models for ClosedClaw:",
          "",
          ...modelList.map((m) => {
            const estVram = estimateVramGb(m.paramSize, m.quantization);
            return `  ollama pull ${m.id.padEnd(20)} # ${m.name} (~${estVram.toFixed(1)}GB VRAM)`;
          }),
          "",
          "After downloading, run onboarding again.",
        ].join("\n"),
        "Download More Models",
      );
      return { config: nextConfig };
    }

    selectedModels = [selectedModel];
  }

  // Query actual context window for each selected model
  const modelConfigs = await Promise.all(
    selectedModels.map(async (modelName) => {
      const modelInfo = await getModelInfo(baseUrl, modelName);
      const contextWindow = extractContextWindow(modelInfo);

      return {
        id: modelName,
        name: modelName,
        reasoning: modelName.toLowerCase().includes("r1") || modelName.toLowerCase().includes("reasoning"),
        input: ["text"] as ("text" | "image")[],
        cost: OLLAMA_DEFAULT_COST,
        contextWindow,
        maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
      };
    }),
  );

  // Configure Ollama provider in config
  const ollamaProviderConfig = {
    baseUrl,
    api: "openai-completions" as const,
    models: modelConfigs,
  };

  // Update config with Ollama provider
  nextConfig = {
    ...nextConfig,
    models: {
      ...nextConfig.models,
      providers: {
        ...nextConfig.models?.providers,
        ollama: ollamaProviderConfig,
      },
    },
  };

  // Set first model as default if requested
  if (params.setDefaultModel && selectedModels.length > 0) {
    nextConfig = applyPrimaryModel(nextConfig, `ollama/${selectedModels[0]}`);
  }

  const contextInfo = modelConfigs.map((m) => `${m.name}: ${m.contextWindow.toLocaleString()} tokens`).join("\n  ");
  const defaultModel = params.setDefaultModel && selectedModels.length > 0 ? `ollama/${selectedModels[0]}` : undefined;

  await params.prompter.note(
    formatModelSummary({
      provider: "Ollama",
      models: selectedModels,
      defaultModel,
      contextWindow: modelConfigs[0]?.contextWindow,
      isLocal: true,
    }) + (selectedModels.length > 1 ? `\n\n${NOTE_ICONS.info} Context windows:\n  ${contextInfo}` : ""),
    NOTE_TITLES.providerReady,
  );

  return { config: nextConfig };
}
