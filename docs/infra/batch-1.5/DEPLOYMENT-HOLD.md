# Deployment hold for the Google Cloud migration (set by the Batch 1.5 integration, PR #852)

Xroga is moving from Fly.io to Google Cloud. Codex owns that migration. The running Fly service is preserved until Codex verifies its Google replacement.
Merging Batch 1.5 into `main` must not deploy anything, run SQL, create infrastructure or switch traffic. This file records every trigger that a push to
`main` could fire, what was done about it, and how to lift it.

## Triggers on a push to `main`
| Trigger | Before this change | After | Notes |
|---|---|---|---|
| `fly-deploy.yml` (deploys `xroga-api` to Fly) | pushes touching `backend/**`, `Dockerfile.api`, `fly.api.toml`, `package*.json` | **held**: no push trigger. Manual dispatch only, and the job runs only if the typed input is `RELEASE_TO_FLY` | Intended for a deliberate recovery or rollback release. Validation is separate and unchanged. |
| `fly-sandbox-browser-verification.yml` (creates disposable Fly Machines) | pushes touching `backend/src/synthesis/**`, `backend/src/sandbox/**`, `fly.api.toml` | **held**: no push trigger. Manual dispatch only, and the job runs only if the input is `CREATE_FLY_MACHINE` | Creating Fly Machines is a new Fly resource. |
| `supabase-migrate.yml` | validation only on `main` (from `main`'s own change) | unchanged | Merging cannot apply SQL. The two Batch 1.5 migrations (`20261022000000_storage_drive_foundation.sql`, `20261024000000_worker_task_leases.sql`) are applied only by a separately approved operation. |
| Cloud Build automatic trigger | disabled by Codex outside the repository (their migration record) | unchanged | Not controllable from this repository. |
| Vercel Git integration (frontend) | deploys `main` automatically | unchanged; it is not controllable from the repository | The Browser Studio run panel is hidden unless `NEXT_PUBLIC_XROGA_BROWSER_RUNS=1`, so the new UI is not exposed. |
| `api-build-check`, `unit-tests`, `vercel-build-check`, `growth-technical-publishing`, `command4-authority`, `agent-v2-dependency-lock` | validation or build only | unchanged | Required checks stay enabled. None deploys or holds secrets for deployment. |

## What stays inactive after the merge
- `/api/browser/runs` answers 503 until `XROGA_BROWSER_WORKER_URL` and the coordinator secret are configured. No browser host exists.
- Drive writes stay off until the storage switches are set.
- No Batch 1.5 SQL is applied.

## Lifting or replacing the hold
Replace `fly-deploy.yml` through Codex's reviewed, source-bound Google release gate (their migration step 3). Do not re-add the Fly push trigger. The browser
panel flag, the browser host and the Batch 1.5 migrations each need their own approved cutover step (`phase-3/MIGRATION-ROLLBACK-EXIT.md`).
