#!/usr/bin/env bash
# ClosedClaw Tailscale + Mullvad VPN Enforcement
# Comprehensive network enforcement with optional Mullvad exit node routing
#
# Enforcement Layers:
# 1. Tailscale Mandatory Exit Node (via tailnet policy or local config)
# 2. Network Namespace Isolation
# 3. Firewall Rules (nftables)
# 4. Container Network Enforcement
# 5. DNS Leak Protection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${CLOSEDCLAW_CONFIG_DIR:-$HOME/.ClosedClaw}"
NETNS_NAME="closedclaw-vpn"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_section() { echo -e "\n${CYAN}══════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"; }

# ═══════════════════════════════════════════════════════════════════════════════
# TAILSCALE STATUS HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

get_tailscale_status() {
    tailscale status --json 2>/dev/null || echo "{}"
}

is_tailscale_running() {
    local status
    status=$(get_tailscale_status)
    echo "$status" | jq -e '.BackendState == "Running"' &>/dev/null
}

get_current_exit_node() {
    local status
    status=$(get_tailscale_status)
    echo "$status" | jq -r '.ExitNodeStatus.TailscaleIPs[0] // empty' 2>/dev/null
}

is_using_mullvad() {
    local status
    status=$(get_tailscale_status)
    # Mullvad exit nodes have DNS names containing "mullvad"
    local exit_node_id
    exit_node_id=$(echo "$status" | jq -r '.ExitNodeStatus.ID // empty' 2>/dev/null)
    
    if [[ -z "$exit_node_id" ]]; then
        return 1
    fi
    
    # Check peers for the exit node
    echo "$status" | jq -e --arg id "$exit_node_id" \
        '.Peer[$id].DNSName // "" | contains("mullvad")' &>/dev/null
}

list_mullvad_exit_nodes() {
    local status
    status=$(get_tailscale_status)
    
    echo "$status" | jq -r '
        [.Peer | to_entries[] | select(.value.DNSName | contains("mullvad"))] |
        sort_by(.value.DNSName) |
        .[] |
        "\(.value.DNSName | gsub("\\.mullvad\\.ts\\.net\\.?$"; "")) (\(.value.TailscaleIPs[0] // "no-ip"))"
    ' 2>/dev/null || echo "No Mullvad exit nodes available"
}

# ═══════════════════════════════════════════════════════════════════════════════
# EXIT NODE ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════════

