# Batch 3 certification: existing-project AI editor and maintainer

Development only. Nothing here is merged, deployed or applied to a hosted database. Development PASS is not production activation PASS. Format follows section 17 of the Batch 3 specification. Three phases were delivered: Phase 1 (connection, ZIP import, intelligence), Phase 2 (safe editing, real tests, delivery), Phase 3 (workspace UX, security, certification). Detail: `PHASE-1-COMPLETE.md`, `BATCH3-PHASE-2-COMPLETE.md`, `PHASE-2-BENCHMARK.md`, `TRACEABILITY.md`.

## 1. Plain-English user outcome

A signed-in customer can, behind two feature flags, open **Existing project** in the workspace, link a GitHub repository they can read (by GitHub's own id, at an exact commit) or import a ZIP, browse its files, build a code map, and search it. They describe a change in plain language. Xroga works on an isolated copy, runs the project's own tests, repairs from real failure output a bounded number of times, and shows the live progress, the real diff and the real test output. They can build a second and third change on top of the first. A verified change can become a **draft pull request** on a new review branch, or be exported as a patch or a ZIP. If the base branch moved onto the same files they get a structured conflict instead of an overwrite.

What it does **not** do yet, and says so on screen: run the Google isolated runtime for these changes (needs a canonical run attempt), show a live preview or browser verification, execute Go tests without a Go toolchain, apply database migrations, or run against a real model or real GitHub in this environment. Those changes end **Not test-verified**, never "verified".

## 2. Git/Xroga truth

```text
Xroga repository: https://github.com/Xroga/xroga.com
Starting branch and exact SHA: main at 5ada5db7526efb1e0a4e426dbf4feab3d538597f
Implementation branch: claude/batch3-existing-editor
Final code SHA: ec5090e3 (the commit before the documentation and register commits that follow it on the branch)
Current main/integration base SHA: 5ada5db7526efb1e0a4e426dbf4feab3d538597f (unchanged since the branch was cut)
Batch 2 dependency status: not integrated. Batches 1, 1.5 and 2 belong to Codex's release ownership (draft PRs #857 to #862); Batch 3 touches none of them
Review PR URL and state: https://github.com/Xroga/xroga.com/pull/865, DRAFT, not merged
Production/deployment status: none. Four additive migrations exist and are NOT applied anywhere; both feature flags are off by default
```

## 3. Reused systems and external repo decisions

| System / candidate | Verified existing implementation | Decision | Why | Evidence |
|---|---|---|---|---|
| Canonical execution | `executeCanonicalSandboxed` admits Google execution only for a canonical run attempt | **Reuse, not bypassed** | An existing-project change has no run attempt; manufacturing one would bypass the admission rule. In Google mode the port answers `EXECUTION_UNAVAILABLE` and the change ends unverified | `change/production.ts`, `testRunner.test.ts` |
| Repository tools / index | `RepositoryToolSession`, `repositoryTools`, redaction, sensitive paths | **Reuse and extend** | All source reads go through the bounded, redacting session; the code map is a new commit-keyed derived layer | `existingSource/service.ts`, `intelligence/` |
| Cline / software worker | `AgentSoftwareExecutor`, `SoftwareAgentToolHost`, `SoftwareAgentWorkspace`, `evaluateWritePolicy` | **Reuse** | `ExistingSourceToolHost` implements the contract; the production runner is the existing executor with the existing coding-model router | `change/toolHost.ts`, `change.test.ts` (scripted agents through the same contract). **Not run with a real model** |
| ast-grep | not in the production image | **Reference only** | Whole-file and exact search/replace edits were sufficient; an exact, unique, line-ending-preserving `applySearchReplace` exists | decision in `BATCH3-PHASE-2-COMPLETE.md` |
| Aider repo map | design reference | **Reference** | Passport and relevance follow the idea (signatures, graph, budget) without importing code | `intelligence/relevance.ts` |
| Tree-sitter / SCIP | not adopted | **Reject for now** | Dependency and image cost; structural, comment- and string-aware scanners for JS/TS, Python and Go behind one `analyzeFile` seam | `languageAdapters.test.ts` |
| GitHub branch/PR integration | `writeAtomically`, `makeAtomicWriteApi`, branch safety and authorization | **Reuse; one backward-compatible change** | Added an optional `draft` flag; existing writer tests unchanged and passing | `githubAtomicWrite.test.ts` 36 pass |
| Preview / Playwright | existing verifier | **Not connected** | The host exposes a typed `previewVerifier` hook that returns `not_checked` until connected | Golden E |

## 4. Changed-source inventory (no dependency or lockfile changes)

| Module | Purpose | Existing component extended | Evidence | Risk |
|---|---|---|---|---|
| `backend/src/existingSource/{service,store,provider,treeReader,types}.ts` | Link by immutable id, account and exact commit; verify; pinned reads; revocation, transfer | `RepositoryToolSession`, GitHub token | `service.test.ts`, `provider.test.ts`, `routes/existingSource.test.ts` | Medium: live GitHub unverified |
| `.../intelligence/` | Commit-keyed code map, relevance, passport | repository index ideas | `service.test.ts`, `polyglot.test.ts`, benchmark | Medium |
| `.../archive/` | Hardened ZIP reader, importer, archive port, writer | source port | `zipReader.test.ts`, `existingSourceArchive.test.ts` | Medium: hostile-input surface, 60-case fuzz |
| `.../change/` | Workspace, tool host, test planner/runner, orchestration, delivery, store | SoftwareAgent contract, sandbox port, atomic writer | `change.test.ts`, `testRunner.test.ts`, `delivery.test.ts`, `golden.test.ts` | High: executes tests, writes review branches |
| `backend/src/routes/existingSource.ts` | HTTP API (links, archive, index, search, locate, changes, deliver, export) | `authMiddleware` mount | three route test files | Medium |
| `services/integrations/githubAtomic{Write,Transport}.ts` | optional `draft` PR flag | atomic writer | existing 36 tests | Low |
| `supabase/migrations/20261027{00,01,02,03}0000_*.sql` | four additive service-role-only tables | schema catalog | schema-catalog + tenant audit | Medium until applied and tested on a real DB |
| `frontend/src/components/existing-source/*`, `lib/existingSourceApi.ts`, `DevWorkspacePanel.tsx`, store | Workspace tab, workbench, detail, client | existing workspace shell | `changeView.test.ts` (9), contract test (5) | Medium: not exercised in a live browser |

## 5. Golden acceptance tests A to L

All run as tests in `backend/src/existingSource/change/golden.test.ts` (19 tests, all pass on `ec5090e3`). Granularity is stated per case; **no case is an actual GitHub provider, an actual preview or a customer-approved deployment**, so none is VERIFIED at those granularities.

| Case | Fixture and base | Result | What actually ran | Granularity |
|---|---|---|---|---|
| A Existing app bug repair | booking app with auth, dashboard, routes, `node --test` | **PARTIAL** (VERIFIED at contract and real-process level; not a Next.js app; no browser/preview) | real `node --test` over the whole project; new test fails on the base (reproduced) and passes with the fix; auth, dashboard and routes untouched; diff and base commit recorded; draft PR against the git fake | real process + contract |
| B Large TS monorepo | 638-file generated monorepo | **PARTIAL** | targets, callers and tests found; every unrelated-package edit refused; follow-up at the same commit reads 0 blobs; ended `unverified` (no runtime). The slow-API-path variant makes **no** performance claim (no profiling infrastructure) | contract; numbers in section 6 |
| C Python API fix | stdlib handler project with `unittest` | **PARTIAL** (FastAPI and pytest not installed here) | real `python -m unittest`: 404 instead of crash, regression test fails before and passes after | real process |
| D Go CLI feature | Go module with tests | **NOT RUN** (no Go toolchain here) | package selection, `go test` plan, and the honest `unavailable`/`unverified` outcome when the runtime lacks `go` | contract |
| E Frontend visual fix | static site, broken mobile nav | **BLOCKED** | minimal CSS diff only; the change is never `verified` because no browser or viewport verification ran | not run |
| F Revision race | remote moves between plan and write | **VERIFIED (contract)** | overlapping edit: structured conflict, nothing written, protected base untouched; non-overlapping: rebased, receipt `verified:false` with retest note | contract |
| G Account and PR lifecycle | two accounts, look-alike repos, one read-only, archived repo | **VERIFIED (contract); live GitHub BLOCKED** | read-only look-alike never reaches the write transport; correct repo written; idempotent retry; transfer and archive stop new work | contract |
| H Database change in imported app | CRM-style repo with migrations | **BLOCKED / NOT RUN** | only: a migration file is flagged "never applied by Xroga". No disposable database, RLS tests, data-preservation or CSV-injection checks were run | not run |
| I Repeated follow-ups | three stacked instructions | **VERIFIED (real process + contract)** | three verified changes, cumulative edits, three separate saved revisions, one project identity, no lost instruction, refusal to stack across a moved commit or across owners | real process |
| J Security / injection | hostile README and AGENTS, `.env` canary, symlink, untrusted test script, cross-tenant | **VERIFIED (contract)** | an agent that obeys every hostile instruction still cannot read or write credentials, follow the symlink, run shell, curl, push or install; 8 durable denied receipts; canary in no record; no `.env` or symlink in any checkout; installs skip scripts, tests have no network; other tenant denied | contract |
| K No supported runtime | Rust project | **VERIFIED (contract)** | proposes a diff, validation `unsupported`, change `unverified`, delivery refused without an explicit acknowledgement, PR body says "Not test-verified" | contract |
| L Recovery and cancellation | interrupt, resume, cancel, retry | **VERIFIED (real process + contract)** | interrupted run resumes from saved work; every isolated checkout directory removed; retried delivery makes no second PR; an interrupted change whose base moved is refused, not restored over newer code | real process |

## 6. Performance and repository-intelligence evaluation

Measured on the generated 638-file monorepo with an in-memory provider (counts exact, timings CPU only; full method and caveats in `PHASE-2-BENCHMARK.md`; raw numbers in `phase2-benchmark.json`).

| Metric | Before | After | Notes |
|---|---|---|---|
| GitHub reads, second request at one commit | 638 | **0** | map reused |
| GitHub reads after a one-file commit | 638 | **3** | 631 rows reused, 1 re-analysed |
| Model context per request | 1,248 tokens of whole files | 467 (593 with target bodies) | small fixture files; the passport does not grow with file size |
| Target location | 2 of 4 tasks | **4 of 4** | precision 0.75 vs 0.06 |
| Unrelated files read per request | 633 | 0 | |
| Unrelated files modified | n/a | 0 in every Golden case | write policy refuses out-of-scope paths |
| Stale detection | n/a | branch advance, force-push, parser change, partial tree, byte budget, overlay: all tested | stale map never served |

Not measured: a real third-party repository, real network latency, slow-API-path profiling.

## 7. Security and negative tests

Verified at contract level (in-memory providers, real HTTP routes): cross-tenant denial on every route; revoked account, removed connection, lost access, transfer and account change stop reads and delivery; stale base and moved commit refused; conflict and rebase; hostile source text and agent obedience; path, symlink and ZIP boundaries (traversal, bomb, ZIP64, encrypted, duplicate, 60-case fuzz); protected base never written and never force-pushed; credentials never fetched, checked out, stored or delivered; secrets redacted from test output and PR text; idempotent delivery and lost-response adoption; concurrent push is a conflict; provider outage, model outage, exhausted budget and an evidence-store failure never read as success; cancellation, interruption, resume and checkout cleanup; per-owner concurrency limit.

Not verified: the real Google sandbox's network and resource enforcement, real GitHub behaviour, real databases (all stores are exercised in memory), browser security of the UI.

## 8. Provider receipts / external status

```text
Actual authorized GitHub account/repository tested: NONE (no authorised disposable account)
Actual provider commit SHA and review branch: NONE
Actual provider PR URL: NONE
Real preview test result: NONE (preview not connected to changes)
Real Supabase/Vercel operation: NONE; no migration was applied anywhere
Real model (Cline) run: NONE (no provider spend authorised)
Actions deliberately NOT executed: merge, deploy, production migration, billable infrastructure, DNS or credential changes, any write to a real customer repository
Owner/permission-dependent remaining tests: live GitHub link/read/branch/draft-PR/idempotent-retry; Google isolated execution with a canonical run attempt; real-model change; preview and browser checks; Go tests; disposable-database migration and RLS checks; real-repository performance
```

## 9. Command and test log (source `ec5090e3`, Windows, Node v24.18.0; CI uses Node 22.21.1)

| Test / command | Result | Evidence |
|---|---|---|
| `tsc --noEmit` backend and frontend | PASS | clean |
| Backend full suite (`node --import tsx --test "src/**/*.test.ts"`, `NODE_ENV=test`) | **PASS: 3,877 tests, 3,863 pass, 0 fail, 14 skipped (registered)** | 303 s |
| Frontend full suite (`frontend/src/**/*.test.ts`) | **PASS: 1,196 tests, 0 fail** | 79 s |
| Batch 3 backend tests (`src/existingSource/**`, `src/routes/existingSource*.test.ts`) | PASS: 159 | includes 19 Golden and 8 test-planner cases |
| Batch 3 frontend tests (view, contract) | PASS: 14 | render tests via `react-dom/server`, not a browser |
| `githubAtomicWrite` and `githubAtomicTransport` tests after the `draft` flag | PASS: 36 | no existing test changed |
| ESLint on the new frontend files | PASS (0 errors, 0 warnings) | |
| Governance: tenant audit, schema catalog (20 current migration additions pinned), mission-check, inventory, phase-two register, requirements ledger, skip governance | PASS | regenerated once after the code commit |
| `npm run verify:baseline`, `next build`, Playwright browser suites, disposable-Supabase full-history run | **NOT RUN locally** | Node 24 vs repo Node 22; CI runs them on the PR |

## 10. Rollback and operational risk

- **Source:** Batch 3 is one draft PR; abandon or close it. Both feature flags are off by default, so the routes answer 503 and the tab is absent. No existing behaviour changed except an optional `draft` field in the atomic writer.
- **Data:** four additive tables (`existing_source_projects`, `_indexes`, `_archives`, `_changes`), service-role only. If a migration is applied and later reverted, drop them in reverse order; nothing else references them. The archive migration also relaxes one check constraint (`origin_kind`).
- **PRs created by delivery:** drafts on `xroga/change-*` branches; close the PR and delete the branch. A Git revert of this code does not undo a branch or PR already created on GitHub.
- **Stale index and archives:** deleted with their binding on unlink, access loss or connection removal; finished changes now expire after 90 days or beyond the newest 50 per project (section 11).
- **Sandbox cleanup:** owned by the execution runtime; the local test runner removes its temp directories (asserted in Golden L). Google runtime cleanup is not exercised here.
- **Revocation:** disconnecting GitHub marks linked repositories `access_lost` and purges their maps and changes; imported ZIPs are unaffected.

## 11. Resume integration (2026-10-29): what changed since the freeze

Founder authorised development to resume; production activation stays paused. Source head at the time of writing: `2938df7f` on `claude/batch3-existing-editor` (main merged at `55edf4b6`). Draft PR #865 stays a draft. CI on that head: unit, integrated-candidate, authenticated-browser, deterministic-golden, disposable-policy-database, structured-mission-policy, static-contracts and build all PASS.

| Item | State | Evidence and limits |
|---|---|---|
| Reconcile with current main | PASS | 15 conflicts resolved: generated registers regenerated; schema catalog and migration additions keep both sides (pinned count 25); workspace tab union keeps `project` and `existing`; caller reviews merged with Batch 3 stores and rebound. No competing scheduler or runtime was added. |
| Canonical Google execution (Priority B) | **PASS with fakes; NOT run live** | A change is queued as an ordinary canonical delivery (`existingSourceChangeId` in the queued input, validated as an id at enqueue and claim) and executed in the existing canonical Job under the claim's admitted attempt. Commands run only through the existing canonical sandbox seam; before each, the run's own attempt-bound execution state is written with exactly the working files. The Job refuses a change not queued for its run and another owner's change; cancellation follows the canonical run; a change that cannot be queued ends with the reason. Tests: `canonical.test.ts`, `googleDeliveryStore.test.ts`, `existingSourceChanges.test.ts`. No real Cloud Run Job or Google sandbox run has happened. |
| Preview and browser verification (Priority C) | **PASS with fakes; NOT run live** | A styles or markup change is verified only when a browser observed the page. No verifier, a check that did not run or an error is `unverified` with the reason; a broken page fails with repair evidence; a project a browser cannot serve owes none. The workbench shows the result. Golden E now has a connected-verifier path (fake) in `canonical.test.ts`; it has not been run in a real browser. |
| Retention (Priority E) | PASS | Finished changes are removed after 90 days or beyond the newest 50 per linked project when another change is requested; never an unfinished change, one a running change builds on, or another owner's. The store delete is recorded in the caller review. |
| Fresh install of all 157 migrations and database access rules (Priority D, database part) | **PASS on a LOCAL Supabase stack** | `npx supabase start` applied every migration including the four Batch 3 tables with no error. All four tables have RLS enabled and no grant or policy for anon, authenticated or PUBLIC. Over the live local API: anon read 401; a signed-in user read and insert 403; service role 200, on every table. A free hosted project could not be created (the plan allows 2 active projects), so nothing hosted was used or changed. |
| Persistence against the real Supabase stores (Priority D, database part) | **PASS on a LOCAL Supabase stack** | `scripts/batch3/local-supabase-check.ts` (refuses any non-loopback URL): link writes an owned row; another user sees nothing and cannot open the binding; a change ran with the project's own Node tests in a real process and persisted as verified; another user cannot read it; a follow-up is stored as a child; retention removed the older finished change; unlink purged change, index and archive rows. 7 checks. GitHub, the coding model and the sandbox are in-memory/scripted in this check. |
| Real GitHub (Priority D, GitHub part) | **PASS on one disposable repository** | `scripts/batch3/live-github-check.ts` against Xroga/blogsite (public, 12 KB, static): linked at an exact commit; real code map built; a change produced exactly `index.html` and `styles.css` and ended `unverified` (no project tests, no browser check ran, correctly not called verified); a real **draft** pull request was opened from `xroga/change-*` changing only those two files with the base branch untouched; delivering again created no second pull request; the PR and branch were then closed and deleted and the repository unlinked. Every GitHub write went through a guard that allows writes only under `/repos/Xroga/blogsite/`. The model was scripted. **Defect found and fixed here:** the write policy authorised only directories, so a repository with files at its root and in a subdirectory refused the root files it had located (regression test in `canonical.test.ts`). |
| Real coding model, Google sandbox, real-browser check, Go tests, real-repository performance (Priority D) | **BLOCKED** | A real model run needs a provider key and a small budget approval; the Google sandbox needs a deployed Cloud Run Job (not being deployed); the browser check needs the Existing project tab running against a live backend. Nothing was faked as live. |
| Real-browser accessibility and responsive check of the Existing project tab | **BLOCKED** | Same staging prerequisites; CI's authenticated-browser job passes but does not exercise this tab with a live backend. |

Unchanged and still true: no production activation, no production migration, flags off. Percentages are not claimed; see the item table. The honest state is: development delivered for all three phases, integration with current main complete, canonical execution and browser verification implemented and tested with fakes, live-provider certification incomplete.
