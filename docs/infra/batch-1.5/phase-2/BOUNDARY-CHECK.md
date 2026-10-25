# CI and migration boundary check (2026-10-24)

The Phase 1 handoff warned that `supabase-migrate.yml`'s `Preview` environment "may have production-capable secrets". This is the
check. Evidence class: **source read + GitHub API read** (no workflow was triggered, nothing was changed).

## What a pull request or a merge would do
| Event | Workflow | Environment | What runs | Reaches |
|---|---|---|---|---|
| PR to `main` touching `supabase/migrations/**` (same-repo PR) | `supabase-migrate.yml` | `Preview` | `node scripts/apply-supabase-migrations.mjs --dry-run` with the repository's Supabase secrets | **the production database** (see below) |
| push / merge to `main` touching those paths | `supabase-migrate.yml` | `Production` | applies every unrecorded migration, then `verify-community-rls.mjs` | production database, automatically |
| push / merge to `main` touching backend paths | `fly-deploy.yml` | `Production` | deploys Fly `xroga-api` | production API, automatically |
| push to `claude/xroga-batch-1-5` | `storage-phase1.yml` only | none | the strict test runner against a CI Postgres | nothing external |

## Findings
1. **`Preview` and `Production` have no secrets of their own.** The API shows neither environment has environment-level secrets, no
   required reviewers, and no branch policy. Every secret is repository-level: `DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `FLY_API_TOKEN`,
   `XROGA_SANDBOX_FLY_TOKEN` and others. So a PR's `Preview` job receives the **same production credentials** as the `Production` job.
   (Names only; no value was read. A fourth environment, `xroga-phase3-oci-custody`, has one protection rule and custom branch policies.)
2. **The PR "dry run" is nearly, not strictly, read-only.** `scripts/apply-supabase-migrations.mjs` never runs migration SQL in dry-run
   (lines 195-199), but it connects to the live database and **executes** `CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE
   IF NOT EXISTS supabase_migrations.schema_migrations` (lines 145-152), and its reconcile branch can `INSERT ... ON CONFLICT DO NOTHING`
   a tracking row before the dry-run check (lines 161-170, 175-181). Both are no-ops against production today: the table exists and
   `022_phase1_token_usage` is recorded.
3. **The migration runner does not verify the database certificate** (`scripts/lib/pg-connect.mjs:18`, `rejectUnauthorized:false`), the same
   pattern as `backend/src/lib/postgresConnect.ts:79` and `integrations/supabaseProvision.ts:311`. This phase fixed the Drive pool only (see `INFRA-005-database-tls.md`);
   these three remain, and changing them touches live production connections, so I left them.
4. **This branch cannot be PR'd safely as it stands.** Its diff against `main` contains `supabase/migrations/20261022000000_storage_drive_foundation.sql`,
   so a PR would run the dry-run against production credentials, and merging would **apply that migration to production**. Production's
   history (82 records, latest `20261022135500_sidebar_owner_rls`) does not contain it; its name collides with nothing on `main` or Codex's branch.

## Recommended fixes (need repository-settings access; I have not made any)
- Give `Preview` its own secrets pointing at a disposable Supabase project, and remove production credentials from the repository level
  (or scope them to `Production` only).
- Add required reviewers on `Production`, so a merge cannot apply migrations or deploy Fly without a named approval.
- Make the migration gate's connection verify the certificate, using the same planner as the Drive pool.

## Resolved in this branch (2026-10-24, later)
Findings 1 and 2 are closed for pull requests by `supabase-migrate.yml`: the PR path is now a separate job with **no environment, no secret reference and a read-only token**, running `scripts/check-supabase-migrations.mjs` (offline; never reads the environment; no network or database client in its source, asserted by a test). The live runner and the Production environment remain on the push-to-`main` job only. `main` has no branch protection and no rulesets, so no required check depends on the old job name. Findings 3 and 4 stand: the unverified database connections are production paths left untouched, and merging this branch still applies its migrations to production through the push job. One PR-triggered workflow still uses secrets: `command3-auth-browser.yml` (`E2E_SUPABASE_*`), unconfirmed.

## Not done
No PR was opened. No workflow was dispatched. The `Preview`/`Production` secret *values* were not and cannot be read; "production-capable"
is inferred from the secrets being repository-level and from the names, not from reading them.
