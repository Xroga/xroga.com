# Coordinated activation runbook: Batch 1.5 then Batch 2

Prepared in advance. **Nothing in this document has been run, and nothing may be run until (a) Codex has completed and verified the Fly.io to Google Cloud migration and (b) each release below is separately authorised.** No step deploys, applies SQL to a hosted database, creates a paid resource or touches a customer account by itself.

Related drafts: Batch 1.5 audit fixes #861; Batch 2 #857, #858, #859 and the audit overlay; Composio #860 (separate, optional, off by default); Codex migration #856 (not touched).

## 0. Preconditions (all must be true)

| # | Precondition | How to check |
|---|---|---|
| 0.1 | Google Cloud migration merged and verified live by Codex (Cloud Run API, Cloud Tasks, Cloud Run Jobs as designed, existing storage) | Codex's release gate and its verification evidence |
| 0.2 | The Google runtime provider for `ProjectRuntimeManager` is deployed (PR #856) | A project runtime session can be created, started, exec'd and snapshotted on the Google provider |
| 0.3 | `main` contains Batch 1.5 (#852) and every audit PR you chose to accept (#861, and the Batch 2 stack in order #857, #858, #859, audit overlay) | `git log`, CI green on each merge commit |
| 0.4 | Cloud Run sets `NODE_ENV=production` and `XROGA_DEPLOYMENT_ENVIRONMENT=production` (production) or `staging` (staging) explicitly; the service name does not contain staging, preview, sandbox, dev or test for production | `startupPolicy` classifies it (tested); the credential vault refuses a development provider only when `NODE_ENV` says production |
| 0.5 | The cutover wiring of the startup policy and readiness evaluator has been applied (`docs/infra/batch-1.5/cutover-startup-readiness.patch`, with `runtime/bootGuard.test.ts` updated in the same change) | `/ready` reports `environment`, `database` and `storage` checks |
| 0.6 | A decision on where browser QA runs (section 3.4) | recorded |
| 0.7 | Backups: a point-in-time recovery or a verified dump of the production database immediately before each migration step | Operator evidence |
| 0.8 | Disposable accounts for the live verification in section 4 (never a customer's) | A GitHub account, a Supabase organisation and a Vercel team created for testing, with spending limits |

## 1. Stage A: Batch 1.5

### A1. Migrations (apply to staging first, then production, one at a time, with a dump before each)

| Order | File | Depends on | Rollback |
|---|---|---|---|
| 1 | `supabase/migrations/20261022000000_storage_drive_foundation.sql` | `public.projects`, `public.project_files` | `docs/infra/batch-1.5/rollback/20261022000000_storage_drive_foundation.down.sql` |
| 2 | `supabase/migrations/20261024000000_worker_task_leases.sql` | none | `docs/infra/batch-1.5/rollback/20261024000000_worker_task_leases.down.sql` |

Both are additive and idempotent (`create ... if not exists`, `create or replace`, `drop ... if exists`). Apply through the verified migration workflow; `supabase-migrate.yml` on `main` only validates, so hosted application is an operator step. Verify afterwards: every public table has RLS; `anon` and `authenticated` have no grants on the lease table; the Drive state-transition trigger exists.

### A2. Configuration (secrets in the host secret store, never in chat)

| Capability | Variables | Safe default |
|---|---|---|
| Drive storage | `XROGA_DRIVE_R2_*` credentials and `XROGA_DRIVE_R2_BUCKET` (a dedicated private bucket), a storage database URL, `STORAGE_WRITE_MODE` (`legacy`, `dual`, `r2`), `STORAGE_READ_ORDER`, `STORAGE_QUOTA_BYTES` | Unset: legacy behaviour, Drive off. An invalid value fails closed. **Set a quota before enabling**: unset means tracked, not enforced |
| Scheduled Drive housekeeping (PR #861) | `XROGA_STORAGE_RECONCILE_MODE=cloud`, `XROGA_STORAGE_RECONCILE_AUDIENCE`, `XROGA_STORAGE_RECONCILE_SERVICE_ACCOUNT`, plus a Cloud Scheduler job POSTing to `/internal/storage/reconcile` with an ID token for that service account | Unset: route answers 503 |
| Guest rate limiting on Cloud Run | `XROGA_TRUSTED_PROXY_HOPS` only if more than one trusted proxy sits in front | 1 |
| Browser worker | `XROGA_BROWSER_WORKER_URL` (https), `XROGA_BROWSER_COORDINATOR_SECRET`, optionally `XROGA_BROWSER_AI_MODEL`, `XROGA_BROWSER_PLANNER_MODEL`; frontend `NEXT_PUBLIC_XROGA_BROWSER_RUNS=1` | Unset: the route answers 503 and the UI is hidden |
| Managed custody | `XROGA_REQUIRE_MANAGED_CUSTODY`, `XROGA_CREDENTIAL_KMS_PROVIDER` and that provider's variables | per Batch 1 |

### A3. Order of activation and smoke tests

1. Deploy the Google release with every Batch 1.5 switch at its safe default. Smoke: `/health`, `/ready` (database, environment, storage), a normal chat turn, a legacy file read. **Expected: identical behaviour to before.**
2. Enable Drive in `dual` for one staging tenant. Smoke: upload, download (checksum equal), another tenant is refused (403/404), quota refusal, project revocation takes effect, the object appears `READY`, nothing public.
3. Run the scheduled reconcile once by hand (Cloud Scheduler "force run"). Expect counts only; an abandoned test upload is cleaned.
4. Enable the browser worker for the staging tenant. Smoke: a simple run completes with Drive evidence and verified postconditions; **a request carrying a `writeGrant` is refused with 400**; a run is cancellable on any instance (see open item 8 in the Batch 1.5 audit: do not enable multi-instance browser runs until its architecture decision is made).
5. Promote to production tenant by tenant; flip `r2` only after `dual` has run clean and a migration job has its signed approvals.

**Rollback (any stage):** set the switch back to its safe default (`STORAGE_WRITE_MODE=legacy`, unset `XROGA_BROWSER_WORKER_URL`, unset `NEXT_PUBLIC_XROGA_BROWSER_RUNS`); routes become inert; no data is deleted. Only if a migration must be undone: the matching `.down.sql`, after a dump.

## 2. Stage B: Batch 2 (only after Stage A is stable)

### B1. Migrations (in order; all additive; dump first)

| Order | File | Adds |
|---|---|---|
| 1 | `20261026000000_builder_projects.sql` | `builder_projects`, `builder_revisions`, `append_builder_revision` |
| 2 | `20261026010000_builder_phase2.sql` | `builder_verifications`, `builder_external_operations` |
| 3 | `20261026020000_builder_phase3.sql` | widens operation provider and action checks (Supabase, Vercel) |
| 4 | `20261026030000_builder_preview_readiness.sql` | nullable `builder_projects.preview_readiness` |

Rollbacks: drop the tables of orders 2 and 1 (nothing else references them); for order 3 delete rows whose provider is not `github` and restore the narrower checks; for order 4 `ALTER TABLE public.builder_projects DROP COLUMN IF EXISTS preview_readiness`. All four are exercised on a real PostgreSQL in the `builder-phase1` workflow.

### B2. Flags and configuration (all off until you turn them on)

| Switch | Effect |
|---|---|
| Backend routes under `/api/builder/*` | Always mounted behind authentication; inert without a project |
| `UNIVERSAL_AGENT_ENABLED` (and `UNIVERSAL_AGENT_PERCENTAGE` or `UNIVERSAL_AGENT_ALLOWLIST`) | The canonical engine. Off means a Builder build is reported as **blocked** (`BUILDER_ENGINE_DISABLED`) and never falls back to the legacy generator. Enable for an allowlist of test projects first |
| `NEXT_PUBLIC_XROGA_BUILDER=1` (frontend) | Shows the Project tab and routes chat build requests into projects. Build and deploy the frontend with it only after the backend is ready |
| `XROGA_BUILDER_INPROCESS_QA=1` | Allows the in-process Chromium for QA in production. **Leave unset** unless QA runs on an isolated deployment for that purpose; unset means QA reports "not run" in production |
| Sandbox provider variables | As defined by the Google runtime release (PR #856) |

### B3. Activation order and smoke tests (staging, one tenant, then production allowlist)

1. Migrations applied and verified; routes up; flags off. Smoke: `GET /api/builder/projects` returns an empty list for an authenticated user and 401 without identity.
2. Engine on for the test tenant. Smoke: create a project from a plain request; the build produces a saved revision; the project is **PARTIAL** until a browser test passes.
3. Preview on the Google runtime. Smoke: "Start preview from latest version" returns ready; the preview opens through the signed gateway; a foreign tenant cannot open it; an expired link is refused; stop and restart work.
4. Browser QA (decision 0.6). Smoke: tests execute against the running app; a seeded defect fails with a screenshot; the project becomes VERIFIED only after a pass.
5. Repair: break a page deliberately; "Test and fix automatically" repairs within 3 attempts, re-tests, and records the revision it fixed. Budget exhaustion stops it.
6. Follow-up and history: "add a search filter" changes the **same** project; history shows both revisions; restore creates a new revision and re-tests it.
7. Export: ZIP downloads, checksums match its manifest, contains no `.env` and (for a database app) the migration.
8. Delivery with disposable accounts (section 4). Nothing external happens without prepare, approve and execute.
9. Production regression: the whole existing suite, plus the golden journeys.

**Rollback:** unset `NEXT_PUBLIC_XROGA_BUILDER`; set `UNIVERSAL_AGENT_ENABLED` back; routes are inert without a project. Projects, revisions and receipts stay (they are the customer's records). Nothing in a customer's GitHub, Supabase or Vercel is ever deleted by Xroga: a mistaken external change is reverted by its owner in that provider.

## 3. Cross-batch rules to hold during activation

1. **Storage:** the Builder stores source in Postgres (transactional revisions), not Drive. Drive and the Builder do not share objects; a project deleted in Drive does not delete builder revisions and the reverse is true.
2. **Browser:** Batch 1.5's browser worker is a remote, authorised host with Drive evidence. Builder QA drives generated pages and must not run in the customer-facing API container in production. Choose one: (a) run QA on a dedicated isolated deployment with `XROGA_BUILDER_INPROCESS_QA=1`, or (b) extend QA to use the browser host (not built). Until then production QA is "not run".
3. **Budget:** repairs go through the existing provider budget reservation; nothing else in Batch 2 spends Xroga money. Delivery costs (Vercel builds, Supabase) are the customer's and are stated in each approval plan.
4. **Tenancy:** every Builder route resolves the project against the verified owner; the new tables are owner-`SELECT` only for the browser role and written only by the server with an explicit owner predicate.
5. **Order:** Batch 1.5 must be live and stable first; Batch 2 does not depend on Drive, but its isolation and preview depend on the Google runtime.

## 4. Live verification procedure (disposable accounts only; every step is an explicit approval in the product)

Record the date, commit, account ids and results in `docs/infra/batch-2/LIVE-VERIFICATION-<date>.md`. Mark each item PROVIDER VERIFIED only after it passes here.

| # | Provider | Procedure | Pass criteria | Cleanup (by the account owner, never by Xroga) |
|---|---|---|---|---|
| L1 | GitHub | Connect the test GitHub account. Open Export. Choose the personal owner, name `xroga-live-test`, private. Review, approve. Then add a new version and sync | Repository exists, private, in that owner; commit tree equals the revision (the receipt's file count matches); a second Sync adds a fast-forward commit; editing the remote then syncing stops with "the repository changed" and overwrites nothing; an organisation owner appears only if the connection can list it (`read:org`) | Delete the repository |
| L2 | GitHub negative | Revoke the token at GitHub, retry | The operation fails with a reconnect message; the repository link stays visible | none |
| L3 | Supabase | Connect the test Supabase organisation; open Deliver. Select a **new empty** project. Review the binding, then the schema SQL, approve each | The project shows only the public URL and publishable key; the tables exist with RLS on; `anon` has no access; two real auth users cannot read each other's rows (use the project's SQL editor with `set role`); the service-role key never appears in Xroga's responses, logs or the exported repo | Pause or delete the project |
| L4 | Supabase negative | Select a project that already has a `tasks` table | The migration is refused and nothing is changed | none |
| L5 | Vercel | Connect the test Vercel team. Review the preview plan (project name, scope), approve | A **new, un-linked** project and a **Preview** deployment of exactly the saved version (meta carries the revision hash); not production; remote tests run read-only; if Deployment Protection answers, the result is "blocked", not passed | Delete the project |
| L6 | Vercel retry | Force a build failure (a bad import), fix it as a new version, then "Review a preview of version N" | The same project is reused; no second project is created | as L5 |
| L7 | Vercel production | With remote tests passed and the database schema applied, review the release, type `publish <name>`, approve, execute | The promoted deployment is the tested one; the read-only check at the production address responds; releasing with the digest alone (API call) is refused; an unapplied schema blocks it | Remove the production alias or project |
| L8 | Full journey on the Google runtime | One plain-language request end to end (section 2.B3 steps 2 to 8) | All twelve acceptance targets observed, each with its evidence link | Delete the test project |

## 5. Production acceptance checklist (sign-off, one line each)

- [ ] Migrations applied in order, with a verified dump before each; RLS verified on every new table; rollback statements rehearsed on a disposable copy.
- [ ] Codex's Google release live and verified; the startup/readiness wiring applied; `/ready` reports environment, database and storage.
- [ ] Batch 1.5 smoke tests passed (A3 steps 1 to 5); quota set; the scheduled reconcile ran once.
- [ ] The canonical engine enabled for an allowlist only; Builder UI flag on for the same allowlist.
- [ ] Preview, QA (with the chosen isolated host), repair, follow-up, restore and export smoke tests passed.
- [ ] L1 to L8 passed on disposable accounts and recorded.
- [ ] No credential appears in any log, response, stored plan or receipt (grep the staging logs for the test tokens).
- [ ] The full backend, frontend and golden suites green on the exact release commit.
- [ ] Budget view shows repair spend only inside the entitlement; no unexpected external charges.
- [ ] Rollback rehearsed: flag off, projects intact, no provider resource deleted by Xroga.
