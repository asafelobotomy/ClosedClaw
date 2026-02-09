/**
 * Network egress controls for ClosedClaw.
 *
 * Prevents data exfiltration by malicious skills/agents via domain-based
 * allowlist/denylist filtering. Integrates with the existing SSRF protection
 * layer in `src/infra/net/` to provide defense-in-depth.
 *
 * **Modes**:
 * - `allowlist`: Only domains on the list can be contacted (most secure)
 * - `denylist`: All domains except those on the list can be contacted
 * - `unrestricted`: No egress filtering (legacy, not recommended)
 *
 * **Evaluation order**:
 * 1. Check if domain is in the denylist (always blocked)
 * 2. Check if domain matches an allowlist pattern (wildcard support)
 * 3. Apply default policy based on mode
 *
 * @see {@link /docs/security/network-egress.md Network Egress Documentation}
 * @see {@link ../infra/net/ssrf.ts SSRF Protection Layer}
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Network egress filtering mode.
 *
 * - `allowlist`: Only traffic to allowed domains passes (default, most secure)
 * - `denylist`: Block specific domains, allow everything else
 * - `unrestricted`: No filtering (not recommended; flagged by security audit)
 */
export type EgressMode = "allowlist" | "denylist" | "unrestricted";

/**
 * Network egress policy configuration.
 */
export interface EgressPolicy {
  /** Filtering mode */
  mode: EgressMode;

  /** Domains to allow (used in allowlist mode). Supports `*.example.com` wildcards. */
  allowedDomains: string[];

  /** Domains to always block (evaluated first in all modes). */
  blockedDomains: string[];

  /** Block private/internal IP ranges (SSRF layer integration) */
  blockPrivateIPs: boolean;

  /** Log all connection attempts (allowed + denied) */
  logAllConnections: boolean;
}

/**
 * Result of evaluating a domain against the egress policy.
 */
export interface EgressCheckResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Reason for the decision */
  reason: string;

  /** The matching rule (if any) */
  matchedRule?: string;

  /** Policy mode that made the decision */
  mode: EgressMode;
}

/**
 * A single logged egress attempt.
 */
export interface EgressLogEntry {
  /** ISO timestamp */
  timestamp: string;

  /** Domain that was checked */
  domain: string;

  /** Full URL (if available) */
  url?: string;

  /** Whether the request was allowed */
  allowed: boolean;

  /** Decision reason */
  reason: string;

  /** Matched rule pattern */
  matchedRule?: string;

  /** Egress mode at time of check */
  mode: EgressMode;
}

/**
 * Custom error for egress violations.
 */
export class EgressBlockedError extends Error {
  public readonly domain: string;
  public readonly reason: string;

