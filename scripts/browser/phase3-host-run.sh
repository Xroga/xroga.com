#!/usr/bin/env bash
# Phase 3 release verification ON a Compute Engine browser host (run after prepare-host.sh, as the VM's default user).
#
#   bash scripts/browser/phase3-host-run.sh <GCE_HOST_TESTED|ARM64_HOST_TESTED|AMD64_HOST_TESTED> [--testbed https://...]
#
# 1. builds the release images here and records their digests;
# 2. W11 + W14: the accepted Phase 2 host battery (sandbox, conformance, six weakened variants, 21 egress checks, both weakened network
#    controls) on the FINAL image, judged by the unchanged evaluator;
# 3. the AI-mode DevTools attack battery on the final image;
# 4. the workflow suite on the full Xroga path (model and R2 workflows run only if their founder-provided files are present on this host).
# Writes out/phase3-host-<label>-<utc>/ with SHA256SUMS. No secret is printed.
set -euo pipefail
label="${1:?label}"; shift || true
cd "$(git rev-parse --show-toplevel)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"; out="out/phase3-host-${label}-${stamp}"; mkdir -p "$out"
{ echo "commit=$(git rev-parse HEAD)"; echo "tree=$([ -z "$(git status --porcelain --untracked-files=no)" ] && echo clean || echo dirty)"; echo "host=$(hostname)"; echo "arch=$(uname -m)"; } > "$out/source.txt"
docker build -q -t xroga-browser-worker:phase3 deploy/browser-worker > "$out/browser-image-id.txt"
npx tsx scripts/browser/build-proxy-image.mts --tag xroga-egress-proxy:phase2-test > /dev/null
docker image inspect -f '{{.Id}} {{.Architecture}} {{.Os}}' xroga-browser-worker:phase3 xroga-egress-proxy:phase2-test > "$out/images.txt"
docker tag xroga-browser-worker:phase3 xroga-browser-worker:phase2-probe
set +e
bash scripts/browser/collect-host-evidence.sh "$label" > "$out/host-battery.log" 2>&1; echo "exit=$?" >> "$out/host-battery.log"
cp -r "$(ls -td out/host-evidence-* | head -1)" "$out/host-battery" 2>/dev/null
npx tsx scripts/browser/verify-ai-devtools-isolation.mts --label "$label" --out "$out/ai-devtools-isolation.json" > "$out/ai-devtools.log" 2>&1; echo "exit=$?" >> "$out/ai-devtools.log"
npx tsx scripts/browser/run-workflows.mts --label "$label" --out "$out/workflows.json" "$@" > "$out/workflows.log" 2>&1; echo "exit=$?" >> "$out/workflows.log"
set -e
( cd "$out" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )
echo "{\"out\":\"$out\",\"hostBattery\":\"$(tail -1 "$out/host-battery.log")\",\"aiDevtools\":\"$(tail -1 "$out/ai-devtools.log")\",\"workflows\":\"$(grep -o '[0-9]*/[0-9]* receipts PASS' "$out/workflows.log" | tail -1)\"}"
