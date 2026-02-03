# Tailscale Network Enforcement for ClosedClaw

This document describes how ClosedClaw is configured to **require Tailscale** for all network operations, with optional **Mullvad VPN** integration for additional privacy.

## Overview

All network traffic from ClosedClaw (gateway, agents, and sandbox containers) is enforced to go through Tailscale. This provides:

- **Zero-trust networking**: All connections are authenticated via Tailscale identity
- **End-to-end encryption**: WireGuard encryption for all traffic
- **Network isolation**: No direct internet access without Tailscale
- **Audit trail**: Tailscale logs all connection attempts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tailscale Mesh Network                       │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   GTK GUI    │────▶│   Gateway    │────▶│   Sandbox    │    │
│  │   (Client)   │     │ (bind:tailnet│     │  (Podman)    │    │
│  │              │     │   :18789)    │     │              │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         ▲                    │                    │             │
│         │                    ▼                    ▼             │
│         │            ┌──────────────┐     ┌──────────────┐     │
│         │            │ AI Provider  │     │   External   │     │
│         │            │  (Anthropic, │     │   Services   │     │
│         └────────────│   OpenAI)    │     │              │     │
│                      └──────────────┘     └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WireGuard tunnel
                              ▼
                     ┌──────────────┐
                     │  Tailscale   │
                     │Coordination  │
                     │   Servers    │
                     └──────────────┘
```

## Configuration Layers

### 1. Gateway Binding (Application Layer)

The gateway is configured to bind exclusively to the Tailscale interface:

```json5
{
  gateway: {
    bind: "tailnet",           // Only listen on Tailscale IP
    auth: {
      mode: "token",
      allowTailscale: true,    // Accept Tailscale identity auth
    },
  },
}
```

### 2. Systemd Service Dependency (Service Layer)

The gateway service requires Tailscale to be running:

```ini
# ~/.config/systemd/user/closedclaw-gateway.service.d/tailscale-require.conf
[Unit]
After=tailscaled.service
Wants=tailscaled.service
ConditionPathExists=/var/run/tailscale/tailscaled.sock

[Service]
ExecStartPre=/path/to/scripts/tailscale-preflight.sh check
Environment=CLOSEDCLAW_REQUIRE_TAILSCALE=1
```

### 3. Container Network (Sandbox Layer)

Sandbox containers use a Tailscale-enforced network:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          network: "closedclaw-tailscale",  // Podman network with TS DNS
        },
      },
    },
  },
}
```

### 4. Firewall Rules (Kernel Layer)

nftables rules DROP all non-Tailscale egress from ClosedClaw:

```bash
sudo ./scripts/tailscale-enforce.sh firewall-install
```

## Quick Start

### 1. Install and Configure Tailscale

```bash
# Install
sudo pacman -S tailscale

# Start daemon
sudo systemctl enable --now tailscaled

# Login
sudo tailscale up

# Verify
tailscale status
```

### 2. Run Pre-flight Check

```bash
./scripts/tailscale-preflight.sh check
```

Expected output:
```
═══════════════════════════════════════════════════════════════
  ClosedClaw Tailscale Pre-flight Check
═══════════════════════════════════════════════════════════════

[INFO] Tailscale CLI: /usr/bin/tailscale
[INFO] tailscaled service: running
[INFO] Tailscale state: Running
[INFO] Tailscale IPs: 100.x.x.x fd7a:xxxx::xxxx
[INFO] Tailscale DNS: your-machine.tailnet-name.ts.net
[INFO] tailscale0 interface: UP

✓ Tailscale pre-flight check passed
```

### 3. Install Full Enforcement

```bash
# Create Podman network with Tailscale DNS
./scripts/tailscale-enforce.sh network-create

# Install systemd integration
./scripts/tailscale-enforce.sh systemd-install

# (Optional) Install firewall rules for maximum security
sudo ./scripts/tailscale-enforce.sh firewall-install

# Check status
./scripts/tailscale-enforce.sh status
```

### 4. Start Gateway

```bash
# Via systemd
systemctl --user start closedclaw-gateway

# Or directly (after preflight)
./scripts/tailscale-preflight.sh check && \
  node openclaw.mjs gateway
```

## Scripts Reference

### tailscale-preflight.sh

Validates Tailscale is ready before starting ClosedClaw.

| Command | Description |
|---------|-------------|
| `check` | Full pre-flight validation (default) |
| `ip` | Output Tailscale IPv4 address |
| `dns` | Output Tailscale DNS name |
| `wait [timeout]` | Wait for Tailscale to be ready |

### tailscale-enforce.sh

Manages network enforcement infrastructure.

