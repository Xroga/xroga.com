# Completion matrix: Batch 1.5 audit PR #861 and Batch 2 audit overlay #862 (2026-10-27)

Draft PRs. Nothing merged, deployed, applied to a hosted database, enabled or paid for. Codex's Google migration (PR #856) was not touched. The activation order, flags and smoke tests are in `COMBINED-ACTIVATION-RUNBOOK.md`.

**Evidence labels.** TESTED: automated tests with in-memory stores, fakes or a local HTTP server. REAL-DEPENDENCY: real PostgreSQL or real Chromium on a disposable runner. PENDING: needs the Google runtime, real R2, real Cloud Tasks or Scheduler, or a real provider account. Nothing below is described as live production acceptance, and no mocked test is presented as provider verification.

**Origin.** SPEC means the original specification already required the behaviour and the code did not meet it. NEW SCOPE means the specifications did not ask for it; it was built because the instruction asked for it or because a user-facing gap remained.

## The seven items

| # | Item | Origin | Status | Evidence | Still PENDING |
|---|---|---|---|---|---|
| 1 | Xroga Drive screen | **NEW SCOPE.** The three Batch 1.5 specifications require the Drive API, storage, quota and workers; none requires a Drive screen | Built behind `NEXT_PUBLIC_XROGA_DRIVE=1`: list, single and multipart upload with retries and cancel, download, delete with inline confirmation, honest states and error messages | `driveApiContract.test.ts` (client and routes in step, mounted behind auth, flag off, no `window.confirm`), `driveUpload.test.ts` (9), full frontend suite 1196 green | Bucket CORS (`PUT`, exposed `ETag`) on the real R2 bucket and a real-browser upload; design review by the founder |
| 2 | Browser worker durability | **SPEC** (INFRA-006 leases, recovery, cancellation; INFRA-007 browser capability). The code ran the run inside the request and could not persist at all in production (the route built a store that refuses saves without a swarm attempt) | Runs are a durable record; any instance can execute, cancel or recover one; an execution lease admits one executor; the per-tenant ceiling is counted from the shared table; dispatch is a port with an in-process and a Cloud Tasks implementation; signed internal execute and recover endpoints | `browserRunDurability.test.ts` (8), `browserRunDispatch.test.ts` (5), `browserRunInternal.test.ts` (4), `browserRuns.test.ts` (8), real PostgreSQL `browserRunStore.integration.test.ts` in `storage-phase1` | Cloud Tasks delivery, Cloud Scheduler and Cloud Run request handling on the Google runtime; creating the queue and service accounts (billable, not done) |
| 3 | Builder conversation continuity | **SPEC** (Batch 2 target 7: a follow-up continues the same project). The earlier note that no stable chat id exists was wrong: the chat session id is per chat and persisted | The session id is the project's conversation; `GET /api/builder/conversations/:id/project`; the workspace follows the chat; a new chat does not inherit another chat's project | `builder/conversation.test.ts` (5, incl. the route), `lib/builderContinuity.test.ts` | A real browser session across a reopened chat |
| 4 | Builder cancellation | **SPEC** (Batch 2 target 12 lists cancellation; only the chat abort existed) | `POST /api/builder/projects/:id/cancel` (owner only, idempotent), engine stop requested durably first, then one compare-and-set to `cancelled`; a cancelled run can no longer write state or add a revision; Stop button | `builder/cancel.test.ts` (8, incl. late finish, replaced run, other tenant, unsaved stop, HTTP route) | A real cancel of a live Cline build on the Google runtime; an in-flight detached QA run is not cancelled (documented) |
| 5 | Isolated production browser QA | **SPEC** (Batch 2 target 5 and the rule that generated code does not run in the API container) | A signed isolated-host path: `RemoteQaClient`, the host router and entry point; the host answer is sealed against the plan so a down, lying or partial host can only make QA not run or failed. Unavailable QA is reported as not run, never as a pass | `qa/remoteQa.test.ts` (17, incl. real HTTP and the full `QaService` path), `qa/qaHostMain.test.ts` (2); existing real-Chromium `qa.browser.integration.test.ts` | Deploying the host, a route from it to a Google-runtime preview, and a real run against a generated app |
| 6 | Drive quota and housekeeping | **SPEC** (quota and reconciliation), plus a defect: a malformed `STORAGE_QUOTA_BYTES` was silently read as unlimited | Default kept and documented (unset is tracked, not enforced; the number is a product decision). A malformed value is now a startup and readiness error. Readiness reports an unenforced quota and an unscheduled reconcile (non-blocking). The scheduled reconcile route from the earlier audit is unchanged | `storage/quotaConfig.test.ts`, `runtime/readiness.test.ts` | Choosing and setting the quota; running reconcile under Cloud Scheduler against the real database and R2 |
| 7 | CI and combined integration | n/a | See below | See below | See below |

