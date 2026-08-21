# Runtime audit — the engineering result path

Traced from `POST /api/swarm/execute` by following reachable calls rather than reading
definitions. **This records the state *before* the fix in this pull request**, which is why the
defects below are written in the past tense — the code they describe is the code this PR
changes.

Symbol references are used rather than line numbers, because the fix moves lines and a citation
that drifts is worse than none.

---

## 1. The real path

```
POST /api/swarm/execute                 routes/swarm.ts
  ├ non-stream branch → runBuildPipeline → JSON response
  └ stream branch → initSSE, client-supplied runId, keepalive, cancellation poll
                  → runBuildPipeline({ onProgress, onDelta, onCodeReady, signal })
```

Inside `runBuildPipeline` (`ai/pipeline.ts`):

```
routePrompt
  ├ non-build → chat path (returns early)
  └ build path
      ├ research / converter (Black Hole bridge, stage-gated)
      ├ routeProject → universal decision
      ├ tryUniversalBuild(...)
      │    └ non-null: completeRun + RETURN      ← the path this PR fixes
      └ else: legacy whole-project builder
```

**Which branch is live.** `tryUniversalBuild` returns `null` unless `UNIVERSAL_AGENT_ENABLED=enabled`
*and* the project is allowlisted. Production runs on `shadow`, so the legacy whole-project
builder serves ordinary users today and the universal path is reachable only for allowlisted
projects.

That bounds the blast radius of this change in both directions: the defects were reachable only
for allowlisted projects, and so is the fix. They become reachable for everyone when the
universal flag is enabled, which is why these fixes should land ahead of that rather than after.

## 2. Ownership of authoritative state

| Concern | Owner |
|---|---|
| Canonical task/execution state | `ExecutionStateStore` (`executionRuntime`) |
| Run status, output, events | `ai/runStore.ts` |
| Terminal run outcome | `completeRun` / `failRun` |
| Commit atomicity | `synthesis/universalCommit.ts` |

There is exactly one execution-state authority and one run-record authority. This PR does not
add, replace or duplicate either.

## 3. Defects found (all confirmed, all fixed by this PR)

### D1 — The universal result had no artifact type

`universalOutput` carried `universal, outcome, phaseReached, verified, reason, blockers,
commitSha, files, evidence, routing, repository` — and **no `type` field**. Both consumers
dispatch on `type`:

- `FeatureOutputView` tests `o.type` against `video_studio`, `image`, `landing_page` … and fell
  off the end of the list. **Rendered nothing.**
- `swarmOutputToText` tests `chat`, then `o.message` (absent), then `landing_page`, `image`,
  `video_studio`, `deep_research` — and returned the literal **`'Swarm task complete.'`**

A universal run that produced files and a real commit displayed as one generic sentence.

### D2 — Recovery discarded the artifact on blocked runs

A blocked universal run calls `completeRun(runId, { output: universalOutput, success: false })`.
`completeRun` sets `status = 'error'` but **preserves** the rich output — the backend was right.

The loss was on the client. The polling recovery path threw on `status === 'error'`, reading
only `output?.error`. `universalOutput` has no `error` key, so a blocked run with real blockers,
a file manifest, evidence and often a commit SHA rendered as **"The persisted build failed."**,
and the `throw` discarded the artifact entirely.

This is the path a dropped SSE stream lands on, so the richer the run, the more it cost.

### D3 — `failRun` overwrote any artifact already stored

`failRun` assigned `rec.output = { type: 'error', … }` unconditionally, destroying any artifact
previously written to that record. A run that produced files and a commit and then threw late
lost all of it, on both the SSE and the recovery path.

Distinct from D2: D2 lost the artifact at render time, D3 at persist time. Fixing only D2 would
have left D3 silently discarding evidence.

### D4 — Success recovery also degraded

The recovery path's success branch ended `… || 'Swarm task complete.'`, so an artifact producing
no text fell back to the same generic sentence.

## 4. Where output could be lost, before this PR

| Point | Mechanism | Fixed by |
|---|---|---|
| Universal run → client | no `type` ⇒ no renderer, generic text | D1 |
| Blocked run → recovery | `throw` discarded `run.output` | D2 |
| Late failure → persistence | `failRun` overwrote `rec.output` | D3 |
| Success recovery, empty text | generic fallback | D4 |
| SSE dropped entirely | already mitigated — client-supplied `runId` enables polling | — |

## 5. Legacy / dead / duplicated

- **Legacy whole-project builder** — live and reachable, flag-guarded, defaulting enabled. Not
  dead, and untouched by this PR.
- **`routePrompt`** — still the model selector for the legacy path. Untouched.
- **`routes/retiredSurface.ts`** — genuinely inert.
- **Duplication** — the legacy and universal paths each own a validate/repair/publish sequence.
  Real, but removing it is a migration rather than a bug fix, and out of scope here.

## 6. What this audit does not cover

Browser verification, agent role contracts and any change to model routing are **not** part of
this audit or the PR it accompanies. They are tracked separately and have no production caller.
