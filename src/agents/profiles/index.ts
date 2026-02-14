/**
 * Agent Profiles — Profile loading, registration, and resolution
 *
 * Re-exports all profile types and the registry API.
 *
 * @module agents/profiles
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  AgentProfile,
  AgentFinding,
  FindingSeverity,
  FindingCategory,
  EffortEstimate,
  ProfileToolAccess,
  ProfileSchedule,
  ProfileRegistryConfig,
  ProfileRegistrySnapshot,
  ProfileLoadError,
} from "./types.js";

export { DEVOPS_SCHEDULES, SEVERITY_ORDER } from "./types.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

export {
  parseProfileMarkdown,
  parseSimpleYaml,
  templateToProfile,
  builtinProfiles,
  fileToProfile,
  mergeWithTemplate,
  loadProfileRegistry,
  resolveProfile,
  findProfilesByCapability,
  validateProfile,
} from "./registry.js";
