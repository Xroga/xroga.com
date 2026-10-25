#!/usr/bin/env bash
# Prepares a fresh Ubuntu 22.04/24.04 host (amd64 or arm64) to run collect-host-evidence.sh. Run as the default sudo-capable user.
#
#   bash scripts/browser/prepare-host.sh
#
# Installs Docker from the Ubuntu archive and Node 22.21.1 (the repository's pinned toolchain) from nodejs.org, verified against its SHASUMS256.txt.
# Then runs `npm ci` in this checkout. It reads no secret and configures nothing else on the host.
set -euo pipefail
NODE_VERSION=22.21.1
case "$(uname -m)" in x86_64) narch=x64;; aarch64|arm64) narch=arm64;; *) echo "unsupported arch $(uname -m)" >&2; exit 2;; esac
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io git curl xz-utils python3 >/dev/null
sudo usermod -aG docker "$USER"
if ! node --version 2>/dev/null | grep -qx "v$NODE_VERSION"; then
  tmp=$(mktemp -d); f="node-v$NODE_VERSION-linux-$narch.tar.xz"
  curl -fsSLo "$tmp/$f" "https://nodejs.org/dist/v$NODE_VERSION/$f"
  curl -fsSLo "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  (cd "$tmp" && grep " $f\$" SHASUMS256.txt | sha256sum -c -)
  sudo tar -xJf "$tmp/$f" -C /usr/local --strip-components=1
  rm -rf "$tmp"
fi
cd "$(git rev-parse --show-toplevel)"
npm ci --no-audit --no-fund
echo "ready: $(uname -m), $(node --version), docker $(sudo docker version --format '{{.Server.Version}}'). Log out and back in (docker group), then run collect-host-evidence.sh."
