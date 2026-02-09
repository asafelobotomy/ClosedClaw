#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${ClosedClaw_INSTALL_E2E_IMAGE:-${CLAWDBOT_INSTALL_E2E_IMAGE:-ClosedClaw-install-e2e:local}}"
INSTALL_URL="${ClosedClaw_INSTALL_URL:-${CLAWDBOT_INSTALL_URL:-https://ClosedClaw.bot/install.sh}}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_API_TOKEN="${ANTHROPIC_API_TOKEN:-}"
ClosedClaw_E2E_MODELS="${ClosedClaw_E2E_MODELS:-${CLAWDBOT_E2E_MODELS:-}}"

echo "==> Build image: $IMAGE_NAME"
docker build \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/scripts/docker/install-sh-e2e/Dockerfile" \
  "$ROOT_DIR/scripts/docker/install-sh-e2e"

echo "==> Run E2E installer test"
docker run --rm \
  -e ClosedClaw_INSTALL_URL="$INSTALL_URL" \
  -e ClosedClaw_INSTALL_TAG="${ClosedClaw_INSTALL_TAG:-${CLAWDBOT_INSTALL_TAG:-latest}}" \
  -e ClosedClaw_E2E_MODELS="$ClosedClaw_E2E_MODELS" \
  -e ClosedClaw_INSTALL_E2E_PREVIOUS="${ClosedClaw_INSTALL_E2E_PREVIOUS:-${CLAWDBOT_INSTALL_E2E_PREVIOUS:-}}" \
  -e ClosedClaw_INSTALL_E2E_SKIP_PREVIOUS="${ClosedClaw_INSTALL_E2E_SKIP_PREVIOUS:-${CLAWDBOT_INSTALL_E2E_SKIP_PREVIOUS:-0}}" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e ANTHROPIC_API_TOKEN="$ANTHROPIC_API_TOKEN" \
  "$IMAGE_NAME"
