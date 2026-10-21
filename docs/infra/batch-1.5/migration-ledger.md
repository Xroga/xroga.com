# Batch 1.5 migration ledger

Branch `claude/xroga-batch-1-5`. Base `main` @ `80d1f417`. Batch 1 (Codex) is not modified or merged here.
Status vocabulary: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · LOCAL_TESTED · PROVIDER_VERIFIED · STAGING_VERIFIED · PRODUCTION_VERIFIED · BLOCKED. `IMPLEMENTED` ≠ production-ready.

| ID | Item | Status | Evidence |
|---|---|---|---|
| INFRA-001 | Current-state baseline | **IMPLEMENTED** (source-verified; live inventory BLOCKED) | `current-state.md`, `data-location-inventory.*`, `dependency-inventory.md`, `product-capability-baseline.md` |
| INFRA-002 | Canonical private R2 storage (Xroga Drive) | **LOCAL_TESTED** · provider verification **BLOCKED** | `evidence/` test logs; real Postgres (SQL) + synthetic store |
| INFRA-003 | Resumable non-destructive migration | **LOCAL_TESTED** · live run **NOT_STARTED (not authorised)** | `evidence/` |
| INFRA-004 … 008 | — | NOT_STARTED (Phase 2/3) | — |

| Safety flag | State |
|---|---|
| `main` modified | no |
| Production data migrated / deleted | no |
| Production routing, DNS, credentials, entitlements changed | no |
| Paid resource created | no |
