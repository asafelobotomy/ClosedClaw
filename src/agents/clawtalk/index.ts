/**
 * ClawTalk — Inter-Agent Communication Protocol
 *
 * Public API for the ClawTalk protocol system.
 * See docs/concepts/clawtalk.md for the full specification.
 */

// Core protocol
export { parse, serialize, isClawTalkMessage, ClawTalkParseError } from "./parser.js";
export { encode, estimateTokens } from "./encoder.js";
export { decode } from "./decoder.js";

// ClawDense — token-optimized notation
export {
  toDense,
  toDenseBlock,
  fromDense,
  fromDenseBlock,
  estimateDenseTokens,
  compressionRatio,
  loadLexicon,
  clearLexicon,
  getActiveLexicon,
  applyLexiconCompression,
  applyLexiconExpansion,
} from "./clawdense.js";

// Dictionary & macros
export {
  loadDictionary,
  saveDictionary,
  addMacro,
  removeMacro,
  trackMacroUsage,
  propose,
  approveProposal,
  rejectProposal,
  evictLRU,
  getDefaultDictionary,
} from "./dictionary.js";
export { expandMacro, isMacroInvocation, parseMacroInvocation } from "./macros.js";
export { compress, expand } from "./abbreviations.js";

// .claws file format parser
export {
  parseClawsFile,
  loadClawsFile,
  scanSkillsDirectory,
  validatePermissions,
  updateTelemetry,
  createClawsTemplate,
  splitBlocks,
} from "./claws-parser.js";
export type {
  ClawsFile,
  ClawsManifest,
  ClawsVibe,
  ClawsTelemetry,
  ClawsLexicon,
  ClawsNeuralFingerprint,
  ClawsPriorityMarker,
  ClawsPermission,
  ClawsSkillSummary,
  ClawsIdentity,
  ClawsIdl,
  ClawsIdlField,
  ClawsEngine,
  ClawsStateCheckpoint,
  ClawsVerificationProof,
} from "./claws-parser.js";

// Routing & orchestration
export { Directory, type RoutingDecision } from "./directory.js";
export { shouldEscalate } from "./escalation.js";
export { Orchestrator, type OrchestratorDeps } from "./orchestrator.js";
export { MetricsTracker } from "./metrics.js";

// ClawTalk Hook — before_agent_start integration
export {
  clawtalkBeforeAgentStartHandler,
  routeMessage as clawtalkRouteMessage,
  updateClawTalkHookConfig,
  getClawTalkDirectory,
  type ClawTalkRouting,
} from "./clawtalk-hook.js";

// Kernel Shield — three-layer defense
export {
  checkStructural,
  computeRiskVector,
  checkAttestation,
  cosineSimilarity,
  evaluateShield,
} from "./kernel-shield.js";
export type {
  ShieldAction,
  StructuralResult,
  RiskLevel,
  SemanticResult,
  DriftLevel,
  AttestationResult,
  ShieldVerdict,
  ToolInvocationContext,
} from "./kernel-shield.js";

// Neural Attestation — runtime behavioral monitoring
export { AttestationMonitor, parseDigest } from "./neural-attestation.js";
export type {
  DriftSeverity,
  AttestationCheck,
  DriftEvent,
  AttestationConfig,
  FingerprintState,
  RefingerprintRequest,
} from "./neural-attestation.js";

// Shadow Factory — autonomous tool development
export {
  analyzeGaps,
  generateDraft,
  recordFuzzResults,
  evaluateOptimization,
  createShadowTool,
  advancePhase,
} from "./shadow-factory.js";
export type {
  ShadowPhase,
  InteractionGap,
  ReconnaissanceResult,
  ShadowDraft,
  SandboxTestResult,
  OptimizationSignal,
  ShadowToolState,
} from "./shadow-factory.js";

// Types
export type {
  ClawTalkMessage,
  ClawTalkVerb,
  ClawTalkVersion,
  ClawTalkConfig,
  ClawTalkDictionary,
  ClawTalkMacro,
  ClawTalkProposal,
  ClawTalkMetrics,
  EncodedMessage,
  IntentCategory,
  SubagentProfile,
  EscalationDecision,
  OrchestratorResult,
} from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
