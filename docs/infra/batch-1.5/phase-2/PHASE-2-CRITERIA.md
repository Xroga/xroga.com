# Phase 2 criteria and their actual state

**Verdict: Phase 2 is NOT complete.** The engineering that can be done and proven without external resources is done and tested; the rest is blocked on
decisions and resources that only the founder can provide (listed at the end). Nothing is labelled stronger than the evidence.

Where the criteria come from: Batch 1.5 has no separate frozen "Phase 2 acceptance matrix". The contract is `PHASE-1-TO-PHASE-2-HANDOFF.md` (rows quoted
below, with its browser table, its risk 7 and its preconditions), restated in the Phase 2 directives. No criterion ID was invented: INFRA-004, INFRA-005 and
INFRA-006 are the handoff's own, and each row below quotes the handoff or the directive.

Evidence classes (the contract's vocabulary): `LOCAL_TESTED` · `DISPOSABLE_DATABASE_TESTED` (real PostgreSQL 16 in a throw-away container or service) ·
`DOCKER_LOCAL_TESTED` (real container on a developer machine, **not OCI**) · `REAL_PROVIDER_VERIFIED` · `STAGING_VERIFIED` · `PRODUCTION_VERIFIED` · `SOURCE_READ`.
No row is STAGING or PRODUCTION verified. Cost of everything here: $0.

Documents: `INFRA-004-credential-audit.md` · `INFRA-005-database-tls.md` · `INFRA-005-runtime-and-browser-worker.md` · `INFRA-006-workers-and-scheduler.md` ·
`ARCHITECTURE-COMPATIBILITY-DECISION.md` · `BOUNDARY-CHECK.md` · `ROLLBACK.md`.

## INFRA-004: managed credential custody
| Criterion (source) | State | Evidence | Gap |
|---|---|---|---|
| Reuse Batch 1's CredentialVault; build no second vault (handoff) | **DONE** (nothing built) | no vault, store or authorisation code was added | the vault is not in `main` (PR #803 conflicting): D4 |
| Keep the `SECRET_BUCKETS` denylist (handoff) | **DONE** (unchanged) | Phase 1 tests | none |
| Identify every reachable raw-credential writer, SEC-OAUTH-1 (directive) | **DONE** | `INFRA-004-credential-audit.md`: W1 to W9 with file and line, F1 to F8 | SOURCE_READ. `project_runtime_secrets` was not counted (no production SQL) |
| Bounded legacy migration path with approval gates, no live migration (directive) | **PLAN ONLY** | audit §5: inventory, deploy, per-owner CAS migration, close window, rotate, retire, rollback never to the plaintext reader | needs D1 and D4 and a separate signed approval per stage. Nothing was migrated, rotated or deleted |
| Reject development crypto in production (directive) | **PARTIAL** | readiness `credential_custody`: with managed custody required, development or test key material makes the process not ready (LOCAL_TESTED, 4 tests, 1 injected defect caught). Batch 1's vault refuses development crypto in production (read in its source, not run by me) | enforcement inside the vault is Batch 1's, unverified here |
| Managed-provider custody claimed only with genuine provider evidence (directive) | **NOT CLAIMED** | no key provider call was made | D1: no key, no billing, no provider chosen |

## INFRA-005: API and runtime
| Criterion (source) | State | Evidence | Gap |
|---|---|---|---|
| `/api/drive` router host-agnostic; needs `XROGA_DRIVE_R2_*` and `DATABASE_URL`; health 200/503 (handoff) | **DONE** | unchanged router; readiness validates both | none |
| Health and readiness (directive) | **DONE** LOCAL_TESTED | `runtime/readiness.ts`, behind `/ready`; fixed reason codes only | no staging run |
| Fail-closed startup (directive) | **DONE** LOCAL_TESTED | `runtime/startupPolicy.ts`; staging, preview and unidentifiable hosts run no schema DDL and no run reconcile. Boot wiring pinned by `bootGuard.test.ts` | the unclassified-host rule is new behaviour for any non-Fly host |
| Credential-safe logging (directive) | **DONE** LOCAL_TESTED | `runtime/safeLogging.ts`, console and morgan | no review of every logging call site: this is a last-moment backstop, not a substitute |
| Managed identity / KMS bindings (directive) | **BLOCKED** | readiness requirement and refusal of dev keys only | D1, D2, D4 |
| Database TLS verified before any real Supabase deployment (risk 7) | **DONE** | `INFRA-005-database-tls.md`: 24 tests, live Supabase handshake, 17 injected defects caught | the migration gate, `postgresConnect.ts` and `supabaseProvision.ts` are still unverified connections (production paths, deliberately untouched) |
| Inspect production migration history; never auto-apply (directive) | **DONE** | 82 records read earlier; this branch adds `20261024000000_worker_task_leases.sql`, **not applied anywhere** | merging to `main` would apply it: see PR gate |
| Verify the `supabase-migrate.yml` Preview boundary before any PR (handoff risk 3, directive) | **DONE: unsafe** | `BOUNDARY-CHECK.md` | D5 |
| Separate trusted-API and restricted browser-worker images (browser table) | **DONE** | `Dockerfile.api` has no browser; `deploy/browser-worker` is its own image | the API image runs as root (finding, unchanged) |
| Pinned Chromium, Playwright, Stagehand (browser table) | **PARTIAL** | base image by digest, `playwright-core@1.62.0` by lockfile | Stagehand: no dependency exists yet (INFRA-007) |
| Non-root; sandbox ON else BLOCKED (browser table) | **DONE** DOCKER_LOCAL_TESTED | probe: `SANDBOX_ON` in the hardened container, control `BLOCKED` | **not OCI**; not ARM64 |
| seccomp, dropped capabilities, CPU/RAM/process limits (browser table) | **DONE** | derived profile (default plus five syscalls), spec checker (19 tests, 8 injected defects caught), the probe ran under exactly those flags | enforcement by the real host is untested |
| Private authenticated CDP (browser table) | **DONE** | launch checker refuses network DevTools; real Chromium shows the pipe and no port | none |
| Egress policy including metadata, RFC1918, rebinding (browser table) | **DONE** LOCAL_TESTED with a real Chromium | proxy plus the canonical policy; Chromium cannot reach loopback, metadata or out-of-scope hosts, and does not ignore TLS errors | network-level deny rules are declared in the spec and **unverified** (need the host) |
| AMD64 and ARM64 proof before choosing a shape (browser table) | **PARTIAL** | AMD64 local | **ARM64 not run; OCI host not run** |
| Rollback (directive) | **DONE** | `ROLLBACK.md` and the lease `.down.sql` (tested) | none |

## INFRA-006: workers and scheduler
| Criterion (source) | State | Evidence | Gap |
|---|---|---|---|
| Preserve the canonical scheduler; no second task graph (handoff) | **DONE** | the production scheduler is `ExecutionScheduler`; the browser step is one handler on it. `taskGraphRunner` (no production caller) was not used | none |
| Ledger-style leases (handoff) | **DONE** DISPOSABLE_DATABASE_TESTED | fenced leases, one contract on memory and real PostgreSQL 16 | CI run pending in `README.md` |
| BullMQ/Redis untouched; verify rather than assume (handoff, directive) | **DONE** (verified) | queues declared but no consumer and no producer anywhere; Redis is only cache and guest chat | provider and persistence of Redis in production remain unknown (no `REDIS_URL` in `fly.api.toml`; not readable here) |
| `putServerObject` for outputs; READY only after read-back SHA-256 (handoff, directive) | **DONE** LOCAL_TESTED | handler stores through Drive and rejects anything not READY with a matching hash | not run against real R2 in Phase 2 (Phase 1 ran its R2 suite) |
| Browser-job payload: tenant, user, project, run, attempt, allowed URLs, limits (browser table) | **DONE** | `parseBrowserJob` | none |
| Lease fencing (browser table) | **DONE** | tokens never repeat; stale renew, release, assert refused | none |
| Cancellation of Chromium process trees (browser table) | **DONE** | tree killed on cancel, deadline and a real Chromium root | POSIX orphan sweep proven only in CI |
| Checkpoints and durable progress (browser table) | **DONE** (existing scheduler) plus recovery | scheduler persists each transition; lease-aware restart recovery | no intermediate progress events from inside a job (Phase 3) |
| Budget (browser table) | **PARTIAL** | duration, navigations, bytes, artifact bytes, tunnels enforced | model spend is not metered: no model use exists yet |
| Tenant fairness (browser table) | **DONE** | `admission.ts` | none |
| Worker artifacts: ownership, bounds, revocation, retries, receipts (directive) | **DONE** LOCAL_TESTED | validated before the first write; re-authorised before each write; idempotent; evidence records the lease token and the `drive://` id | upload/download signed-URL scope for workers is Drive's (Phase 1) |
| Preserve issued actor context, tenant/project ownership (directive) | **DONE** LOCAL_TESTED | issued by the trusted API, cannot be overridden | `tenantId` is still the user id until `TenantContext` lands (D4) |

## Preconditions the handoff listed
| Precondition | State |
|---|---|
| GitHub write access and first remote CI | done in Phase 1; Phase 2 CI result in `README.md` |
| R2 provider suite | done in Phase 1 (9/9); temporary token and bucket cleanup still open (owner) |
| Batch 1 `TenantContext` in `main` | **OPEN: D4** |
| Read-only cloud facts | partly: Supabase and credential counts read; Fly, OCI and Google not authenticated |

## What stands between this and "Phase 2 complete"
1. **D1** key provider (Google Cloud KMS or OCI KMS): no real custody evidence is possible before it.
2. **D4** Batch 1's vault and `TenantContext` in `main`.
3. **D2/D3** where the API, workers and browser run; the sandbox probe on that host (OCI, ARM64) is the proof the contract asks for.
4. **D5** CI environment secrets and protection, before any pull request.
5. A staging deployment to earn any `STAGING_VERIFIED` row.
6. INFRA-007 (Phase 3) for the real Chromium, Playwright and Stagehand path behind a `BrowserWorker` interface that does not exist yet.
