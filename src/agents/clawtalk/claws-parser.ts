/**
 * .claws File Format Parser
 *
 * Parses the literate executable container format into structured blocks.
 * Supports all 10 block types (0–9).
 *
 * File structure uses `---` delimiters between blocks with block markers:
 *   # CRYPTOGRAPHIC IDENTITY  → Block 0
 *   # MANIFEST                → Block 1
 *   # THE VIBE                → Block 2
 *   # CLAW-IDL                → Block 3
 *   # ENGINE                  → Block 4
 *   # TELEMETRY               → Block 5
 *   # STATE                   → Block 6
 *   # VERIFICATION            → Block 7
 *   # THE LEXICON             → Block 8
 *   # NEURAL FINGERPRINT      → Block 9
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Permission declaration from the manifest */
export interface ClawsPermission {
  capability: string;
  allow?: string[];
  deny?: string[];
  paths?: string[];
  keys?: string[];
  piiScan?: boolean;
}

/** Parsed manifest (Block 1) */
export interface ClawsManifest {
  id: string;
  version: string;
  schemaVersion?: string;
  runtime?: string;
  memoryStrategy?: string;
  permissions: ClawsPermission[];
  integrity?: string;
  /** Raw YAML text */
  raw: string;
}

/** Parsed vibe (Block 2) */
export interface ClawsVibe {
  purpose?: string;
  trigger?: string;
  tone?: string;
  constraint?: string;
  /** Full markdown text */
  raw: string;
}

/** Telemetry entry (Block 5) */
export interface ClawsTelemetry {
  executionCount: number;
  successRate: number;
  avgLatencyMs: number;
  errors: Array<{ code: string; msg: string; timestamp: number }>;
  lastRefactor?: string;
  refactorReason?: string;
  /** Raw JSON text */
  raw: string;
}

/** Priority marker in Lexicon Block 8 */
export interface ClawsPriorityMarker {
  blocking: boolean;
  priority: string;
  requireBiometric?: boolean;
}

/** Lexicon Mappings (Block 8) */
export interface ClawsLexicon {
  /** Lexicon mapping mode (e.g., "lexicon_compact") */
  mode: string;
  /** Pruning aggressiveness */
  pruningLevel?: string;
  /** Shorthand → expansion mappings */
  mappings: Record<string, string>;
  /** Path shorthand → full path compressions */
  pathCompressions?: Record<string, string>;
  /** Priority marker definitions */
  priorityMarkers?: Record<string, ClawsPriorityMarker>;
  /** Raw JSON text */
  raw: string;
}

// ── Block 0: Cryptographic Identity ─────────────────────────────────────

/** Cryptographic Identity (Block 0) — hardware-bound signing */
export interface ClawsIdentity {
  /** SHA-256 content signature */
  signature: string;
  /** Hardware key identifier (TPM / Secure Enclave) */
  signedBy: string;
  /** Whether execution is locked to the signing device */
  deviceBinding: boolean;
  /** Raw YAML text */
  raw: string;
}

// ── Block 3: Claw-IDL ───────────────────────────────────────────────────

/** A single field in a Claw-IDL interface */
export interface ClawsIdlField {
  /** Field name */
  name: string;
  /** TypeScript-style type (string, number, float, boolean, etc.) */
  type: string;
  /** Whether the field is optional (trailing ?) */
  optional: boolean;
  /** @dialect annotation key (e.g., "context.user.email") */
  dialect?: string;
  /** Comment text (default hints, descriptions) */
  comment?: string;
}

/** Parsed Claw-IDL interface (Block 3) */
export interface ClawsIdl {
  /** Interface name (e.g., "InvoiceArgs") */
  interfaceName: string;
  /** Parsed fields */
  fields: ClawsIdlField[];
  /** Raw block text */
  raw: string;
}

// ── Block 4: Engine ─────────────────────────────────────────────────────

