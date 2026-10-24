# Batch 1.5 Phase 3: authoritative scope (verbatim extracts)

Recovered 2026-10-24 from the founder's own files on the development machine; nothing below is paraphrased. Where the extract says Oracle/OCI, the founder's later decision (2026-10-24) replaces it with **Google Compute Engine** (see `../phase-2/GCP-HOST-VERIFICATION.md`); every other requirement stands as written.

| Source | sha256 |
|---|---|
| `Xroga_Batch_1_5_Oracle_Browser_Amendment.md` (founder amendment, 2026-10-22) | `cad6ec0e62844fea1ba17ae4ce687855fa47bbe19bf4d029526608558bb45d4f` |
| `Xroga_Batch_1_5_Claude_Execution_Master_Oracle_Browser_Final.md` (Batch 1.5 master) | `43a18396df1466641f62d2d8353aed4478cc77bce77d3899a6380d219e0793bb` |

## A. Amendment sections 4 (INFRA-006 obligations), 5 (INFRA-007), 6 (INFRA-008), 7 (gates), verbatim

## 4. INFRA-006 — Worker contract and durable control plane (Phase 1.5B)

- Reuse current queue/scheduler. Define browser-job payload with immutable tenant/user/project/run/attempt, allowed target URL(s), session/account reference, approved action capability, safety/network policy version, max time, tabs, CPU/RAM, artifact budget and correlation IDs.
- Job lifecycle: `QUEUED → CLAIMED → STARTING → RUNNING → VERIFYING → COMPLETED` with `CANCEL_REQUESTED/CANCELLED`, `FAILED`, `RETRY_WAIT`, `TIMED_OUT`, `RECOVERY_REQUIRED`. Persist checkpoints and progress in canonical stores; ensure lease fencing, duplicate queue suppression and safe cancellation of Chromium process trees.
- Browser operations are **not automatically authorized external effects**. Require canonical action grants for consequential sends, purchases, uploads, publishing, deletes and permission changes; untrusted page text/Stagehand outputs cannot grant authority. Preserve idempotency, reconciliation and user confirmation. Prevent prompt injection and credential exfiltration from page content.
- Keep browser secrets out of raw worker logs, model prompts and Stagehand traces except narrowly brokered scoped values where specifically authorized; scrub screenshots/recordings as appropriate. Store evidence to private R2, metadata to Supabase, and link task receipts.
- Preserve low-latency user chat while browser tasks execute; enforce tenant fairness, backpressure, concurrency caps, per-task deadlines and budget accounting. Build fallback and drain/recovery rules before any traffic cutover.

## 5. INFRA-007 — Primary build owner for browser automation (Phase 1.5C)

Implement the actual Oracle Chromium/Playwright/Stagehand stack behind the existing Xroga BrowserWorker interface. Validate current Stagehand **local browser** integration (do not copy outdated or incompatible SDK snippets). Test the selected Stagehand SDK version's `localBrowser.launch`/`connect`, `Stagehand.create` or its version-appropriate equivalent; attach to authorized Chromium/Playwright sessions without accidentally spawning Browserbase sessions or allowing external hosted browser connections. Stagehand is an **open-source package whose publisher name can contain “browserbase”**; the banned component is its hosted Browserbase service, not a correctly configured local SDK import. Explicitly prohibit its hosted `browserbase.launch` environment, API keys and managed sessions.

Functional workflow tests (real Chromium, not DOM mocks only):

1. Navigate a public test website, handle redirects and verify the final destination.
2. Perform deterministic Playwright click, type, form-fill, wait and extraction with checkable postconditions.
3. Stagehand locally `observe` actionable targets, `act` on a permitted target and `extract` structured data, validating schema, grounding and model failure handling.
4. Multi-page workflow, changed DOM/selector recovery and safe fallbacks from AI to deterministic controls.
5. Upload/download in a synthetic owned test environment, with content integrity and no unapproved external write.
6. Authorized authenticated test session: account-specific cookies, expiry, refresh/human login handoff (only where supported) and secure teardown.
7. Capture screenshot and optional recording; upload privately to R2; read back and SHA-256 validate; preserve redacted evidence and project/session ownership.
8. Graceful cancellation mid-navigation; timeout killing browser processes and reclaiming memory/disk.
9. Crash/worker restart and fenced retry without duplicate consequential actions; report uncertain external state, not false success.
10. Concurrency with two tenants and multiple runs, cookie/profile isolation, CPU/RAM contention/fairness and stable API/chat responsiveness.
11. Attempted navigation to loopback, metadata IP, private ranges, redirect-to-private, DNS rebinding and controlled exfiltration destinations; enforce network policy (not only application URL validation).
12. Malicious page prompt injection, poisoned tool/DOM instructions, phishing redirects and unauthorized destination attempts; ensure no authority grant or credential reveal.
13. Stagehand LLM missing/unauthorized/out-of-budget: clean fail-closed or Playwright-only fallback where semantically safe; no quiet paid model usage.
14. Container hardening: non-root UID, Chromium sandbox on, seccomp/capabilities, read-only root/test temp policies, network separation and no public CDP endpoint.
15. Load/reliability: cold start, p50/p95 where enough samples, resident peak RAM, CPU time, browser startup failures, retries, completion rate, artifacts stored, orphan cleanup and cost per verified outcome.

Do not claim Oracle deployment passes unless the actual authorized OCI runtime/container was exercised. Local Linux/Docker tests are not OCI tests; mocks are not live browser outcomes. Preserve existing working browser path until operational equivalence, isolation, cost and rollback pass.

