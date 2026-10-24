# Batch 1.5 Phase 2: acceptance report

# Verdict: `BATCH_1_5_PHASE_2_BLOCKED`

All Phase 2 engineering is implemented and verified to the strongest evidence class available without a target host. Four prerequisites in the original handoff cannot be
satisfied from this machine, so Phase 2 cannot be accepted yet. Nothing below is relabelled to look stronger than it is.

| | |
|---|---|
| Branch | `claude/xroga-b15-phase2-20261024` (Phase 1 baseline `e792523f` preserved) |
| CI-tested executable commit | `df9b3e98449e32b28ed33c08c14b7c65dddb3131` (adds the backend lock fix and its CI step to `e2a3fb49`) |
| CI run | 40108091362: `overall=PASS` (archived in `../ci-evidence/run-40108091362/`); the earlier run 40101667223 on `e2a3fb49` is kept in `../ci-evidence/run-40101667223/` |
| Later commits | documentation and host-evidence tooling only (see `SOURCE-EQUIVALENCE.md`) |
| Authority for the criteria | the handoff `PHASE-1-TO-PHASE-2-HANDOFF.md` (INFRA-004/005/006 rows, browser table, risk 7, preconditions) and its restatement in the Phase 2 directives. No INFRA-007, Phase 3 or Batch 1 cutover requirement was added |
| Cost | $0 |

## The earlier "three unverified criteria" list was not exhaustive
It covered the browser-host criteria only. The handoff also lists, under *Preconditions before Phase 2 can be verified*, **(3) Batch 1 `TenantContext` accepted into `main`** and **(4) read-only
cloud facts (checklist A)**. Both are unmet and neither can be met by this work, so they are blockers B-3 and B-4 below. Criterion R-3 (network isolation) is now largely done: the container-network and
production-proxy part passed on real containers; only its host-level part remains inside B-1.

## A. Final acceptance matrix
Row numbers refer to rows of this table (they are references, not new requirement IDs). Evidence classes: LOCAL_TESTED · DISPOSABLE_DATABASE_TESTED (PostgreSQL 16) · DOCKER_LOCAL_TESTED
(real containers on a developer machine, not OCI) · SOURCE_READ. No row is STAGING or PRODUCTION verified.

### INFRA-004: credential custody
| # | Requirement (original) | Verdict | Evidence |
|---|---|---|---|
| 1 | Reuse Batch 1's CredentialVault; build no second vault | **PASS** | no vault, store or authorisation code added; readiness uses Batch 1's own `XROGA_CREDENTIAL_KMS_PROVIDER` contract and an injection point for its round trip |
| 2 | Keep the `SECRET_BUCKETS` denylist | **PASS** | Phase 1 suite, CI step 02 (176/176) |
| 3 | Identify every reachable plaintext token writer (SEC-OAUTH-1) | **PASS** (SOURCE_READ) | `INFRA-004-credential-audit.md`: W1 to W9 with file and line, F1 to F8. Gap recorded, not blocking: `project_runtime_secrets` was not counted (no production SQL) |
| 4 | A bounded legacy migration path; no live token migration | **PASS** | staged plan with approval gates and rollback in the audit; nothing migrated, rotated or deleted |
| 5 | Reject development crypto in production | **PASS** for Phase 2's part | readiness `credential_custody`: 5 tests, 4 injected defects caught. Enforcement inside the vault is Batch 1's |
| 6 | Claim managed-provider custody only with genuine provider evidence | **PASS** (no claim made) | no provider was called. The handoff's reuse row says "Batch 1 CredentialVault **once accepted**", so live custody evidence is the Batch 1 cutover's gate and is not a Phase 2 requirement |