| Command | Root Required | Description |
|---------|---------------|-------------|
| `install` | Yes | Full enforcement setup |
| `remove` | Yes | Remove all enforcement |
| `firewall-install` | Yes | Install nftables rules |
| `firewall-remove` | Yes | Remove nftables rules |
| `firewall-show` | No | Show current rules |
| `network-create` | No* | Create Podman Tailscale network |
| `network-remove` | No* | Remove Podman network |
| `systemd-install` | No | Install systemd drop-in |
| `status` | No | Show enforcement status |

*Rootless Podman doesn't require root

## Troubleshooting

### Gateway won't start

1. Check Tailscale status:
   ```bash
   tailscale status
   ```

2. Run pre-flight check:
   ```bash
   ./scripts/tailscale-preflight.sh check
   ```

3. Check systemd logs:
   ```bash
   journalctl --user -u closedclaw-gateway -f
   ```

### No network in sandbox containers

1. Verify network exists:
   ```bash
   podman network inspect closedclaw-tailscale
   ```

2. Check container DNS:
   ```bash
   podman run --network closedclaw-tailscale alpine nslookup google.com
   ```

3. Verify Tailscale DNS (100.100.100.100) is reachable:
   ```bash
   dig @100.100.100.100 google.com
   ```

### Firewall blocking legitimate traffic

1. Check drop counter:
   ```bash
   sudo nft list table inet closedclaw_tailscale
   ```

2. Temporarily disable:
   ```bash
   sudo ./scripts/tailscale-enforce.sh firewall-remove
   ```

## Security Considerations

### Exit Nodes

For maximum security, configure a Tailscale exit node to route ALL internet traffic through a controlled endpoint:

```bash
# On the exit node server
tailscale up --advertise-exit-node

# On the ClosedClaw machine
tailscale up --exit-node=<exit-node-ip>
```

### ACLs

Configure Tailscale ACLs to restrict which nodes can connect to ClosedClaw:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:closedclaw-client"],
      "dst": ["tag:closedclaw-gateway:18789"]
    }
  ],
  "tagOwners": {
    "tag:closedclaw-gateway": ["autogroup:admin"],
    "tag:closedclaw-client": ["autogroup:admin"]
  }
}
```

### MagicDNS

Prefer MagicDNS names over IPs for easier key rotation:

```
gateway: your-gateway.tailnet-name.ts.net:18789
```

## Related Documentation

- [Tailscale Documentation](https://tailscale.com/kb/)
- [Tailscale Mullvad Exit Nodes](https://tailscale.com/kb/1258/mullvad-exit-nodes)
- [Gateway Configuration](../gateway/configuration.md)
- [Sandbox Security](../gateway/sandboxing.md)

---

## Mullvad VPN Integration

Tailscale has **native Mullvad integration** that allows using Mullvad VPN servers as exit nodes. This provides:

- **Double encryption**: WireGuard (Tailscale) → WireGuard (Mullvad)
- **IP anonymization**: Your public IP becomes a Mullvad server IP
- **No logs**: Mullvad's strict no-logging policy
- **Geographic flexibility**: Choose from 60+ Mullvad server locations

### Architecture with Mullvad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Traffic Flow with Mullvad                          │
│                                                                              │
│  ┌──────────┐    ┌────────────┐    ┌────────────┐    ┌──────────────────┐  │
│  │ClosedClaw│───▶│ Tailscale  │───▶│  Mullvad   │───▶│    Internet      │  │
│  │ Gateway  │    │  (WG #1)   │    │Exit (WG #2)│    │ (AI Providers)   │  │
│  └──────────┘    └────────────┘    └────────────┘    └──────────────────┘  │
│        │                │                 │                    │            │
│        │                │                 │                    │            │
│   Your Machine    Tailscale Mesh     Mullvad VPN         Public Internet   │
│   (100.x.x.x)     (encrypted)        (encrypted)         (encrypted TLS)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Quick Setup with Mullvad

```bash
# Prerequisites:
# 1. Tailscale account (free tier works)
# 2. Mullvad add-on purchased in Tailscale admin console
# 3. Device authorized for Mullvad access

# Quick setup (picks US Mullvad exit by default)
./scripts/tailscale-mullvad.sh quick-setup us

# Or choose a specific region
./scripts/tailscale-mullvad.sh quick-setup de   # Germany
./scripts/tailscale-mullvad.sh quick-setup nl   # Netherlands
./scripts/tailscale-mullvad.sh quick-setup ch   # Switzerland
```

### Manual Mullvad Configuration

```bash
# 1. Login to Tailscale
sudo tailscale up

# 2. List available Mullvad exit nodes
./scripts/tailscale-mullvad.sh exit-node-list

