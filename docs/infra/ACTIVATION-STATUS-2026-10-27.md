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
