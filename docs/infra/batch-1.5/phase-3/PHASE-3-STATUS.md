# Batch 1.5 Phase 3: status (final checkpoint 2026-10-25)

Branch `claude/xroga-b15-phase3-20261024`, from the accepted Phase 2 checkpoint `6977a147`. Scope: `AUTHORITATIVE-SCOPE.md` (verbatim founder amendment and master,
OCI replaced by Google Compute Engine per the founder's 2026-10-24 decision). Nothing here is merged to `main` or deployed.

The verdict, the evidence and the open items are in `BATCH-1.5-PHASE-3-FINAL-ACCEPTANCE.md` and `FINAL-MATRIX.json`. Per-requirement detail is in
`TRACEABILITY.md`, product rows in `PRODUCT-MATRIX.md`, costs in `COST-REPORT.md`, and the cutover plan in `MIGRATION-ROLLBACK-EXIT.md`.

## What exists (all on the canonical architecture)
| Component | File | Notes |
|---|---|---|
| Plan contract and outcome postconditions | `backend/src/workers/browserPlan.ts` | strict step allow-list, selector alternatives, AI-to-deterministic fallback (model refusal only), write grants for consequential steps, postconditions judged by the backend |
| In-container job runtime | `deploy/browser-worker/runJob.mjs` | Playwright; Stagehand 4.2.0 attached locally (`localBrowser.connect`) before the start navigation when a plan has AI steps, with a host-served model; scope, counters and artifact budget enforced at the page |
| Real `BrowserWorkerPort` | `backend/src/workers/containerBrowserWorker.ts` | per-job `--internal` network + production egress proxy + reviewed container spec; orphan reaping at host start |
| Model route for Stagehand | `backend/src/workers/browserModelGateway.ts` | canonical ledger (`reserve/settle/release`), deterministic idempotency keys, output capped to the remaining allowance, unmeasured usage refused |
| Planner (goal to plan) | `backend/src/workers/browserPlanner.ts` | untrusted model output through the strict parser; cannot widen scope or grant writes |
| API-to-host transport | `backend/src/workers/browserCoordinator.ts`, `scripts/browser/browser-coordinator.mts` | HMAC over method, path, time, nonce and body; 60 s window; single-use nonces; https only (loopback excepted) |
| Capability on the canonical scheduler | `backend/src/workers/browserCapability.ts`, `backend/src/routes/browserRuns.ts` | issued `TenantContext` only; one `browser_automation` task on `ExecutionScheduler`; owner-scoped status; cancellation; 503 without host or Drive (no hosted fallback) |
| User-visible path | `frontend/src/components/automations/BrowserRun.tsx` (Browser Studio) | deterministic capture or model-planned goal; shows postconditions, evidence and failures |
| AI launch mode | `backend/src/workers/chromiumLaunch.ts` | one matched set: random loopback DevTools port, proxy bypass for exactly that port, DevTools origin allow-list of exactly Stagehand's runtime extension |

## Defect found and fixed in the final verification
W03 (real model) timed out on its AI click: Stagehand 4's `act()` runs inside the world its extension injects at navigation, and the worker attached Stagehand only at
the first AI step, after the start page had loaded. Fixed in `d3b5f9c3` by attaching first when a plan has AI steps. W03 then passed, and the full suite, the DevTools
attack battery and PRODUCT-009 were rerun on the rebuilt image.
