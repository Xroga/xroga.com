# Post-migration activation checklist: Batch 1.5 and Batch 2

For use only after Codex's Google Cloud migration (PR #856) is merged and verified live. This is the executable, tick-as-you-go version of `COMBINED-ACTIVATION-RUNBOOK.md` (which has the reasoning, the full variable tables and the live-provider procedure L1 to L8). Every step below needs its own explicit authorisation when it creates a resource, applies SQL to a hosted database, deploys, or touches a customer or provider account. Nothing here has been run.

Record the release commit, operator and date at each gate. A gate that is not green stops the sequence.

## Gate 0. Preconditions

- [ ] Codex's migration verified live on Cloud Run (API, Cloud Tasks and Cloud Scheduler available, storage reachable) and the Google runtime provider for `ProjectRuntimeManager` deployed. Evidence linked: ______
- [ ] Cloud Run sets `NODE_ENV=production` and `XROGA_DEPLOYMENT_ENVIRONMENT=production` (staging: `staging`); the service name does not contain staging, preview, sandbox, dev or test.
- [ ] Founder approvals recorded for: hosted migrations, the Cloud Tasks queue and service accounts (billable), the isolated QA host deployment, the R2 bucket CORS change, setting the quota.
- [ ] Disposable GitHub account, Supabase organisation and Vercel team exist for L1 to L8 (spend limits set).
- [ ] A verified point-in-time recovery point or dump of the production database exists immediately before each migration step.

## Gate 1. Merge, in the tested order (each merge needs its CI green)

