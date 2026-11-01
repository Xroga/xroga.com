# Batch 3, Phase 2 (of three): safe AI code editing, real testing and GitHub PR delivery

Covers Work Packages D and E. Branch `claude/batch3-existing-editor`, draft PR #865. Development only: no merge, deployment, production database change or activation.

## The twenty Phase 2 items

| # | Item | State | Where / evidence |
|---|---|---|---|
| 1 | Plain-language change requests against an existing project | VERIFIED (contract) | `POST /links/:id/changes`; `routes/existingSourceChanges.test.ts` |
| 2 | Task planning, acceptance criteria, source scope | VERIFIED | `ChangeService.scopeFor` and `criteria` from the Phase 1 code map; recorded on the durable task |
| 3 | Relevant-file selection from Phase 1 | VERIFIED | scope becomes the agent's write policy (allowed directories) and its starting files |
| 4 | Existing SoftwareAgent / Cline execution | WIRED, NOT RUN against a real model | `ExistingSourceToolHost implements SoftwareAgentToolHost`; `productionAgentRunner` = `AgentSoftwareExecutor`; model from the existing coding router. Tests drive the host through the same tool-host contract with scripted agents |
| 5 | Isolated checkout and working overlays | VERIFIED | `ChangeWorkspace` over the exact base commit (`loadBaseSnapshot`), overlay of edits, credentials never in the checkout |
| 6 | Protection of unrelated files, user edits, history | VERIFIED | the base is immutable; only changed files are in the change set and delivery; a ZIP or GitHub source is never written; CRLF and whole-file-rewrite warnings. A dirty local working tree does not exist in this product, so there are no local user edits to overlay |
| 7 | Precise patch application and source-hash validation | VERIFIED | each changed file records its base blob SHA; delivery compares base and remote head blobs for every changed path; `applySearchReplace` (exact, unique, line-ending preserving) is available as a helper. Whole-file `write` is what the existing agent tools use |
| 8 | AST-assisted editing where justified | NOT USED, by decision | no compiler API is shipped in the production image and the agent's whole-file and exact-replace edits were sufficient for JS/TS, Python and Go in the tests; revisit if a real-model run shows damage to untouched code |
| 9 | Real bug reproduction and regression tests | VERIFIED (Node) | a bug fix that adds a test is run against the untouched base: `reproduced` only if it fails there; a test that also passes without the fix is reported `not_reproduced` |
| 10 | Feature work and bounded refactoring | SAME ENGINE | limits: 40 files, 1 MB per file, 4 MB total; narrower with low scope confidence |
| 11 | Native JS/TS, Python, Go validation | Node and Python EXECUTED FOR REAL; Go PLANNED ONLY | `testRunner.ts` derives commands from the project's manifests. Real `node --test` and `python -m unittest` runs in tests. `go test` is planned and unit-tested but not executed: no Go toolchain on this machine |
| 12 | Reuse of Google worker, Preview, Playwright | PARTIAL | execution uses the existing sandbox runtime. **The Google runtime admits execution only for a canonical run attempt** (`executeCanonicalSandboxed`); an existing-project change has none, so `productionExecutionPort` answers `EXECUTION_UNAVAILABLE` in Google mode rather than manufacturing authority. Preview verification is a typed hook that returns `not_checked` until connected (Phase 3) |
| 13 | Bounded test-failure diagnosis and repair | VERIFIED | up to 3 attempts (max 5); the repair turn is given the real failing output; an outage, missing runner or timeout is never retried as if the code were wrong |
| 14 | Persisted revisions, diffs, evidence, recovery | VERIFIED in memory | `existing_source_changes` (not applied); a run that stops is reported `interrupted` and `resume` continues from the saved result files |
| 15 | Safe review-branch creation | VERIFIED against a faithful git host | deterministic `xroga/change-<id>-<digest>`; never the base or a protected branch; one atomic commit via the existing `writeAtomically` (CAS ref update, no force) |
| 16 | Account/repository permissions and protected-branch checks | VERIFIED (contract) | binding re-verified at the provider at delivery time; read-only, archived, lost access and ZIP sources are refused with zero remote calls; protected base branch still yields a review branch and is never written |
| 17 | Remote HEAD revalidation, conflict-safe reconciliation | VERIFIED | base moved, files untouched: rebased, receipt says tests ran on the old base and `verified:false`; a changed path: structured conflict (HTTP 409 with per-file reasons), nothing written, export still available |
| 18 | Idempotent branch, commit and draft PR | VERIFIED | same change never creates a second branch or PR; a branch left by a lost response is adopted only if every changed file hashes exactly to this change; different content on that name is refused |
| 19 | Verified commit and PR receipts | VERIFIED against the fake host; NOT against GitHub | receipt records branch, commit, PR number and URL, base and head, rebased, verified, draft |
| 20 | Safe export when remote writes are unavailable | VERIFIED | `git apply --check` and `git apply` accept the exported patch against the base; the ZIP is accepted by the hardened reader; both refuse a change carrying a credential |

## Safety rules enforced in code (and tested)

- **`verified` means the project's own tests passed in isolation against the final change.** No runner, no runtime, a timeout, an install failure or an incomplete working copy end `unverified` with the reason; failing tests after the bounded attempts end `failed`.
- The agent cannot read credentials, write `.env`, `.git/**` or `.github/workflows/**`, escape the scope, run shell syntax, `curl`, `git push`, install arbitrary packages or publish; hostile README text is visible only as data. Commands are an allowlist of the project's own tooling.
- Credential-looking content in a change blocks delivery and export. Workflow and `.git` paths are never delivered.
- Another owner's change reads as absent on every route (list, get, cancel, resume, deliver, export).
- At most two running changes per owner (`CHANGE_BUSY`); cancellation aborts the agent and the isolated run and keeps nothing.

## Existing components reused, not replaced

`SoftwareAgentWorkspace` (base/working files, change tracking), `evaluateWritePolicy`, `AgentSoftwareExecutor` and the `SoftwareAgentToolHost` contract, `SandboxRuntime`/`executeSandboxed`, `writeAtomically` + `makeAtomicWriteApi` (the only change to it is an optional `draft` flag, backward compatible, existing tests unchanged), `scanProjectFiles`, `redactModelContext`, the coding model router and `createXrogaAgentModelRoute`.

## Not verified, and why (also in `TRACEABILITY.md`)

- **No real model run.** The agent and model are wired but no provider credentials or spend were authorised; behaviour with a real Cline run is unproven.
- **No real GitHub.** Delivery is exercised against an in-memory git host that implements the production writer's transport, including compare-and-swap refusal; live GitHub receipts are BLOCKED (no authorised disposable account).
- **Google isolated execution is not connected** (see item 12): changes on the Google runtime end `unverified`, never verified. Connecting it needs a canonical run attempt per change, which touches the canonical scheduler and was not done unilaterally.
- Go tests, browser/Preview verification, database-migration tasks (Golden H) and real-database stores are unverified.
- The GitHub write path addresses the repository by `owner/name`; the binding is re-verified by immutable id immediately before, but a rename in that window is a residual risk.
