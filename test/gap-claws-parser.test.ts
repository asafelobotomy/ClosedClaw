/**
 * Tests for .claws parser — Block 8 (Lexicon) & Block 9 (Neural Fingerprint)
 *
 * Validates parsing of the new Lexicon and Neural Fingerprint blocks,
 * including snake_case → camelCase conversion, missing blocks → null,
 * and full round-trip of both blocks.
 */

import { strict as assert } from "node:assert";
import {
  parseClawsFile,
  splitBlocks,
  type ClawsLexicon,
  type ClawsNeuralFingerprint,
} from "../src/agents/clawtalk/claws-parser.js";

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

console.log("\n=== .claws Parser — Block 8 (Lexicon) & Block 9 (Neural Fingerprint) ===\n");

// ─── Block Splitter recognises new markers ──────────────────────────────

test("splitBlocks recognises 'THE LEXICON' marker", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# THE LEXICON\n{"mode":"hybrid"}\n`;
  const blocks = splitBlocks(content);
  assert.ok(blocks.lexicon, "expected lexicon block");
  assert.ok(blocks.lexicon.includes('"mode"'), "lexicon should have mode");
});

test("splitBlocks recognises 'NEURAL FINGERPRINT' marker", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# NEURAL FINGERPRINT\n{"signature_version":"1.0"}\n`;
  const blocks = splitBlocks(content);
  assert.ok(blocks.fingerprint, "expected fingerprint block");
});

test("splitBlocks recognises 'BLOCK 8: THE LEXICON' variant", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# BLOCK 8: THE LEXICON\n{"mode":"full"}\n`;
  const blocks = splitBlocks(content);
  assert.ok(blocks.lexicon, "expected lexicon block with BLOCK 8 variant");
});

test("splitBlocks recognises 'BLOCK 9: NEURAL FINGERPRINT' variant", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# BLOCK 9: NEURAL FINGERPRINT\n{"signature_version":"2.0"}\n`;
  const blocks = splitBlocks(content);
  assert.ok(blocks.fingerprint, "expected fingerprint block with BLOCK 9 variant");
});

// ─── Lexicon Parsing ────────────────────────────────────────────────────

const FULL_CLAWS_WITH_LEXICON = `---
# MANIFEST
id: "test-skill"
version: "1.0.0"
---
# THE VIBE
> **Purpose:** Test skill
> **Trigger:** test
---
# THE LEXICON
{
  "mode": "hybrid_stenography",
  "pruning_level": "aggressive",
  "mappings": {
    "cfg": "configuration",
    "auth": "authentication",
    "ctx": "context"
  },
  "path_compressions": {
    "~/.cc": "~/.closedclaw",
    "src/ag": "src/agents"
  },
  "priority_markers": {
    "HALT": {
      "blocking": true,
      "priority": "critical",
      "require_biometric": true
    }
  }
}
`;

test("parseLexicon — full lexicon with all fields", () => {
  const file = parseClawsFile(FULL_CLAWS_WITH_LEXICON);
  assert.ok(file.lexicon, "lexicon should not be null");
  const lex = file.lexicon!;
  assert.equal(lex.mode, "hybrid_stenography");
  assert.equal(lex.pruningLevel, "aggressive");
  assert.equal(lex.mappings.cfg, "configuration");
  assert.equal(lex.mappings.auth, "authentication");
  assert.equal(lex.mappings.ctx, "context");
  assert.equal(lex.pathCompressions?.["~/.cc"], "~/.closedclaw");
  assert.equal(lex.pathCompressions?.["src/ag"], "src/agents");
});

test("parseLexicon — priority markers with snake_case → camelCase", () => {
  const file = parseClawsFile(FULL_CLAWS_WITH_LEXICON);
  const pm = file.lexicon?.priorityMarkers;
  assert.ok(pm, "priority markers should exist");
  assert.ok(pm!.HALT, "HALT marker should exist");
  assert.equal(pm!.HALT.blocking, true);
  assert.equal(pm!.HALT.priority, "critical");
  assert.equal(pm!.HALT.requireBiometric, true);
});

test("parseLexicon — missing lexicon block returns null", () => {
  const content = `---\n# MANIFEST\nid: test\nversion: "1.0"\n---\n# THE VIBE\nPurpose: test\n`;
  const file = parseClawsFile(content);
  assert.equal(file.lexicon, null);
});

test("parseLexicon — malformed JSON returns null", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# THE LEXICON\n{invalid json}`;
  const file = parseClawsFile(content);
  assert.equal(file.lexicon, null);
});

test("parseLexicon — minimal lexicon (only mode + mappings)", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# LEXICON\n{"mode":"basic","mappings":{"k":"value"}}`;
  const file = parseClawsFile(content);
  assert.ok(file.lexicon);
  assert.equal(file.lexicon!.mode, "basic");
  assert.equal(file.lexicon!.mappings.k, "value");
  assert.equal(file.lexicon!.pathCompressions, undefined);
  assert.equal(file.lexicon!.priorityMarkers, undefined);
});

// ─── Neural Fingerprint Parsing ─────────────────────────────────────────

