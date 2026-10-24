# Production database backup: runbook

Why: `xroga-ai` is on the Supabase free plan, which has **no provider backups** (Supabase takes daily backups only on paid plans and tells free projects to export their own with `supabase db dump`).
This job is that export, run daily by Xroga's own CI, with no dependency on any developer session or assistant.

## What runs
`.github/workflows/db-backup.yml`, daily at 02:23 UTC and on demand, **from `main` only**, in the GitHub environment `db-backup`. It calls `scripts/backup/db-backup.sh`:

1. `supabase db dump` (CLI 2.122.0, pinned) of roles, schema and data.
2. A manifest of rows per table, read from the dump itself.
3. **Restore test on every run**: Supabase's documented restore command (`psql --single-transaction ... SET session_replication_role = replica ...`) into a disposable local Supabase database on the runner; every table's row count must equal the manifest, or the run fails and nothing is uploaded.
4. Encryption: CMS AuthEnvelopedData, **AES-256-GCM**, to an RSA (at least 3072-bit) certificate. Only the public certificate is in CI; the private key never is.
5. Upload with SigV4 to a **private** R2 bucket, then read the object back and compare SHA-256.
6. Failure opens (or comments on) a GitHub issue "Database backup failed"; GitHub also emails failed scheduled runs.

The repository is public, so the job logs only sizes and the ciphertext digest, uploads no artifact, and masks the connection string parts.

`scripts/backup/selftest.sh` exercises all of it against two disposable local Supabase databases, a local S3 server and a throwaway key (synthetic data only).

## One-time setup (founder approval required: this creates credentials and copies production data)
| # | Where | Action |
|---|---|---|
| 1 | your own machine, offline | `openssl req -x509 -newkey rsa:4096 -nodes -keyout xroga-backup-key.pem -out xroga-backup-cert.pem -subj "/CN=xroga-db-backup" -days 3650`. Store `xroga-backup-key.pem` in your password manager **and** one offline copy. Without it no backup can be restored |
| 2 | Cloudflare, R2 | create bucket `xroga-db-backups` (public access off, no custom domain) and an object lifecycle rule: delete objects with prefix `db/` after **35 days** |
| 3 | Cloudflare, R2, API tokens | an R2 token with **Object Read & Write on `xroga-db-backups` only** (no other bucket, no admin) |
| 4 | Supabase | the database connection string for the session pooler (port 5432). A dedicated read-only backup role is the follow-up hardening (needs a production DDL change; see below) |
| 5 | GitHub, Settings, Environments | create `db-backup`, deployment branches: `main` only. Secrets: `SUPABASE_BACKUP_DB_URL`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`. Variables: `R2_ACCOUNT_ID`, `R2_BACKUP_BUCKET=xroga-db-backups`, `BACKUP_RECIPIENT_CERT` (the contents of `xroga-backup-cert.pem`) |
| 6 | GitHub, Actions | run "Database backup" once by hand; the summary shows size, digest and the number of tables restore-verified |

## Restore (disaster recovery)
1. Download the newest `db/xroga-ai/YYYY/MM/<stamp>-<digest>.tar.cms` and its `.json` from `xroga-db-backups`.
2. `sha256sum` the `.tar.cms` and compare with `cipherSha256` in the `.json`.
3. `openssl cms -decrypt -binary -inform DER -in <file>.tar.cms -inkey xroga-backup-key.pem -recip xroga-backup-cert.pem -out bundle.tar && tar -xf bundle.tar`; compare `sha256sum bundle.tar` with `plainTarSha256`.
4. Into a **new** Supabase project (never over the live one unless that is the decision): `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname <new project URL>`.
5. Compare row counts with `manifest.tsv`, then repoint the API (`DATABASE_URL`, `SUPABASE_URL`, keys) only after checking.

Storage API objects (Supabase Storage files) are not in a database dump; today production holds two buckets (`avatars`, `xroga-github-tokens`) whose objects need a separate copy if they matter.

## Cost
GitHub Actions: free (public repository, standard runner, about 5 minutes a day). R2: a dump is a few MB; 35 daily copies stay far inside the free 10 GB and the free operation allowances. Expected spend: **$0**.

## Rollback
Disable the workflow (Actions, "Database backup", Disable) or delete the `db-backup` environment; revoke the R2 token; delete the bucket if wanted. Nothing in the product depends on this job.

## Known limits
- Versions: the restore test uses the CLI's current local Supabase images; if production's auth or storage schema is newer, the restore test fails loudly and the run uploads nothing (a correct failure that needs a CLI bump).
- Large databases: `openssl cms` encrypts in memory; fine for today's size (tens of MB), revisit beyond a few GB.
- Credential scope: until a read-only `xroga_backup` role exists, the job uses the main database credential, held only in the `db-backup` environment.
