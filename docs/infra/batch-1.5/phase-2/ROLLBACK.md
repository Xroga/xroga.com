# Phase 2 rollback (INFRA-005/006)

Every Phase 2 change is additive or default-compatible. Nothing here has been deployed, applied to a hosted database, or merged to `main`;
this is the path back if any of it is later released and has to be undone. Ordered from least to most disruptive.

| Change | Effect when released | Roll back by | Data impact |
|---|---|---|---|
| `STORAGE_DB_SSL_CA` / verified database TLS (`storage/databaseTls.ts`) | Drive's pool refuses a database whose certificate it cannot verify | supply the right CA in `STORAGE_DB_SSL_CA`. There is deliberately **no** switch that turns verification off; rolling back to the unverified pool means redeploying the previous image | none |
| `backend/src/runtime/safeLogging.ts` (console and morgan redaction) | log lines are redacted; a redaction failure logs a fixed notice | redeploy the previous image. If a legitimate value is being over-redacted, the cause is a secret-named environment variable holding a non-secret of 12+ characters: rename the variable | none (logs only) |
| `backend/src/runtime/startupPolicy.ts` (boot duties gated) | schema-ensure DDL and orphaned-run reconcile run only in an environment positively identified as production or development | **Production Fly (`xroga-api`) needs no change**: it is recognised by `FLY_APP_NAME`. A host that must run the duties but is not recognised sets `XROGA_DEPLOYMENT_ENVIRONMENT=production` (refused if `FLY_APP_NAME` names a different app). Reverting the code restores the old, ungated boot | none |
| `/ready` behind `runtime/readiness.ts` | `/ready` also fails on an unclassified environment, an invalid or unverifiable storage configuration when Drive is on, and a custody requirement that is not met | if a platform health check starts failing, point it at `/health` (unchanged) while the cause is fixed; `/ready` reports a fixed reason code per failing check | none |
| `supabase/migrations/20261024000000_worker_task_leases.sql` | creates `worker_task_leases` and four functions | `docs/infra/batch-1.5/rollback/20261024000000_worker_task_leases.down.sql`, only with workers stopped (it forgets which worker held which task and restarts token sequences). Tested: re-apply is safe, rollback leaves nothing behind, both against real PostgreSQL 16. **Never auto-applied: merging this branch to `main` would apply it to production through `supabase-migrate.yml` (see `BOUNDARY-CHECK.md`, D5)** | coordination state only; no customer data |
| `backend/src/workers/*` (leases, job contract, proxy, handler, admission, recovery) | no production caller registers the browser handler or starts a worker | nothing to roll back until a caller exists; remove the registration | none |
| `deploy/browser-worker/*` (image, spec, seccomp, probe) | builds a separate image; not referenced by `Dockerfile.api`, `fly.api.toml` or any workflow | delete the image and the deployment that runs it. The trusted API image never contains Chromium | none |
| `.github/workflows/supabase-migrate.yml` (pull-request path split into an offline job) | a PR no longer connects to any database or touches an environment | revert the file. Doing so restores the unsafe dry run, so revert only together with giving `Preview` its own secrets (`BOUNDARY-CHECK.md`) | none |
| `network.mode = internal` in `deploy/browser-worker/container-spec.json` | the browser container runs on an `--internal` network with the proxy as its only peer | change the mode to `none` for runs that need no network. `bridge` is refused on purpose: rolling back to it removes the only barrier against a browser that ignores its proxy | none |
| `.github/workflows/storage-phase1.yml` (new branch trigger, Chromium step) | runs on pushes to the two Claude branches only; no secrets, no environment | revert the workflow edit | none |

## What cannot be rolled back by this document
Credential custody. The audit (`INFRA-004-credential-audit.md`) proposes a staged migration whose steps (sealing, closing the legacy window,
rotation, retiring legacy copies) are each separately approved and, after rotation, not reversible. **Rollback never returns a sealed record to the
plaintext reader.** Nothing in Phase 2 performed any step of it.

## Safe order if several things must be undone together
1. stop any worker and cancel in-flight browser tasks (the scheduler marks them cancelled; leases expire);
2. redeploy the previous API image;
3. only then, if the schema must go, run the `.down.sql`.
