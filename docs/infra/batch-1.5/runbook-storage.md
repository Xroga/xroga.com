# Runbook · Xroga Drive and storage migration (Phase 1)

Nothing here has been executed against production. Every step marked **[APPROVAL]** needs the founder's explicit go-ahead.

## 1. Configuration reference
| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `XROGA_DRIVE_R2_ACCOUNT_ID` | Cloudflare account for the private bucket | falls back to `CLOUDFLARE_R2_ACCOUNT_ID` | |
| `XROGA_DRIVE_R2_ACCESS_KEY_ID` / `XROGA_DRIVE_R2_SECRET_ACCESS_KEY` | R2 API token (S3 credentials) | unset = Drive disabled (HTTP 503) | server-side only, Fly/OCI secret; never `NEXT_PUBLIC_*`. Scope: Object Read & Write on **this bucket only** |
| `XROGA_DRIVE_R2_BUCKET` | dedicated **private** bucket | unset | refused if equal to `CLOUDFLARE_R2_BUCKET`/`xroga-assets` |
| `DATABASE_URL` | Postgres (existing resolution in `postgresConnect.ts`) | existing | the role must reach `public.storage_*` |
| `STORAGE_WRITE_MODE` | `legacy` · `dual` · `r2` | `legacy` | `r2` fails closed; `dual` records canonical failure and never calls it durable |
| `STORAGE_READ_ORDER` | `legacy,r2` · `r2,legacy` | `legacy,r2` | applies to legacy-key reads that pass an actor |
| `STORAGE_QUOTA_BYTES` | per-tenant allowance | unset = tracked, not enforced | **candidate Free 500 MB / Pro 20 GB values are NOT activated**; no entitlement was changed |
| `STORAGE_MAX_OBJECT_BYTES` | per-object ceiling | 5 GiB | not a published product limit |
| `STORAGE_SINGLE_PUT_MAX_BYTES` / `STORAGE_MULTIPART_PART_BYTES` | single-PUT vs multipart switch / part size | 100 MiB / 16 MiB | R2 part minimum 5 MiB |
| `STORAGE_TEST_DATABASE_URL` | enables the real-Postgres tests (superuser on a **disposable** server; the tests create and drop their own database) | unset = those tests skip | never point at production |

## 2. Required permissions
- Cloudflare: R2 Admin only to *create* the bucket (operator, once). The app token needs Object Read & Write on the one bucket. No public access, no custom domain, no r2.dev subdomain.
- R2 CORS (bucket-level, operator): allow `PUT`/`GET` from `https://xroga.com` (and previews if wanted); allow headers `content-type`, `x-amz-checksum-sha256`; expose `ETag` (needed for multipart); no wildcard origin.
- Postgres: the API's DB role needs `EXECUTE` on the `storage_*` functions and DML on the new tables (the migration grants `service_role`).

## 3. Deploy sequence **[APPROVAL for every numbered step in production]**
1. Review `supabase/migrations/20261022000000_storage_drive_foundation.sql` (additive only). It is applied by `supabase-migrate.yml` **on merge to `main`**; a PR runs it in the `Preview` environment first.
2. Create the private R2 bucket + token; set the secrets on the API host. Drive stays off while any is unset.
3. Deploy the API. `GET /api/drive/objects` should return `200 []` for an authenticated user; `503 STORAGE_NOT_CONFIGURED` otherwise.
4. Provider verification (staging): run the checklist in `operator-checklist.md` §B. Record the evidence before going on.
5. Optionally `STORAGE_WRITE_MODE=dual` (observe) → `r2`. Revert by setting `legacy` and redeploying.

## 4. Migration sequence (never automatic)
```
node_modules/.bin/tsx scripts/storage/create-migration-job.mts create --source legacy_r2 --name first-pass     # dry_run job
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase discover
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase dry-run          # classification only, writes nothing to storage
tsx scripts/storage/reconcile-storage.mts  --job J                          # honest counts
# [APPROVAL] copy:
tsx scripts/storage/create-migration-job.mts approve --job J --stage copy --by <name> --ref <approval-ref>
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase copy              # still a plan
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase copy --execute    # does the copy
tsx scripts/storage/verify-storage.mts     --job J                          # independent read-back
tsx scripts/storage/reconcile-storage.mts  --job J
# [APPROVAL] switch reads, observe, then (separately) freeze:
… approve --stage read_new … --phase read-new --execute        # sets read_mode=new, links project_files
tsx scripts/storage/rollback-storage-read-mode.mts --job J --execute   # at any time; deletes nothing
```
Legacy source deletion is **not implemented** in Phase 1 (`deleteLegacy` always refuses); `--phase manifest` only lists what a later approved retirement could remove.

## 5. Rollback
| Situation | Action | Data effect |
|---|---|---|
| Drive misbehaves | unset the R2 secrets (Drive → 503) or `STORAGE_WRITE_MODE=legacy` | none; objects/rows retained |
| Migrated reads wrong | `rollback-storage-read-mode.mts --execute` | ledger read mode only; **customer writes made after cutover are untouched** and stay in Drive |
| Bad migration batch | leave it: sources were never modified; mark items and re-run after fixing | no loss |
| Schema | the migration is additive; nothing to undo for the old code paths | |

Note: read order affects *legacy-keyed* reads only. Objects created directly in Drive are always read through Drive.

## 6. Reconciliation (scheduled by the operator, not by this branch)
`reconcile-storage.mts --drive --execute` expires reservations, removes abandoned uploads (after their window), flags READY objects missing at the provider as `CORRUPT`, repairs usage counters from the reservation ledger, and **reports** (never deletes) orphan keys with `--scan-orphans`.

## 7. Incident notes
- Suspected leaked presigned URL: it expires on its own (≤ 5 min GET, 15 min PUT). Rotate the R2 token to invalidate all outstanding signatures at once.
- `CORRUPT` objects are never served. Do not delete them until the cause is known.
