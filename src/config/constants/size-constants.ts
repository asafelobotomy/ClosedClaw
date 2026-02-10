/**
 * Size Constants
 * 
 * Centralized constants for file sizes, byte limits, and size calculations
 * used across ClosedClaw.
 * 
 * @example
 * ```typescript
 * // Before
 * const maxSize = 6 * 1024 * 1024; // 6MB
 * 
 * // After
 * import { MAX_IMAGE_BYTES } from '@/config/constants';
 * const maxSize = MAX_IMAGE_BYTES;
 * ```
 */

// ============================================================================
// Media Size Limits
// ============================================================================

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024 as const; // 6MB
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024 as const; // 16MB
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024 as const; // 16MB
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024 as const; // 100MB

// ============================================================================
// Size Units
// ============================================================================

export const BYTES_PER_KB = 1024 as const;
export const BYTES_PER_MB = 1024 * 1024 as const;
export const BYTES_PER_GB = 1024 * 1024 * 1024 as const;

// ============================================================================
// Media Type Detection
// ============================================================================

export type MediaKind = "image" | "audio" | "video" | "document" | "unknown";

/**
 * Determine media kind from MIME type
 * 
 * @example
 * ```typescript
 * mediaKindFromMime("image/png") // "image"
 * mediaKindFromMime("video/mp4") // "video"
 * mediaKindFromMime("application/pdf") // "document"
 * ```
 */
export function mediaKindFromMime(mime?: string | null): MediaKind {
  if (!mime) {
    return "unknown";
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime === "application/pdf") {
    return "document";
  }
  if (mime.startsWith("application/")) {
    return "document";
  }
  return "unknown";
}

/**
 * Get maximum byte limit for a given media kind
 * 
 * @example
 * ```typescript
 * maxBytesForKind("image") // 6291456 (6MB)
 * maxBytesForKind("video") // 16777216 (16MB)
 * ```
 */
export function maxBytesForKind(kind: MediaKind): number {
  switch (kind) {
    case "image":
      return MAX_IMAGE_BYTES;
    case "audio":
      return MAX_AUDIO_BYTES;
    case "video":
      return MAX_VIDEO_BYTES;
    case "document":
      return MAX_DOCUMENT_BYTES;
    default:
      return MAX_DOCUMENT_BYTES;
  }
}

// ============================================================================
// Size Formatting
// ============================================================================

/**
 * Format bytes to human-readable string
 * 
 * @example
 * ```typescript
 * formatBytes(1024) // "1 KB"
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(1048576) // "1 MB"
 * formatBytes(1536000) // "1.46 MB"
 * ```
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(dm)} ${sizes[i]}`;
}

/**
 * Parse human-readable size string to bytes
 * 
 * @example
 * ```typescript
 * parseBytes("1KB") // 1024
 * parseBytes("1.5MB") // 1572864
 * parseBytes("100MB") // 104857600
 * ```
 */
export function parseBytes(input: string): number {
  const match = input.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${input}`);
  }

  const value = parseFloat(match[1]!);
  const unit = (match[2] || "B").toUpperCase();

  switch (unit) {
    case "B":
      return value;
    case "KB":
      return value * BYTES_PER_KB;
    case "MB":
      return value * BYTES_PER_MB;
    case "GB":
      return value * BYTES_PER_GB;
    case "TB":
      return value * BYTES_PER_GB * 1024;
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

/**
 * Check if size is within limit
 */
export function isWithinLimit(bytes: number, limit: number): boolean {
  return bytes <= limit;
}

/**
 * Calculate percentage of limit used
 */
export function percentOfLimit(bytes: number, limit: number): number {
  return Math.min(100, (bytes / limit) * 100);
}
