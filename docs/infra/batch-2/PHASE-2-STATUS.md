# Batch 2, Phase 2: Browser QA and repair, same-project development, source export and GitHub

Builds on the Phase 1 checkpoint `f7f8bece697c1728d98bc94962f2ffa8901734c7` (PR #857). Branch `claude/batch2-phase2-qa-iteration-export`.
Scope: Milestones D, E and F of the Batch 2 specification. Nothing here is deployed, applied to a database, enabled in production, or merged. No GitHub repository was created and no external account was touched.

Status vocabulary: IMPLEMENTED, LOCALLY VERIFIED, PROVIDER VERIFIED, PRODUCTION RELEASED, BLOCKED.

## Milestone D: browser QA and automatic repair

| Requirement | Status | Evidence |
|---|---|---|
| Derive functional tests from the product requirements and source | LOCALLY VERIFIED | `qa/plan.ts`: routes, responsive layout, in-page and internal links, forms (validation and feedback), sign-in and protected pages, persistence, compiled acceptance criteria. Every check names what it was derived from. Criteria with no deterministic check are recorded as not checked, never passed |
| Execute Playwright against the running application | LOCALLY VERIFIED against fixture applications; NOT VERIFIED against a generated app on the Google runtime | `qa/qa.browser.integration.test.ts`: real Chromium against a real local HTTP server. The same driver and runner are wired to the live-preview coordinator in `phase2Bridge.ts` |
| Navigation, forms, authentication, responsive, persistence | LOCALLY VERIFIED except persistence | Persistence (and anything needing a real database) is planned and reported `pending`; it is not claimed. No disposable test database is available in a QA run yet |
| Screenshots, errors, failed assertions, reproducible evidence | LOCALLY VERIFIED | Failure evidence: failed step, message, URL, HTTP status, uncaught page errors, failed requests, bounded screenshot. Stored in `builder_verifications` against the revision tested |
| Send verified defects through SoftwareAgent/Cline | IMPLEMENTED; the live agent run is NOT VERIFIED | `qa/repair.ts` builds a focused packet and hands it to `runBuildPipeline` (canonical scheduler, budget reservation, events) through `repairRunnerFor`. The engine is off by default and needs a model and a runtime. In tests a deterministic stand-in plays the agent behind the same guard, packet and commit path |
| Bounded, budget-controlled repairs | LOCALLY VERIFIED | Default 3 attempts (max 5), budget pre-check each attempt plus the pipeline's own reservation, stall detection, no repeated identical attempts |
| Rerun affected tests after each repair | LOCALLY VERIFIED | Failed checks rerun first, then the whole plan with regression detection against what passed before |
| Evidence saved against the correct revision | LOCALLY VERIFIED (service, API); SQL VERIFIED in CI | Unique `(revision, run, kind)`; first failing and repaired revisions each carry their own report |
| Never PASS without real execution | LOCALLY VERIFIED | No executed check means `pending_runtime`; a required check that cannot run means `partial`; the project becomes `verified` only after every required check executed and passed |

Safety properties tested: the QA plan is fixed before the first repair and reused (a repair cannot change what it is asked to satisfy); a repair that deletes files or tests is refused before it can become a revision; a repair that breaks a previously passing check is reported as a regression and is not a success; the QA browser is locked to the application's own origin (a page cannot reach other hosts or internal addresses; blocked requests are recorded); evidence in the repair prompt is quoted data with an instruction not to follow it.

## Milestone E: continuing the same project

| Requirement | Status | Evidence |
|---|---|---|
| Recognize the existing project; change requests continue it | LOCALLY VERIFIED | `intent.ts` (server-side classifier) and `POST /api/builder/intent`; the chat send path asks it when a project is active. "Change my dashboard design", "Add another page", "Fix the booking system", "Add a new feature" continue the same project; only an explicit request for something separate creates another |
| Load the actual latest source; preserve working functionality | LOCALLY VERIFIED | Builds start from the head revision's complete files; unchanged files are preserved; regression detection reruns what passed before |
| New durable revision, previous versions retained, meaningful history | LOCALLY VERIFIED (service, API); SQL VERIFIED in CI | Gapless revisions, per-revision change summary, line-level diff (bounded), history never rewritten |
| Safe restore | LOCALLY VERIFIED | Restores an earlier revision as a NEW revision; restoring the current source is a no-op that keeps the project state; a restore never touches an external database, repository or deployment, and says so |
| Refresh the preview and rerun relevant tests | IMPLEMENTED; NOT VERIFIED live | After each successful chat build the strict readiness check runs and browser QA is rerun detached against the new revision |
| Failed changes, concurrency, interruptions, retries | LOCALLY VERIFIED | A change that does not validate leaves the current source intact and the attempt marked failed; one build at a time with a database-arbitrated claim and crashed-run takeover; a stale base is a conflict and never overwrites; retrying the same run creates one revision; an identical result creates none |
| Tenant isolation, version conflicts, regressions | LOCALLY VERIFIED | `iteration.test.ts`, `builderPhase2.test.ts`, `repair.integration.test.ts` |

## Milestone F: source export and GitHub

| Requirement | Status | Evidence |
|---|---|---|
| Verified source archive | LOCALLY VERIFIED | `export/archive.ts`: source at one revision, `XROGA-EXPORT.json` with per-file SHA-256, `XROGA-SETUP.md` derived from the real manifests, deterministic bytes, read back and verified before it is returned; tamper, truncation, traversal, extra/missing file and smuggled credential tests |
| Exclude credentials, secrets, disposable caches | LOCALLY VERIFIED | Credentials cannot be stored at all; build output and caches are excluded and listed with a reason; completeness check: every revision file is exported or listed as excluded |
| Reuse the existing GitHub integration and authorization | IMPLEMENTED | Token from the existing vault (`getGitHubToken`), transport `ghFetch`, repository response parsing from `githubRepoCreation`; no second authentication system |
| Select an authorized account or organization | LOCALLY VERIFIED | The owner must be one GitHub itself lists for the connected account; any other owner is refused. Missing `repo`/`read:org` permissions are named precisely |
| Private repository only after explicit approval | LOCALLY VERIFIED | prepare records the exact plan and digest before any provider call; approve must quote the digest, expires after 15 minutes and is a separate user request; execute refuses without it. Private by default; public carries a warning in the plan |
| Push the correct revision; verify repository, commit and ownership | LOCALLY VERIFIED with a faithful fake and request-level contract tests; PROVIDER NOT VERIFIED | Blobs, tree, commit and a non-forced ref; then GitHub's stored tree is read back and compared file by file against git blob hashes. Receipt records repository id, owner id, URL, commit and tree SHA, revision and authenticated account |
| Provider receipts, safe retries | LOCALLY VERIFIED | Operation identity is stored before execution; a lost response is reconciled by a marker that proves this operation created the repository; a repository that was not created by this export is never adopted or written to; partial failures keep the fact that the repository exists; a replay returns the receipt without touching GitHub; two simultaneous executions run once |
| Source synchronization with safe conflict handling | LOCALLY VERIFIED | Fast-forward commits only, with the last verified head as the expected parent; a remote that moved stops the push as `diverged` and nothing is overwritten |
| Wrong account, revoked connection | LOCALLY VERIFIED | The connected account is re-verified at execution and must match the approved one; a revoked token blocks the operation |

**No real GitHub repository was created.** GitHub behaviour is verified against an in-memory GitHub that enforces ownership, name uniqueness and fast-forward rules and can simulate provider failures, plus request-level contract tests of the REST adapter. Live creation needs an approved test account and is PENDING.

## Tests

Run from the repository root with `node node_modules/tsx/dist/cli.mjs --test $(find backend/src/builder -name '*.test.ts') backend/src/routes/builder.test.ts backend/src/routes/builderPhase2.test.ts`.

| Area | Tests |
|---|---|
| QA plan, runner, evidence | `qa/qa.test.ts` (13), `qa/qa.browser.integration.test.ts` (6, real Chromium) |
| Repair lifecycle | `qa/repair.integration.test.ts` (9, real Chromium and server) |
| Iteration, restore, diff, intent | `iteration.test.ts` (18) |
| Export | `export/archive.test.ts` (13) |
| GitHub | `github/github.test.ts` (27), `github/restPort.test.ts` (15) |
| API | `routes/builderPhase2.test.ts` (10), `routes/builder.test.ts` (6) |
| SQL against real PostgreSQL | `phase2Store.integration.test.ts` (6): runs in the `builder-phase1` workflow only |

## Unverified, and what each depends on

1. **Generated-app QA and a live repair run on the Google runtime.** Needs the Google `ProjectRuntimeProvider` from PR #856 and the canonical engine enabled for builder projects. Until then browser QA of a real generated app reports `pending_runtime`.
2. **Persistence checks** need a disposable test database in the QA environment (Phase 3 scope for the customer database).
3. **Live GitHub creation, push and sync** need an approved test GitHub account (`repo` permission) and your explicit approval.
4. **Screenshot storage** is inline and bounded in the verification record. Private Drive storage (Batch 1.5, not activated) is the intended home once activated.

## Rollback

Disable `NEXT_PUBLIC_XROGA_BUILDER`. The Phase 2 routes are inert without a project. Schema removal: `DROP TABLE public.builder_external_operations, public.builder_verifications;` (nothing else references them).
