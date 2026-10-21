# INFRA-001 · Current state (source-verified baseline)

Baseline: `origin/main` = `80d1f417338b4c5b95a07fc956604a1652cef7c7` (2026-10-21). Branch `claude/xroga-batch-1-5`.
Method: bounded source inspection of this repository only. **No live cloud was inspected** (see "What was not inspected").
Every row cites the file that proves it. Nothing here is inferred from memory of how the product "should" work.

## 1. Repository and build

| Fact | Evidence |
|---|---|
| npm-workspaces monorepo: `frontend` (Next.js), `backend` (Express, ESM, `tsx`) | `package.json` |
| Backend tests: `npm test --workspace=backend` = `capabilities:check` + `tsx --test "src/**/*.test.ts"` | `backend/package.json` |
| Backend build: `tsc` (`rootDir ./src`) | `backend/tsconfig.json` |
| API entrypoint, port 8080, routes mounted behind `authMiddleware` | `backend/src/index.ts` |
| Auth: bearer JWT → `resolveIdentity` → `req.userId`; user rows provisioned on demand | `backend/src/middleware/auth.ts` |
| **No tenant concept in `main`**: identity is a user id. `TenantContext` is Batch 1 work (not in `main`) | grep `tenant` finds no auth/tenant module; recorded as `WAITING_FOR_BATCH1_ACCEPTED_INTERFACE` |

## 2. Hosting and deployment (from config, not from the live accounts)

| Component | Where it runs today | Evidence |
|---|---|---|
| Frontend | Vercel (project `xrogaai.com`) | `vercel.json`, `.github/workflows/vercel-build-check.yml`, Vercel MCP deployment list (read-only, earlier in this engagement) |
| API | Fly.io app `xroga-api`, region `iad`, 1 machine min, `auto_stop_machines=false`, soft/hard concurrency 50/100 | `fly.api.toml` |
| Untrusted-code sandbox | Fly app `xroga-sandbox` (separate app; self-targeting refused) | `fly.api.toml` env, `backend/src/sandbox/flyMachineSandbox.ts` |
| Database/Auth | Supabase Postgres (`nzenxdfumxrnsmybazmo` per default in `postgresConnect.ts`) | `backend/src/lib/postgresConnect.ts`, `supabase/` |
| Queue/cache | BullMQ + Redis through `REDIS_URL`; **Redis host/provider not visible in the repo** | `backend/src/config/redis.ts`, `jobQueues.ts` → `UNKNOWN` |
| Billing | Whop | `fly.api.toml` `WHOP_*`, `docs/WHOP_SETUP.md` |
| Object storage (legacy) | Cloudflare R2 bucket `xroga-assets` (default name), served by a **public** URL | `backend/src/lib/r2.ts` |
| Mounts / volumes | **None declared** for the API (`fly.api.toml`, `backend/fly.toml` contain no `[mounts]`) | grep `mount|volume` = no match |

## 3. CI/CD and what a push can trigger (required safety check)

| Workflow | Triggers | Production effect | Safe for a `claude/*` feature-branch push? |
|---|---|---|---|
| `fly-deploy.yml` | push to **main** (backend paths), manual | deploys `xroga-api` | **Yes**: not triggered by other branches |
| `supabase-migrate.yml` | push to **main**, **pull_request** → main | applies migrations only when `github.ref == main && event != pull_request`; PRs run in the `Preview` environment | **Yes** for a plain push. Opening a PR starts the Preview job: see note |
| `fly-sandbox-browser-verification.yml` | main + one named branch | live sandbox run | Yes |
| `api-build-check`, `vercel-build-check`, `unit-tests`, `growth-technical-publishing`, `command4-authority` | PR / main push | build and test only | Yes |
| `backend-health-verification`, `launch-production-verification`, `community-security`, `seo-audit` | manual / schedule | read-only probes | Yes |

Result: **pushing `claude/xroga-batch-1-5` triggers no workflow at all** (none lists it). **Opening a PR to `main` would run `supabase-migrate` in the Preview environment** against `supabase/migrations/**` (this branch adds one migration). That job must be reviewed before any PR is opened. No PR has been opened.

## 4. Existing storage implementations (reachable paths)

Trace format: ENTRYPOINT → AUTHENTICATED OWNER → ADAPTER → DURABLE BACKEND → METADATA → ACCESS CONTROL → RESULT

