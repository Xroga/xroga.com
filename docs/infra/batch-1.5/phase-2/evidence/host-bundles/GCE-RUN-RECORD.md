# Compute Engine host verification record (B-1, B-2), 2026-10-24

Founder-approved, Google Cloud free-trial credit, project `project-c40d4821-e647-4fa2-92d`, zone `us-central1-a`, created with `scripts/browser/gce-verification-host.sh`
(dedicated VPC `xroga-verify-net`, SSH only from the operator's /32, no service account, no API scopes, 4-hour self-delete).

| Host | Machine type | Arch (uname / metadata) | CPU platform | OS |
|---|---|---|---|---|
| `xroga-verify-amd64` | `e2-standard-2` | x86_64 | Intel Broadwell | Ubuntu 24.04.5 LTS, Docker 29.1.3, Node 22.21.1 |
| `xroga-verify-arm64` | `t2a-standard-2` | **aarch64 (native)** | Ampere Altra | Ubuntu 24.04.5 LTS, Docker 29.1.3, Node 22.21.1 |

Source: commit `93c6a36d…` shipped as a git bundle, clean tree verified on each host before collection.

| Bundle | Label | Verdict on the host | Verdict re-evaluated locally against the committed files |
|---|---|---|---|
| `gce-amd64-gce` | `GCE_HOST_TESTED` | HOST_ACCEPTED 31/31 | HOST_ACCEPTED 31/31 |
| `gce-amd64-amd64` | `AMD64_HOST_TESTED` | HOST_ACCEPTED 32/32 | HOST_ACCEPTED 32/32 |
| `gce-arm64-gce` | `GCE_HOST_TESTED` | HOST_ACCEPTED 31/31 | HOST_ACCEPTED 31/31 |
| `gce-arm64-arm64` | `ARM64_HOST_TESTED` | HOST_ACCEPTED 32/32 | HOST_ACCEPTED 32/32 |

Each run: Chromium sandbox ON under the reviewed spec; the 12 runtime conformance checks; the default-seccomp control BLOCKED; six weakened variants each detected; the 21 isolation checks with the
**production** egress proxy; both weakened network controls showing their weakness (bridge and permissive proxy); seccomp profile equal to its derivation; input hashes equal to the committed files;
no container or network left behind.

**Run 1 (commit `8037e1d4`, kept in `*-run1-detector-defect/`):** every substantive check passed, but the permissive-proxy control was not credited: on Compute Engine Ubuntu `localtest.me` resolved
to `::1` first, and the canary and detector only knew IPv4 loopback (30/31). Fixed in `93c6a36d` without weakening the control, then all four runs were repeated.
**Evaluator note:** local re-evaluation first failed one input-hash rule because the Windows working copy is a CRLF checkout; the evaluator now compares with the file as committed at the bundle's
recorded commit, which is the stronger binding.

**Cost and cleanup:** catalog prices about $0.16/hour for both VMs, drawn from free-trial credit. Teardown read back: no instance, disk, address, verification network, subnet or SSH rule remains.
Enabling the Compute Engine API auto-created a `default` network with four firewall rules; the three open to `0.0.0.0/0` (SSH, RDP, ICMP) were confirmed new and unused and deleted; the network and its
internal-only rule remain (no cost, no exposure).
