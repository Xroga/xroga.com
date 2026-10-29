# Batch 4 status (Claude continuation)

Branch `claude/batch4-engine`, continued from Codex's `codex/xroga-batch4-engine-20261029` at `e1db3eb2`, reconciled with `main` at `63b8c444` (Batch 3, PR #865, merged).
Development only. The production hold stays in place. No model call, deployment, migration, paid resource or live provider was used.

Statuses: VERIFIED_LOCAL (deterministic local test, named below), PARTIAL, MISSING, DEFERRED BY FOUNDER (needs a model, deployed infrastructure or a live provider, so it is
not PASS). Nothing here is a production or live-provider result.

## Update (second increment)

Added since the first checkpoint, all development only and covered by CI on the exact commit:

- Shared bounded repair controller, `ai/repairController.ts` (scripted-agent tests, no model). Not yet the loop Batch 2 or Batch 3 call; both keep their own tested loops.
- Verification gate adopted by Batch 2 QA and Batch 3 outcomes as an independent second check that can only downgrade.
- Engineering resource ledger (`docs/infra/batch-4/RESOURCE-LEDGER.md`): local migration, tenant-bound client, real-database and real-process tests. Not applied anywhere, not yet fed real provider usage, caps not configured.
- Event replay now reports a truncated history to a reconnecting client (`ai/eventReplay.ts`).
- Redaction of every run event fixed for seven credential shapes found by canary tests.
- Golden A–V classified in `docs/infra/batch-4/GOLDEN-MATRIX.md`: 1 PASS (contract level), 20 PARTIAL, 1 NOT_RUN.

The tables below describe the first checkpoint; where they disagree with the update above, the update and the golden matrix are current.

## Update (third increment)

Everything below is development only; the migration is unapplied and production is on hold.

- **Batch 3 repair loop now uses the shared controller** (`existingSource/change/service.ts`). Verification and every repair after the first attempt run through `runBoundedRepair`; the task's saved attempt count is the persisted state. A repair that edits a test the project already had is refused and rolled back. All 138 existing Batch 3 tests pass plus three new integration tests with a real process runner.
- **Batch 2 is intentionally not moved onto the controller.** Its repair is the canonical task graph's `validation_repair` task (attempt-capped, checkpointed by the graph). Wrapping it would add a second orchestrator, which the architecture invariants forbid. Batch 2 shares the verification gate.
- **Resource metering is connected** to the canonical sandbox seam (compute and browser time), `saveRevision` (bytes) and the maintenance tick (sweep), behind a flag, with configurable caps and record-only mode. See `RESOURCE-LEDGER.md`.
- **Delivery fairness fixed and measured** (`workers/fairSelection.ts`, `benchmarks/local-fairness-latency.json`).
- **Real-process delivery kill tests** (`backend/tests/googleDeliveryCrash.local.integration.ts`): dispatcher killed after reserving, worker killed after claiming, cancellation after admission.
- Golden A–V: 2 PASS (D local-process, R contract), 20 PARTIAL, 0 NOT_RUN.

## Reconciliation with main and Batch 3

| Item | Result |
| --- | --- |
| `googleDeliveryStore.ts` | Merged semantically: Batch 3's `existingSourceChangeId` (enqueue validation, claim validation, payload) is kept together with the bounded delivery selection. |
| `googleDeliveryStore.test.ts` | Both sides' tests kept. |
| `egress-callers.json` | Regenerated from the exact merged source in a Linux-style (LF) checkout: 148 reviewed, 0 pending, 0 unresolved high-risk. This AST audit is not a blanket security certification. |
| Test runs | 354 passed, 0 failed, 1 skipped (the POSIX orphan sweep cannot run on Windows and is not counted) for workers, project runtime, Google sandbox and reconciler. |

