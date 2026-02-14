/**
 * ClawTalk — Inter-Agent Communication Protocol
 *
 * Public API for the ClawTalk protocol system.
 * See docs/concepts/clawtalk.md for the full specification.
 */

// Core protocol
export { parse, serialize, isClawTalkMessage, ClawTalkParseError } from "./parser.js";
export { encode, estimateTokens } from "./encoder.js";

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

// ClawTalk Hook — before_agent_start integration
export {
  clawtalkBeforeAgentStartHandler,
  clawtalkMessageSendingHandler,
  routeMessage as clawtalkRouteMessage,
  stripClawTalkArtifacts,
  updateClawTalkHookConfig,
  getClawTalkDirectory,
  getClawTalkTpcRuntime,
  initClawTalkTpc,
  shutdownClawTalkTpc,
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
  EncodedMessage,
  IntentCategory,
  SubagentProfile,
  EscalationDecision,
} from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";

// TPC (Tonal Pulse Communication) — default agent-to-agent transport
export {
  TPCRuntime,
  TPCSecurityError,
  TPCNotInitializedError,
} from "./tpc/index.js";
export type {
  TPCConfig,
  TPCEncodeResult,
  TPCDecodeResult,
  TPCAuditEvent,
  TPCEnvelope,
  SignedTPCEnvelope,
} from "./tpc/index.js";
export { rsEncode, rsDecode, ReedSolomonError } from "./tpc/reed-solomon.js";
export { encodeToWav, estimateWavSize } from "./tpc/waveform-encoder.js";
export { decodeFromWav, WaveformDecodeError } from "./tpc/waveform-decoder.js";
export { NonceStore } from "./tpc/nonce-store.js";
export { DeadDropManager } from "./tpc/dead-drop.js";
export { selectProfile, checkAudioDevices, getAFSKParamsForMode, invalidateCache } from "./tpc/profile-selector.js";
export { ULTRASONIC_AFSK_PARAMS } from "./tpc/types.js";
export { CircuitBreaker } from "./tpc/circuit-breaker.js";
export { KeyRotationManager } from "./tpc/key-rotation.js";
export { RateLimiter } from "./tpc/rate-limiter.js";
export { AuditLogger } from "./tpc/audit-logger.js";
