# Batch 1.5 Phase 2 status (2026-10-24)

Branch `claude/xroga-b15-phase2-20261024` (continues `claude/xroga-batch-1-5`). **Phase 2 is not complete.** What remains is reduced to three criteria that one run on the
target host closes, and three decisions: `PHASE-2-REMAINING.md`. Every criterion with its evidence: `PHASE-2-CRITERIA.md`. Nothing here touched `main`, production, a hosted
database, a credential, IAM, or a paid resource. Cost: $0.

| Item | State | Evidence class | Where |
|---|---|---|---|
| Architecture reconciliation, CI/migration boundary | decided as provider-neutral; direction updated (Fly + Google KMS via OIDC); D1 to D9 open | SOURCE_READ | `ARCHITECTURE-COMPATIBILITY-DECISION.md`, `BOUNDARY-CHECK.md`, `DECISIONS-FOR-FOUNDER.md` |
| INFRA-004 credential custody | audit and staged plan, nothing migrated; W1 to W9, F1 to F8 | SOURCE_READ + read-only counts | `INFRA-004-credential-audit.md` |
| INFRA-005 database TLS | done | LOCAL_TESTED + live handshake | `INFRA-005-database-tls.md` |
| INFRA-005 startup, readiness, safe logging, browser worker image | done locally | LOCAL_TESTED; sandbox DOCKER_LOCAL_TESTED (amd64, not OCI) | `INFRA-005-runtime-and-browser-worker.md` |
| INFRA-006 workers and scheduler | done locally; no worker caller exists yet (INFRA-007) | LOCAL_TESTED; leases DISPOSABLE_DATABASE_TESTED | `INFRA-006-workers-and-scheduler.md` |
| Browser container network isolation (bypass beyond the proxy) | proven on real containers, with an open-network control | DOCKER_LOCAL_TESTED | `INFRA-005-runtime-and-browser-worker.md`, `evidence/browser-egress-isolation-docker-local-2026-10-24.json` |
| OCI and ARM64 sandbox and isolation proof | procedure and host-facts script ready; **not run** (no authorized host; none created) | n/a | `OCI-SANDBOX-VERIFICATION.md`, `deploy/browser-worker/host-facts.sh` |
| Pull-request safety of the migration workflow | PR path is offline, no environment, no secret; one other PR workflow (`command3`) uses unconfirmed `E2E_*` secrets | LOCAL_TESTED | `BOUNDARY-CHECK.md`, `PHASE-2-REMAINING.md` section D |
| Managed custody dependency | reconciled to Batch 1's actual environment contract; round trip injectable; no vault or provider written | LOCAL_TESTED | `PHASE-2-REMAINING.md` section C |
| Source equivalence for documentation-only commits | classifier script and tests; record of the tested chain | LOCAL_TESTED | `SOURCE-EQUIVALENCE.md` |
| Rollback | written | n/a | `ROLLBACK.md` |

## Verification, source-bound
- CI on the final head `511f503a`: run 40094731238, `overall=PASS`, identical numbers to the run below. CI on `865d492b`: run 40094315005 (archived): `overall=PASS` (Phase 2 steps: 189/189, 15/15 real PostgreSQL, 6/6 real Chromium, seccomp derivation; full suite 3114 pass, 5 baseline failures, 0 regressions). `../ci-evidence/run-40094315005/`
- Mutation checks: 83 injected defects across TLS, leases, job contract, egress proxy, process trees, browser handler, admission, recovery, startup, readiness, logging, launch policy, container spec and the lease SQL: **83 caught, 0 survived** (`evidence/logs/mutation-checks-phase2-final.log`, run on the committed source `6d08cdcf` plus the documentation-only and CI-only commits after it). Two mutants initially survived and exposed a dead guard (removed) and a test that passed for the wrong reason (strengthened).
- Real-provider and container evidence: `evidence/real-tls-handshake-2026-10-24.json` (live Supabase pooler, TLS trust only); `evidence/browser-sandbox-docker-local-2026-10-24.json` (hardened container `SANDBOX_ON`, default-seccomp control `BLOCKED`).
- Local: 209 Phase 2 tests pass (1 POSIX-only skip) and 201 Phase 1 storage tests pass against a disposable PostgreSQL 16.

## Not done
No STAGING or PRODUCTION verification of anything. No OCI or ARM64 sandbox run. No real custody provider. No worker caller (Stagehand and the real browser path are INFRA-007). No pull request: it would run the migration gate against production credentials (`BOUNDARY-CHECK.md`).
