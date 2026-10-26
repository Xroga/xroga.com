# Storage configuration matrix (expected vs actual)

Source: `backend/src/storage/config.matrix.test.ts` (pure validation) + `backend/src/services/storage/projectFiles.canonical.test.ts` (data path).
Rule: **a value that is set but not understood is an error, never a default.** Only an *unset or empty* variable means "legacy / legacy,r2".
Invalid configuration → `resolveStorageConfig().problems` is non-empty → `storageWriteMode()` / `storageReadOrder()` throw `StorageConfigError` → the write/read is refused; boot logs `[storage] INVALID CONFIGURATION`. Secrets are never echoed in the messages (tested).

## A. Configuration validation (17 cases, 0 mismatches)

| # | Configuration | Expected | Actual | Write mode | Read order | Reported problem |
|---|---|---|---|---|---|---|
| 1 | nothing set (production default) | accepted | **accepted** | legacy | legacy,r2 | — |
| 2 | write=legacy explicit | accepted | **accepted** | legacy | legacy,r2 | — |
| 3 | write empty string | accepted | **accepted** | legacy | legacy,r2 | — |
| 4 | write=dual, no Drive credentials | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_WRITE_MODE=dual requires XROGA_DRIVE_R2_* credentials and bucket; canonical storage requires a database URL |
| 5 | write=r2, no Drive credentials | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_WRITE_MODE=r2 requires XROGA_DRIVE_R2_* credentials and bucket; canonical storage requires a database URL |
| 6 | write=r2, credentials, no database | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | canonical storage requires a database URL |
| 7 | write=r2, credentials + database | accepted | **accepted** | r2 | legacy,r2 | — |
| 8 | write=dual, credentials + database (mixed case) | accepted | **accepted** | dual | legacy,r2 | — |
| 9 | write=banana (invalid value is NOT treated as legacy) | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_WRITE_MODE="banana" is not one of legacy|dual|r2 |
| 10 | write=r2, Drive bucket = legacy public bucket | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | XROGA_DRIVE_R2_BUCKET must be a dedicated private bucket, not the legacy assets bucket |
| 11 | write=r2, Drive bucket = custom legacy bucket | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | XROGA_DRIVE_R2_BUCKET must be a dedicated private bucket, not the legacy assets bucket |
| 12 | read=r2,legacy without credentials (r2 step reports not-migrated, legacy serves) | accepted | **accepted** | legacy | r2,legacy | — |
| 13 | read=r2 only without credentials | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_READ_ORDER=r2 requires XROGA_DRIVE_R2_* credentials and bucket; canonical storage requires a database URL |
| 14 | read=legacy only | accepted | **accepted** | legacy | legacy | — |
| 15 | read lists a source twice | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_READ_ORDER lists a source twice |
| 16 | read has an unknown source | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_READ_ORDER contains unsupported source(s): "s3" |
| 17 | read empty entries | REJECTED | **REJECTED** | (refuses to run) | (refuses to run) | STORAGE_READ_ORDER contains unsupported source(s): "","" |

## B. Behaviour of each mode on the data path (`storeProjectFile` / `readStoredFile`)

| Mode | Scenario | Expected | Actual (test) |
|---|---|---|---|
| `legacy` (default) | normal write | unchanged legacy behaviour (public R2, else data-URL fallback); **never claims canonical durability**; nothing written to Drive; no `storage_object_id` | ✔ `legacy mode (default) is unchanged…` |
| `legacy` | any scenario | no redirection into R2; no new tenant/credential bypass | ✔ (same test; Drive store untouched) |
| `r2` | valid config, normal | verified private write → `project_files` row with `drive://{id}` + `storage_object_id`; no public URL, no data URL, no `/tmp` | ✔ `r2 mode writes a verified private object…` |
| `r2` | provider outage mid-write | **error**; no project_files row; no fallback | ✔ `r2 mode fails closed: provider outage…` |
| `r2` | Drive unconfigured | error (config) | ✔ `r2 mode with Drive unconfigured fails closed` |
| `r2` | other user's project id | refused (`NOT_FOUND`); nothing written — flags cannot override tenant authorization | ✔ `flags never override tenant authorization…` |
| `dual` | both succeed | row carries `storage_object_id`, `canonicalDurable=true` | ✔ `dual mode records canonical success…` |
| `dual` | canonical fails, legacy succeeds | legacy result returned, **`canonicalDurable` not true, no `storage_object_id`**, error logged (partial success is visible, never reported as durable) | ✔ same test, second half |
| `dual` | Drive unconfigured | configuration error, **no quiet legacy write** | ✔ `dual mode with Drive unconfigured is a configuration error…` |
| `dual` | interrupted canonical write | object stays `UPLOADING` and is settled by `reconcile()` (abandoned cleanup / re-verify) | ✔ `crash mid-upload…`, `R2 upload succeeded but the DB commit failed…` |
| invalid value | any | refuses; nothing written anywhere | ✔ `an invalid STORAGE_WRITE_MODE fails closed…` |
| read `legacy,r2` / `r2,legacy` | key owned by caller, migrated + `read_mode=new` | served from the first source that has a **verified, owned** copy | ✔ `readCompat.test.ts` |
| read (either order) | key owned by another user | **403 on both paths**; no cross-fallback | ✔ `ownership is enforced on BOTH paths` |
| read | canonical copy corrupt | **error**, not a silent fallback to the other copy | ✔ `a corrupt canonical copy is an error…` |
| read | source missing / not migrated | falls through to the next source; else `NOT_FOUND` | ✔ `a missing legacy object falls through…` |
| read | project access revoked / object deleted | canonical path re-checks current project owner and `READY` on every request | ✔ `project revocation takes effect…`, `getDownload` deleted/quarantined tests |
| read | migration not approved | `read_new` needs a verified signed approval; without it `read_mode` stays `legacy` | ✔ `approvals.test.ts` (wrong stage / forged / expired) |

Removed/unchanged switches: none removed (all three write modes and both read orders are reachable and tested). `STORAGE_QUOTA_BYTES` unset = tracked, not enforced (no entitlement is activated by configuration). A value that is set but is not a non-negative whole number of bytes is a configuration error (startup and readiness), never "unlimited". **Proposed activation value (founder, 2026-10-27): `STORAGE_QUOTA_BYTES=500000000` (500 MB, the Free limit), prepared and NOT set in any environment.** The setting is global: the quota resolver returns one number for every tenant, so it cannot express Pro (20 GB). Do not set 20 GB globally. A Pro limit needs plan-aware enforcement (a per-tenant resolver reading verified subscription entitlement) and a storage-cost review first; that is not built and is a separate, authorised change.
