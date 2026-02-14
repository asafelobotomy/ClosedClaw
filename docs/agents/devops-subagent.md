# DevOps Subagent Usage Guide

The DevOps subagent is a specialized AI agent that audits, maintains, and improves ClosedClaw itself. It's part of ClosedClaw's **meta-development** capability: using the AI to build and maintain the AI.

## Quick Start

### Basic Audit

```bash
# From Gateway (if running)
# In any chat channel, spawn the DevOps subagent:
/subagent devops Audit src/security/ for vulnerabilities. Check encryption implementation, passphrase validation, and file permissions.
```

Or programmatically:

```typescript
import { spawnSubagent } from "./agents/subagent-spawn";

const result = await spawnSubagent({
  agentId: "devops",
  task: `Audit src/security/ for security vulnerabilities:
    - Check for hardcoded secrets or weak crypto parameters
    - Validate input sanitization
    - Review error handling for information leakage
    - Test coverage for edge cases`,
  model: "claude-opus-4.5", // Premium model for thorough analysis
  runTimeoutSeconds: 600, // 10 minutes for complex audit
});

console.log(result.transcript);
```

## Common Use Cases

### 1. Security Audit

**Task**: Check code for security vulnerabilities

```typescript
const task = `Security audit of src/security/encrypted-store.ts:
- Verify file permissions are set correctly (0o600)
- Check for race conditions in atomic writes
- Validate encryption key derivation parameters
- Review error handling for information disclosure
- Test coverage for failure modes`;
```

**Expected output**: Prioritized list of security findings with severity ratings

### 2. Code Quality Scan

**Task**: Find maintainability issues

```typescript
const task = `Code quality analysis of src/agents/:
- Detect duplicated code patterns
- Find magic strings that should be constants
- Identify functions exceeding 50-100 LOC
- Check for missing error handling
- Locate 'any' types without justification`;
```

**Expected output**: Refactoring recommendations with effort estimates

### 3. Performance Profiling

**Task**: Identify bottlenecks

```typescript
const task = `Performance analysis of message handling pipeline:
- Trace flow from channel → routing → session → agent → response
- Identify synchronous bottlenecks (blocking I/O, sequential await chains)
- Find unnecessary work (duplicate parsing, redundant API calls)
- Suggest optimizations (caching, parallelization, lazy loading)
- Estimate % speedup for each optimization`;
```

**Expected output**: Ranked optimization opportunities with expected impact

### 4. Breaking Change Detection

**Task**: Compare versions for API changes

```typescript
const task = `Compare current branch with v2026.2.1:
1. Run git diff to list changed files
2. Parse TypeScript exports (public API surface)
3. Detect removed/modified public functions, types, constants
4. Generate migration guide for users`;
```

**Expected output**: Breaking changes report with migration instructions

### 5. Documentation Review

**Task**: Find outdated or missing docs

```typescript
const task = `Documentation audit for src/gateway/:
- Check for outdated comments (contradict current code)
- Find public functions missing JSDoc
- Verify README examples are runnable
- Flag broken markdown links
- Suggest improvements for clarity`;
```

**Expected output**: Documentation issues with proposed fixes

## Configuration

### Agent Profile Location

`~/.closedclaw/agents/devops.md`

You can customize the DevOps agent's behavior by editing this file:

- Add domain-specific security checks
- Adjust severity thresholds
- Include company-specific coding standards
- Add custom analysis protocols

### Config File Setup

