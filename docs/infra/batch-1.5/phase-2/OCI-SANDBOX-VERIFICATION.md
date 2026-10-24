# OCI and ARM64 sandbox verification: exact procedure

Purpose: produce the one proof Phase 2 cannot produce from a laptop, that Chromium runs with its sandbox ON, and the browser cannot bypass its proxy, **on the host that
will run the browser worker**. Nothing here creates infrastructure. It needs a Linux host someone already authorizes; Claude created none and used none (no OCI CLI or
compute host exists on this machine, and the OCI credentials found are scoped to KMS test identities by Codex's own notes, so they were not used for compute).

Already established without the host (so it is not repeated there):
- the pinned base image `mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032…` is a multi-architecture index containing **linux/amd64** (`sha256:02bbb215…`) and
  **linux/arm64** (`sha256:5361940f…`); an ARM64 image exists, it has not been run;
- on Docker Desktop (amd64, kernel 6.18 WSL2): sandbox `SANDBOX_ON` with a default-seccomp control `BLOCKED`, and an `--internal` network that blocks every bypass
  (`evidence/browser-sandbox-docker-local-2026-10-24.json`, `evidence/browser-egress-isolation-docker-local-2026-10-24.json`).

## Host requirements
Ubuntu 22.04 or 24.04, aarch64 (for example Ampere A1) **and** x86_64 if both shapes are candidates, Docker Engine 24 or later, git, Node 22, outbound HTTPS to GitHub, npm and
mcr.microsoft.com (to fetch the repository and the pinned image). No application secret, database URL, key or token is needed or must be present on the host.

## Steps (run as an ordinary user in the Docker group)
```
git clone --branch claude/xroga-b15-phase2-20261024 https://github.com/Xroga/xroga.com.git && cd xroga.com
git rev-parse HEAD                                             # record this SHA in the report
npm ci                                                         # tsx for the two scripts
mkdir -p out && bash deploy/browser-worker/host-facts.sh > out/host-facts.json
docker build -t xroga-browser-worker:phase2-probe deploy/browser-worker
docker image inspect xroga-browser-worker:phase2-probe --format '{{.Architecture}} {{.Id}}'
node deploy/browser-worker/derive-seccomp.mjs --check          # the profile is exactly its derivation
npx tsx scripts/browser/run-sandbox-probe.mts      --label OCI_HOST_TESTED --out out/sandbox-probe.json
npx tsx scripts/browser/verify-egress-isolation.mts --label OCI_HOST_TESTED --out out/egress-isolation.json
```
Use `--label ARM64_HOST_TESTED` or `AMD64_HOST_TESTED` for a non-OCI host. Run once per candidate shape.

## Acceptance (all must hold; nothing is relaxed to make a result pass)
| # | Check | Pass |
|---|---|---|
| 1 | `host-facts.json` | `oci.shape` and `oci.region` are non-null (this is what makes "OCI" honest); `arch` is the shape under test |
| 2 | `sandbox-probe.json` `hardened.verdict` | `SANDBOX_ON` |
| 3 | `sandbox-probe.json` `control.verdict` | `BLOCKED` (the probe can say no on this host) |
| 4 | `egress-isolation.json` | `isolatedOk: true` and `controlOk: true` |
| 5 | `derive-seccomp.mjs --check` | exits 0 |

## If the sandbox is BLOCKED (do not work around it)
The result is recorded as BLOCKED with the report's `reason`. Diagnose, in this order, and re-run only after a documented host-level change:
1. `host-facts.json` `user.max_user_namespaces` must be greater than 0.
2. On Ubuntu 24.04, `kernel.apparmor_restrict_unprivileged_userns=1` can stop Chromium creating its user namespace in a container. Options, each a host-security decision for the owner:
   a dedicated AppArmor profile for the worker container that allows `userns`, setting that sysctl to 0 on a host that runs only this worker, or a VM per job.
3. A different log line than the two known ones (`No usable sandbox`, `sys_chroot`) is a new finding: attach the probe JSON.
Never add `--no-sandbox`, `--cap-add SYS_ADMIN` or `--privileged`; the spec checker refuses them and a pass obtained that way is not a pass.

## Host-level egress rules (defense in depth, to verify on the host)
The browser container has no route out (internal network). The proxy sidecar does, and must still never reach private or metadata ranges even if the policy code were bypassed.
On the host, add before enabling the worker (shown for Docker's `DOCKER-USER` chain; the OCI equivalent is a network security group on the instance's VNIC):
```
for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8 192.0.0.0/24 198.18.0.0/15; do
  sudo iptables -I DOCKER-USER -s <proxy-network-subnet> -d $cidr -j REJECT
done
```
Verify from inside the proxy container: `curl -m 3 http://169.254.169.254/` and a connection to a private address must fail, while `curl -m 5 https://example.com/` succeeds.
The browser container itself needs no such rule (it has no route); the isolation script is its test.

## Report back
The five output files and the SHA. The label on each evidence file is the claim; do not edit labels. A passing result earns `OCI_HOST_TESTED` for that shape and nothing more: it is not
staging, not production, and does not select a hosting decision.
