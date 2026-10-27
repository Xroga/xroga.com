> **SUPERSEDED as a target architecture (2026-10-27).** Google Cloud Run is now the canonical backend compute and execution platform: the Fly.io to Google Cloud migration is accepted and merged (#856, #864). Oracle Cloud is **not** used for hosting or execution, and Fly.io is retired. Where this document names Oracle OCI compute, read Google Cloud Run / the existing Google execution slots.
> This file is kept unchanged below as the historical record of the 2026-10-22 decision. Current runtime facts: `docs/operations/google-production-migration.md`; Batch 1.5 Phase 2 (Google workers, scheduler, browser host): `docs/infra/batch-1.5/phase-2/`.

# Target architecture — Phase 1 scope (storage foundation)

Only what Phase 1 builds is drawn as built. Oracle, KMS, workers, browser and sandbox providers are Phase 2/3 and appear only as interfaces.

```
Browser ──(1) POST /api/drive/uploads ─────────▶ API (Fly today; Oracle later)         Supabase Postgres
   │                                              │  authMiddleware → userId              storage_objects  ◀─ source of truth
   │◀─(2) {objectId, presigned PUT | part plan}───┤  StorageService                       storage_reservations / storage_usage (quota ledger)
   │                                              │   policy · keys · quota · audit        storage_audit_events
   ├─(3) PUT bytes (signed: type,len,sha256)──────┼──────────────────────────▶ Cloudflare R2 (PRIVATE bucket, no public domain)
   │                                              │                                  key: v1/tenants/{t}/projects/{p|_none}/{class}/{objectId}/{file}
   ├─(4) POST …/complete ─────────────────────────▶  head → size → sniff → stream SHA-256 → quota commit → READY
   └─(5) POST …/download-url ─▶ owner+project+READY → presigned GET (≤5 min, forced attachment for active types)
Migration (operator CLI / worker): LegacyR2 | Supabase Storage | project_files inline ─▶ ledger ─▶ same StorageService ingest ─▶ R2
```

## Decisions and their reasons
| Decision | Reason |
|---|---|
| One registry: `storage_objects`; `project_files.storage_object_id` is an additive link | no second source of truth; existing contracts preserved |
| Postgres owns authorization + state + quota; R2 holds bytes only | R2 has no tenant concept; RLS/ownership live where identity lives |
| DB enforces the state machine and "no READY without verified size+hash" (trigger + CHECK) | a service bug cannot create a false READY |
| Quota in SQL functions, serialised per tenant (row lock) | atomic under real concurrency (tested with 50 parallel reservations) |
| READY only after **server read-back SHA-256** | ETag is not a content hash; presigned-PUT constraints are advisory until the provider proves them |
| `tenant_id` column everywhere, set to the user id for now | seam for Batch 1 `TenantContext` without a schema change (`WAITING_FOR_BATCH1_ACCEPTED_INTERFACE`) |
| Dedicated `XROGA_DRIVE_R2_*` env and a hard refusal of the legacy bucket name | the public `xroga-assets` bucket can never be selected by accident |
| Migration reuses the same ingest + verification path | one integrity pipeline; deterministic destination id = idempotent replays |
| `STORAGE_WRITE_MODE=legacy` default; `dual`/`r2` opt-in; `r2` fails closed | zero behaviour change until an owner flips it |

## Out of scope in Phase 1 (interfaces only)
CredentialVault/OCI KMS (INFRA-004) · Oracle API/workers (INFRA-005/006) · BullMQ/Redis changes · the Oracle-hosted Chromium + Playwright + Stagehand BrowserWorker and the coding-sandbox provider (INFRA-007; see `browser-architecture-decision.md`: Cloudflare Browser Run/Rendering and Browserbase are excluded as browser hosts) · public/CDN delivery of any object · lifecycle/retention rules in R2 (R2-side config, needs operator).

## Residual risks (documented, not hidden)
1. A presigned GET stays valid until expiry even if access is revoked meanwhile. Mitigation: ≤ 300 s cap, default 60 s, revocation checked on each *new* signature.
2. Presigned-PUT `content-length`/checksum enforcement by **Cloudflare R2 is unproven** (SDK output verified offline only). Mitigation: mandatory server-side verification before READY; unverified bytes are never served.
3. `reconcile()` examines READY objects in batches of `limit` per run, not a full scan each run.
4. Objects above the single-PUT threshold (default 1 GiB) migrate through the bounded multipart path; only objects above `maxObjectBytes` (default 5 GiB) remain `BLOCKED(EXCEEDS_MAX_OBJECT_BYTES)`. Not yet observed against real R2.
