import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("Ollama provider", () => {
  it("should not include ollama when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "ClosedClaw-test-"));
    const previousDisable = process.env.CLOSEDCLAW_DISABLE_TEST_OLLAMA;
    process.env.CLOSEDCLAW_DISABLE_TEST_OLLAMA = "1";
    const providers = await resolveImplicitProviders({ agentDir });

    if (previousDisable === undefined) {
      delete process.env.CLOSEDCLAW_DISABLE_TEST_OLLAMA;
    } else {
      process.env.CLOSEDCLAW_DISABLE_TEST_OLLAMA = previousDisable;
    }

    // Ollama requires explicit configuration via OLLAMA_API_KEY env var or profile
    expect(providers?.ollama).toBeUndefined();
  });
});
