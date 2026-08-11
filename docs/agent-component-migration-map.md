# Agent Component Migration Map

Phase 1 classification. Read against `main` = `59cdcf6` plus the Command 3 slices on `claude/consolidated-agent-intelligence`. Companion to `docs/current-ai-system-map.md`, which holds the evidence behind these decisions.

Classifications: **KEEP** (correct as-is), **EXTEND** (grows to serve the canonical runtime), **REPLACE_INTERNALS** (public surface stays, internals move), **DEPRECATE** (behind a flag, retained for rollback), **DELETE_AFTER_MIGRATION** (removed once gates pass and the rollback window closes).

The governing constraint: **do not introduce a new abstraction where an existing one can be safely extended.** The canonical scheduler already exists and already enforces the evidence gate. Most of this map is about routing work into it, not building alongside it.

---

## Runtime and orchestration

### `ai/executionRuntime.ts` — **KEEP**

| | |
| --- | --- |
| Responsibility | Canonical execution state, `ExecutionScheduler`, mutation service, evidence gate |
| Callers | `synthesis/foundation.ts` (synthesis stages), `ai/pipeline.ts` (engineering tasks, as of this branch) |
| Persistence | `SupabaseExecutionStateStore` / `InMemoryExecutionStateStore` |
| Tests | `executionRuntime.test.ts`, `engineeringTasks.test.ts` |
| Target | Unchanged. This is the canonical runtime Command 3 asks for; it was under-used, not wrong. |
| Risk | Low |
| Removal | Never |

It already refuses to complete a task without evidence, serialises mutating tasks, retries non-mutating failures with backoff, and emits progress events. Building a second scheduler beside it would be the error §3 warns against.

### `ai/pipeline.ts` — **REPLACE_INTERNALS**

| | |
| --- | --- |
| Responsibility | 3,946 lines: the only build orchestrator reachable from HTTP |
| Callers | `routes/swarm.ts:58,120` |
| Persistence | `swarm_runs` via `runStore`, `execution_runs` via `executionStore` |
| Tests | `p0Regressions.test.ts`, `previewNotVerified.test.ts`, `failRun.test.ts`, many others |
| Target | Remains the public facade (`runBuildPipeline`) and delegates engineering to the canonical runtime |
| Risk | **High** — it serves all live traffic |
| Compatibility | Signature, progress events, ship outcomes and blocker messages must not change |
| Removal | Facade never removed; internals migrate incrementally |

Migration is by slice, not rewrite. Already done on this branch: hand-set task completions replaced by real scheduler execution. Still to do: implementation, validation, review and publish tasks move from inline code into handlers.

### `ai/taskGraph.ts` + `ai/taskGraphRunner.ts` — **EXTEND**

Independent graph model with its own state vocabulary (`TASK_STATES`, `assertAcyclic`). Overlaps `executionRuntime`'s task model. Consolidate the vocabularies before either grows further — two task state machines is exactly the duplicate-state problem §3A names. Low risk today because neither drives implementation.

---

## Synthesis

### `synthesis/foundation.ts` — **KEEP**

Runs eight synthesis stages through the real scheduler with content-addressed evidence. This is the pattern the engineering tasks now follow. The only non-test construction of `ExecutionScheduler` before this branch.

### `synthesis/universalEntrypoint.ts` — **EXTEND**

| | |
| --- | --- |
| Current | Routes by capability, then calls `implementIncrementally` — a manifest call followed by one call per file |
| Target | Decompose into bounded tasks executed by the canonical scheduler |
| Risk | Medium — allowlisted projects only |
| Removal | The `implement` closure goes once scheduler task handlers cover implementation |