/** Engine block (Block 4) — executable logic */
export interface ClawsEngine {
  /** Source language (typescript, rust, python) */
  lang: string;
  /** Exported function name(s) */
  exports: string[];
  /** Import specifiers found (e.g., ["@closedclaw/std"]) */
  imports: string[];
  /** Script source code (inside <script> tags) */
  source: string;
  /** SHA-256 of source for JIT cache key */
  sourceHash: string;
  /** Raw block text */
  raw: string;
}

// ── Block 6: State Hydration ────────────────────────────────────────────

/** State Hydration checkpoint (Block 6) */
export interface ClawsStateCheckpoint {
  /** Checkpoint identifier */
  checkpointId: string;
  /** Base64-encoded KV cache fragment or VM state */
  kvCacheFragment?: string;
  /** Tokens consumed at checkpoint time */
  contextWindowUsed?: number;
  /** Arbitrary runtime variables saved at checkpoint */
  lastExecutionVariables: Record<string, unknown>;
  /** Raw JSON text */
  raw: string;
}

// ── Block 7: Formal Verification ────────────────────────────────────────

/** Formal Verification Proof (Block 7) */
export interface ClawsVerificationProof {
  /** Theorem name */
  theorem: string;
  /** Number of execution paths analysed */
  pathsAnalysed?: number;
  /** Memory access verdict */
  memoryAccess?: string;
  /** Network scope verdict */
  networkCalls?: string;
  /** Filesystem verdict */
  fileSystem?: string;
  /** Overall status: VERIFIED | FAILED | PENDING */
  status: "VERIFIED" | "FAILED" | "PENDING";
  /** ISO-8601 timestamp of proof generation */
  timestamp?: string;
  /** Solver used (e.g., "Z3 SMT Solver") */
  solver?: string;
  /** Raw block text */
  raw: string;
}

/** Neural Fingerprint / Behavioral Signature (Block 9) */
export interface ClawsNeuralFingerprint {
  /** Signature format version */
  signatureVersion: string;
  /** LSH-encoded activation vector digest */
  neuralDigest: string;
  /** Calibration metadata */
  calibrationDate?: string;
  calibrationRuns?: number;
  calibrationEnvironment?: string;
  baselineSimilarity?: number;
  /** Drift detection thresholds */
  driftThresholds?: {
    softDrift: number;
    hardDrift: number;
    criticalShutdown?: number;
  };
  /** Decision points monitored for drift */
  monitoredDecisionPoints?: string[];
  /** Hardware-anchored signature */
  hardwareSignature?: {
    anchor: string;
    keyId: string;
    signature: string;
  };
  /** Raw JSON text */
  raw: string;
}

/** Full parsed .claws file */
export interface ClawsFile {
  /** Source file path */
  filePath: string;
  /** Block 0: Cryptographic Identity */
  identity: ClawsIdentity | null;
  /** Block 1: Manifest */
  manifest: ClawsManifest;
  /** Block 2: Vibe */
  vibe: ClawsVibe;
  /** Block 3: Claw-IDL Interface */
  idl: ClawsIdl | null;
  /** Block 4: Engine */
  engine: ClawsEngine | null;
  /** Block 5: Telemetry (may be empty for new skills) */
  telemetry: ClawsTelemetry | null;
  /** Block 6: State Hydration Checkpoint */
  stateCheckpoint: ClawsStateCheckpoint | null;
  /** Block 7: Formal Verification Proof */
  verification: ClawsVerificationProof | null;
  /** Block 8: Lexicon Mappings */
  lexicon: ClawsLexicon | null;
  /** Block 9: Neural Fingerprint / Behavioral Signature */
  fingerprint: ClawsNeuralFingerprint | null;
  /** All raw blocks indexed by marker */
  rawBlocks: Record<string, string>;
}