### INFRA-005: API, runtime and browser worker
| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 7 | `/api/drive` host-agnostic, needs `XROGA_DRIVE_R2_*` and `DATABASE_URL`; health 200/503 | **PASS** | unchanged router; readiness validates both. Phase 1 tests |
| 8 | Health and readiness | **PASS** | `runtime/readiness.ts` behind `/ready`: 17 tests, fixed reason codes only |
| 9 | Fail-closed startup | **PASS** | `runtime/startupPolicy.ts`, wiring pinned by `bootGuard.test.ts` |
| 10 | Credential-safe logging | **PASS** | `runtime/safeLogging.ts` (console and morgan): 32 tests |
| 11 | Database TLS verified before any real Supabase deployment (risk 7) | **PASS** | 24 tests, live Supabase pooler handshake (`evidence/real-tls-handshake-2026-10-24.json`) |
| 12 | Production migration history inspected, never auto-applied; Preview boundary verified before any PR | **PASS** | history read earlier (82 records); the PR path of `supabase-migrate.yml` is now an offline job with no environment and no secret (9 tests). `command3-auth-browser.yml`: **no `E2E_*` secret and no `E2E_ISOLATED_PROJECT_REF` variable exist** at repository or environment level (read through the GitHub API), so on a PR it receives empty values and its preflight fails at `missing_required_variable` before any network call; if they are added later its preflight refuses the production project ref |
| 13 | Separate trusted-API and restricted browser-worker images | **PASS** | `Dockerfile.api` has no browser; `deploy/browser-worker/Dockerfile` and `Dockerfile.proxy` are separate |
| 14 | Pinned Chromium, Playwright, Stagehand | **PASS** | base image by digest (multi-arch index `sha256:baed2032…`); `playwright-core@1.62.0` and `@browserbasehq/stagehand@4.2.0` exact, locked with integrity hashes, 43 packages all MIT, Apache-2.0 or BSD-2-Clause, installed `--ignore-scripts`; Stagehand is pinned but unwired (INFRA-007). `imagePins.ts`, 9 tests |
| 15 | Non-root; Chromium sandbox ON (else BLOCKED) | amd64 **PASS** (DOCKER_LOCAL_TESTED) · target host **BLOCKED (B-1)** | `evidence/browser-sandbox-docker-local-2026-10-24.json`: `SANDBOX_ON`, every Chromium process seccomp-filtered, renderer in its own PID namespace, default-seccomp control `BLOCKED` |
| 16 | seccomp, dropped capabilities, CPU/RAM/process limits, filesystem and process isolation | amd64 **PASS** (DOCKER_LOCAL_TESTED) · target host **BLOCKED (B-1)** | 12 conformance checks observed inside the live container (uid, capability bounding set, no-new-privileges, seccomp, read-only root mount flag, tmpfs flags, memory/pids/cpu cgroup limits, shared memory, no Docker socket, own PID namespace, no leaked Chromium process). **Six weakened variants** (root user, writable root, capabilities kept, privilege escalation allowed, no resource limits, executable tmpfs) are each detected by name; cleanup left no container or network |
| 17 | Private authenticated CDP | **PASS** | launch policy refuses a network DevTools port; the live Chromium process carries the pipe flag and no port (`chromiumProxy.browser.test.ts`) |
| 18 | Egress policy including metadata, RFC1918, rebinding; browser-to-proxy isolation | container network and production proxy **PASS** (DOCKER_LOCAL_TESTED) · target host **BLOCKED (B-1)** | `evidence/browser-egress-isolation-docker-local-2026-10-24.json`: browser on an `--internal` network whose only peer is the **production** proxy (`egressProxy.ts` through `proxySidecar.ts`). 21 checks pass: no direct IP on any tested port or protocol (TCP, UDP DNS), no public DNS, no IPv6, no metadata, no RFC1918 or CGNAT, no loopback service, no gateway; Chromium without a proxy flag loads nothing; the authorised destination loads; out-of-scope host, a real **cross-origin redirect** (`wikipedia.org` to `www.wikipedia.org`), names resolving to loopback, metadata and RFC1918, literal IPs, alternate ports and plain HTTP are all refused with the expected reason; the proxy never connected to its own loopback. **Two weakened controls prove the battery can fail**: a default bridge network (direct IP, DNS and no-proxy navigation all work) and a permissive proxy (a canary on its loopback is hit and it dials loopback, metadata and RFC1918) |
| 19 | AMD64/ARM64 proof before choosing a shape | AMD64 **PASS** (local) · ARM64 **BLOCKED (B-2)** | arm64 image runs and the container **conforms** under emulation (`evidence/browser-sandbox-arm64-emulated-docker-local-2026-10-24.json`, class `ARM64_EMULATED_DOCKER_LOCAL`); the sandbox is `BLOCKED` under emulation, and a diagnostic attributes that to the emulator (same flags, seccomp unconfined: native amd64 `SANDBOX_ON`, emulated arm64 `BLOCKED`). This is **not** an ARM64 pass |
| 20 | Rollback | **PASS** | `ROLLBACK.md`; the lease `.down.sql` is applied and verified to leave nothing behind on real PostgreSQL 16 (CI step 03b) |