1. [ ] Merge #861 (Batch 1.5 audit fixes) into `main`. CI green on the merge commit. Exact head tested: `3b718db8` plus any later commit listed in the completion matrix.
2. [ ] Rebase or merge `main` into the Batch 2 stack and resolve the four known conflicts by keeping BOTH sides, in this order, then regenerate (never hand-edit) the generated registers:
   - `scripts/security/schema-catalog.mjs`: reviewed-table map, `builder_projects`, `builder_revisions`, `builder_verifications`, `builder_external_operations`, then `browser_runs`.
   - `scripts/security/schema-catalog.test.mjs`: pinned count 20 (16 from #861, plus the four builder tables).
   - `docs/xroga/security/current-migration-additions.json`: same table order as the map above.
   - `tests/ci/known-skips.json`: union of both registers (40 entries at the tested heads).
   - Regenerate: `node scripts/xroga/inventory.mjs --write`, `runtime-inventory.mjs --write`, `reconcile-requirements.mjs --write`, `phase-two.mjs --write`, `node scripts/security/audit-tenant-policies.mjs --write`; run each plain once more to confirm PASS; run `node scripts/xroga/validate-requirements-ledger.mjs`, `node scripts/xroga/mission-check.mjs`, `node scripts/ci/check-test-skips.mjs`.
3. [ ] Merge #857, #858, #859, then #862, one at a time, CI green on each.
4. [ ] Composio #860 is separate and optional; do not merge it as part of this activation.

## Gate 2. Database migrations (staging first, then production; dump before each; one at a time)

Before applying anything, run `scripts/security/compare-production-migrations.mjs` against the target to list every migration the target lacks. Apply only what it reports missing, in file order, and read any file it classifies as `DESTRUCTIVE_OR_BACKFILL_REVIEW_REQUIRED` before applying. The files this release adds, in order:

| # | File | Rollback |
|---|---|---|
| 1 | `20261022000000_storage_drive_foundation.sql` | `docs/infra/batch-1.5/rollback/20261022000000_storage_drive_foundation.down.sql` |
| 2 | `20261024000000_worker_task_leases.sql` | `.../20261024000000_worker_task_leases.down.sql` |
| 3 | `20261026000000_builder_projects.sql` | drop `builder_revisions`, `builder_projects` (nothing else references them) |
| 4 | `20261026010000_builder_phase2.sql` | drop `builder_external_operations`, `builder_verifications` |
| 5 | `20261026020000_builder_phase3.sql` | delete rows whose provider is not `github`, restore the narrower checks |
| 6 | `20261026030000_builder_preview_readiness.sql` | `ALTER TABLE public.builder_projects DROP COLUMN IF EXISTS preview_readiness` |
| 7 | `20261026100000_browser_runs_durable.sql` (#861) | `.../20261026100000_browser_runs_durable.down.sql` (only with no run queued or running) |

After each: [ ] RLS enabled on every new table; [ ] `anon` and `authenticated` have no grants on `worker_task_leases` or `browser_runs`; [ ] the Drive state-transition trigger exists; [ ] `builder_*` tables are owner-`SELECT` only for the browser role.

## Gate 3. Configuration (secret store only; every switch starts at its safe default)

- [ ] Drive: `XROGA_DRIVE_R2_*`, dedicated private bucket, storage database URL, `STORAGE_WRITE_MODE=dual` for one staging tenant first, `STORAGE_READ_ORDER`. **Quota: proposed `STORAGE_QUOTA_BYTES=500000000` (500 MB, the Free limit). The setting is global; do not set 20 GB. Pro 20 GB needs per-tenant, entitlement-aware enforcement that is NOT implemented.** Apply the value only with founder approval at activation.
- [ ] R2 bucket CORS: allow `PUT` from the app origin, expose the `ETag` header (needed by the Drive screen's multipart upload).
- [ ] Scheduled housekeeping: `XROGA_STORAGE_RECONCILE_MODE=cloud`, `_AUDIENCE`, `_SERVICE_ACCOUNT`; Cloud Scheduler job to `POST /internal/storage/reconcile`.
- [ ] Browser worker: `XROGA_BROWSER_WORKER_URL`, `XROGA_BROWSER_COORDINATOR_SECRET`; durable runs: `XROGA_BROWSER_DISPATCH=cloud-tasks`, `XROGA_BROWSER_TASKS_PROJECT`, `_LOCATION`, `_QUEUE`, `XROGA_BROWSER_EXECUTE_URL`, `XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT`, `XROGA_BROWSER_EXECUTE_AUDIENCE`, `XROGA_BROWSER_INTERNAL_MODE=cloud`, `XROGA_BROWSER_RECOVER_SERVICE_ACCOUNT`, `XROGA_BROWSER_RECOVER_AUDIENCE`; Cloud Run request timeout for `/internal/browser` of at least 15 minutes; Cloud Scheduler job to `/internal/browser/recover` every 1 to 2 minutes.
- [ ] Builder: `UNIVERSAL_AGENT_ENABLED` with an allowlist; `XROGA_BUILDER_QA_HOST_URL` and `XROGA_BUILDER_QA_HOST_SECRET` (set together); QA host deployed with `XROGA_QA_HOST_SECRET`, `XROGA_QA_HOST_ALLOWED_SUFFIXES`, `XROGA_QA_HOST_MAX_CONCURRENT`; `XROGA_BUILDER_INPROCESS_QA` left unset.
- [ ] Frontend flags built last: `NEXT_PUBLIC_XROGA_DRIVE=1`, `NEXT_PUBLIC_XROGA_BROWSER_RUNS=1`, `NEXT_PUBLIC_XROGA_BUILDER=1`, each only after its backend passes its smoke test.
- [ ] Startup and readiness wiring applied (`docs/infra/batch-1.5/cutover-startup-readiness.patch`, with `runtime/bootGuard.test.ts` updated in the same change).

## Gate 4. Deploy with every switch at its default, then smoke

- [ ] `/health` and `/ready` (reports `environment`, `database`, `storage`; `storage_quota_not_enforced` and `storage_reconcile_not_scheduled` visible until configured); a normal chat turn; a legacy file read. Behaviour identical to before.

## Gate 5. Acceptance (staging, one tenant, then production allowlist). Pass criteria are the spec's, evidence is recorded per line

Batch 1.5
- [ ] A1 Drive: upload small and multipart from the Drive screen; download checksum equal; another tenant refused; quota refusal at the limit; object `READY`; nothing public.
- [ ] A2 Reconcile: force-run once; counts only; an abandoned test upload is cleaned.
- [ ] A3 Browser worker, **two instances**: run completes with Drive evidence and verified postconditions; a request carrying `writeGrant` is refused 400; cancel from the other instance stops the browser; stop the executing instance mid-run and the recovery sweep resumes it; a fifth concurrent run for one tenant is refused 429.
- [ ] A4 Custody and rate limit: per Batch 1; a guest cannot rotate the client address header to evade the limit on Cloud Run.

Batch 2 (steps as in runbook B3)
- [ ] B1 Routes up, flags off: 200 empty list for an authenticated user, 401 without identity.
- [ ] B2 Engine on for the test tenant: a plain request builds a saved revision; PARTIAL until a browser test passes.
- [ ] B3 Preview on the Google runtime: start, open through the signed gateway, foreign tenant refused, expiry refused, stop and restart.
- [ ] B4 QA on the isolated host: driver reads `remote:...`; a seeded defect fails with a screenshot; VERIFIED only after a pass; with the host stopped QA reports not run; an address outside the allowed suffixes is refused 403.
- [ ] B5 Repair within 3 attempts, re-tested; budget exhaustion stops it.
- [ ] B6 Follow-up changes the same project; reopened chat shows and continues it; a new chat does not inherit it; restore re-tests.
- [ ] B6a Stop: state becomes Cancelled, no revision afterwards, second Stop changes nothing, another user gets 404, a failed stop is reported as not saved.
- [ ] B7 Export: ZIP checksums match, no `.env`, migration present for a database app.
- [ ] B8 L1 to L8 on disposable accounts, recorded in `docs/infra/batch-2/LIVE-VERIFICATION-<date>.md`. Only then may any item be called PROVIDER VERIFIED.
- [ ] B9 Full existing backend, frontend and golden suites green on the exact release commit.

## Gate 6. Rollback (rehearsed before production)

Switch back to defaults: `STORAGE_WRITE_MODE=legacy`; unset `XROGA_BROWSER_WORKER_URL`, `XROGA_BROWSER_DISPATCH`, `XROGA_BROWSER_INTERNAL_MODE`, `XROGA_BUILDER_QA_HOST_URL`; unset the three `NEXT_PUBLIC_XROGA_*` flags; set `UNIVERSAL_AGENT_ENABLED` back. Routes become inert; records stay. Run a `.down.sql` only after a dump and with nothing in flight. Xroga never deletes anything in a customer's GitHub, Supabase or Vercel.

## Sign-off

| Gate | Commit | Operator | Date | Result |
|---|---|---|---|---|
| 0 to 4 | | | | |
| 5 (Batch 1.5) | | | | |
| 5 (Batch 2, including L1 to L8) | | | | |
