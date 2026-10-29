# Batch 3, Phase 3 (of three): user experience, security and final certification

Covers Work Packages F and G and the cross-cutting requirements. Full certification, Golden A to L matrix, performance, receipts and command log: `CERTIFICATION.md`.

## The fifteen Phase 3 items

| # | Item | State | Where / evidence |
|---|---|---|---|
| 1 | Existing-project selection inside the same chat | PARTIAL | an **Existing project** tab in the existing workspace panel (`DevWorkspacePanel`), beside Files, Code, Changes, Terminal, Preview and Deploy; the standalone page remains. Chat prompts are not intercepted: the person picks the repository or ZIP in the tab, then describes the change there. Hidden unless `NEXT_PUBLIC_XROGA_EXISTING_SOURCE=1` |
| 2 | Source navigation and code inspection | VERIFIED (contract) | breadcrumb file browser, redacted file reader, code map search and "where would this change go", per-file "used by / covered by" |
| 3 | Progress from durable execution events | VERIFIED | the screen renders `events` recorded by the server; it polls (1.5 s, backing off to 6 s) and resumes after a refresh; a lost connection is shown, not hidden |
| 4 | Changed-file lists and meaningful diffs | VERIFIED | per-revision file table (+/-, warnings), colour-coded unified diff classified by first character and escaped, so file content can never pose as a header or markup |
| 5 | Real test logs, errors and verification status | VERIFIED | bounded, redacted evidence per revision; status text states exactly what the tests showed (passed, failed, no runner, no runtime, timeout) |
| 6 | Working web Preview where supported | **NOT DONE** | typed hook only; Golden E is BLOCKED. Nothing on screen implies a preview ran |
| 7 | API/CLI evidence for non-visual projects | PARTIAL | test stages and output are the evidence; no HTTP or CLI probing beyond the project's own tests |
| 8 | Multi-turn continuation in the same project | VERIFIED | `continueFrom` stacks a change on a finished one (same commit, same owner); revisions stay separate; "Build on the change shown below" in the workbench |
| 9 | Revisions, branches and PR status | VERIFIED (contract) | revision tabs after a repair; delivery receipt with branch, commit, PR link, rebase and verification flags |
| 10 | Cancellation, retry, refresh, recovery | VERIFIED | cancel, resume of an interrupted change, new change as retry, history survives refresh |
| 11 | Approval handling and error states | VERIFIED | an unverified change needs an explicit acknowledgement before a draft PR; each disabled action says why; conflicts list each file and reason; every failure code has a plain message; no `confirm()` dialogs |
| 12 | Responsive, accessible UI consistent with Xroga | **NOT VERIFIED IN A BROWSER** | semantic markup, labels, `role="status"`/`aria-live`, `aria-pressed`, keyboard-reachable controls, existing tokens and classes; verified only by render tests and lint, not on a device or with a screen reader |
| 13 | Tenant isolation, secret protection, prompt-injection defence | VERIFIED (contract) | Golden J and the route tests |
| 14 | Revocation, stale-source, concurrency protection | VERIFIED (contract) | Golden F, G, L; per-owner limit of two running changes; indexing limit |
| 15 | Cost, timeout, storage and cleanup limits | PARTIAL | upload 10 MB, kept text 8 MB, 5,000 entries, bomb ratio, 40 changed files, 1 MB per file, 3 attempts (max 5), 240 s per test stage, snapshot caps, 2 concurrent changes, checkout cleanup. **No retention policy** for old changes yet |

## Defects found by the Phase 3 acceptance tests and fixed

- A change that was created but not yet picked up could be reported as `interrupted` (and saved that way) if it was read in that moment. Now only a long-stale queued change is.
- The scope allowlist blocked a legitimate new regression test in a directory with no nearby code and a new database migration. Tests and source-controlled migration directories are now always writable (never applied by Xroga).
- A missing toolchain (exit 127, "command not found") read as a failing test. It is now `unavailable`: not run, never pass, never fail.
- Provider errors during delivery surfaced as raw errors; they are now `PROVIDER_UNAVAILABLE`, with the retry path that adopts an already-created branch.
- Durable writes could in principle land out of order; they are now serialised per run.
- Instruction text could carry a pasted secret into a PR title and body; it is now redacted.
- Refusals left no trace; they are now `tool.denied` events (path and reason only, never content).

## Honest limits

No live browser session was run against a running backend; no real model, GitHub, Google sandbox or database was exercised. The product's behaviour in those is unproven and listed as BLOCKED in `TRACEABILITY.md`.
