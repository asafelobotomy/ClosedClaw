import { describe, it, expect } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOCUMENT_BYTES,
  BYTES_PER_KB,
  BYTES_PER_MB,
  BYTES_PER_GB,
  mediaKindFromMime,
  maxBytesForKind,
  formatBytes,
  parseBytes,
  isWithinLimit,
  percentOfLimit,
} from "./size-constants.js";

describe("size-constants", () => {
  describe("constant definitions", () => {
    it("should define media size limits", () => {
      expect(MAX_IMAGE_BYTES).toBe(6 * 1024 * 1024);
      expect(MAX_AUDIO_BYTES).toBe(16 * 1024 * 1024);
      expect(MAX_VIDEO_BYTES).toBe(16 * 1024 * 1024);
      expect(MAX_DOCUMENT_BYTES).toBe(100 * 1024 * 1024);
    });

    it("should define size units", () => {
      expect(BYTES_PER_KB).toBe(1024);
      expect(BYTES_PER_MB).toBe(1024 * 1024);
      expect(BYTES_PER_GB).toBe(1024 * 1024 * 1024);
    });
  });

  describe("mediaKindFromMime()", () => {
    it("should detect image MIME types", () => {
      expect(mediaKindFromMime("image/png")).toBe("image");
      expect(mediaKindFromMime("image/jpeg")).toBe("image");
      expect(mediaKindFromMime("image/gif")).toBe("image");
    });

    it("should detect audio MIME types", () => {
      expect(mediaKindFromMime("audio/mpeg")).toBe("audio");
      expect(mediaKindFromMime("audio/wav")).toBe("audio");
      expect(mediaKindFromMime("audio/ogg")).toBe("audio");
    });

    it("should detect video MIME types", () => {
      expect(mediaKindFromMime("video/mp4")).toBe("video");
      expect(mediaKindFromMime("video/webm")).toBe("video");
      expect(mediaKindFromMime("video/avi")).toBe("video");
    });

    it("should detect document MIME types", () => {
      expect(mediaKindFromMime("application/pdf")).toBe("document");
      expect(mediaKindFromMime("application/json")).toBe("document");
      expect(mediaKindFromMime("application/zip")).toBe("document");
    });

    it("should return unknown for invalid MIME types", () => {
      expect(mediaKindFromMime(null)).toBe("unknown");
      expect(mediaKindFromMime(undefined)).toBe("unknown");
      expect(mediaKindFromMime("")).toBe("unknown");
      expect(mediaKindFromMime("unknown/type")).toBe("unknown");
    });
  });

  describe("maxBytesForKind()", () => {
    it("should return correct limits for each kind", () => {
      expect(maxBytesForKind("image")).toBe(MAX_IMAGE_BYTES);
      expect(maxBytesForKind("audio")).toBe(MAX_AUDIO_BYTES);
      expect(maxBytesForKind("video")).toBe(MAX_VIDEO_BYTES);
      expect(maxBytesForKind("document")).toBe(MAX_DOCUMENT_BYTES);
      expect(maxBytesForKind("unknown")).toBe(MAX_DOCUMENT_BYTES);
    });
  });

  describe("formatBytes()", () => {
    it("should format bytes", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
      expect(formatBytes(500)).toBe("500.00 Bytes");
      expect(formatBytes(999)).toBe("999.00 Bytes");
    });

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.00 KB");
      expect(formatBytes(1536)).toBe("1.50 KB");
      expect(formatBytes(2048)).toBe("2.00 KB");
    });

    it("should format megabytes", () => {
      expect(formatBytes(1048576)).toBe("1.00 MB");
      expect(formatBytes(1572864)).toBe("1.50 MB");
      expect(formatBytes(5242880)).toBe("5.00 MB");
    });

    it("should format gigabytes", () => {
      expect(formatBytes(1073741824)).toBe("1.00 GB");
      expect(formatBytes(2147483648)).toBe("2.00 GB");
    });

    it("should respect decimals parameter", () => {
      expect(formatBytes(1536, 0)).toBe("2 KB");
      expect(formatBytes(1536, 1)).toBe("1.5 KB");
      expect(formatBytes(1536, 3)).toBe("1.500 KB");
    });
  });

  describe("parseBytes()", () => {
    it("should parse bytes", () => {
      expect(parseBytes("100B")).toBe(100);
      expect(parseBytes("100")).toBe(100);
    });

    it("should parse kilobytes", () => {
      expect(parseBytes("1KB")).toBe(1024);
      expect(parseBytes("1.5KB")).toBe(1536);
      expect(parseBytes("2 KB")).toBe(2048);
    });

    it("should parse megabytes", () => {
      expect(parseBytes("1MB")).toBe(1048576);
      expect(parseBytes("1.5MB")).toBe(1572864);
      expect(parseBytes("5 MB")).toBe(5242880);
    });

    it("should parse gigabytes", () => {
      expect(parseBytes("1GB")).toBe(1073741824);
      expect(parseBytes("2GB")).toBe(2147483648);
    });

    it("should be case insensitive", () => {
      expect(parseBytes("1kb")).toBe(1024);
      expect(parseBytes("1Kb")).toBe(1024);
      expect(parseBytes("1kB")).toBe(1024);
    });

    it("should throw on invalid format", () => {
      expect(() => parseBytes("invalid")).toThrow(/Invalid size format/);
      expect(() => parseBytes("")).toThrow(/Invalid size format/);
      expect(() => parseBytes("MB")).toThrow(/Invalid size format/);
    });
  });

  describe("isWithinLimit()", () => {
    it("should check if size is within limit", () => {
      expect(isWithinLimit(1000, 2000)).toBe(true);
      expect(isWithinLimit(2000, 2000)).toBe(true);
      expect(isWithinLimit(3000, 2000)).toBe(false);
    });

    it("should work with actual media limits", () => {
      expect(isWithinLimit(5 * 1024 * 1024, MAX_IMAGE_BYTES)).toBe(true);
      expect(isWithinLimit(10 * 1024 * 1024, MAX_IMAGE_BYTES)).toBe(false);
    });
  });

  describe("percentOfLimit()", () => {
    it("should calculate percentage of limit", () => {
      expect(percentOfLimit(50, 100)).toBe(50);
      expect(percentOfLimit(25, 100)).toBe(25);
      expect(percentOfLimit(100, 100)).toBe(100);
    });

    it("should cap at 100%", () => {
      expect(percentOfLimit(150, 100)).toBe(100);
      expect(percentOfLimit(200, 100)).toBe(100);
    });

    it("should handle fractional percentages", () => {
      expect(percentOfLimit(33, 100)).toBeCloseTo(33);
      expect(percentOfLimit(66, 100)).toBeCloseTo(66);
    });
  });

  describe("integration tests", () => {
    it("should parse and format consistently", () => {
      const input = "1.5MB";
      const bytes = parseBytes(input);
      const formatted = formatBytes(bytes);
      expect(formatted).toBe("1.50 MB");
    });

    it("should work with real media limits", () => {
      // 5MB image should be within limit
      const imageSize = parseBytes("5MB");
      expect(isWithinLimit(imageSize, MAX_IMAGE_BYTES)).toBe(true);
      expect(percentOfLimit(imageSize, MAX_IMAGE_BYTES)).toBeLessThan(100);

      // 10MB image should exceed limit
      const largeImage = parseBytes("10MB");
      expect(isWithinLimit(largeImage, MAX_IMAGE_BYTES)).toBe(false);
      expect(percentOfLimit(largeImage, MAX_IMAGE_BYTES)).toBe(100);
    });

    it("should detect media kind and apply correct limit", () => {
      const mime = "image/png";
      const kind = mediaKindFromMime(mime);
      const limit = maxBytesForKind(kind);
      
      expect(kind).toBe("image");
      expect(limit).toBe(MAX_IMAGE_BYTES);
      
      const size = parseBytes("5MB");
      expect(isWithinLimit(size, limit)).toBe(true);
    });
  });
});
