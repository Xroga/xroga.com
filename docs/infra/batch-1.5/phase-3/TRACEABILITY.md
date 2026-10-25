# Batch 1.5 Phase 3: traceability (original requirement → source → evidence → status → remaining action)

Final checkpoint 2026-10-25, branch `claude/xroga-b15-phase3-20261024`, final code `37069f73`. The final corrected image ran on Compute Engine (both architectures) on `744067de`; `37069f73` changes only the W09a test plan.
Machine-readable form: `FINAL-MATRIX.json`. Nothing is merged to `main` or deployed; nothing here is production-verified.

Evidence classes:
- `GCE`: Compute Engine e2-standard-2 (amd64) and t2a-standard-2 (arm64), release images built on each host. First run on `450df59a` (W15 rerun `1857158c`): `evidence/gce/`. **Final corrected image** on `744067de`, W09 rerun `37069f73`: `evidence/gce/final-image/` (host battery HOST_ACCEPTED 32/32 and DevTools battery PASS on both, with the model and R2 workflows).
- `LOCAL`: real Chromium in the hardened container behind the production egress proxy on the developer Docker host, final source `d3b5f9c3`, `evidence/local/`.
- `UNIT`: unit and contract tests (CI).

The final image differs from the first GCE image in one place: `deploy/browser-worker/runJob.mjs` attaches Stagehand before the start navigation when a plan has AI steps
(commit `d3b5f9c3`). The final image is the one verified on GCE in `evidence/gce/final-image/`.

## BROWSER gates (wording: AUTHORITATIVE-SCOPE.md §7; OCI → Compute Engine)
| Gate | Source | Evidence | Status | Remaining action |
|---|---|---|---|---|
| 01 Compute Engine-hosted Chromium, no hosted provider | `containerBrowserWorker.ts`, `browserCoordinator.ts`, `browser-coordinator.mts`; no Browserbase import | final image on GCE: amd64 31/31 executed PASS, arm64 all PASS (W09a rerun PASS); LOCAL final 31/31 | PASS_GCE | none |
| 02 Local Stagehand/Playwright, pinned, licence-checked | `deploy/browser-worker/package*.json`, `imagePins.ts`, `runJob.mjs` | W03 real model (observe, act, extract) and MODELPROBE on the final image on GCE, both architectures; also LOCAL | PASS_GCE | none |
| 03 Non-root, sandboxed, capability-reduced, private CDP, network policy | `chromiumLaunch.ts`, `containerSpec.ts`, `seccomp-chromium.json` | host battery HOST_ACCEPTED 32/32 on both architectures; DevTools attack battery PASS on GCE (both) and LOCAL final, weakened control detected | PASS_GCE | none |
| 04 Tenant/account/profile isolation, scoped credentials | per-job container, profile and network; issued `TenantContext` | W06b, W06x, W10 on GCE and LOCAL final | PASS_GCE | none |
| 05 Canonical scheduler, leases, authorization, approvals, budgets, retries, cancellation | `browserCapability.ts`, `browserTaskHandler.ts`, `browserPlan.ts`, `browserModelGateway.ts` | W05c, W06c, W08, W09, W13 on GCE and LOCAL; W03b real-model budget refusal LOCAL | PASS_GCE | none |
| 06 Real deterministic Playwright and AI Stagehand workflows with postconditions | `runJob.mjs`, `browserPlan.ts` | deterministic and AI workflows (W01 to W06, W12e, PRODUCT-001 planned leg) on the final image on GCE | PASS_GCE | none |
| 07 Redirect/SSRF/rebinding/metadata/prompt-injection defences | `egressProxy.ts`, runtime scope checks, plan parser | egress checks in the host battery (GCE, both); W01b, W12a-e on the final image on GCE (W12e is the real model) | PASS_GCE | none |
| 08 Artifacts in private R2, session metadata in Supabase | handler → `putServerObject`; canonical execution store | W07 on the real private bucket `xroga-drive-test` from GCE (final image, both architectures) and LOCAL; PRODUCT-009 report to R2 LOCAL | PARTIAL | `execution_runs` rows for browser tasks are written only by a deployed API (parity check P5, needs an approved deployment) |
| 09 Two-tenant concurrency, crash, orphan cleanup, restart/retry, backpressure | `admission.ts`, `reapOrphans()`, retry policy | W09, W10, PRODUCT-010 on GCE and LOCAL | PASS_GCE | none |
| 10 Measured CPU/RAM/runtime and cost per verified outcome; no unapproved spend | W15 sampler; gateway cost accounting | W15 on GCE (both, twice) and LOCAL; model cost measured on the canonical ledger on GCE and local; `COST-REPORT.md` | PASS_GCE | none |
| 11 Existing browser execution retained until parity, rollback, approved cutover | legacy paths untouched (empty diff against `main`) | `MIGRATION-ROLLBACK-EXIT.md` | PASS (plan; cutover not executed by design) | founder-approved cutover after merge |
| 12 PRODUCT-001 and PRODUCT-009 integrated evidence, with PRODUCT-010/012 | `/api/browser/runs`, Browser Studio panel | PRODUCT-001 LOCAL, PRODUCT-009 LOCAL (app and browser legs), PRODUCT-010 GCE, PRODUCT-012 LOCAL | PARTIAL | PRODUCT-009 employee leg: no AI Employee backend exists (outside Phase 3) |

## Workflows (wording: AUTHORITATIVE-SCOPE.md §5)
| W | Receipts | GCE (both architectures, `450df59a`) | LOCAL final (`d3b5f9c3`) | Status |
|---|---|---|---|---|
| 01 redirects, final destination | W01a, W01b | PASS | PASS | PASS_GCE |
| 02 deterministic click/type/fill/wait/extract | W02 | PASS | PASS | PASS_GCE |
| 03 Stagehand observe/act/extract (real model) | W03, W03b | final image: PASS both | PASS | PASS_GCE |
| 04 multi-page, selector recovery, AI→deterministic fallback | W04, W13c | PASS | PASS | PASS_GCE |
| 05 upload/download on an owned site | W05a-c | PASS | PASS | PASS_GCE |
| 06 authorised session, cookies, expiry, teardown | W06a-c, W06x | PASS | PASS | PASS_GCE |
| 07 screenshot to private R2, read-back SHA-256 | W07 | final image: PASS both (real R2 from the VMs) | PASS | PASS_GCE |
| 08 cancellation, timeout, reclamation | W08a, W08b | PASS | PASS | PASS_GCE |
| 09 crash, fenced retry, no duplicate consequential action | W09a, W09b | PASS; on the final-image arm64 run W09a hit a test-timing flaw (job finished before the injected crash), fixed in `37069f73`, rerun PASS on both | PASS | PASS_GCE |
| 10 two tenants, isolation, fairness, responsiveness | W10, PRODUCT-010 | PASS | PASS | PASS_GCE |
| 11 loopback/metadata/private/redirect/rebinding/exfiltration at the network | host battery egress checks | final image: HOST_ACCEPTED 32/32 both | not repeated (proxy unchanged) | PASS_GCE |
| 12 prompt injection, poisoned DOM, phishing | W12a-e | final image: W12a-e PASS both | W12a-e PASS | PASS_GCE |
| 13 model missing/unauthorised/out-of-budget | W13a-c, W03b | W13 PASS | PASS | PASS_GCE |
| 14 container hardening on the final image | host battery | final image: HOST_ACCEPTED 32/32 both | DevTools battery PASS | PASS_GCE |
| 15 load/reliability, cost per verified outcome | W15 | PASS 11/11 | PASS 11/11 | PASS_GCE |
