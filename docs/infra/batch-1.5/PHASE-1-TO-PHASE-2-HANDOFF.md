# Phase 1 → Phase 2 handoff

Phase 2 (INFRA-004/005/006) is **not started**. This lists the exact seams that exist now, so nothing needs to be redesigned.

## Ready interfaces
| Interface | File | Phase 2 use |
|---|---|---|
| `StorageActor { userId, tenantId }` | `backend/src/storage/types.ts` | replace `actorFromUserId` (`storage/runtime.ts`) with the accepted Batch 1 `TenantContext` mapping; every ownership check is already keyed on `tenantId` and the DB column exists |
| `ObjectStore` (provider ops only) | `storage/objectStore.ts` | Oracle workers use the same `R2ObjectStore`; a Backblaze B2 backup target is another implementation, no service change |
| `StorageService.putServerObject / ingestLegacy / readObjectBytes / verifyStoredObject` | `storage/storageService.ts` | worker-produced artifacts, evidence and screenshots go through `putServerObject`; bytes are READY only after read-back SHA-256 |
| `persistArtifactToDrive` | `storage/artifactSink.ts` | durable sink for `UniversalOutputEnvelope.artifacts` (replaces the local-FS `ArtifactWorkspace` URI) |
| `QuotaResolver` | `storageService.ts` | plug the real entitlement lookup; do **not** activate 500 MB / 20 GB without approval |
| `MigrationLedger`, `SourceAdapter`, `MigrationEngine` | `storage/migration/*` | add adapters (e.g. `swarm_runs` artifacts, Fly volume objects) without touching the engine; run engine from an Oracle worker instead of a laptop |
| `runPhase` + `scripts/storage/*.mts` | `migration/cli.ts` | same entry points under OCI; receipts are redacted JSON |
| `STORAGE_WRITE_MODE`, `STORAGE_READ_ORDER` | `storage/runtime.ts` | cutover switches; default `legacy` |
| `storage_migration_claim` (lease + `SKIP LOCKED`) | migration SQL | the *pattern* for INFRA-006 durable claims/leases; do not fork it into a second scheduler |

## What each Phase 2 item should reuse (and must not rebuild)
| Phase 2 item | Reuse | Do not |
|---|---|---|
| OCI CredentialVault (INFRA-004) | Batch 1 CredentialVault once accepted; `SECRET_BUCKETS` denylist; SEC-1..3 in `data-location-inventory.md` as the migration list | migrate tokens through the object pipeline; keep `USER_SECRETS_ENCRYPTION_KEY → SUPABASE_SERVICE_ROLE_KEY` fallback |
| Oracle API (INFRA-005) | `/api/drive` router is host-agnostic; needs `XROGA_DRIVE_R2_*` + `DATABASE_URL` as OCI secrets; health: `GET /api/drive/objects` → 200/503 | change DNS or callbacks without approval |
| Oracle workers / scheduler (INFRA-006) | `putServerObject` for outputs; ledger-style leases; BullMQ/Redis untouched (provider/persistence still `UNKNOWN`) | add a second task graph |
| AI Employees / workflows / browser / sandbox | storage is ready to receive evidence; **those capabilities themselves are NOT_IMPLEMENTED or UI-only today** (`product-capability-baseline.md`) | treat the homepage demo as capability |

## Preconditions before Phase 2 can be verified
1. GitHub write access restored and this branch pushed; first remote CI run recorded.
2. R2 test bucket + CORS (checklist B) → run the provider suite, upgrade Gates B/D if they pass.
3. Batch 1 `TenantContext` accepted into `main` → one controlled integration checkpoint.
4. Read-only cloud facts (checklist A) → replace the `UNKNOWN` counts.

## Warnings carried forward
- Opening a PR runs `supabase-migrate.yml` in the `Preview` environment against this branch's migration; merging to `main` applies it to production. Neither has happened.
- The migration is additive and reversible by not using it; nothing depends on it until `STORAGE_WRITE_MODE` is changed.
