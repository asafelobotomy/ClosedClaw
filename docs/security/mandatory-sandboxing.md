---
summary: "ClosedClaw's mandatory sandboxing by default: what it is, why it matters, and how to configure it"
title: Mandatory Sandboxing
read_when: "You want to understand ClosedClaw's security-first approach compared to OpenClaw"
status: active
---

# Mandatory Sandboxing

## Overview

**ClosedClaw defaults to sandboxing all tool execution.** This is a key security enhancement
over OpenClaw, which defaults to running tools directly on the host system.

When sandboxing is enabled (the default), all tool calls (`exec`, `read`, `write`, `edit`,
`apply_patch`, `process`, etc.) run inside isolated Docker containers with:

- Read-only root filesystem
- No network access by default
- All Linux capabilities dropped
- Isolated process namespace
- Minimal workspace access

## Why Mandatory Sandboxing?

AI models can be manipulated through prompt injection, malicious tool responses, or
adversarial inputs. Mandatory sandboxing provides **defense in depth**:

1. **Limits blast radius**: Even if a model is compromised, it cannot directly access
   your filesystem, environment variables, or network.

2. **Prevents lateral movement**: Sandbox containers run with minimal privileges and
   cannot escape to the host system easily.

3. **Protects secrets**: API keys and credentials in `~/.ClosedClaw/credentials/` are
   not visible inside the sandbox by default.

4. **Auditable**: All tool execution happens in containers with defined boundaries,
   making security analysis easier.

## Default Configuration

ClosedClaw defaults to:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "all", // All sessions sandboxed
        scope: "session", // One container per session
        workspaceAccess: "none", // No host filesystem access
        docker: {
          readOnlyRoot: true, // Immutable container filesystem
          network: "none", // No network access
          capDrop: ["ALL"], // Drop all Linux capabilities
        },
      },
    },
  },
}
```

These defaults are **significantly more restrictive** than OpenClaw's optional sandboxing.

## Security Audit

ClosedClaw includes a security audit command that checks your sandbox configuration:

```bash
closedclaw doctor
# or
closedclaw security audit
```

The audit will flag:

- **Critical**: `sandbox.mode="off"` (sandboxing disabled)
- **Warning**: `sandbox.mode="non-main"` (main session not sandboxed)
- **Warning**: `workspaceAccess="rw"` (write access to host workspace)
- **Warning**: `docker.network` not set to `"none"` (network access enabled)
- **Warning**: `docker.readOnlyRoot=false` (mutable container filesystem)
- **Warning**: `docker.capDrop` missing `"ALL"` (capabilities not fully dropped)

## When to Disable Sandboxing

You might want to disable sandboxing if:

- **Development/testing**: You're debugging tool execution and need direct host access
- **Docker unavailable**: The system doesn't have Docker installed
- **Performance**: You need faster tool execution (sandboxing adds ~50-200ms overhead)

**Warning**: Disabling sandboxing means AI-generated code runs directly on your host
with full access to your user account, files, and network.

To disable (not recommended for production):

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "off",
      },
    },
  },
}
```

## Hybrid Approach: Main Session Only

If you want your personal chat to run on the host but keep group chats sandboxed:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main", // Only sandbox non-main sessions
      },
    },
  },
}
```

This gives you convenience for your main interaction while protecting group/channel
sessions from potential abuse.

## Workspace Access Modes

Control what the sandbox can see:

- **`"none"`** (default): Sandbox has its own isolated workspace at `~/.ClosedClaw/sandboxes/`.
  Media and skills are mirrored in, but no host files are accessible.

- **`"ro"`**: Host agent workspace mounted read-only at `/agent`. The sandbox can read
  your files but cannot modify them. Tools like `write`, `edit`, and `apply_patch`
  are automatically disabled.

- **`"rw"`**: Host workspace mounted read-write at `/workspace`. The sandbox can modify
  your files. **Use with caution** — only enable for trusted workflows.

Example with read-only access:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "all",
        workspaceAccess: "ro", // Read-only host workspace
      },
    },
  },
}
```

## Network Access

By default, sandbox containers have **no network access** (`docker.network="none"`).
This prevents:

- Data exfiltration to attacker-controlled servers
- Downloading malicious payloads
- DNS exfiltration
- Outbound C2 connections

If your workflow requires network access (e.g., downloading packages, API calls):

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          network: "bridge", // Enable network (use cautiously)
        },
      },
    },
  },
}
```

**Recommendation**: Instead of enabling network globally, use:

1. **Tool allowlisting**: Provide specific tools that make controlled API calls
2. **Node execution**: Run network-bound code on a controlled node (see `/exec node=<id>`)
3. **Proxy/gateway**: Route network traffic through a monitoring proxy

## Related Documentation

- [Sandboxing](/gateway/sandboxing) - Full sandbox configuration reference
- [Sandbox vs Tool Policy vs Elevated](/gateway/sandbox-vs-tool-policy-vs-elevated) -
  How different security layers interact
- [Security Audit](/gateway/doctor) - Running security diagnostics

## Comparison: ClosedClaw vs OpenClaw

| Feature                  | ClosedClaw                | OpenClaw              |
| ------------------------ | ------------------------- | --------------------- |
| **Default sandbox mode** | `"all"` (mandatory)       | `"off"` (disabled)    |
| **Tool execution**       | Isolated containers       | Host system           |
| **Network access**       | Blocked by default        | Full access           |
| **Filesystem access**    | Isolated workspace        | Root filesystem       |
| **Security audit**       | Flags disabled sandboxing | Optional warnings     |
| **Setup required**       | Docker images             | None (Host execution) |

ClosedClaw prioritizes **security by default**, making it suitable for untrusted
inputs, shared systems, and production deployments where AI-generated code execution
poses real risks.
