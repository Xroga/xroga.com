# Repository execution: audit and plan (18 November 2026)

Status: audit only. Nothing in this file is implemented or tested. Cloud Run (or Cloudflare) only; no Fly.

## What exists
- `backend/src/sandbox/`: provider-neutral isolation seam (`sandboxProviders.ts`, `sandboxTypes.ts`), metering (`meteredExecution.ts`), cleanup (`google/orphanReconciler.ts`).
- `remoteSandbox.ts`: HTTP contract for a remote isolation worker, inert unless `XROGA_SANDBOX_WORKER_URL` is set. Worker serves `GET /health` -> `{ready:true, networkIsolation:true}` and `POST /execute` taking `{files, command, args, timeoutMs, networkPolicy, environment, limits, image?}` and returning `{exitCode, stdout, stderr, timedOut, killedForLimit, durationMs}`. Header bearer token; https or loopback only.
- `deploy/browser-worker/container-spec.json` + `workers/containerSpec.ts`: reviewed hardening checker (non-root, read-only rootfs, caps dropped, seccomp, internal network + egress proxy, deny CIDRs).
- Staging Cloud Run has no sandbox variables set, so every provider probe fails and execution is refused (by design: no fallback to the API host).

## Hard limits found in the existing design
- `registry-only` network policy is refused until a verified restricted-network worker exists. Only `none` (offline) is admitted, and only by a worker that can really deny the network.
- A Python or Node project that needs `pip` or `npm` dependencies, or needs the internet (job boards, maps, lead sources), therefore cannot run today.

## Smallest build that fits
1. A Cloud Run service `xroga-sandbox-worker` implementing the contract above: one request per instance (concurrency 1), per-request temp directory removed afterwards, exact environment only, output and file caps, timeout and process limits, bearer token, IAM invoker limited to the API service account, a service account with no roles, min instances 0.
2. Network: a VPC with deny-all egress for the offline mode (verified by a probe that tries to connect out and must fail); a second, separately reviewed worker or egress proxy with a package-registry and approved-host allowlist for dependency install and permitted data sources.
3. Retrieval stage on the trusted side: fetch the repository tarball at a pinned commit SHA over the existing bounded public reader, install wheels only (`pip download --only-binary=:all:`), then execute offline.
4. One extension tool and one backend route under the existing run ID (same ledger, checkpoints, approvals); results returned as files through the existing artifact store; Experience Engine records only verified procedures.
5. Independent security review of the worker, the egress allowlist and the retrieval stage before untrusted repositories are enabled.

## Source-use caveats recorded for the examples
- JobSpy (MIT) scrapes LinkedIn, Indeed and others and offers proxy rotation to bypass blocking; those sources' terms and access controls apply regardless of the licence. Permitted sources (official or public job APIs) should be preferred.
- Google Maps scraping likewise needs its terms checked; an authorised source is the fallback.

## Update, 18 November 2026: the offline worker is built and verified (staging only)

Built: `deploy/sandbox-worker/` (Cloud Run gen2 service `xroga-sandbox-worker`, scale to zero, max 2 instances, concurrency 1, a service account with no roles, not publicly invokable, one request per container: the process ends after every run so Cloud Run starts a fresh container), `backend/src/sandbox/repoRun.ts` (public GitHub repo fetched at an exact commit into memory, files sent to the worker, one command run, real output and files returned), a `repo-run` route and the extension tool `run_repository`. The existing remote-sandbox adapter gained a Google identity token and an artifacts channel.

Evidence from the deployed worker (real Cloud Run, not a fixture):
- Self-test with a positive control: the same connection attempt reaches the internet outside the namespace and is blocked inside it.
- A Python 3.11 program ran, wrote a CSV that came back as an artifact, could not reach the internet or the metadata server, and saw an environment of only HOME, LC_CTYPE and PATH.
- After the automated security review: PID, mount, IPC and UTS namespaces added, `--kill-child`, the token deleted from the process environment, fresh container per run. Adversarial probe: the sandbox sees only its own 1 to 2 processes, the worker's token is not readable from any `/proc/*/environ`, and a process detached in run A did not exist in run B.

Residual risks (not closed): the job still sees the worker container's filesystem (no private root; it contains no secrets, the code is public) and runs as the worker's own kernel user; a private root filesystem or a second layer such as nsjail or bubblewrap would narrow this. Resource limits are prlimit and a wall-clock timeout, not cgroups. The shared token travels as an environment variable on the Cloud Run service (a Secret Manager reference is the better home). The metering ledger is not yet wired to sandbox compute. Network is `none` only: dependency installs and any data fetch still need a separately verified restricted-network stage, so a repository that needs packages or the internet cannot run. Independent security review of all of this is still required before untrusted repositories are enabled for users.
