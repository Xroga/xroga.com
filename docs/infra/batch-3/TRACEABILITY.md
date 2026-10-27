# Batch 3 master traceability matrix

Maps every requirement of `Xroga_OS_Batch_3_Merged_Complete_Claude_Code_Command.md` to its implementation and evidence. Updated at every phase; a row is never dropped, only moved from NOT STARTED to a verified state. Evidence granularity is always stated: **contract** (in-memory fakes, real HTTP), **real runtime** (isolated sandbox), **provider** (actual GitHub), **preview**, **deployment**. A contract test never promotes a provider capability to VERIFIED.

Status: VERIFIED (at the stated granularity) / PARTIAL / BLOCKED (needs permission or infrastructure) / NOT STARTED.

> **Phase numbering.** The founder consolidated Batch 3 into three phases. Phase columns below still use the earlier numbering: earlier 1 and 2 = **Phase 1** (Work Packages A, B, C), earlier 3 and 4 = **Phase 2** (D, E), earlier 5 and 6 = **Phase 3** (F, G and certification).

## The ten customer capabilities

| # | Capability | Phase | Status | Evidence |
|---|---|---|---|---|
| 1 | Connect existing GitHub projects (and permitted ZIP import) | 1 | VERIFIED (contract); live GitHub BLOCKED | `existingSource/service.test.ts`, `routes/existingSource.test.ts`, `archive/zipReader.test.ts`, `routes/existingSourceArchive.test.ts`; `PHASE-1-STATUS.md`, `PHASE-1-COMPLETE.md` |
| 2 | Understand a codebase intelligently | 2 | VERIFIED (generated monorepo, 4 tasks); no real third-party repo | `intelligence/service.test.ts`, `polyglot.test.ts`; `PHASE-2-STATUS.md`, `PHASE-2-BENCHMARK.md` |
| 3 | Keep understanding incremental | 2 | VERIFIED (measured: 0 reads same commit, 3 reads after a one-file commit) | `PHASE-2-BENCHMARK.md`, `intelligence/service.test.ts` |
| 4 | Diagnose and fix bugs | 3 | VERIFIED for Node (real test run, reproduction check); Python executed; model run not done | `change/change.test.ts`, `BATCH3-PHASE-2-COMPLETE.md` |
| 5 | Add features to existing software | 3 | PARTIAL: same engine and limits; no dedicated feature scenario or real-model run | `change/change.test.ts` |
| 6 | Edit precisely without damage | 3 | VERIFIED (contract): immutable base, base-hash per file, scope policy, CRLF and rewrite warnings, credentials excluded | `change/change.test.ts` |
| 7 | Work across languages | 2, 3 | PARTIAL: analysis for JS/TS, Python, Go; real test execution for Node and Python; Go planned only (no toolchain here) | `languageAdapters.test.ts`, `polyglot.test.ts` |
| 8 | Reuse previews, tests and repair | 3, 5 | NOT STARTED | |
| 9 | Deliver a GitHub review PR | 4 | VERIFIED against a faithful git host; live GitHub BLOCKED | `change/delivery.test.ts`, `routes/existingSourceChanges.test.ts` |
| 10 | Preserve revisions and recover | 3, 4 | VERIFIED in memory (revisions, diffs, evidence, interrupted/resume, cancel); real database BLOCKED | `change/change.test.ts` |

## Work packages

| WP | Scope | Phase | Status |
|---|---|---|---|
| A | Current-state integration map | 1 | VERIFIED: owners located (`githubAuth`, `routes/github.ts`, `repositoryTools`, `githubTreeSnapshot`, `save_owned_project_atomic`); gaps: no immutable repository id, no commit binding, truncated trees refused instead of completed |
| B | Source binding and exact-commit access | 1 | VERIFIED (contract); archive import NOT BUILT (optional path); live GitHub BLOCKED |
| C | Incremental intelligence | 2 | VERIFIED (development level) |
| D | Safe modify, test, repair | 3 | PARTIAL: verified except real-model run and Google execution (needs a canonical run attempt) |
| E | GitHub review delivery | 4 | VERIFIED against a faithful git host; live GitHub BLOCKED |
| F | Integrated UX | 5 | PARTIAL: link, browse and read screen exists (Phase 1); source navigator, diffs, tests, PR status in Phase 5 |
| G | Certification | 6 | NOT STARTED |

## Definition of done (section 16)

