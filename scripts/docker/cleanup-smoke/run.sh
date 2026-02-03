#!/usr/bin/env bash
set -euo pipefail

cd /repo

export ClosedClaw_STATE_DIR="/tmp/ClosedClaw-test"
export ClosedClaw_CONFIG_PATH="${ClosedClaw_STATE_DIR}/ClosedClaw.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${ClosedClaw_STATE_DIR}/credentials"
mkdir -p "${ClosedClaw_STATE_DIR}/agents/main/sessions"
echo '{}' >"${ClosedClaw_CONFIG_PATH}"
echo 'creds' >"${ClosedClaw_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${ClosedClaw_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm ClosedClaw reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${ClosedClaw_CONFIG_PATH}"
test ! -d "${ClosedClaw_STATE_DIR}/credentials"
test ! -d "${ClosedClaw_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${ClosedClaw_STATE_DIR}/credentials"
echo '{}' >"${ClosedClaw_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm ClosedClaw uninstall --state --yes --non-interactive

test ! -d "${ClosedClaw_STATE_DIR}"

echo "OK"
