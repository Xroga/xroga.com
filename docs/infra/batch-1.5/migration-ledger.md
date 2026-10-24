# Batch 1.5 migration ledger

Branches `claude/xroga-batch-1-5` (Phase 1) and `claude/xroga-b15-phase2-20261024` (Phase 2). Base `main` @ `80d1f417`. Batch 1 (Codex) is not modified or merged here.
Status vocabulary: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · LOCAL_TESTED · PROVIDER_VERIFIED · STAGING_VERIFIED · PRODUCTION_VERIFIED · BLOCKED. `IMPLEMENTED` ≠ production-ready.

| ID | Item | Status | Evidence |
|---|---|---|---|
| INFRA-001 | Current-state baseline | **IMPLEMENTED** (source-verified; live inventory BLOCKED) | `current-state.md`, `data-location-inventory.*`, `dependency-inventory.md`, `product-capability-baseline.md` |
| INFRA-002 | Canonical private R2 storage (Xroga Drive) | **LOCAL_TESTED** · R2 provider verification **BLOCKED** (suite written, never run) | `evidence/logs/results.json`; real Postgres (SQL) + synthetic stores |
| INFRA-003 | Resumable non-destructive migration (signed approvals) | **LOCAL_TESTED** · live run **NOT_STARTED (not authorised)** | `evidence/logs/results.json` |
| INFRA-004 | Managed credential custody | **SOURCE_READ** (audit and staged plan; nothing migrated) · custody **BLOCKED** (D1, D4) | `phase-2/INFRA-004-credential-audit.md` |
| INFRA-005 | API/runtime hardening and the browser worker image | **LOCAL_TESTED** (TLS, startup policy, readiness, safe logging, launch policy, egress proxy against a real Chromium) · **DOCKER_LOCAL_TESTED** (sandbox ON, amd64, not OCI) · OCI and ARM64 **NOT_RUN** | `phase-2/PHASE-2-CRITERIA.md`, `phase-2/INFRA-005-*.md` |
| INFRA-006 | Workers and scheduler (fenced leases, admission, recovery, worker artifacts) | **LOCAL_TESTED** · leases **DISPOSABLE_DATABASE_TESTED** (PostgreSQL 16, local and CI) · no worker caller exists yet (INFRA-007) | `phase-2/INFRA-006-workers-and-scheduler.md`, CI run 40094315005 |
| INFRA-007 … 008 | — | NOT_STARTED (Phase 3) | — |
| Phase 2 overall | | **NOT COMPLETE**: blocked on founder decisions D1 to D5 and on the OCI and ARM64 sandbox proof | `phase-2/PHASE-2-CRITERIA.md`, `phase-2/DECISIONS-FOR-FOUNDER.md` |

| Safety flag | State |
|---|---|
| `main` modified | no |
| Production data migrated / deleted | no |
| Production routing, DNS, credentials, entitlements changed | no |
| Paid resource created | no |
