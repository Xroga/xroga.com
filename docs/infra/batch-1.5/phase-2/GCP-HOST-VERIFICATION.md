# Browser host verification on Google Cloud (replaces the OCI procedure)

Founder decision, 2026-10-24: OCI is no longer selected; Batch 1.5 Phase 2 uses Google Cloud. No Oracle resource was created at any point. `OCI-SANDBOX-VERIFICATION.md` is superseded by this page.

## Requirements that referenced OCI, and their Google Cloud replacement
| Criterion (acceptance matrix) | Original wording | Replacement | Why it is equivalent |
|---|---|---|---|
| 15 Non-root; Chromium sandbox ON | "on the target host" = OCI compute | the same probe on a **Compute Engine VM** (`GCE_HOST_TESTED`) | identical container spec, image and checks; only the host provider changes |
| 16 seccomp, capabilities, limits, isolation | target host = OCI | the same 12 conformance checks and six weakened variants on Compute Engine | same |
| 18 Egress policy and browser-to-proxy isolation | target host = OCI | the same 21-check battery with the production proxy and both weakened controls on Compute Engine | same |
| 19 AMD64/ARM64 proof before choosing a shape | Ampere A1 (OCI) for ARM64 | native ARM64 on **Tau T2A** (`t2a-standard-2`) and AMD64 on `e2-standard-2`, both Compute Engine | real hardware of each architecture, no emulation; the evaluator rejects any emulated or mismatched run |

## Why not Cloud Run for the browser worker
Cloud Run is the right Google Cloud target for supported AMD64 workloads such as the trusted API, but it cannot express the reviewed browser-worker spec:
no custom seccomp profile, no capability bounding control beyond its own sandbox, no Docker `--internal` network with the egress proxy as the only peer, and no read-only root with the
reviewed tmpfs flags. Acceptance criteria 15, 16 and 18 are defined by that spec, so a Cloud Run result would be a different, weaker claim. The browser worker therefore runs on Compute
Engine (Docker on Ubuntu 24.04), where the spec applies unchanged. **No Cloud Run result is presented as satisfying a host criterion, and nothing on Cloud Run is presented as ARM64.**

## Is ARM64 still a requirement?
Criterion 19 came from the handoff ("AMD64/ARM64 proof before choosing a shape"). It existed because the cheapest OCI shape was ARM64. On Google Cloud the natural shape is AMD64,
so ARM64 is now an *option*, not a necessity. Two ways to close it, for the founder:
- **A (recommended, no matrix change):** run the same evidence on `t2a-standard-2` too. It costs cents of credit and keeps ARM64 available as a cheaper future shape.
- **B (matrix revision):** reword 19 as "proof on the architecture of the chosen shape (AMD64 on Compute Engine)" and drop the ARM64 run. Only with the founder's approval.

## Procedure
1. `bash scripts/browser/gce-verification-host.sh preflight` (read-only: zone offerings and quota).
2. `create amd64` and `create arm64` (dedicated VPC, SSH only from the operator's /32, no service account, no scopes, self-deletes after 4 h).
3. On each VM: copy this branch, `bash scripts/browser/prepare-host.sh`, then `bash scripts/browser/collect-host-evidence.sh GCE_HOST_TESTED` and `... ARM64_HOST_TESTED` (ARM64 VM) or `AMD64_HOST_TESTED` (AMD64 VM).
4. Locally: `node scripts/browser/evaluate-host-evidence.mjs <bundle> --label <label> --repo .`; commit the bundles under `evidence/host-bundles/`.
5. `teardown`, then confirm nothing labelled `purpose=xroga-phase2-verification` remains.

## Cost bound
List prices, us-central1, on-demand: `e2-standard-2` about $0.067/h, `t2a-standard-2` about $0.077/h, a 20 GB balanced disk about $0.003/h, an external IPv4 $0.005/h. Even if both VMs ran
until their 4-hour self-deletion: under **$1**, to be drawn from promotional credit. Expected actual use: about one hour each.
