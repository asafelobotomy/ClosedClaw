#!/usr/bin/env bash
# ClosedClaw GTK Messenger - All-in-One Launcher
# This script starts the gateway and launches the GTK GUI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOCKET_PATH="/tmp/closedclaw-gtk.sock"
LOG_DIR="${HOME}/.ClosedClaw/logs"
PID_FILE="${HOME}/.ClosedClaw/gateway.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Cleanup function
cleanup() {
    log_info "Shutting down..."
    if [[ -f "$PID_FILE" ]]; then
        GATEWAY_PID=$(cat "$PID_FILE")
        if kill -0 "$GATEWAY_PID" 2>/dev/null; then
            log_info "Stopping gateway (PID: $GATEWAY_PID)..."
            kill "$GATEWAY_PID" 2>/dev/null || true
            sleep 1
            kill -9 "$GATEWAY_PID" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    rm -f "$SOCKET_PATH"
    log_success "Cleanup complete"
}

trap cleanup EXIT INT TERM

# Check dependencies
check_deps() {
    log_info "Checking dependencies..."
    
    # Python + GTK
    if ! command -v python3 &>/dev/null; then
        log_error "Python3 not found"
        exit 1
    fi
    
    python3 -c "import gi; gi.require_version('Gtk', '4.0'); gi.require_version('Adw', '1')" 2>/dev/null || {
        log_error "GTK4 or Libadwaita Python bindings not found"
        log_info "Install with: sudo pacman -S python-gobject gtk4 libadwaita"
        exit 1
    }
    
    # Node.js
    if ! command -v node &>/dev/null; then
        log_error "Node.js not found"
        exit 1
    fi
    
    log_success "All dependencies satisfied"
}

# Start the gateway
start_gateway() {
    log_info "Starting ClosedClaw gateway..."
    
    mkdir -p "$LOG_DIR"
    
    # Check if gateway is already running
    if [[ -f "$PID_FILE" ]]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            log_warn "Gateway already running (PID: $OLD_PID)"
            return 0
        fi
        rm -f "$PID_FILE"
    fi
    
    # Clean up stale socket
    rm -f "$SOCKET_PATH"
    
    cd "$PROJECT_ROOT"
    
    # Start gateway in background
    node openclaw.mjs gateway start > "$LOG_DIR/gateway.log" 2>&1 &
    GATEWAY_PID=$!
    echo "$GATEWAY_PID" > "$PID_FILE"
    
    log_info "Gateway starting (PID: $GATEWAY_PID)..."
    
    # Wait for socket to be created
    local max_wait=30
    local waited=0
    while [[ ! -S "$SOCKET_PATH" ]] && [[ $waited -lt $max_wait ]]; do
        sleep 0.5
        waited=$((waited + 1))
        
        # Check if gateway is still running
        if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
            log_error "Gateway crashed during startup. Check logs: $LOG_DIR/gateway.log"
            tail -20 "$LOG_DIR/gateway.log" 2>/dev/null || true
            exit 1
        fi
    done
    
    if [[ -S "$SOCKET_PATH" ]]; then
        log_success "Gateway ready - socket at $SOCKET_PATH"
    else
        log_warn "Socket not created after ${max_wait}s - gateway may still be initializing"
    fi
}

# Start GTK GUI
start_gui() {
    log_info "Launching GTK Messenger..."
    cd "$SCRIPT_DIR"
    python3 closedclaw_messenger.py
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     ClosedClaw GTK Messenger Launcher    ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
    echo ""
    
    check_deps
    start_gateway
    start_gui
}

# Parse arguments
case "${1:-}" in
    --gui-only)
        # Skip gateway, just launch GUI (for debugging)
        log_info "GUI-only mode - assuming gateway is already running"
        start_gui
        ;;
    --gateway-only)
        # Just start gateway (for debugging)
        check_deps
        start_gateway
        log_info "Gateway running. Press Ctrl+C to stop."
        while true; do sleep 1; done
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --gui-only      Launch only the GTK GUI (assume gateway running)"
        echo "  --gateway-only  Start only the gateway (no GUI)"
        echo "  --help, -h      Show this help"
        echo ""
        echo "Default: Start both gateway and GTK GUI"
        ;;
    *)
        main
        ;;
esac
