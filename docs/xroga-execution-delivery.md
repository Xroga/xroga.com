# Delivery report — execution, observability, agent intelligence

Branch `fix/xroga-execution-observability`, from HEAD `5644b06`.

## Root causes found

The engineering result was **produced but never contracted**. The universal path builds a rich
result object and hands it to a frontend whose every renderer dispatches on `output.type` — a
field the object does not have. Nothing validated that the producer and the consumer agreed,
so the two drifted and no test noticed, because no test asserted over the real shape.

The three loss points all follow from that one gap: with no type, there was nothing to
recognise on render, nothing to preserve on failure, and nothing to reconstruct on recovery.

## What was actually broken

| # | Defect | Effect |
|---|---|---|
| D1 | Universal output had no `type` | `FeatureOutputView` rendered nothing; text fell through to `"Swarm task complete."` |
| D2 | Recovery threw on `status === 'error'` | Blocked runs showed `"The persisted build failed."`; blockers, files, evidence, commit SHA all discarded |
| D3 | `failRun` overwrote `rec.output` | A run that produced work and then threw late lost the artifact on both transports |
| D4 | Success recovery fell back to the generic sentence | Same degradation on the reconnect path |

D3 was not in the brief. It is the one that loses the most, because it destroys evidence at
persist time — fixing only D2 would have left it quietly discarding work.

## Files changed

**Backend** — `ai/engineeringArtifact.ts` (new), `ai/pipeline.ts`, `ai/runStore.ts`,
`synthesis/browserVerification.ts` (new), `ai/black-hole/agentRoles.ts` (new), plus four test
files.

**Frontend** — `lib/engineeringArtifact.ts` (new),
`components/terminal/EngineeringArtifactView.tsx` (new),
`components/terminal/FeatureOutputView.tsx`, `lib/swarm.ts`, `lib/api.ts`, plus one test file.

**Docs** — `docs/xroga-runtime-audit.md` (Phase 0), this file.

## Architecture before → after

**Before:** universal result → untyped object → SSE / persisted row → frontend dispatch on
`type` → no match → generic sentence. On failure, `failRun` replaced the object entirely.

**After:** universal result → `buildEngineeringArtifact` → `engineering_artifact` v1 → SSE /
persisted row → `isRenderableArtifact` → `EngineeringArtifactView`, with
`engineeringArtifactToText` as the text form. `failRun` merges the failure onto the artifact
rather than replacing it; recovery delivers a blocked artifact instead of throwing it away.

The execution architecture itself is unchanged. `ExecutionScheduler` remains the single
authority over task state and completion.

## Tests run — exact results

| Suite | Result |
|---|---|
| Backend (`npm test`, backend) | **2185 pass, 0 fail** |
| Frontend (`npm run test:frontend`) | **199 pass, 0 fail** |
| Backend typecheck + build (`tsc`) | clean |
| Frontend production build (`next build`) | clean |

New tests: 15 artifact contract, 6 durability, 10 frontend rendering/text, 17 verification
ladder, 19 agent role contracts — 67 total. No pre-existing test was modified or weakened; no
test was failing before this work.

Phase 9 coverage: items 1–8 and 10–14 are covered. Item 9 (repair receives real evidence) is
covered at the verification boundary — `verificationEvidenceForRepair` is asserted to forward
stacks verbatim. Item 11 (repair avoids unrelated refactoring) is covered as a **contract**
assertion, not a behavioural one; enforcing it at runtime needs a diff-scope check that does
not exist yet. Item 15 is not applicable — see OpenHands below.

## Browser verification status

The decision logic is implemented and fully tested: the ladder, the gating rules, the
noise filtering, and the repair-evidence extraction. **It has not been run against a live
generated app.** The Playwright driver that would populate `ViewportEvidence` from a real
sandbox is not wired in this branch, so `decideWebVerification` is currently a correct
decision function with no production caller.

That is a deliberate stopping point, not an oversight: wiring it requires starting generated
apps inside the sandbox, which spends real compute and needs the sandbox environment to
validate against. The decision logic is the part that must be right and the part that is
testable without infrastructure, so it is the part that shipped.

## Agent role changes

Five roles with explicit contracts — planner, implementer, repairer, reviewer, verifier. No
`model_governor`; there is no evaluation data for it to govern with, and adding it now would
be a component whose only possible behaviour is guessing.

Evaluator/implementer separation is enforced by `mayShareModel` rather than by convention.
Reviewer and verifier hold no authority. The subjective rules the brief excluded — issue
quotas, forced first failure, letter grades — are excluded, and the verifier contract says so
in a form a test asserts.

**These contracts are declarative and not yet wired into the execution path.** They constrain
nothing at runtime until the scheduler invokes roles through them.

## Model router / telemetry changes

None in this branch. The routing and telemetry work landed previously (`productionBridge`,
`ShadowSink`), and Phase 5 explicitly warns against promoting models without reliable
evaluation data — which does not exist yet, because no live provider run has been recorded.

## OPENHANDS — NOT ADDED

**Reason:** every capability it would provide already exists and is hardened here.
`sandbox/flyMachineSandbox.ts` and `sandbox/remoteSandbox.ts` provide isolated execution;
`ai/repositoryTools.ts` provides repository editing with path validation, blob limits and a
refusal taxonomy; `ValidationRunner` provides the terminal/tool-use loop. Duplicating those
behind an `EngineeringWorker` abstraction would add a second implementation of the isolation
boundary — the one component where a second implementation is most dangerous.

I could not benchmark OpenHands from this environment (no outbound egress), so I have no
measurement showing a concrete improvement. Adding it on the strength of a plausible argument
rather than a measurement is exactly what the brief says not to do.

## LANGGRAPH — NOT ADDED

**Reason:** the audit (section 2) established that Xroga already has exactly one execution-state
authority — `ExecutionStateStore` for task state, `runStore` for run records — with durable
persistence to Supabase, event sequencing, and a working polling-recovery path. LangGraph's
durable resume, checkpointing and dependency-graph execution overlap that entirely.

Introducing it would create the second state authority the brief explicitly forbids. No gap
was found that the current scheduler cannot reasonably provide, so there is nothing to justify
the risk.

## Known remaining blockers

1. **Browser verification has no production caller.** The decision function is ready; the
   Playwright driver and sandbox wiring are not.
2. **Agent role contracts are not enforced at runtime.** Declarative only until the scheduler
   invokes through them.
3. **Repair scope is contractual, not enforced.** Nothing currently rejects a repair diff that
   touches files outside its declared scope.
4. **The universal path is still flag-gated.** D1–D4 are reachable today only for allowlisted
   projects. They become reachable for everyone when `UNIVERSAL_AGENT_ENABLED=enabled`, which
   is the direction the product is moving — so these fixes land ahead of that, not after it.
5. **No live provider verification.** No provider credentials and no provider egress from this
   environment, so no engineering run was executed end to end.

## Rollback procedure

Each commit is independent and revertible.

- **Artifact contract (`db792b2`)** — `git revert db792b2`. The universal output returns to
  being untyped and the frontend returns to the generic sentence; no schema or data migration
  is involved, because the artifact is a shape inside an existing JSON column. Persisted runs
  written while it was live remain readable — they simply render through the old path again.
- **Verification and roles (`6a91ea3`)** — `git revert e0dd6c9`. Both modules are additive and
  have no production callers, so reverting removes dead code and nothing else.

No environment variable, feature flag or database change is required to roll back either.
