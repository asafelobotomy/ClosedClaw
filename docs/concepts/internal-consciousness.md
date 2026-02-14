# Internal Consciousness: Self-Interrogating Security Agent

## Overview

Internal consciousness is the capability for ClosedClaw to autonomously examine its own security posture, reason about vulnerabilities in context, research fixes, evaluate trade-offs, and propose implementation strategies tailored to the specific deployment.

Unlike static security audit checks (which ClosedClaw already has), internal consciousness is an LLM-powered reasoning loop that **thinks** about security rather than just scanning for known patterns.

## Core Questions the System Answers

1. **"What security holes can I discover?"** — Active probing beyond checklist scanning
2. **"What fixes are available?"** — Research-backed remediation with external knowledge
3. **"Can I create my own fix or make security more robust?"** — Patch generation capability
4. **"What are the trade-offs?"** — Risk/effort/impact analysis per finding
5. **"How would these fixes be best implemented into MY systems?"** — Context-aware implementation planning

## Existing Infrastructure

| Component             | Status     | Location                                                                      |
| --------------------- | ---------- | ----------------------------------------------------------------------------- |
| Security audit engine | Built      | `src/security/audit.ts`, `src/security/audit-extra.ts` — ~40 check categories |
| Subagent spawn system | Built      | `src/agents/tools/sessions-spawn-tool.ts`                                     |
| Cron scheduling       | Built      | `src/agents/tools/cron-tool.ts`                                               |
| DevOps agent template | Built      | `src/agents/squad/templates.ts` — devops profile                              |
| DevOps usage guide    | Documented | `docs/agents/devops-subagent.md`                                              |
| Hook observation      | Built      | Plugin hooks: `before_tool_call`, `after_tool_call`, `agent_end`              |
| Memory persistence    | Built      | `extensions/memory-core/`, `extensions/memory-lancedb/`                       |

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Trigger Layer                            │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐            │
│  │ Cron     │  │ Manual   │  │ Hook-triggered │            │
│  │ Schedule │  │ /secaudit│  │ (config change,│            │
│  │ (daily/  │  │ command  │  │  new plugin,   │            │
│  │  weekly) │  │          │  │  deploy event) │            │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘            │
│       │              │               │                      │
│       └──────────────┼───────────────┘                      │
│                      ▼                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│              Security Consciousness Agent                   │
│              (spawned as subagent)                          │
│                                                            │
│  Phase 1: Discovery                                        │
│  ├─ Run `closedclaw security audit --json`                 │
│  ├─ Scan config for non-obvious risks                      │
│  ├─ Check file permissions, network exposure               │
│  └─ Analyze tool policies and sandbox config               │
│                                                            │
│  Phase 2: Research                                         │
│  ├─ Cross-reference findings with CVE databases            │
│  ├─ Check upstream OpenClaw for patches                    │
│  ├─ Search for known exploits matching findings            │
│  └─ Review dependency advisories (npm audit)               │
│                                                            │
│  Phase 3: Reasoning                                        │
│  ├─ Rank findings by risk × exploitability × impact        │
│  ├─ Identify cascading vulnerabilities                     │
│  ├─ Map findings to specific deployment context            │
│  └─ Evaluate whether findings are false positives          │
│                                                            │
│  Phase 4: Remediation Planning                             │
│  ├─ Generate fix proposals (config changes, code patches)  │
│  ├─ Estimate effort and disruption per fix                 │
│  ├─ Identify trade-offs (security vs usability)            │
│  └─ Produce prioritized action plan                        │
│                                                            │
│  Phase 5: Reporting                                        │
│  ├─ Write findings to memory store (trend tracking)        │
│  ├─ Announce summary to operator channel                   │
│  └─ Optionally generate patch files for review             │
│                                                            │
└────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│                    Memory Layer                             │
│                                                            │
│  Persistent store of:                                      │
│  ├─ Historical audit results (timestamped)                 │
│  ├─ Finding lifecycle (new → acknowledged → fixed)         │
│  ├─ False positive annotations                             │
│  └─ Trend data (findings over time, fix velocity)          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Agent Configuration

