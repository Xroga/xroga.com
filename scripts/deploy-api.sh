#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

cd "$ROOT"
echo "Deploying xroga-api from monorepo root..."
flyctl deploy . --config fly.api.toml -a xroga-api "$@"