Add to `~/.closedclaw/config.json5`:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        model: "claude-sonnet-4.5",
        // ... main agent config
      },
      {
        id: "devops",
        model: "claude-opus-4", // Use Opus for thorough analysis
        description: "Internal DevOps specialist for code audits and maintenance",
        workspace: "~/.closedclaw/agents",
        tools: {
          // DevOps agent needs these tools:
          allow: [
            "read", // Read source code
            "exec", // Run build/test commands
            "grep_search", // Pattern search
            "semantic_search", // Conceptual search
            "list_code_usages", // Track API usage
          ],
        },
        sandbox: {
          mode: "all", // Sandbox all execution for safety
        },
      },
    ],
  },
}
```

### Continuous Monitoring (Cron)

Set up automated audits:

```json5
{
  cron: {
    jobs: [
      {
        id: "daily-security-audit",
        schedule: "0 2 * * *", // 2am daily
        agentId: "devops",
        task: "Run security audit on src/security/. Report only critical/high findings.",
        announceTarget: {
          channel: "telegram",
          peer: "your-id",
        },
      },
      {
        id: "weekly-code-quality",
        schedule: "0 10 * * 1", // 10am Mondays
        agentId: "devops",
        task: "Code quality scan: find duplicated code, magic strings, untested paths. Prioritize top 5 issues.",
      },
      {
        id: "monthly-dependency-audit",
        schedule: "0 9 1 * *", // 9am 1st of month
        agentId: "devops",
        task: "Run 'pnpm audit' and 'pnpm outdated'. Flag security vulnerabilities. Prioritize patches.",
      },
    ],
  },
}
```

## Output Format

The DevOps agent outputs findings in this structure:

```
Severity: Critical | High | Medium | Low
Category: Security | Performance | Maintainability | Documentation | Testing
Location: src/path/file.ts:123
Issue: <Specific problem description with evidence>
Recommendation: <Concrete fix with code examples>
Effort: Trivial (<1hr) | Moderate (1-4hr) | Significant (>4hr)
Priority: Immediate | This Week | This Month | Backlog
```

### Severity Definitions

- **Critical**: Security vulnerability, data loss risk, production blocker
- **High**: Significant security concern, major bug, severe performance issue
- **Medium**: Code smell, maintainability issue, minor bug
- **Low**: Nice-to-have improvement, style inconsistency, documentation gap

### Priority Definitions

- **Immediate**: Fix before next release
- **This Week**: Important but not blocking
- **This Month**: Technical debt, refactoring
- **Backlog**: Future improvement, low impact

## Examples

### Example 1: Audit Encryption Code

**Task:**

```
Audit Priority 3 encryption implementation (src/security/crypto.ts, passphrase.ts, encrypted-store.ts):
- Verify XChaCha20-Poly1305 implementation correctness
- Check Argon2id parameters against OWASP guidelines
- Review passphrase validation strength requirements
- Test atomic write operations for race conditions
- Validate error handling doesn't leak sensitive info
- Check test coverage for edge cases
```

**Expected Findings:**

```
✅ Summary: 0 critical, 2 high, 5 medium, 3 low

HIGH #1: src/security/encrypted-store.ts:78
Severity: High
Category: Security
Issue: atomicWrite() sets permissions after file creation (race condition)
Recommendation: Use fs.writeFile mode option
Effort: Trivial (5 lines)
Priority: This Week

MEDIUM #1: src/security/crypto.ts:89
Severity: Medium
Category: Documentation
Issue: deriveKey() lacks JSDoc explaining salt generation
Recommendation: Add JSDoc with @param and @returns
Effort: Trivial (10 minutes)
Priority: This Month
```

### Example 2: Find TODO Comments

**Task:**

```
Find all TODO/FIXME/HACK comments in src/. Categorize by:
1. Critical (in security-sensitive code, blocks features)
2. Important (user-facing, affects reliability)
3. Nice-to-have (tech debt, optimizations)
Estimate effort for each.
```

**Expected Output:**

```
Found 47 TODO comments:

CRITICAL (3):
- src/security/audit.ts:45: "TODO: Implement rate limiting on audit log writes"
  Effort: Moderate (2-3hr), Priority: This Week

IMPORTANT (12):
- src/agents/tools.ts:123: "FIXME: Handle timeout edge case in tool execution"
  Effort: Moderate (1hr), Priority: This Month

NICE-TO-HAVE (32):
- src/utils.ts:567: "TODO: Cache compiled regexes for performance"
  Effort: Trivial (30min), Priority: Backlog
