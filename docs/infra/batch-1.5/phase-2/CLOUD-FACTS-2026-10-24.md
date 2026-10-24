# Read-only cloud facts (B-4), 2026-10-24

Established with already-connected, read-only access only: the Supabase and Cloudflare tools in this session (GET requests; no SQL, no write) and the GitHub API. No token or credential was printed or stored.
Nothing was modified. Items that need the Fly login are listed at the end.

## Established
| Checklist | Fact | How |
|---|---|---|
| A5 Supabase plan | Organization "Xroga AI" is on the **free** plan (`tier_free`). Free means no point-in-time recovery; backup retention is not exposed by the available tools, so the dashboard (Database, Backups) is the place to confirm what exists | `get_organization` |
| A5 projects | `xroga-ai` (production, `ap-northeast-1`, Postgres 17.6.1.121, `ACTIVE_HEALTHY`) and `Xroga LOGIN` (legacy, `ap-southeast-1`, **`INACTIVE`**, paused). No disposable project exists | `list_projects`, `get_project` |
| A5 isolation | PR code reaches no hosted database: the PR path of `supabase-migrate.yml` is offline; no `E2E_*` secret or variable exists; environments `Preview` and `Production` hold no secrets or variables of their own; 11 repository secrets, no Redis one | GitHub API |
| A1 Cloudflare account | one standard account; the connection authenticates as a user identity | `whoami`, `GET /accounts` |
| A1 R2 buckets | `xroga-assets`, `xroga-chat-archive`, `xroga-images`, `xroga-websites`, `xroga-drive-test` (Phase 1 test bucket, still present: its owner cleanup remains open) | `GET …/r2/buckets` |
| A1 public access | the `r2.dev` public domain is **enabled** on `xroga-chat-archive`, `xroga-images` and `xroga-websites`; disabled on `xroga-assets` and `xroga-drive-test`. No custom domains on any bucket | `GET …/domains/managed`, `…/domains/custom` |
| A1 CORS | none on the four legacy buckets; `xroga-drive-test` allows `http://localhost:3000` for GET, PUT, HEAD | `GET …/cors` |
| A1 usage | account-level R2 metrics report **0 objects and 0 bytes** in both storage classes (metrics can lag; treat as "very small or empty", not as proof of empty). That is inside any free allowance | `GET …/r2/metrics` |
| A4 Redis (partial) | no `REDIS_URL` repository secret; `fly.api.toml` sets none; the code uses Redis only when `REDIS_URL` is set; BullMQ has no consumer or producer; the only provider mention is Upstash in the capability registry | repository and GitHub API |
| A3 Fly (partial, from the repository; superseded below) | app `xroga-api`, toml region `iad` (machines actually run in `sin`), 1 GB VM, second app `xroga-sandbox` named in `XROGA_SANDBOX_FLY_APP` | `fly.api.toml` |

Findings worth acting on later (none was changed): public `r2.dev` access on `xroga-chat-archive` is risky for a bucket named as an archive of chats, even if it is empty today; the production database is on a plan with no PITR.

## Exposure and recovery, measured (follow-up, same day)
**R2 public access: no object is exposed today.** A full object listing (API status 200, `success: true`, not truncated) returns **0 objects** in all five buckets, including the three with `r2.dev` enabled.
The only code that writes to R2, `backend/src/lib/r2.ts` (used by `projectFiles.ts`), writes to `CLOUDFLARE_R2_BUCKET`, default `xroga-assets` (r2.dev **off**), and **builds `https://<bucket>.r2.dev/<key>` URLs** when
`CLOUDFLARE_R2_PUBLIC_URL` is unset. The future risk: if production sets `CLOUDFLARE_R2_BUCKET` to one of the three public buckets, every uploaded project file becomes readable by anyone who has or guesses
its key (`users/<userId>/<ms timestamp>-<filename>`). Whether `CLOUDFLARE_R2_*` is set on Fly is answered by the Fly secret names. Since all three buckets are empty, turning `r2.dev` off on them breaks nothing that exists today.
Phase 1's Drive path does not use these URLs (private delivery; its provider test asserts the object is not reachable on `r2.dev`).

**Supabase backups: the production database has no provider backup to restore.** Supabase's documentation: daily backups are taken for Pro, Team and Enterprise projects only;
free projects are advised to export their own with `supabase db dump`. `xroga-ai` is on the free plan, and the repository has no backup workflow (no `pg_dump` or `db dump` in `.github`).
A deleted table or a bad migration today is unrecoverable. This is a genuine customer-data risk, independent of Phase 2.