set_exit_node() {
    local node="$1"
    log_info "Setting exit node to: $node"
    
    if [[ "$node" == "mullvad:"* ]]; then
        # Parse mullvad:country-city format (e.g., mullvad:us-nyc)
        local location="${node#mullvad:}"
        log_info "Looking for Mullvad exit node in: $location"
        
        local status
        status=$(get_tailscale_status)
        
        local exit_node_ip
        exit_node_ip=$(echo "$status" | jq -r --arg loc "$location" '
            [.Peer | to_entries[] | 
             select(.value.DNSName | contains("mullvad")) |
             select(.value.DNSName | contains($loc))] |
             .[0].value.TailscaleIPs[0] // empty
        ')
        
        if [[ -z "$exit_node_ip" ]]; then
            log_error "No Mullvad exit node found matching: $location"
            log_info "Available Mullvad nodes:"
            list_mullvad_exit_nodes
            return 1
        fi
        
        sudo tailscale set --exit-node="$exit_node_ip"
    elif [[ "$node" == "auto" ]]; then
        # Use suggested exit node
        sudo tailscale set --exit-node-allow-lan-access --exit-node=auto
    else
        # Direct IP or hostname
        sudo tailscale set --exit-node="$node"
    fi
    
    log_info "Exit node configured"
}

clear_exit_node() {
    log_info "Clearing exit node..."
    sudo tailscale set --exit-node=
    log_info "Exit node cleared"
}

# ═══════════════════════════════════════════════════════════════════════════════
# NETWORK NAMESPACE ISOLATION
# ═══════════════════════════════════════════════════════════════════════════════

create_vpn_namespace() {
    log_section "Creating VPN Network Namespace"
    
    if ip netns list 2>/dev/null | grep -q "^$NETNS_NAME"; then
        log_info "Namespace '$NETNS_NAME' already exists"
        return 0
    fi
    
    # Create namespace
    sudo ip netns add "$NETNS_NAME"
    
    # Create veth pair
    sudo ip link add veth-claw type veth peer name veth-vpn
    
    # Move one end to namespace
    sudo ip link set veth-vpn netns "$NETNS_NAME"
    
    # Configure host side
    sudo ip addr add 10.200.200.1/24 dev veth-claw
    sudo ip link set veth-claw up
    
    # Configure namespace side
    sudo ip netns exec "$NETNS_NAME" ip addr add 10.200.200.2/24 dev veth-vpn
    sudo ip netns exec "$NETNS_NAME" ip link set veth-vpn up
    sudo ip netns exec "$NETNS_NAME" ip link set lo up
    
    # Set default route in namespace to go through host
    sudo ip netns exec "$NETNS_NAME" ip route add default via 10.200.200.1
    
    # Enable IP forwarding
    sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
    
    # NAT traffic from namespace through Tailscale
    sudo nft add table ip closedclaw_ns 2>/dev/null || true
    sudo nft flush table ip closedclaw_ns 2>/dev/null || true
    sudo nft add chain ip closedclaw_ns postrouting "{ type nat hook postrouting priority srcnat; }"
    sudo nft add rule ip closedclaw_ns postrouting oif tailscale0 masquerade
    
    log_info "VPN namespace '$NETNS_NAME' created"
    log_info "Run commands in namespace: sudo ip netns exec $NETNS_NAME <command>"
}

delete_vpn_namespace() {
    log_info "Deleting VPN namespace..."
    
    if ip netns list 2>/dev/null | grep -q "^$NETNS_NAME"; then
        sudo ip netns del "$NETNS_NAME"
    fi
    
    sudo ip link del veth-claw 2>/dev/null || true
    sudo nft delete table ip closedclaw_ns 2>/dev/null || true
    
    log_info "VPN namespace deleted"
}

run_in_namespace() {
    local cmd="$*"
    if ! ip netns list 2>/dev/null | grep -q "^$NETNS_NAME"; then
        log_error "VPN namespace not created. Run: $0 namespace-create"
        return 1
    fi
    
    sudo ip netns exec "$NETNS_NAME" $cmd
}

# ═══════════════════════════════════════════════════════════════════════════════
# SPLIT TUNNEL ENFORCEMENT (Block non-VPN traffic)
# ═══════════════════════════════════════════════════════════════════════════════

enforce_exit_node_only() {
    log_section "Enforcing Exit Node Only Traffic"
    
    local claw_user="${CLOSEDCLAW_USER:-${SUDO_USER:-$(whoami)}}"
    local claw_uid
    claw_uid=$(id -u "$claw_user" 2>/dev/null || echo "1000")
    
    # Get current exit node
    local exit_node_ip
    exit_node_ip=$(get_current_exit_node)
    
    if [[ -z "$exit_node_ip" ]]; then
        log_error "No exit node configured. Set one first:"
        log_error "  $0 exit-node mullvad:us-nyc"
        log_error "  $0 exit-node auto"
        return 1
    fi
    
    log_info "Exit node IP: $exit_node_ip"
    log_info "Enforcing for UID: $claw_uid ($claw_user)"
    
    # Create nftables rules
    sudo nft -f - << EOF
table inet closedclaw_vpn_enforce {
    chain output {
        type filter hook output priority filter; policy accept;
        
        # Always allow loopback
        oif "lo" accept
        
        # Allow Tailscale interface (all traffic goes through WireGuard)
        oif "tailscale0" accept
        
        # Allow Tailscale daemon itself
        meta skuid "tailscale" accept
        
        # Allow established connections
        ct state established,related accept
        
        # Block all other egress from ClosedClaw user
        # This FORCES all traffic through Tailscale exit node
        meta skuid $claw_uid counter log prefix "[CLOSEDCLAW-BLOCKED] " drop
    }
}
EOF
    
    log_info "Traffic enforcement enabled"
    log_info "All non-Tailscale traffic from UID $claw_uid will be BLOCKED"
}

disable_exit_node_enforcement() {
    log_info "Disabling exit node enforcement..."
    sudo nft delete table inet closedclaw_vpn_enforce 2>/dev/null || true
    log_info "Enforcement disabled"
}

# ═══════════════════════════════════════════════════════════════════════════════
# DNS LEAK PROTECTION
# ═══════════════════════════════════════════════════════════════════════════════

enable_dns_protection() {
    log_section "Enabling DNS Leak Protection"
    
    # Tailscale uses 100.100.100.100 for MagicDNS
    # Mullvad DNS: 10.64.0.1 (via exit node)
    
    local claw_user="${CLOSEDCLAW_USER:-${SUDO_USER:-$(whoami)}}"
    local claw_uid
    claw_uid=$(id -u "$claw_user" 2>/dev/null || echo "1000")
    
    sudo nft -f - << EOF
table inet closedclaw_dns_protect {
    chain output {
        type filter hook output priority filter; policy accept;
        
        # Only allow DNS to Tailscale MagicDNS
        meta skuid $claw_uid udp dport 53 ip daddr != 100.100.100.100 counter drop
        meta skuid $claw_uid tcp dport 53 ip daddr != 100.100.100.100 counter drop
        
        # Block DNS-over-HTTPS to common providers (force system DNS)
        meta skuid $claw_uid tcp dport 443 ip daddr { 1.1.1.1, 8.8.8.8, 8.8.4.4, 9.9.9.9 } counter drop
    }
}
EOF
    
    log_info "DNS leak protection enabled"
    log_info "Only Tailscale MagicDNS (100.100.100.100) allowed"
}

disable_dns_protection() {
    log_info "Disabling DNS protection..."
    sudo nft delete table inet closedclaw_dns_protect 2>/dev/null || true
    log_info "DNS protection disabled"
}

# ═══════════════════════════════════════════════════════════════════════════════
# CONTAINER ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════════

create_tailscale_container_network() {
    log_section "Creating Tailscale Container Network"
    
    # Check if tailscale-userspace-networking container is available
    # This routes all container traffic through Tailscale
    
    if podman network exists closedclaw-ts-enforced 2>/dev/null; then
        log_info "Network 'closedclaw-ts-enforced' already exists"
        return 0
    fi
    
    # Create network with Tailscale DNS
    podman network create \
        --driver bridge \
        --subnet 10.89.0.0/24 \
        --gateway 10.89.0.1 \
        --dns 100.100.100.100 \
        --label "closedclaw.vpn-enforced=true" \
        --label "closedclaw.mullvad-optional=true" \
        closedclaw-ts-enforced
    
    log_info "Created network 'closedclaw-ts-enforced'"
    log_info "Containers on this network use Tailscale DNS"
}

# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEMD INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════

create_enforcement_service() {
    log_section "Creating Enforcement Systemd Service"
    
    local service_file="/etc/systemd/system/closedclaw-vpn-enforce.service"
    
    sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=ClosedClaw VPN Enforcement
After=tailscaled.service
Requires=tailscaled.service
Before=closedclaw-gateway.service

[Service]
Type=oneshot
RemainAfterExit=yes

# Wait for Tailscale to be fully connected
ExecStartPre=/bin/bash -c 'until tailscale status --json | jq -e ".BackendState == \"Running\"" > /dev/null 2>&1; do sleep 1; done'

# Set Mullvad exit node (optional - comment out if not using Mullvad)
# ExecStartPre=/usr/bin/tailscale set --exit-node=auto

# Enable traffic enforcement
ExecStart=$SCRIPT_DIR/tailscale-mullvad.sh enforce-start

# Cleanup on stop
ExecStop=$SCRIPT_DIR/tailscale-mullvad.sh enforce-stop

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    log_info "Created systemd service: closedclaw-vpn-enforce.service"
    log_info "Enable with: sudo systemctl enable closedclaw-vpn-enforce"
}

# ═══════════════════════════════════════════════════════════════════════════════
# VERIFICATION & TESTING
# ═══════════════════════════════════════════════════════════════════════════════

verify_vpn_connection() {
    log_section "Verifying VPN Connection"
    
    echo ""
    echo "Tailscale Status:"
    if is_tailscale_running; then
        echo -e "  State: ${GREEN}Running${NC}"
        
        local ts_ip
        ts_ip=$(tailscale ip -4 2>/dev/null || echo "N/A")
        echo "  Tailscale IP: $ts_ip"
        
        local exit_ip
        exit_ip=$(get_current_exit_node)
        if [[ -n "$exit_ip" ]]; then
            echo -e "  Exit Node: ${GREEN}$exit_ip${NC}"
            
            if is_using_mullvad; then
                echo -e "  Mullvad: ${GREEN}YES${NC}"
            else
                echo -e "  Mullvad: ${YELLOW}NO (using non-Mullvad exit node)${NC}"
            fi
        else
            echo -e "  Exit Node: ${YELLOW}NONE${NC}"
        fi
    else
        echo -e "  State: ${RED}Not Running${NC}"
    fi
    
    echo ""
    echo "Firewall Rules:"
    if sudo nft list table inet closedclaw_vpn_enforce &>/dev/null 2>&1; then
        echo -e "  Traffic Enforcement: ${GREEN}ENABLED${NC}"
    else
        echo -e "  Traffic Enforcement: ${YELLOW}DISABLED${NC}"
    fi
    
    if sudo nft list table inet closedclaw_dns_protect &>/dev/null 2>&1; then
        echo -e "  DNS Protection: ${GREEN}ENABLED${NC}"
    else
        echo -e "  DNS Protection: ${YELLOW}DISABLED${NC}"
    fi
    
    echo ""
    echo "External IP Check:"
    local external_ip
    external_ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "FAILED")
    echo "  Public IP: $external_ip"
    
    # Check if it's a Mullvad IP
    if [[ "$external_ip" != "FAILED" ]]; then
        local mullvad_check
        mullvad_check=$(curl -s --max-time 5 "https://am.i.mullvad.net/json" 2>/dev/null || echo "{}")
        local is_mullvad
        is_mullvad=$(echo "$mullvad_check" | jq -r '.mullvad_exit_ip // false' 2>/dev/null)
        
        if [[ "$is_mullvad" == "true" ]]; then
            echo -e "  Mullvad VPN: ${GREEN}ACTIVE${NC}"
            local mullvad_city
            mullvad_city=$(echo "$mullvad_check" | jq -r '.mullvad_exit_ip_hostname // "unknown"' 2>/dev/null)
            echo "  Mullvad Server: $mullvad_city"
        else
            echo -e "  Mullvad VPN: ${YELLOW}NOT DETECTED${NC}"
        fi
    fi
}

