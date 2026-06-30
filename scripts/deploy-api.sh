#!/usr/bin/env bash
# Deploy xroga-api to Fly.io from monorepo root and verify /chat works.
#
# Usage: ./scripts/deploy-api.sh
set -euo pipefail

APP="${FLY_APP:-xroga-api}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

cd "$ROOT"

echo "==> Pulling latest main..."
git pull origin main

echo "==> Deploying $APP (Dockerfile.api from repo root)..."
flyctl auth docker
IMAGE="registry.fly.io/${APP}:${GITHUB_SHA:-latest}"
docker build -f Dockerfile.api -t "$IMAGE" .
docker push "$IMAGE"
flyctl deploy --config fly.api.toml -a "$APP" --image "$IMAGE" --ha=false

echo "==> Waiting for health..."
sleep 8

HEALTH=$(curl -sS "https://${APP}.fly.dev/health" || true)
echo "$HEALTH"

VERSION=$(echo "$HEALTH" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
if [[ "$VERSION" == "1.0.0" ]]; then
  echo "ERROR: Still on v1.0.0 — deploy may have failed or wrong image."
  exit 1
fi

CHAT=$(curl -sS -o /tmp/chat-test.json -w "%{http_code}" -X POST "https://${APP}.fly.dev/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"hi","userId":"00000000-0000-0000-0000-000000000001"}')
echo "POST /chat HTTP $CHAT"
cat /tmp/chat-test.json
echo

if [[ "$CHAT" == "404" ]]; then
  echo "ERROR: /chat still 404. Deploy from REPO ROOT, not backend/:"
  echo "  cd /path/to/xroga.com && fly deploy . --config fly.api.toml -a xroga-api"
  exit 1
fi

echo "Deploy OK. Version: $VERSION"
