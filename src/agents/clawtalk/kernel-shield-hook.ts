/**
 * Kernel Shield Hook — before_tool_call enforcement
 *
 * Intercepts every tool invocation and runs it through the three-layer
 * Kernel Shield before allowing execution:
 *   Layer 1: Structural — check tool permissions against .claws manifest
 *   Layer 2: Semantic — compute risk vector, apply thresholds
 *   Layer 3: Neural Attestation — drift detection (if fingerprint available)
 *
 * Operates in three enforcement modes:
 *   - "strict": block high-risk invocations
 *   - "permissive": log but allow everything
 *   - "audit-only": record verdicts, never block
 *
 * Registration: called from src/plugins/loader.ts alongside the ClawTalk hook.
 */

import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "../../plugins/types.js";
import type { KernelShieldConfig } from "../../config/types.security.js";
import type {
  ClawsFile,
  ClawsManifest,
  ClawsVerificationProof,
  ClawsNeuralFingerprint,
} from "./claws-parser.js";
import { evaluateShield, type ShieldVerdict, type ToolInvocationContext } from "./kernel-shield.js";

// ═══════════════════════════════════════════════════════════════════════════
// MODULE STATE
// ═══════════════════════════════════════════════════════════════════════════

/** Active shield configuration */
let activeConfig: Required<KernelShieldConfig> = {
  enabled: false,
  enforcement: "permissive",
  riskThresholds: { low: 0.3, high: 0.7 },
  attestation: { enabled: true, softDriftThreshold: 0.94, hardDriftThreshold: 0.85 },
  auditLog: true,
  notifyOnBlock: true,
};

/** Registry of loaded .claws skill files, keyed by skill ID */
const skillRegistry = new Map<string, ClawsFile>();

/** Mapping from tool name → skill ID (populated when skills are loaded) */
const toolToSkill = new Map<string, string>();

/** Session trust score: 0–1, increases with successful calls, decreases on failures */
let sessionTrustScore = 0.8;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update the Kernel Shield configuration.
 * Called on config reload (SIGUSR1) or initial loader setup.
 */
