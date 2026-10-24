# GitHub Actions evidence: run 40094315005 (Phase 2)

- Run: https://github.com/Xroga/xroga.com/actions/runs/40094315005
- Workflow: storage-phase1 (push to `claude/xroga-b15-phase2-20261024`; no secrets, no environment, read-only token)
- Source SHA: `865d492bac1d1c45e14cd2e15f1440bb5d0f990d` (`00-source.txt`: `dirty_tracked_files=0`)
- Result: success; strict runner `overall=PASS`.

| Step | Result |
|---|---|
| 01 typecheck | PASS |
| 02 Phase 1 unit and adapters | 176/176 |
| 02b 1 GiB+5 B large object (synthetic) | 1/1 |
| 03 real PostgreSQL SQL (Phase 1) | 25/25 |
| **02c Phase 2 workers, runtime, egress policy** | **189/189** (includes the POSIX orphan-sweep test that skips on Windows) |
| **03b Phase 2 worker leases on real PostgreSQL 16** | **15/15** |
| **03c Phase 2 real Chromium, sandbox ON (LOCAL class: a Linux GitHub runner, not a container, not OCI)** | **6/6** |
| **03d seccomp profile equals its derivation** | PASS |
| 04 S3 wire emulator (synthetic) | 7/7 |
| 05 real R2 | NOT_RUN by design (CI has no secrets) |
| 06 full backend suite | 3135 tests, 3114 pass, 5 fail: the same 5 baseline failures as pristine `main` (`evidence/baseline-failures.json`), 0 regressions |

History worth keeping: the first Phase 2 run (40093929218, source `6d08cdcf`) failed on 5 "real in-sandbox run" regressions. Cause: the CI step that installed Chromium
for the Phase 2 browser tests put it in Playwright's default location, which switched on an older test suite (`synthesis/inSandboxBrowser.integration.test.ts`) that
skips without a browser and expects the production image's `/ms-playwright` layout. No source regression: Chromium for Phase 2 now lives in a dedicated directory
that only step 03c sees (commit `865d492b`).

What this run does **not** prove: anything about OCI, ARM64, a container's sandbox, Fly, Cloud Run or a hosted database. The container sandbox proof is
`../../phase-2/evidence/browser-sandbox-docker-local-2026-10-24.json` (local Docker, amd64).
