#!/usr/bin/env bash
# closedclaw-launcher.sh — Standalone launcher for ClosedClaw (GTK GUI + Gateway)
#
# Starts the gateway in the background (if not already running),
# waits for it to become ready, then launches the GTK desktop GUI.
#
# Usage:
#   ./closedclaw-launcher.sh [--gui-only] [--gateway-only] [--help]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_DIR="${ClosedClaw_STATE_DIR:-$HOME/.ClosedClaw}"
PORT="${ClosedClaw_GATEWAY_PORT:-18789}"
GUI_SCRIPT="$REPO_ROOT/apps/gtk-gui/closedclaw_messenger.py"
PID_FILE="$STATE_DIR/gateway.pid"
LOG_DIR="$STATE_DIR/logs"

GUI_ONLY=false
GATEWAY_ONLY=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --gui-only       Only launch the GTK GUI (assume gateway is running)
  --gateway-only   Only start the gateway (no GUI)
  --port <port>    Override gateway port (default: $PORT)
  --help           Show this message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gui-only) GUI_ONLY=true; shift ;;
    --gateway-only) GATEWAY_ONLY=true; shift ;;
    --port) PORT="${2:?--port requires a value}"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# --- Dependency checks ---
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: $1 is required but not found." >&2
    exit 1
  fi
}
check_dep python3
check_dep node
check_dep curl

# --- Token management ---
ensure_token() {
  if [[ -n "${ClosedClaw_GATEWAY_TOKEN:-}" ]]; then
    return
  fi
  # Try to read from config
  local config_file="$STATE_DIR/config.json5"
  if [[ -f "$config_file" ]]; then
    local token
    token=$(grep -oP '"token"\s*:\s*"\K[^"]+' "$config_file" 2>/dev/null | head -1 || true)
    if [[ -n "$token" ]]; then
      export ClosedClaw_GATEWAY_TOKEN="$token"
      return
    fi
  fi
  # Generate a new token
  export ClosedClaw_GATEWAY_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
  echo "Generated gateway token."
}

# --- Gateway management ---
is_gateway_running() {
  curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1
}

start_gateway() {
  mkdir -p "$LOG_DIR"

  # Check for stale PID file
  if [[ -f "$PID_FILE" ]]; then
    local old_pid
    old_pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "Gateway already running (PID $old_pid)."
      return
    fi
    rm -f "$PID_FILE"
  fi

  echo "Starting gateway on port $PORT..."
  local entry="$REPO_ROOT/closedclaw.mjs"
  if [[ ! -f "$entry" ]]; then
    echo "Error: Gateway entry point not found at $entry" >&2
    exit 1
  fi

  ClosedClaw_GATEWAY_TOKEN="$ClosedClaw_GATEWAY_TOKEN" \
    nohup node "$entry" gateway --port "$PORT" \
    > "$LOG_DIR/gateway-launch.log" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  echo "Gateway started (PID $pid). Log: $LOG_DIR/gateway-launch.log"
}

wait_for_gateway() {
  local timeout=15
  local elapsed=0
  echo -n "Waiting for gateway to become ready..."
  while ! is_gateway_running; do
    if (( elapsed >= timeout )); then
      echo " TIMEOUT"
      echo "Error: Gateway did not become ready within ${timeout}s." >&2
      exit 1
    fi
    sleep 0.5
    elapsed=$((elapsed + 1))
    echo -n "."
  done
  echo " ready!"
}

# --- Cleanup ---
cleanup() {
  if [[ -n "${GATEWAY_PID:-}" ]]; then
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- Main ---
ensure_token

if [[ "$GUI_ONLY" != "true" ]]; then
  if is_gateway_running; then
    echo "Gateway already running on port $PORT."
  else
    start_gateway
    wait_for_gateway
  fi
fi

if [[ "$GATEWAY_ONLY" != "true" ]]; then
  if [[ ! -f "$GUI_SCRIPT" ]]; then
    echo "Error: GTK GUI not found at $GUI_SCRIPT" >&2
    exit 1
  fi

  echo "Launching GTK GUI..."
  export ClosedClaw_GATEWAY_PORT="$PORT"
  export GSK_RENDERER=cairo
  exec python3 "$GUI_SCRIPT"
else
  echo "Gateway-only mode. Press Ctrl+C to stop."
  wait
fi
