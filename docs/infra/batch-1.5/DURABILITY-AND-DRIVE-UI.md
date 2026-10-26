# Browser run durability, Drive screen and Drive housekeeping (2026-10-27)

Branch `claude/batch15-audit-fixes` (draft PR #861). Nothing here is applied, deployed or enabled. No Google resource was created and Codex's migration branch was not touched: the Google parts are interfaces, signed endpoints and environment variables that the cutover release switches on.

Evidence labels: **TESTED** (automated, mocked or in-memory), **REAL-DEPENDENCY** (real PostgreSQL in the `storage-phase1` workflow), **PENDING** (needs the Google runtime, real R2 or an approved account).

## 1. Browser runs that survive the request (audit finding 8)

### What was wrong

1. The run executed as a detached promise inside the request that created it. On Cloud Run with request-based CPU the instance is throttled after the 202, and a scale-in kills the run.
2. Cancellation was an in-memory map: `DELETE` on another instance answered 404.
3. Admission limits were per process, so scaling out multiplied them.
4. `recoverRunWithLeases` existed but nothing called it.
5. Found while fixing this: `browserRuns.ts` built `SupabaseExecutionStateStore(userId)` without an admitted swarm attempt. Its `save` refuses without one (`persist_execution_checkpoint_attempt` is fenced to a `swarm_runs` row), so on a real deployment the first checkpoint failed and no run could persist. Every test injected an in-memory store, which is why nothing caught it.

### Design

| Piece | File | Role |
|---|---|---|
| Durable record | `supabase/migrations/20261026100000_browser_runs_durable.sql`, `workers/browserRunStore.ts` | `browser_runs`: validated spec, the same canonical state document, cancel flag, status. Service role only, RLS on, no public grants. Additive. Rollback: `rollback/20261026100000_browser_runs_durable.down.sql` |
| Prepare / execute | `workers/browserCapability.ts` | `prepareBrowserRun` validates and stores (nothing runs); `executeBrowserRun(runId)` runs a stored run on any instance. `runBrowserTask` remains for in-process callers |
| Dispatch port | `workers/browserRunDispatch.ts` | `InProcessDispatcher` (development, single always-allocated instance) or `CloudTasksDispatcher` (enqueues an OIDC-authenticated task that calls the execute endpoint; one task per run per 10 minute window, so re-dispatch is deduplicated) |
| Internal endpoints | `routes/browserRunInternal.ts`, mounted at `/internal/browser` | `POST /execute {runId}` (Cloud Tasks) and `POST /recover` (Cloud Scheduler). Each has its own service account and audience, so the scheduler identity cannot execute a run and the queue identity cannot trigger a sweep. Off unless `XROGA_BROWSER_INTERNAL_MODE=cloud` |
| Cancel | `routes/browserRuns.ts` | `DELETE` sets a durable flag (owner only, idempotent); the instance running the browser polls it every 2 s and aborts; a run that never started is finished as cancelled inline. A finished run answers 409 |
| Single executor | `executeBrowserRun` | an execution lease on the run (renewed while it runs) plus the existing task lease inside the handler. A second instance gets `held_by_live_worker`; a finished run gets `already_finished` |
| Recovery | `executeBrowserRun` + `/recover` | a run found `running` after its worker died resumes through `recoverRunWithLeases` (never while a live worker holds the task); the sweep re-dispatches runs untouched for 2 minutes |
| Admission | `prepareBrowserRun` | at most 4 queued or running runs per tenant, counted from the shared table (`429 RUN_LIMIT`). The per-process slot controller stays for host capacity |

A failed hand-off does not lose the run: the record stays `queued` and the recovery sweep dispatches it. The response is 202 either way.

### Evidence

- TESTED: `workers/browserRunDurability.test.ts` (accepted on one instance and executed on another; two instances at once run the browser once; a cancel on one instance stops the browser on another; cancel before start never launches a browser; owner-only; dead-worker recovery and no recovery while a live worker holds it; cross-instance ceiling; stale listing), `workers/browserRunDispatch.test.ts`, `routes/browserRunInternal.test.ts`, `routes/browserRuns.test.ts` (updated to the durable runtime).
- REAL-DEPENDENCY: `workers/browserRunStore.integration.test.ts` runs the migration and the store on real PostgreSQL in `storage-phase1` (the workflow's path list now includes the migration).
- PENDING: Cloud Tasks delivery, Cloud Scheduler and Cloud Run request handling on the real Google runtime. The Cloud Tasks request body is tested against a fake HTTP client, not against `cloudtasks.googleapis.com`.

### Activation (cutover release, after Codex's migration is verified)

1. Apply `20261026100000_browser_runs_durable.sql` (additive).
2. Create a Cloud Tasks queue and two service accounts (a task caller for `/internal/browser/execute`, a scheduler caller for `/internal/browser/recover`). Billable: not done here.
3. Set on the API: `XROGA_BROWSER_DISPATCH=cloud-tasks`, `XROGA_BROWSER_TASKS_PROJECT`, `_LOCATION`, `_QUEUE`, `XROGA_BROWSER_EXECUTE_URL`, `XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT`, `XROGA_BROWSER_EXECUTE_AUDIENCE`, `XROGA_BROWSER_RECOVER_SERVICE_ACCOUNT`, `XROGA_BROWSER_RECOVER_AUDIENCE`, `XROGA_BROWSER_INTERNAL_MODE=cloud`. A half-configured `cloud-tasks` setting makes browser runs answer 503 instead of silently executing in the request process.
4. Cloud Run: execute requests are long (up to the run's duration limit plus a minute). Use a request timeout of at least 15 minutes for the service or a dedicated service for `/internal/browser`.
5. Schedule `/internal/browser/recover` every minute or two.
6. Rollback: unset `XROGA_BROWSER_DISPATCH` (back to in-process) and `XROGA_BROWSER_INTERNAL_MODE`; drop the table only when no run is queued or running.

## 2. Xroga Drive screen (audit finding 9)

Classification: **new scope.** The three Batch 1.5 specifications require the Drive API, storage, quota and workers; none requires a Drive screen. It was built because the API alone leaves a customer unable to see, add or remove their own files.

- `/drive` (`frontend/src/app/(shell)/drive/page.tsx`), behind `NEXT_PUBLIC_XROGA_DRIVE=1` and the signed-in shell layout. Absent (404) when the flag is off.
- `lib/driveApi.ts` (client for exactly the seven backend routes), `lib/driveUpload.ts` (single and multipart upload: signed just before use, three parts at a time, per-part retry, cancel, a bucket that hides `ETag` is reported as a configuration problem), `components/drive/DrivePanel.tsx`.
- What it will not do: show a file as stored before the server verified it, hide a failed upload, delete without an inline confirmation, or send bytes through the API.
- TESTED: `lib/driveApiContract.test.ts` (every client call is a served route with the same method, every route is reachable, mounted behind auth, flag off by default), `lib/driveUpload.test.ts`.
- PENDING (real R2): the bucket must allow `PUT` from the app origin and expose the `ETag` header (CORS), or the browser cannot upload. Not configured here.
- Not built, by design: sharing links, folders, rename, preview. They are not in the Drive API.

## 3. Quota and housekeeping (audit finding 10 and 5)

- Default unchanged and documented: `STORAGE_QUOTA_BYTES` unset means tracked, not enforced. The number is a product decision for the activation.
- Closed: a set but malformed value (`10GB`, `-1`, `1e9`) used to be read as "no limit". It is now a configuration problem: startup and readiness refuse it and Drive stays unavailable until corrected.
- Visible: readiness reports `storage_quota_not_enforced` and `storage_reconcile_not_scheduled` (non-blocking) when Drive is on without them. Readiness is wired at the cutover (`bootGuard.test.ts`), so these appear then.
- Scheduling: `POST /internal/storage/reconcile` (already in this PR) is the Cloud Scheduler target; bounded, counts only, off unless `XROGA_STORAGE_RECONCILE_MODE=cloud`.
- Security: signed Google ID tokens per endpoint, no tenant or key in any response, no whole-bucket scan.
- Startup: the lazy service build retries after a transient failure instead of caching "unavailable".
- PENDING: running reconcile against the real database and R2 under Cloud Scheduler.

## 4. CI note

The `storage-phase1` workflow's full backend step (06) failed on pristine `main` too (run 40373053674): the whole suite needs more than the 15 minute step limit on a hosted runner, and ten credential-vault tests that need vault configuration fail there. The step now has its own 38 minute limit, the job 75 minutes, and those ten tests are recorded in `baseline-failures.json` with their source run. A completed run may reveal further members of the same family; they must be confirmed against `main` before being added.