  constructor(domain: string, reason: string) {
    super(`Network egress blocked: ${domain} — ${reason}`);
    this.name = "EgressBlockedError";
    this.domain = domain;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Default Policy
// ---------------------------------------------------------------------------

/**
 * Default egress policy — allowlist mode with common AI provider domains.
 */
export const DEFAULT_EGRESS_POLICY: Readonly<EgressPolicy> = {
  mode: "allowlist",
  allowedDomains: [
    // AI Providers
    "*.anthropic.com",
    "*.openai.com",
    "*.googleapis.com",
    "*.deepgram.com",
    "*.minimax.io",
    "*.deepseek.com",
    "*.together.ai",

    // Dev & Collaboration
    "api.github.com",
    "*.github.com",
    "raw.githubusercontent.com",

    // Search engines (for web_search tool)
    "api.search.brave.com",
    "*.perplexity.ai",

    // Messaging channels
    "hooks.slack.com",
    "*.slack.com",
    "discord.com",
    "*.discord.com",
    "api.telegram.org",
    "*.signal.org",

    // Firecrawl (web scraping)
    "api.firecrawl.dev",

    // NPM registry (for updates)
    "registry.npmjs.org",
  ],
  blockedDomains: [],
  blockPrivateIPs: true,
  logAllConnections: true,
};

// ---------------------------------------------------------------------------
// Domain Matching
// ---------------------------------------------------------------------------

/**
 * Normalize a domain for comparison (lowercase, strip trailing dot).
 */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Check if a domain matches a pattern (supports `*.example.com` wildcards).
 *
 * Patterns:
 * - `example.com` — exact match
 * - `*.example.com` — matches any subdomain of example.com
 * - `api.example.com` — exact subdomain match
 *
 * @param domain - The domain to check (normalized)
 * @param pattern - The pattern to match against (normalized)
 * @returns True if the domain matches the pattern
 */
export function matchDomain(domain: string, pattern: string): boolean {
  const d = normalizeDomain(domain);
  const p = normalizeDomain(pattern);

  // Exact match
  if (d === p) {
    return true;
  }

  // Wildcard match: *.example.com matches sub.example.com and example.com
  if (p.startsWith("*.")) {
    const suffix = p.slice(2); // Remove "*."
    // Match exact base domain
    if (d === suffix) {
      return true;
    }
    // Match subdomains
    if (d.endsWith(`.${suffix}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a domain matches any pattern in a list.
 *
 * @param domain - The domain to check
 * @param patterns - List of domain patterns
 * @returns The first matching pattern, or null if no match
 */
export function findMatchingPattern(domain: string, patterns: readonly string[]): string | null {
  for (const pattern of patterns) {
    if (matchDomain(domain, pattern)) {
      return pattern;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a domain is allowed by the egress policy.
 *
 * Evaluation order:
 * 1. Always block domains in `blockedDomains`
 * 2. In `allowlist` mode: allow only if domain matches `allowedDomains`
 * 3. In `denylist` mode: block only if domain matches `blockedDomains` (step 1)
 * 4. In `unrestricted` mode: allow everything
 *
 * @param domain - The domain to evaluate
 * @param policy - The egress policy to apply
 * @returns Evaluation result with allow/deny decision and reason
 */
export function evaluateEgress(domain: string, policy: EgressPolicy): EgressCheckResult {
  const normalized = normalizeDomain(domain);

  if (!normalized) {
    return {
      allowed: false,
      reason: "Empty domain",
      mode: policy.mode,
    };
  }

  // Step 1: Always check blocked domains first (applies to all modes)
  const blockedMatch = findMatchingPattern(normalized, policy.blockedDomains);
  if (blockedMatch) {
    return {
      allowed: false,
      reason: "Domain is in blocked list",
      matchedRule: blockedMatch,
      mode: policy.mode,
    };
  }

  // Step 2: Apply mode-specific logic
  switch (policy.mode) {
    case "allowlist": {
      const allowMatch = findMatchingPattern(normalized, policy.allowedDomains);
      if (allowMatch) {
        return {
          allowed: true,
          reason: "Domain matches allowlist",
          matchedRule: allowMatch,
          mode: policy.mode,
        };
      }
      return {
        allowed: false,
        reason: "Domain not in allowlist",
        mode: policy.mode,
      };
    }

    case "denylist": {
      // Already checked blockedDomains above, so if we reach here it's allowed
      return {
        allowed: true,
        reason: "Domain not in denylist",
        mode: policy.mode,
      };
    }

    case "unrestricted": {
      return {
        allowed: true,
        reason: "Unrestricted mode — all domains allowed",
        mode: policy.mode,
      };
    }

    default: {
      const _exhaustive: never = policy.mode;
      return {
        allowed: false,
        reason: `Unknown egress mode: ${_exhaustive}`,
        mode: policy.mode,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Egress Guard (Integration Point)
// ---------------------------------------------------------------------------

/**
 * In-memory egress event log (circular buffer).
 * For real-time access; persisted via audit log (Priority 6).
 */
const egressLog: EgressLogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

/**
 * Record an egress check result to the in-memory log.
 */
function logEgressEvent(entry: EgressLogEntry): void {
  egressLog.push(entry);
  if (egressLog.length > MAX_LOG_ENTRIES) {
    egressLog.shift();
  }
}

/**
 * Get recent egress log entries.
 *
 * @param limit - Maximum entries to return (default: 100)
 * @returns Recent egress log entries (newest first)
 */
export function getEgressLog(limit = 100): readonly EgressLogEntry[] {
  return egressLog.slice(-limit).reverse();
}

/**
 * Clear the egress log (for testing).
 */
export function clearEgressLog(): void {
  egressLog.length = 0;
}

/**
 * Check if an outbound request is allowed and log the attempt.
 *
 * This is the primary integration point. Call this before making any
 * outbound HTTP request from agent tools, skills, or plugins.
 *
 * @param url - The URL being accessed
 * @param policy - The egress policy to apply
 * @returns The check result
 * @throws {EgressBlockedError} If the request is blocked
 */
export function enforceEgress(url: string, policy: EgressPolicy): EgressCheckResult {
  let domain: string;
  try {
    const parsed = new URL(url);
    domain = parsed.hostname;
  } catch {
    throw new EgressBlockedError("(invalid)", `Invalid URL: ${url}`);
  }

  const result = evaluateEgress(domain, policy);

  // Log if configured
  if (policy.logAllConnections || !result.allowed) {
    logEgressEvent({
      timestamp: new Date().toISOString(),
      domain,
      url,
      allowed: result.allowed,
      reason: result.reason,
      matchedRule: result.matchedRule,
      mode: result.mode,
    });
  }

  if (!result.allowed) {
    throw new EgressBlockedError(domain, result.reason);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Policy Persistence
// ---------------------------------------------------------------------------

/**
 * Get the path to the egress policy file.
 */
export function getEgressPolicyPath(stateDir?: string): string {
  const dir = stateDir ?? path.join(os.homedir(), ".closedclaw");
  return path.join(dir, "egress-policy.json");
}

/**
 * Load egress policy from disk, falling back to defaults.
 */
export async function loadEgressPolicy(stateDir?: string): Promise<EgressPolicy> {
  const policyPath = getEgressPolicyPath(stateDir);
  try {
    const raw = await fs.readFile(policyPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<EgressPolicy>;
    return {
      mode: parsed.mode ?? DEFAULT_EGRESS_POLICY.mode,
      allowedDomains: parsed.allowedDomains ?? [...DEFAULT_EGRESS_POLICY.allowedDomains],
      blockedDomains: parsed.blockedDomains ?? [...DEFAULT_EGRESS_POLICY.blockedDomains],
      blockPrivateIPs: parsed.blockPrivateIPs ?? DEFAULT_EGRESS_POLICY.blockPrivateIPs,
      logAllConnections: parsed.logAllConnections ?? DEFAULT_EGRESS_POLICY.logAllConnections,
    };
  } catch {
    return { ...DEFAULT_EGRESS_POLICY, allowedDomains: [...DEFAULT_EGRESS_POLICY.allowedDomains] };
  }
}

/**
 * Save egress policy to disk.
 */
export async function saveEgressPolicy(policy: EgressPolicy, stateDir?: string): Promise<void> {
  const policyPath = getEgressPolicyPath(stateDir);
  const dir = path.dirname(policyPath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(policyPath, JSON.stringify(policy, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

// ---------------------------------------------------------------------------
// Policy Helpers
// ---------------------------------------------------------------------------

/**
 * Add a domain to the allowlist.
 */
export function addAllowedDomain(policy: EgressPolicy, domain: string): EgressPolicy {
  const normalized = normalizeDomain(domain);
  if (policy.allowedDomains.some((d) => normalizeDomain(d) === normalized)) {
    return policy; // Already present
  }
  return {
    ...policy,
    allowedDomains: [...policy.allowedDomains, domain],
  };
}

/**
 * Remove a domain from the allowlist.
 */
export function removeAllowedDomain(policy: EgressPolicy, domain: string): EgressPolicy {
  const normalized = normalizeDomain(domain);
  return {
    ...policy,
    allowedDomains: policy.allowedDomains.filter((d) => normalizeDomain(d) !== normalized),
  };
}

/**
 * Add a domain to the blocklist.
 */
export function addBlockedDomain(policy: EgressPolicy, domain: string): EgressPolicy {
  const normalized = normalizeDomain(domain);
  if (policy.blockedDomains.some((d) => normalizeDomain(d) === normalized)) {
    return policy; // Already present
  }
  return {
    ...policy,
    blockedDomains: [...policy.blockedDomains, domain],
  };
}

/**
 * Remove a domain from the blocklist.
 */
export function removeBlockedDomain(policy: EgressPolicy, domain: string): EgressPolicy {
  const normalized = normalizeDomain(domain);
  return {
    ...policy,
    blockedDomains: policy.blockedDomains.filter((d) => normalizeDomain(d) !== normalized),
  };
}

/**
 * Get a summary of the current egress policy for display.
 */
export function summarizePolicy(policy: EgressPolicy): {
  mode: EgressMode;
  allowedCount: number;
  blockedCount: number;
  blockPrivateIPs: boolean;
  logging: boolean;
} {
  return {
    mode: policy.mode,
    allowedCount: policy.allowedDomains.length,
    blockedCount: policy.blockedDomains.length,
    blockPrivateIPs: policy.blockPrivateIPs,
    logging: policy.logAllConnections,
  };
}
