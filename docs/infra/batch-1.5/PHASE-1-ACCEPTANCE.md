# Batch 1.5 · Phase 1 acceptance — closure revision

**Verdict: `B15_PHASE1_ENGINEERING_COMPLETE_EXTERNAL_VERIFICATION_PENDING`**

Not `B15_PHASE1_VERIFIED`: three gates need evidence that only the real Cloudflare R2 provider and a pushed GitHub branch can give (B, D, H). All independent engineering is done and tested locally on real PostgreSQL 16 plus synthetic stores. No gate criterion was changed to force a pass.

| | |
|---|---|
| Local branch / worktree | `claude/xroga-batch-1-5` · `/home/user/xroga-b15` |
| Evidence source SHA | `f3de2b5597a26658ab452151b19911e9bfccca8b` (all tests below ran on exactly this commit; a later commit changes `docs/` only) |
| Starting `main` | `80d1f417338b4c5b95a07fc956604a1652cef7c7` — **not modified** (also not Codex's branch, not the S00 edits) |
| Remote | **not pushed**: session token has `push:false` on the repo (`github-access-diagnosis.md`) |
| Recovery artifact | `git bundle` of `origin/main..HEAD`; verified; HEAD of bundle = branch HEAD |
| Spend | $0.00 · no cloud resource touched |

## What the closure pass found and fixed (real defects, not paperwork)
| # | Defect | Severity | Fix | Proof |
|---|---|---|---|---|
| 1 | Provider network errors (`ECONNREFUSED`, `ETIMEDOUT`…) were **not** classified transient (`name ?? code` never reached `code`), so an outage surfaced as a raw error instead of a retryable 503 | real bug | `isTransient` checks name, code, cause | wire test `[APPLICATION] an unreachable provider…` failed first, then passed; unit + mutation |
| 2 | An **invalid** `STORAGE_WRITE_MODE`/`READ_ORDER` silently meant `legacy` | unsafe default | invalid ⇒ `StorageConfigError`, fail closed, loud at boot | 17-case matrix, mutation caught |
| 3 | `dual` with Drive unconfigured quietly wrote legacy only | misleading | configuration error | `projectFiles.canonical.test` |
| 4 | Migration "approval" was a JSON field in a database row, forgeable by anyone with the flag or DB access | **security** | Ed25519-signed approvals bound to job/stage/environment/source/bucket/plan digest/expiry/tenants; engine holds only the public key; re-verified before every batch | `approvals.test` (12) + 3 mutations caught |
| 5 | Privileged SQL functions had no pinned `search_path`; RLS not forced | hardening | `set search_path = public, pg_temp` on all 8; `FORCE ROW LEVEL SECURITY` on all 6 | `schemaUpgrade.integration`, 2 mutations caught |
| 6 | A server-side read of an object the provider lost threw a raw provider error | correctness | `NOT_FOUND` / retryable `PROVIDER_UNAVAILABLE`; never a corruption verdict on a transient failure | 3 new tests |
| 7 | The evidence runner could print success with skipped fixtures | evidence integrity | strict runner: missing/unreachable fixture ⇒ FAIL under `REQUIRE_PHASE1_FIXTURES=1`; SKIP ≠ PASS; machine-readable `results.json`; baseline failures allow-listed by name | `--check-fixtures` negative runs |

Deliberately **not** changed: the Drive architecture, the legacy write path's default behaviour, any entitlement, the scheduler, the vault.

## Gates
| Gate | Result | Proof | Not proven / why |
|---|---|---|---|
| **A** Baseline accuracy | **PASS** (source scope) | `current-state.md`, `data-location-inventory.*`, `dependency-inventory.md`, `product-capability-baseline.md`, `requirements-matrix.md`; two baseline errors **corrected** during closure (legacy writer is dormant; token storage is wider than first reported) | live Cloudflare/Supabase/Fly counts are `UNKNOWN` (EXTERNAL) |
| **B** Private storage + tenant authorization | **BLOCKED** | forced RLS, 14-column grant, `anon` nothing, client cannot name tenant/owner/bucket, cross-tenant NOT_FOUND on every operation, project revocation on next request, no key/URL in logs — all LOCAL_TESTED (`evidence/logs/03`, `02`) | "no public raw access" and CORS are properties of the **real bucket**: `r2.provider.integration.test.ts` step 4–5, 7 **never run** |
| **C** Lifecycle completeness | **PASS** (LOCAL_TESTED) | upload→verify→READY, download, delete/retention, reconcile, multipart incl. duplicate/wrong-ETag/missing/extra part, abandoned abort, listing; wire suite on emulator | R2-side multipart/ListParts/pagination unproven; emulator gaps classified `EMULATOR_LIMITATION` (ListParts 405, truncated list 500, presigned part 405 — each reproduced with bare SDK calls, none an application bug) |
| **D** Real durability + integrity | **BLOCKED** | server read-back SHA-256, tamper→CORRUPT, size/type→QUARANTINED, no false READY (CHECK+trigger, mutation-proven), fresh-service retrieval | durability and signed-constraint enforcement **at R2** unobserved |
| **E** Quota consistency | **PASS** (LOCAL_TESTED, real PostgreSQL) | 50 parallel reservations → exactly 10; idempotent commit/release/free; crash/expiry/re-reserve; drift repair; wrong-tenant refused by the DB | behaviour behind a transaction pooler not run |
| **F** Migration safety | **PASS** (LOCAL_TESTED) | cryptographic approvals; dry-run writes nothing; kill-after-upload, DB-commit failure, timeout-after-write, corrupt destination, source missing/changed, duplicate workers (memory + real SKIP LOCKED), rollback idempotent, deletion not implemented; **no live migration** | no real customer data touched (by design) |
| **G** Compatibility | **PASS** | additive migration; `legacy` default unchanged; `/api/drive` mounted once behind `authMiddleware`; no scheduler/vault added; token bucket refused by the engine; `WAITING_FOR_BATCH1_ACCEPTED_INTERFACE: TenantContext` | Batch 1 not yet in `main` |
| **H** Source, CI, branch evidence | **BLOCKED** | clean attributable commits; strict runner `overall=PASS`; 15/15 injected defects caught; baseline failures identical on `main` | branch **not on GitHub**, so no Actions run; `storage-phase1.yml` is ready (push-to-branch/dispatch only, no secrets) |

## Test evidence (on `f3de2b55`; `evidence/logs/results.json`)
| Step | Result |
|---|---|
| typecheck | PASS |
| unit + adapters + routes + config + approvals | **135 / 135** |
| real PostgreSQL 16.15 (schema, RLS, quota races, upgrade, idempotency, rollback, migration ledger) | **22 / 22** |
| AWS-SDK wire tests vs s3rver (**SYNTHETIC**) | **7 / 7** |
| Cloudflare R2 provider suite | **NOT_RUN** — not authorised; never executed |
| full backend suite | 2878 pass · **3 BASELINE_FAILURE** · 0 regressions (same 3 on pristine `main` `80d1f417`, same toolchain: `STALE_FACT` verification-date drift in `organicIntelligence.test.ts`) |
| injected-defect checks | **15 / 15 caught**, none survive in source (`git status` clean after the run) |

The full backend suite is **not green**; it has 3 pre-existing, unrelated failures that are classified, not hidden.

## Evidence classes
LOCAL_TESTED = real PostgreSQL / in-process logic · SYNTHETIC = s3rver · **PROVIDER_VERIFIED = none** · STAGING/PRODUCTION = none.

## Remaining external dependencies (one list)
1. GitHub write access (or import the bundle) — Gate H.
2. One bucket + one scoped token + CORS + confirmation — `r2-provider-verification-request.md` — Gates B, D.
3. Confirm `Preview` environment secrets are not production's before opening any PR (`github-access-diagnosis.md`).
4. Batch 1 `TenantContext` accepted into `main`.
5. Owner approvals via the signed flow before any live migration stage.
6. Decide on the OAuth plaintext finding (`oauth-token-finding.md`): recommended to schedule with INFRA-004.
