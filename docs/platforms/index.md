---
summary: "Platform support overview (Gateway + companion apps)"
read_when:
  - Looking for OS support or install paths
  - Deciding where to run the Gateway
title: "Platforms"
---

# Platforms

ClosedClaw core is written in TypeScript. **Node is the recommended runtime**.
Bun is not recommended for the Gateway (WhatsApp/Telegram bugs).

A companion app exists for Android. The Gateway is fully supported on Linux.

## Choose your platform

- Linux: [Linux](/platforms/linux)
- Android: [Android](/platforms/android)

## VPS & hosting

- VPS hub: [VPS hosting](/vps)
- Fly.io: [Fly.io](/platforms/fly)
- Cloud Foundry: [Cloud Foundry](/platforms/cloud-foundry)
- Hetzner (Docker): [Hetzner](/platforms/hetzner)
- GCP (Compute Engine): [GCP](/platforms/gcp)
- exe.dev (VM + HTTPS proxy): [exe.dev](/platforms/exe-dev)

## Common links

- Install guide: [Getting Started](/start/getting-started)
- Gateway runbook: [Gateway](/gateway)
- Gateway configuration: [Configuration](/gateway/configuration)
- Service status: `ClosedClaw gateway status`

## Gateway service install (CLI)

Use one of these (all supported):

- Wizard (recommended): `ClosedClaw onboard --install-daemon`
- Direct: `ClosedClaw gateway install`
- Configure flow: `ClosedClaw configure` → select **Gateway service**
- Repair/migrate: `ClosedClaw doctor` (offers to install or fix the service)

The service target depends on OS:

- Linux/WSL2: systemd user service (`ClosedClaw-gateway[-<profile>].service`)
