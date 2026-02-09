/**
 * Tests for network egress controls.
 *
 * @see {@link ../network-egress.ts}
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, _vi } from "vitest";
import {
  normalizeDomain,
  matchDomain,
  findMatchingPattern,
  evaluateEgress,
  enforceEgress,
  getEgressLog,
  clearEgressLog,
  DEFAULT_EGRESS_POLICY,
  EgressBlockedError,
  loadEgressPolicy,
  saveEgressPolicy,
  addAllowedDomain,
  removeAllowedDomain,
  addBlockedDomain,
  removeBlockedDomain,
  summarizePolicy,
  type EgressPolicy,
} from "./network-egress.js";

// ---------------------------------------------------------------------------
// normalizeDomain
// ---------------------------------------------------------------------------

describe("normalizeDomain", () => {
  it("lowercases the domain", () => {
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com");
  });

  it("strips trailing dot", () => {
    expect(normalizeDomain("example.com.")).toBe("example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
  });

  it("handles already-normalized domains", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
  });

  it("handles empty string", () => {
    expect(normalizeDomain("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// matchDomain
// ---------------------------------------------------------------------------

describe("matchDomain", () => {
  it("matches exact domain", () => {
    expect(matchDomain("example.com", "example.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(matchDomain("Example.COM", "example.com")).toBe(true);
  });

  it("rejects non-matching domain", () => {
    expect(matchDomain("evil.com", "example.com")).toBe(false);
  });

  it("matches wildcard subdomain", () => {
    expect(matchDomain("api.example.com", "*.example.com")).toBe(true);
  });

  it("matches nested wildcard subdomain", () => {
    expect(matchDomain("sub.api.example.com", "*.example.com")).toBe(true);
  });

  it("matches base domain with wildcard", () => {
    expect(matchDomain("example.com", "*.example.com")).toBe(true);
  });

  it("rejects partial domain match with wildcard", () => {
    expect(matchDomain("notexample.com", "*.example.com")).toBe(false);
  });

  it("rejects different TLD", () => {
    expect(matchDomain("example.org", "*.example.com")).toBe(false);
  });

  it("matches exact subdomain pattern", () => {
    expect(matchDomain("api.github.com", "api.github.com")).toBe(true);
  });

  it("rejects when subdomain doesn't match exact pattern", () => {
    expect(matchDomain("www.github.com", "api.github.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findMatchingPattern
// ---------------------------------------------------------------------------

describe("findMatchingPattern", () => {
  const patterns = ["*.anthropic.com", "api.github.com", "*.openai.com"];

  it("finds matching wildcard pattern", () => {
    expect(findMatchingPattern("api.anthropic.com", patterns)).toBe("*.anthropic.com");
  });

  it("finds matching exact pattern", () => {
    expect(findMatchingPattern("api.github.com", patterns)).toBe("api.github.com");
  });

  it("returns null for no match", () => {
    expect(findMatchingPattern("evil.com", patterns)).toBeNull();
  });

  it("returns first matching pattern", () => {
    const overlapping = ["*.com", "*.anthropic.com"];
    expect(findMatchingPattern("api.anthropic.com", overlapping)).toBe("*.com");
  });

  it("handles empty pattern list", () => {
    expect(findMatchingPattern("example.com", [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// evaluateEgress
// ---------------------------------------------------------------------------

describe("evaluateEgress", () => {
  describe("allowlist mode", () => {
    const policy: EgressPolicy = {
      mode: "allowlist",
      allowedDomains: ["*.anthropic.com", "api.github.com"],
      blockedDomains: ["evil.anthropic.com"],
      blockPrivateIPs: true,
      logAllConnections: true,
    };

    it("allows domains in the allowlist", () => {
      const result = evaluateEgress("api.anthropic.com", policy);
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBe("*.anthropic.com");
      expect(result.mode).toBe("allowlist");
    });

    it("blocks domains not in the allowlist", () => {
      const result = evaluateEgress("evil.com", policy);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in allowlist");
    });

    it("blocked domains take priority over allowlist", () => {
      const result = evaluateEgress("evil.anthropic.com", policy);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked list");
      expect(result.matchedRule).toBe("evil.anthropic.com");
    });

    it("rejects empty domain", () => {
      const result = evaluateEgress("", policy);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Empty domain");
    });
  });

  describe("denylist mode", () => {
    const policy: EgressPolicy = {
      mode: "denylist",
      allowedDomains: [],
      blockedDomains: ["*.evil.com", "malware.org"],
      blockPrivateIPs: true,
      logAllConnections: true,
    };

    it("allows domains not in the denylist", () => {
      const result = evaluateEgress("example.com", policy);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("not in denylist");
    });

    it("blocks domains in the denylist", () => {
      const result = evaluateEgress("sub.evil.com", policy);
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("*.evil.com");
    });

    it("blocks exact match in denylist", () => {
      const result = evaluateEgress("malware.org", policy);
      expect(result.allowed).toBe(false);
    });
  });

  describe("unrestricted mode", () => {
    const policy: EgressPolicy = {
      mode: "unrestricted",
      allowedDomains: [],
      blockedDomains: ["absolutely-blocked.com"],
      blockPrivateIPs: false,
      logAllConnections: false,
    };

    it("allows all domains", () => {
      const result = evaluateEgress("anything.com", policy);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("Unrestricted");
    });

    it("still honors blocked domains", () => {
      const result = evaluateEgress("absolutely-blocked.com", policy);
      expect(result.allowed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// enforceEgress
// ---------------------------------------------------------------------------

describe("enforceEgress", () => {
  beforeEach(() => clearEgressLog());

  const policy: EgressPolicy = {
    mode: "allowlist",
    allowedDomains: ["*.anthropic.com"],
    blockedDomains: [],
    blockPrivateIPs: true,
    logAllConnections: true,
  };

  it("allows valid URLs matching allowlist", () => {
    const result = enforceEgress("https://api.anthropic.com/v1/messages", policy);
    expect(result.allowed).toBe(true);
  });

  it("throws EgressBlockedError for blocked URLs", () => {
    expect(() => enforceEgress("https://evil.com/exfil", policy)).toThrow(EgressBlockedError);
  });

  it("throws for invalid URLs", () => {
    expect(() => enforceEgress("not-a-url", policy)).toThrow(EgressBlockedError);
  });

  it("logs allowed requests", () => {
    enforceEgress("https://api.anthropic.com/v1/messages", policy);
    const log = getEgressLog();
    expect(log.length).toBe(1);
    expect(log[0].allowed).toBe(true);
    expect(log[0].domain).toBe("api.anthropic.com");
  });

  it("logs blocked requests", () => {
    try {
      enforceEgress("https://evil.com/exfil", policy);
    } catch {
      // Expected
    }
    const log = getEgressLog();
    expect(log.length).toBe(1);
    expect(log[0].allowed).toBe(false);
    expect(log[0].domain).toBe("evil.com");
  });

  it("includes URL in log entries", () => {
    enforceEgress("https://api.anthropic.com/v1/messages", policy);
    const log = getEgressLog();
    expect(log[0].url).toBe("https://api.anthropic.com/v1/messages");
  });
});

// ---------------------------------------------------------------------------
// getEgressLog / clearEgressLog
// ---------------------------------------------------------------------------

describe("egressLog", () => {
  beforeEach(() => clearEgressLog());

  it("returns empty log initially", () => {
    expect(getEgressLog()).toHaveLength(0);
  });

  it("returns entries in reverse order (newest first)", () => {
    const policy: EgressPolicy = { ...DEFAULT_EGRESS_POLICY };
    enforceEgress("https://api.anthropic.com/v1", policy);
    enforceEgress("https://api.openai.com/v1", policy);
    const log = getEgressLog();
    expect(log.length).toBe(2);
    expect(log[0].domain).toBe("api.openai.com");
    expect(log[1].domain).toBe("api.anthropic.com");
  });

  it("respects limit parameter", () => {
    const policy: EgressPolicy = { ...DEFAULT_EGRESS_POLICY };
    enforceEgress("https://api.anthropic.com/v1", policy);
    enforceEgress("https://api.openai.com/v1", policy);
    enforceEgress("https://api.github.com/repos", policy);
    expect(getEgressLog(2).length).toBe(2);
  });

  it("clears log correctly", () => {
    const policy: EgressPolicy = { ...DEFAULT_EGRESS_POLICY };
    enforceEgress("https://api.anthropic.com/v1", policy);
    clearEgressLog();
    expect(getEgressLog()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Policy Persistence
// ---------------------------------------------------------------------------

describe("policy persistence", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "egress-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads default policy when file doesn't exist", async () => {
    const policy = await loadEgressPolicy(tmpDir);
    expect(policy.mode).toBe("allowlist");
    expect(policy.allowedDomains.length).toBeGreaterThan(0);
  });

  it("saves and loads policy round-trip", async () => {
    const policy: EgressPolicy = {
      mode: "denylist",
      allowedDomains: [],
      blockedDomains: ["evil.com"],
      blockPrivateIPs: false,
      logAllConnections: false,
    };
    await saveEgressPolicy(policy, tmpDir);
    const loaded = await loadEgressPolicy(tmpDir);
    expect(loaded.mode).toBe("denylist");
    expect(loaded.blockedDomains).toEqual(["evil.com"]);
    expect(loaded.blockPrivateIPs).toBe(false);
  });

  it("recovers from corrupt file", async () => {
    const policyPath = path.join(tmpDir, "egress-policy.json");
    await fs.writeFile(policyPath, "NOT JSON");
    const policy = await loadEgressPolicy(tmpDir);
    expect(policy.mode).toBe("allowlist"); // Default
  });
});

// ---------------------------------------------------------------------------
// Policy helpers
// ---------------------------------------------------------------------------

describe("policy helpers", () => {
  it("addAllowedDomain adds a new domain", () => {
    const policy = addAllowedDomain(DEFAULT_EGRESS_POLICY as EgressPolicy, "new.example.com");
    expect(policy.allowedDomains).toContain("new.example.com");
  });

  it("addAllowedDomain is idempotent", () => {
    const base: EgressPolicy = {
      ...DEFAULT_EGRESS_POLICY,
      allowedDomains: [...DEFAULT_EGRESS_POLICY.allowedDomains],
    };
    const p1 = addAllowedDomain(base, "api.github.com");
    expect(p1.allowedDomains.filter((d) => d === "api.github.com").length).toBe(1);
  });

  it("removeAllowedDomain removes matching domain", () => {
    const base: EgressPolicy = {
      ...DEFAULT_EGRESS_POLICY,
      allowedDomains: ["example.com", "other.com"],
    };
    const result = removeAllowedDomain(base, "example.com");
    expect(result.allowedDomains).toEqual(["other.com"]);
  });

  it("addBlockedDomain adds a domain", () => {
    const base: EgressPolicy = { ...DEFAULT_EGRESS_POLICY, blockedDomains: [] };
    const result = addBlockedDomain(base, "evil.com");
    expect(result.blockedDomains).toContain("evil.com");
  });

  it("removeBlockedDomain removes a domain", () => {
    const base: EgressPolicy = { ...DEFAULT_EGRESS_POLICY, blockedDomains: ["evil.com"] };
    const result = removeBlockedDomain(base, "evil.com");
    expect(result.blockedDomains).toHaveLength(0);
  });

  it("summarizePolicy returns correct summary", () => {
    const summary = summarizePolicy(DEFAULT_EGRESS_POLICY as EgressPolicy);
    expect(summary.mode).toBe("allowlist");
    expect(summary.allowedCount).toBeGreaterThan(0);
    expect(summary.blockedCount).toBe(0);
    expect(summary.blockPrivateIPs).toBe(true);
    expect(summary.logging).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_EGRESS_POLICY
// ---------------------------------------------------------------------------

describe("DEFAULT_EGRESS_POLICY", () => {
  it("uses allowlist mode", () => {
    expect(DEFAULT_EGRESS_POLICY.mode).toBe("allowlist");
  });

  it("includes AI provider domains", () => {
    const result = evaluateEgress("api.anthropic.com", DEFAULT_EGRESS_POLICY as EgressPolicy);
    expect(result.allowed).toBe(true);
  });

  it("includes GitHub", () => {
    const result = evaluateEgress("api.github.com", DEFAULT_EGRESS_POLICY as EgressPolicy);
    expect(result.allowed).toBe(true);
  });

  it("blocks unknown domains by default", () => {
    const result = evaluateEgress("unknown-domain.xyz", DEFAULT_EGRESS_POLICY as EgressPolicy);
    expect(result.allowed).toBe(false);
  });

  it("blocks private IPs", () => {
    expect(DEFAULT_EGRESS_POLICY.blockPrivateIPs).toBe(true);
  });

  it("logs all connections", () => {
    expect(DEFAULT_EGRESS_POLICY.logAllConnections).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EgressBlockedError
// ---------------------------------------------------------------------------

describe("EgressBlockedError", () => {
  it("includes domain and reason", () => {
    const err = new EgressBlockedError("evil.com", "Domain not in allowlist");
    expect(err.domain).toBe("evil.com");
    expect(err.reason).toBe("Domain not in allowlist");
    expect(err.name).toBe("EgressBlockedError");
    expect(err.message).toContain("evil.com");
    expect(err.message).toContain("Domain not in allowlist");
  });
});
