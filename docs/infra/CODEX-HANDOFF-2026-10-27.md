# Handoff to Codex: Batch 1.5 and Batch 2 (2026-10-27)

Ownership change recorded by the founder: **Codex now owns completing Batch 1 Phase 4 and integrating, merging, deploying and activating Batches 1, 1.5 and 2.** The author of these branches (Claude) has stopped work on them and will not modify them unless the founder reassigns them. Nothing below has been merged, deployed, applied to a hosted database, enabled or paid for.

Read first: `docs/infra/POST-MIGRATION-ACTIVATION-CHECKLIST.md` (the executable sequence), `COMBINED-ACTIVATION-RUNBOOK.md` (reasoning, variable tables, live-provider procedure L1 to L8), `COMPLETION-MATRIX-2026-10-27.md`, `batch-2/FINAL-AUDIT.md`, `batch-1.5/AUDIT-2026-10-26.md`, `batch-1.5/DURABILITY-AND-DRIVE-UI.md`.

Evidence labels: **TESTED** = automated tests with in-memory stores, fakes or local servers. **REAL-DEPENDENCY** = real PostgreSQL or Chromium on a disposable runner. **PENDING** = needs the verified Google runtime, real R2, Cloud Tasks or Scheduler, or a real provider account. No mocked test is provider verification.

## 1. The PRs, dependencies and exact heads

