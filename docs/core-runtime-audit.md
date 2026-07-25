# Core runtime audit (Command 1)

This matrix records the latest-main audit at `439a0c2` and the implementation performed on `agent/complete-core-execution-runtime`. “Verified complete” means an executed test or a live code path backs the claim; it does not mean every external account is configured.

| Subsystem | At audit | Command 1 result | Evidence |
|---|---|---|---|
| Task classification | verified_complete | skipped | `taskClassifier.test.ts` |
| Capability registry | verified_complete | skipped | `capabilityRegistry.test.ts` |
| Adaptive orchestration and recovery planning | verified_complete | extended, not duplicated | `adaptiveEngine.test.ts` |
| Task-graph generation | partially_working | executable node conversion added | `executionRuntime.test.ts` |
| Task-graph execution and restart | missing | persisted dependency scheduler added | scheduler/restart tests |
| Model capability registry and selection | verified_complete | history signal added | router and routing-persistence tests |
| Provider health and fallback | partially_working | bounded fallback/cancellation/failure policy completed | `providerRuntime.test.ts` |
| Context preparation | declared_but_not_executed | targeted index/retrieval/redaction integrated | `contextPreparation.test.ts` |
| Repository retrieval | verified_complete | reused | pipeline hydration and file-selection tests |
| Canonical project state | missing | one persisted run state added | execution runtime and migration 038 |
| File mutation | partially_working | existing pure patch helpers retained behind one atomic stateful service | mutation concurrency test |
| Validation pipeline | partially_working | real package production build required | compile validation regression test |
| Reviewer selection | broken | selected reviewer now performs structured review | `reviewerRouting.test.ts` |
| Security review | partially_working | risk triggers and structured findings completed | router/reviewer tests |
| Targeted repair | partially_working | existing category-based repair retained and supplied build/review evidence | pipeline + router tests |
| Routing-history persistence | declared_but_not_executed | startup reload and time-decayed task-specific quality added | simulated restart test |
| GitHub operations | verified_complete | skipped | truthful publish and ship-outcome tests |
| Vercel operations | verified_complete | production gate tightened; deploy implementation reused | build-gate and ship-outcome tests |
| Status events | partially_working | canonical event schema and evidence-derived progress added | scheduler tests |
| Final outcome evaluation | partially_working | canonical required-task evaluator added | execution runtime tests |
| Public diagnostics security | broken | provider/key/route details removed from public health/config | `safeHealth.test.ts` |

No duplicate router, classifier, provider registry, patch parser, GitHub publisher, Vercel deployer, or recovery planner was introduced. The new runtime composes those existing components.

## External-only boundaries

- Authenticated provider calls require user or platform provider credentials.
- Remote GitHub evidence requires a connected GitHub account and successful remote API response.
- A deployment is complete only after Vercel returns an ID/URL and reachability verification succeeds.
- Supabase migration 038 must be applied before durable canonical run-state persistence is available in production.
