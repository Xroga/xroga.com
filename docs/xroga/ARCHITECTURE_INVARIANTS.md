# Architecture invariants

These are mandatory engineering boundaries, not claims that every existing caller already complies. Current gaps remain in the truth, runtime, requirements and security evidence. AGENTS.md uses the same stable IDs.

| ID | Invariant | Canonical evidence/boundary |
| --- | --- | --- |
| INV-01 | One canonical execution integration | `backend/src/routes/swarm.ts` → `ai/pipeline.ts` → synthesis/SoftwareAgent; `docs/xroga/current-call-paths.md`. A filename is not active-runtime proof. |
| INV-02 | No convenience second orchestrator | Structured architecture exception + RFC, migration and rollback before a new control plane. |
| INV-03 | Backend is authority | Model text is not permission, tenant proof, provider completion or accounting truth. |
| INV-04 | Outcome-specific verification | Approved acceptance/evidence; `golden-journey-matrix.json`. 200/snippet/UI-only is insufficient. |
| INV-05 | Explicit verified tenant identity | Existing auth middleware, owner checks and later canonical context/RLS; service-role bypass is not ownership. |
| INV-06 | Exact consequential authority | Existing business/operations approval boundaries must be extended, not replaced by LLM consent. |
| INV-07 | Bounded authoritative cost | Existing provider budget/quota/ledgers; durable reservation/settlement and distinct storage accounting need proof. |
| INV-08 | Protected credentials | Server-only, redacted evidence, verified key authority; no model/client secret payload or development production key. |
| INV-09 | Durable owner-bound evidence | Existing run events/checkpoints/storage; memory and browser cache are not cross-process durability. |
| INV-10 | No fake completion | Code-complete, verified scope, simulated receipt and actually live are separate. BLOCKED_KNOWN_GAP never PASS. |
| INV-11 | Relevant available capabilities | Existing typed semantic planner/capability registry; no arbitrary catalog/default account suggestions. |
| INV-12 | Small reversible change | Preserve unrelated work, explicit impacts, migration rollout, tests, evidence and rollback. |

Enforcement: `scripts/xroga/mission-check.mjs`, strict `mission-manifest.schema.json`, policy fixtures, canonical baseline/skip/lock/runtime/ledger/golden gates and human security/architecture review. Structured checks do not certify arbitrary prose or prove runtime compliance from a declaration. A hidden menu does not secure founder diagnostics; current backend admin/owner APIs remain broader than founder policy.