Carries the fallback chain (#478), durable persistence (#478) and provider-policy enforcement.

The whole-project-in-one-completion step §11 forbids is **gone**: `universalEntrypoint.ts:194` now calls `implementIncrementally`, which the single-call approach forced after it failed against every coding model in production (run `05769971`) — a project encoded as one JSON object under a 16k ceiling ends mid-string, and `JSON.parse` then rejects the entire reply, losing nine finished files because the tenth was clipped. Raising the ceiling only moves that cliff.

What remains is the *scheduler* half: implementation runs incrementally but still inside a closure rather than as canonical tasks with per-task evidence.

### `synthesis/universalCommit.ts`, `universalExecution.ts`, `universalPersistence.ts` — **KEEP**

Atomic publication, phase machine and durable storage. `universalPersistence` had a real defect — `universalStore(null)` built an in-memory store, fixed in #478.

### `synthesis/productBlueprints.ts`, `projectScaffold.ts` — **KEEP**

§11 is explicit: accelerators, not restrictions. They must never determine the maximum product categories. No change needed; the constraint is on how planning consults them.

---

## Providers and routing

### `ai/providerPolicy.ts` — **KEEP** (new on this branch)

The single answer to "may this model write code?", as an allowlist. Every routing site defers here.

### `ai/models.ts` — **KEEP** (was EXTEND; closed by #501)

`grok_4_5`'s role string advertised "coding agents", contradicting the enforced policy. Corrected to state research-only explicitly. A test now asserts that no research model's role string advertises coding, because the risk was never runtime selection — `providerPolicy` always governed that — but a reader concluding the filter was a bug and removing it.

### `ai/modelCapabilityRegistry.ts` — **KEEP** (was EXTEND; closed by #501)

`STRENGTHS` is now `UNVERIFIED_PRIOR_STRENGTHS`, with a comment stating that nothing in it was observed and that `capabilityRouter` confidence-weights it by provenance so a measured 7 outranks a hand-written 9 — §13's requirement. Both Grok coding priors are `0`: §7 forbids a research provider holding coding scores at all, and a prior that would be dangerous if the upstream filter were removed is not one worth keeping.

### `ai/router.ts` — **KEEP**

Coding routes use only `kimi_k3`, `glm_5_2`, `deepseek_v4_pro`: compliant. Its non-coding `builder` field is a naming artifact, worth renaming for clarity but not behaviour.

### `ai/intelligentRouter.ts` + `ai/capabilityRouter.ts` — **EXTEND**

Two routers over the same registry: one by hand-written strengths, one by provenance-weighted profiles. §13 wants the second to win as evidence accumulates. Consolidate rather than delete — `intelligentRouter` produces the subtask plan the engineering graph is built from.

### `ai/openaiCompat.ts`, `providerRuntime.ts` — **KEEP**

Transport, retries, circuit breaking, token accounting. §6 explicitly forbids a competing gateway.

---

## Validation, memory, publication

| component | class | note |
| --- | --- | --- |
| `compileValidate.ts`, `staticValidate.ts`, `qa.ts`, `securityScan.ts` | **EXTEND** | Correct, but run late against the whole project. §19 wants them per task. |
| `sandbox/` (Command 1) | **KEEP** | Isolated execution. §-critical: generated code must never run on `xroga-api`. |
| `services/integrations/githubAtomicWrite.ts` and siblings | **KEEP** | Complete and correct: one tree, one commit, compare-and-swap ref update. |
| `services/integrations/githubDeploy.ts` | **EXTEND** | Legacy publish path; converges on the atomic writer. |
| `ai/projectMemory.ts`, `sessionMemory.ts` | **EXTEND** | §24 requires source, timestamp, confidence and an invalidation rule per record, and exact HEAD must outrank memory. |
| `ai/runStore.ts` | **KEEP** | Run records. #479 fixed the universal path never closing one. |
| `ai/truthfulExecution.ts`, `shipOutcome.ts` | **KEEP** | Truthful outcome reporting — the property the rest of this work protects. |

---

## Legacy implementation

### `ai/builderAttempt.ts` + `ai/siteBuilder.ts` — **DEPRECATE**

| | |
| --- | --- |
| Current | Whole-project generation from one model call; what nearly every user gets today |
| Target | `LegacyWholeProjectBuilderAdapter` behind `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED` |
| Risk | **High** — removing it prematurely removes the product |
| Removal | Only after §30 migration gates pass **and** the rollback observation window closes |

§5 is explicit that this is not deleted now. It stays as the emergency rollback path.

---

## Sequenced plan

1. ~~Provider isolation~~ — done, this branch
2. ~~Engineering tasks execute with earned evidence~~ — done, this branch
3. Role definitions and tool permission boundaries (§11A, §29A)
4. Repository tool layer and task-aware context (§16, §17)
5. Implementation handlers — the point where one-shot generation stops being the normal path (§4, §18)
6. Per-task validation, bounded repair, independent and security review (§19)
7. `LegacyWholeProjectBuilderAdapter` behind its flag (§5)
8. Capability evidence, durable provider health, maturity levels (§13, §15, §23)
9. Coding and research evaluation suites (§21, §22)
10. Operations and Growth reconciliation (C3B-01..60, C3C-01..20)

Each is independently mergeable and leaves `main` deployable. Steps 5 and 7 are the ones that change what a user receives, and both are gated by §30.
