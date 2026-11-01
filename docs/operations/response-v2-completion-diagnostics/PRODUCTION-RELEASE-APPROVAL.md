# Completion diagnostics, exact release decision

Prepared November 2, 2026. NOT APPROVED, BUILT OR DEPLOYED.

Package ID: response-v2-completion-diagnostics-5953c15b.
Backend source: 5953c15b2f1bab62dacd4c4c27180b3badc5f6c9.
Frontend correction source is independently 209948736672abe8e03926e936f264fb50afb3e9 on draft PR #909. This package does not promote that frontend.

The failed SaaS request's upstream cause remains unproven because the old adapter discarded completion metadata before throwing. This correction retains bounded content-free request ID, observed finish reason, actual supplied usage and channel counts on empty completions and stream interruption. It maps empty completion to a safe provider error with retry disabled. It does not change routing, prompts, model choice, quotas, admission, accounting settlement or successful answer publication. Local admitted SDK negative tests and type checking passed. Mandatory exact-source CI must pass before any cloud mutation. Do not present this as restored generation or finished V2 acceptance.

Requested scope is one build in the existing registry, guarded zero-traffic readiness, and the existing source-safe paired API/Job cutover in project project-c40d4821-e647-4fa2-92d, us-east4. Apply only the four included source-pinned admission-fence SQL files to Supabase nzenxdfumxrnsmybazmo. These change only the existing singleton, without schema or customer-record changes. Drain real work without cancelling it. Maximum maintenance is 60 minutes. Startup reconciliation remains disabled for the candidate.

Maximum incremental Google usage is $0.50 once and $0.10/month for image retention, credits first within the existing cash allocation. No new service, IAM, DNS, worker, minimum instance, subscription, model/search allowance or frontend promotion. No image with the new code exists yet. Build submission is approval-gated and journals unknown outcomes before any retry.

Retain current source fd3b663290cf150da51768171021860b032df025, revision xroga-api-response-fd3b66-serving-1101, canonical Job template and registry image sha256:7c32bf09bbe6004b798e522d36841c5b2ecd22ab5d3b3b7731f716bb96f8d209. Preserve the older 1d487ce9 recovery image as well. Preflight must independently prove live parity, available images, current fence, no active executions and healthy readiness. Preserve voice tags and frontend rollback. Failed readiness/parity stops promotion. Recovery closes/drains admission, restores the saved fd3b API/Job pair, verifies parity and health, then reopens only that source.

Execution after actual approval: record this package/source and completionDiagnosticsApproved=true, run submit-build.py once, inspect its receipt, verify-image.py, candidate.py, private-ready.py candidate, cutover.py preflight. Start maintenance, apply 01-pause-current.sql, verify drain, then pause/serving/private-ready serving/job/promote. Apply 02-allow-response.sql only after verified matching source, then resume. The guarded recovery path uses 03-pause-response.sql, recover-job/recover-traffic, 04-recover-current.sql and recover-resume. Never open the fence based on an unverified revision.

No model request is authorized by this package. The existing unreconciled answer reservation remains held. One justified new diagnostic generation may proceed only within a separately established existing model allowance and canonical reservation controls. Stop the paid path if the same empty result recurs. Requested new-chat SaaS/workshop/research/code acceptance remains incomplete until independently observed in Workspace. A passing build is not product acceptance.

The backend also includes the previously tested opt-in literal Share export correction, required by the V2 frontend. It preserves identifiers and formulas without a second Markdown cleanup pass. Legacy default, authentication, owner checks, visibility, revocation, escaped rendering and size limits remain. Local Share regressions passed. No share data migration.

Exact-source CI also serializes the two disposable ledger test files so migration DDL in one before hook cannot deadlock another file executing queries. The six-worker concurrency tests, process-kill checks and assertions are unchanged. This changes only test scheduling, not production runtime or SQL.
