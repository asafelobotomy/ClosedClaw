/**
 * Tests for Risk Scoring — Trust Degradation
 *
 * Validates the updated getTrustScore, recordExecution with
 * consecutive failure tracking, and tier-based trust evolution.
 */

import { strict as assert } from "node:assert";
import {
  getTrustScore,
  recordExecution,
  resetTrust,
  calculateRisk,
  assessRisk,
} from "../extensions/gtk-gui/src/risk-scoring.js";

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

// Reset trust store before each test
function clean() {
  resetTrust();
}

console.log("\n=== Risk Scoring — Trust Degradation ===\n");

// ─── Unknown tool starts at 0.0 ────────────────────────────────────────

test("unknown tool starts at trust 0.0", () => {
  clean();
  const score = getTrustScore("never_seen_tool");
  assert.equal(score, 0.0, "unknown tools should start at 0.0");
});

// ─── Tier 1: 0-10 uses → 0.0–0.2 ──────────────────────────────────────

test("tier 1: 5 successes → trust between 0.0 and 0.2", () => {
  clean();
  for (let i = 0; i < 5; i++) recordExecution("tool_a", true);
  const score = getTrustScore("tool_a");
  assert.ok(score > 0.0, `score should be > 0 (got ${score})`);
  assert.ok(score <= 0.2, `score should be <= 0.2 (got ${score})`);
});

test("tier 1: 10 successes → trust ~0.2", () => {
  clean();
  for (let i = 0; i < 10; i++) recordExecution("tool_b", true);
  const score = getTrustScore("tool_b");
  assert.ok(score >= 0.15, `score should be >= 0.15 (got ${score})`);
  assert.ok(score <= 0.20, `score should be <= 0.20 (got ${score})`);
});

// ─── Tier 2: 11-50 uses → 0.2–0.6 ─────────────────────────────────────

test("tier 2: 30 successes → trust between 0.2 and 0.6", () => {
  clean();
  for (let i = 0; i < 30; i++) recordExecution("tool_c", true);
  const score = getTrustScore("tool_c");
  assert.ok(score >= 0.2, `score should be >= 0.2 (got ${score})`);
  assert.ok(score <= 0.6, `score should be <= 0.6 (got ${score})`);
});

test("tier 2: 50 successes → trust ~0.6", () => {
  clean();
  for (let i = 0; i < 50; i++) recordExecution("tool_d", true);
  const score = getTrustScore("tool_d");
  assert.ok(score >= 0.5, `score should be >= 0.5 (got ${score})`);
  assert.ok(score <= 0.6, `score should be <= 0.6 (got ${score})`);
});

// ─── Tier 3: 51-100 uses → 0.6–0.8 ────────────────────────────────────

test("tier 3: 75 successes → trust between 0.6 and 0.8", () => {
  clean();
  for (let i = 0; i < 75; i++) recordExecution("tool_e", true);
  const score = getTrustScore("tool_e");
  assert.ok(score >= 0.6, `score should be >= 0.6 (got ${score})`);
  assert.ok(score <= 0.8, `score should be <= 0.8 (got ${score})`);
});

test("tier 3: 100 successes → trust ~0.8", () => {
  clean();
  for (let i = 0; i < 100; i++) recordExecution("tool_f", true);
  const score = getTrustScore("tool_f");
  assert.ok(score >= 0.75, `score should be >= 0.75 (got ${score})`);
  assert.ok(score <= 0.80, `score should be <= 0.80 (got ${score})`);
});

// ─── Tier 4: 100+ uses → 0.8–1.0 ──────────────────────────────────────

test("tier 4: 150 successes → trust between 0.8 and 1.0", () => {
  clean();
  for (let i = 0; i < 150; i++) recordExecution("tool_g", true);
  const score = getTrustScore("tool_g");
  assert.ok(score >= 0.8, `score should be >= 0.8 (got ${score})`);
  assert.ok(score <= 1.0, `score should be <= 1.0 (got ${score})`);
});

test("tier 4: 200 successes → trust ~1.0", () => {
  clean();
  for (let i = 0; i < 200; i++) recordExecution("tool_h", true);
  const score = getTrustScore("tool_h");
  assert.ok(score >= 0.95, `score should be >= 0.95 (got ${score})`);
  assert.ok(score <= 1.0, `score should be <= 1.0 (got ${score})`);
});

