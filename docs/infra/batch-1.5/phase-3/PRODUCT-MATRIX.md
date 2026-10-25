# Batch 1.5 Phase 3: PRODUCT-001 to PRODUCT-012 (master §8.4)

Phase 3's scope is the browser (INFRA-007/008). PRODUCT-001, -009, -010 and -012 are its outcomes and carry full detail. The other eight are recorded
truthfully: what existed, whether Phase 3 changed them, and what evidence exists. None of the twelve is production-verified by this phase, because nothing in
Phase 3 is deployed.

Status vocabulary: `PASS_GCE` (real run on Compute Engine on both architectures), `PASS_LOCAL` (real run on the developer Docker host), `PARTIAL`,
`NOT_TESTED`, `NOT_IMPLEMENTED`, `OUT_OF_PHASE_3_SCOPE` (unchanged by this phase; evidence belongs to the owning workstream).

## PRODUCT-001: Browser Automation end to end
| Field | Record |
|---|---|
| Previously existing | Browser Studio UI that listed recorded runs and had no way to start one; `lib/browserbase.ts` creates hosted sessions but has no production caller; the only real browser was the build-pipeline verification inside a Fly sandbox |
| Implementation | `POST/GET/DELETE /api/browser/runs` → `runBrowserTask` (issued `TenantContext`) → one `browser_automation` task on `ExecutionScheduler` → `browserTaskHandler` (lease, admission, plan parse, postconditions, Drive evidence) → `RemoteBrowserWorker` (HMAC) → host coordinator → `ContainerBrowserWorker` (hardened container + per-job egress proxy) → Playwright, with local Stagehand for AI steps through the canonical model route. Browser Studio panel `BrowserRun.tsx` runs a deterministic capture or a model-planned goal and shows postconditions, evidence and failures |
| Infrastructure | Compute Engine browser host (Docker); Drive (R2 + Supabase metadata); an existing model provider for AI steps |
| Tests | route tests (7); suite receipt `PRODUCT-001` (deterministic capture over the production router, then a model-planned goal); W01 to W15 underneath |
| Evidence | deterministic half: PASS_LOCAL (`PRODUCT-001` receipt, 2026-10-24); the same deterministic path on GCE inside W01/W02/W04/W15 on both architectures |
| Blockers | the model-planned half needs the founder's local env file with an existing model key |
| Status | **PARTIAL** until the model-planned run passes |

## PRODUCT-009: Combined browser, app and employee workflow
| Field | Record |
|---|---|
| Previously existing | connected-app reads and reviewed writes through Xroga Connect (Codex, #848/#849); no browser execution; **no AI Employee backend** (baseline `NOT_IMPLEMENTED`; the homepage employees are marketing UI) |
| Implementation | suite receipt `PRODUCT-009`: a read-only Xroga Connect session discovers a Google Sheets read tool, reads cell A1 of a synthetic spreadsheet; the value drives a browser run on the canonical scheduler; the combined report (app provenance, browser postconditions, screenshot reference) is stored as a private Drive artifact and read back by SHA-256; another tenant is denied; the follow-up app write is STAGED for review and never executed |
| Infrastructure | Composio (one synthetic identity `xroga-phase3-synthetic-p009`), browser host, Drive/R2 |
| Tests | `PRODUCT-009` receipt |
| Evidence | not yet run |
| Blockers | `COMPOSIO_API_KEY` in the env file; the founder connects one throwaway Google account and creates one spreadsheet. The AI Employee leg cannot be tested: it does not exist |
| Status | **NOT_TESTED** (at best PARTIAL once run, because the employee leg is NOT_IMPLEMENTED) |

## PRODUCT-010: Concurrent chat and background execution
| Field | Record |
|---|---|
| Previously existing | chat and background work in one API process; no browser workload |
| Implementation | browser work runs off the API event loop: all per-job Docker calls are asynchronous; a run is a background scheduler task with owner-scoped status and cancellation |
| Tests | `PRODUCT-010` receipt: 40 pings to an unrelated endpoint while a 25 s browser run continues, status read while running, cancel via `DELETE` |
| Evidence | PASS on Compute Engine amd64 and arm64 (`evidence/gce/phase3-host-*/workflows.json`) and locally (ping p95 20 ms). Two tenants concurrently: W10 PASS on both architectures |
| Blockers | none for the branch; production behaviour needs deployment |
| Status | **PASS_GCE** |

## PRODUCT-012: Verified artifact storage and retrieval
| Field | Record |
|---|---|
| Previously existing | Drive foundation from Phase 1/2 (`putServerObject`: READY only after read-back SHA-256) |
| Implementation | every browser artifact goes through `putServerObject` under a deterministic per-task name; retries reuse an already stored object; the report and screenshot are owner-scoped |
| Tests | W02, W05a, W15 (in-memory Drive: READY with read-back SHA-256 on every artifact); W07 (real private R2: READY, other tenant denied, an unsigned read of the real S3 endpoint refused, deleted and confirmed absent by HEAD) |
| Evidence | in-memory Drive path PASS_GCE on both architectures; real private R2 bucket `xroga-drive-test`: W07 PASS_LOCAL (`evidence/local/w07-r2-LOCAL_DOCKER.json`, 2026-10-25, source `39d46391` + the strengthened W07 check). Bucket privacy confirmed off-suite with wrangler: r2.dev public URL disabled, no custom domains |
| Blockers | none for the branch. The R2 leg ran on the local Docker host, because the GCE VMs had already auto-deleted when the token arrived; the browser path itself is PASS_GCE |
| Status | **PASS_LOCAL** (real R2), with the browser-to-Drive path PASS_GCE |

## The other eight (unchanged by Phase 3)
| ID | Outcome | Previously existing (baseline `../product-capability-baseline.md` and `main`) | Phase 3 change | Status in Phase 3 |
|---|---|---|---|---|
| PRODUCT-002 | AI Employee assignment execution | NOT_IMPLEMENTED in the backend | none | **NOT_IMPLEMENTED** |
| PRODUCT-003 | AI Employee recurring schedule and recovery | NOT_IMPLEMENTED | none | **NOT_IMPLEMENTED** |
| PRODUCT-004 | Native app integration | Xroga Connect via Composio (`services/integrations/composioClient.ts`) | none | OUT_OF_PHASE_3_SCOPE; exercised only as PRODUCT-009's read leg |
| PRODUCT-005 | Composio and MCP tool execution | discovered-tool execution, read and confirmed-action sessions, custom MCP toolkits | none | OUT_OF_PHASE_3_SCOPE; read execution exercised in PRODUCT-009 |
| PRODUCT-006 | OAuth/connection lifecycle | Composio connection links (`createComposioConnectionLink`) | none | OUT_OF_PHASE_3_SCOPE; one link created for the synthetic identity |
| PRODUCT-007 | Multi-step app workflow | reviewed two-to-four-step workflows (#848, `docs/connected-app-workflows.md`) | none | OUT_OF_PHASE_3_SCOPE |
| PRODUCT-008 | Scheduled/event-triggered automation | interval and Composio event rules with a signed webhook (#848) | none | OUT_OF_PHASE_3_SCOPE |
| PRODUCT-011 | Coding worker and sandbox integration | synthesis pipeline with Fly sandbox and in-sandbox browser verification | none (diff against `main` is empty for `synthesis/`) | OUT_OF_PHASE_3_SCOPE |
