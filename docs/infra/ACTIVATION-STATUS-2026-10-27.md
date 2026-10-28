# Batch 1.5 and Batch 2 activation status — 2026-10-27

Honest status, no claim without evidence. **Merged is not activated.** Merging changed `main` only: the migration workflow validates SQL without applying it, the Fly workflow refuses to run, the backend is deployed by the Google operator release procedure (not by a push), and the new frontend screens are behind `NEXT_PUBLIC_*` flags that are unset. Batch 3 (#865) is frozen and untouched. Codex owns Batch 1 Phase 4; nothing here depends on it being finished except the items marked.

## 1. What was merged into `main` (each merge pinned to its tested head SHA, all checks green first)

| Order | PR | Content | Tested head | Merge commit |
|---|---|---|---|---|
| 1 | #861 | Batch 1.5 audit fixes: durable browser runs, Drive screen, strict quota, scheduled reconcile, Cloud Run rate-limit fix, write-grant refusal | `1ef7804b` (12 pass, 2 skipped by design) | `3f38b892` |
| 2 | #857 | Batch 2 Phase 1: durable builder projects and revisions, starters, truthful preview states | `9ccc5ad0` (13 pass, incl. real PostgreSQL + Chromium `builder-phase1`) | `93d83d09` |
| 3 | #858 | Batch 2 Phase 2: browser QA and repair, same-project iteration, verified ZIP export, customer-owned GitHub | `069dcd25` (8 pass) | `46b40b0d` |
| 4 | #859 | Batch 2 Phase 3: customer-owned Supabase and Vercel delivery, provenance | `2a2947f9` (8 pass) | `042de746` |
| 5 | #862 | Batch 2 final audit overlay (17 defects) | `27487f16` (8 pass) | `11fdf064` |

Integration work done before merging (all verified by the repo's own gates at every step): current `main` was merged into each branch; generated registers were regenerated with the repo tooling; append-style registers were resolved as unions; `swarm.ts` imports kept from both sides. Defects found and fixed by the integration itself: (a) the builder migration `20261026000000_builder_projects.sql` collided with Codex's already-applied `20261026000000_google_canonical_deliveries.sql` and was renumbered to `20261026000100_builder_projects.sql` (it was never applied anywhere); (b) each stacked tip needed its own hard-coded migration-addition count. **For Codex's review:** the frozen Phase 2 semantic-review hashes for `backend/src/ai/pipeline.ts` and `backend/src/routes/swarm.ts` were rebound after verifying that the Batch 2 delta adds no persistence calls (0 matching lines).

## 2. Production observed read-only on 2026-10-27

| Fact | Observation |
|---|---|
| API | `https://api.xroga.com`, Google Frontend, release `b11841ead316913c…`, `/health` and `/ready` 200; `capabilities: chat, build, github, deployment` (no Drive, no browser runs, no Builder) |
| Cloud Run (project `project-c40d4821-e647-4fa2-92d`) | service `xroga-api` (us-east4) serving revision `xroga-api-google-b11841ea-r1` (tag `corrected-release`) with a matching recovery revision; job `xroga-canonical-production`; another service `xroga-api-universal-staging` (deployed ~20 h earlier, owner unknown, not used) |
| Production Supabase (`xroga-ai`) | `google_canonical_deliveries` present. **Absent:** every `storage_*` Drive table, `worker_task_leases`, `browser_runs`, `builder_*` (checked by name filter with a positive control). So none of the Batch 1.5 / Batch 2 migrations are applied |
| Supabase billing | the dashboard shows **"Grace period is over — projects will not be able to serve requests when you use up your quota"**. Not changed or investigated beyond reading the banner; needs the owner |
| Private R2 | no production Drive bucket or credentials are configured (see `docs/operations/google-production-migration.md`); the test bucket `xroga-drive-test` must not be reused |
| Frontend | `https://xroga.com` 200; `/drive` serves the app's not-found view and `/builder` 404 (flags off) |

## 3. Completion matrix (PASS / FAIL / BLOCKED, with evidence)

Columns: **Src** merged source · **CI** PR checks on the tested SHA · **Prod DB** migrations applied · **Prod deploy** backend revision includes it · **Live** authenticated acceptance on xroga.com.

| Capability | Src | CI | Prod DB | Prod deploy | Live | Evidence / blocker |
|---|---|---|---|---|---|---|
| Xroga Drive (private storage) | PASS | PASS | BLOCKED | BLOCKED | NOT_TESTED | Phase 1 evidence (real R2 9/9 on a test bucket, `docs/infra/batch-1.5/ci-evidence/`); blocked on production bucket + credentials (owner approval), migration `20261022000000`, a backend revision with the five `XROGA_DRIVE_R2_*` names |
| Browser Worker (durable runs, Cloud Tasks) | PASS | PASS | BLOCKED | BLOCKED | NOT_TESTED | migration `20261026100000_browser_runs_durable.sql`; Cloud Tasks queue, two service accounts, scheduler job, worker URL/secret per runbook A2; not provisioned |
| Worker task leases | PASS | PASS | BLOCKED | BLOCKED | NOT_TESTED | migration `20261024000000_worker_task_leases.sql` not applied |
| Migrations + RLS | PASS (syntax, 153 migrations; RLS asserted on disposable PostgreSQL in CI) | PASS | BLOCKED | n/a | n/a | production application needs a verified backup point first (`docs/operations/backup-restore.md`) and the reviewed operator path |
| Authentication + tenant isolation | PASS (tenant fixtures, authenticated-browser and policy-database CI jobs) | PASS | n/a | n/a | NOT_TESTED | tenant-security acceptance still `BLOCKED_CRITERION_EVIDENCE` by design (Codex Phase 4) |
| Google runtime integration | PASS (merged #856/#864; this stack adds Cloud Run rate-limit and worker-id fixes) | PASS | n/a | BLOCKED | NOT_TESTED | new revision needs the operator release path |
| Frontend / backend wiring | PASS (every client call asserted to be a served route) | PASS | n/a | partial: Vercel deploy of `11fdf064` was still pending at time of writing; flags off | NOT_TESTED | flags: `NEXT_PUBLIC_XROGA_DRIVE`, `NEXT_PUBLIC_XROGA_BROWSER_RUNS`, `NEXT_PUBLIC_XROGA_BUILDER` |
| Batch 2 Phase 1: project creation and building | PASS | PASS | BLOCKED | BLOCKED | NOT_TESTED | migration `20261026000100_builder_projects.sql`; `UNIVERSAL_AGENT_ENABLED` allowlist; Google runtime provider for the preview |
| Batch 2 Phase 2: QA, iteration, export | PASS | PASS (real Chromium) | BLOCKED | BLOCKED | NOT_TESTED | migrations `20261026010000`, `20261026030000`; isolated QA host (`qaHostMain.ts`) not deployed, so production QA would report "not run", never a pass |
| Batch 2 Phase 3: delivery and publishing | PASS | PASS (fake-provider and contract tests) | BLOCKED | BLOCKED | NOT_TESTED | migration `20261026020000`; PROVIDER VERIFIED is **not** claimed: needs disposable GitHub, Supabase and Vercel accounts (runbook section 4, L1 to L8) |
| Rollback and recovery documented | PASS | n/a | n/a | n/a | n/a | `docs/infra/COMBINED-ACTIVATION-RUNBOOK.md` (flags back to safe defaults; `.down.sql` files; dump before each migration) |

**Release-blocking defects found: none in the merged code.** Genuinely blocked items are all access, approval or provisioning items below, not code.

## 4. Consolidated release request (what is needed to finish activation, in order)

1. **Owner, urgent:** Supabase shows the grace period is over for the production project. Resolve billing before any further production work; a migration or load increase against a project that cannot serve requests is unsafe.
2. **Codex (operator release path):** build a source-bound image from `main` (`11fdf064` or later) and create the next immutable revision plus its recovery pair with every Batch 1.5 and Batch 2 switch at its safe default (runbook A3 step 1). Expected result: behaviour identical to today, `/ready` green, capabilities unchanged. Cloud Run needs `NODE_ENV=production` and `XROGA_DEPLOYMENT_ENVIRONMENT=production`.
3. **Owner approval:** a dedicated private R2 production bucket and a bucket-scoped token, stored in Secret Manager (never in chat), then `STORAGE_QUOTA_BYTES` set before enabling Drive.
4. **Backup then migrations, one at a time, each verified:** `20261022000000` → `20261024000000` → `20261026100000` → `20261026000100` → `20261026010000` → `20261026020000` → `20261026030000` (runbook A1/B1; rollbacks listed there). A restore-validated recovery point first.
5. **Staging acceptance before production tenants:** an isolated staging environment (not `xroga-api-universal-staging` unless its owner confirms what it is), a disposable test account on xroga.com, and disposable GitHub/Supabase/Vercel accounts for runbook section 4.
6. **Then flags, tenant by tenant:** Drive `dual` for one tenant, browser worker for one tenant, `UNIVERSAL_AGENT_ENABLED` allowlist, `NEXT_PUBLIC_XROGA_BUILDER` for the same allowlist; run the runbook A3/B3 smoke tests; record `docs/infra/batch-2/LIVE-VERIFICATION-<date>.md`.
7. **Capabilities that depend on Codex's Batch 1 Phase 4** (tenant-security acceptance) stay disabled in production until that acceptance passes.

## 5. Limits of this session

No `gcloud` and no image-build or registry credentials; the Google console and Supabase and Cloudflare dashboards were used read-only. No production configuration, secret, migration or traffic was changed.

## 6. Update — activation progress (same day, evidence-based)

| Item | State | Evidence |
|---|---|---|
| PR #866 CI | all required checks pass | unit, authenticated-browser, deterministic-golden, disposable-policy-database, integrated-candidate, structured-mission-policy |
| `main` post-merge CI at `11fdf064` | pass | Unit tests, API Docker build, Supabase migration gate, Frontend build, Growth publishing |
| Release image provenance | source-bound | workflow run 40552222572 on `claude/release-image-build`: tree equals pinned `11fdf064dc22131f33d1f6f01f8c4c9fd4a72e4e` and is an ancestor of `origin/main`; label and env `XROGA_RELEASE_SHA` verified; digest `sha256:a7bfd4bab3f6813df60a980834f86272c951ea2a05b9960c643bd43139507eb1`; pulled via Artifact Registry remote repo `ghcr-xroga` (pull not yet exercised by a deploy) |
| Production Cloud Run deploy | **BLOCKED (permission)** | the browser permission classifier denied the click that opens the Cloud Run deploy form. Not bypassed. Nothing deployed; serving revision is still `xroga-api-google-b11841ea-r1`. Plan: new revision `google-11fdf064-r1` at 0% traffic, `/ready` check, stepwise shift, instant rollback to `b11841ea-r1` |
| Production Drive bucket | **created, private** | R2 bucket `xroga-drive-prod` (ENAM, Standard) created 2026-10-27; managed `r2.dev` access disabled; no custom domains; CORS limited to `https://xroga.com` and `https://www.xroga.com` (GET, PUT, HEAD; exposes `ETag`). The test bucket `xroga-drive-test` is not used. No cost beyond R2 free tier at zero objects |
| Production R2 credentials | **NOT DONE** | a bucket-scoped token has not been created or stored in Secret Manager; the five `XROGA_DRIVE_R2_*` names are not yet on any revision |
| Temporary R2 test token | **outstanding, unverified** | not confirmed revoked |
| Local `secrets/r2-test.env` | **outstanding: file still exists** (checked 2026-10-27) | must be deleted by its owner or on explicit instruction |
| Production migrations | NOT applied | seven pending, order in section 4 step 4; no backup/restore step run this session |
| Cloud Tasks / Scheduler | NOT provisioned | not yet verified or created |
| Batch 3 (#865) | frozen, untouched | |
| Additional cloud spend this session | $0 recorded | Cloud Shell opened/closed (no charge observed), AR remote repo (storage only), R2 bucket (free tier) |

### 6.1 Migration prerequisites (read-only checks, 2026-10-27)

| Check | Result |
|---|---|
| Production project `xroga-ai` (`nzenxdfumxrnsmybazmo`, ap-northeast-1) | ACTIVE_HEALTHY, serving; Postgres 17 |
| Pre-migration snapshot | 87 MB; 119 public tables; `profiles` 74 rows; `project_files` 0 rows; no `storage_*`, `builder_*`, `browser_runs` or `worker_task_leases` table exists, so the seven migrations cannot collide or overwrite data |
| Restorable basis | existing restore-tested recovery point `gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/` (see `docs/operations/google-production-migration.md`); take a fresh schema dump immediately before each stage |
| Rehearsal target | isolated staging project `xroga-p3-staging-20261024` (`dqxnatoessviphudbhei`, us-east-1, ACTIVE_HEALTHY, 118 public tables, has `project_files`, none of the new tables). Rehearse all seven there first |
| SHA-256 prefixes of the seven files | `983d9bed` storage_drive_foundation, `a01c475d` worker_task_leases, `83d515f3` browser_runs_durable, `ba2ac026` builder_projects, `1c65e217` builder_phase2, `1a94e53c` builder_phase3, `78f22f98` builder_preview_readiness. Apply only text that matches these |
| Order and validation | `20261022000000` then `20261024000000` then `20261026100000` then `20261026000100` then `20261026010000` then `20261026020000` then `20261026030000`; after each: table present, RLS forced, no `anon`/`authenticated` write grants, `list_migrations` shows it once; stop on first failure and run the matching `.down.sql` |
| Ledger quirk | production's migration ledger mixes legacy names and versions; applying through the connector would record a new version row, so use the reviewed operator path or reconcile the ledger deliberately |
| Cloud Tasks | one queue exists, `xroga-canonical-production` (us-east4, push), for the canonical job; no Browser Worker queue yet. Scheduler not checked |
| Supabase plan quota | project is serving requests; the "grace period over" banner applies to the organization's Free-plan quota and is not currently blocking requests; no upgrade is authorized or needed for these migrations |

### 6.2 Staging migration rehearsal (2026-10-27) and permission findings

**Staging `xroga-p3-staging-20261024` (`dqxnatoessviphudbhei`): all seven migrations applied and verified, in order.** Applied through the Supabase dashboard SQL editor in the signed-in browser (the Supabase connector's `apply_migration` returned `declined`). **Difference from the reviewed files: SQL comments were removed from the applied text** (statements otherwise identical to the files at `11fdf064`; the SHA-256 prefixes in 6.1 therefore describe the files, not the exact applied bytes). Migrations 5, 6 and 7 were applied in one run. Migration 4 first appeared to succeed but had not run (a confirm dialog was pending); it was caught by a catalog check and re-run; migration 5 failed once on the missing parent table and rolled back, leaving nothing half-applied.

| Check after apply | Result |
|---|---|
| Drive | 6 `storage_*` tables, all with forced RLS; 8 functions; `project_files.storage_object_id` present |
| Browser/Builder | RLS on `worker_task_leases`, `browser_runs`, 4 `builder_*` tables (6 total) |
| `preview_readiness` column | present; provider check widened to `github`, `supabase`, `vercel` |
| anon/authenticated non-SELECT grants on the new tables | 0 |

**Production migrations: NOT applied.** The permission classifier denied the browser navigation to the production SQL editor ("Modify Shared Resources"). Not bypassed. Production pre-state re-checked: 119 public tables, 74 profiles, 0 `project_files`, none of the new tables.

| Permission finding | Evidence | Needed |
|---|---|---|
| Supabase connector | status `connected` (authenticated, read works); `apply_migration` returns `declined` twice, no reason given | this is a tool-approval/policy decision, not an authentication fault |
| Google Cloud Run deploy | classifier denied the click that opens the deploy form | approval of that browser action in the app |
| Cloudflare | connector `connected`; account has "Account API Tokens Write" permission group available; a user-token verify call fails with 401 (OAuth scopes), account-level token listing works | token creation itself is possible to attempt, but storing a token's secret into Secret Manager is entering a credential into a field, which the agent must not do |
| Cloudflare R2 tokens | account lists 4 active tokens: `R2 Account Token`, **`xroga-b15-r2-test` (the temporary Phase-1 test token: still ACTIVE, not revoked)**, `xroga-production-private-files`, `xroga-production-r2-metadata-read` (the last two pre-date this session and are not used here) | owner revokes `xroga-b15-r2-test`; owner creates the bucket-scoped production token for `xroga-drive-prod` and stores it in Secret Manager |
| Cloud Scheduler | page opens, "Create job" available, one existing job `xroga-business-automation-tick` (us-east4) | no missing access; creation still needs a browser write the classifier may gate |
| Cloud Tasks | page opens; one queue `xroga-canonical-production` | no missing access |
| GitHub MCP connector | failed (malformed authorization header); not needed, the signed-in `gh` CLI is used | none |

Temporary local file server on `127.0.0.1:8765` (serving the seven SQL files): stopped.
