# Batch 1.5 Phase 3: traceability (original requirement → source → evidence → status → remaining action)

Checkpoint: branch `claude/xroga-b15-phase3-20261024`. Evidence classes: `LOCAL_DOCKER` (real Chromium in the hardened container behind the production egress proxy on
the developer's Docker host), `GCE_HOST` (Compute Engine, not yet run for the Phase 3 image), `UNIT` (tests). Nothing is production-verified. Statuses are
provisional until the final run: `PASS_LOCAL` means the behaviour is proven on real Chromium locally and still needs its GCE receipt.

## BROWSER gates (wording: AUTHORITATIVE-SCOPE.md §7; OCI → Compute Engine)
| Gate | Source | Evidence so far | Status | Remaining action |
|---|---|---|---|---|
| 01 Compute Engine-hosted Chromium, no hosted provider | `containerBrowserWorker.ts`, `browserCoordinator.ts`, `browser-coordinator.mts`; no Browserbase import (`imagePins` rule) | Phase 2 GCE host receipts (base image); local runs | PASS_LOCAL | Phase 3 image on GCE (`phase3-host-run.sh`) |
| 02 Local Stagehand/Playwright, pinned, licence-checked | `deploy/browser-worker/package*.json`, `imagePins.ts` (Stagehand only in `runJob.mjs`, local connect, no API key/URL) | imagePins tests; Stagehand observe through the host model seam (stub) | PARTIAL | real-model W03 (needs model key) |
| 03 Non-root, sandboxed, capability-reduced, private CDP, network policy | `chromiumLaunch.ts` (AI mode matched set), `containerSpec.ts`, `seccomp-chromium.json` | Phase 2 GCE battery (base image); AI-mode DevTools attack battery PASS locally incl. weakened control | PASS_LOCAL | W11/W14 battery on the final image on GCE |
| 04 Tenant/account/profile isolation, scoped credentials | per-job container, profile and network; issued `TenantContext` | W06b (no cookies carry over), W10 (two tenants concurrent, no run leakage), route tests | PASS_LOCAL | W06x session expiry on the owned testbed; GCE rerun |
| 05 Canonical scheduler, leases, authorization, approvals, budgets, retries, cancellation | `browserCapability.ts`, `browserTaskHandler.ts`, `browserPlan.ts` write grants, `browserModelGateway.ts` | W06c/W05c refusals, W08 cancel/timeout, W09 fenced retry and no retry of consequential work, W13 budget/route refusals, unit tests | PASS_LOCAL | GCE rerun |
| 06 Real deterministic Playwright and AI Stagehand workflows with postconditions | `runJob.mjs`, `browserPlan.ts` postconditions | W01, W02, W04, W06, W15 deterministic PASS_LOCAL | PARTIAL | W03 real model |
| 07 Redirect/SSRF/rebinding/metadata/prompt-injection defences | `egressProxy.ts` (Phase 2), runtime scope checks, plan parser | Phase 2 21-check battery (GCE, base image); W01b; DevTools battery | PARTIAL | W12 on the owned hostile page; final-image battery on GCE |
| 08 Artifacts in private R2, session metadata in Supabase | handler → `putServerObject`; canonical execution store | Drive READY with read-back SHA-256 on the in-memory store (W02, W05 pending) | PARTIAL | W07 real R2; Supabase `execution_runs` writes happen only when deployed (NOT_TESTED, needs deployment approval) |
| 09 Two-tenant concurrency, crash, orphan cleanup, restart/retry, backpressure | `admission.ts`, `reapOrphans()`, scheduler retry policy | W09, W10, orphan reaping after a crashed runner (2 containers, 2 networks reaped); admission unit tests | PASS_LOCAL | GCE rerun |
| 10 Measured CPU/RAM/runtime and cost per verified outcome; no unapproved spend | W15 sampler; gateway cost accounting | W15 local: 11/11, p50 6.2 s, p95 11.6 s, 187 MiB peak | PARTIAL | GCE W15 + model cost from W03 |
| 11 Existing browser execution retained until parity, rollback, approved cutover | Fly sandbox build verification and `lib/browserbase.ts` untouched; new path behind its own route and configuration | code inspection | PARTIAL | migration/rollback/exit checklist document |
| 12 PRODUCT-001 and PRODUCT-009 integrated evidence, with PRODUCT-010/012 | `/api/browser/runs`, Browser Studio panel | PRODUCT-001 deterministic path PASS_LOCAL; PRODUCT-010 PASS_LOCAL (ping p95 20 ms during a run) | PARTIAL | AI path (W03), PRODUCT-009 (connected-app test account), PRODUCT-012 (W07) |

## Workflows (wording: AUTHORITATIVE-SCOPE.md §5)
| W | Receipt so far | Status | Remaining |
|---|---|---|---|
| 01 redirects, final destination | W01a/W01b | PASS_LOCAL | GCE |
| 02 deterministic click/type/fill/wait/extract | W02 | PASS_LOCAL | GCE |
| 03 Stagehand observe/act/extract (real model) | stub plumbing only (not evidence) | NOT_TESTED | model key |
| 04 multi-page, selector recovery, AI→deterministic fallback | W04, W13c | PASS_LOCAL | GCE |
| 05 upload/download on an owned site | written, not run | NOT_TESTED | testbed |
| 06 authorised session, cookies, expiry, teardown | W06a/b/c; W06x written | PASS_LOCAL (expiry NOT_TESTED) | testbed |
| 07 screenshot to private R2, read-back SHA-256 | written, not run | NOT_TESTED | R2 credential |
| 08 cancellation, timeout, reclamation | W08a/b | PASS_LOCAL | GCE |
| 09 crash, fenced retry, no duplicate consequential action | W09a/b | PASS_LOCAL | GCE |
| 10 two tenants, isolation, fairness, responsiveness | W10, PRODUCT-010 | PASS_LOCAL | GCE |
| 11 loopback/metadata/private/redirect/rebinding/exfiltration at the network | Phase 2 battery (base image, GCE) + DevTools battery (local) | PARTIAL | final image on GCE |
| 12 prompt injection, poisoned DOM, phishing | written (W12a-e), not run | NOT_TESTED | testbed (+ model key for W12e) |
| 13 model missing/unauthorised/out-of-budget | W13a/b/c | PASS_LOCAL (real-model W03b pending) | model key |
| 14 container hardening on the final image | Phase 2 GCE (base image) | PARTIAL | final image on GCE |
| 15 load/reliability, cost per verified outcome | W15 local | PASS_LOCAL | GCE |