## Phase 1: canonical execution, durability and isolated development (PARTIAL)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Saved revision is durable only after an owner-bound read-back of the stored row | VERIFIED_LOCAL | `store.persistence.test.ts` (tampered bytes, missing row, unreadable store each refuse the receipt); `store.worker.test.ts` (worker path). Loopback PostgREST fixture, not a real database. |
| Restore recomputes the workspace fingerprint | VERIFIED_LOCAL (Codex) | `store.owner.test.ts`. |
| A queued request waiting for launch capacity is not ended as "worker stopped" | VERIFIED_LOCAL | `runReconciler.queue.test.ts`: queued runs keep a bounded 60-minute wait from admission or resume, then end as `never_started` ("Nothing was run"); worker-held runs keep the five-minute rule; legacy rows keep their old reason; terminal runs untouched. Uses a PostgREST filter evaluator, so filter semantics are proven rather than recorded. |
| Delivery rediscovery covers the same wait, includes launches whose lease expired with an unknown outcome, respects the five-attempt ceiling and the exact source | VERIFIED_LOCAL | `googleDeliveryStore.test.ts` "maintenance rediscovers...". |
| Lease takeover and fencing across a killed real process | VERIFIED_LOCAL (Codex) | `postgresLeaseStore.integration.test.ts` with a real PostgreSQL container. Not run in this session; the result is Codex's recorded evidence. |
| Durable browser-run checkpoints fenced by the current lease | VERIFIED_LOCAL (Codex) | `browserRunStore` integration test, same caveat. |
| Allocation cleanup classification | PARTIAL (Codex) | Synthetic provider fixtures only; an unrecorded allocation whose destruction fails still needs proof that it can be found and removed. |
| Real canonical-process crash after admission, before claim, and during a checkpoint | MISSING | Needs a multi-process harness against isolated storage. |
| Workspace path, symlink, package-script, metadata and network denial against a real provider | DEFERRED BY FOUNDER | Needs a real Google sandbox. |
| R2 object read-back and integrity | MISSING / DEFERRED BY FOUNDER | No R2 verification was possible without a bucket. |

## Phase 2: preview, testing and bounded repair (PARTIAL)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Verification gate: VERIFIED only with genuine receipts for the exact delivered source, run and attempt | VERIFIED_LOCAL | `ai/verificationGate.test.ts` (9 tests). Forged JSON, evidence for another source/run/project/newer attempt, skipped, not-run and unavailable checks, cancelled or stale attempts, non-durable source and unreceipted provider claims never verify. **Not yet adopted by the Batch 2 or Batch 3 completion paths.** |
| Revision-bound strict readiness and stale-preview detection | VERIFIED_EXISTING (Batch 2 builder) | `builder/previewLifecycle.ts`, `builder/canonical.ts`. The generic `GET /projectRuntime` preview route does not apply it: it derives status from runtime, process and grant facts only, and the runtime binding does not record the source fingerprint it was synced from. |
| Preview grant security, origin isolation, HTTP/WebSocket/HMR | VERIFIED_EXISTING (partly) | `livePreview/access.test.ts`, `signingDns.test.ts`, security local integrations. Not re-run for Batch 4. |
| Shared bounded repair controller | MISSING as one shared module | Batch 3's `ChangeService` has a bounded repair loop with evidence; Batch 2 has its own. They are not yet one controller. |
| Shared test-plan detection | PARTIAL | Batch 3 detects a plan per repository; Batch 2 differs. |
| Unsupported runtime reported as `TEST_RUNTIME_UNAVAILABLE` / `unavailable`, never PASS | PARTIAL | Batch 3 reports an honest unavailable outcome (sandbox-runtime fix, unit-tested). The shared gate maps `unavailable` to `blocked`. |
| Real-model repair, Playwright against a real preview | DEFERRED BY FOUNDER | |

## Phase 3: concurrency, budgets, events and certification (NOT STARTED beyond inventory)

| Requirement | Status | Note |
| --- | --- | --- |
| Event persistence with cursor replay | VERIFIED_EXISTING (partly) | `routes/swarm.ts` implements cursors. Not re-run. |
| Admission and per-user caps | VERIFIED_EXISTING (partly) | `workers/admission.ts`, launch gate allows 2 active runs. Fairness and chat-responsiveness under load were not measured. |
| Same-project write serialization | NOT RE-VERIFIED | |
| Sandbox compute, browser and storage metering and settlement | MISSING | No ledger for these exists; the model budget ledger does not cover them. Needs a migration and an owner-approved design. |
| Golden A–V | NOT RUN as a matrix | Goldens D, E, L, M, S, V need the multi-process and provider harness; A, B, C, F, K, O, P need a real runtime and model. |

## Known flake

`browserReadOnlyTransport.security.test.ts` ("real Chromium uses the actual worker hooks...") failed once under a full parallel run and passed twice when run alone. It is not related to these changes, but it is flaky under load.

## Not claimed

Phase 1, Phase 2, Phase 3 and Batch 4 are not accepted. Live-provider, staging and production verification: none.