All six are drafts. Heads as of this handoff (the head of #862 moves by one docs commit when this file is added; use the PR page for the live value).

| PR | Branch | Base | Head | PR checks | Mergeable |
|---|---|---|---|---|---|
| #857 Batch 2 Phase 1 (product builder) | `claude/batch2-phase1-product-builder` | `main` | `f7f8bece` | 13 pass, 2 skipped by design | **CONFLICTING** with `main` (not touched) |
| #858 Batch 2 Phase 2 (QA, iteration, export) | `claude/batch2-phase2-qa-iteration-export` | #857 | `ed43af3f` | 9 pass, 1 skipped | yes (against #857) |
| #859 Batch 2 Phase 3 (delivery) | `claude/batch2-phase3-delivery` | #858 | `b0f9b8ce` | 9 pass, 1 skipped | yes (against #858) |
| #862 Batch 2 final audit overlay | `claude/batch2-final-audit` | #859 | `43fd672f` (before this file) | 8 pass, 1 skipped | yes (against #859) |
| #861 Batch 1.5 audit fixes | `claude/batch15-audit-fixes` | `main` | `7f0f5778` (includes a merge of `main` at `3c3bc0f5`, Codex's #856) | 13 pass, 2 skipped by design, including `storage-phase1` | yes |
| #860 Composio platform expansion | `claude/composio-platform-expansion` | `main` | `d055c8a5` | 12 pass, 2 skipped | **CONFLICTING** with `main` (not touched); separate, optional, everything default off |

Dependencies: #857 to #858 to #859 to #862 is a stack (merge in that order, retargeting each to `main` as the one below it lands). #861 is independent of the stack. #860 is independent of both and optional. Merge #861 first; the stack needs one resolution after it (section 3). Skipped checks (`oci-managed-custody`, `production-discovery`, one `build`) are skipped by workflow design, not failures.

## 2. Verified CI, honestly

- Every PR check on the heads above passed when last observed. PR checks run against the PR's merge with its base; they are not a substitute for a fresh run after you merge.
- `storage-phase1` (branch push, #861): passes in about 5.5 minutes on `4b238433` and on `7f0f5778`. It previously failed at step 06 (the whole backend suite) on #861 AND on pristine `main` (run 40373053674): the step ran in the CI job's ambient environment (no `NODE_ENV=test`) and never finished, and ten credential-vault tests failed there. Step 06 now runs in the same sanitized environment as the `unit` workflow (`safeTestEnvironment` from `scripts/ci/run-baseline.mjs`). Those ten tests stay listed in `baseline-failures.json` as historical baseline; they were not seen failing after the fix, and the list may now be removable.
- The combined integration (both stack heads and #861 merged locally, nothing pushed) passed on earlier heads: backend and frontend typecheck, 701 backend tests (700 pass, 1 skipped by design), 1209 frontend tests, tenant audit, requirements ledger, skip governance. **It has not been re-run against the current `main` (which now contains #856).** Do that first.
- Real-Chromium and real-PostgreSQL evidence: `golden.browser.integration.test.ts`, `qa.browser.integration.test.ts`, `repair.integration.test.ts` (Builder), `postgresLeaseStore.integration.test.ts`, `browserRunStore.integration.test.ts` and the storage PostgreSQL tests (Batch 1.5, run in `storage-phase1`). None touched a real provider.

## 3. Merge conflicts and their documented resolutions

1. **#861 against `main`:** already resolved (merge commit `7f0f5778`): reviewed-table map keeps `google_canonical_deliveries` then `browser_runs`; pinned count 17 in `scripts/security/schema-catalog.test.mjs`; generated registers regenerated.
2. **#857, #860 against `main`:** conflict, most likely only in generated registers (`docs/xroga/**`) and the reviewed-table list. Not attempted. Method that worked every time: merge `main` (no force push); for generated files take either side then regenerate; combine the hand-maintained lists keeping both sides in order.
3. **The Batch 2 stack against #861 (test merge, aborted, recorded):** conflicts in `scripts/security/schema-catalog.mjs` (reviewed map), `scripts/security/schema-catalog.test.mjs` (pinned count), `docs/xroga/security/current-migration-additions.json` (table list; its order must equal the map's order) and `tests/ci/known-skips.json` (union of both). Expected final order: `google_canonical_deliveries`, `browser_runs`, `builder_projects`, `builder_revisions`, `builder_verifications`, `builder_external_operations`; pinned count 21 once #861 and the stack are both in (the stack alone pins 19). Migration hashes in the additions file are the sha256 of the LF content of each migration file; do not change a reviewed migration without updating them.
4. **Regenerating registers (never hand-edit them):** after the code is committed and every new file is tracked (`git add` first, generators read tracked files), run `node scripts/xroga/inventory.mjs --write`, `runtime-inventory.mjs --write`, `reconcile-requirements.mjs --write`, `phase-two.mjs --write`, `node scripts/security/audit-tenant-policies.mjs --write`; then check with plain runs, `validate-requirements-ledger.mjs`, `mission-check.mjs`, `node scripts/ci/check-test-skips.mjs`. The registers embed the HEAD sha, so they never reach a fixed point locally; one regeneration after the final code commit is what CI accepts.
5. **Caller reviews are sha-bound** (`docs/xroga/security/caller-reviews.json`). A change to a reviewed file (for example `backend/src/builder/store.ts`) makes the audit fail with "Stale or unknown caller review". Remap by (kind, enclosing function, ordinal); new call sites join the file's scoped-boundary review. Do not hand-edit frozen tenant obligations.
6. Governance gates that bite new work: every new `page.tsx` needs a `frontend/src/lib/publicUrlInventory.ts` entry; every new table needs the reviewed map and additions entry above; every new conditional skip needs a `tests/ci/known-skips.json` entry.

## 4. Migrations (all additive; none applied anywhere)

| # | File | Rollback |
|---|---|---|
| 1 | `20261022000000_storage_drive_foundation.sql` (on `main` already) | `batch-1.5/rollback/...foundation.down.sql` |
| 2 | `20261024000000_worker_task_leases.sql` (on `main` already) | `batch-1.5/rollback/...leases.down.sql` |
| 3 | `20261026100000_browser_runs_durable.sql` (#861) | `batch-1.5/rollback/20261026100000_browser_runs_durable.down.sql` |
| 4 | `20261026000100_builder_projects.sql` (#857) | drop `builder_revisions`, `builder_projects` |
| 5 | `20261026010000_builder_phase2.sql` (#858) | drop `builder_external_operations`, `builder_verifications` |
| 6 | `20261026020000_builder_phase3.sql` (#859) | delete non-GitHub operation rows, restore narrower checks |
| 7 | `20261026030000_builder_preview_readiness.sql` (#862) | `ALTER TABLE public.builder_projects DROP COLUMN IF EXISTS preview_readiness` |

Note the timestamp collision risk: Codex's `20261026000000_google_canonical_deliveries.sql` and the Builder's `20261026000100_builder_projects.sql` share a version prefix. Confirm the migration runner treats them as distinct (the full-history test applies files in name order) and rename the Builder file if your tooling keys on the timestamp alone. Before applying anything, run `scripts/security/compare-production-migrations.mjs` against the target; the hosted state was never inspected by this author.

## 5. Environment and flags (every switch defaults to off; details in the runbook)

- Drive: `XROGA_DRIVE_R2_*`, dedicated private bucket, storage database URL, `STORAGE_WRITE_MODE`, `STORAGE_READ_ORDER`, `STORAGE_QUOTA_BYTES`; scheduled housekeeping `XROGA_STORAGE_RECONCILE_MODE=cloud` plus audience and service account; frontend `NEXT_PUBLIC_XROGA_DRIVE=1`; the R2 bucket CORS must allow `PUT` from the app origin and expose `ETag`.
- Browser worker and durable runs: `XROGA_BROWSER_WORKER_URL`, `XROGA_BROWSER_COORDINATOR_SECRET`; `XROGA_BROWSER_DISPATCH=cloud-tasks` with `XROGA_BROWSER_TASKS_PROJECT`, `_LOCATION`, `_QUEUE`, `XROGA_BROWSER_EXECUTE_URL`, `XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT`, `XROGA_BROWSER_EXECUTE_AUDIENCE`; `XROGA_BROWSER_INTERNAL_MODE=cloud`, `XROGA_BROWSER_RECOVER_SERVICE_ACCOUNT`, `XROGA_BROWSER_RECOVER_AUDIENCE`; a Cloud Tasks queue, two service accounts, a Cloud Scheduler job for `/internal/browser/recover` (billable, not created); Cloud Run request timeout for `/internal/browser` of 15 minutes or more. A half-configured `cloud-tasks` setting answers 503 by design; unset means in-process execution (single always-allocated instance only).
- Builder: `UNIVERSAL_AGENT_ENABLED` (+ percentage or allowlist), `NEXT_PUBLIC_XROGA_BUILDER=1`, isolated QA host `XROGA_BUILDER_QA_HOST_URL` and `XROGA_BUILDER_QA_HOST_SECRET` (set together; host side `XROGA_QA_HOST_SECRET`, `XROGA_QA_HOST_ALLOWED_SUFFIXES`, `XROGA_QA_HOST_MAX_CONCURRENT`, entry point `backend/src/builder/qa/qaHostMain.ts`); `XROGA_BUILDER_INPROCESS_QA` left unset in production.
- Startup policy and readiness evaluators are deliberately not wired into `index.ts` (`runtime/bootGuard.test.ts` pins that). The tested wiring is saved as `docs/infra/batch-1.5/cutover-startup-readiness.patch`. Now that #856 is on `main` you will need to reconcile it with whatever startup code the migration added; this author has not looked at that.

## 6. Implemented, not production-verified

| Area | Source state | Not verified |
|---|---|---|
| Drive API, storage, quota, reconcile | Implemented, TESTED, REAL-DEPENDENCY (PostgreSQL, S3 emulator) | Real R2, bucket CORS, Cloud Scheduler run |
| Drive screen `/drive` | Built, TESTED, flagged off (new scope) | Real-browser upload |
| Durable browser runs, cancel, recovery, 429 ceiling | Implemented, TESTED, REAL-DEPENDENCY (store SQL) | Cloud Tasks and Scheduler delivery; two real Cloud Run instances |
| Builder projects, revisions, preview, QA, repair, follow-up, restore, Stop, chat continuity, export | Implemented, TESTED, REAL-DEPENDENCY (PostgreSQL store, Chromium QA) | Sandbox preview on the Google runtime; live model builds; reopened chat in a real browser |
| Isolated QA host path | Client, host, sealed reports, TESTED over real HTTP with a fake browser | Host deployment; a real run against a generated app |
| GitHub, Supabase, Vercel delivery | Implemented against fakes and request-level contracts | **PROVIDER NOT VERIFIED**: runbook section 4 (L1 to L8) on disposable accounts |
| Composio expansion (#860) | Implemented, default off | Real Composio; paid or security-sensitive features stay disabled |

## 7. Quota proposal and the unimplemented Pro limit

`STORAGE_QUOTA_BYTES` is one global number for every tenant. **Proposal (founder): 500 MB for Free users, `STORAGE_QUOTA_BYTES=500000000`. It is documented and prepared; it is not set in any environment and must not be applied until activation is authorised.** Unset means "tracked, not enforced" (readiness reports `storage_quota_not_enforced`). A set but malformed value is now a startup and readiness error, never "unlimited". **Pro 20 GB is NOT implemented:** it needs a per-tenant quota resolver driven by verified subscription entitlement and a storage-cost review. Do not set 20 GB globally.

## 8. Remaining acceptance tests

Run the checklist gates 4 and 5 in `POST-MIGRATION-ACTIVATION-CHECKLIST.md`: Drive (small and multipart, quota refusal, tenant isolation, reconcile), browser runs across two instances (cancel, recovery, 429), Builder B1 to B9 and L1 to L8 on disposable GitHub, Supabase and Vercel accounts, a full backend, frontend and golden run on the exact release commit, and a rehearsed rollback (gate 6).

## 9. Known limitations

- The per-tenant active-run ceiling is a count then an insert; under heavy concurrency it can briefly exceed 4. It is a soft limit.
- Stopping a Builder build does not cancel a QA run already in flight (a separate detached activity); its result may still update the state of the saved revision it tested.
- Cancelling a browser run takes up to 0.5 s to reach a running browser (the polling interval).
- The Builder's stale-run window is still one hour; a shorter window needs a worker heartbeat on the Google model.
- Not built, by design: Drive sharing, folders, rename, preview; Supabase new-project creation and escalated destructive SQL approval; Vercel production URL reconciliation, GitHub default-branch detection and the `read:org` scope (all need live-provider verification first).
- Fly-era assumptions listed in `batch-1.5/AUDIT-2026-10-26.md` ("Fly.io-specific assumptions") that Codex's migration owns were not changed by these branches.
- The hosted database state (which migrations are applied) was never inspected.
