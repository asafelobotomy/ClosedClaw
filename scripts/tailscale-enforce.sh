#!/usr/bin/env bash
# ClosedClaw Tailscale Network Enforcement
# Creates network namespace and firewall rules to REQUIRE Tailscale for all traffic
# Run as root or with sudo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETNS_NAME="closedclaw-ts"
NFT_TABLE="closedclaw_tailscale"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# NFTABLES FIREWALL RULES
# ═══════════════════════════════════════════════════════════════════════════════

install_nftables_rules() {
    log_info "Installing nftables rules to enforce Tailscale-only egress..."
    
    # Get the user running ClosedClaw (default to calling user)
    local claw_user="${CLOSEDCLAW_USER:-${SUDO_USER:-$(whoami)}}"
    local claw_uid
    claw_uid=$(id -u "$claw_user" 2>/dev/null || echo "1000")
    
    # Get Tailscale interface
    local ts_iface="tailscale0"
    if ! ip link show "$ts_iface" &>/dev/null; then
        log_warn "tailscale0 interface not found, rules may not work until Tailscale connects"
    fi
    
    # Create nftables ruleset
    cat > /etc/nftables.d/closedclaw-tailscale.nft << EOF
#!/usr/sbin/nft -f
# ClosedClaw Tailscale Enforcement Rules
# Generated: $(date -Iseconds)
# Enforces that ClosedClaw processes can ONLY use Tailscale for network access

table inet $NFT_TABLE {
    chain output {
        type filter hook output priority filter; policy accept;
        
        # Allow loopback always
        oif "lo" accept
        
        # Allow Tailscale interface
        oif "$ts_iface" accept
        
        # Allow DNS (needed for Tailscale MagicDNS resolution)
        # Only allow to Tailscale's DNS (100.100.100.100)
        meta skuid $claw_uid udp dport 53 ip daddr 100.100.100.100 accept
        meta skuid $claw_uid tcp dport 53 ip daddr 100.100.100.100 accept
        
        # Allow established/related connections (for return traffic)
        ct state established,related accept
        
        # Allow Tailscale daemon traffic (needs to reach coordination servers)
        meta skuid "tailscale" accept
        
        # Allow ICMP for connectivity checks
        meta skuid $claw_uid icmp type { echo-request, echo-reply } accept
        meta skuid $claw_uid icmpv6 type { echo-request, echo-reply } accept
        
        # DROP all other egress from ClosedClaw user
        # This ensures ClosedClaw MUST go through Tailscale
        meta skuid $claw_uid counter drop
    }
    
    chain input {
        type filter hook input priority filter; policy accept;
        
        # Allow loopback
        iif "lo" accept
        
        # Allow Tailscale interface
        iif "$ts_iface" accept
        
        # Allow established/related
        ct state established,related accept
        
        # Allow Tailscale daemon
        meta skuid "tailscale" accept
    }
}
EOF

    # Ensure nftables.d directory exists
    mkdir -p /etc/nftables.d
    
    # Check if main nftables.conf includes our directory
    if ! grep -q 'include "/etc/nftables.d/\*.nft"' /etc/nftables.conf 2>/dev/null; then
        log_warn "Add 'include \"/etc/nftables.d/*.nft\"' to /etc/nftables.conf to auto-load rules"
    fi
    
    # Apply rules immediately
    nft -f /etc/nftables.d/closedclaw-tailscale.nft
    
    log_info "nftables rules installed and applied"
}

remove_nftables_rules() {
    log_info "Removing nftables Tailscale enforcement rules..."
    
    if nft list table inet $NFT_TABLE &>/dev/null; then
        nft delete table inet $NFT_TABLE
        log_info "Removed table inet $NFT_TABLE"
    else
        log_info "Table inet $NFT_TABLE not found (already removed)"
    fi
    
    rm -f /etc/nftables.d/closedclaw-tailscale.nft
}