/** Skill summary for listing */
export interface ClawsSkillSummary {
  id: string;
  version: string;
  trigger?: string;
  purpose?: string;
  successRate?: number;
  executionCount?: number;
  filePath: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK SPLITTER
// ═══════════════════════════════════════════════════════════════════════════

/** Block markers we recognize */
const BLOCK_MARKERS: Record<string, string> = {
  "CRYPTOGRAPHIC IDENTITY": "identity",
  MANIFEST: "manifest",
  "THE VIBE": "vibe",
  "CLAW-IDL": "idl",
  "CLAW-IDL INTERFACE": "idl",
  ENGINE: "engine",
  TELEMETRY: "telemetry",
  "STATE CHECKPOINT": "state",
  STATE: "state",
  "FORMAL VERIFICATION PROOF": "verification",
  VERIFICATION: "verification",
  "THE LEXICON": "lexicon",
  LEXICON: "lexicon",
  "BLOCK 8: THE LEXICON": "lexicon",
  "NEURAL FINGERPRINT": "fingerprint",
  "BLOCK 9: NEURAL FINGERPRINT": "fingerprint",
};

/**
 * Split a .claws file into named blocks.
 * Uses `---` delimiters and `# MARKER` headers to identify blocks.
 */
export function splitBlocks(content: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  const sections = content.split(/^---\s*$/m);

  let currentLabel = "preamble";

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) {
      continue;
    }

    // Check for a block marker in the first few lines
    const lines = trimmed.split("\n");
    let foundLabel: string | null = null;

    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      const line = lines[i].trim();
      // Match: # MARKER or /* MARKER */ or // MARKER
      const markerMatch =
        line.match(/^#\s+(.+)$/) ??
        line.match(/^\/\*\s*(.+?)\s*\*\/$/) ??
        line.match(/^\/\/\s*(.+)$/);

      if (markerMatch) {
        const upperKey = markerMatch[1].toUpperCase().replace(/[()]/g, "").trim();
        const mapped = BLOCK_MARKERS[upperKey];
        if (mapped) {
          foundLabel = mapped;
          // Remove the marker line from content
          lines.splice(i, 1);
          break;
        }
      }
    }

    if (foundLabel) {
      currentLabel = foundLabel;
      blocks[currentLabel] = lines.join("\n").trim();
    } else {
      // Append to current block
      blocks[currentLabel] = ((blocks[currentLabel] ?? "") + "\n" + trimmed).trim();
    }
  }

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse YAML-like manifest block (simplified — no full YAML parser dependency).
 * Handles flat key: value pairs and nested permission arrays.
 */
function parseManifest(raw: string): ClawsManifest {
  const lines = raw.split("\n").filter((l) => !l.trim().startsWith("#") && l.trim());

  const result: Record<string, unknown> = {};
  const permissions: ClawsPermission[] = [];
  let currentPerm: Partial<ClawsPermission> | null = null;

  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Skip list item dash for permissions
    if (trimmed.startsWith("- capability:") || trimmed.startsWith("- deny:")) {
      if (currentPerm) {
        permissions.push(currentPerm as ClawsPermission);
      }
      currentPerm = {};
    }

    const kvMatch = trimmed.replace(/^-\s*/, "").match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      const cleanValue = value.replace(/^["']|["']$/g, "").trim();

      if (currentPerm && indent >= 4) {
        // Permission sub-key
        if (key === "allow" || key === "deny" || key === "paths" || key === "keys") {
          // Parse array: ["a", "b"]
          const arrMatch = cleanValue.match(/^\[(.+)\]$/);
          if (arrMatch) {
            (currentPerm as Record<string, unknown>)[key] = arrMatch[1]
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""));
          }
        } else if (key === "pii_scan" || key === "piiScan") {
          currentPerm.piiScan = cleanValue === "true";
        } else {
          (currentPerm as Record<string, unknown>)[key] = cleanValue;
        }
      } else {
        // Top-level key
        result[key] = cleanValue;
      }
    }
  }

  if (currentPerm) {
    permissions.push(currentPerm as ClawsPermission);
  }
  const toStringSafe = (value: unknown, fallback: string): string => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return fallback;
  };

  return {
    id: toStringSafe(result.id, "unknown"),
    version: toStringSafe(result.version, "0.0.0"),
    schemaVersion: result.schema_version as string | undefined,
    runtime: result.runtime as string | undefined,
    memoryStrategy: result.memory_strategy as string | undefined,
    permissions,
    integrity: result.integrity as string | undefined,
    raw,
  };
}

