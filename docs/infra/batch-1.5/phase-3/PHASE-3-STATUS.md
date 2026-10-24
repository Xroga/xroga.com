# Batch 1.5 Phase 3: status (in progress)

Branch `claude/xroga-b15-phase3-20261024`, from the accepted Phase 2 checkpoint `6977a147`. Scope: `AUTHORITATIVE-SCOPE.md` (verbatim founder amendment and master,
OCI replaced by Google Compute Engine per the founder's 2026-10-24 decision). Nothing here is merged to `main` or deployed.

## What exists now (all on the canonical architecture)
| Component | File | Notes |
|---|---|---|
| Plan contract and outcome postconditions | `backend/src/workers/browserPlan.ts` | strict step allow-list, selector alternatives, AI-to-deterministic fallback (model refusal only), write grants for consequential steps, postconditions judged by the backend |
| In-container job runtime | `deploy/browser-worker/runJob.mjs` | Playwright; Stagehand 4.2.0 attached locally (`localBrowser.connect`) with a host-served `ClientLLM`; scope, counters and artifact budget enforced at the page |
| Real `BrowserWorkerPort` | `backend/src/workers/containerBrowserWorker.ts` | per-job `--internal` network + production egress proxy + reviewed container spec; orphan reaping at host start |
| Model route for Stagehand | `backend/src/workers/browserModelGateway.ts` | canonical ledger (`reserve/settle/release`), deterministic idempotency keys, output capped to the remaining allowance, unmeasured usage refused |
| Planner (goal to plan) | `backend/src/workers/browserPlanner.ts` | untrusted model output through the strict parser; cannot widen scope or grant writes |
| API-to-host transport | `backend/src/workers/browserCoordinator.ts`, `scripts/browser/browser-coordinator.mts` | HMAC over method, path, time, nonce and body; 60 s window; single-use nonces; https only (loopback excepted); model requests relayed back to the API |
| Capability on the canonical scheduler | `backend/src/workers/browserCapability.ts`, `backend/src/routes/browserRuns.ts` | issued `TenantContext` only; one `browser_automation` task on `ExecutionScheduler`; owner-scoped status; cancellation; 503 without host or Drive (no hosted fallback) |
| AI launch mode | `backend/src/workers/chromiumLaunch.ts` | one matched set: random loopback DevTools port, proxy bypass for exactly that port, DevTools origin allow-list of exactly Stagehand's runtime extension; everything else unchanged and still refused |

## Verified so far (DOCKER_LOCAL_TESTED: real Chromium in the hardened container, production proxy, developer Docker host)
- Workflows W01, W02, W04, W06, W08, W09, W10, W13, W15 through runBrowserTask -> scheduler -> handler -> container, with failure injection: all receipts PASS.
  W15: 11/11 verified outcomes, end-to-end p50 6.2 s, p95 11.6 s, peak container 187 MiB, no startup failures, nothing left behind.
- Local Stagehand plumbing: observe through the host model seam (stub model, zero cost).
- AI-mode DevTools exception attacked from a hostile page: holds; the weakened control (`--remote-allow-origins=*`) lets the page in, proving the check.
- Unit and contract tests for every new module (worker, plan, gateway, planner, coordinator, capability, route).

## Not yet verified (and what each needs)
| Item | Needs |
|---|---|
| W03 real Stagehand observe/act/extract; PRODUCT-001 AI-assisted path; planner on a real model | a model provider key available to the test process and a spending cap |
| W05 upload/download in an OWNED environment; W12 prompt injection and phishing redirect on an OWNED page | an owned synthetic test site (proposed: a $0 Cloudflare Worker on workers.dev) |
| W07 screenshot to real private R2 with read-back SHA-256 | an R2 credential scoped to the existing private test bucket |
| W11 and W14 on the release image; GCE runs of the workflow suite (Level D) | temporary Compute Engine VMs (credit) |
| PRODUCT-009 (browser + connected app / AI Employee) | the AI Employee backend is NOT_IMPLEMENTED (baseline); a connected-app test connection |
