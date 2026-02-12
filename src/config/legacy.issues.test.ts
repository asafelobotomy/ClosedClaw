import { describe, expect, it } from "vitest";
import { findLegacyConfigIssues } from "./legacy.js";

describe("legacy config issues", () => {
  it("flags newly deprecated 2026.4.0 paths", () => {
    const issues = findLegacyConfigIssues({
      messages: { messagePrefix: "[Legacy]" },
      audio: { transcription: { command: ["whisper"] } },
      tools: {
        media: {
          audio: {
            deepgram: { detectLanguage: true },
            models: [{ provider: "deepgram", deepgram: { smartFormat: true } }],
          },
        },
        message: {
          allowCrossContextSend: true,
        },
      },
    });

    const paths = issues.map((entry) => entry.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "messages.messagePrefix",
        "audio.transcription",
        "tools.message.allowCrossContextSend",
      ]),
    );

    expect(paths).toContain("tools.media");
  });
});
