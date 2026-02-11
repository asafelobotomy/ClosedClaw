/**
 * Test shim — the `src/slack/` directory was archived.
 * This provides just enough surface for tests that import from it.
 */

export type SlackScopesResult = {
  scopes: string[];
  botScopes: string[];
};

export async function fetchSlackScopes(_client: unknown): Promise<SlackScopesResult> {
  return { scopes: [], botScopes: [] };
}