New since the first pass: a third project, `xroga-p3-staging-20261024` (`us-east-1`, created 2026-10-24 14:09 UTC), exists; it appears to be Codex's Phase 3 staging and was not touched.

## Fly, Redis and backups (after the founder's Fly login, same day)
Read with a browser-approved Fly CLI session: `fly apps list`, `fly status`, `fly machine list`, `fly volumes list`, `fly secrets list` (names only; values never requested). The session token was kept in a private scratch file, never printed, and deleted afterwards. Nothing was changed.

| Checklist | Fact |
|---|---|
| A3 apps | `xroga-api` (deployed, last deploy about 18 h before reading, release 1247) and `xroga-sandbox` (**suspended**, no image, no secrets), both owned by the personal organization |
| A3 machines | **two** `app` machines for `xroga-api`, both in **`sin`** (the toml's `primary_region = 'iad'` is not where they run), `shared-cpu-1x`, 1024 MB, `NODE_ENV=production`, restart `on-failure` (10 retries), autostop off, health check passing |
| A3 volumes | **none** on either app: the API is stateless on Fly; nothing durable lives on the machines |
| A3 secrets | 103 names on `xroga-api`. Relevant: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_ENDPOINT`, `XROGA_SANDBOX_FLY_TOKEN`. **Absent:** `REDIS_URL`, every `XROGA_CREDENTIAL_KMS_*` / `XROGA_OCI_KMS_*` name, every `XROGA_DRIVE_R2_*` name, `STORAGE_WRITE_MODE` |
| A4 Redis | **not used in production**: no `REDIS_URL` on Fly or in GitHub, and the code only connects when it is set. Provider and persistence: none. Closed |
| A5 Supabase | free plan; Supabase takes daily backups only on Pro, Team and Enterprise, so **no provider backup exists**; PITR is a paid add-on. No backup job in the repository. Closed as a fact; the risk is below |
| A1 Cloudflare | R2 usage 0 objects, so inside the free allowance on any plan (R2 is billed by usage, not by account plan). The account subscription itself was not readable (403) and is not needed for this checklist item. Closed |

**Consequences**
- **B-3:** no KMS provider is configured on Fly, so a build containing Codex's startup gate would not start there (see `BATCH1-MERGE-SEQUENCE.md`). This is now observed, not inferred.
- **R2 names do not match the code.** Fly has `CLOUDFLARE_R2_ACCESS_KEY_ID`, `…_SECRET_ACCESS_KEY`, `…_BUCKET_NAME`; `backend/src/lib/r2.ts` reads `CLOUDFLARE_R2_ACCESS_KEY`, `…_SECRET_KEY`, `…_BUCKET`. Every legacy upload therefore throws and
  `projectFiles.ts` falls back to a base64 `data:` URL stored in `project_files`. That is why every bucket is empty, and it means **the public `r2.dev` buckets are not reachable by current production code**.
  It also means any such files exist **only in the database, which has no backup**. (Per `current-state.md` W1, that writer has no production caller on `main` today, so the volume is probably small; A2 measures it.)
- Phase 1 Drive is not configured in production (no `XROGA_DRIVE_R2_*`, no `STORAGE_WRITE_MODE`), as intended.

## A2: database counts (founder-approved read-only query, run once, 2026-10-24)
Run once through the Supabase connection with `set transaction_read_only = on; set statement_timeout = '15s'`; the result reports both settings, so the read-only state is evidenced, not assumed.
Only aggregates were returned; no row, file content or credential.

| Fact | Value |
|---|---|
| transaction read only / statement timeout (as reported by the server) | `on` / `15s` |
| `project_files` rows with a `data:` URL, and their total length | **0**, 0 |
| `project_files` rows in total | **0** |
| `swarm_runs` rows / total relation size | **238** / 7,200,768 bytes (about 6.9 MiB) |
| Supabase Storage buckets | `xroga-github-tokens` (private), `avatars` (public) |

Consequences: the R2 name mismatch has stored **no** file in the database (there are no project files at all), so there is nothing to preserve or migrate; the only durable run output lives in `swarm_runs`,
small enough for a daily logical backup. Checklist A is complete.
