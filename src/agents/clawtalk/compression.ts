/**
 * ClawTalk wire-format compression helpers.
 *
 * These utilities shrink common CT/1 parameter names to shorter aliases.
 * Compression is dictionary-based and versioned for forward compatibility.
 */

export const COMPRESSION_VERSION = 1;

// Dictionary v1: full parameter name -> short alias
const COMPRESSION_DICTIONARY_V1: Record<string, string> = {
  filter: "f",
  limit: "l",
  since: "s",
  depth: "d",
  target: "t",
  url: "u",
  lang: "g",
  cmd: "c",
};

const REVERSE_V1: Record<string, string> = invert(COMPRESSION_DICTIONARY_V1);

function invert(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [full, short] of Object.entries(map)) {
    out[short] = full;
  }
  return out;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceKeys(header: string, mapping: Record<string, string>): string {
  let result = header;
  for (const [full, short] of Object.entries(mapping)) {
    // Match parameter keys (start or whitespace) followed by optional = or whitespace/line-end
    const regex = new RegExp(`(^|\\s)${escapeRegex(full)}(?=(=|\\s|$))`, "g");
    result = result.replace(regex, (match, prefix: string) => `${prefix}${short}`);
  }
  return result;
}

function replaceKeysReverse(header: string, mapping: Record<string, string>): string {
  let result = header;
  for (const [short, full] of Object.entries(mapping)) {
    const regex = new RegExp(`(^|\\s)${escapeRegex(short)}(?=(=|\\s|$))`, "g");
    result = result.replace(regex, (match, prefix: string) => `${prefix}${full}`);
  }
  return result;
}

/**
 * Compress a CT/1 wire string's header section.
 * Returns the compressed wire and the compression version used, or null if unchanged.
 */
export function compressWire(
  wire: string,
  version: number = COMPRESSION_VERSION,
): { wire: string; version: number | null } {
  const trimmed = wire.trim();
  if (!trimmed) {
    return { wire, version: null };
  }

  const delimiter = "\n---\n";
  const idx = trimmed.indexOf(delimiter);
  const hasPayload = idx !== -1;
  const header = hasPayload ? trimmed.slice(0, idx) : trimmed;
  const payload = hasPayload ? trimmed.slice(idx) : "";

  let compressed = header;
  switch (version) {
    case 1:
      compressed = replaceKeys(header, COMPRESSION_DICTIONARY_V1);
      break;
    default:
      return { wire, version: null };
  }

  const changed = compressed !== header;
  const combined = `${compressed}${payload}`;
  return { wire: combined, version: changed ? version : null };
}

/**
 * Decompress a CT/1 wire string using the provided compression version.
 * If version is unknown or null, the input is returned unchanged.
 */
export function decompressWire(wire: string, version?: number | null): string {
  if (!wire || version == null) {
    return wire;
  }

  const delimiter = "\n---\n";
  const idx = wire.indexOf(delimiter);
  const hasPayload = idx !== -1;
  const header = hasPayload ? wire.slice(0, idx) : wire;
  const payload = hasPayload ? wire.slice(idx) : "";

  let decompressed = header;
  switch (version) {
    case 1:
      decompressed = replaceKeysReverse(header, REVERSE_V1);
      break;
    default:
      return wire;
  }

  return `${decompressed}${payload}`;
}