## Item 7: CI and combined integration

**CI.** Branch-push and pull-request checks are listed per head commit in the PR description; the final state is recorded in the last section of this file. Failures found and fixed this round, each a real defect rather than a flake:

| PR | Failure | Cause | Fix |
|---|---|---|---|
| #861 | `verify` (storage-phase1) | The full backend step was killed at the 15 minute step default, so it failed on pristine `main` too (run 40373053674); ten credential-vault tests that need vault configuration also fail on `main` | Step limit 38 minutes, job 75 minutes, the ten tests recorded as baseline with their source run |
| #861 | `static-contracts` | The new `/drive` page was not in the public URL inventory | Registered as a private route; private prefix added |
| #861 | `authenticated-browser` (full-history migration) | The new `browser_runs` table was not in the reviewed migration additions | Added with the migration hash; validator map extended |
| #861 | `unit`, `integrated-candidate` | The new conditional real-PostgreSQL test was not in the known-skips register | Registered |
| #862 | none after the final push | | |

**Combined Batch 1.5 + Batch 2.** The two branch heads were merged locally (not pushed) in a scratch worktree: backend and frontend typecheck clean; 701 backend tests (builder, routes, workers, runtime, storage) and 1209 frontend tests pass; the tenant audit and mission policy pass after regenerating the generated registers. One real integration cost is recorded for the merge order: both branches add a table to `scripts/security/schema-catalog.mjs` (`reviewed`) and `docs/xroga/security/current-migration-additions.json`, and the validator requires the two lists to be in the same order, so merging both needs those two files combined by hand and the generated registers regenerated. Merge #861 first.

Not verified by any of this: a live Google runtime, real R2, real GitHub, Supabase or Vercel accounts, real model builds, Cloud Tasks and Scheduler.

## Full matrix across both batches

| Area | Batch | State | Evidence level |
|---|---|---|---|
| Drive API, storage, quota, reconciliation | 1.5 | Implemented and audited | TESTED, REAL-DEPENDENCY (PostgreSQL, S3 emulator); real R2 PENDING |
| Drive screen | 1.5 (new scope) | Built, flagged off | TESTED |
| Worker leases | 1.5 | Implemented | REAL-DEPENDENCY (PostgreSQL) |
| Browser capability, host, evidence | 1.5 | Implemented; durable across instances | TESTED, REAL-DEPENDENCY (Chromium); Google runtime PENDING |
| Startup policy and readiness wiring | 1.5 | Deliberately deferred to the cutover (patch saved) | TESTED as libraries |
| AI Product Builder projects, revisions, preview | 2 | Implemented | TESTED, REAL-DEPENDENCY (PostgreSQL store); sandbox preview PENDING |
| Browser QA and repair | 2 | Implemented; isolated host path built | TESTED, REAL-DEPENDENCY (Chromium); host deployment PENDING |
| Follow-up, history, restore, Stop, chat continuity | 2 | Implemented | TESTED |
| Export, GitHub, Supabase, Vercel delivery | 2 | Implemented against fakes and request-level contracts | TESTED; **PROVIDER NOT VERIFIED** |
| Composio platform expansion | separate PR #860 | Implemented, everything default off | TESTED; real Composio PENDING |

The twelve Batch 2 acceptance targets keep the statuses in `batch-2/FINAL-AUDIT.md` section 4, with targets 7 and 12 strengthened by the continuity and Stop work above.

## Final CI state

Filled in when the checks for the exact head commits finish; see the PR pages. A check that is red is recorded here with its cause, not described as passing.
