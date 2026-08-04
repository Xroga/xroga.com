# Command 1 — audit of the current implementation

Base: `0997a0450f4354e4b52c0d49f08359a999254a95` (contains #458 `f9dd922`, #459 `696d89e`, #460 `0997a04`).
Branch: `agent/complete-command-1-runtime`.

Every classification in `requirements-ledger.json` was established by reading the code on this
branch. Comments, prior completion documents and pull-request descriptions were not accepted as
evidence — several of them describe intent that the code does not implement, and two of the four
`broken` findings below sit directly underneath a comment claiming the opposite.

## What is already real and must not be rewritten

These are working systems. The command is explicit that a complete system is not to be replaced
merely because rewriting is easier, so they are reused as-is:

- **Atomic GitHub mutation** (`services/integrations/githubAtomicWrite.ts`, `githubMutationPlan.ts`,
  `githubTreeSnapshot.ts`, `githubAtomicTransport.ts`) — one tree, one commit, one non-force
  compare-and-swap. A truncated tree listing is a typed refusal, not something to plan against
  (`githubTreeSnapshot.ts:104-113`). This is PR #458/#459 and is left alone.
- **Branch safety and authorization** (`githubBranchSafety.ts`, `githubBranchAuthorization.ts`,
  `githubRunBranch.ts`) — target branches are resolved exactly and protected branches require
  authorization or route through `xroga/<run-id>` plus a pull request.
- **Patch refusals** (`ai/patchSafety.ts`) — empty SEARCH against an existing file, ambiguous
  SEARCH, stale source hash and unexpectedly destructive results are all refusals with typed
  reasons.
- **Sandbox environment allowlist** (`sandbox/sandboxEnvironment.ts`) — eight allowlisted variables,
  plus a forbidden-name pattern that throws on anything credential-shaped a caller tries to pass in.
  This is an allowlist, which is the correct direction, and it is left alone.
- **Dependency-aware scheduling** (`ai/executionRuntime.ts:349-372`) — ready-set promotion, terminal
  upstream blocking, mutating tasks serialised against read-only ones, provider-call dedupe per
  attempt.
- **Run persistence and orphan reconciliation** (`ai/runStore.ts`, `ai/runReconciler.ts`) — durable
  before the first provider call, truthful on restart, bounded on shutdown.
- **Supabase egress repairs from PR #460** — local JWT verification, one provisioning pass per user,
  metadata-only list and write projections, upload fingerprinting.
- **Provider routing** (`ai/router.ts`, `ai/providerRuntime.ts`, `ai/modelCapabilityRegistry.ts`) —
  section 12 forbids finalising the commercial allocation, so this is untouched.

## What is broken — code that actively does the wrong thing

Four findings, each anchored to a line.

### 1. `buildOk: true` before any build has run (`ai/pipeline.ts:1861`)

The pre-QA preview payload is emitted immediately after the builder responds, under a comment
saying so explicitly, and it sets `buildOk: true` with the label `Preview ready`. Nothing has
compiled, typechecked, installed or executed at that point. This is the premature success state
section 9 names. R9.1.

### 2. The reviewer fails open on a missing `ok` (`ai/qa.ts:63`)

`parseReviewJson` returns `ok: parsed.ok !== false`. Unparseable output is handled correctly — the
`catch` returns `ok:false`. But well-formed JSON that omits `ok` entirely returns `ok:true`, and
`qa.ts:168` then feeds that into the combined gate as a pass. Section 10 says missing ok/status is
not success. R10.2.

### 3. The reviewer sees the first four files of an unrecognised project (`ai/qa.ts:108`)

`frameworkSamples` tries eight fixed paths (`package.json`, `app/page.tsx`, `app/layout.tsx`,
`app/index.tsx`, `app.json`, two API routes, `index.html`). If none matches — the normal case for
any project that is not a Next, Expo or static scaffold at those exact paths — it falls back to
`files.slice(0, 4)`: the first four files in array order. Each is truncated to 2500 characters, the
sample to 14000, and nothing discloses the partial coverage to the reviewer or the user. This is
verbatim the first-four-file sample section 10 prohibits. R10.3.

### 4. Four tests fail on a CRLF checkout (R13.1)

Three backend and one frontend test slice their own source with `indexOf` on an LF-only marker,
which returns `-1` on a CRLF checkout, leaving the asserted body empty. Section 13 forbids
dismissing these, so they are in scope.

## What is missing entirely

- **The repository tool suite** (R5.2). None of the thirteen tool names appears anywhere in
  `backend/src` or `frontend/src`. Context today is `contextPreparation.prepareFocusedContext`,
  which ranks and redacts well but takes a `ProjectFile[]` that must already be fully in memory —
  hydration first, selection second, no on-demand fetch, no exact commit.
  One correction to the original audit: there is **no hard-coded path whitelist** in
  `contextPreparation.ts`, `fileSelector.ts` or `repoSummarize.ts`. The defect is the hydration
  requirement, not a whitelist.
- **A canonical verification lifecycle** (R9.2). None of `generated_unverified`, `testing`,
  `repairing`, `verified`, `repository_written`, `deployment_pending`, `deployed`,
  `production_verified`, `blocked`, `failed` exists as a shared vocabulary. The only
  `production_verified` strings in the tree belong to unrelated growth and operations status sets.
- **Iterative task-by-task implementation** (R2.12, R4.1). The builder returns the whole project in
  one response. Worse, `pipeline.ts:1027-1035` pushes the route plan's tasks into the execution
  state and marks every non-blocked one `completed` in the same loop — the task graph is recorded,
  never executed.
- **Resume from checkpoint** (R2.4, R4.2). `runReconciler` fails an interrupted run truthfully but
  terminally. Nothing reloads a `CanonicalExecutionState` and continues from the last completed
  task. `SupabaseExecutionStateStore.load` has no caller outside tests.
- **Expected base blob SHAs and a transactional patch workspace** (R6.1, R6.2).
  `PatchIntent.expectedSourceHash` is a content SHA-256 with no producer anywhere in the repository,
  so stale-source detection never fires in practice. Patches apply to an in-memory array with no
  isolated workspace, no `.git` rejection and no symlink handling. `CanonicalMutationService.safePath`
  rejects traversal, absolute paths and NUL, which is a good start but not the section 6 set.
- **A section 11 final evidence record** (R11.1). `FinalExecutionOutcome` has five statuses and no
  commit, branch, pull request, deployment or live-verification fields.

## Partially complete, with the specific gap named

- **Network policy** (R7.4). `SandboxExecutionRequest.networkPolicy` offers `none`,
  `registry-only` and `restricted`, but `sandboxRuntime.ts:114` maps everything that is not `none`
  to a full Docker bridge network. `registry-only` is not narrower than unrestricted egress today.
- **Sandbox provider architecture** (R7.2). `getSandboxRuntime()` unconditionally returns
  `new DockerSandboxRuntime()`. There is one runtime, so there is nothing to select between and no
  remote-worker provider to select.
- **Isolation tests** (R7.5). The existing tests assert the environment builder. There is no
  end-to-end sentinel secret planted in `process.env` and asserted absent from a real execution
  request, and no network-denial assertion.
- **Unknown products default to static** (R8.2). `pipeline.ts:1843` falls back to
  `landingFilesFromOutput('', '', '')` — a static landing scaffold — when there is no prior state,
  and `pipeline.ts:1871` still consults `detectScaffoldKind` directly in the preview path (R8.1).
- **Project memory completeness** (R5.4). `project_memory` stores summaries but records no tree SHA,
  so nothing prevents a stale snapshot from being treated as canonical.

## The one external blocker

Section 7's live production sandbox needs a **dedicated isolated execution worker** — a separate
Fly.io application or machine pool that can run a container runtime, distinct from `xroga-api`.
The API host is itself a container with no nested runtime, which is why
`DockerSandboxRuntime.probe()` fails in production and every executable validation refuses. That
refusal is correct behaviour and stays as the fallback.

This is a new paid resource. Per the command it has **not** been created. All code, configuration,
tests and deployment documentation that can be written without it will be written; the requirement
stays `external_blocker`; and Command 1 will not be reported as verified while it is open.
