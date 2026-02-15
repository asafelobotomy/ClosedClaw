import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { ApplyAuthChoiceParams } from "./auth-choice.apply.js";
import type { ClosedClawConfig } from "../config/types.full.js";
import { applyAuthChoiceOllama } from "./auth-choice.apply.ollama.js";

// Mock child_process exec for GPU detection
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    exec: vi.fn((cmd: string, opts: unknown, cb?: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
      // Simulate no GPU found for tests
      const callback = typeof opts === "function" ? opts : cb;
      if (callback) {
        callback(new Error("nvidia-smi not found"), { stdout: "", stderr: "" });
      }
    }),
  };
});

// Mock fetch for Ollama API calls
const mockFetch = vi.fn();

describe("applyAuthChoiceOllama", () => {
  const noopAsync = async () => {};

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  function createMockPrompter(overrides: Partial<WizardPrompter> = {}): WizardPrompter {
    return {
      intro: vi.fn(noopAsync),
      outro: vi.fn(noopAsync),
      note: vi.fn(noopAsync),
      select: vi.fn(async (params) => params.options[0]?.value as never),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      password: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
      spinner: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        message: vi.fn(),
      })),
      ...overrides,
    };
  }

  function createParams(overrides: Partial<ApplyAuthChoiceParams> = {}): ApplyAuthChoiceParams {
    return {
      authChoice: "ollama",
      config: {} as ClosedClawConfig,
      prompter: createMockPrompter(),
      setDefaultModel: true,
      ...overrides,
    };
  }

  it("returns null for non-ollama auth choice", async () => {
    const params = createParams({ authChoice: "anthropic-api" as never });
    const result = await applyAuthChoiceOllama(params);
    expect(result).toBeNull();
  });

  it("shows note when Ollama is not running", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const prompter = createMockPrompter();
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("Ollama is not running"),
      "Error", // Updated to use NOTE_TITLES.error
    );
    expect(result).toEqual({ config: params.config });
  });

  it("shows download help when no models available", async () => {
    // Ollama running but no models
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // checkOllamaRunning
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      }); // getOllamaModels

    const prompter = createMockPrompter({
      select: vi.fn(async () => "download" as never),
    });
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    expect(prompter.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("No Ollama models found"),
      }),
    );
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("ollama pull"),
      "Download a Model",
    );
    expect(result).toEqual({ config: params.config });
  });

  it("configures single model selection", async () => {
    const mockModels = [
      {
        name: "qwen3:8b",
        size: 5000000000,
        details: { parameter_size: "8B", quantization_level: "Q4_K_M" },
      },
      {
        name: "llama3:8b",
        size: 4500000000,
        details: { parameter_size: "8B" },
      },
    ];

    mockFetch
      .mockResolvedValueOnce({ ok: true }) // checkOllamaRunning
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      }) // getOllamaModels
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model_info: { "llama.context_length": 32768 },
        }),
      }); // getModelInfo for qwen3:8b

    const selectMock = vi
      .fn()
      .mockResolvedValueOnce("single") // selection mode
      .mockResolvedValueOnce("qwen3:8b"); // model selection

    const prompter = createMockPrompter({
      select: selectMock,
      note: vi.fn(noopAsync),
    });
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    expect(result).not.toBeNull();
    expect(result?.config.models?.providers?.ollama).toBeDefined();
    expect(result?.config.models?.providers?.ollama?.models).toHaveLength(1);
    expect(result?.config.models?.providers?.ollama?.models?.[0]?.id).toBe("qwen3:8b");
    expect(result?.config.models?.providers?.ollama?.models?.[0]?.contextWindow).toBe(32768);
  });

  it("configures multiple models in multi-select mode", async () => {
    const mockModels = [
      { name: "qwen3:8b", size: 5000000000, details: { parameter_size: "8B" } },
      { name: "llama3:8b", size: 4500000000, details: { parameter_size: "8B" } },
      { name: "mistral:7b", size: 4000000000, details: { parameter_size: "7B" } },
    ];

    mockFetch
      .mockResolvedValueOnce({ ok: true }) // checkOllamaRunning
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      }) // getOllamaModels
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model_info: { "llama.context_length": 32768 } }),
      }) // getModelInfo for qwen3:8b
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model_info: { "llama.context_length": 8192 } }),
      }); // getModelInfo for mistral:7b

    const selectMock = vi.fn().mockResolvedValueOnce("multi"); // selection mode
    const multiselectMock = vi.fn().mockResolvedValueOnce(["qwen3:8b", "mistral:7b"]);

    const prompter = createMockPrompter({
      select: selectMock,
      multiselect: multiselectMock,
      note: vi.fn(noopAsync),
    });
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    expect(result).not.toBeNull();
    expect(result?.config.models?.providers?.ollama?.models).toHaveLength(2);
    expect(result?.config.models?.providers?.ollama?.models?.[0]?.id).toBe("qwen3:8b");
    expect(result?.config.models?.providers?.ollama?.models?.[1]?.id).toBe("mistral:7b");
  });

  it("sets first model as default when setDefaultModel is true", async () => {
    const mockModels = [
      { name: "qwen3:8b", size: 5000000000, details: { parameter_size: "8B" } },
    ];

    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model_info: {} }),
      });

    const selectMock = vi
      .fn()
      .mockResolvedValueOnce("single")
      .mockResolvedValueOnce("qwen3:8b");

    const prompter = createMockPrompter({
      select: selectMock,
      note: vi.fn(noopAsync),
    });
    const params = createParams({ prompter, setDefaultModel: true });

    const result = await applyAuthChoiceOllama(params);

    const modelConfig = result?.config.agents?.defaults?.model;
    const primaryModel = typeof modelConfig === "object" && modelConfig !== null && "primary" in modelConfig
      ? (modelConfig as { primary?: string }).primary
      : undefined;
    expect(primaryModel).toBe("ollama/qwen3:8b");
  });

  it("detects reasoning models from name", async () => {
    const mockModels = [
      { name: "deepseek-r1:8b", size: 5000000000, details: { parameter_size: "8B" } },
    ];

    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model_info: {} }),
      });

    const selectMock = vi
      .fn()
      .mockResolvedValueOnce("single")
      .mockResolvedValueOnce("deepseek-r1:8b");

    const prompter = createMockPrompter({
      select: selectMock,
      note: vi.fn(noopAsync),
    });
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    expect(result?.config.models?.providers?.ollama?.models?.[0]?.reasoning).toBe(true);
  });

  it("uses default context window when API doesn't return it", async () => {
    const mockModels = [
      { name: "custom-model:latest", size: 5000000000 },
    ];

    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // No model_info
      });

    const selectMock = vi
      .fn()
      .mockResolvedValueOnce("single")
      .mockResolvedValueOnce("custom-model:latest");

    const prompter = createMockPrompter({
      select: selectMock,
      note: vi.fn(noopAsync),
    });
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    // Should use default context window (128000)
    expect(result?.config.models?.providers?.ollama?.models?.[0]?.contextWindow).toBe(128000);
  });

  it("shows download more option and displays suggestions", async () => {
    const mockModels = [
      { name: "old-model:latest", size: 3000000000 },
    ];

    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      });

    const selectMock = vi
      .fn()
      .mockResolvedValueOnce("single")
      .mockResolvedValueOnce("__download_more__");

    const noteMock = vi.fn(noopAsync);
    const prompter = createMockPrompter({
      select: selectMock,
      note: noteMock,
    });
    const params = createParams({ prompter });

    const result = await applyAuthChoiceOllama(params);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining("Suggested models"),
      "Download More Models",
    );
    expect(result).toEqual({ config: params.config });
  });
});
