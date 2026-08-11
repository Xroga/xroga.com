# Migration and rollback

How Command 3 work reaches production without a rewrite, and how each step is undone.
Covers §30 (migration gates) and the rollback obligations in §23 and §29.

Companion to `docs/agent-component-migration-map.md`, which classifies every component;
this document covers the *procedure*, not the inventory.

## The governing constraint

**Do not introduce a new abstraction where an existing one can be safely extended.**

The canonical scheduler (`ai/executionRuntime.ts`) already existed, already enforced the
evidence gate, and was under-used rather than wrong. Most of this migration is about
routing work into it — not building alongside it. A second scheduler beside the first is
the duplicate-state failure §3A names.

## Migration is by slice, not by rewrite

`ai/pipeline.ts` is the only build orchestrator reachable from HTTP and serves all live
traffic. It stays as the public facade: `runBuildPipeline`'s signature, its progress
events, its ship outcomes and its blocker messages must not change. Internals move
underneath it, one slice at a time.

Each slice must independently satisfy:

1. The full backend suite passes with no test weakened or deleted to accommodate it.
2. The slice is reversible without a data migration.
3. The public facade behaves identically for any project not routed to the new path.

A slice that cannot meet all three is not ready, regardless of how correct it looks.

### Completed slices

| Slice | Evidence |
| --- | --- |
| Hand-set task completions replaced by real `ExecutionScheduler` execution | `engineeringTasks.test.ts` |
| Refusing commit replaced by `atomicGitHubCommit` (Command 1 writer) | `universalCommit.test.ts`, PR #475 |
| Provider isolation enforced at every routing site | `providerPolicy.test.ts` |
| Whole-project generation replaced by incremental per-file implementation | `incrementalImplementation.test.ts` |
| Benchmark evidence carried into routing and maturity | `benchmarkLedger.test.ts`, PR #498 |

### Outstanding slices

| Slice | Blocked by |
| --- | --- |
| Implementation, validation, review and publish tasks move from inline `pipeline.ts` code into scheduler handlers | Nothing — next in sequence |
| `taskGraph.ts` / `executionRuntime.ts` state vocabularies consolidated | Should precede either growing further |
| Benchmark **runner** executing the suite against live providers | Provider budget authorization |
| Fine-tuning submission interface (§26) | Consent gate exists; the capability it guards does not |

## Rollback

### The universal path

Rollback is setting `UNIVERSAL_AGENT_ENABLED` back to `shadow` or unsetting it. No data
migration is involved.

An unrecognised value is **off**, not an error. A typo in an environment variable must not
enable a code path; the failure mode of a misread flag should be "nothing changed".

Narrowing works at three levels, cheapest first:

1. Remove a project from `UNIVERSAL_AGENT_ALLOWLIST` — affects that project only.
2. Lower `UNIVERSAL_AGENT_PERCENTAGE` — bucketing is deterministic per project, so a
   project that was routed stays routed until the percentage drops below its bucket.
3. Set `shadow` or unset — universal writes stop entirely. `mayWrite(decision)` returns
   false whenever `shadow` is set, asserted across every combination of mode and
   percentage.

Bucketing is deterministic *because* rollback needs it to be: a project that moved between
paths on retry would produce a run that half-executed under one pipeline and resumed under
the other, which is harder to diagnose than either being wrong on its own.

### Published commits

A universal run publishes through `atomicGitHubCommit`: one tree, one commit, one
compare-and-swap ref update. There is no partial-write state to unwind — the ref either
moved or it did not.

Rollback of published content is therefore ordinary git: the branch is `xroga/<run-id>` and
the change arrives as a pull request. An unmerged pull request is closed; a merged one is
reverted. Xroga never force-updates a customer's default branch, so no rollback requires
recovering overwritten history.

Files the run did not generate are preserved by the writer, and `100755` modes are
retained. A rollback therefore cannot resurrect a file the run never touched, because the
run never removed it.

### Capability maturity

Maturity is derived, not stored as a decision, so "rolling back" a capability claim means
the gates or observations changed and the next assessment reports the lower state.
`DEGRADED_SUCCESS_RATE` (0.60) over at least 5 samples pulls a capability that had reached
`beta` or `verified` down to `degraded` automatically. Current behaviour outranks a past
assessment; no manual demotion step exists, and none should.

`rollbackExists` is itself one of the eight verification gates. A capability cannot be
`verified` unless a rollback path for it exists — the gate is deliberately upstream of the
claim.

## What migration must never do

These are not stylistic preferences; each has a test or a policy behind it.

- **Weaken a test to make a slice pass.** The suite is the evidence that the facade still
  behaves. A slice that requires weakening it has changed behaviour it claimed not to.
- **Weaken Command 1 GitHub protections.** The atomic writer's refusal to write to an empty
  repository is by design, not a bug to route around.
- **Weaken authorization, RLS or sandbox isolation.**
- **Use a customer project for destructive or experimental testing.**
- **Invent a success status outside the completion system.** Statuses are derived from
  evidence; see `backend/src/operations/completionGate.ts`.

## Related

- `docs/agent-component-migration-map.md` — per-component classification and risk.
- `docs/universal-agent-rollout.md` — flag semantics and the suggested rollout sequence.
- `docs/command-3/execution-state.json` — current derived status and outstanding conditions.
