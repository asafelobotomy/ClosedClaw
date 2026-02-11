/**
 * Test shim — the `src/web/` directory was archived.
 * Provides minimal exports for tests that import from this path.
 */

export type WebMediaResult = {
  data: Buffer;
  mimeType: string;
  size: number;
  filename?: string;
};

export async function loadWebMedia(
  mediaUrl: string,
  _maxBytes?: number,
  _options?: { ssrfPolicy?: unknown },
): Promise<WebMediaResult> {
  return {
    data: Buffer.from("stub"),
    mimeType: "application/octet-stream",
    size: 4,
    filename: mediaUrl.split("/").pop() ?? "stub",
  };
}

export async function loadWebMediaRaw(
  mediaUrl: string,
  _maxBytes?: number,
  _options?: { ssrfPolicy?: unknown },
): Promise<WebMediaResult> {
  return loadWebMedia(mediaUrl, _maxBytes, _options);
}
