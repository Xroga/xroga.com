# Focused production backend release result

PASS for the exact approved backend release. Batch 1.5 and Batch 2 are not fully accepted.

- Production API: `xroga-api-b15b2-ac8168-serving-1031`, default traffic 100%.
- Canonical Job/queue: `xroga-canonical-production`, queue RUNNING.
- Exact API/Job source: `ac8168f940d6e56079bbeb5e717ef33001b8b171`. PR 902 merged as `3abc33a0cc108ace6efa0ab282137e10081513cf`. Seven required exact-source checks passed. No CI was restarted during this release.
- Immutable digest: `sha256:7b3551559fa0585c2efb422397163fc796dd0e287b9f833936df98046944d549`. OCI source label, baked SHA, source-storage generation and linux/amd64 verified. 154,673,122 compressed bytes.
- Admission singleton reopened only for that source after drain and pairing. Only the approved singleton field was mutated through operator SQL, no schema or customer-record SQL.
- Private candidate and zero-traffic serving readiness returned 200. HTTPS `/health` and `/ready` passed through the owned Google load balancer with certificate validation intact. Unauthenticated Builder returned 401. No request-log HTTP 5xx was observed in the bounded post-release window.
- Actual admission pause: October 31, 2026, 17:27:01 to 17:37:51 PKT, 650.6 seconds.
- Environment, database, storage and quota readiness pass. Existing optional `storage_reconcile_not_scheduled` warning remains visible. It was not suppressed or counted as full storage-housekeeping acceptance.
- Production identity, opaque configuration, secret references, custody settings, networking and resource limits match the prior serving/Job configuration apart from the approved source/image and explicit production classification. `/ready` remains behind the existing credential-vault readiness middleware.
- Both microphone traffic tags and their revisions are unchanged. No frontend deployment, new IAM, service, browser host, VM, disk, NAT or KMS change. Temporary release tags and both exact probe Tasks were removed.

## Actual component status

Batch 1.5: Drive/R2 and canonical Google runtime LIVE, reusing the preserved upload/download/hash evidence. Browser Worker BLOCKED by the absence of an approved retained isolated host. The existing private e2-medium route has an estimated $29.93/month fixed base before credits and variable usage, as itemized in the approval package. This release did not authorize it.

Batch 2: reviewed backend and cancellation correction LIVE. Real generated-and-saved code, accounted completion, stop/resume and preview/export acceptance NOT VERIFIED. The separately approved $0.10 one-attempt model test was not dispatched. The current owner-wide budget can exceed that test cap, and ordinary Builder dispatch is not bound to the existing per-action ceiling. No tokens were fabricated, no uncertain hold was released, no budget was increased and no model call was made. See `focused-model-cap-preflight.json`.

## Recovery and remaining action

Retain `xroga-api-batch1-85f-serving-1031` and matching digest `sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80`. Close admission with `focused-fence-pause-ac.sql`, drain and pause the queue, restore the saved 85f Job and API together using `focused-cutover.py recover-job` and `recover-traffic`, verify health and parity, apply `focused-fence-reopen85.sql`, then resume the exact existing queue. Refresh the actual closed/drained proof first. The helper's forward-only `resume` mode must not be used for recovery. Never restore a whole database over newer data or downgrade to a legacy custody image.

Next minimum Builder action is binding its actual attempt to the existing authoritative per-action spending ceiling, then performing the one approved capped generation/save attempt. Do not create another budget system or activate other-batch features. Full QA and provider delivery remain gated.

## Costs, cleanup and exceptions

Two Cloud Build executions: one failed because the operator archive omitted the tracked `.dockerignore`, then one successful after correcting context parity with the passing CI. No application source or dependency changed. The first candidate caught the missing explicit production classification; corrected at zero traffic using the same image. Those failures never changed default production traffic.

Conservative incremental Google usage estimate is below $0.10 before credits, within the $0.50 approval. Exact settled billing and agent/API spend are not measured. Image retention remains under the separately approved $0.10/month/1 GiB ceiling. Operator model spending is $0, the $0.10 model allowance remains unused. The original $2 Browser test window never started.

The laptop resolver returned NXDOMAIN for the API name. Google public DNS returns `8.232.138.199`, matching the owned `xroga-api-https` forwarding rule. Verified HTTPS used a process-local curl resolve override with full TLS/SNI validation. No system DNS, TLS bypass or production DNS change. Build-source inputs are retained as provenance, required recovery assets remain intact, and task-owned local temporary files were cleaned.

Evidence: `focused-final-runtime-proof.json`, `focused-image.json`, `focused-public-tls-readiness-proof.json`, `focused-post-release-monitor.json`, `focused-paired-cutover-journal.jsonl`, `focused-model-cap-preflight.json`, `focused-cleanup-receipt.json`.
