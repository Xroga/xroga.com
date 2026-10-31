# Issue 906 response presentation

Scope: existing Workspace response renderer only. Batch 1.5 and Batch 2 activation are paused. No models, API deployment, SQL, IAM or paid infrastructure.

Baseline frontend: 0d270ec69bdcf130ff85ce27f524e1d0d1e59e23. Model-free signed-in fixture baseline: 6f9a24253fd4c78d3d8d99c4aaea2e08ed057163, Vercel Preview HS265Kct1mkMUmaocuR2vekqRT7u.

The live release branch differs from main. Review against release/research-source-attribution-20261031 to avoid including unrelated batch activation and to retain the live microphone. Production is unchanged.

## Implemented

One prose scale, 72ch reading width, restrained headings, natural opening paragraph, no completion-time sentence splitting, exact punctuation, aligned rich surfaces without a second decorative icon gutter. Twelve deterministic response specimens use the existing real Workspace renderer, are labeled synthetic, do not persist or submit messages, and are unavailable in Production.

## Verification

Local focused schema/Markdown/security tests passed. Frontend type checking passed. Full frontend suite: 1315 passed, zero failures, zero skipped, including the pending interaction changes in the same worktree. This is not exact-source CI or live acceptance.

Baseline screenshots retained locally under outputs/response-surface-906: desktop simple/long/table/chart/calculator, mobile long/calculator. Baseline h3 measured 22px at 1440px. Before/after visual acceptance and exact-source CI remain pending.

## Release and recovery

Preview only. Do not promote until final visual/security checks and applicable release approval. Recovery is the unchanged production frontend 0d270ec6. No data or schema changes require reversal. Follow-up interaction changes are separately reviewed.
