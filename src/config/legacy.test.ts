import { describe, expect, it } from "vitest";
import { applyLegacyMigrations } from "./legacy.js";

describe("legacy migrations", () => {
  it("moves messages.messagePrefix to channels.whatsapp.messagePrefix", () => {
    const raw = {
      messages: {
        messagePrefix: "[Legacy]",
        responsePrefix: "auto",
      },
    };

    const { next, changes } = applyLegacyMigrations(raw);

    expect(next).toBeTruthy();
    expect(next?.channels).toMatchObject({
      whatsapp: { messagePrefix: "[Legacy]" },
    });
    expect(next?.messages).toMatchObject({ responsePrefix: "auto" });
    expect((next?.messages as Record<string, unknown> | undefined)?.messagePrefix).toBeUndefined();
    expect(changes).toContain("Moved messages.messagePrefix → channels.whatsapp.messagePrefix.");
  });

  it("does not overwrite channels.whatsapp.messagePrefix", () => {
    const raw = {
      messages: {
        messagePrefix: "[Legacy]",
      },
      channels: {
        whatsapp: {
          messagePrefix: "[Current]",
        },
      },
    };

    const { next, changes } = applyLegacyMigrations(raw);

    expect(next).toBeTruthy();
    expect(next?.channels).toMatchObject({
      whatsapp: { messagePrefix: "[Current]" },
    });
    expect((next?.messages as Record<string, unknown> | undefined)?.messagePrefix).toBeUndefined();
    expect(changes).toContain(
      "Removed messages.messagePrefix (channels.whatsapp.messagePrefix already set).",
    );
  });

  it("moves tools.media.*.deepgram to providerOptions.deepgram", () => {
    const raw = {
      tools: {
        media: {
          audio: {
            deepgram: { detectLanguage: true },
            models: [{ provider: "deepgram", deepgram: { smartFormat: true } }],
          },
        },
      },
    };

    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeTruthy();

    const audio = ((next?.tools as Record<string, unknown>)?.media as Record<string, unknown>)
      ?.audio as Record<string, unknown>;
    expect(audio.deepgram).toBeUndefined();
    expect(audio.providerOptions).toMatchObject({
      deepgram: { detectLanguage: true },
    });

    const firstModel = (audio.models as Array<Record<string, unknown>>)[0];
    expect(firstModel.deepgram).toBeUndefined();
    expect(firstModel.providerOptions).toMatchObject({
      deepgram: { smartFormat: true },
    });

    expect(changes).toContain("Moved tools.media.audio.deepgram → tools.media.audio.providerOptions.deepgram.");
    expect(changes).toContain(
      "Moved tools.media.audio.models[0].deepgram → tools.media.audio.models[0].providerOptions.deepgram.",
    );
  });

  it("merges tools.media.*.deepgram into existing providerOptions.deepgram", () => {
    const raw = {
      tools: {
        media: {
          audio: {
            deepgram: { detectLanguage: true },
            providerOptions: { deepgram: { smartFormat: false } },
          },
        },
      },
    };

    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeTruthy();

    const audio = ((next?.tools as Record<string, unknown>)?.media as Record<string, unknown>)
      ?.audio as Record<string, unknown>;
    expect(audio.deepgram).toBeUndefined();
    expect(audio.providerOptions).toMatchObject({
      deepgram: {
        smartFormat: false,
        detectLanguage: true,
      },
    });

    expect(changes).toContain("Merged tools.media.audio.deepgram → tools.media.audio.providerOptions.deepgram.");
  });

  it("moves tools.message.allowCrossContextSend to crossContext.allowAcrossProviders", () => {
    const raw = {
      tools: {
        message: {
          allowCrossContextSend: true,
        },
      },
    };

    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeTruthy();

    const message = ((next?.tools as Record<string, unknown>)?.message ?? {}) as Record<
      string,
      unknown
    >;
    expect(message.allowCrossContextSend).toBeUndefined();
    expect(message.crossContext).toMatchObject({ allowAcrossProviders: true });
    expect(changes).toContain(
      "Moved tools.message.allowCrossContextSend → tools.message.crossContext.allowAcrossProviders.",
    );
  });

  it("does not overwrite crossContext.allowAcrossProviders", () => {
    const raw = {
      tools: {
        message: {
          allowCrossContextSend: true,
          crossContext: {
            allowAcrossProviders: false,
          },
        },
      },
    };

    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeTruthy();

    const message = ((next?.tools as Record<string, unknown>)?.message ?? {}) as Record<
      string,
      unknown
    >;
    expect(message.allowCrossContextSend).toBeUndefined();
    expect(message.crossContext).toMatchObject({ allowAcrossProviders: false });
    expect(changes).toContain(
      "Removed tools.message.allowCrossContextSend (tools.message.crossContext.allowAcrossProviders already set).",
    );
  });
});
