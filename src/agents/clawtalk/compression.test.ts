import { describe, expect, it } from "vitest";
import { COMPRESSION_VERSION, compressWire, decompressWire } from "./compression.js";

describe("compression", () => {
  it("compresses known parameter keys and restores them", () => {
    const original =
      'CT/1 REQ web_search filter=critical limit=5 since=30d target="https://example.com" lang=en';
    const { wire, version } = compressWire(original);

    // Should shorten several parameter names
    expect(wire).toContain(" f=critical");
    expect(wire).toContain(" l=5");
    expect(wire).toContain(" s=30d");
    expect(wire).toContain(' t="https://example.com"');
    expect(wire).toContain(" g=en");
    expect(version).toBe(COMPRESSION_VERSION);

    const roundTrip = decompressWire(wire, version);
    expect(roundTrip).toBe(original);
  });

  it("leaves payload sections untouched", () => {
    const original = `CT/1 RES ok filter=critical\n---\n{"filter":"keep","data":[1,2,3]}`;
    const { wire, version } = compressWire(original);

    // Header compressed, payload preserved
    expect(wire.startsWith("CT/1 RES ok f=critical")).toBe(true);
    expect(wire).toContain('\n---\n{"filter":"keep"');

    const roundTrip = decompressWire(wire, version);
    expect(roundTrip).toBe(original);
  });

  it("is a no-op when version is unknown", () => {
    const original = "CT/1 REQ test p=1";
    const decompressed = decompressWire(original, 999);
    expect(decompressed).toBe(original);
  });
});
