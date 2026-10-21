# Batch 1.5 · Phase 1 acceptance (INFRA-001 · INFRA-002 · INFRA-003)

**Overall verdict: `B15_PHASE1_ENGINEERING_COMPLETE_EXTERNAL_VERIFICATION_PENDING`**

`B15_PHASE1_VERIFIED` is **not** claimed: no real Cloudflare R2, Supabase, Fly or GitHub-Actions evidence exists. Everything below is `LOCAL_TESTED` against a real PostgreSQL 16 plus synthetic stores. No gate is promoted past what its evidence supports.

| | |
|---|---|
| Branch | `claude/xroga-batch-1-5` (local only; **push blocked: HTTP 403**, see §6) |
| Starting `main` | `80d1f417338b4c5b95a07fc956604a1652cef7c7` (not modified) |
| Source SHA the evidence is bound to | `bc0c6fd67bb0787aa9622c0cd43739f9081b50b3` (docs/evidence-only commit follows; `git diff bc0c6fd6..HEAD -- backend supabase scripts` is empty) |
| Production / main / Codex branch touched | no / no / no |
| Additional spend | $0.00 |

## Gates
| Gate | Result | Proof | Not proven / why |
|---|---|---|---|
| **A** Baseline correctness | **PASS** (source baseline) | `current-state.md`, `data-location-inventory.{md,json}`, `dependency-inventory.md`, `product-capability-baseline.md`: every row cites a file. Found: legacy writer is dormant on `main`; no upload endpoint existed; run output lives in `swarm_runs.output`; GitHub tokens are stored as plaintext JSON in a private bucket | **Live cloud inventory BLOCKED** (Cloudflare/Supabase/Fly): counts and sizes are `UNKNOWN`. Needs operator-checklist A1–A5 |
| **B** Private storage security | **BLOCKED** | Private-by-default, server-derived identity, no key/bucket exposure, cross-tenant refusal, no browser credentials: `evidence/logs/02,04,05` (cross-tenant refusal on download, complete, delete, metadata, server-read, part-signing and listing; RLS and grants tested as `authenticated`/`anon` roles on real Postgres; routes reject `tenantId/ownerUserId/bucket` in bodies) | "no public raw object access" is a property of the **real bucket** (public domain, r2.dev, CORS) and was not inspected. Needs checklist B1–B2 |
| **C** Complete lifecycle | **PASS** (LOCAL_TESTED) | initiate→reserve→signed PUT→complete→verify→READY; download; delete; retention; reconcile; multipart incl. crash-after-complete, abandoned abort: `02-storage-unit`, `04`, `05`, `05b` | Multipart and signed-header enforcement on **real R2** unproven |
| **D** Durability and integrity | **BLOCKED** (provider part) | SHA-256 read-back, tamper → CORRUPT, size/type quarantine, no false READY (DB CHECK + trigger, mutation-tested), retrieval after "process exit" via a fresh service over the same stores, provider timeout after write handled | durability of the bytes at **R2** is a provider property; not observed |
| **E** Quotas | **PASS** (LOCAL_TESTED) | atomic reserve/commit/release/free/expire/reconcile in SQL; 50 concurrent reservations → exactly 10 admitted (real Postgres); idempotent replay; no negatives; expiry re-reserve; no entitlement changed (`STORAGE_QUOTA_BYTES` unset = tracked, not enforced) | candidate Free 500 MB / Pro 20 GB **not activated** by design |
| **F** Migration safety | **PASS** (LOCAL_TESTED) | inventory, dry-run (writes nothing), durable ledger, deterministic ids, lease claims (`SKIP LOCKED`, real Postgres), checkpoint resume, source-hash vs destination-hash, read-back verify, honest reconciliation (`consistent` flag), idempotent replay, rollback that never deletes, fault injection ×11; **no live migration performed**, sources byte-identical | live-data migration deliberately not run |
| **G** Integration compatibility | **PASS** | existing `project_files`/projects contracts preserved (additive column only); `STORAGE_WRITE_MODE=legacy` default = unchanged; no scheduler/task graph added; no credential exposure; token buckets excluded by construction; `WAITING_FOR_BATCH1_ACCEPTED_INTERFACE` recorded for TenantContext | no enabled production writer exists to switch (finding W1–W3) |
| **H** Source and CI evidence | **BLOCKED** | attributable commits ✔; relevant tests pass ✔ (51+32+9+17+4 targeted; full backend suite 2827/2830); security negative tests pass ✔; mutation checks 8/8 caught ✔; no production/main mutation ✔ | **GitHub Actions CI did not run**: the branch could not be pushed (403). The 3 failing tests also fail on pristine `main` (`evidence/logs/08`) |