export function updateKernelShieldConfig(config: Partial<KernelShieldConfig>): void {
  activeConfig = {
    enabled: config.enabled ?? activeConfig.enabled,
    enforcement: config.enforcement ?? activeConfig.enforcement,
    riskThresholds: {
      low: config.riskThresholds?.low ?? activeConfig.riskThresholds.low,
      high: config.riskThresholds?.high ?? activeConfig.riskThresholds.high,
    },
    attestation: {
      enabled: config.attestation?.enabled ?? activeConfig.attestation.enabled,
      softDriftThreshold:
        config.attestation?.softDriftThreshold ?? activeConfig.attestation.softDriftThreshold,
      hardDriftThreshold:
        config.attestation?.hardDriftThreshold ?? activeConfig.attestation.hardDriftThreshold,
    },
    auditLog: config.auditLog ?? activeConfig.auditLog,
    notifyOnBlock: config.notifyOnBlock ?? activeConfig.notifyOnBlock,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a loaded .claws file so the shield can enforce its manifest.
 * Also builds the tool→skill mapping from the skill's IDL interface.
 */
export function registerSkillForShield(clawsFile: ClawsFile): void {
  const id = clawsFile.manifest.id;
  skillRegistry.set(id, clawsFile);

  // Map tool names from the IDL interface fields to this skill
  if (clawsFile.idl) {
    for (const field of clawsFile.idl.fields) {
      toolToSkill.set(field.name, id);
    }
  }

  // Also map capabilities from manifest permissions as tool hints
  for (const perm of clawsFile.manifest.permissions) {
    // e.g. "net.http" → skill can handle HTTP-based tools
    const cap = perm.capability;
    if (!toolToSkill.has(cap)) {
      toolToSkill.set(cap, id);
    }
  }
}

/**
 * Clear all registered skills (for testing or full reload).
 */
export function clearSkillRegistry(): void {
  skillRegistry.clear();
  toolToSkill.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL → CONTEXT MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Well-known tool capability and sensitivity mappings.
 * Maps tool names to their OS-level capabilities and data sensitivity.
 */
const TOOL_PROFILES: Record<string, { caps: string[]; access: number; sensitivity: number }> = {
  // File system tools
  read_file: { caps: ["fs.read"], access: 0.3, sensitivity: 0.4 },
  write_file: { caps: ["fs.write"], access: 0.6, sensitivity: 0.5 },
  list_directory: { caps: ["fs.read"], access: 0.2, sensitivity: 0.1 },
  create_directory: { caps: ["fs.write"], access: 0.4, sensitivity: 0.2 },
  delete_file: { caps: ["fs.write"], access: 0.7, sensitivity: 0.6 },

  // Execution tools
  run_command: { caps: ["exec"], access: 0.9, sensitivity: 0.7 },
  exec: { caps: ["exec"], access: 0.9, sensitivity: 0.7 },

  // Network tools
  web_search: { caps: ["net.http"], access: 0.3, sensitivity: 0.2 },
  fetch_url: { caps: ["net.http"], access: 0.4, sensitivity: 0.3 },
  browse: { caps: ["net.http", "browser.navigate"], access: 0.5, sensitivity: 0.3 },

  // Browser automation
  browser: { caps: ["browser.navigate", "browser.interact"], access: 0.6, sensitivity: 0.4 },
  screenshot: { caps: ["browser.screenshot"], access: 0.3, sensitivity: 0.3 },
  screenshot_region: { caps: ["browser.screenshot"], access: 0.3, sensitivity: 0.3 },
  screenshot_ocr: { caps: ["browser.screenshot"], access: 0.3, sensitivity: 0.4 },

  // Memory tools
  save_note: { caps: ["memory.write"], access: 0.2, sensitivity: 0.3 },
  recall_notes: { caps: ["memory.read"], access: 0.1, sensitivity: 0.2 },

  // Clipboard
  clipboard_read: { caps: ["clipboard"], access: 0.4, sensitivity: 0.5 },
  clipboard_write: { caps: ["clipboard"], access: 0.4, sensitivity: 0.3 },

  // Scheduling
  set_reminder: { caps: ["cron.schedule"], access: 0.3, sensitivity: 0.2 },
  cron: { caps: ["cron.schedule", "exec"], access: 0.7, sensitivity: 0.5 },

  // Voice/TTS
  tts: { caps: ["tts"], access: 0.1, sensitivity: 0.1 },
};

/** Default profile for unknown tools */
const DEFAULT_PROFILE = { caps: ["unknown"], access: 0.5, sensitivity: 0.5 };

/**
 * Build a ToolInvocationContext from a tool call event.
 */
function buildToolContext(event: PluginHookBeforeToolCallEvent): ToolInvocationContext {
  const profile = TOOL_PROFILES[event.toolName] ?? DEFAULT_PROFILE;

  return {
    toolName: event.toolName,
    requestedCapabilities: profile.caps,
    accessProbability: profile.access,
    dataSensitivity: profile.sensitivity,
    trustScore: sessionTrustScore,
    // liveActivation omitted — populated by runtime when available
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The `before_tool_call` hook handler.
 *
 * Evaluates the Kernel Shield for every tool invocation and either
 * allows, logs, or blocks based on the enforcement mode and verdict.
 */
export function kernelShieldBeforeToolCallHandler(
  event: PluginHookBeforeToolCallEvent,
  _ctx: PluginHookToolContext,
): PluginHookBeforeToolCallResult | void {
  if (!activeConfig.enabled) {
    return;
  }

  // Find the matching skill manifest for this tool
  const skillId = toolToSkill.get(event.toolName);
  const skill = skillId ? skillRegistry.get(skillId) : undefined;

  // If no skill file covers this tool, use a permissive default manifest
  const manifest: ClawsManifest = skill?.manifest ?? {
    id: "__default__",
    version: "0.0.0",
    permissions: [{ capability: "unknown", allow: ["*"] }],
    raw: "",
  };

  const proof: ClawsVerificationProof | null = skill?.verification ?? null;
  const fingerprint: ClawsNeuralFingerprint | null =
    activeConfig.attestation.enabled ? (skill?.fingerprint ?? null) : null;

  // Build context and evaluate
  const toolCtx = buildToolContext(event);
  const verdict: ShieldVerdict = evaluateShield(manifest, proof, fingerprint, toolCtx);

  // Apply enforcement mode
  const enforcement = activeConfig.enforcement;

  if (enforcement === "audit-only") {
    // Record-only: never block, just log
    logVerdict(event.toolName, verdict);
    return;
  }

  if (enforcement === "permissive") {
    // Log everything, only block explicit "block" verdicts
    logVerdict(event.toolName, verdict);
    if (verdict.action === "block") {
      return {
        block: true,
        blockReason: `[Kernel Shield] ${verdict.reason}`,
      };
    }
    return;
  }

  // enforcement === "strict"
  logVerdict(event.toolName, verdict);
  if (!verdict.allowed) {
    return {
      block: true,
      blockReason: `[Kernel Shield] ${verdict.reason}`,
    };
  }

  // Shield passed — update trust score slightly upward
  sessionTrustScore = Math.min(1, sessionTrustScore + 0.01);
}

/**
 * Log a shield verdict via the default logger.
 * In the future, this integrates with src/security/audit.ts.
 */
function logVerdict(toolName: string, verdict: ShieldVerdict): void {
  // Lazy import to avoid circular deps at module-load time
  const level = verdict.action === "allow" ? "debug" : verdict.action === "log" ? "info" : "warn";
  const msg =
    `[kernel-shield] ${toolName}: ${verdict.action} — ${verdict.reason} ` +
    `(risk=${verdict.layers.semantic.riskVector}, ` +
    `drift=${verdict.layers.attestation.drift})`;

  // Use console for now; wired to subsystem logger when registered
  if (level === "debug") {
    // Only log allow verdicts at debug level — too noisy otherwise
    return;
  }
  if (level === "warn") {
    console.warn(msg);
  } else {
    console.info(msg);
  }
}

/**
 * Decrease trust score on tool failures (called externally).
 */
export function recordToolFailure(): void {
  sessionTrustScore = Math.max(0, sessionTrustScore - 0.05);
}

/**
 * Reset trust score (e.g., on new session).
 */
export function resetTrustScore(): void {
  sessionTrustScore = 0.8;
}