| Item | Status |
|---|---|
| Connect/select an authorised EXISTING GitHub repository | VERIFIED (contract) |
| Stable provider repo/account/installation/branch/base SHA bound to the project | VERIFIED (contract); installation id recorded null (OAuth user token, no App installation) |
| Reads exact-commit, bounded, tenant-authorised, tolerant of pagination and truncation | VERIFIED (contract) |
| Safe ZIP import (traversal, symlink, encrypted, bomb, ZIP64, duplicate, oversize, credentials never kept, tenant-isolated, deleted on unlink) | VERIFIED (contract); the stored archive is text-only and capped at 8 MB |
| Existing source never silently overwritten by a scaffold | VERIFIED for Phase 1 (read-only; no write path exists) |
| Code intelligence, index reuse, large-repo measurements | VERIFIED on a generated 638-file monorepo; real-repository measurement not done |
| Project architecture/auth/dependencies preserved; real repro; isolated workspace; patch validation; test selection; previews; repair | VERIFIED except previews (not connected) and Google execution |
| Changed-file set and diffs persisted; follow-ups on the same project | Persisted VERIFIED; follow-up UX in Phase 3 |
| GitHub writes with exact authority, divergence, idempotency, PR receipt | VERIFIED against a faithful git host |
| Cross-tenant, prompt injection, traversal, secrets, unsafe shell: negatively tested | PARTIAL: cross-tenant, traversal, sensitive files, malicious README covered for Phase 1 surfaces; shell/sandbox and egress in Phases 3 to 6 |
| No production merge, SQL, billable provisioning, domain edit or deployment | HOLDS: none performed |

## Golden tests A to L

| Case | Phase | Status |
|---|---|---|
| A Existing Next.js bug repair | 6 | NOT STARTED |
| B Large TypeScript monorepo and incremental intelligence | 2, 6 | PARTIAL: map, ground truth, reuse and incremental measured in Phase 2; final certification in Phase 6 |
| C Python API correction | 6 | NOT STARTED |
| D Go CLI feature | 6 | NOT STARTED |
| E Existing frontend visual repair | 6 | NOT STARTED |
| F Remote-source revision race | 4, 6 | PARTIAL: conflict, rebase, protected base and lost-response adoption verified against the git fake; final certification in Phase 3 |
| G GitHub account and PR lifecycle | 4, 6 | NOT STARTED (account/ownership parts exercised in Phase 1 contract tests) |
| H Database migration and CRM feature | 6 | NOT STARTED |
| I Repeated follow-up edits in one project | 5, 6 | NOT STARTED |
| J Cross-tenant security and prompt injection | 6 | PARTIAL (read-side parts exercised in Phase 1) |
| K Unsupported test-runtime honesty | 3, 6 | NOT STARTED |
| L Durable recovery and cancellation | 3, 6 | NOT STARTED |

## Negative and adversarial matrix (section 14)

| Scenario | Status | Evidence |
|---|---|---|
| Tenant B guesses Tenant A's repo/project id | VERIFIED (contract) for link, verify, read, directory, refresh, unlink | `existingSource.test.ts`, `service.test.ts` |
| Valid GitHub identity but repo not in allowlist | VERIFIED (contract): no tree, commit or blob read | `service.test.ts` |
| Repo renamed/transferred after import | VERIFIED (contract) | `service.test.ts` |
| GitHub token revoked mid-run | VERIFIED (contract): reads stop, no stale fallback | `service.test.ts` |
| Branch advances after indexing | VERIFIED (contract): reads stay pinned; a map for another commit is never served; new commit reuses rows by blob | `service.test.ts`, `intelligence/service.test.ts` |
| Dirty overlay modifies indexed symbol | VERIFIED for the map (overlay re-analysed, stored map untouched, deletions cannot reappear); workspace use in Phase 3 | `intelligence/service.test.ts` |
| Git Trees `truncated=true` | VERIFIED (contract): bounded subtree walk or explicit partial | `provider.test.ts`, `service.test.ts` |
| Huge binary/LFS asset in search | VERIFIED (contract): binary, LFS pointer and over-size files excluded from the map and never fetched | `intelligence/service.test.ts` |
| Symlink escapes repository root | VERIFIED (contract) for reads; workspace writes in Phase 3 | `service.test.ts` |
| Malicious repository instruction asks to leak secrets | VERIFIED for an agent that OBEYS it: every credential read, write, shell and exfiltration attempt is refused | `change/change.test.ts` |
| npm postinstall network/metadata access | PARTIAL: installs run with `--ignore-scripts` and registry-only network, tests with none; the Google sandbox enforcement itself is not exercised here | `testRunner.test.ts` |
| Patch applies to changed version of file | VERIFIED: delivery compares base and remote blob per changed path and returns a structured conflict | `change/delivery.test.ts` |
| Concurrent pushes, lost PR response, missing PR permission, force-push, cancellation, crashes, failing tests, provider timeout, unapproved migration/deploy, public-PR leak, evidence-store failure, budget exhaustion, parser crash (map: malformed files and hostile input VERIFIED in Phase 2; force-push of the base VERIFIED for the map), protected branch, ZIP traversal/bomb (VERIFIED, `zipReader.test.ts`), model outage | NOT STARTED (Phases 2 to 6) | |
