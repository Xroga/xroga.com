#!/usr/bin/env bash
# Apply all Supabase migrations to a linked project.
# Requires: supabase CLI logged in + project linked
#
#   export SUPABASE_ACCESS_TOKEN=...
#   supabase login
#   supabase link --project-ref YOUR_PROJECT_REF
#   ./scripts/supabase-db-push.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Installing Supabase CLI..."
  curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [[ ! -f supabase/config.toml ]]; then
  echo "ERROR: supabase/config.toml not found"
  exit 1
fi

echo "Pushing migrations to linked Supabase project..."
supabase db push

echo "Done. Migrations applied."
