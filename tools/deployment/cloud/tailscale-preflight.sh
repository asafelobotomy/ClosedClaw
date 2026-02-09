#!/usr/bin/env bash
# ClosedClaw Tailscale Pre-flight Check
# Validates Tailscale is connected before allowing gateway/agent operations
# Exit 0 = Tailscale ready, Exit 1 = Not ready

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check if tailscale CLI is available
check_tailscale_binary() {
    if ! command -v tailscale &>/dev/null; then
        log_error "Tailscale CLI not found in PATH"
        log_error "Install: sudo pacman -S tailscale (Arch) or see https://tailscale.com/download/linux"
        return 1
    fi
    log_info "Tailscale CLI: $(which tailscale)"
}

# Check if tailscaled daemon is running
check_tailscaled_service() {
    if ! systemctl is-active --quiet tailscaled 2>/dev/null; then
        # Try user service
        if ! systemctl --user is-active --quiet tailscaled 2>/dev/null; then
            log_error "tailscaled service is not running"
            log_error "Start with: sudo systemctl start tailscaled"
            return 1
        fi
    fi
    log_info "tailscaled service: running"
}

# Check Tailscale connection status
check_tailscale_status() {
    local status_json
    if ! status_json=$(tailscale status --json 2>/dev/null); then
        log_error "Failed to get Tailscale status"
        return 1
    fi

    # Parse JSON status
    local backend_state
    backend_state=$(echo "$status_json" | jq -r '.BackendState // "Unknown"')

    case "$backend_state" in
        "Running")
            log_info "Tailscale state: Running"
            ;;
        "NeedsLogin")
            log_error "Tailscale needs login"
            log_error "Run: sudo tailscale up"
            return 1
            ;;
        "Stopped")
            log_error "Tailscale is stopped"
            log_error "Run: sudo tailscale up"
            return 1
            ;;
        *)
            log_warn "Tailscale state: $backend_state"
            ;;
    esac

    # Check if we have a Tailscale IP
    local tailscale_ips
    tailscale_ips=$(echo "$status_json" | jq -r '.Self.TailscaleIPs // [] | .[]' 2>/dev/null)
    
    if [[ -z "$tailscale_ips" ]]; then
        log_error "No Tailscale IP assigned"
        return 1
    fi

    log_info "Tailscale IPs: $(echo "$tailscale_ips" | tr '\n' ' ')"

    # Get DNS name
    local dns_name
    dns_name=$(echo "$status_json" | jq -r '.Self.DNSName // ""' 2>/dev/null | sed 's/\.$//')
    if [[ -n "$dns_name" ]]; then
        log_info "Tailscale DNS: $dns_name"
    fi
}

# Check tailscale0 interface exists
check_tailscale_interface() {
    if ! ip link show tailscale0 &>/dev/null; then
        log_warn "tailscale0 interface not found (may use userspace networking)"
    else
        local state
        state=$(ip -j link show tailscale0 | jq -r '.[0].operstate // "UNKNOWN"')
        log_info "tailscale0 interface: $state"
    fi
}

# Get current Tailscale IP for binding
get_tailscale_ip() {
    local status_json
    status_json=$(tailscale status --json 2>/dev/null)
    echo "$status_json" | jq -r '.Self.TailscaleIPs[0] // empty'
}

# Get Tailscale DNS name
get_tailscale_dns() {
    local status_json
    status_json=$(tailscale status --json 2>/dev/null)
    echo "$status_json" | jq -r '.Self.DNSName // empty' | sed 's/\.$//'
}

# Verify exit node (if configured)
check_exit_node() {
    local status_json
    status_json=$(tailscale status --json 2>/dev/null)
    
    local exit_node
    exit_node=$(echo "$status_json" | jq -r '.ExitNodeStatus.Online // false')
    
    if [[ "$exit_node" == "true" ]]; then
        local exit_node_ip
        exit_node_ip=$(echo "$status_json" | jq -r '.ExitNodeStatus.TailscaleIPs[0] // "unknown"')
        log_info "Exit node: active ($exit_node_ip)"
    else
        log_info "Exit node: not configured"
    fi
}

# Main preflight check
main() {
    local mode="${1:-check}"
    
    echo "═══════════════════════════════════════════════════════"
    echo "  ClosedClaw Tailscale Pre-flight Check"
    echo "═══════════════════════════════════════════════════════"
    echo ""

    case "$mode" in
        check)
            check_tailscale_binary || exit 1
            check_tailscaled_service || exit 1
            check_tailscale_status || exit 1
            check_tailscale_interface
            check_exit_node
            echo ""
            echo -e "${GREEN}✓ Tailscale pre-flight check passed${NC}"
            ;;
        ip)
            get_tailscale_ip
            ;;
        dns)
            get_tailscale_dns
            ;;
        wait)
            # Wait for Tailscale to be ready (with timeout)
            local timeout="${2:-60}"
            local elapsed=0
            log_info "Waiting for Tailscale (timeout: ${timeout}s)..."
            
            while [[ $elapsed -lt $timeout ]]; do
                if tailscale status --json 2>/dev/null | jq -e '.BackendState == "Running"' &>/dev/null; then
                    log_info "Tailscale ready after ${elapsed}s"
                    exit 0
                fi
                sleep 1
                ((elapsed++))
            done
            
            log_error "Timeout waiting for Tailscale"
            exit 1
            ;;
        *)
            echo "Usage: $0 [check|ip|dns|wait [timeout_seconds]]"
            echo ""
            echo "Commands:"
            echo "  check  - Run full pre-flight check (default)"
            echo "  ip     - Output Tailscale IPv4 address"
            echo "  dns    - Output Tailscale DNS name"
            echo "  wait   - Wait for Tailscale to be ready"
            exit 1
            ;;
    esac
}

main "$@"
