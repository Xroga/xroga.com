# Requirement → code → test matrix (finite; INFRA-001/002/003)

Legend: ✔ implemented + tested locally · ◐ implemented, provider/live proof pending (EXTERNAL) · ✖ not implemented (reason). "Tests" are under `backend/src/` unless noted. Real-SQL tests need `STORAGE_TEST_DATABASE_URL`.

## INFRA-001
| Requirement | Status | Where |
|---|---|---|
| Actual current/target infrastructure | ✔ source / ◐ live | `current-state.md`, `target-architecture.md` |
| Storage inventory, durable vs ephemeral, classes | ✔ source / ◐ counts | `data-location-inventory.{md,json}` |
| Reachable callers/APIs | ✔ | `current-state.md` §4 (W1–W5, R1–R2) |
| Real vs marketing-only features | ✔ | `product-capability-baseline.md` |
| Auth/credential boundaries | ✔ + finding | `oauth-token-finding.md`, `security-review.md` |
| Cloud unknowns | ✔ listed, ◐ blocked | `current-state.md` §6, `operator-checklist.md` |
| Dependency + cost baseline | ✔ | `dependency-inventory.md`, `cost-baseline.md` |
| Phase 2 handoff | ✔ | `PHASE-1-TO-PHASE-2-HANDOFF.md` |

## INFRA-002
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Canonical object registry | ✔ | `supabase/migrations/20261022…foundation.sql` (`storage_objects`), `storage/postgresRepository.ts` | `postgresRepository.integration` |
| Additive migration | ✔ | same; only `project_files.storage_object_id` added to an existing table | `schemaUpgrade.integration` (populated upgrade, idempotent ×3, rollback) |
| RLS + column permissions | ✔ | migration §Access control (RLS **forced**, 14-column grant, `service_role`-only functions) | `postgresRepository.integration` "RLS and grants", `schemaUpgrade.integration` "hardening" |
| Authenticated `/api/drive` routes | ✔ | `routes/drive.ts`, mounted in `index.ts` | `routes/drive.test`, `driveRegistration.test` |
| Lifecycle PENDING→…→READY, failure states | ✔ | `storage/types.ts`, `storageService.ts`, SQL trigger | `storageService.test` (state machine, lifecycle), real-SQL trigger tests |
| Upload/download capabilities | ✔ / ◐ R2 enforcement | `storage/r2ObjectStore.ts#presignPut/#presignGet`, `policy.ts` | `r2ObjectStore.test` (SDK output), memory-store enforcement tests |
| Content verification (size, sniff, SHA-256 read-back) | ✔ | `storageService.ts#verifyAndAdmit`, `integrity.ts`, `policy.ts` | checksum/size/type/executable tests + mutation checks |
| Atomic quotas | ✔ | SQL `storage_reserve/commit/release/free/expire/reconcile_usage` | 50-way race, idempotency, expiry, drift (real PG) |
| Multipart | ✔ / ◐ R2 | `storageService.ts#signUploadParts/#completeMultipartIfNeeded`, `policy.ts` (≥5 MiB, uniform parts, ≤10 000) | memory suite; wire suite (emulator, `EMULATOR_LIMITATION`s listed) |
| Listing | ✔ | `StorageService.listObjects`, `ObjectStore.list` | `storageService.test`; pagination only on real R2 (`r2.provider`) |
| Delete / retention | ✔ | `deleteObject`, `retention_until` check, `#finishDeletion` | delete/DELETING resume tests |
| Reconciliation | ✔ | `StorageService.reconcile` | abandoned / missing / orphan / drift tests |
| Artifact + project-file integration | ✔ / no enabled writer on `main` | `services/storage/projectFiles.ts` (modes), `storage/artifactSink.ts` | `projectFiles.canonical.test`, `artifactSink.test` |
| Private by default | ✔ / ◐ bucket settings | Drive never issues public URLs; legacy bucket refused (`r2ConfigFromEnv`) | `r2ObjectStore.test`, R2 suite step 4–5 (**not yet run**) |

## INFRA-003
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Source adapters | ✔ | `storage/migration/sources.ts` (LegacyR2, SupabaseStorage, ProjectFilesInline, LocalMediaCache[opt-in]); token bucket refused | `engine.test`, `postgresMigration.integration` |
| Ledger, deterministic ids, one destination per source | ✔ | `ledger.ts`, `postgresLedger.ts`, SQL unique `(source_provider, source_id)` | duplicate-row, idempotent replay |
| Dry-run | ✔ | `engine.ts#dryRun` (ledger-only), `cli.ts` | "writes nothing to the destination" |
| **Authorization** | ✔ | `approvals.ts` (Ed25519, job/stage/env/plan-digest/expiry/tenants), `engine.ts#require` | `approvals.test` (12), mutation checks ×3 |
| Source checksum capture + destination verification | ✔ | `engine.ts#copyOne` (single-pass tee hash), `#verify` (independent read-back) | corrupt-write, corrupt-after-copy, missing-destination |
| Retry/resume/interrupted/duplicate | ✔ | leases + backoff + `MAX_ATTEMPTS`; `storage_migration_claim` (`SKIP LOCKED`) | kill-after-upload, DB-commit failure, 2 and 3 concurrent workers (memory + real PG) |
| Reconciliation | ✔ | `engine.ts#reconcile` (`consistent`, `metadataMismatches`) | end-to-end, source-changed |
| Read-order switching | ✔ | `readCompat.ts`, `runtime.ts`, `projectFiles.ts#readStoredFile` | `readCompat.test`, `config.matrix.test` |
| Rollback | ✔ | `engine.ts#rollbackReadMode` (ledger + link only) | idempotent, preserves post-cutover writes |
| Source retention | ✔ | `FREEZE_OLD` marker; `deleteLegacy` always refuses; manifest lists only | "deletion is not implemented" |
| Operator scripts | ✔ | `scripts/storage/*.mts` (dry-run default, receipts, BLOCKED exit 3, NOT_APPROVED exit 4) | `cli.test` |
| Server-side multipart **copy** for objects > 1 GiB | ✖ | classified `BLOCKED(NEEDS_MULTIPART_COPY)` — honest, not silent | `engine.test` |
| Adapter for `swarm_runs.output` inline artifacts | ✖ | out of Phase 1 (needs artifact-extraction design) | — |
