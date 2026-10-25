# Batch 1 integration verification (B-3), 2026-10-24

**What this is:** an isolated, pre-merge check of our Phase 2 branch against Codex's exact Batch 1 candidate. **What it is not:** the merge. Nothing was merged, pushed or deployed;
the check ran in a throwaway worktree that was never pushed. Handoff precondition 3 asks for `TenantContext` to be **accepted into `main`**; a virtual merge does not satisfy that and is
not presented as if it did.

| | |
|---|---|
| Our branch | `bc122338` (the Phase 2 checkpoint; the lock fix below came afterwards) |
| Codex candidate | `origin/codex/xroga-cloudrun-readiness-20261024` @ `e8164ba6` (PR #846, draft, based on PR #845 `codex/xroga-phase3-main-integration-20261023`, which is `MERGEABLE` into `main`). PR #803 (`codex/xroga-batch-01`) is still `CONFLICTING` and is not the candidate |
| Merged tree (hand-resolved) | `7daeeb4e68cab0392f7f25392ccb849537213cce` |
| Patch of every hand-resolved file against the candidate | `evidence/batch1-integration/resolution-over-codex-candidate.patch` (sha256 `0aaba8b5…2e2f0`) |

## Is the canonical `TenantContext` reused, and can ownership be forged?
- Reused, not duplicated. `StorageActor { userId, tenantId }` maps one to one onto `TenantContext { userId, tenantId, … }`: today both Batch 1 and Phase 1 define `tenantId = userId`, so no schema or ownership key changes.
- Phase 1's `actorFromUserId(userId)` is **replaced**, not kept: `actorFromTenantContext(context)` calls Batch 1's `requireTenantContext`, and `actorFromPersistedOwner(userId)` (for operator tools such as migrations) goes through `createTenantContext({ via: 'persisted_owner' })`, the same pattern Codex uses for background work. The three production references (the Drive route and two in `projectFiles`) were converted; nothing else used it.
- Forgery: `createTenantContext` returns a frozen object registered in a `WeakSet`; `requireTenantContext` accepts only registered objects. Codex's own receipt test asserts that a bare user id, a spread copy and a JSON clone are refused. The merged `storeProjectFile` calls `requireTenantContext` first, and the adapted Drive tests assert the same four forms (plus a hand-built object with the right fields) never reach Drive, and that another user's genuine context cannot write into a project it does not own.
- No duplicate authorisation layer was added. Phase 2's worker handler already takes issued authority from its caller and re-authorises through a callback; wiring that callback to Batch 1's `requireOwnedProject` is a one-line adaptation at the (future) registration site, not a new mechanism.
- Defect found and fixed in the integration: with no issued context the Drive route answered **500**; it now maps `TenantAccessError` to its 401, and a test pins it.

## Conflicts (three files) and how each resolved
| File | Conflict | Resolution |
|---|---|---|
| `.github/workflows/supabase-migrate.yml` | Codex also replaced the PR dry run with a secret-free validator (real PostgreSQL grammar via `libpg-query`, no database), but kept the PR job in the `Preview` environment with no `permissions` block | keep our stricter PR job (no environment, read-only token) and run **both** validators in it |
| `backend/src/index.ts` | morgan logging; `/ready`; boot duties | morgan: Codex's path-only token plus our redaction stream. `/ready`: Codex's vault middleware kept as the canonical custody gate, our evaluator reuses its round trip (`custodyRoundTrip: credentialVaultReadiness.checkReadiness`) and uses Codex's `probeDatabaseReadiness`. Boot: Codex removed schema DDL at boot, so our `ensureSchemas` duty is deleted and only the orphan-reconcile duty stays gated |
| `backend/src/services/storage/projectFiles.ts` | Codex rewrote `storeProjectFile(context, …)` around private delivery and **retired** `storeUserFile` and `readStoredFile`; Phase 1 had added the Drive write modes to the same function | Codex's function is the base. `legacy` is Codex's behaviour unchanged. `dual` adds the canonical Drive write and links `storage_object_id` (row and select list extended so Codex's exact-receipt check still holds). **`r2` fails closed**: Codex's private-delivery metadata schema knows only `database` and `private_r2`, so a `drive://` file would have no delivery handler. Phase 1's ordered legacy/R2 read path has no callers left in the candidate |

## Results on the merged tree
| Check | Result |
|---|---|
| TypeScript | clean, including all Phase 2 code against Codex's changes to `executionRuntime`, `runStore` and the auth middleware |
| Targeted suites (Phase 2 workers and runtime, Phase 1 storage and Drive routes, Codex security and custody, scheduler and canonical resume) | 500 tests: **499 pass, 0 fail, 1 POSIX-only skip** |
| Codex migration validator on the combined set | PASS, 145 migrations (our two migrations parse under the real grammar) |
| Our offline migration check on the combined set | PASS, 145 |
| Codex skip governance | needed **13 registrations** (9 Phase 1 skips that nothing governed before, 4 Phase 2 skips); PASS after registering them with reason, command and review date |
| Codex lockfile integrity | needed the backend lock regenerated after the merge (Codex's lock plus our one added package); PASS |
| Codex agent and installed-dependency gates | PASS |
| Codex toolchain gate | fails locally only because this machine runs Node 24; the pin is 22.21.1 and CI uses it |
| Not run here | Codex's full CI, its disposable-Supabase and browser jobs, real PostgreSQL for the merged storage tests |

## Defect found in OUR branch by this check (fixed, on the Phase 2 branch)
`backend/package-lock.json` was stale: Phase 1 added `@aws-sdk/s3-request-presigner` to `backend/package.json` without updating that lock. `Dockerfile.api` and the migration job's live verification step both run
`npm ci` against it, and `npm ci` failed on our branch. Merging would have broken the API image build and the live migration verification. Regenerated (one package added, seven transitive AWS/smithy packages moved to satisfy its
peer ranges) and `storage-phase1` now runs the same standalone `npm ci` so it cannot drift unnoticed.

## What the integrator must do (none of it done on `main`)
1. Merge Codex's stack in its own order (#845 then #846; #803 remains conflicting and is not required by #845).
2. Re-apply the resolutions in the patch above, or re-derive them from this page: workflow, `index.ts`, `projectFiles.ts`, the actor boundary and Drive route, the startup-policy trim, the 13 skip registrations, the regenerated backend lock.
3. Note the deployment consequence Codex's runbook already states: `await initializeCredentialVaultForServer()` at import makes the API **fail closed at boot** on a production host with no managed provider configured. Do not deploy the merged build to Fly before that is configured.
4. Decide `r2` project-file mode later by adding a Drive provider to the private-delivery schema and handlers; until then it is refused.

## Verdict for B-3
Pre-merge verification: **done and compatible**. Acceptance precondition 3 (accepted into `main`): **BLOCKED, approval-gated.** It requires the founder-controlled merge of Codex's stack; the production workflows can deploy Fly and apply SQL on that merge, so this work did not do it.