const FULL_CLAWS_WITH_FINGERPRINT = `---
# MANIFEST
id: "fp-test"
version: "1.0.0"
---
# THE VIBE
> **Purpose:** Fingerprint test
> **Trigger:** test
---
# NEURAL FINGERPRINT
{
  "signature_version": "2.1",
  "neural_digest": "LSH:a1b2c3d4e5f6:cosine_sim=0.95",
  "calibration_metadata": {
    "date": "2026-01-15",
    "runs": 500,
    "environment": "stable-v3.2",
    "baseline_similarity": 0.97
  },
  "drift_thresholds": {
    "soft_drift": 0.85,
    "hard_drift": 0.75,
    "critical_shutdown": 0.50
  },
  "monitored_decision_points": [
    "tool_selection",
    "risk_assessment",
    "memory_write"
  ],
  "hardware_signature": {
    "anchor": "tpm",
    "key_id": "key-abc-123",
    "signature": "sig:deadbeef..."
  }
}
`;

test("parseFingerprint — full fingerprint with all fields", () => {
  const file = parseClawsFile(FULL_CLAWS_WITH_FINGERPRINT);
  assert.ok(file.fingerprint, "fingerprint should not be null");
  const fp = file.fingerprint!;
  assert.equal(fp.signatureVersion, "2.1");
  assert.equal(fp.neuralDigest, "LSH:a1b2c3d4e5f6:cosine_sim=0.95");
  assert.equal(fp.calibrationDate, "2026-01-15");
  assert.equal(fp.calibrationRuns, 500);
  assert.equal(fp.calibrationEnvironment, "stable-v3.2");
  assert.equal(fp.baselineSimilarity, 0.97);
});

test("parseFingerprint — drift thresholds with snake_case → camelCase", () => {
  const file = parseClawsFile(FULL_CLAWS_WITH_FINGERPRINT);
  const dt = file.fingerprint?.driftThresholds;
  assert.ok(dt, "drift thresholds should exist");
  assert.equal(dt!.softDrift, 0.85);
  assert.equal(dt!.hardDrift, 0.75);
  assert.equal(dt!.criticalShutdown, 0.50);
});

test("parseFingerprint — monitored decision points", () => {
  const file = parseClawsFile(FULL_CLAWS_WITH_FINGERPRINT);
  assert.deepEqual(file.fingerprint?.monitoredDecisionPoints, [
    "tool_selection",
    "risk_assessment",
    "memory_write",
  ]);
});

test("parseFingerprint — hardware signature", () => {
  const file = parseClawsFile(FULL_CLAWS_WITH_FINGERPRINT);
  const hw = file.fingerprint?.hardwareSignature;
  assert.ok(hw, "hardware signature should exist");
  assert.equal(hw!.anchor, "tpm");
  assert.equal(hw!.keyId, "key-abc-123");
  assert.equal(hw!.signature, "sig:deadbeef...");
});

test("parseFingerprint — missing fingerprint block returns null", () => {
  const content = `---\n# MANIFEST\nid: test\nversion: "1.0"\n---\n# THE VIBE\nPurpose: test\n`;
  const file = parseClawsFile(content);
  assert.equal(file.fingerprint, null);
});

test("parseFingerprint — malformed JSON returns null", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# NEURAL FINGERPRINT\n{not valid}`;
  const file = parseClawsFile(content);
  assert.equal(file.fingerprint, null);
});

// ─── Both blocks together ───────────────────────────────────────────────

const FULL_CLAWS_BOTH = `---
# MANIFEST
id: "full-test"
version: "2.0.0"
---
# THE VIBE
> **Purpose:** Full test
> **Trigger:** test
---
/* TELEMETRY */
{
  "execution_count": 42,
  "success_rate": 0.95,
  "avg_latency_ms": 120,
  "errors": []
}
---
# THE LEXICON
{
  "mode": "hybrid_stenography",
  "mappings": {"cfg": "configuration"}
}
---
# NEURAL FINGERPRINT
{
  "signature_version": "1.0",
  "neural_digest": "LSH:test123",
  "calibration_metadata": {"date": "2026-02-01"}
}
`;

test("parseClawsFile — both lexicon + fingerprint + telemetry together", () => {
  const file = parseClawsFile(FULL_CLAWS_BOTH);
  assert.ok(file.telemetry, "telemetry should exist");
  assert.equal(file.telemetry!.executionCount, 42);
  assert.ok(file.lexicon, "lexicon should exist");
  assert.equal(file.lexicon!.mode, "hybrid_stenography");
  assert.ok(file.fingerprint, "fingerprint should exist");
  assert.equal(file.fingerprint!.signatureVersion, "1.0");
  assert.equal(file.fingerprint!.neuralDigest, "LSH:test123");
  assert.equal(file.fingerprint!.calibrationDate, "2026-02-01");
});

test("parseClawsFile — lexicon with comment lines stripped", () => {
  const content = `---\n# MANIFEST\nid: test\n---\n# THE LEXICON\n// Lexicon block\n/* Commentary */\n{"mode":"test","mappings":{}}`;
  const file = parseClawsFile(content);
  assert.ok(file.lexicon);
  assert.equal(file.lexicon!.mode, "test");
});

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed (${passed + failed} total)\n`);
process.exit(failed > 0 ? 1 : 0);
