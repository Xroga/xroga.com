#!/usr/bin/env bash
# Set required Supabase secrets on Fly.io for xroga-api
#
# Usage:
#   ./scripts/setup-fly-auth.sh "https://YOUR_PROJECT.supabase.co" "your-service-role-key"
#
# Get values from Supabase Dashboard → Project Settings → API:
#   - Project URL  → SUPABASE_URL
#   - service_role → SUPABASE_SERVICE_ROLE_KEY (secret, server only)

set -euo pipefail

APP="${FLY_APP:-xroga-api}"
SUPABASE_URL="${1:-}"
SERVICE_ROLE_KEY="${2:-}"

export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

if [[ -z "$SUPABASE_URL" ]]; then
  echo "ERROR: Pass your Supabase Project URL (ends in .supabase.co)"
  echo ""
  echo "  ./scripts/setup-fly-auth.sh \"https://abcdefgh.supabase.co\" \"eyJ...service_role...\""
  echo ""
  echo "This is NOT the Site URL (xrogaaicom.vercel.app)."
  echo "Find it in Supabase → Project Settings → API → Project URL"
  exit 1
fi

if [[ ! "$SUPABASE_URL" =~ \.supabase\.co ]]; then
  echo "ERROR: SUPABASE_URL must be your Supabase project URL (https://xxx.supabase.co)"
  echo "You passed: $SUPABASE_URL"
  echo "Site URL (https://xrogaaicom.vercel.app) is only for login redirects in Supabase Auth settings."
  exit 1
fi

SECRETS=(SUPABASE_URL="$SUPABASE_URL" FRONTEND_URL="https://xrogaaicom.vercel.app")

if [[ -n "$SERVICE_ROLE_KEY" ]]; then
  SECRETS+=(SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY")
fi

echo "Setting Fly secrets on $APP..."
flyctl secrets set -a "$APP" "${SECRETS[@]}"

echo ""
echo "Deploying API..."
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
flyctl deploy . --config fly.api.toml -a "$APP"

echo ""
echo "Verify:"
echo "  curl https://xroga-api.fly.dev/health"
echo "  → should include \"authConfigured\":true"
echo ""
echo "Vercel must use the SAME Supabase project:"
echo "  NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
