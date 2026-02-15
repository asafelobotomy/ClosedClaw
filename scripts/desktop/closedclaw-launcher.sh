#!/usr/bin/env bash
# ClosedClaw Desktop Launcher
#
# Standalone script that starts the gateway (if not running) and launches
# the GTK GUI. Designed to be called from .desktop entries or AppImage.
#
# Environment:
#   ClosedClaw_GATEWAY_PORT  Gateway HTTP port (default: 18789)
#   ClosedClaw_GATEWAY_TOKEN Gateway auth token (auto-generated if missing)

set -euo pipefail

GATEWAY_PORT="${ClosedClaw_GATEWAY_PORT:-18789}"
STATE_DIR="${HOME}/.ClosedClaw"
PID_FILE="${STATE_DIR}/gateway.pid"
LOG_DIR="${STATE_DIR}/logs"
SOCKET_PATH="/tmp/closedclaw-gtk.sock"

# --- Colours ----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[closedclaw]${NC} $1"; }
ok()    { echo -e "${GREEN}[closedclaw]${NC} $1"; }
warn()  { echo -e "${YELLOW}[closedclaw]${NC} $1"; }
err()   { echo -e "${RED}[closedclaw]${NC} $1" >&2; }

# --- Find closedclaw binary -------------------------------------------------
resolve_cli() {
  if command -v closedclaw &>/dev/null; then
    echo "closedclaw"
    return
  fi
  # From-source: try pnpm/npx in project root
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local project_root
  project_root="$(cd "$script_dir/../.." && pwd)"
  if [[ -f "$project_root/closedclaw.mjs" ]]; then
    echo "node $project_root/tools/dev/run-node.mjs"
    return
  fi
  err "closedclaw CLI not found. Install with: npm install -g closedclaw"
  exit 1
}

# --- Cleanup ----------------------------------------------------------------
cleanup() {
  info "Shutting down..."
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  rm -f "$SOCKET_PATH"
  ok "Cleanup complete."
}

trap cleanup EXIT INT TERM

# --- Dependency check -------------------------------------------------------
check_deps() {
  if ! command -v python3 &>/dev/null; then
    err "Python3 not found."
    exit 1
  fi
  python3 -c "import gi; gi.require_version('Gtk', '4.0'); gi.require_version('Adw', '1')" 2>/dev/null || {
    err "GTK4 or Libadwaita Python bindings not found."
    info "Install with: sudo apt install python3-gi gir1.2-gtk-4.0 gir1.2-adw-1"
    exit 1
  }
  if ! command -v node &>/dev/null; then
    err "Node.js not found (need >=22)."
    exit 1
  fi
}

# --- Gateway ----------------------------------------------------------------
gateway_alive() {
  curl -sf "http://127.0.0.1:${GATEWAY_PORT}/health" >/dev/null 2>&1
}

start_gateway() {
  if gateway_alive; then
    ok "Gateway already running on port $GATEWAY_PORT."
    return
  fi

  # Stale PID file
  if [[ -f "$PID_FILE" ]]; then
    local old_pid
    old_pid=$(cat "$PID_FILE")
    if ! kill -0 "$old_pid" 2>/dev/null; then
      rm -f "$PID_FILE"
    fi
  fi

  mkdir -p "$LOG_DIR"
  rm -f "$SOCKET_PATH"

  # Auto-generate token if missing
  if [[ -z "${ClosedClaw_GATEWAY_TOKEN:-}" ]]; then
    export ClosedClaw_GATEWAY_TOKEN="launch-$(date +%s)-$(head -c16 /dev/urandom | xxd -p)"
  fi

  local cli
  cli=$(resolve_cli)

  info "Starting gateway (port $GATEWAY_PORT)..."
  ClosedClaw_GATEWAY_TOKEN="$ClosedClaw_GATEWAY_TOKEN" \
    $cli gateway --port "$GATEWAY_PORT" \
    > "$LOG_DIR/gateway-launch.log" 2>&1 &
  local gw_pid=$!
  echo "$gw_pid" > "$PID_FILE"

  # Wait for readiness
  local elapsed=0
  while ! gateway_alive && (( elapsed < 30 )); do
    sleep 0.5
    elapsed=$((elapsed + 1))
  done

  if gateway_alive; then
    ok "Gateway ready (PID $gw_pid, port $GATEWAY_PORT)."
  else
    err "Gateway failed to start within 15s. Check $LOG_DIR/gateway-launch.log"
    exit 1
  fi
}

# --- GTK GUI ----------------------------------------------------------------
start_gui() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local gui_script="${script_dir}/../../apps/gtk-gui/closedclaw_messenger.py"

  if [[ ! -f "$gui_script" ]]; then
    gui_script="$(dirname "$(command -v closedclaw 2>/dev/null || true)")/../../apps/gtk-gui/closedclaw_messenger.py"
  fi

  if [[ ! -f "$gui_script" ]]; then
    err "GTK GUI script not found."
    exit 1
  fi

  export GSK_RENDERER=cairo
  info "Launching GTK GUI..."
  cd "$(dirname "$gui_script")"
  python3 "$gui_script"
}

# --- Main -------------------------------------------------------------------
main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║     ClosedClaw Desktop Launcher      ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
  echo ""

  check_deps
  start_gateway
  start_gui
}

case "${1:-}" in
  --gui-only)
    check_deps
    start_gui
    ;;
  --gateway-only)
    check_deps
    start_gateway
    info "Gateway running. Press Ctrl+C to stop."
    while true; do sleep 1; done
    ;;
  --help|-h)
    echo "Usage: $0 [--gui-only | --gateway-only | --help]"
    echo ""
    echo "  (no args)       Start gateway + GTK GUI"
    echo "  --gui-only      Only launch GTK GUI (gateway already running)"
    echo "  --gateway-only  Only start gateway"
    echo "  --help, -h      Show this help"
    echo ""
    echo "Environment:"
    echo "  ClosedClaw_GATEWAY_PORT   Gateway HTTP port (default: 18789)"
    echo "  ClosedClaw_GATEWAY_TOKEN  Auth token (auto-generated if missing)"
    ;;
  *)
    main
    ;;
esac
