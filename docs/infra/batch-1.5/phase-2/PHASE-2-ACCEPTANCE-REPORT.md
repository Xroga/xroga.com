# Batch 1.5 Phase 2: acceptance report

# Verdict: `BATCH_1_5_PHASE_2_BLOCKED`

All Phase 2 engineering is implemented and verified to the strongest evidence class available without a target host. Four prerequisites in the original handoff cannot be
satisfied from this machine, so Phase 2 cannot be accepted yet. Nothing below is relabelled to look stronger than it is.

| | |
|---|---|
| Branch | `claude/xroga-b15-phase2-20261024` (Phase 1 baseline `e792523f` preserved) |
| CI-tested executable commit | `58a8b41478f9d1564f3d35a1df411b7ee290f87f`: Phase 2 plus the Batch 1 TenantContext core and current `main`, with the storage actor taken only from an issued context |
| CI run | 40111756070: `overall=PASS`, full backend suite 3167 pass and **0 failures** (archived in `../ci-evidence/run-40111756070/`); earlier runs 40108091362 (`df9b3e98`) and 40101667223 (`e2a3fb49`) kept |
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
| 34 | Batch 1 `TenantContext` accepted into `main` | **BLOCKED (B-3)**: ready, awaiting the founder's merge | Codex's full stack cannot merge safely (its startup gate needs a KMS provider Fly does not have). The canonical core is separable: `claude/b15-tenantcontext-core` @ `5c66fd37`, Codex's files byte-identical, CI green (`unit-tests` 40110784081: backend 0 failures; frontend failures identical to `main`). `BATCH1-MERGE-SEQUENCE.md` |
| 35 | Read-only cloud facts, checklist A | **PASS** | A1 Cloudflare, A2 database counts (founder-approved read-only query, run once), A3 Fly, A4 Redis (unused), A5 Supabase (free plan, no provider backups): `CLOUD-FACTS-2026-10-24.md` |

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
| # | Status | Exact remaining requirement | Evidence already available | One executable next action | Needs you |
|---|---|---|---|---|---|
| **B-1** OCI host | **BLOCKED** | hardened container, sandbox ON, egress isolation and weakened controls on an authorized OCI host | amd64 `DOCKER_LOCAL_TESTED`; the collector and evaluator are tested (26 evaluator tests, three mutants caught; end-to-end self-test 32/32 on Docker Desktop, labelled as a self-test only) | create the Always Free A1 instance (steps in the final report), then I run `prepare-host.sh` and `collect-host-evidence.sh OCI_HOST_TESTED` over SSH and evaluate the bundle | yes: the account checks and the instance |
| **B-2** native ARM64 | **BLOCKED** | the same on native ARM64 | emulation diagnostic only (not acceptance) | the same run with `ARM64_HOST_TESTED` on the A1 instance | same instance |
| **B-3** TenantContext in `main` | **BLOCKED**, ready | `claude/b15-tenantcontext-core` merged into `main` | see row 34; Phase 2 adoption on this branch passes CI (run 40111756070) with a forgery test (missing, hand-built, spread and JSON-cloned contexts never reach Drive; mutant caught) | merge the core branch (deploys the API through `fly-deploy.yml`; no migration, no startup change) | yes: the merge |
| **B-4** cloud facts | **PASS** | none | `CLOUD-FACTS-2026-10-24.md` | none | no |

## D2. Security and reliability findings (not Phase 2 criteria; disposition)
| Finding | Evidence | Disposition |
|---|---|---|
| A public Cloudflare Worker with authentication capability exists outside the repository | read-only inspection | reported to the founder with a reversible mitigation awaiting approval; details are withheld from this public repository until it is mitigated |
| Production database has no provider backup (free plan) | Supabase docs; plan read; no backup job | backup job built and self-tested on `claude/b15-db-backup` (14 of 14 synthetic checks); activation needs the founder's key, bucket and environment (`docs/infra/db-backup/RUNBOOK.md`) |
| R2 variable names on Fly do not match `lib/r2.ts` | Fly secret names; isolated reproduction | no data affected (`project_files` has 0 rows). Codex's Batch 1 `lib/r2.ts` already implements the private, fail-closed design; production needs its five `CLOUDFLARE_R2_*` names when Batch 1 deploys. No competing fix |
| Public `r2.dev` on three empty buckets | 0 objects, 0 R2 operations in 30 days, no code reference | disabling proposed; awaiting approval |
| `unit-tests` workflow is red on `main` (46 frontend failures) | runs 40031704258 and 40110784081 | pre-existing on `main`; unchanged by this work; not a Phase 2 item |
| Mutation sweep | 99 of 99 on `e2a3fb49` | the code covered by it is unchanged in `58a8b414` except the storage actor, which has its own forgery test and mutant; the sweep was not re-run |

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
