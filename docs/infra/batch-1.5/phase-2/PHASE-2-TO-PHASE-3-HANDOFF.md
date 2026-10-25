# Batch 1.5: Phase 2 to Phase 3 handoff (2026-10-24)

**Phase 2 verdict: `BATCH_1_5_PHASE_2_ACCEPTED`** (`PHASE-2-ACCEPTANCE-REPORT.md`).

## Where things are
| Item | State |
|---|---|
| Phase 2 code | branch `claude/xroga-b15-phase2-20261024`. Executable source CI-tested at `58a8b414` (run 40111756070: full backend suite 0 failures) and `8037e1d4` (run 40116355018); later commits are host-verification tooling and evidence only |
| `main` | contains the Batch 1 TenantContext core (#847, `404bfa30`, deployed). The rest of Phase 2 is **not** on `main` |
| Cloud platform | Google Cloud (OCI dropped). Project `project-c40d4821-e647-4fa2-92d`, free-trial credit. No VM, disk or verification network left running |
| Browser worker host | Compute Engine with Docker (the reviewed spec needs custom seccomp, capability limits and an internal network with the egress proxy as sole peer, which Cloud Run cannot express). AMD64 and native ARM64 (T2A) both verified |

## Merging Phase 2 into `main` (founder decision, not done)
A merge to `main` deploys the API through `fly-deploy.yml` and applies the branch's two migrations through `supabase-migrate.yml` (`20261024000000_worker_task_leases.sql` and the Phase 1 storage
migration, both additive with `.down.sql`). Phase 2's worker code is not wired into a production entry point, so the runtime effect is the startup policy, readiness evaluator and safe logging.
Recommended: open the PR, let its checks run, then merge in a quiet window and verify `/health`, `/ready` and a signed-in request.

## Phase 3 (INFRA-007/008) should start from
- the BrowserWorker components listed in the acceptance report, section E (handler on `ExecutionScheduler`, fenced leases, admission, recovery, launch policy, production egress proxy and sidecar, image pins);
- `scripts/browser/gce-verification-host.sh`, `prepare-host.sh`, `collect-host-evidence.sh`, `evaluate-host-evidence.mjs` to re-prove any new host shape;
- the canonical `TenantContext` already on `main`; Codex's remaining Batch 1 stack must merge on top (its `auth.ts` overlaps; take Codex's version).

## Open items that are not Phase 2 criteria
| Item | Owner | Next step |
|---|---|---|
| Codex Batch 1 custody gate (#845/#846) | Codex, founder | must not deploy until a KMS provider exists on the production host; see `BATCH1-MERGE-SEQUENCE.md` |
| Batch 1 private R2 configuration | Codex, founder | production needs `CLOUDFLARE_R2_PRIVATE_BUCKET`, `_ACCESS_KEY`, `_SECRET_KEY`, `_METADATA_READ_TOKEN`, `_ACCOUNT_ID` when Batch 1 deploys |
| Database backups | founder | activation per `docs/infra/db-backup/RUNBOOK.md` on branch `claude/b15-db-backup`: key generation, bucket token, environment secrets, first manual backup and restore drill, then the schedule variable |
| Security follow-up on the contained Worker | founder | reviewed privately; consider retiring the legacy HS256 JWT secret in Supabase |
| `unit-tests` red on `main` (46 frontend failures) | product team | pre-existing; unrelated to Batch 1.5 |

## Independence
Nothing deployed or verified here depends on Claude Code, Codex, a developer session or a personal AI subscription. Backups, host verification, CI and deployment run from Xroga's own
repository, documented scripts and its own cloud accounts.
