#!/usr/bin/env bash
# Set all required secrets on Fly.io for xroga-api (production: xroga.com)
#
# Usage:
#   ./scripts/setup-fly-auth.sh \
#     "https://YOUR_PROJECT.supabase.co" \
#     "your-service-role-key"

set -euo pipefail

APP="${FLY_APP:-xroga-api}"
SUPABASE_URL="${1:-}"
SERVICE_ROLE_KEY="${2:-}"

export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

if [[ -z "$SUPABASE_URL" ]]; then
  echo "Usage: ./scripts/setup-fly-auth.sh \"https://xxx.supabase.co\" \"service_role_key\""
  echo ""
  echo "Get these from Supabase → Project Settings → API"
  exit 1
fi

if [[ ! "$SUPABASE_URL" =~ \.supabase\.co ]]; then
  echo "ERROR: SUPABASE_URL must be https://xxx.supabase.co (not your Site URL xroga.com)"
  exit 1
fi

SECRETS=(
  SUPABASE_URL="$SUPABASE_URL"
  FRONTEND_URL="https://xroga.com"
)

if [[ -n "$SERVICE_ROLE_KEY" ]]; then
  SECRETS+=(SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY")
fi

echo "Setting Fly secrets on $APP..."
flyctl secrets set -a "$APP" "${SECRETS[@]}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "Deploying API..."
flyctl deploy . --config fly.api.toml -a "$APP"

echo ""
echo "Verify: curl https://xroga-api.fly.dev/health"
echo "Vercel env: NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
echo "            NEXT_PUBLIC_API_URL=https://xroga-api.fly.dev"
echo "            NEXT_PUBLIC_SITE_URL=https://xroga.com"