```

## Best Practices

### 1. Be Specific in Task Description

❌ Bad: "Check the security"
✅ Good: "Audit src/auth/ for: input validation, SQL injection, XSS, CSRF, session fixation"

### 2. Provide Context

Include relevant background:

```
Audit src/gateway/ws-handler.ts.
Context: We recently added rate limiting (commit abc123).
Focus: Verify rate limit can't be bypassed, check for DoS vulnerabilities.
```

### 3. Set Realistic Timeouts

- Simple file review: 300s (5 min)
- Module audit: 600s (10 min)
- Full security scan: 1800s (30 min)

### 4. Review Agent Transcripts

DevOps agent saves full analysis in `~/.closedclaw/sessions/agent:devops:subagent:*.json`

Review transcripts to:

- Understand reasoning behind findings
- Check if agent missed anything
- Improve future task descriptions

### 5. Iterate on Findings

After DevOps agent reports issues:

1. Fix critical/high severity first
2. Re-run audit to verify fixes
3. Track medium/low issues in backlog
4. Update agent profile if false positives occur

## Troubleshooting

### Agent Doesn't Find Issues

**Possible causes:**

- Task too vague (be more specific about what to check)
- Timeout too short (complex analysis needs more time)
- Wrong model (use Opus for thorough audits, not Haiku)

**Fix:** Refine task description, increase timeout, use premium model

### Too Many False Positives

**Possible causes:**

- Agent doesn't understand project conventions
- Overly strict standards in agent profile

**Fix:** Update `~/.closedclaw/agents/devops.md` to clarify standards

### Agent Can't Access Code

**Possible causes:**

- Sandbox restrictions too tight
- Missing tool permissions

**Fix:** Check `agents.list[id=devops].tools.allow` includes `read`, `grep_search`

## Advanced Usage

### Multi-Stage Analysis

Chain subagent calls for comprehensive review:

```typescript
// Stage 1: Security audit
const securityFindings = await spawnSubagent({
  agentId: "devops",
  task: "Security audit of src/security/*",
});

// Stage 2: Fix critical issues (human or coder subagent)
// ...

// Stage 3: Verify fixes
const verifyFindings = await spawnSubagent({
  agentId: "devops",
  task: "Re-audit src/security/* to verify fixes applied correctly",
});
```

### Collaborative Agents

DevOps spots issues, Coder fixes them:

```typescript
// DevOps audits
const issues = await spawnSubagent({
  agentId: "devops",
  task: "Find all magic strings in src/agents/",
});

// Coder refactors
const fixes = await spawnSubagent({
  agentId: "coder",
  task: `Fix issues found by DevOps: ${issues.summary}. Move magic strings to src/constants/.`,
});

// DevOps verifies
const verification = await spawnSubagent({
  agentId: "devops",
  task: "Verify magic strings were moved to constants",
});
```

### Custom Analysis Scripts

Create reusable audit scripts:

```bash
#!/bin/bash
# audit-security.sh - Run comprehensive security audit

closedclaw subagent devops "
Full security audit:
1. Scan for hardcoded secrets (API keys, passwords, tokens)
2. Check crypto implementations (algorithms, key lengths, IVs)
3. Validate input sanitization (SQL injection, XSS, path traversal)
4. Review authentication logic (timing attacks, session fixation)
5. Test authorization (privilege escalation, RBAC correctness)
6. Audit dependencies for CVEs (pnpm audit)

Report only Critical and High severity findings.
"
```

## Future Enhancements

Planned improvements for DevOps subagent:

- **Automated fix application**: DevOps generates PR with fixes
- **Diff analysis**: Compare before/after to verify improvements
- **Metrics tracking**: Chart code quality trends over time
- **Integration with CI/CD**: Run audits on every commit
- **Custom rule engine**: Define project-specific checks
- **Machine learning**: Learn from past false positives

---

**The DevOps subagent represents ClosedClaw's vision: AI that maintains itself. As you use it, the system becomes self-aware of its own code quality and security posture.** 🤖🔧
