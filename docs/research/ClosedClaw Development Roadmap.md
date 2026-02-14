# **🛠️ ClosedClaw: Strategic Development Roadmap (2026)**

This document outlines the high-priority engineering objectives for the **ClosedClaw** project, moving from a feature-rich fork to an autonomous, enterprise-secured AI gateway.

## **🏗️ Phase 1: The "Cognitive Architecture" (ClawDense Implementation)**

**Objective:** Transition from static prompt files to a functional, high-density Domain-Specific Language (DSL).

### **1.1 The .claws Parser & Runtime**

- **Boilerplate Logic:** Create a robust parser in src/core/parser/claws.ts.
- **Token Optimization:** Finalize the "ClawDense" syntax to minimize boilerplate (e.g., using \=\> for triggers, @ for agents, and \! for high-priority overrides).
- **Execution Mapping:** Map .claws instructions directly to the internal Channel and Tool registry.

### **1.2 Signature-Verified Execution**

- **Security Guardrail:** Integrate with the existing Ed25519 "Skill Signing" system.
- **Integrity Check:** The runtime must verify the cryptographic signature of any .claws file before execution to prevent local prompt-injection attacks.

## **🤖 Phase 2: Autonomous Operations (Proactive Agency)**

**Objective:** Enable the system to work in the background without user prompts.

### **2.1 The "Heartbeat" Scheduler**

- **Logic:** Implement a cron-like scheduler that reads "Active" .claws files.
- **Priority Rotational Logic:** Implement a scheduler that prioritizes tasks based on "last-run" timestamps and importance weighting to prevent CPU/Token spikes.
- **Quiet Hours:** Add configuration for "Quiet Hours" where the agent only performs low-resource background maintenance.

### **2.2 Memory Compaction & Context Management**

- **Long-Term Memory:** Move beyond simple history logs. Implement a summarization engine that "pages" old chat context into compressed "Durable Memories" (Markdown/ClawDense).
- **Vector Integration:** (Optional Upgrade) Index the docs/ and archive/ folders so the agent can pull historical data via semantic search.

## **🖥️ Phase 3: Interface & UX Maturity**

**Objective:** Leverage the GTK GUI for more than just text input.

### **3.1 The "Lane" Dashboard**

- **Visualization:** Create a visual monitor for "Lanes" (serial execution chains). The user should see "Thinking," "Executing Tool," and "Refining" in real-time.
- **Kill Switch:** Implement a global "Halt" button that immediately terminates all sub-processes and active LLM streams.

### **3.2 Ollama Local-First Optimization**

- **Model Switching:** Allow the GUI to toggle between high-parameter cloud models (for planning) and local Ollama models (for execution and code snippets) to manage costs and latency.
- **Status Indicators:** Show local GPU/VRAM usage within the ClosedClaw dashboard.

## **🔐 Phase 4: Advanced Hardening**

**Objective:** Complete the "Closed" aspect of the architecture.

### **4.1 Tool-Level Sandboxing**

- **Default Deny:** Implement a manifest-based permission system where each .claws agent must declare which tools (exec, read, write) it requires.
- **Docker Fallback:** Any command using the exec tool should automatically prompt for execution inside an ephemeral Docker container.

### **4.2 Keychain & Vault Expansion**

- **Multi-Platform Sync:** Finalize the Priority 7 Keychain integration to ensure API keys and user secrets are never stored in plain text across Linux, macOS, and Windows.

## **📈 Success Metrics**

1. **Latency:** .claws parser overhead \< 50ms.
2. **Reliability:** 95% success rate on scheduled Heartbeat tasks.
3. **Security:** Zero unverified script executions in "Hardened Mode."
4. **Density:** 30% reduction in context window usage when using ClawDense vs. standard JSON.

**Last Revised:** February 12, 2026

**Status:** In Development (v2026.2.1)
