# Activation checkpoint: Batch 1.5 and Batch 2

Checkpoint date: 2026-10-29. Written for any future agent or person who resumes this work. Read this first, then `IMPLEMENTATION_STATUS.md`, `blockers.md` and the PRs listed below.

Status vocabulary (INV-10): **PASS** = proven live with evidence; **FAIL** = tried live and not working; **BLOCKED** = cannot be tried without extra infrastructure, accounts or a decision; **UNTESTED** = not tried live yet. Code-complete, verified-scope and independently live are different states. Nothing here claims full product completion.

## How the percentages are computed

Percentages are `PASS items / listed items`, a simple count of the acceptance items below. They are **not** effort, time or code-completeness. They move only when an item is proven live. Items that were completed in earlier sessions are recorded as reported by those sessions and should be re-verified before a release claim.

| Scope | PASS | Listed | Live-activation % |
|---|---|---|---|
| Batch 1.5 (Drive, R2, DB/RLS, durable execution) | 5 | 7 | **71%** |
| Batch 2 (AI Product Builder) | 5 | 12 | **42%** |

## Batch 1.5 items

| Item | State | Evidence or reason |
|---|---|---|
| Xroga Drive | PASS | Completed in an earlier session (reported). |
| Cloudflare R2 storage | PASS | Completed in an earlier session (reported). Old test token `xroga-b15-r2-test` still needs revoking by the owner in Cloudflare. |
| Database and RLS | PASS | Completed in an earlier session (reported). |
| Durable execution on Google Cloud Run Job | PASS | Proven live 2026-10-28: queued run, dispatcher admission, Job claim, builder run opened and closed. |
| Acceptance tests | PASS | CI baseline green on every merged PR (`unit`, `integrated-candidate`, `authenticated-browser`, `deterministic-golden`, `disposable-policy-database`). |
| Browser worker | BLOCKED | Needs a Compute Engine VM and an accepted secure worker design. Browser execution stays disabled. |
| Tenant-security acceptance | BLOCKED | Owned by Batch 1 Phase 4 (Codex PR #844). Not part of this work. |

## Batch 2 items

| Item | State | Evidence or reason |
|---|---|---|
| Project creation | PASS | `POST /api/builder/projects` creates an owned project (verified on two accounts). |
| Builder routing and repository authority | PASS | PRs 869, 874, 875: server-bound Builder runs take the universal path and get repository authority. |
| Planning (goal, recipe, architecture, file plan) | PASS | PR 871: repository-less project context no longer fails validation. |
| Agent loop safety | PASS | PR 872: `maxIterations` 60 and `[software-agent-step]` logging. |
| Agent reads project files | PASS | PR 873: `project_read_files` with no paths reads the listed files. |
| Code written and revision saved | **FAIL** | See "Open failures" 1. |
| Cleanup after cancelled or killed runs | **FAIL** | See "Open failures" 2. |
| Iteration, export | UNTESTED | Need a saved revision first. |
| QA | BLOCKED | Needs an isolated browser host. |
| Preview | BLOCKED | Needs a Compute Engine host per project; cost not yet estimated or approved. |
| GitHub, Supabase and Vercel delivery | BLOCKED | Needs disposable provider accounts. |

## Open failures to fix in the activation phase

1. **Usage accounting uncertain on the long AI call.** The software agent's code-writing call to `kimi_k3` finishes but its usage is recorded as 0 tokens, so `POST_COMPLETION_ACCOUNTING_UNCERTAIN` stops the run and no revision is saved. The safety rule is correct; the cause is unknown. Investigate with logs and code before any live build.
2. **Cancelled or killed runs leave state behind.** `google_canonical_deliveries` rows stay `running` after their lease expires, a provider reservation stays `reserved` or `pending_reconciliation`, and a killed run leaves the Builder project `generating` with an `active_run_id`, so the next run exits immediately. Workaround used: the owner-only `POST /api/builder/projects/:id/cancel`.

## Live production state at this checkpoint

- Cloud Run service `xroga-api` (us-east4, project `project-c40d4821-e647-4fa2-92d`): 100% on `xroga-api-google-b0cd0ec3-r1`, release `b0cd0ec31be56a8945ae41998563475237ed52fb`.
- Cloud Run Job `xroga-canonical-production`: image and `xroga-source-sha` label match the same release (the dispatcher refuses a mismatch, so they must change together).
- Rollback revisions kept: `xroga-api-google-e1fe27c1-r1`, `...-b496482a-r1`, `...-55f6c104-r1`, `...-cbbdbb0d-r1`, `...-660b5960-r1`, `...-7674dccc-r1`, `...-b11841ea-r1`, `xroga-api-00057-kr8`.
- Release path: build on branch `claude/release-image-build` (pin `RELEASE_SHA` in the workflow), copy the digest into `cloud-run-source-deploy` with Docker, create a 0% revision, then switch traffic and the Job together, only with the owner's approval.

## Spend

Free-plan test accounts have a $1.65 cycle allowance. Account 2 is exhausted by looping runs. Account 1 had about $1.13 left plus one $0.175 reconciliation hold. Do not run live AI builds without the owner asking: the budget is about $1.

## Decision on sequencing (owner, 2026-10-29)

Live activation is paused. Build the backend for all batches first (skills, MCP, integrations, automation, browser-automation workspace), then model routing and getting models to work reliably, then activation and integration together. Codex-owned work (Batch 1 Phase 4 PR #844, Batch 3 PR #865) is not to be changed without an explicit decision.

## PRs from this activation

868, 869 (Builder durable path and authority), 870 (planner failure log), 871 (planner project context), 872 (agent iteration cap and step log), 873 (read-files input), 874 and 875 (Builder routing). All merged with required checks green.