/**
 * Parse vibe block — extract structured fields from markdown.
 */
function parseVibe(raw: string): ClawsVibe {
  const vibe: ClawsVibe = { raw };

  const purposeMatch = raw.match(/\*\*Purpose:\*\*\s*(.+)/i) ?? raw.match(/Purpose:\s*(.+)/i);
  if (purposeMatch) {
    vibe.purpose = purposeMatch[1].trim();
  }

  const triggerMatch = raw.match(/\*\*Trigger:\*\*\s*(.+)/i) ?? raw.match(/Trigger:\s*(.+)/i);
  if (triggerMatch) {
    vibe.trigger = triggerMatch[1].trim();
  }

  const toneMatch = raw.match(/\*\*Tone:\*\*\s*(.+)/i) ?? raw.match(/Tone:\s*(.+)/i);
  if (toneMatch) {
    vibe.tone = toneMatch[1].trim();
  }

  const constraintMatch =
    raw.match(/\*\*Constraint:\*\*\s*(.+)/i) ?? raw.match(/Constraint:\s*(.+)/i);
  if (constraintMatch) {
    vibe.constraint = constraintMatch[1].trim();
  }

  return vibe;
}

/**
 * Parse telemetry block (JSON with optional comment lines).
 */
function parseTelemetry(raw: string): ClawsTelemetry | null {
  // Strip comment lines (/* ... */ or // ...)
  const cleaned = raw
    .split("\n")
    .filter(
      (l) => !l.trim().startsWith("/*") && !l.trim().startsWith("//") && !l.trim().startsWith("*"),
    )
    .join("\n")
    .trim();

  if (!cleaned) {
    return null;
  }

  try {
    const data = JSON.parse(cleaned);
    return {
      executionCount: data.execution_count ?? data.executionCount ?? 0,
      successRate: data.success_rate ?? data.successRate ?? 1.0,
      avgLatencyMs: data.avg_latency_ms ?? data.avgLatencyMs ?? 0,
      errors: data.errors ?? [],
      lastRefactor: data.last_refactor ?? data.lastRefactor,
      refactorReason: data.refactor_reason ?? data.refactorReason,
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Parse lexicon block (Block 8 — JSON with optional comment lines).
 */
function parseLexicon(raw: string): ClawsLexicon | null {
  const cleaned = raw
    .split("\n")
    .filter(
      (l) => !l.trim().startsWith("/*") && !l.trim().startsWith("//") && !l.trim().startsWith("*"),
    )
    .join("\n")
    .trim();

  if (!cleaned) {
    return null;
  }

  try {
    const data = JSON.parse(cleaned);
    const pm = data.priority_markers ?? data.priorityMarkers;
    const priorityMarkers: Record<string, ClawsPriorityMarker> | undefined = pm
      ? Object.fromEntries(
          Object.entries(pm as Record<string, unknown>).map(([k, v]) => {
            const marker = (v ?? {}) as Record<string, unknown>;
            const blockingRaw = marker.blocking;
            const priorityRaw = marker.priority;
            const requireBiometricRaw = marker.require_biometric ?? marker.requireBiometric;
            return [
              k,
              {
                blocking: typeof blockingRaw === "boolean" ? blockingRaw : false,
                priority: typeof priorityRaw === "string" ? priorityRaw : "normal",
                ...(typeof requireBiometricRaw === "boolean"
                  ? { requireBiometric: requireBiometricRaw }
                  : {}),
              },
            ];
          }),
        )
      : undefined;

    return {
      mode: data.mode ?? "default",
      pruningLevel: data.pruning_level ?? data.pruningLevel,
      mappings: data.mappings ?? {},
      pathCompressions: data.path_compressions ?? data.pathCompressions,
      priorityMarkers,
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Parse neural fingerprint block (Block 9 — JSON with optional comment lines).
 */
function parseFingerprint(raw: string): ClawsNeuralFingerprint | null {
  const cleaned = raw
    .split("\n")
    .filter(
      (l) => !l.trim().startsWith("/*") && !l.trim().startsWith("//") && !l.trim().startsWith("*"),
    )
    .join("\n")
    .trim();

  if (!cleaned) {
    return null;
  }

  try {
    const data = JSON.parse(cleaned);
    const cal = data.calibration_metadata ?? data.calibrationMetadata ?? {};
    const dt = data.drift_thresholds ?? data.driftThresholds;
    const hw = data.hardware_signature ?? data.hardwareSignature;

    return {
      signatureVersion: data.signature_version ?? data.signatureVersion ?? "1.0",
      neuralDigest: data.neural_digest ?? data.neuralDigest ?? "",
      calibrationDate: cal.date ?? cal.calibrationDate,
      calibrationRuns: cal.runs ?? cal.calibrationRuns,
      calibrationEnvironment: cal.environment ?? cal.calibrationEnvironment,
      baselineSimilarity: cal.baseline_similarity ?? cal.baselineSimilarity,
      driftThresholds: dt
        ? {
            softDrift: dt.soft_drift ?? dt.softDrift ?? 0.85,
            hardDrift: dt.hard_drift ?? dt.hardDrift ?? 0.75,
            criticalShutdown: dt.critical_shutdown ?? dt.criticalShutdown,
          }
        : undefined,
      monitoredDecisionPoints: data.monitored_decision_points ?? data.monitoredDecisionPoints,
      hardwareSignature: hw
        ? {
            anchor: hw.anchor ?? "",
            keyId: hw.key_id ?? hw.keyId ?? "",
            signature: hw.signature ?? "",
          }
        : undefined,
      raw,
    };
  } catch {
    return null;
  }
}

// ── Block 0: Cryptographic Identity parser ──────────────────────────────

/**
 * Parse cryptographic identity block (Block 0 — YAML-like key: value).
 */
function parseIdentity(raw: string): ClawsIdentity | null {
  const lines = raw.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  const kv: Record<string, string> = {};

  for (const line of lines) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (m) {
      kv[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }

  const sig = kv.signature;
  if (!sig) {
    return null;
  }

  return {
    signature: sig,
    signedBy: kv.signed_by ?? kv.signedby ?? "unknown",
    deviceBinding: (kv.device_binding ?? kv.devicebinding ?? "false").toLowerCase() === "true",
    raw,
  };
}

// ── Block 3: Claw-IDL parser ────────────────────────────────────────────

/**
 * Parse Claw-IDL interface block (Block 3 — TypeScript-like interface with @dialect annotations).
 */
function parseIdl(raw: string): ClawsIdl | null {
  // Extract interface name
  const ifaceMatch = raw.match(/interface\s+(\w+)/);
  if (!ifaceMatch) {
    return null;
  }

  const interfaceName = ifaceMatch[1];
  const fields: ClawsIdlField[] = [];

  // Parse field lines.  Pattern:
  //   // @dialect:context.user.email (some comment)
  //   fieldName?: type;
  const lines = raw.split("\n");
  let pendingDialect: string | undefined;
  let pendingComment: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect @dialect annotation from comments
    const dialectMatch =
      trimmed.match(/\/\/\s*@dialect:(\S+)(?:\s+(.*))?/) ??
      trimmed.match(/\/\*\s*@dialect:(\S+)(?:\s+(.*?))?\s*\*\//);
    if (dialectMatch) {
      pendingDialect = dialectMatch[1];
      // Clean up parenthetical comments for the comment field
      const rest = dialectMatch[2]?.replace(/^\(|\)$/g, "").trim();
      pendingComment = rest || undefined;
      continue;
    }

    // Collect plain comment lines as comments (JSDoc or //)
    const plainCommentMatch = trimmed.match(/^\/\/\s*(.+)/);
    if (plainCommentMatch && !dialectMatch) {
      const commentText = plainCommentMatch[1].trim();
      // Skip known structural markers
      if (!commentText.startsWith("@") && !commentText.startsWith("Tool ")) {
        pendingComment = commentText;
      }
      continue;
    }

    // Match a field declaration: name?: type;
    const fieldMatch = trimmed.match(/^(\w+)(\?)?:\s*(\w+)\s*;?\s*$/);
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[1],
        type: fieldMatch[3],
        optional: fieldMatch[2] === "?",
        dialect: pendingDialect,
        comment: pendingComment,
      });
      pendingDialect = undefined;
      pendingComment = undefined;
    }
  }

  if (fields.length === 0) {
    return null;
  }

  return { interfaceName, fields, raw };
}

// ── Block 4: Engine parser ──────────────────────────────────────────────

/**
 * Compute a simple hex hash string for cache key purposes.
 * Not cryptographically secure — just a fast content fingerprint.
 */
function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Parse Engine block (Block 4 — <script> wrapper with executable logic).
 */
function parseEngine(raw: string): ClawsEngine | null {
  // Extract <script lang="..."> ... </script>
  const scriptMatch = raw.match(/<script(?:\s+lang=["'](\w+)["'])?\s*>([\s\S]*?)<\/script>/i);

  let lang = "typescript";
  let source: string;

  if (scriptMatch) {
    lang = scriptMatch[1] ?? "typescript";
    source = scriptMatch[2].trim();
  } else {
    // Fallback: treat entire block as source
    source = raw.trim();
    if (!source) {
      return null;
    }
  }

  // Extract imports
  const imports: string[] = [];
  for (const m of source.matchAll(/import\s+\{[^}]*\}\s+from\s+["']([^"']+)["']/g)) {
    imports.push(m[1]);
  }

  // Extract exported function / const names
  const exports: string[] = [];
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) {
    exports.push(m[1]);
  }

  const sourceHash = simpleHash(source);

  return { lang, exports, imports, source, sourceHash, raw };
}

// ── Block 6: State Hydration parser ─────────────────────────────────────

/**
 * Parse State Hydration block (Block 6 — JSON checkpoint).
 */
function parseStateCheckpoint(raw: string): ClawsStateCheckpoint | null {
  const cleaned = raw
    .split("\n")
    .filter(
      (l) => !l.trim().startsWith("/*") && !l.trim().startsWith("//") && !l.trim().startsWith("*"),
    )
    .join("\n")
    .trim();

  if (!cleaned) {
    return null;
  }

  try {
    const data = JSON.parse(cleaned);
    return {
      checkpointId: data.checkpoint_id ?? data.checkpointId ?? "",
      kvCacheFragment: data.kv_cache_fragment ?? data.kvCacheFragment,
      contextWindowUsed: data.context_window_used ?? data.contextWindowUsed,
      lastExecutionVariables: data.last_execution_variables ?? data.lastExecutionVariables ?? {},
      raw,
    };
  } catch {
    return null;
  }
}

// ── Block 7: Formal Verification parser ─────────────────────────────────

/**
 * Parse Formal Verification block (Block 7 — semi-structured proof text).
 */
function parseVerification(raw: string): ClawsVerificationProof | null {
  const theoremMatch = raw.match(/Theorem:\s*(\S+)/i);
  if (!theoremMatch) {
    return null;
  }

  const theorem = theoremMatch[1];

  // Extract analysis fields
  const pathsMatch = raw.match(/Analysis:\s*(\d+)\s*execution\s*paths/i);
  const memMatch = raw.match(/Memory\s*access:\s*(.+)/i);
  const netMatch = raw.match(/Network\s*calls?:\s*(.+)/i);
  const fsMatch = raw.match(/File\s*system:\s*(.+)/i);
  const statusMatch = raw.match(/Status:\s*(VERIFIED|FAILED|PENDING)/i);
  const timestampMatch = raw.match(/Timestamp:\s*(\S+)/i);
  const solverMatch = raw.match(/Generated by\s+(.+?)\]/i) ?? raw.match(/Solver:\s*(.+)/i);

  return {
    theorem,
    pathsAnalysed: pathsMatch ? parseInt(pathsMatch[1], 10) : undefined,
    memoryAccess: memMatch ? memMatch[1].trim() : undefined,
    networkCalls: netMatch ? netMatch[1].trim() : undefined,
    fileSystem: fsMatch ? fsMatch[1].trim() : undefined,
    status: (statusMatch?.[1]?.toUpperCase() as "VERIFIED" | "FAILED" | "PENDING") ?? "PENDING",
    timestamp: timestampMatch ? timestampMatch[1] : undefined,
    solver: solverMatch ? solverMatch[1].trim() : undefined,
    raw,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a .claws file from string content.
 */
export function parseClawsFile(content: string, filePath = "<inline>"): ClawsFile {
  const rawBlocks = splitBlocks(content);

  const manifest = rawBlocks.manifest
    ? parseManifest(rawBlocks.manifest)
    : { id: "unknown", version: "0.0.0", permissions: [], raw: "" };

  const vibe = rawBlocks.vibe ? parseVibe(rawBlocks.vibe) : { raw: "" };

  const identity = rawBlocks.identity ? parseIdentity(rawBlocks.identity) : null;
  const idl = rawBlocks.idl ? parseIdl(rawBlocks.idl) : null;
  const engine = rawBlocks.engine ? parseEngine(rawBlocks.engine) : null;
  const telemetry = rawBlocks.telemetry ? parseTelemetry(rawBlocks.telemetry) : null;
  const stateCheckpoint = rawBlocks.state ? parseStateCheckpoint(rawBlocks.state) : null;
  const verification = rawBlocks.verification ? parseVerification(rawBlocks.verification) : null;
  const lexicon = rawBlocks.lexicon ? parseLexicon(rawBlocks.lexicon) : null;
  const fingerprint = rawBlocks.fingerprint ? parseFingerprint(rawBlocks.fingerprint) : null;

  return {
    filePath,
    identity,
    manifest,
    vibe,
    idl,
    engine,
    telemetry,
    stateCheckpoint,
    verification,
    lexicon,
    fingerprint,
    rawBlocks,
  };
}

/**
 * Load a .claws file from disk.
 */
export async function loadClawsFile(filePath: string): Promise<ClawsFile> {
  const content = await readFile(filePath, "utf-8");
  return parseClawsFile(content, filePath);
}

/**
 * Scan a directory for .claws files and return summaries.
 */
export async function scanSkillsDirectory(dir?: string): Promise<ClawsSkillSummary[]> {
  const skillsDir = dir ?? join(homedir(), ".closedclaw", "skills");

  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return []; // Directory doesn't exist yet
  }

  const summaries: ClawsSkillSummary[] = [];

  for (const entry of entries) {
    if (extname(entry) !== ".claws") {
      continue;
    }
    const filePath = join(skillsDir, entry);
    try {
      const file = await loadClawsFile(filePath);
      summaries.push({
        id: file.manifest.id,
        version: file.manifest.version,
        trigger: file.vibe.trigger,
        purpose: file.vibe.purpose,
        successRate: file.telemetry?.successRate,
        executionCount: file.telemetry?.executionCount,
        filePath,
      });
    } catch {
      // Skip unparseable files
    }
  }

  return summaries;
}

/**
 * Validate manifest permissions — check for dangerous capabilities.
 */
export function validatePermissions(manifest: ClawsManifest): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  for (const perm of manifest.permissions) {
    // Check for wildcard network access
    if (perm.capability === "net.http" && perm.allow?.includes("*")) {
      warnings.push(`Wildcard network access (net.http allow=["*"]) — tool can reach any host`);
    }

    // Check for filesystem write to sensitive paths
    if (perm.capability === "fs.write") {
      const sensitive = ["/etc", "/system", "/root", "/boot"];
      const allowedPaths = perm.allow ?? perm.paths ?? [];
      for (const p of allowedPaths) {
        if (sensitive.some((s) => p.startsWith(s))) {
          warnings.push(`Filesystem write to sensitive path: ${p}`);
        }
      }
    }

    // Check for env access to common secret patterns
    if (perm.capability === "env.read" && perm.keys) {
      const secretPatterns = /key|secret|token|password|credential/i;
      for (const k of perm.keys) {
        if (secretPatterns.test(k) && !perm.piiScan) {
          warnings.push(`Secret env var "${k}" accessed without PII scanning`);
        }
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Update telemetry in a .claws file (increment execution count, update success rate).
 */
export async function updateTelemetry(
  filePath: string,
  update: { success: boolean; latencyMs?: number; error?: { code: string; msg: string } },
): Promise<void> {
  const file = await loadClawsFile(filePath);
  const telem = file.telemetry ?? {
    executionCount: 0,
    successRate: 1.0,
    avgLatencyMs: 0,
    errors: [],
    raw: "",
  };

  telem.executionCount++;
  // Exponential moving average for success rate
  const successVal = update.success ? 1.0 : 0.0;
  telem.successRate = telem.successRate * 0.95 + successVal * 0.05;

  if (update.latencyMs) {
    telem.avgLatencyMs = telem.avgLatencyMs * 0.9 + update.latencyMs * 0.1;
  }

  if (update.error) {
    telem.errors.push({ ...update.error, timestamp: Math.floor(Date.now() / 1000) });
    // Keep last 50 errors
    if (telem.errors.length > 50) {
      telem.errors = telem.errors.slice(-50);
    }
  }

  // Write updated telemetry back to file
  const telemJson = JSON.stringify(
    {
      execution_count: telem.executionCount,
      success_rate: Math.round(telem.successRate * 1000) / 1000,
      avg_latency_ms: Math.round(telem.avgLatencyMs),
      errors: telem.errors,
      last_refactor: telem.lastRefactor,
      refactor_reason: telem.refactorReason,
    },
    null,
    2,
  );

  // Read original content and replace/append telemetry block
  const content = await readFile(filePath, "utf-8");
  const blocks = splitBlocks(content);

  if (blocks.telemetry) {
    // Replace existing telemetry block: find the `---` + TELEMETRY header
    // and replace everything from there to EOF (or to next --- block)
    // Find the specific --- that precedes TELEMETRY
    let telemDashPos = -1;
    const dashRegex = /^---\s*$/gm;
    let match: RegExpExecArray | null;
    while ((match = dashRegex.exec(content)) !== null) {
      const afterDash = content.slice(match.index + match[0].length).trimStart();
      if (/^(?:#|\/\*)\s*TELEMETRY/i.test(afterDash)) {
        telemDashPos = match.index;
        break;
      }
    }
    if (telemDashPos >= 0) {
      const before = content.slice(0, telemDashPos);
      const newContent = before + `---\n/* TELEMETRY */\n${telemJson}\n`;
      await writeFile(filePath, newContent, "utf-8");
    } else {
      // Fallback: append
      await writeFile(filePath, content + `\n---\n/* TELEMETRY */\n${telemJson}\n`, "utf-8");
    }
  } else {
    // Append telemetry block
    await writeFile(filePath, content + `\n---\n/* TELEMETRY */\n${telemJson}\n`, "utf-8");
  }
}

/**
 * Create a minimal .claws file template.
 */
export function createClawsTemplate(opts: {
  id: string;
  version?: string;
  purpose: string;
  trigger: string;
  permissions?: ClawsPermission[];
}): string {
  const perms = (opts.permissions ?? [])
    .map((p) => {
      const parts = [`    - capability: "${p.capability}"`];
      if (p.allow) {
        parts.push(`      allow: [${p.allow.map((a) => `"${a}"`).join(", ")}]`);
      }
      if (p.piiScan) {
        parts.push("      pii_scan: true");
      }
      return parts.join("\n");
    })
    .join("\n");

  return `---
# MANIFEST
id: "${opts.id}"
version: "${opts.version ?? "1.0.0"}"
schema_version: "3.0"
runtime: "deno_wasi_v2"
permissions:
${perms || "  []"}
---
# THE VIBE
> **Purpose:** ${opts.purpose}
> **Trigger:** ${opts.trigger}
---
/* TELEMETRY */
{
  "execution_count": 0,
  "success_rate": 1.0,
  "avg_latency_ms": 0,
  "errors": []
}
`;
}
