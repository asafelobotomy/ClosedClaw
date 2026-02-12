import { describe, expect, it } from "vitest";
import { assertWebChannel, normalizeE164 } from "./index.js";

describe("normalizeE164", () => {
  it("strips prefix and whitespace", () => {
    expect(normalizeE164("+1 555 555 0123")).toBe("+15555550123");
  });

  it("adds plus when missing", () => {
    expect(normalizeE164("1555123")).toBe("+1555123");
  });
});

describe("assertWebChannel", () => {
  it("accepts valid channels", () => {
    expect(() => assertWebChannel("web")).not.toThrow();
  });

  it("throws on invalid channel", () => {
    expect(() => assertWebChannel("invalid" as string)).toThrow();
  });
});
