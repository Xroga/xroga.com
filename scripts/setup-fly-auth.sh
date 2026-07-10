#!/usr/bin/env bash
# One-command Fly.io setup for xroga-api auth
#
# Usage:
#   ./scripts/setup-fly-auth.sh \
#     "https://YOUR_PROJECT.supabase.co" \
#     "your-jwt-secret" \
#     "your-service-role-key" \
#     "your-database-password"
#
# Get all three from Supabase → Project Settings → API:
#   - Project URL        → arg 1
#   - JWT Secret         → arg 2  (Settings → API → JWT Settings)
#   - service_role key   → arg 3

set -euo pipefail

APP="${FLY_APP:-xroga-api}"
SUPABASE_URL="${1:-}"
JWT_SECRET="${2:-}"
SERVICE_ROLE_KEY="${3:-}"
DB_PASSWORD="${4:-}"

export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

if [[ -z "$SUPABASE_URL" ]]; then
  echo "Usage: $0 SUPABASE_URL JWT_SECRET SERVICE_ROLE_KEY"
  exit 1
fi

SECRETS=(
  SUPABASE_URL="$SUPABASE_URL"
  FRONTEND_URL="https://xroga.com"
)

[[ -n "$JWT_SECRET" ]] && SECRETS+=(SUPABASE_JWT_SECRET="$JWT_SECRET")
[[ -n "$SERVICE_ROLE_KEY" ]] && SECRETS+=(SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY")
[[ -n "$DB_PASSWORD" ]] && SECRETS+=(SUPABASE_DB_PASSWORD="$DB_PASSWORD")

echo "Setting secrets on $APP..."
flyctl secrets set -a "$APP" "${SECRETS[@]}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "Deploying..."
flyctl deploy . --config fly.api.toml -a "$APP" --remote-only

echo ""
echo "Test: curl https://xroga-api.fly.dev/health"
echo "Expected: version 1.0.1, authConfigured true, jwtConfigured true"
