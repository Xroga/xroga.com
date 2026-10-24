#!/usr/bin/env bash
# One command that produces the complete, checksummed evidence bundle for ONE host and judges it.
#
#   bash scripts/browser/collect-host-evidence.sh OCI_HOST_TESTED      # on an OCI instance
#   bash scripts/browser/collect-host-evidence.sh ARM64_HOST_TESTED    # on any native ARM64 Docker host
#   bash scripts/browser/collect-host-evidence.sh AMD64_HOST_TESTED
#
# Needs: Docker, git, Node 22 and `npm ci` already run in this checkout, outbound HTTPS. It uses no secret and no cloud credential.
# Refuses to run on a dirty tree (the evidence must name an exact source), and refuses the OCI label unless the instance metadata service answers.
# Output: out/host-evidence-<host>-<utc>/ containing the files evaluate-host-evidence.mjs reads, plus SUMMARY.json. Send that folder back unchanged.
set -euo pipefail
label="${1:?usage: collect-host-evidence.sh OCI_HOST_TESTED|ARM64_HOST_TESTED|AMD64_HOST_TESTED}"
case "$label" in OCI_HOST_TESTED|ARM64_HOST_TESTED|AMD64_HOST_TESTED) ;; *) echo "unknown label: $label" >&2; exit 2;; esac
cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "refusing: the working tree has uncommitted changes, so the evidence could not name an exact source" >&2; exit 2; fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="out/host-evidence-$(hostname | cut -d. -f1)-$stamp"
mkdir -p "$out"
{ echo "commit=$(git rev-parse HEAD)"; echo "tree=clean"; echo "collected=$stamp"; } > "$out/source.txt"
bash deploy/browser-worker/host-facts.sh > "$out/host-facts.json"
if [ "$label" = OCI_HOST_TESTED ] && ! grep -q '"shape": "' "$out/host-facts.json"; then
  echo "refusing: the OCI label needs the instance metadata service to report a shape, and it did not. This is not an OCI instance." >&2; exit 2
fi
docker build -q -t xroga-browser-worker:phase2-probe deploy/browser-worker >/dev/null
npx tsx scripts/browser/build-proxy-image.mts
set +e
node deploy/browser-worker/derive-seccomp.mjs --check > "$out/seccomp-check.txt" 2>&1; echo "exit=$?" >> "$out/seccomp-check.txt"
npx tsx scripts/browser/run-sandbox-probe.mts       --label "$label" --out "$out/sandbox-probe.json"    > "$out/sandbox-probe.stdout" 2>&1; echo "exit=$?" >> "$out/sandbox-probe.stdout"
npx tsx scripts/browser/verify-egress-isolation.mts --label "$label" --out "$out/egress-isolation.json" > "$out/egress-isolation.stdout" 2>&1; echo "exit=$?" >> "$out/egress-isolation.stdout"
set -e
( cd "$out" && sha256sum host-facts.json sandbox-probe.json egress-isolation.json seccomp-check.txt source.txt sandbox-probe.stdout egress-isolation.stdout > SHA256SUMS )
node scripts/browser/evaluate-host-evidence.mjs "$out" --label "$label" --repo . | tee "$out/SUMMARY.json"