### INFRA-006: workers and scheduler
| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 21 | Preserve the canonical scheduler; no second task graph | **PASS** | handler on `ExecutionScheduler`; `taskGraphRunner` (no production caller) untouched |
| 22 | Ledger-style leases | **PASS** (DISPOSABLE_DATABASE_TESTED) | fenced leases: one contract on memory and PostgreSQL 16; CI step 03b 15/15 |
| 23 | BullMQ/Redis untouched; verified, not assumed | **PASS** | queues declared with no consumer and no producer; Redis is cache and guest chat only |
| 24 | Outputs through `putServerObject`, READY only after read-back SHA-256 | **PASS** | handler stores via Drive and rejects anything not READY with a matching hash; idempotent retries |
| 25 | Browser-job payload (tenant, user, project, run, attempt, allowed URLs, limits) | **PASS** | `parseBrowserJob`, strict allow-list |
| 26 | Lease fencing | **PASS** | tokens never repeat; stale renew, release and assert refused; real PostgreSQL contention test |
| 27 | Cancellation of Chromium process trees | **PASS** | cancel, deadline, real-Chromium tree kill (Windows local); POSIX orphan sweep and real Chromium on Linux in CI |
| 28 | Checkpoints, durable progress, restart recovery | **PASS** | existing scheduler persistence plus lease-aware recovery over the canonical resume |
| 29 | Budget | **PASS** for what exists | duration, navigations, bytes, artifacts, tunnels enforced. Model-spend metering needs model use, which is INFRA-007 |
| 30 | Tenant fairness and bounded concurrency | **PASS** | `admission.ts`: noisy-tenant, 300-job stress |
| 31 | Issued authority, tenant/project ownership, revocation, cross-tenant denial | **PASS** | issued by the trusted API, re-checked before each write, Drive re-checks ownership. `tenantId` still equals the user id until `TenantContext` lands (B-3) |

### Handoff preconditions
| # | Precondition | Verdict | Note |
|---|---|---|---|
| 32 | GitHub write access and first remote CI | **PASS** | Phase 1; this phase's CI runs are green |
| 33 | R2 provider suite | **PASS** | Phase 1 (9/9). Owner cleanup still open and not blocking: revoke the temporary token, delete the local secrets file, delete the empty test bucket |
| 34 | Batch 1 `TenantContext` accepted into `main` | **BLOCKED (B-3)**, pre-merge verification **PASS** | Codex's stack (PR #846 on #845) is unmerged. Compatibility with candidate `e8164ba6` was verified in an isolated, never-pushed worktree: `BATCH1-INTEGRATION-VERIFICATION.md` |
| 35 | Read-only cloud facts, checklist A | **BLOCKED (B-4)**, partly established | established: Supabase plan and projects, R2 buckets, public access, CORS, GitHub isolation, Redis repository secret absent (`CLOUD-FACTS-2026-10-24.md`). Missing: Fly status, volumes and secret names (no Fly session), Supabase backup setting, Cloudflare billing |

