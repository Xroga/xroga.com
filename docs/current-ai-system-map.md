# Current AI System Map

Phase 0 archaeology. Every claim here was read from source at `main` = `59cdcf67a735d1fbf63049e911d936516e5b0bcd`, not from prior documentation. Where an earlier document disagrees, this document is the one that was checked against code.

## Entrypoints

| entrypoint | file | notes |
| --- | --- | --- |
| `POST /api/swarm/execute` | `backend/src/routes/swarm.ts:58,120` | streaming and non-streaming both call `runBuildPipeline` |
| `runBuildPipeline` | `backend/src/ai/pipeline.ts:834` | 3,946 lines; the only build orchestrator reachable from HTTP |

`projectId` reaches the pipeline from the request body (`swarm.ts:48`). Since #477 it is also recovered server-side from `(user_id, github_repo_name)` when the client omits it, which is the normal case — the browser only supplies it on `/dashboard/projects/<id>`.

## The three implementation routes that exist today

This is the central finding. There are **three** paths that can produce a project, and only one of them is the canonical runtime.

### 1. Legacy whole-project builder — the default, and what almost every user gets

`pipeline.ts:541` → `runBuilderAttempt` (`builderAttempt.ts`). One model call produces the whole project. This is the path taken whenever the universal path returns `null`, which is every non-allowlisted project.

### 2. Universal path — allowlisted only, and also one-shot

`pipeline.ts` → `tryUniversalBuild` (`synthesis/universalEntrypoint.ts:121`) → `executeUniversalRun`. Its `implement` adapter is a **single `chatCompletion` call** whose reply is parsed into a file map (`universalEntrypoint.ts`, `parseGeneratedFiles`). Since #478 it tries the router's ranked fallbacks in order rather than only the winner.

This path is architecturally cleaner than the legacy builder — it plans against a `UniversalProductSpec` and refuses rather than mis-building — but its implementation step is still **whole-project generation from one completion**, not an executed task graph.

### 3. Canonical execution runtime — real, but only used for synthesis

`ExecutionScheduler` (`ai/executionRuntime.ts:345`) is genuine: dependency ordering, retry policy, evidence records, state transitions, persistence via `SupabaseExecutionStateStore`.

It is instantiated in exactly **one** place in non-test code:

```
backend/src/synthesis/foundation.ts:173
  await new ExecutionScheduler(input.store, input.onEvent).run(state, handlers);
```

The handlers it runs are the eight **synthesis** stages — product definition, capability graph, compiled plan, architecture, framework adapter, inventory, operations manifest, verification plan — each producing content-addressed evidence. That is real canonical execution, and it works.

What it does **not** run is any engineering task.

## The orphaned engineering task graph

`pipeline.ts:1053`:

```ts
executionState.tasks.push(...executableTasksFromRoutePlan(intelligentPlan));
```

These engineering tasks are pushed into canonical state and then **persisted without ever being scheduled**. No handler map covers them; `ExecutionScheduler` is never constructed over them. Immediately after, two of them are marked finished by hand:

```ts
for (const taskClass of ['request_understanding', 'repository_analysis']) {
  ...transitionTask(executionState, task.id, 'completed', { evidence: [{
    ... summary: `Inspected ${prior.files.length} project files` ...
  }] });
}
```

The evidence string is composed by the pipeline, not produced by executing the task. A task is recorded as `completed` with a sentence describing work that no handler performed.

This is precisely the shape Phase 4 prohibits: a task graph is generated, persisted and described, while the actual implementation happens in a separate whole-project builder response.

## Where active state is duplicated

| fact | canonical owner today | competing copies |
| --- | --- | --- |
| repository identity | `meta.githubTargetRepo` (pipeline-local) | `executionState.repository`, project row, project memory |
| starting SHA | Command 1 writer reads it at write time | `executionState`, cached GitHub snapshot |
| task status | `executionState.tasks` | hand-set transitions in `pipeline.ts` |
| product spec | `synthesis.artifacts` | `universal_runs` (in-memory store until #478) |
| run status | `swarm_runs` row | `executionState`, in-memory `runs` map in `runStore.ts` |

`executionState` is written to but not read back as an authority. The pipeline's local variables remain the operative state.

## Provider selection

| stage | selector | file |
| --- | --- | --- |
| legacy route | `routePrompt` / `intelligentRouter` | `ai/intelligentRouter.ts` |
| universal implement | `routeByCapability` | `ai/capabilityRouter.ts` |
| model catalogue | `getRuntimeModelRegistry` | `ai/modelCapabilityRegistry.ts` |
| transport | `chatCompletion` | `ai/openaiCompat.ts` |

Two independent routers exist. `capabilityRouter` ranks by provenance-weighted profiles built from `modelCapabilityProfile.ts`; `intelligentRouter` uses hand-written strength scores. Phase 13 requires the hand-written scores be demoted to priors; today they are not labelled as such.

## Validation, research, GitHub

- **Validation** — `compileValidate.ts`, `staticValidate.ts`, `qa.ts`, `securityScan.ts`, run late and against the whole generated project rather than per task.
- **Research** — `synthesis/research/`, plus a `research` agent stage visible in run events (`Live research (web + X via Xroga Live)`). In the observed production run it emitted `No live sources available — continuing without research`.
- **GitHub** — Command 1 atomic writer (`services/integrations/githubAtomicWrite.ts`) is real and complete: single tree, single commit, compare-and-swap ref update, run branch from an exact recorded SHA. The universal path reaches it through `synthesis/universalCommit.ts` (#475). The legacy path uses `githubDeploy.ts`.

## Production evidence observed during this archaeology

From run `5baaed11-3b42-4e31-bad7-9346f189d22b` (production, allowlisted, 2026-08-09):

- `Build path: universal — the project is on the universal agent allowlist`
- `projectIdPresent: true`, `projectIdFromClient: false` — identity recovered from the repository
- capability router selected `glm_5_2` for implementation
- failed at implement: `glm_5_2 returned an empty completion`
- refusal text: `the legacy pipeline cannot build cli — its vocabulary is static, nextjs, expo, chrome and electron, so a fallback would succeed at building the wrong product rather than fail`

The last line is the strongest existing evidence for the universal mandate: an unknown non-web product was **not** converted into a website. It failed honestly.

No universal run has yet produced a commit.

## Summary of what Command 3 must actually change

1. The canonical scheduler already exists and works — it must be extended to run **engineering** tasks, not stood up again.
2. Hand-set `transitionTask(..., 'completed', ...)` calls in `pipeline.ts` must be replaced by real handler execution with real evidence.
3. The universal `implement` step must decompose into bounded tasks instead of one completion.
4. The legacy whole-project builder must move behind `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED` rather than remaining the default execution mechanism.
5. `executionState` must become authoritative rather than a parallel record the pipeline writes and ignores.
