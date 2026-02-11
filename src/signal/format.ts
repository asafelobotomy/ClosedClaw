/**
 * Test shim — the `src/signal/` directory was archived.
 * This provides just enough surface for tests that import from it.
 */

export type SignalTextStyleRange = {
  start: number;
  length: number;
  style: string;
};

export type SignalFormattedText = {
  text: string;
  styles: SignalTextStyleRange[];
};

/**
 * Stub: returns the full text as a single chunk with no styles.
 * Tests that depend on real chunking logic should use the archived implementation.
 */
export function markdownToSignalTextChunks(
  markdown: string,
  _limit: number,
  _options?: { tableMode?: string },
): SignalFormattedText[] {
  return [{ text: markdown ?? "", styles: [] }];
}

export function markdownToSignalText(
  markdown: string,
  _options?: { tableMode?: string },
): SignalFormattedText {
  return { text: markdown ?? "", styles: [] };
}