## 6. INFRA-008 — Integrated platform and acceptance updates (Phase 1.5C)

- Update architecture diagrams, OCI browser-worker image/deployment manifests, protected GitHub CI, runtime/network security policies, cost comparisons, monitoring alerts, rollback instructions and Fly-browser exit checklist.
- Add browser-focused telemetry: queue delay, job elapsed, p50/p95 navigation/AI action latency, Stagehand model tokens/cost, Chromium CPU/RAM peaks, number of live browsers/tabs, crashes/timeouts, orphan processes, R2 evidence bytes/storage and egress. Label estimates separately from measured usage.
- Compute unit economics per completed browser outcome: `allocated OCI CPU/RAM/runtime + network/egress + storage/operations + approved Stagehand LLM token cost`; verify actual OCI Always Free entitlement/capacity and actual model-account budget. Self-hosted Chromium and open-source Stagehand do NOT imply zero compute or model cost.
- Run PRODUCT-001 with deterministic and AI-assisted real browser operations, permissions, persistence and recovery. Run PRODUCT-009 as a combined browser + approved connected-app/employee workflow with provenance, evidence and postconditions; integrate with PRODUCT-010 concurrent chat/background processing and PRODUCT-012 R2 durability. Record separate source evidence for all twelve original PRODUCT outcomes.
- No public Origin/CDP/worker control plane exposure; secure OAuth cookies and brokered credentials. Production rollout requires explicit authorization, successful isolated real-provider tests, branch/security gates, reversible routing, and safe legacy-browser-provider retirement.

## 7. Acceptance gates and handoff obligations

Mandatory browser gates:

| Gate | Decision test |
|---|---|
| BROWSER-01 | OCI-hosted Chromium (or honestly BLOCKED until approved OCI environment exists); no hosted browser provider used |
| BROWSER-02 | Correct local Stagehand/Playwright integration on version-pinned, license-checked dependencies |
| BROWSER-03 | Non-root, sandboxed, capability-reduced containers, private CDP and runtime network policy |
| BROWSER-04 | Tenant/account/profile isolation and tightly scoped credential handling |
| BROWSER-05 | Canonical scheduler/job leases, authorization, approvals, budgets, retries and cancellation |
| BROWSER-06 | Real deterministic Playwright and AI Stagehand workflows with verifiable postconditions |
| BROWSER-07 | Redirect/SSRF/rebinding/metadata/prompt-injection defenses exercised |
| BROWSER-08 | Screenshots/recordings/artifacts in private R2 and session metadata in Supabase |
| BROWSER-09 | Two-tenant concurrency, process crash, orphan cleanup, restart/retry and backpressure |
| BROWSER-10 | Measured CPU/RAM/runtime and cost per verified outcome; no unapproved spend |
| BROWSER-11 | Existing browser execution retained until migration parity, rollback and approved cutover |
| BROWSER-12 | PRODUCT-001 and PRODUCT-009 genuine integrated outcome evidence, with related PRODUCT-010/012 checks |

Return `PASS | FAIL | BLOCKED | NOT_TESTED` and bind every PASS to source SHA, exact test ID, infrastructure type (local/docker/OCI), provider receipt where applicable, timestamps, cost measurements and postconditions. A blocked cloud step does not excuse incomplete independent code. Never pretend UI-only tests prove browser execution.

**Authority boundary:** this decision is the complete browser-hosting replacement for Batch 1.5 and has priority over any conflicting Cloudflare Browser Run/Rendering, Browserbase, or hosted-browser suggestion in older plans. Keep all non-browser architecture unchanged. Claude may edit and push only Claude-owned branches; no main, production, data, cloud resource, DNS or billable action without separate founder approval. After this amendment is implemented in the plan, continue the current Batch 1.5 phase; do not restart Phase 1 work.

## B. Master section 8.3 and 8.4 (combined workflow and PRODUCT matrix), verbatim

## 8.3 Combined Xroga workflow

Execute an authorized representative end-to-end task that involves:

1. User sends a request in Xroga chat.
2. Canonical scheduler creates a task graph.
3. An AI Employee or existing worker processes the assignment.
4. Oracle executes trusted processing.
5. An authorized connected app supplies or receives data.
6. A qualified browser runtime completes an appropriate browser operation.
7. The worker creates an artifact.
8. The artifact is durably stored in private R2.
9. Xroga verifies external actions and stored output.
10. The frontend shows execution evidence and a real completion result.

Test cancellation and recovery at appropriate stages.

Use dedicated test identities and safe test resources.

Do not execute unapproved consequential operations against live customer accounts.

## 8.4 Product acceptance matrix

Track separately:

- `PRODUCT-001` — Browser Automation end-to-end.
- `PRODUCT-002` — AI Employee assignment execution.
- `PRODUCT-003` — AI Employee recurring schedule and recovery.
- `PRODUCT-004` — Native app integration.
- `PRODUCT-005` — Composio and MCP tool execution.
- `PRODUCT-006` — OAuth/connection lifecycle.
- `PRODUCT-007` — Multi-step app workflow.
- `PRODUCT-008` — Scheduled/event-triggered automation.
- `PRODUCT-009` — Combined browser/app/employee workflow.
- `PRODUCT-010` — Concurrent chat and background execution.
- `PRODUCT-011` — Coding worker and sandbox integration.
- `PRODUCT-012` — Verified artifact storage and retrieval.

For each, record:

- Previously existing behavior.
- Actual implementation.
- Infrastructure dependency.
- Tests executed.
- Real outcome evidence.
- Known blockers.
- Final status.