// ─── Consecutive failure degradation ────────────────────────────────────

test("3 consecutive failures → trust resets to 0.0", () => {
  clean();
  // Build up some trust first
  for (let i = 0; i < 20; i++) recordExecution("tool_fail", true);
  const before = getTrustScore("tool_fail");
  assert.ok(before > 0.0, `should have built trust (got ${before})`);

  // 3 consecutive failures
  recordExecution("tool_fail", false);
  recordExecution("tool_fail", false);
  recordExecution("tool_fail", false);

  const after = getTrustScore("tool_fail");
  assert.equal(after, 0.0, "3 consecutive failures should reset trust to 0.0");
});

test("2 consecutive failures do NOT reset trust", () => {
  clean();
  for (let i = 0; i < 20; i++) recordExecution("tool_2fail", true);
  
  recordExecution("tool_2fail", false);
  recordExecution("tool_2fail", false);

  const score = getTrustScore("tool_2fail");
  assert.ok(score > 0.0, `2 failures should NOT reset trust (got ${score})`);
});

test("success resets consecutive failure counter", () => {
  clean();
  for (let i = 0; i < 20; i++) recordExecution("tool_reset", true);
  
  // 2 failures, then success, then 2 more failures
  recordExecution("tool_reset", false);
  recordExecution("tool_reset", false);
  recordExecution("tool_reset", true);  // Reset counter
  recordExecution("tool_reset", false);
  recordExecution("tool_reset", false);

  const score = getTrustScore("tool_reset");
  assert.ok(score > 0.0, `non-consecutive failures should NOT reset trust (got ${score})`);
});

// ─── Failures reduce trust via success ratio ────────────────────────────

test("failures reduce trust via success ratio weighting", () => {
  clean();
  // 8 successes + 2 failures = 80% success ratio
  for (let i = 0; i < 8; i++) recordExecution("tool_ratio", true);
  for (let i = 0; i < 2; i++) recordExecution("tool_ratio", false);

  const withFailures = getTrustScore("tool_ratio");

  // Compare to 10 pure successes
  clean();
  for (let i = 0; i < 10; i++) recordExecution("tool_pure", true);
  const pureSuccess = getTrustScore("tool_pure");

  assert.ok(
    withFailures < pureSuccess,
    `failures should reduce trust: ${withFailures} < ${pureSuccess}`,
  );
});

// ─── Risk calculation with 0.0 start trust ──────────────────────────────

test("unknown tool has higher risk than trusted tool", () => {
  clean();
  // Unknown tool
  const unknownRisk = calculateRisk("totally_new");
  
  // Trusted tool (many successes)
  for (let i = 0; i < 100; i++) recordExecution("read_file", true);
  const trustedRisk = calculateRisk("read_file");

  assert.ok(
    unknownRisk.vr > trustedRisk.vr,
    `unknown risk (${unknownRisk.vr}) should be > trusted risk (${trustedRisk.vr})`,
  );
});

test("assessRisk — same tool with trust has lower risk than without", () => {
  clean();
  // Get risk for read_file with no trust (fresh)
  const freshRisk = calculateRisk("read_file");

  // Build trust for read_file
  for (let i = 0; i < 50; i++) recordExecution("read_file", true);
  const trustedRisk = calculateRisk("read_file");

  assert.ok(
    freshRisk.vr > trustedRisk.vr,
    `fresh risk (${freshRisk.vr}) should be > trusted risk (${trustedRisk.vr})`,
  );
});

// ─── resetTrust ─────────────────────────────────────────────────────────

test("resetTrust(toolName) clears specific tool", () => {
  clean();
  for (let i = 0; i < 10; i++) recordExecution("reset_me", true);
  assert.ok(getTrustScore("reset_me") > 0);
  resetTrust("reset_me");
  assert.equal(getTrustScore("reset_me"), 0.0);
});

test("resetTrust() clears all tools", () => {
  clean();
  for (let i = 0; i < 10; i++) recordExecution("a", true);
  for (let i = 0; i < 10; i++) recordExecution("b", true);
  resetTrust();
  assert.equal(getTrustScore("a"), 0.0);
  assert.equal(getTrustScore("b"), 0.0);
});

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed (${passed + failed} total)\n`);
process.exit(failed > 0 ? 1 : 0);
