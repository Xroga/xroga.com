# Batch 2, Phase 3: customer-owned Supabase and Vercel, remote verification, provenance and acceptance

> **Updated by the final audit** (`FINAL-AUDIT.md`): a project is now VERIFIED only after a browser test passes on its head revision (a build with a ready preview is PARTIAL), and the preview state is derived from the recorded readiness of the head revision. Where this document says otherwise, the final audit is current.

Builds on Phase 2 (PR #858, head `ed43af3f`). Branch `claude/batch2-phase3-delivery`.
Scope: Milestones G and H of the Batch 2 specification, the ten golden test groups and the twelve acceptance targets.
Nothing here is deployed, applied to a production database, enabled in production, or merged. No Supabase project, Vercel project or GitHub repository was created, and no external account was touched.

Status vocabulary: IMPLEMENTED, LOCALLY VERIFIED (production code against faithful fakes or fixtures), REAL-DEPENDENCY VERIFIED (a real browser or a real PostgreSQL in a disposable environment), PROVIDER VERIFIED (a real Supabase, Vercel or GitHub account), PRODUCTION RELEASED, BLOCKED.

**PROVIDER VERIFIED and PRODUCTION RELEASED are not claimed anywhere in this document.**

## How to read the evidence

| Kind | What it proves | What it does not prove |
|---|---|---|
| Fake provider tests (`FakeSupabase`, `FakeVercel`, `FakeGitHub`) | Xroga's own behaviour: approval, digests, isolation, reconciliation, verification logic, what is recorded and never recorded | That Supabase, Vercel or GitHub behave the way the fake does |
| REST adapter contract tests (scripted transports) | The exact requests Xroga sends and how it reads each documented response and error | That a live account accepts them |
| Real Chromium tests | Browser QA, including against the saved starter source | Behaviour on the Google runtime or a deployed Vercel preview |
| Real PostgreSQL (CI `builder-phase1` workflow, disposable database) | The generated schemas: RLS, cross-user isolation, double-booking prevention, migration idempotence and rollback | A customer's Supabase project |

## Milestone G: customer-owned Supabase

| Requirement | Status | Evidence |
|---|---|---|
| List and select the customer's own Supabase project | LOCALLY VERIFIED | `data/service.ts`: only projects the connected account's token lists can be selected; any other reference is refused. A revoked or missing connection is reported, never papered over |
| Never read the secret or service-role key | LOCALLY VERIFIED | `data/restPort.ts` requests API keys with `reveal=false`; the app environment is the public URL and publishable key only; `assertNoPrivilegedEnv` refuses anything privileged by name or value (including `NEXT_PUBLIC_SUPABASE_SERVICE_KEY`) |
| Generate a schema from the requirements | LOCALLY VERIFIED, REAL-DEPENDENCY VERIFIED in CI | `data/schema.ts`: deterministic archetypes `tasks`, `booking`, `items`. `data/schema.integration.test.ts` applies them to real PostgreSQL |
| Authentication and per-user data isolation (RLS) | REAL-DEPENDENCY VERIFIED in CI | Two real database users cannot see or change each other's rows even by guessing ids or forging the owner; signed-out visitors can read nothing; grants are revoked from `anon` and `public` |
| Booking cannot be double-booked | REAL-DEPENDENCY VERIFIED in CI | A partial unique index refuses a second confirmed booking for a slot, including under a concurrent race where exactly one customer wins |
| Review the SQL before it runs; refuse dangerous SQL | LOCALLY VERIFIED | `data/review.ts`: drops, disabling RLS, anon grants, changes to the auth schema, unsafe `SECURITY DEFINER`, tables without RLS are refused or flagged. The exact SQL, risk and protections are shown before approval |
| Explicit approval of the exact plan | LOCALLY VERIFIED | Shared `operations.ts`: plan and SHA-256 digest are stored before any provider call; approval quotes the digest, expires after 15 minutes, and is a separate request from execution |
| Never touch the customer's existing tables | LOCALLY VERIFIED | Existing tables are left alone and reported; a same-named table Xroga did not create blocks the migration; an appearance between approval and execution stops it |
| Verify after applying | LOCALLY VERIFIED | The live catalog is read back: tables exist, RLS is on, signed-out role has no access. A schema that comes back unsafe fails the operation and says why |
| Lost responses and retries | LOCALLY VERIFIED | A lost response after apply is reconciled from the catalog and applied once; before apply it ends `ambiguous` and a retry applies once |
| Migration on the platform database | NOT DONE, by design | Xroga never applies anything to its own database through this feature. Migration SQL files in `supabase/migrations` are not applied by this change |

## Milestone H: customer-owned Vercel, remote verification, production

| Requirement | Status | Evidence |
|---|---|---|
| List the user's accounts and teams; refuse others | LOCALLY VERIFIED | `hosting/service.ts` accepts only scopes Vercel reports for the connected token |
| Create or reuse a project without Git publishing | LOCALLY VERIFIED | Vercel's REST API documents no way to set a production branch or disable Git deployments, so projects are never Git-linked. A Git-linked project is refused, including one created Git-linked by the provider |
| Preview deployment of the exact revision | LOCALLY VERIFIED | File deployment with identity in `meta` (project, revision, content SHA-256, GitHub commit when exported); preview-only encrypted environment; the response must say preview, not production, and carry the identity back |
| Remote browser verification of the preview | LOCALLY VERIFIED; REAL-DEPENDENCY VERIFIED for the QA engine | `QaService.runRemote` with a read-only plan (no form is submitted and nothing is persisted on a remote site). Vercel protection answering instead of the app is `blocked_by_protection`, never a pass |
| Production only by explicit, separate release | LOCALLY VERIFIED | Needs a succeeded preview whose remote tests `passed`, a separate plan and digest, and a typed confirmation `publish <project name>`. Approving a preview publishes nothing. Production uses Vercel's promote of the already tested deployment, then read-only post verification |
| Provider receipts and revision provenance | LOCALLY VERIFIED | `delivery.ts`: for each revision, GitHub, database, preview, remote tests and production are each RECORDED, PENDING, FAILED or NOT_ATTEMPTED, derived only from operation receipts |
| Wrong team, revoked connection, stale approval, lost response | LOCALLY VERIFIED | `hosting/hosting.test.ts` (27) |

## Interrupted execution (golden I) and a defect found by the golden tests

- A process that dies while an operation is `executing` used to hold the single in-flight slot for the project forever. `recoverInterrupted` (`operations.ts`) now moves an operation that has not changed for 20 minutes (longer than any bounded provider call) to `ambiguous`, never to a guess about the provider. A retry reconciles by marker. Applies to GitHub, Supabase and Vercel operations. The partial unique index and the release path are also exercised on real PostgreSQL in CI.
- Writing golden C found that project creation failed for a booking prompt: the starter registry chose the Next.js starter from the structured spec, then the scaffold function re-detected the kind from the prompt text and disagreed ("Next.js starter produced a non-Next.js scaffold"). Starter materialization now builds from the chosen starter directly.

## Golden acceptance groups

| Group | Executes | Status |
|---|---|---|
| A business website | `golden.browser.integration.test.ts`: starter saved as revision 1, served, driven by real Chromium on desktop and mobile through the production plan; QA service records a real pass and marks the revision verified; no running app is `pending_runtime` | REAL-DEPENDENCY VERIFIED |
| B task SaaS | `golden.test.ts` (starter, schema, approval, catalog read-back, public-only environment) and `data/schema.integration.test.ts` (real PostgreSQL) | LOCALLY and REAL-DEPENDENCY VERIFIED; live customer project PENDING |
| C booking | same files | LOCALLY and REAL-DEPENDENCY VERIFIED; live customer project PENDING |
| D same-project iteration | `iteration.test.ts`, `builder.test.ts`, `routes/builderPhase2.test.ts` | LOCALLY VERIFIED; live model-driven change PENDING |
| E QA-driven repair | `qa/repair.integration.test.ts`, `qa/qa.browser.integration.test.ts` | REAL-DEPENDENCY VERIFIED with a deterministic stand-in agent; real Cline run PENDING |
| F GitHub export | `github/github.test.ts` (27), `github/restPort.test.ts`, `export/archive.test.ts` | LOCALLY VERIFIED; live repository PENDING |
| G customer Supabase | `golden.test.ts`, `data/data.test.ts` (21), `data/restPort.test.ts` (8) | LOCALLY VERIFIED; live project PENDING |
| H customer Vercel | `golden.test.ts`, `hosting/hosting.test.ts` (27), `hosting/restPort.test.ts` (11), `routes/builderPhase3.test.ts` (4) | LOCALLY VERIFIED; live deployment PENDING |
| I interrupted execution | `golden.test.ts`, `phase2Store.integration.test.ts` (CI) | LOCALLY and REAL-DEPENDENCY VERIFIED |
| J negative security | `golden.test.ts`, `routes/builderPhase3.test.ts`, `data/data.test.ts`, `hosting/hosting.test.ts`, `github/github.test.ts` | LOCALLY VERIFIED |

## Twelve user-visible acceptance targets

| # | Target | Status |
|---|---|---|
| 1 | Natural language creates a new web project | LOCALLY VERIFIED (durable project, approved starter, revision 1). Real model run PENDING |
| 2 | Real source that builds and runs | PARTIAL: starter source passes real-browser QA (golden A). Build-and-run of a model-generated app on the Google runtime PENDING |
| 3 | Secure development preview loads the real application | NOT VERIFIED: needs the Google runtime (PR #856). Seven preview states and signed gateway reuse implemented in Phase 1 |
| 4 | Backend, data, auth work for projects that need them | PARTIAL: schema and RLS verified on real PostgreSQL; the generated app talking to a real customer Supabase PENDING |
| 5 | Playwright detects meaningful user-flow failures | REAL-DEPENDENCY VERIFIED (overflow, broken anchors, form without validation, uncaught errors, blocked egress) |
| 6 | Cline-backed bounded repair corrects failures and retests | LOCALLY VERIFIED with a deterministic stand-in agent; live Cline run PENDING |
| 7 | Follow-up chat modifies the same project and preserves a revision | LOCALLY VERIFIED |
| 8 | History and files survive sandbox cleanup and reopen | REAL-DEPENDENCY VERIFIED in CI for storage; reopen after a real sandbox cleanup PENDING (Google runtime) |
| 9 | Source export; authorized GitHub creation | Export LOCALLY VERIFIED; GitHub creation LOCALLY VERIFIED with a fake, live PENDING (approved test account) |
| 10 | Customer Supabase with ownership and RLS tests | RLS REAL-DEPENDENCY VERIFIED; ownership and selection LOCALLY VERIFIED; live Supabase project PENDING |
| 11 | Vercel preview and explicit production controls | Controls LOCALLY VERIFIED; live deployment and promotion PENDING (approved Vercel test account; deployment protection bypass for remote QA) |
| 12 | Tenancy, credential and egress safety, budgets, cancellation, replay, provider failure | LOCALLY VERIFIED across Phases 1 to 3 (cross-tenant 404 on every route, no credential in any stored row, QA origin lock, single in-flight claim, replay returns receipts, provider-failure paths) |

For a cross-service published case the specification requires verifying both the deployment and the database in the published environment. That has **not** been done and is PENDING.

## Rollback and safety

- Migration `20261026020000_builder_phase3.sql` is additive (widens two CHECK constraints). Its rollback is documented in the file and exercised in CI. It is not applied by this change.
- Operations are cancellable until execution; a cancelled or expired approval cannot run.
- Nothing is deleted from a customer account by any code path: no repository, project, deployment or table is ever deleted or overwritten.
- Frontend (`Deliver` tab) stays behind `NEXT_PUBLIC_XROGA_BUILDER=1`, default off. The Builder remains disabled in production.

## Blocked by live access or the Google migration

- Live Preview, build-and-run of a generated app, sandbox cleanup and reopen: Google runtime (PR #856, Codex).
- Live Cline repair and real model builds: engine enablement and approved budget.
- Live GitHub repository, Supabase project and Vercel deployment tests: approved disposable test accounts. Vercel remote QA of a protected preview needs a protection-bypass secret that Xroga does not yet store.
- Production release: separate approval by the founder.
