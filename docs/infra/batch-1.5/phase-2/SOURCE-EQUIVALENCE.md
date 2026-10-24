# Source equivalence: which commits the CI result covers

A CI result is bound to the exact commit it ran on. A later commit may keep that result **only if nothing executable changed**. This file records the tested commits and how
equivalence of later documentation-only commits is established, so no result is quietly carried onto code it never ran against.

## The rule, as code
`bash scripts/verify-source-equivalence.sh <tested-sha> [later-ref]` exits 0 only if every path changed between the two commits is documentation, printing each path as `doc` or `code`.
"Under `docs/`" is not enough. CI executes some files that live there, and the script treats them as code:
- every file directly in `docs/infra/batch-1.5/evidence/` (the strict runner, the mutation script, the S3 emulator, the baselines);
- everything in `docs/infra/batch-1.5/rollback/` (the lease test applies the `.down.sql` files);
- anything under `docs/` that is not `.md`, `.txt`, `.log` or `.json` prose or recorded output (and `.json` or `.log` directly in the evidence directory counts as code).
Everything outside `docs/` is code. Exit 1 lists the executable files and means a new CI run is required. 6 tests pin this behaviour (documentation and recorded output equivalent;
a source file, the strict runner, a rollback SQL, a workflow or a script each not equivalent; one code file among many documents makes the whole range not equivalent;
an unknown commit is an error).

## Tested commits
| Tested commit | CI run | Result | Archived |
|---|---|---|---|
| `511f503a` | 40094731238 | `overall=PASS` (189 unit, 15 real PostgreSQL, 6 real Chromium; full suite 5 baseline failures, 0 regressions) | `../ci-evidence/run-40094315005/` (same code, run on `865d492b`) and the run page |
| `fdb5face` | 40097009444 | `overall=PASS` (207 unit, 15 real PostgreSQL, 6 real Chromium, seccomp derivation; full suite 3132 pass and the same 5 baseline failures, 0 regressions) | `../ci-evidence/run-40097009444/` |
| `e2a3fb49` | 40101667223 | **`overall=PASS`** (223 unit, 15 real PostgreSQL, 6 real Chromium, seccomp derivation; full suite 3148 pass and the same 5 baseline failures, 0 regressions) | `../ci-evidence/run-40101667223/` |
| **`df9b3e98`** | **40108091362** | **`overall=PASS`** (same suites; adds the standalone backend lock install step; full suite 3148 pass, same 5 baseline failures, 0 regressions) | `../ci-evidence/run-40108091362/` |

`df9b3e98` is the current CI-tested commit (`e2a3fb49` plus the regenerated `backend/package-lock.json` and one CI step). It supersedes `fdb5face`, which supersedes `511f503a`: the production-proxy sidecar, the runtime conformance probe, the image pins and the proxy credential and decision hooks were added after `fdb5face`, and each has tests that ran in run 40101667223.

## Equivalence checks performed
| Tested | Later | Command output |
|---|---|---|
| `511f503a` | `fbb81ccf` | `doc docs/infra/batch-1.5/phase-2/README.md` then `EQUIVALENT: fbb81ccf differs from 511f503a only in documentation`. Also identical git tree hashes for `backend`, `deploy`, `scripts`, `supabase`, `.github`, `package.json`, `package-lock.json` at both commits |
| `fdb5face` | `9ffbc069` | `EQUIVALENT: 9ffbc069 differs from fdb5face only in documentation` |
| `df9b3e98` | each later documentation commit on this branch | run `bash scripts/verify-source-equivalence.sh df9b3e98 HEAD` before relying on the CI result; the last check made is stated in the checkpoint report |

## What is not covered by CI at all
The Docker evidence (`browser-sandbox-docker-local-2026-10-24.json`, `browser-egress-isolation-docker-local-2026-10-24.json`) was produced locally from the container inputs recorded in each file
(the spec, seccomp profile and Dockerfile hashes); re-running them after any change under `deploy/browser-worker/` or `scripts/browser/` is required, and the hashes show whether the inputs changed.