```json5
// ~/.closedclaw/config.json5
{
  agents: {
    list: {
      security: {
        model: { primary: "anthropic/claude-opus-4", fallbacks: ["openai/gpt-5"] },
        systemPrompt: "You are a security analyst for this ClosedClaw deployment...",
        tools: {
          profile: "full",
          allow: ["exec", "web_search", "web_fetch", "memory_search", "memory_write"],
          deny: ["message", "sessions_spawn"], // no outbound messages, no recursive spawning
        },
        sandbox: { mode: "all", workspaceAccess: "ro" }, // read-only access to source
      },
    },
  },
}
```

### System Prompt Template

```
You are a security analyst for this ClosedClaw instance.

## Your Mission
Perform a comprehensive security assessment of this deployment. Think like an attacker, then think like a defender.

## Available Actions
1. Run `closedclaw security audit --json` for the baseline scan
2. Use `exec` to inspect file permissions, network config, running processes
3. Use `web_search` to research CVEs and known exploits for findings
4. Use `memory_search` to review prior audit results and track trends

## Analysis Framework
For each finding:
- **Severity**: How bad is this if exploited?
- **Exploitability**: How easy is it to exploit in THIS deployment?
- **Blast radius**: What else breaks if this is compromised?
- **Fix complexity**: How hard/disruptive is the fix?
- **Trade-offs**: What functionality is lost by fixing this?

## Output Format
Produce a structured report:
1. Executive summary (1-2 sentences)
2. Critical findings requiring immediate action
3. Recommended improvements with effort estimates
4. Trend analysis (if prior audit data exists in memory)
5. Specific fix proposals (config snippets or code patches)

## Constraints
- Read-only access to the codebase
- Do not send messages to external channels
- Do not modify any files — propose changes only
- Store findings in memory for historical tracking
```

## Scheduling Patterns

```json5
// Automated via cron tool
{
  tools: {
    cron: {
      // Daily quick scan (cheaper model, focused checks)
      "security-daily": {
        schedule: "0 3 * * *", // 3 AM daily
        task: "Run a quick security scan: closedclaw security audit --json. Report only critical and new findings.",
        agentId: "security",
        model: "anthropic/claude-sonnet-4", // cheaper for routine scans
      },
      // Weekly deep audit (premium model, full analysis)
      "security-weekly": {
        schedule: "0 4 * * 0", // 4 AM Sunday
        task: "Full security audit with research. Check CVEs, review upstream patches, analyze trends, propose fixes.",
        agentId: "security",
        model: "anthropic/claude-opus-4",
      },
    },
  },
}
```

## Implementation Checklist

- [ ] Create `security` agent config template in docs
- [ ] Write system prompt for security consciousness agent
- [ ] Define memory schema for audit finding persistence
- [ ] Add `closedclaw security audit --json` output format (structured for LLM consumption)
- [ ] Create cron schedule templates for daily/weekly audits
- [ ] Build finding lifecycle tracking (new/acknowledged/fixed/false-positive)
- [ ] Add trend analysis helper (compare current vs historical findings)
- [ ] Test with real deployment and validate finding quality

## Estimated Effort

- **Configuration + prompts**: 1 day
- **Memory schema + lifecycle tracking**: 1 day
- **JSON audit output format**: 0.5 days (if not already available)
- **Testing + calibration**: 0.5 days
- **Total**: ~3 days

## Dependencies

- Existing security audit engine (no changes needed)
- Subagent system (no changes needed)
- Memory extension (memory-core or memory-lancedb, already built)
- Cron tool (already built)

## Cost Estimates

| Schedule          | Model           | Est. tokens/run | Est. cost/run | Monthly cost  |
| ----------------- | --------------- | --------------- | ------------- | ------------- |
| Daily quick scan  | claude-sonnet-4 | ~10k            | ~$0.03        | ~$0.90        |
| Weekly deep audit | claude-opus-4   | ~50k            | ~$0.75        | ~$3.00        |
| **Total**         |                 |                 |               | **~$4/month** |

## Synergies

- **self_mirror**: The mirror agent can observe security agent behavior and flag when audits are becoming repetitive or missing new attack surfaces
- **ClawTalk**: Audit results can be communicated via compact protocol macros (e.g., `CT/1 SECAUDIT` instead of verbose task descriptions)
- **Entropy**: Randomized audit focus areas prevent predictable scanning patterns