## B. Evidence register
| Evidence | Where | Result |
|---|---|---|
| Verified commit | `df9b3e98449e32b28ed33c08c14b7c65dddb3131` | CI-tested; later commits checked with the equivalence script |
| GitHub Actions | run 40108091362 on `df9b3e98` (`overall=PASS`: 223/223 Phase 2 unit, 15/15 PostgreSQL, 6/6 Chromium, full suite 3148 pass, the same 5 baseline failures, 0 regressions); run 40101667223 on `e2a3fb49` (earlier runs 40097009444 on `fdb5face`, 40094731238 on `511f503a`) | `overall=PASS`; Phase 2 unit 223/223; full suite 3148 pass, the same 5 baseline failures, 0 regressions |
| Real PostgreSQL 16 | CI 03b, and local | 15/15 lease contract and SQL tests; Phase 1 real-SQL 25/25; 8 SQL defects caught |
| Real Chromium | CI 03c (Linux runner) and local | 6/6: policy flags on the live process, proxy used for loopback, TLS errors not ignored, tree cleanup |
| Local totals | this machine, final source | 267 pass, 0 fail, 1 POSIX-only skip (Phase 2 suites with real PostgreSQL and Chromium) |
| Sandbox and conformance (amd64) | `evidence/browser-sandbox-docker-local-2026-10-24.json` | DOCKER_LOCAL_TESTED: hardened ON and conforming, control BLOCKED, 6 of 6 weakened variants detected, cleanup clean |
| Network isolation (amd64) | `evidence/browser-egress-isolation-docker-local-2026-10-24.json` | DOCKER_LOCAL_TESTED: 21 of 21 checks, both weakened controls show the weakness |
| ARM64 | `evidence/browser-sandbox-arm64-emulated-docker-local-2026-10-24.json`, `…-arm64-emulation-diagnostic-2026-10-24.json` | image runs and conforms under emulation; sandbox inconclusive under emulation; not an ARM64 pass |
| OCI host | none | NOT RUN: no authorized host exists |
| Security and mutation | `evidence/logs/mutation-checks-phase2-final.log` | 99 injected defects across database TLS, leases, job contract, egress proxy and sidecar, process trees, browser handler, admission, recovery, startup, readiness, logging, launch policy, container spec and the lease SQL: **99 caught, 0 survived, 0 inconclusive** (run on the committed source `e2a3fb49`). Earlier runs exposed and fixed: a dead guard, a test that passed for the wrong reason, redundant branches, a vacuous redirect check, a probe that could not see a missing capability drop or a writable root, and a test that left a listener open. Container-level checks are covered by the six weakened variants and two weakened network controls instead |
| Batch 1 integration | `BATCH1-INTEGRATION-VERIFICATION.md`, `evidence/batch1-integration/resolution-over-codex-candidate.patch` | isolated merge with Codex `e8164ba6`: tsc clean, 500 targeted tests (499 pass, 1 POSIX-only skip), both migration validators pass; nothing merged or pushed |
| Cloud facts | `CLOUD-FACTS-2026-10-24.md` | read-only, no credential printed, nothing changed |
| Defect found by the integration check | `backend/package-lock.json` | stale since Phase 1 (`npm ci` failed in `backend`); regenerated; CI now runs the same standalone install |
| Host evidence tooling | `scripts/browser/collect-host-evidence.sh`, `scripts/browser/evaluate-host-evidence.mjs` | one command produces a checksummed bundle on a host; the evaluator accepts it only if every criterion holds (native arch, not emulated, hashes of the reviewed files, 21 isolation checks, six variants, cleanup). Rejects an empty bundle (exit 2) |
| Rollback | CI 03b, `ROLLBACK.md` | `.down.sql` verified on real PostgreSQL 16; code rollbacks documented |
| Source equivalence | `SOURCE-EQUIVALENCE.md`, `scripts/verify-source-equivalence.sh` | later commits documentation only |
| Real-provider TLS | `evidence/real-tls-handshake-2026-10-24.json` | live Supabase pooler, TLS trust only |

## C. Remaining blockers
Only these prevent acceptance. Each is BLOCKED on something outside this machine; none is blocked on engineering.

