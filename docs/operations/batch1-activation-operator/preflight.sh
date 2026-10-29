#!/usr/bin/env bash
# Read-only host preflight. Does not access backup data, credentials, or change configuration.
set -u
printf 'XROGA_BATCH1_PREFLIGHT_V1\n'
if command -v gcloud >/dev/null 2>&1; then
  project=$(timeout 15s gcloud config get-value project 2>/dev/null || true)
  active=$(timeout 15s gcloud auth list --filter=status:ACTIVE --format='value(status)' 2>/dev/null | wc -l | tr -d ' ')
  printf 'CONFIGURED_PROJECT=%s\nACTIVE_ACCOUNT_COUNT=%s\n' "${project:-unset}" "$active"
else
  printf 'GCLOUD=UNAVAILABLE\n'
fi
if [ -r /proc/swaps ]; then
  swap_count=$(awk 'NR>1 {n++} END {print n+0}' /proc/swaps)
  printf 'HOST_SWAP_DEVICES=%s\n' "$swap_count"
else
  printf 'HOST_SWAP_DEVICES=UNKNOWN\n'
fi
df -Pk "$HOME" | awk 'NR==2 {printf "HOME_FREE_KIB=%s\n", $4}'
if command -v docker >/dev/null 2>&1 && timeout 15s docker info >/dev/null 2>&1; then
  printf 'DOCKER_DAEMON=AVAILABLE\n'
else
  printf 'DOCKER_DAEMON=UNAVAILABLE\n'
fi
printf 'BACKUP_ACCESS=NOT_TESTED\nRESTORE_COMPATIBILITY=NOT_TESTED\nPRODUCTION_CHANGES=NONE\n'
