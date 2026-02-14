import { describe, expect, it } from "vitest";
import { assertSafeEnv } from "./env-safety.js";

describe("assertSafeEnv", () => {
  it("rejects blocked keys", () => {
    expect(() => assertSafeEnv({ LD_PRELOAD: "hack.so" })).toThrow();
    expect(() => assertSafeEnv({ node_options: "--inspect" })).toThrow();
  });

  it("rejects blocked prefixes", () => {
    expect(() => assertSafeEnv({ DYLD_INSERT_LIBRARIES: "shim" })).toThrow();
    expect(() => assertSafeEnv({ ld_debug: "1" })).toThrow();
  });

  it("can forbid PATH overrides", () => {
    expect(() => assertSafeEnv({ PATH: "/tmp" }, { forbidPathOverride: true })).toThrow();
  });

  it("allows PATH overrides when not forbidden", () => {
    expect(() => assertSafeEnv({ PATH: "/tmp" })).not.toThrow();
  });

  it("passes benign env", () => {
    expect(() => assertSafeEnv({ HOME: "/home/user", LANG: "en_US" })).not.toThrow();
  });
});