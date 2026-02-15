import { describe, expect, it } from "vitest";
import {
  estimateVramGb,
  parseParamSize,
  parseQuantization,
  OLLAMA_DEFAULT_CONTEXT_WINDOW,
  OLLAMA_DEFAULT_MAX_TOKENS,
  SUGGESTED_MODELS,
} from "./ollama.js";

describe("Ollama constants", () => {
  describe("estimateVramGb", () => {
    it("estimates ~5GB for 8B Q4 model", () => {
      const vram = estimateVramGb(8, "q4_k_m");
      // 8B * 0.55 + 1 = 5.4GB
      expect(vram).toBeGreaterThan(4);
      expect(vram).toBeLessThan(7);
    });

    it("estimates ~17GB for 8B FP16 model", () => {
      const vram = estimateVramGb(8, "fp16");
      // 8B * 2.0 + 1 = 17GB
      expect(vram).toBeGreaterThan(15);
      expect(vram).toBeLessThan(20);
    });

    it("uses Q4 default for unknown quantization", () => {
      const vram = estimateVramGb(8, "unknown");
      // Should use Q4_K_M: 8B * 0.55 + 1 = 5.4GB
      expect(vram).toBeGreaterThan(4);
      expect(vram).toBeLessThan(7);
    });

    it("estimates ~20GB for 32B Q4 model", () => {
      const vram = estimateVramGb(32, "q4_k_m");
      // 32B * 0.55 + 1 = 18.6GB
      expect(vram).toBeGreaterThan(17);
      expect(vram).toBeLessThan(22);
    });
  });

  describe("parseParamSize", () => {
    it("extracts 8 from '8B'", () => {
      expect(parseParamSize("8B")).toBe(8);
      expect(parseParamSize("8b")).toBe(8);
    });

    it("extracts 70 from 'llama3:70b'", () => {
      expect(parseParamSize("llama3:70b")).toBe(70);
    });

    it("extracts 7.5 from '7.5B'", () => {
      expect(parseParamSize("7.5B")).toBe(7.5);
    });

    it("returns 0 for unknown format", () => {
      expect(parseParamSize("unknown")).toBe(0);
      expect(parseParamSize("model:latest")).toBe(0);
    });
  });

  describe("parseQuantization", () => {
    it("extracts q4_k_m from model name", () => {
      expect(parseQuantization("llama3:8b-q4_k_m")).toBe("q4_k_m");
    });

    it("extracts fp16 from model name", () => {
      expect(parseQuantization("model:fp16")).toBe("fp16");
    });

    it("returns q4_k_m as default", () => {
      expect(parseQuantization("llama3:8b")).toBe("q4_k_m");
      expect(parseQuantization("unknown")).toBe("q4_k_m");
    });
  });

  describe("defaults", () => {
    it("exports sensible default values", () => {
      expect(OLLAMA_DEFAULT_CONTEXT_WINDOW).toBe(128000);
      expect(OLLAMA_DEFAULT_MAX_TOKENS).toBe(8192);
    });

    it("SUGGESTED_MODELS has required fields", () => {
      expect(SUGGESTED_MODELS.length).toBeGreaterThan(0);
      for (const model of SUGGESTED_MODELS) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.paramSize).toBeGreaterThan(0);
        expect(model.quantization).toBeDefined();
      }
    });

    it("has at least one recommended model", () => {
      const recommended = SUGGESTED_MODELS.filter((m) => m.recommended);
      expect(recommended.length).toBeGreaterThan(0);
    });
  });
});