## Test results (exact)
| Log | Command | Result |
|---|---|---|
| `01-typecheck` | `tsc --noEmit -p backend` | exit 0 |
| `02-storage-unit` | `tsx --test storageService / r2ObjectStore / artifactSink` | 51 / 51 pass |
| `03-migration-unit` | `engine / readCompat / cli` | 32 / 32 pass |
| `04-routes-and-adapter` | `drive.test / projectFiles.canonical.test` | 9 / 9 pass |
| `05-postgres-integration` | real PostgreSQL 16.15, disposable DB | 17 / 17 pass |
| `05b-s3-wire-emulator` | AWS SDK v3 over HTTP to **s3rver (SYNTHETIC)** | 4 / 4 pass |
| `06-full-backend-suite` | `npm test --workspace=backend` | 2827 pass / **3 fail** / 0 skip — same 3 as `main`: `organicIntelligence` `STALE_FACT` date drift vs sandbox clock |
| `07-mutation-checks` | 8 injected defects | 8 CAUGHT, 0 survived (a first single-check mutant of size verification was *equivalent* — the size is checked twice — and was replaced by a both-checks mutant) |
| `08-main-baseline` | same file on `origin/main` @ `80d1f417` | same 3 failures |

Skipped-by-default suites need env (`STORAGE_TEST_DATABASE_URL`, `STORAGE_TEST_S3_ENDPOINT`); without them they report SKIP, never pass.

## Evidence classification (per the "no false completion" rule)
| Claim | Class |
|---|---|
| SQL schema, state trigger, RLS/grants, quota functions, migration claim | **LOCAL_TESTED** (real PostgreSQL) |
| StorageService / migration engine logic | **LOCAL_TESTED** (synthetic object store) |
| R2ObjectStore wire behaviour | **LOCAL_TESTED, SYNTHETIC** (s3rver; 3 emulator gaps listed in `evidence/start-s3-emulator.cjs`; `listParts`, truncated `list` pagination and presigned parts **not exercised on the wire**) |
| Presigned request shape (signed headers, expiry, forced disposition) | offline SDK output inspected (`r2ObjectStore.test.ts`) — what we *ask* R2 to enforce, not proof R2 enforces it |
| Cloudflare R2 | **BLOCKED** — no credentials |
| Supabase production schema/RLS | **BLOCKED** — migration not applied anywhere |
| GitHub Actions | **BLOCKED** |
| Anything in production | **NOT_STARTED** (deliberately) |

## Known limitations (honest list)
1. Objects > 1 GiB in migration → `BLOCKED(NEEDS_MULTIPART_COPY)`; server-side multipart copy not built.
2. `reconcile()` checks the first `limit` READY objects per run (no cursor yet).
3. Dead code `storeUserFile`/`readStoredFile(no actor)` still has the unsafe 3-tier fallback; not deleted (no behaviour changes in legacy mode).
4. No frontend resolver for `drive://{id}` references (only produced in `STORAGE_WRITE_MODE=r2`, off by default).
5. `swarm_runs.output` inline artifacts have no migration adapter.
6. GitHub/Vercel OAuth tokens remain plaintext JSON in a private bucket — out of Phase 1, flagged for INFRA-004.
7. Migration of `FREEZE_OLD` is a ledger marker; no legacy source is ever modified or deleted by this code.
8. rclone was evaluated and not needed: the SDK path streams, hashes in one pass and resumes through the ledger.

## Blockers (consolidated)
| # | Blocker | Blocks | Minimum to unblock |
|---|---|---|---|
| 1 | GitHub 403 on branch create/push | remote CI, review | grant write access or create the branch (operator-checklist D) |
| 2 | No Cloudflare access | Gates A-live, B, D; PROVIDER_VERIFIED | checklist A1, B1–B2 |
| 3 | No Supabase/Fly/Redis facts | live data-location counts | checklist A2–A5 |
| 4 | Batch 1 `TenantContext` not in `main` | tenant_id = user id until then | accepted interface from Codex |
| 5 | Owner approvals (copy / read_new / freeze / production) | any live migration | recorded via `create-migration-job.mts approve` |
