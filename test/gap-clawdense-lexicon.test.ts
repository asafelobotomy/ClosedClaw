/**
 * Tests for ClawDense — Lexicon Integration
 *
 * Validates loadLexicon, clearLexicon, getActiveLexicon,
 * applyLexiconCompression, and applyLexiconExpansion.
 */

import { strict as assert } from "node:assert";
import {
  loadLexicon,
  clearLexicon,
  getActiveLexicon,
  applyLexiconCompression,
  applyLexiconExpansion,
} from "../src/agents/clawtalk/clawdense.js";
import type { ClawsLexicon } from "../src/agents/clawtalk/claws-parser.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

// Reset state before each test group
function resetLexicon() {
  clearLexicon();
}

const TEST_LEXICON: ClawsLexicon = {
  mode: "hybrid_stenography",
  pruningLevel: "aggressive",
  mappings: {
    cfg: "configuration",
    auth: "authentication",
    ctx: "context",
    gw: "gateway",
  },
  pathCompressions: {
    "~/.cc": "~/.closedclaw",
    "src/ag": "src/agents",
    "ext/": "extensions/",
  },
  raw: "{}",
};

console.log("\n=== ClawDense — Lexicon Integration ===\n");

// ─── loadLexicon / getActiveLexicon / clearLexicon ──────────────────────

test("getActiveLexicon returns null when no lexicon loaded", () => {
  resetLexicon();
  assert.equal(getActiveLexicon(), null);
});

test("loadLexicon sets active lexicon", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const active = getActiveLexicon();
  assert.ok(active, "should have an active lexicon");
  assert.equal(active!.mode, "hybrid_stenography");
  assert.equal(active!.mappings.cfg, "configuration");
});

test("clearLexicon removes active lexicon", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  assert.ok(getActiveLexicon(), "should be loaded");
  clearLexicon();
  assert.equal(getActiveLexicon(), null, "should be cleared");
});

// ─── applyLexiconCompression ────────────────────────────────────────────

test("compression replaces full terms with shorthand", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const input = "check the configuration and authentication for the gateway context";
  const compressed = applyLexiconCompression(input);
  assert.ok(compressed.includes("cfg"), "should contain 'cfg'");
  assert.ok(compressed.includes("auth"), "should contain 'auth'");
  assert.ok(compressed.includes("gw"), "should contain 'gw'");
  assert.ok(compressed.includes("ctx"), "should contain 'ctx'");
  assert.ok(!compressed.includes("configuration"), "should NOT contain full word 'configuration'");
  assert.ok(!compressed.includes("authentication"), "should NOT contain full word 'authentication'");
});

test("compression replaces paths first", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const input = "@fs:r(\"~/.closedclaw/config.json\")";
  const compressed = applyLexiconCompression(input);
  assert.ok(compressed.includes("~/.cc"), "should compress path to ~/.cc");
  assert.ok(!compressed.includes("~/.closedclaw"), "full path should be replaced");
});

test("compression does nothing without lexicon", () => {
  resetLexicon();
  const input = "check the configuration and authentication";
  const result = applyLexiconCompression(input);
  assert.equal(result, input, "should return input unchanged");
});

test("compression preserves text without matching terms", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const input = "just some random text here";
  const compressed = applyLexiconCompression(input);
  assert.equal(compressed, input, "unchanged text should remain the same");
});

// ─── applyLexiconExpansion ──────────────────────────────────────────────

test("expansion replaces shorthand back to full terms", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const input = "check the cfg and auth for the gw ctx";
  const expanded = applyLexiconExpansion(input);
  assert.ok(expanded.includes("configuration"), "should contain 'configuration'");
  assert.ok(expanded.includes("authentication"), "should contain 'authentication'");
  assert.ok(expanded.includes("gateway"), "should contain 'gateway'");
  assert.ok(expanded.includes("context"), "should contain 'context'");
});

test("expansion replaces compressed paths", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const input = "@fs:r(\"~/.cc/config.json\")";
  const expanded = applyLexiconExpansion(input);
  assert.ok(expanded.includes("~/.closedclaw"), "should expand path to ~/.closedclaw");
  assert.ok(!expanded.includes("~/.cc"), "short path should be replaced");
});

test("expansion does nothing without lexicon", () => {
  resetLexicon();
  const input = "cfg and auth values";
  const result = applyLexiconExpansion(input);
  assert.equal(result, input, "should return input unchanged");
});

// ─── Round-trip: compress then expand ───────────────────────────────────

test("round-trip: compress then expand returns original (word terms)", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const original = "the configuration needs authentication for gateway context";
  const compressed = applyLexiconCompression(original);
  const expanded = applyLexiconExpansion(compressed);
  assert.equal(expanded, original, "round-trip should restore original text");
});

test("round-trip: compress then expand returns original (paths)", () => {
  resetLexicon();
  loadLexicon(TEST_LEXICON);
  const original = "read ~/.closedclaw/config and src/agents/tools";
  const compressed = applyLexiconCompression(original);
  const expanded = applyLexiconExpansion(compressed);
  assert.equal(expanded, original, "round-trip should restore original paths");
});

// ─── Lexicon without pathCompressions ───────────────────────────────────

test("loadLexicon with no pathCompressions field works", () => {
  resetLexicon();
  const minLexicon: ClawsLexicon = {
    mode: "basic",
    mappings: { tk: "token" },
    raw: "{}",
  };
  loadLexicon(minLexicon);
  assert.ok(getActiveLexicon());
  const compressed = applyLexiconCompression("a token was used");
  assert.ok(compressed.includes("tk"), "should compress 'token' to 'tk'");
});

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed (${passed + failed} total)\n`);
process.exit(failed > 0 ? 1 : 0);
