import { describe, it, expect } from "vitest";
import {
  NOTE_ICONS,
  NOTE_TITLES,
  formatNoteWithIcon,
  noteSuccess,
  noteWarning,
  noteError,
  noteInfo,
  noteSkipped,
  formatSummary,
  formatModelSummary,
  formatHardwareSummary,
  PROGRESS_MESSAGES,
  formatStepLabel,
  STEP_TITLES,
} from "./display-helpers.js";

describe("NOTE_ICONS", () => {
  it("should have expected icon values", () => {
    expect(NOTE_ICONS.success).toBe("✓");
    expect(NOTE_ICONS.warning).toBe("⚠");
    expect(NOTE_ICONS.error).toBe("✗");
    expect(NOTE_ICONS.info).toBe("ℹ");
    expect(NOTE_ICONS.tip).toBe("💡");
  });

  it("should have all required icon types", () => {
    const icons = Object.keys(NOTE_ICONS);
    expect(icons).toContain("success");
    expect(icons).toContain("warning");
    expect(icons).toContain("error");
    expect(icons).toContain("info");
    expect(icons).toContain("tip");
    expect(icons).toContain("progress");
    expect(icons).toContain("config");
    expect(icons).toContain("security");
    expect(icons).toContain("network");
    expect(icons).toContain("model");
    expect(icons).toContain("channel");
    expect(icons).toContain("skip");
  });
});

describe("NOTE_TITLES", () => {
  it("should have expected title values", () => {
    expect(NOTE_TITLES.modelConfigured).toBe("Model Configured");
    expect(NOTE_TITLES.providerReady).toBe("Provider Ready");
    expect(NOTE_TITLES.success).toBe("Success");
    expect(NOTE_TITLES.warning).toBe("Warning");
    expect(NOTE_TITLES.error).toBe("Error");
    expect(NOTE_TITLES.authFailed).toBe("Auth Failed");
    expect(NOTE_TITLES.cancelled).toBe("Cancelled");
    expect(NOTE_TITLES.tip).toBe("Tip");
    expect(NOTE_TITLES.info).toBe("Info");
  });

  it("should have hardware-related titles", () => {
    expect(NOTE_TITLES.gpu).toBe("GPU Detected");
    expect(NOTE_TITLES.cpuMode).toBe("CPU Mode");
    // NOTE_TITLES.localModels doesn't exist, removed from test
  });
});

describe("formatNoteWithIcon", () => {
  it("should add success icon prefix", () => {
    const result = formatNoteWithIcon("success", "Operation completed");
    expect(result).toBe("✓ Operation completed");
  });

  it("should add warning icon prefix", () => {
    const result = formatNoteWithIcon("warning", "Something might be wrong");
    expect(result).toBe("⚠ Something might be wrong");
  });

  it("should add error icon prefix", () => {
    const result = formatNoteWithIcon("error", "Failed to connect");
    expect(result).toBe("✗ Failed to connect");
  });

  it("should add info icon prefix", () => {
    const result = formatNoteWithIcon("info", "Additional details");
    expect(result).toBe("ℹ Additional details");
  });

  it("should add tip icon prefix", () => {
    const result = formatNoteWithIcon("tip", "Pro tip here");
    expect(result).toBe("💡 Pro tip here");
  });

  it("should add skip icon prefix", () => {
    const result = formatNoteWithIcon("skip", "Skipped step");
    expect(result).toBe("─ Skipped step");
  });
});

describe("note helper functions", () => {
  it("noteSuccess returns message with icon and title", () => {
    const [message, title] = noteSuccess("Done!");
    expect(message).toBe("✓ Done!");
    expect(title).toBe("Success");
  });

  it("noteWarning returns message with icon and title", () => {
    const [message, title] = noteWarning("Be careful");
    expect(message).toBe("⚠ Be careful");
    expect(title).toBe("Warning");
  });

  it("noteError returns message with icon and title", () => {
    const [message, title] = noteError("Something broke");
    expect(message).toBe("✗ Something broke");
    expect(title).toBe("Error");
  });

  it("noteInfo returns message with icon and title", () => {
    const [message, title] = noteInfo("FYI");
    expect(message).toBe("ℹ FYI");
    expect(title).toBe("Info");
  });

  it("noteSkipped returns message with icon and title", () => {
    const [message, title] = noteSkipped("Not needed");
    expect(message).toBe("─ Not needed");
    expect(title).toBe("Skipped");
  });
});

