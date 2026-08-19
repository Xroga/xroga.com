# Xroga runtime audit — what actually executes

Traced from `POST /api/swarm/execute` on HEAD `5644b06`, by following reachable calls rather
than reading definitions. Every claim below cites the file and line that proves it.

---

## 1. The real path

```
POST /api/swarm/execute                       routes/swarm.ts:32
  ├ auth (req.userId)                         routes/swarm.ts:34
  ├ non-stream branch → runBuildPipeline      routes/swarm.ts:61      (JSON, no SSE)
  └ stream branch
      ├ initSSE + client-supplied runId       routes/swarm.ts:82,93
      ├ keepalive 15s                         routes/swarm.ts:95
      ├ cancellation poll 1.5s                routes/swarm.ts:104
      └ runBuildPipeline({ onProgress, onDelta, onCodeReady, signal })
                                              routes/swarm.ts:136
```

Inside `runBuildPipeline` (`ai/pipeline.ts`):

```
routePrompt (keyword table)                   ai/pipeline.ts:810
  ├ non-build → chat path (returns early)
  └ build path
      ├ research        (Black Hole bridge, stage-gated)   ai/pipeline.ts:~1455
      ├ converter       (Black Hole policy, stage-gated)   ai/pipeline.ts:~1578
      ├ routeProject → universal decision                  ai/pipeline.ts:1201
      ├ tryUniversalBuild(...)                             ai/pipeline.ts:1240
      │    └ IF it returns non-null: completeRun + RETURN  ai/pipeline.ts:1320,1327
      └ ELSE legacy whole-project builder continues        ai/pipeline.ts:1336+
           ├ callBuilderStream (model)                     ai/pipeline.ts:~1804
           ├ QA + compile validation
           ├ repair (Black Hole bridge, stage-gated)       ai/pipeline.ts:~2383
           └ GitHub publish / deploy
```

**Which branch is live today.** `tryUniversalBuild` returns `null` unless
`UNIVERSAL_AGENT_ENABLED=enabled` *and* the project is allowlisted
(`ai/pipeline.ts:1217-1219`). Production runs on `shadow`, so **the legacy whole-project
builder is the reachable implementation path for ordinary users today**, and the universal
path is reachable only for allowlisted projects.

That matters for everything below: the artifact defect described in Phase 1 is real, and it
is currently reachable **only on the universal path**. It becomes reachable for everyone the
moment the universal flag is turned on, which is the direction the product is moving.

## 2. Ownership of authoritative state

| Concern | Owner | Evidence |
|---|---|---|
| Canonical task/execution state | `ExecutionStateStore` / `executionRuntime` | `synthesis/universalExecution.ts:41` |
| Run status, output, events | `ai/runStore.ts` (`runs` map + `flushPersist`) | `ai/runStore.ts:99-144` |
| Terminal run outcome | `completeRun` / `failRun` | `ai/runStore.ts:99,121` |
| Model selection | Black Hole bridge, stage-gated | `ai/black-hole/productionBridge.ts` |
| Commit atomicity | `synthesis/universalCommit.ts` | `atomicGitHubCommit` |

There is exactly **one** execution-state authority (`ExecutionStateStore`) and one run-record
authority (`runStore`). No second scheduler exists. This is the finding that decides Phase 7.

## 3. Where each thing happens

- **Model calls** — `ai/openaiCompat.ts` only, via `black-hole/providerAdapter.ts`. Every
  call resolves through `resolveEndpoint`, which enforces the transport binding.
- **Real code execution** — `ValidationRunner` adapters passed into
  `synthesis/universalExecution.ts`; the legacy path validates via `ai/compileValidate.ts`
  and `ai/qa.ts`.
- **Validation** — `universalExecution` phase `validation`; legacy `qa` + `compileValidate`.
- **Repair** — `universalExecution` phase `repair` / `synthesis/repairLoop.ts`; legacy
  `ai/pipeline.ts:~2383`.
- **Verification** — `synthesis/verificationCompiler.ts` + `UniversalExecutionResult.verified`.
- **Publishing** — `synthesis/universalCommit.ts` (universal), `ai/githubShippingPlan.ts`
  (legacy).
- **Frontend artifacts** — `frontend/src/components/terminal/FeatureOutputView.tsx`.