test_dns_leaks() {
    log_section "Testing for DNS Leaks"
    
    echo "Running DNS leak test..."
    
    # Use multiple DNS leak test services
    local resolvers
    resolvers=$(dig +short TXT whoami.ds.akahelp.net 2>/dev/null | tr -d '"' || echo "FAILED")
    echo "DNS Resolver (Akamai): $resolvers"
    
    # Check what DNS server is being used
    local dns_server
    dns_server=$(dig +short whoami.akamai.net 2>/dev/null || echo "FAILED")
    echo "Resolver IP: $dns_server"
    
    # Expected: Should resolve through 100.100.100.100 (Tailscale) → Mullvad DNS
    if [[ "$dns_server" == *"100.100.100.100"* ]] || [[ "$dns_server" == *"10.64.0.1"* ]]; then
        echo -e "${GREEN}✓ DNS queries going through Tailscale/Mullvad${NC}"
    else
        echo -e "${YELLOW}⚠ DNS may be leaking - verify Tailscale DNS settings${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# QUICK SETUP
# ═══════════════════════════════════════════════════════════════════════════════

quick_setup_mullvad() {
    log_section "Quick Setup: Tailscale + Mullvad"
    
    local location="${1:-us}"
    
    echo "This will:"
    echo "  1. Verify Tailscale is connected"
    echo "  2. Set a Mullvad exit node (region: $location)"
    echo "  3. Enable traffic enforcement"
    echo "  4. Enable DNS leak protection"
    echo ""
    
    # Check Tailscale
    if ! is_tailscale_running; then
        log_error "Tailscale is not running. Start it first:"
        log_error "  sudo tailscale up"
        return 1
    fi
    
    # Set Mullvad exit node
    set_exit_node "mullvad:$location" || {
        log_warn "Could not set Mullvad exit node. Continuing with auto..."
        set_exit_node "auto"
    }
    
    # Enable enforcement
    enforce_exit_node_only
    enable_dns_protection
    
    # Create container network
    create_tailscale_container_network || true
    
    echo ""
    verify_vpn_connection
    
    log_info "Setup complete!"
    log_info "All ClosedClaw traffic now goes through Tailscale (with Mullvad if available)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

usage() {
    cat << EOF
ClosedClaw Tailscale + Mullvad VPN Enforcement

Usage: $0 <command> [options]

QUICK SETUP:
  quick-setup [region]       Full setup with Mullvad (default region: us)
                             Regions: us, uk, de, nl, se, ch, etc.

EXIT NODE MANAGEMENT:
  exit-node <target>         Set exit node
                             - mullvad:us-nyc    (Mullvad by location)
                             - mullvad:de-fra    (Mullvad Frankfurt)
                             - auto              (Auto-select nearest)
                             - <ip>              (Specific IP/hostname)
  exit-node-clear            Remove exit node
  exit-node-list             List available Mullvad exit nodes

TRAFFIC ENFORCEMENT:
  enforce-enable             Block all non-Tailscale traffic
  enforce-disable            Allow normal traffic
  enforce-start              Combined: enforce + DNS protect (for systemd)
  enforce-stop               Combined: disable all enforcement

DNS PROTECTION:
  dns-protect-enable         Force DNS through Tailscale only
  dns-protect-disable        Allow normal DNS

NETWORK NAMESPACE:
  namespace-create           Create isolated VPN namespace
  namespace-delete           Delete VPN namespace
  namespace-run <cmd>        Run command in VPN namespace

CONTAINERS:
  container-network          Create Tailscale-enforced Podman network

SYSTEMD:
  systemd-install            Install enforcement service

VERIFICATION:
  verify                     Check VPN connection status
  test-dns                   Test for DNS leaks
  status                     Full status report

EXAMPLES:
  $0 quick-setup us          # Full Mullvad US setup
  $0 exit-node mullvad:de    # Use Mullvad Germany
  $0 enforce-enable          # Block non-VPN traffic
  $0 verify                  # Check everything
EOF
}

main() {
    local cmd="${1:-}"
    shift || true
    
    case "$cmd" in
        quick-setup)
            quick_setup_mullvad "${1:-us}"
            ;;
        exit-node)
            set_exit_node "${1:?Usage: $0 exit-node <target>}"
            ;;
        exit-node-clear)
            clear_exit_node
            ;;
        exit-node-list)
            list_mullvad_exit_nodes
            ;;
        enforce-enable)
            enforce_exit_node_only
            ;;
        enforce-disable)
            disable_exit_node_enforcement
            ;;
        enforce-start)
            enforce_exit_node_only
            enable_dns_protection
            ;;
        enforce-stop)
            disable_exit_node_enforcement
            disable_dns_protection
            ;;
        dns-protect-enable)
            enable_dns_protection
            ;;
        dns-protect-disable)
            disable_dns_protection
            ;;
        namespace-create)
            create_vpn_namespace
            ;;
        namespace-delete)
            delete_vpn_namespace
            ;;
        namespace-run)
            run_in_namespace "$@"
            ;;
        container-network)
            create_tailscale_container_network
            ;;
        systemd-install)
            create_enforcement_service
            ;;
        verify)
            verify_vpn_connection
            ;;
        test-dns)
            test_dns_leaks
            ;;
        status)
            verify_vpn_connection
            echo ""
            test_dns_leaks
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
