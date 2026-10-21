# Operator checklist · everything Phase 1 still needs from outside this sandbox

One consolidated list. **Do not paste secrets into chat**; set them in the host's secret store.

## A. Unblocks live inventory (read-only) — INFRA-001 §2.4
| # | Need | Minimal form | Why |
|---|---|---|---|
| A1 | Cloudflare read-only API token (Account: Workers R2 Storage Read; Billing/Usage read) | secret in this session's secure env | list buckets, CORS, public-domain state, usage vs free allowance |
| A2 | Read-only Postgres role or `psql` export of: `select count(*), sum(length(file_url)) … from project_files where file_url like 'data:%'`, `pg_total_relation_size('swarm_runs')`, bucket list from `storage.buckets` | one-off output | sizes/counts the baseline marks UNKNOWN |
| A3 | `fly status -a xroga-api`, `fly volumes list -a xroga-api`, `fly secrets list -a xroga-api` (names only) | output | volumes and which secrets exist |
| A4 | Redis provider name + whether persistence is on | one line | queue durability |
| A5 | Supabase plan + backup/PITR setting | dashboard screenshot | recovery claim |

## B. Unblocks provider verification (INFRA-002 Gate B/D "PROVIDER_VERIFIED")
| # | Need |
|---|---|
| B1 | A **new, empty, private** R2 bucket (e.g. `xroga-drive-staging`), no public access, + a token scoped to it. Confirm in the dashboard that the account is inside the free allowance. |
| B2 | CORS on that bucket as in `runbook-storage.md` §2. |
| B3 | A disposable Postgres (a Supabase branch or local) to apply the migration. |
| B4 | Then run: `STORAGE_TEST_DATABASE_URL=… XROGA_DRIVE_R2_*=… npm run test:storage-provider --workspace=backend` (added in Phase 2 if you approve; Phase 1 ships the synthetic suite only). Expected to prove: real presigned-PUT enforcement of content-length/type/checksum, real multipart, CORS, private access. |

## C. Approvals needed before anything touches production
| Action | Status |
|---|---|
| Merge this branch to `main` (also applies the migration on merge) | **not requested** |
| Create the production private bucket and secrets | **not requested** |
| Flip `STORAGE_WRITE_MODE` | **not requested** |
| Approve `copy` / `read_new` / `freeze_old` for a migration job | **not requested** |
| Legacy deletion / Fly retirement | **not implemented / out of scope** |

## D. GitHub
`claude/xroga-batch-1-5` could not be pushed from this environment (HTTP 403 `Resource not accessible by integration` on both git and the GitHub API). Grant the Claude GitHub App write (Contents) on `Xroga/xroga.com` or create the branch; the work is committed locally and a bundle is attached in `evidence/`.