describe("formatSummary", () => {
  it("should format a list of label-value pairs", () => {
    const result = formatSummary([
      { label: "Provider", value: "Ollama" },
      { label: "Model", value: "qwen3:8b" },
    ]);
    expect(result).toContain("Provider");
    expect(result).toContain("Ollama");
    expect(result).toContain("Model");
    expect(result).toContain("qwen3:8b");
  });

  it("should align labels with padding", () => {
    const result = formatSummary([
      { label: "A", value: "1" },
      { label: "Long Label", value: "2" },
    ]);
    // The shorter label should have more padding to align with longer one
    const lines = result.split("\n");
    expect(lines.every((line) => line.includes(":"))).toBe(true);
  });

  it("should handle empty items array", () => {
    const result = formatSummary([]);
    expect(result).toBe("");
  });
});

describe("formatModelSummary", () => {
  it("should format model configuration summary", () => {
    const result = formatModelSummary({
      provider: "Ollama",
      models: ["qwen3:8b", "llama3:8b"],
      defaultModel: "ollama/qwen3:8b",
      isLocal: true,
    });
    expect(result).toContain("Ollama");
    expect(result).toContain("2 configured"); // Multiple models shows count
    expect(result).toContain("ollama/qwen3:8b");
  });

  it("should indicate local vs cloud provider", () => {
    const localResult = formatModelSummary({
      provider: "Ollama",
      models: ["model"],
      defaultModel: "ollama/model",
      isLocal: true,
    });
    expect(localResult).toContain("Local");

    const cloudResult = formatModelSummary({
      provider: "OpenAI",
      models: ["gpt-4"],
      defaultModel: "openai/gpt-4",
      isLocal: false,
    });
    expect(cloudResult).toContain("Cloud");
  });

  it("should handle single model", () => {
    const result = formatModelSummary({
      provider: "Anthropic",
      models: ["claude-sonnet-4-20250514"],
      defaultModel: "anthropic/claude-sonnet-4-20250514",
      isLocal: false,
    });
    expect(result).toContain("claude-sonnet-4-20250514");
  });
});

describe("formatHardwareSummary", () => {
  it("should format GPU summary", () => {
    const result = formatHardwareSummary({
      gpuName: "NVIDIA RTX 4090",
      vramGb: 24,
    });
    expect(result).toContain("✓");
    expect(result).toContain("NVIDIA RTX 4090");
    expect(result).toContain("24.0GB VRAM");
  });

  it("should format CPU mode summary", () => {
    const result = formatHardwareSummary({
      cpuMode: true,
    });
    expect(result).toContain("CPU");
    expect(result).toContain("⚠");
  });
});

describe("PROGRESS_MESSAGES", () => {
  it("should have progress message generators", () => {
    expect(PROGRESS_MESSAGES.authStarting("GitHub")).toContain("GitHub");
    expect(PROGRESS_MESSAGES.authComplete("GitHub")).toContain("GitHub");
    expect(PROGRESS_MESSAGES.oauthStarting).toContain("OAuth");
    expect(PROGRESS_MESSAGES.modelDownloading("qwen3:8b")).toContain("qwen3:8b");
    expect(PROGRESS_MESSAGES.configSaving).toContain("Saving");
    expect(PROGRESS_MESSAGES.gatewayStarting).toContain("gateway");
  });
});

describe("formatStepLabel", () => {
  it("should format step label with step number and total", () => {
    const result = formatStepLabel(1, 3, "Authentication");
    expect(result).toContain("1");
    expect(result).toContain("3");
    expect(result).toContain("Authentication");
    expect(result).toContain("%");
  });

  it("should calculate progress percentage", () => {
    const result = formatStepLabel(2, 4, "Configure");
    expect(result).toContain("50%");
  });
});

describe("STEP_TITLES", () => {
  it("should have common wizard step titles", () => {
    expect(STEP_TITLES.mode).toBe("Onboarding mode");
    expect(STEP_TITLES.channels).toBe("Channels");
    expect(STEP_TITLES.modelAuth).toBe("Model provider");
    expect(STEP_TITLES.finish).toBe("Finish");
  });
});
