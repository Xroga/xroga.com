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
| `XROGA_DRIVE_PRESIGN_SIGN_LENGTH` | set `0` to stop asking R2 to enforce a signed `content-length` | enforced | use only if the provider suite shows R2 rejects it; server read-back stays authoritative |
| `STORAGE_MIGRATION_APPROVER_PUBKEY` | PEM (or path) of the approver's **public** key | unset = no stage can be approved | the private key never lives on the migration host |
| `STORAGE_MIGRATION_ENV` | `test` \| `staging` \| `production` | **no default** | an approval signed for another environment is refused |
| `STORAGE_TEST_DATABASE_URL` | enables the real-Postgres tests (superuser on a **disposable** server; the tests create and drop their own database) | unset = those tests skip | never point at production |

## 2. Required permissions
- Cloudflare: R2 Admin only to *create* the bucket (operator, once). The app token needs Object Read & Write on the one bucket. No public access, no custom domain, no r2.dev subdomain.
- R2 CORS (bucket-level, operator): allow `PUT`/`GET` from `https://xroga.com` (and previews if wanted); allow headers `content-type`, `x-amz-checksum-sha256`; expose `ETag` (needed for multipart); no wildcard origin.
- Postgres: the API's DB role needs `EXECUTE` on the `storage_*` functions and DML on the new tables (the migration grants `service_role`).

## 3. Deploy sequence **[APPROVAL for every numbered step in production]**
1. Review `supabase/migrations/20261022000000_storage_drive_foundation.sql` (additive only). It is applied by `supabase-migrate.yml` **on merge to `main`**; a PR runs it in the `Preview` environment first.
2. Create the private R2 bucket + token; set the secrets on the API host. Drive stays off while any is unset.
3. Check the API role can write under forced RLS: `select rolbypassrls from pg_roles where rolname = current_user;` must be `true` (Supabase `postgres`/`service_role` are). Deploy the API. `GET /api/drive/objects` should return `200 []` for an authenticated user; `503 STORAGE_NOT_CONFIGURED` otherwise. Invalid `STORAGE_*` values are logged at boot (`[storage] INVALID CONFIGURATION`) and make storage calls fail closed.
4. Provider verification (staging): run the checklist in `operator-checklist.md` §B. Record the evidence before going on.
5. Optionally `STORAGE_WRITE_MODE=dual` (observe) → `r2`. Revert by setting `legacy` and redeploying.

## 4. Migration sequence (never automatic)
Roles: the **approver** (a person, offline machine, holds `approver-private.pem`) and the **migration host** (holds only the public key + `STORAGE_MIGRATION_ENV`). A database row or a CLI flag cannot approve anything.
```
# once, on the approver's machine
tsx scripts/storage/create-migration-job.mts keygen --out-dir ~/xroga-approver      # keep approver-private.pem there; copy approver-public.pem to the host

# on the migration host (read-only / ledger-only phases need no approval)
tsx scripts/storage/create-migration-job.mts create --source legacy_r2 --name first-pass --copy-mode
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase discover
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase dry-run          # classification only; fixes the PLAN (digest of the exact objects)
tsx scripts/storage/reconcile-storage.mts  --job J                          # honest counts

# [APPROVAL] on the approver's machine, after reading the plan: signs {job, stage, environment, source, bucket, plan digest, expiry[, tenants]}
tsx scripts/storage/create-migration-job.mts approve --job J --stage copy --operator "<name>" --environment production \
     --private-key-file ~/xroga-approver/approver-private.pem --ttl-hours 12 [--tenants <uuid,uuid>]

tsx scripts/storage/migrate-legacy-r2.mts --job J --phase copy              # still only a plan (no --execute)
tsx scripts/storage/migrate-legacy-r2.mts --job J --phase copy --execute    # copies; re-verifies the approval before every batch
tsx scripts/storage/verify-storage.mts     --job J                          # independent read-back
tsx scripts/storage/reconcile-storage.mts  --job J
# [APPROVAL] read_new / freeze_old are separate signed stages; delete is not implemented
tsx scripts/storage/rollback-storage-read-mode.mts --job J --execute   # at any time; no approval needed (it is the safety valve); deletes nothing
```
What invalidates an approval: new or changed source objects (discovery clears the plan → `NO_PLAN`, re-run dry-run, re-approve), expiry, another job/stage/environment/source/bucket, an unsigned or foreign-signed token, a missing public key. Objects outside `--tenants` are `BLOCKED(OUT_OF_APPROVAL_SCOPE)`.
Legacy source deletion is **not implemented** (`deleteLegacy` always refuses); `--phase manifest` only lists what a later, separately approved retirement could remove.

## 5. Rollback
| Situation | Action | Data effect |
|---|---|---|
| Drive misbehaves | unset the R2 secrets (Drive → 503) or `STORAGE_WRITE_MODE=legacy` | none; objects/rows retained |
| Migrated reads wrong | `rollback-storage-read-mode.mts --execute` | ledger read mode only; **customer writes made after cutover are untouched** and stay in Drive |
| Bad migration batch | leave it: sources were never modified; mark items and re-run after fixing | no loss |
| Schema | the migration is additive; nothing to undo for the old code paths | |

Note: read order affects *legacy-keyed* reads only. Objects created directly in Drive are always read through Drive.

## 5b. Database rollback
`docs/infra/batch-1.5/rollback/20261022000000_storage_drive_foundation.down.sql` (manual, tested; not in `supabase/migrations/`). Forgets ownership of the R2 objects (bytes remain): only after `STORAGE_WRITE_MODE=legacy` is live and `storage_objects` has been reviewed.

## 6. Reconciliation (scheduled by the operator, not by this branch)
`reconcile-storage.mts --drive --execute` expires reservations, removes abandoned uploads (after their window), flags READY objects missing at the provider as `CORRUPT`, repairs usage counters from the reservation ledger, and **reports** (never deletes) orphan keys with `--scan-orphans`.

## 7. Incident notes
- Suspected leaked presigned URL: it expires on its own (≤ 5 min GET, 15 min PUT). Rotate the R2 token to invalidate all outstanding signatures at once.
- `CORRUPT` objects are never served. Do not delete them until the cause is known.

## Large objects and run-output artifacts (2026-10-22)
- Objects above the single-PUT threshold (default 1 GiB, `maxStreamCopyBytes`) are copied by the bounded multipart path automatically; there is no extra flag. Part size follows `STORAGE_MULTIPART_PART_BYTES` (default 16 MiB, minimum 5 MiB, at most 10,000 parts), two parts are held in memory at a time, each part has a 120 s timeout. A failed attempt keeps its multipart upload id on the destination row and the retry resumes it; stored parts are reused only when their ETag equals the MD5 of what the source produces now.
- Abandoned multipart uploads are aborted by `reconcile-storage.mts --drive --execute` once the 24 h reservation has expired.
- Run-output artifacts: `tsx scripts/storage/create-migration-job.mts create --source run_output_artifacts --name runs --copy-mode`, then `tsx scripts/storage/migrate-run-output-artifacts.mts --job J --phase discover|dry-run|copy|verify` with the same signed-approval flow as above. Start with the read-only count: `tsx scripts/storage/inventory-storage.mts` (`run_output_artifacts` block). Expect few or no eligible items: today the production writer stores metadata-only descriptors. Source rows are never modified; rollback of read mode is `rollback-storage-read-mode.mts --source run_output_artifacts --job J`.
- `STORAGE_DB_SSL_CA` (PEM or file path) makes the storage pool verify the database certificate.