# 3. Set a specific Mullvad exit node
./scripts/tailscale-mullvad.sh exit-node mullvad:us-nyc

# 4. Enable traffic enforcement (blocks non-VPN traffic)
sudo ./scripts/tailscale-mullvad.sh enforce-enable

# 5. Enable DNS leak protection
sudo ./scripts/tailscale-mullvad.sh dns-protect-enable

# 6. Verify everything
./scripts/tailscale-mullvad.sh verify
```

### Enforcement Layers

| Layer | Enforcement | Mullvad-Aware |
|-------|-------------|---------------|
| **Application** | Gateway binds to Tailscale IP only | Exit node routes through Mullvad |
| **Service** | Systemd requires `tailscaled.service` | Pre-flight checks exit node status |
| **Firewall** | nftables blocks non-tailscale0 egress | Blocks DNS leaks to non-Mullvad servers |
| **Container** | Podman network uses Tailscale DNS | Traffic inherits exit node |
| **Namespace** | Optional isolated network namespace | All traffic through VPN |

### DNS Leak Protection

When using Mullvad, DNS queries should go through:
1. **Tailscale MagicDNS** (100.100.100.100)
2. **Mullvad DNS** (10.64.0.1 via exit node)

The enforcement script blocks DNS to other servers:

```bash
# Enable DNS leak protection
sudo ./scripts/tailscale-mullvad.sh dns-protect-enable

# Test for leaks
./scripts/tailscale-mullvad.sh test-dns
```

### Verifying Mullvad is Active

```bash
# Check public IP and Mullvad status
./scripts/tailscale-mullvad.sh verify

# Expected output:
# ══════════════════════════════════════════════════════
#   Verifying VPN Connection
# ══════════════════════════════════════════════════════
# 
# Tailscale Status:
#   State: Running
#   Tailscale IP: 100.x.x.x
#   Exit Node: 10.64.x.x
#   Mullvad: YES
# 
# External IP Check:
#   Public IP: 185.x.x.x
#   Mullvad VPN: ACTIVE
#   Mullvad Server: us-nyc-wg-001
```

### Mullvad Without Tailscale Add-on

If you don't want to use Tailscale's Mullvad integration, you can run Mullvad standalone and chain it:

```bash
# Option 1: Mullvad as system VPN, Tailscale on top
# (Tailscale traffic goes through Mullvad tunnel)
mullvad connect
sudo tailscale up

# Option 2: Run ClosedClaw in Mullvad network namespace
# Create namespace with Mullvad routing
sudo ./scripts/tailscale-mullvad.sh namespace-create
sudo ip netns exec closedclaw-vpn mullvad connect
sudo ip netns exec closedclaw-vpn node openclaw.mjs gateway
```

### Script Reference: tailscale-mullvad.sh

| Command | Description |
|---------|-------------|
| `quick-setup [region]` | Full setup with Mullvad exit node |
| `exit-node <target>` | Set exit node (mullvad:us, auto, IP) |
| `exit-node-list` | List available Mullvad servers |
| `exit-node-clear` | Remove exit node |
| `enforce-enable` | Block all non-Tailscale traffic |
| `enforce-disable` | Allow normal traffic |
| `dns-protect-enable` | Force DNS through Tailscale |
| `dns-protect-disable` | Allow normal DNS |
| `namespace-create` | Create isolated VPN namespace |
| `namespace-run <cmd>` | Run command in namespace |
| `container-network` | Create enforced Podman network |
| `verify` | Check VPN status |
| `test-dns` | Test for DNS leaks |
| `systemd-install` | Install enforcement service |

### Tailscale ACLs for Mullvad

Configure Tailscale ACLs to mandate Mullvad for ClosedClaw devices:

```json
{
  "nodeAttrs": [
    {
      "target": ["tag:closedclaw"],
      "attr": ["mullvad"]
    }
  ],
  "acls": [
    {
      "action": "accept",
      "src": ["tag:closedclaw"],
      "dst": ["*:*"]
    }
  ],
  "tagOwners": {
    "tag:closedclaw": ["autogroup:admin"]
  }
}
```

### Mandatory Exit Nodes (Premium/Enterprise)

For stricter enforcement, use Tailscale's **Mandatory Exit Nodes** feature:

1. In Tailscale admin console, go to **Settings → General**
2. Under **Mullvad VPN**, configure devices
3. Use MDM policies to enforce exit node:

```bash
# Force exit node via environment (requires MDM)
TAILSCALE_EXIT_NODE_ID=auto
TAILSCALE_FORCE_EXIT_NODE=1
```

This prevents users from disabling the exit node.
