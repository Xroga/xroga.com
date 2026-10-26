# Batch 2 final audit: Phases 1, 2 and 3 together

Branch `claude/batch2-final-audit`, stacked on Phase 3 (PR #859, `b0f9b8ce`). It does not replace Phases 1 to 3: it is the audit overlay (defects found by reading the specification against the code and by running the whole journey in one test), each fixed with a regression test. Nothing here is applied, deployed or enabled, and no external account was touched.

Evidence labels: **FIXED + TESTED**, **REAL-DEPENDENCY VERIFIED** (real Chromium or real PostgreSQL in a disposable environment), **PROVIDER VERIFIED** (a real Supabase, Vercel or GitHub account; **none**), **OPEN** (needs the Google runtime, an approved account or a product decision).

## 1. How the audit was done

- Specification sections 0A to 18 were read and compared with the code by three independent reviewers (spec sections 0A to 9 and 17 to 18; sections 10 to 16; and Batch 1.5), then every claim was re-checked in code before anything was changed. Two reviewer claims were wrong or already deliberate and were not "fixed" (section 5).
- A single end-to-end test (`builder/journey.test.ts`) now runs the whole customer journey through the production services: plain-language request, durable project and starter, build through the engine contract, browser QA, follow-up on the same project, history and restore, verified ZIP, GitHub, Supabase schema, Vercel preview, remote tests, production release, provenance, and a second tenant who can see none of it.
- `frontend/src/lib/builderApiContract.test.ts` proves every Builder client call is a route the backend serves with the same method, that every route is used, that the router is mounted behind authentication and that every panel is rendered.

## 2. Defects found and fixed

| # | Severity | Defect | Fix and evidence |
|---|---|---|---|
| 1 | **High** | **Production release could be approved with the digest alone.** `OperationRunner.approve` checked only the plan digest, so a `promote_production` operation could be approved through the preview approval route (or GitHub's or Supabase's), skipping the typed confirmation. A reviewer reproduced a publish this way | Approve and cancel now take the expected provider and actions; a preview approval cannot approve a release; the GitHub service only touches GitHub operations. `audit.test.ts` |
| 2 | High | **Cross-phase break found by the journey:** once any Supabase or Vercel operation existed, `GitHubExportService` listed every provider's operations and `binding()` dereferenced a receipt shape they do not have and threw. GitHub sync and Vercel commit provenance stopped working | The GitHub service lists only its own operations. `journey.test.ts` |
| 3 | High | **A project was VERIFIED before any browser test had passed**, and a failing or absent browser test never changed that. Specification 7.10 and 7.12 say complete only after required evidence passes | Build plus a ready preview is PARTIAL ("awaiting browser tests"); a passed QA run on the head revision promotes it to VERIFIED. `audit.verification.test.ts`, `builder.test.ts` |
| 4 | High | **A follow-up that produced identical source marked the project FAILED** (the chat path returned before the no-change handling) | `closeBuilderRun` treats no change as no change. Closing a run twice is harmless (a late cancel can no longer relabel a saved, tested project) |
| 5 | Medium-High | **An aborted QA run was reported PASSED** (the loop broke out and only executed checks were counted) and recorded the revision as verified | Unexecuted checks are reported as pending with a reason; the run cannot be PASSED. `audit.verification.test.ts` |
| 6 | Medium-High | **A failed Vercel preview could never be retried**: the project it created blocked every retry ("already exists and was not created by this deployment"), leaving the customer to rename and orphan it. Newer versions could not be deployed either | A project is adopted only when an earlier operation of the same Xroga project recorded its id; a same-named customer project is still refused; no name means "the project Xroga already made". UI offers "Review a preview of version N". `audit.test.ts` |
| 7 | Medium | **QA and repair state writes overwrote a newer build** and cleared its run slot | `setStateIfIdle`: compare-and-set on the run slot. `audit.verification.test.ts` |
| 8 | Medium | **Preview state contradicted reality**: it was derived from the project's overall state, so a healthy preview showed "degraded" while awaiting or failing tests | The strict readiness result is recorded against the revision it tested (migration `20261026030000_builder_preview_readiness.sql`, additive, nullable, not applied) and the state is derived from that. `audit.preview.test.ts`, real-PostgreSQL test in `store.integration.test.ts` |
| 9 | Medium | **A read-only remote QA run relabelled the revision** and replaced the "latest" local result; a narrower pass could upgrade a partial revision | Remote runs are recorded as their own verification and never relabel the revision or appear as the latest local result |
| 10 | Medium | **Database-backed apps left Xroga incomplete**: the ZIP and the GitHub repository did not contain the reviewed migration or a safe `.env.example`; a booking schema also conflicted with the starter's own `profiles` table; production could be published without the schema applied | Exports carry the migration (version-controlled with the source) and a public-only `.env.example`; the booking schema adds its `role` column idempotently; production is blocked until a required schema has been applied and verified. `audit.delivery.test.ts` |
| 11 | Medium | **No way to restart the preview from the latest saved version**, and restoring an old version re-tested nothing | `POST /projects/:id/preview/restart` and a "Start preview from latest version" control; a restore restarts the preview and reruns the browser tests (detached). `builderPhase3.test.ts` |
| 12 | Medium | Readiness probe assumed port 3000 on IPv6 loopback only | Probes the port the runtime recorded, on both loopbacks. `runtime.integration.test.ts` (real servers) |
| 13 | Medium | **Generated pages were driven by Chromium inside the API process.** In production that runs untrusted generated JavaScript in the privileged container | Off in production unless an operator sets `XROGA_BUILDER_INPROCESS_QA=1` for an isolated deployment; otherwise QA is honestly "not run". `audit.verification.test.ts` |
| 14 | Low-Medium | Credential scan only caught a few key shapes | Adds Supabase `sb_secret_`, service-role JWTs (judged by their `role` claim, so the public anon key stays allowed), AWS, Stripe and Slack keys. `audit.delivery.test.ts` |
| 15 | Low-Medium | Several GitHub and Vercel rules: a second repository per project was silently ignored; production could be released by a different Vercel account than the one that tested the preview; the production plan did not say that remote tests are read-only or that an existing project's live deployment would be replaced | One repository per project (sync adds versions); release only by the account that built the preview; the plan states what was and was not tested. `audit.delivery.test.ts` |
| 16 | Medium (UI) | Existing GitHub, Supabase and Vercel bindings disappeared when a provider was disconnected or its token revoked; the Vercel panel hid its form forever after the first deploy | Bindings are always shown; "deploy newer version" and a production card for a newer previewed version. Frontend tests |
| 17 | Medium (UI) | A stale or foreign project id in browser storage made every chat message fail with "project not found"; the project could not be reopened without the same browser; a refusal by the builder was silent | The stale id is cleared on a 404; the workspace restores the most recent project from the server; a refusal is shown to the user. Frontend tests |

## 3. Cross-phase evidence

| Journey stage | Where it is proven | Level |
|---|---|---|
| 1 Ordinary language to a new-product decision; retry creates one project | `journey.test.ts`, `builder.test.ts` | Services |
| 2 Durable project and approved starter with provenance | `journey.test.ts`, `golden.test.ts` | Services; real PostgreSQL for the store in CI |
| 3 Build through the canonical engine contract; committed only after validation | `journey.test.ts`, `builder.test.ts` | Engine replaced by a stand-in behind the same `commit` contract; **live model build PENDING** |
| 4 Isolated preview | `canonical.ts`, `phase2Bridge.ts` | **PENDING: needs the Google runtime** (PR #856) |
| 5 Browser QA of the real saved source | `golden.browser.integration.test.ts` | **REAL-DEPENDENCY VERIFIED** (real Chromium, starter source) |
| 6 Bounded repair, regression-checked | `qa/repair.integration.test.ts` | REAL-DEPENDENCY VERIFIED with a deterministic stand-in agent; live Cline run PENDING |
| 7 Follow-up on the same project | `journey.test.ts`, `iteration.test.ts` | Services |
| 8 Durable, recoverable revisions; restore | `journey.test.ts`, real-PostgreSQL store test in CI | Services; REAL-DEPENDENCY VERIFIED for SQL |
| 9 Verified source ZIP | `journey.test.ts`, `export/archive.test.ts` | Services (read back and checksummed) |
| 10 GitHub | `journey.test.ts`, `github/*.test.ts` | Fake provider and request-level contract tests; **PROVIDER NOT VERIFIED** |
| 11 Supabase | `journey.test.ts`, `data/*.test.ts`; `data/schema.integration.test.ts` on real PostgreSQL | Fake provider; schema and RLS REAL-DEPENDENCY VERIFIED; **customer project PENDING** |
| 12 Vercel preview, remote tests, production | `journey.test.ts`, `hosting/*.test.ts` | Fake provider; **PROVIDER NOT VERIFIED** |
| Tenant isolation | `journey.test.ts` (second customer), every service's tenant tests | Services |

## 4. The twelve acceptance targets (final)

| # | Target | Status |
|---|---|---|
| 1 | Natural language creates a web project | LOCALLY VERIFIED; live model run PENDING |
| 2 | Real source that builds and runs | PARTIAL: starter passes real-browser QA; a generated app on the Google runtime PENDING |
| 3 | Secure preview loads the real app | NOT VERIFIED: needs the Google runtime |
| 4 | Backend, data and auth work | PARTIAL: schema and RLS verified on real PostgreSQL; the generated app against a real customer Supabase PENDING |
| 5 | Playwright detects real user-flow failures | REAL-DEPENDENCY VERIFIED |
| 6 | Bounded Cline repair, re-tested | LOCALLY VERIFIED with a stand-in agent; live PENDING |
| 7 | Follow-up on the same project keeps a revision | LOCALLY VERIFIED (`journey.test.ts`) |
| 8 | History and files survive sandbox cleanup and reopen | Storage REAL-DEPENDENCY VERIFIED in CI; reopen after a real sandbox cleanup PENDING |
| 9 | Source export; authorised GitHub creation | Export LOCALLY VERIFIED; GitHub with a fake only, live PENDING |
| 10 | Customer Supabase with ownership and RLS tests | RLS REAL-DEPENDENCY VERIFIED; live project PENDING |
| 11 | Vercel preview and explicit production controls | Controls LOCALLY VERIFIED (the approval bypass in defect 1 is closed); live PENDING |
| 12 | Tenancy, credential and egress safety, budgets, cancellation, replay, provider failure | LOCALLY VERIFIED |

## 5. Reviewer claims not acted on

- "Startup policy and readiness were lost in the Batch 1.5 merge": a deliberate, documented decision (`runtime/bootGuard.test.ts`); see the Batch 1.5 audit.
- "Builder storage should be Drive/R2": source is stored in Postgres jsonb on purpose, because revisions are appended by one transactional, row-locked RPC (gapless numbers, replay safety, stale-parent conflict) and every save is read back and re-hashed. Drive is object storage for large artifacts; the Builder does not need it. Recorded here as a design decision, not a defect.

## 6. Open, with reasons

| Item | Why it is not fixed here |
|---|---|
| The chat is not associated with a project (`conversation_id` stays null) | The chat context has no stable conversation id; the workspace restores the most recent project instead |
| No builder cancel control, stale-run window of one hour | Cancel is the existing chat abort; a heartbeat and a shorter window need the Google worker model |
| `PreviewPort.launch` and `BuilderService.generate` are used only by tests | Kept: the direct build path is the reference behaviour the chat path is tested against |
| The validation ladder (install, typecheck, lint, build) | Run by the canonical pipeline, not by the Builder; not re-proven here |
| Supabase: create a new project; escalated approval for destructive SQL; auth callback URL configuration | Not implemented; destructive SQL is refused outright; the UI does not claim them |
| Vercel: production URL is the expected `https://<name>.vercel.app`; timeouts of deployment and env calls are not reconciled; GitHub default branch is assumed `main`; `read:org` is not in the existing GitHub OAuth scope so organisation owners may not list | Need live provider verification before changing; listed in the live procedure |
| The in-process browser must move to an isolated host for production | Needs the Google runtime and Batch 1.5's browser worker; until then QA is off in production unless explicitly enabled (defect 13) |
