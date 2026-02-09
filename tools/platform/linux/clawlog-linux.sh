#!/usr/bin/env bash
#
# clawlog-linux.sh - View ClosedClaw logs on Linux
#
# Usage:
#   ./clawlog-linux.sh           # Tail live logs
#   ./clawlog-linux.sh -f        # Follow (tail -f)
#   ./clawlog-linux.sh -n 100    # Last 100 lines
#   ./clawlog-linux.sh --json    # Raw JSON output
#   ./clawlog-linux.sh --file    # Use file logs instead of journald
#

set -euo pipefail

LOG_FILE="$HOME/.closedclaw/logs/closedclaw.log"
USE_JOURNALD=true
FOLLOW=false
NUM_LINES=50
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            NUM_LINES="$2"
            shift 2
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --file)
            USE_JOURNALD=false
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --follow    Follow log output (like tail -f)"
            echo "  -n, --lines N   Show last N lines (default: 50)"
            echo "  --json          Raw JSON output (no formatting)"
            echo "  --file          Use file logs instead of journald"
            echo "  -h, --help      Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if $USE_JOURNALD; then
    # Use systemd journal
    if $FOLLOW; then
        if $JSON_OUTPUT; then
            journalctl --user -u closedclaw-gateway -f -o json
        else
            journalctl --user -u closedclaw-gateway -f --no-pager
        fi
    else
        if $JSON_OUTPUT; then
            journalctl --user -u closedclaw-gateway -n "$NUM_LINES" -o json
        else
            journalctl --user -u closedclaw-gateway -n "$NUM_LINES" --no-pager
        fi
    fi
else
    # Use file-based logs
    if [[ ! -f "$LOG_FILE" ]]; then
        echo "Log file not found: $LOG_FILE"
        echo "Gateway may not have started yet, or file logging is disabled."
        exit 1
    fi
    
    if $FOLLOW; then
        if $JSON_OUTPUT; then
            tail -f "$LOG_FILE"
        else
            tail -f "$LOG_FILE" | while read -r line; do
                # Pretty print JSON logs
                echo "$line" | jq -r '. | "\(.timestamp) [\(.level)] \(.subsystem): \(.message)"' 2>/dev/null || echo "$line"
            done
        fi
    else
        if $JSON_OUTPUT; then
            tail -n "$NUM_LINES" "$LOG_FILE"
        else
            tail -n "$NUM_LINES" "$LOG_FILE" | while read -r line; do
                echo "$line" | jq -r '. | "\(.timestamp) [\(.level)] \(.subsystem): \(.message)"' 2>/dev/null || echo "$line"
            done
        fi
    fi
fi
