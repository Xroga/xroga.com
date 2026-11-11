#!/usr/bin/env bash
set -euo pipefail

# GitHub's hosted Ubuntu image prioritizes its Azure mirror. Use the existing
# Canonical entries when present so APT cannot get stuck on that mirror's DNS.
# This leaves APT sources, suites and archive signature verification intact.
mirrors=/etc/apt/apt-mirrors.txt
if [[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && -f "$mirrors" ]] &&
   grep -Eq '^https://archive[.]ubuntu[.]com/ubuntu/?([[:space:]]|$)' "$mirrors" &&
   grep -Eq '^https?://azure[.]archive[.]ubuntu[.]com/ubuntu/?([[:space:]]|$)' "$mirrors"; then
  echo 'Using Canonical archive mirrors for Playwright system dependencies.'
  sudo sed -i -E '\,^https?://azure[.]archive[.]ubuntu[.]com/ubuntu/?([[:space:]]|$),d' "$mirrors"
fi

node node_modules/@playwright/test/cli.js install --with-deps chromium