| # | Path | Trace | Reachable? | Finding |
|---|---|---|---|---|
| W1 | Legacy build-file persistence | `upsertBuildProject` / `storeProjectFile(userId, projectId, …)` (`services/memory/buildProjectStore.ts`, `services/storage/projectFiles.ts`) → `uploadToR2` (public bucket) **or** base64 `data:` URL fallback → `project_files` | **No production caller on `main`.** `grep` finds `buildProjectStore` referenced only by its own tests and by `universalContracts.test.ts:99`, which asserts the identity path does *not* use it. The Universal Agent V2 became the normal path (`fly.api.toml`: `UNIVERSAL_AGENT_ENABLED='retirement'`) | The code is a **latent** writer with an unsafe fallback (R2 failure degrades silently to a data URL stored in Postgres and reports success). Historic rows may still exist (`project_files`, bucket `xroga-assets`): **count UNKNOWN** until the DB is read |
| W2 | `storeUserFile` | → R2 → `/tmp/xroga-media` → data URL | **No caller** outside its module (`routes/media.ts` is a retired surface) | Dead code carrying the same fallback chain |
| W3 | Universal output envelope artifacts | `ArtifactFabric` / `ArtifactWorkspace.write` (`ai/universal/outputEnvelope.ts`, `artifactWorkspace.ts`) → local directory under a caller-supplied root | **No production caller** (`ArtifactFabric`/`ArtifactWorkspace` appear only in their own files and tests) | Contract exists, nothing durable is wired to it. `persistArtifactToDrive` (this branch) is the ready sink |
| W4 | Run output | `ai/runStore.ts` → `swarm_runs.output` (JSONB, includes `engineeringArtifact` and file trails) | **Yes**: this is where finished run results actually persist today | Inline database content: bytes live in Postgres, not in object storage; **size and any base64 payloads UNKNOWN** (needs DB read) |
| W5 | Shipped code | pipeline pushes to the user's GitHub repo / Vercel | Yes (`ai/pipeline.ts`) | durable in the customer's own repo; not Xroga storage |
| R1 | `GET /api/projects/:id/files`, `/code`, `/:id` (`routes/projects.ts:186-234`) | ownership check `projects.user_id = req.userId` → `project_files` rows incl. `file_url` | Yes | returns the stored (public) URL / data URL to the browser |
| R2 | `readStoredFile(key)` | no auth, R2 then `/tmp` cache | No caller | key-only read, no ownership check (this branch adds an optional actor + ordering) |
| S1 | GitHub/Vercel OAuth tokens | `githubTokenStore.ts`, `vercelAuth.ts` → Supabase Storage bucket `xroga-github-tokens` (private) when the table is unavailable | Yes | **Secrets stored as files**; must never enter the object pipeline |
| A1 | Avatars | browser → Supabase Storage `avatars` (public bucket) | Yes | Frontend uploads `avatars/<ts>-<name>` (`frontend/src/hooks/useAvatarUpdate.ts:28`) while the insert policy requires the first folder to equal `auth.uid()` (`003_production_setup.sql:52`): **UNKNOWN whether uploads currently succeed** |
| P1 | Browser sessions | Browserbase (external) | If configured | no artifact capture to storage found |
| P2 | Sandbox runs | Fly machine in `xroga-sandbox` | Yes | outputs are returned inline; no object persistence found |

There is **no user file-upload endpoint** (no `multer`/multipart handler). Chat "attachments" are request payload fields (`routes/phase1.ts`, `frontend/src/lib/api.ts` `ChatAttachment`), not stored objects.

## 5. Tests and fixtures
`tsx --test` with `node:test`. Baseline on pristine `main` (this sandbox date 2026-10-21): 3 failures in `organicIntelligence.test.ts` (`STALE_FACT` verification-date drift), identical on `main`. See `evidence/`.

## 6. What was NOT inspected (and why) — all `BLOCKED`, none guessed
| Item | Reason | Minimum to unblock |
|---|---|---|
| Cloudflare account: buckets, CORS, public-domain settings, token scopes, usage, plan | no Cloudflare credentials in this sandbox | read-only API token (see `operator-checklist.md`) |
| Supabase: bucket list, RLS in force, PITR/backup state, usage | no service key / DB URL | read-only DB role + dashboard export |
| Fly: apps, volumes, secrets (names only), machine sizes | no Fly token | `fly status`/`fly volumes list` output |
| Oracle: any resource | out of Phase 1 scope | n/a |
| Vercel: file-upload or artifact dependencies | read-only MCP only; none found in code | n/a |
| Redis provider and persistence | host is in a secret | name of provider |
