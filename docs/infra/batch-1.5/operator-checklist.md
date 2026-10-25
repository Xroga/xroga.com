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
| B4 | Then run `npm run test:storage-provider --workspace=backend` (exists now; refuses to start unless every guard variable is set). Proves: real presigned-PUT enforcement of content-length/type/checksum (observed), real multipart + ListParts, CORS, private access, expiry, pagination, cleanup. |

## C. Approvals needed before anything touches production
| Action | Status |
|---|---|
| Merge this branch to `main` (also applies the migration on merge) | **not requested** |
| Create the production private bucket and secrets | **not requested** |
| Flip `STORAGE_WRITE_MODE` | **not requested** |
| Approve `copy` / `read_new` / `freeze_old` for a migration job | **not requested** |
| Legacy deletion / Fly retirement | **not implemented / out of scope** |

## B'. The single R2 request
See `r2-provider-verification-request.md` (one approval, one bucket, one token, one command).

## D. GitHub
Diagnosed in `github-access-diagnosis.md`: the session token has `push:false` on `Xroga/xroga.com`. Grant the Claude GitHub App Contents + Pull requests write (and Workflows write for `.github/workflows/storage-phase1.yml`) or import the delivered bundle from an authorised environment. **Before opening any PR confirm the `Preview` environment's secrets are not production's** (see that file).