## 4. Defects found

### D1 — The universal result has no artifact type (CONFIRMED, Phase 1)

`universalOutput` is built at `ai/pipeline.ts:1275` with these keys:

```
universal, outcome, phaseReached, verified, reason, blockers,
commitSha, files, evidence, routing, repository
```

There is **no `type` field**. Consequences, both reachable:

- `FeatureOutputView` (`FeatureOutputView.tsx:22-39`) tests `o.type` against
  `video_studio`, `image`, `landing_page` … and falls off the end. **Renders nothing.**
- `swarmOutputToText` (`lib/swarm.ts:19-40`) tests `o.type === 'chat'`, then
  `typeof o.message === 'string'` (absent), then `landing_page`, `image`, `video_studio`,
  `deep_research` — and returns the literal **`'Swarm task complete.'`**

So a universal run that produced files and a real commit displays as a single generic
sentence with no artifact. The backend work happened; the user cannot see any of it.

### D2 — Recovery discards the artifact on blocked runs (CONFIRMED, Phase 2)

A blocked universal run calls `completeRun(runId, { output: universalOutput, success: false })`
(`ai/pipeline.ts:1320`). `completeRun` sets `status = 'error'` but **preserves** the rich
output (`runStore.ts:110-111`). Good.

The loss happens on the client. In the polling recovery path (`frontend/src/lib/api.ts:203`):

```ts
if (run.status === 'error') {
  const output = run.output as { error?: string; ... } | null;
  throw new ApiError(output?.error ?? 'The persisted build failed.', 500, { ... });
}
```

`universalOutput` has no `error` key, so a blocked run with real blockers, a file manifest,
evidence and possibly a commit SHA is rendered as **"The persisted build failed."** — and the
`throw` discards the artifact entirely. This is precisely the failure the task describes, and
it is on the recovery path, which is the path a dropped SSE stream lands on.

### D3 — `failRun` overwrites any artifact already stored (CONFIRMED, not in the brief)

`failRun` (`runStore.ts:133`) assigns `rec.output = { type: 'error', error, code }`
unconditionally. Any engineering artifact previously written to that record is destroyed. A
run that produced files and a commit and then threw late loses all of it, on both the SSE and
the recovery path.

This is a different bug from D2 — D2 loses the artifact at render time, D3 loses it at
persist time — and fixing only D2 would leave D3 silently discarding evidence.

### D4 — Success recovery also degrades

Same file, line 213: the recovery path's success branch ends
`… deliverSwarmComplete(...) || 'Swarm task complete.'`, so an artifact that produces no text
falls back to the same generic sentence rather than rendering.

## 5. Where output/evidence can currently be lost

| Point | Mechanism | Severity |
|---|---|---|
| Universal run → client | no `type` ⇒ no renderer, generic text | high (D1) |
| Blocked run → recovery | `throw` on `status==='error'` discards `run.output` | high (D2) |
| Late failure → persistence | `failRun` overwrites `rec.output` | high (D3) |
| Success recovery, empty text | `|| 'Swarm task complete.'` | medium (D4) |
| SSE dropped entirely | mitigated — client-supplied `runId` enables polling | low (already fixed) |

## 6. Legacy / dead / duplicated

- **Legacy whole-project builder** — live and reachable; flag-guarded by
  `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED`, defaulting enabled. Not dead.
- **`routePrompt`** — still the model selector for the legacy path when the Black Hole
  cutover stage is `legacy_only` (the default). Not dead.
- **`routes/retiredSurface.ts`** — genuinely inert; returns a retirement notice.
- **Duplication** — the legacy and universal paths each own a validate/repair/publish
  sequence. That is real duplication, but removing it is a migration, not a bug fix, and the
  §40-style preconditions for deleting the legacy path are not met.

## 7. What this audit decides

- **Phase 1/2 are real and worth fixing now.** D1–D4 are four concrete defects with a small
  shared fix: a typed, versioned artifact that both transports and both render paths agree on.
- **Phase 7 (LangGraph) is answered by section 2.** There is already exactly one execution
  authority with durable persistence. Introducing LangGraph would create a second.
- **Phase 6 (OpenHands) needs the isolation story**, covered in the delivery report.