show_nftables_rules() {
    if nft list table inet $NFT_TABLE &>/dev/null; then
        nft list table inet $NFT_TABLE
    else
        log_warn "No ClosedClaw Tailscale rules installed"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PODMAN/CONTAINER NETWORK NAMESPACE
# ═══════════════════════════════════════════════════════════════════════════════

create_tailscale_network() {
    log_info "Creating Podman network that routes through Tailscale..."
    
    # Check if network already exists
    if podman network exists closedclaw-tailscale 2>/dev/null; then
        log_info "Network 'closedclaw-tailscale' already exists"
        return 0
    fi
    
    # Get Tailscale subnet (typically 100.x.x.x/8 CGNAT range)
    local ts_ip
    ts_ip=$(tailscale ip -4 2>/dev/null || echo "")
    
    if [[ -z "$ts_ip" ]]; then
        log_error "Cannot get Tailscale IP. Is Tailscale connected?"
        return 1
    fi
    
    # Create a bridge network with Tailscale DNS
    podman network create \
        --driver bridge \
        --gateway 10.88.0.1 \
        --subnet 10.88.0.0/16 \
        --dns 100.100.100.100 \
        --label "closedclaw.tailscale=true" \
        --label "closedclaw.created=$(date -Iseconds)" \
        closedclaw-tailscale
    
    log_info "Created Podman network 'closedclaw-tailscale'"
    log_info "Containers will use Tailscale DNS (100.100.100.100)"
}

remove_tailscale_network() {
    log_info "Removing Podman Tailscale network..."
    
    if podman network exists closedclaw-tailscale 2>/dev/null; then
        podman network rm closedclaw-tailscale
        log_info "Removed network 'closedclaw-tailscale'"
    else
        log_info "Network 'closedclaw-tailscale' not found"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# TAILSCALE CONTAINER (tsnet proxy)
# ═══════════════════════════════════════════════════════════════════════════════

setup_tailscale_container() {
    log_info "Setting up Tailscale container for sandbox network..."
    
    local ts_container="closedclaw-tailscale-proxy"
    
    # Check if container exists
    if podman container exists "$ts_container" 2>/dev/null; then
        local state
        state=$(podman inspect -f '{{.State.Status}}' "$ts_container")
        if [[ "$state" == "running" ]]; then
            log_info "Tailscale proxy container already running"
            return 0
        fi
        log_info "Starting existing Tailscale proxy container..."
        podman start "$ts_container"
        return 0
    fi
    
    # Create state directory
    local ts_state_dir="${HOME}/.closedclaw/tailscale-container"
    mkdir -p "$ts_state_dir"
    chmod 700 "$ts_state_dir"
    
    # Run Tailscale container
    podman run -d \
        --name "$ts_container" \
        --hostname "closedclaw-sandbox" \
        --cap-add NET_ADMIN \
        --cap-add NET_RAW \
        --device /dev/net/tun \
        -v "$ts_state_dir:/var/lib/tailscale:Z" \
        -e TS_AUTHKEY="${TS_AUTHKEY:-}" \
        -e TS_EXTRA_ARGS="--advertise-tags=tag:closedclaw-sandbox" \
        -e TS_STATE_DIR="/var/lib/tailscale" \
        --label "closedclaw.role=tailscale-proxy" \
        tailscale/tailscale:stable
    
    log_info "Started Tailscale proxy container"
    log_info "Authenticate with: podman exec -it $ts_container tailscale up"
}

# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEMD INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════

install_systemd_dropin() {
    log_info "Installing systemd drop-in to require Tailscale..."
    
    local user_unit_dir="${HOME}/.config/systemd/user"
    local dropin_dir="${user_unit_dir}/closedclaw-gateway.service.d"
    
    mkdir -p "$dropin_dir"
    
    cat > "${dropin_dir}/tailscale-require.conf" << 'EOF'
[Unit]
# Require Tailscale to be running before gateway starts
After=tailscaled.service
Wants=tailscaled.service

# Add check that Tailscale is connected
ConditionPathExists=/var/run/tailscale/tailscaled.sock

[Service]
# Pre-flight check before starting
ExecStartPre=/home/vm/Documents/ClosedClaw/scripts/tailscale-preflight.sh check

# Set environment for Tailscale enforcement
Environment=CLOSEDCLAW_REQUIRE_TAILSCALE=1
Environment=CLOSEDCLAW_NETWORK_MODE=tailscale
EOF

    # Reload systemd
    systemctl --user daemon-reload
    
    log_info "Installed systemd drop-in at: ${dropin_dir}/tailscale-require.conf"
}

remove_systemd_dropin() {
    local dropin_dir="${HOME}/.config/systemd/user/closedclaw-gateway.service.d"
    
    if [[ -d "$dropin_dir" ]]; then
        rm -rf "$dropin_dir"
        systemctl --user daemon-reload
        log_info "Removed systemd Tailscale drop-in"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

usage() {
    cat << EOF
ClosedClaw Tailscale Network Enforcement

Usage: $0 <command>

Commands:
  install           Install all Tailscale enforcement (firewall + network + systemd)
  remove            Remove all Tailscale enforcement
  
  firewall-install  Install nftables firewall rules only
  firewall-remove   Remove nftables firewall rules
  firewall-show     Show current firewall rules
  
  network-create    Create Podman Tailscale network
  network-remove    Remove Podman Tailscale network
  
  proxy-setup       Set up Tailscale proxy container for sandboxes
  
  systemd-install   Install systemd drop-in for Tailscale dependency
  systemd-remove    Remove systemd drop-in
  
  status            Show current enforcement status

Environment:
  CLOSEDCLAW_USER   User running ClosedClaw (for firewall rules)
  TS_AUTHKEY        Tailscale auth key for proxy container

Examples:
  sudo $0 install              # Full Tailscale enforcement
  $0 systemd-install           # Just systemd integration (no root)
  sudo $0 firewall-install     # Just firewall rules
EOF
}

show_status() {
    echo "═══════════════════════════════════════════════════════"
    echo "  ClosedClaw Tailscale Enforcement Status"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    
    # Tailscale status
    echo "Tailscale:"
    if command -v tailscale &>/dev/null; then
        local ts_status
        ts_status=$(tailscale status --json 2>/dev/null | jq -r '.BackendState // "Unknown"')
        echo "  State: $ts_status"
        if [[ "$ts_status" == "Running" ]]; then
            echo "  IP: $(tailscale ip -4 2>/dev/null || echo 'N/A')"
            echo "  DNS: $(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // "N/A"' | sed 's/\.$//')"
        fi
    else
        echo "  NOT INSTALLED"
    fi
    echo ""
    
    # Firewall status
    echo "Firewall Rules:"
    if nft list table inet $NFT_TABLE &>/dev/null 2>&1; then
        echo "  Status: INSTALLED"
        echo "  Dropped packets: $(nft list table inet $NFT_TABLE 2>/dev/null | grep -oP 'counter packets \K\d+' | head -1 || echo '0')"
    else
        echo "  Status: NOT INSTALLED"
    fi
    echo ""
    
    # Podman network
    echo "Podman Network:"
    if podman network exists closedclaw-tailscale 2>/dev/null; then
        echo "  Status: EXISTS"
    else
        echo "  Status: NOT CREATED"
    fi
    echo ""
    
    # Systemd drop-in
    echo "Systemd Integration:"
    if [[ -f "${HOME}/.config/systemd/user/closedclaw-gateway.service.d/tailscale-require.conf" ]]; then
        echo "  Status: INSTALLED"
    else
        echo "  Status: NOT INSTALLED"
    fi
}

main() {
    local cmd="${1:-}"
    
    case "$cmd" in
        install)
            check_root
            install_nftables_rules
            # Network creation doesn't need root if using rootless podman
            create_tailscale_network || true
            install_systemd_dropin
            echo ""
            log_info "Tailscale enforcement installed!"
            log_info "ClosedClaw will now REQUIRE Tailscale for all network access."
            ;;
        remove)
            check_root
            remove_nftables_rules
            remove_tailscale_network || true
            remove_systemd_dropin
            log_info "Tailscale enforcement removed"
            ;;
        firewall-install)
            check_root
            install_nftables_rules
            ;;
        firewall-remove)
            check_root
            remove_nftables_rules
            ;;
        firewall-show)
            show_nftables_rules
            ;;
        network-create)
            create_tailscale_network
            ;;
        network-remove)
            remove_tailscale_network
            ;;
        proxy-setup)
            setup_tailscale_container
            ;;
        systemd-install)
            install_systemd_dropin
            ;;
        systemd-remove)
            remove_systemd_dropin
            ;;
        status)
            show_status
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