| # | Status | Exact remaining requirement | Evidence already available | One executable next action | Needs you |
|---|---|---|---|---|---|
| **B-1** OCI host | **BLOCKED** | the hardened container, sandbox ON, egress isolation and weakened-control checks run on an authorized OCI host, with immutable redacted evidence | amd64 `DOCKER_LOCAL_TESTED` for all of it; no OCI host documented, no OCI CLI, the OCI credentials found are KMS-test scoped and were not used. No instance was created | on the host: `git clone` this branch, `npm ci`, then `bash scripts/browser/collect-host-evidence.sh OCI_HOST_TESTED`, and return the `out/host-evidence-*` folder. I run `node scripts/browser/evaluate-host-evidence.mjs <folder> --label OCI_HOST_TESTED --repo .` | yes: access to an existing instance, or your approval after confirming an Always Free shape is available at $0 |
| **B-2** native ARM64 | **BLOCKED** | the same run on native ARM64, no emulation | arm64 image conforms under emulation; sandbox inconclusive under emulation and attributed to the emulator by a diagnostic. Not retried, by instruction | same command with `ARM64_HOST_TESTED` on any native ARM64 Docker host (the OCI host above, if Ampere A1, closes both) | yes: an ARM64 host |
| **B-3** TenantContext in `main` | **BLOCKED**, pre-merge **PASS** | Codex's stack accepted into `main` | compatibility verified against `e8164ba6`: merged tree `7daeeb4e`, resolutions in a patch, tsc clean, 499 of 500 tests pass (1 POSIX-only skip), validators pass. Found and fixed a stale lock in our branch. Not a virtual-merge substitute | you review and merge #845 then #846; then re-apply `evidence/batch1-integration/resolution-over-codex-candidate.patch` as one integration commit (steps in `BATCH1-INTEGRATION-VERIFICATION.md`). Do not deploy to Fly before a KMS provider is configured: Codex's boot now fails closed without one | yes: the merge is yours (production workflows deploy Fly and apply SQL) |
| **B-4** cloud facts | **BLOCKED**, partly established | Fly status, volumes and secret names; Redis; Supabase backups; Cloudflare billing | Supabase plan (free, no PITR) and projects, R2 buckets, public `r2.dev` on three buckets, CORS, GitHub isolation, no Redis repo secret: `CLOUD-FACTS-2026-10-24.md`. No token printed, nothing changed | `! flyctl auth login`, then I run only `fly status`, `fly volumes list`, `fly secrets list` for `xroga-api` (names only) | yes: the Fly login. Also the Supabase backup setting (dashboard) and the Cloudflare plan, one line each |

Not blockers, and not Phase 2: the Batch 1 production cutover (key provider, KMS identity, credential sealing and rotation, legacy-writer drain, staging service), INFRA-007 and INFRA-008, and the pull request and merge.
The PR gate itself is cleared on safety grounds (offline migration check; no secret reaches PR code; `main` unprotected so no check name depends on the old job); a merge still applies this branch's two migrations to production and stays your decision.

## D. GitHub handoff
Branch `claude/xroga-b15-phase2-20261024` is pushed to `Xroga/xroga.com`; `main` is untouched, no pull request was opened, nothing was force-pushed. The executable commit is `df9b3e98`;
the branch head, which differs from it only in documentation, is stated in the checkpoint message and verified with the equivalence script.

## E. Phase 3 readiness
Phase 2 is **not** accepted, so this is not permission to start Phase 3. For when it is, the components Phase 3 (INFRA-007/008) should reuse, all already in this branch:

| Reuse | Where |
|---|---|
| browser step as a handler on `ExecutionScheduler` with issued authority, fenced lease, strict result checks, idempotent Drive evidence | `backend/src/workers/browserTaskHandler.ts` |
| fenced leases (PostgreSQL) and the contract any store must pass | `postgresLeaseStore.ts`, `leaseStore.ts`, `leaseStore.contract.ts`, migration `20261024000000_worker_task_leases.sql` |
| bounded concurrency, restart recovery, process-tree cleanup | `admission.ts`, `resumeRecovery.ts`, `processTree.ts` |
| the job contract and the launch policy (sandbox ON, proxy only, private CDP, per-job profile) | `browserJob.ts`, `chromiumLaunch.ts` |
| the production egress proxy and its sidecar image and build | `egressProxy.ts`, `proxySidecar.ts`, `deploy/browser-worker/Dockerfile.proxy`, `scripts/browser/build-proxy-image.mts` |
| the browser image, spec, derived seccomp profile, pins and checkers | `deploy/browser-worker/*`, `containerSpec.ts`, `imagePins.ts` |
| host verification procedure and scripts | `OCI-SANDBOX-VERIFICATION.md`, `host-facts.sh`, `run-sandbox-probe.mts`, `verify-egress-isolation.mts` |
| runtime: startup policy, readiness, safe logging, database TLS | `backend/src/runtime/*`, `backend/src/storage/databaseTls.ts` |
| canonical egress policy (identical to Codex's) | `backend/src/security/boundedPublicGet.ts` |

Phase 3 must still create what does not exist: a `BrowserWorker` interface (the handoff calls it "existing"; it is not in the repository), the registration of the handler, the local-mode Stagehand configuration (no hosted Browserbase), the 15 workflows and the evidence flow, and model-spend metering.
