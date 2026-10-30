# Mandatory cloud usage and cost containment

This policy applies to every Xroga development assistant, human operator, build,
test and release. Promotional credits and a free Cloud Shell session do not make
the resources controlled by their commands free.

## Default execution location

Use the existing laptop or CI for editing, documentation, repository audits,
type checking, linting, ordinary unit tests, UI fixtures, mocked integrations and
isolated database tests. Respect the permanent local storage cleanup policy.
Do not launch Cloud Run services or Jobs to do ordinary development work.

Cloud runtimes are justified for serving APIs, canonical production workers,
production integrations, necessary native identity/network/runtime acceptance,
and protected restoration when an approved cheaper environment cannot meet its
security conditions. Reuse accepted source-bound evidence when semantics have
not changed. Never weaken required verification to reduce cost.

## Before a cloud mutation

Record the exact task, source SHA, resources, region, existing approval and why
local or existing CI cannot complete the work. Record the CPU, memory, billing
mode, service and revision minimum/maximum instances, time limit, retry limit,
expected gross usage and cleanup owner. Include retained daily/monthly cost,
not only the execution window. A budget alert is not a hard spending cap.

Read the current service traffic and every tagged revision before deployment.
A zero-percent traffic target can still keep a revision's minimum instances
running. A service maximum is not proof that all tagged revision allocations
are bounded as intended. Verify actual instance counts and allocation metrics.

For a temporary candidate, explicitly set minimum instances to zero, maximum
instances to the approved bound, and request-based CPU allocation unless an
exact, time-limited exception is approved. Do not inherit the serving template's
warm minimum or always-allocated CPU by accident. Preserve the verified startup
reconciliation guard and the canonical API/Job source compatibility contract.

Do not change production billing mode, scaling, traffic, scheduler, queue,
worker configuration, IAM or customer work without a dependency assessment,
recovery procedure and applicable explicit owner authorization. No plan upgrade,
extra service, spending increase or deployment follows from this policy itself.

## Completion and cleanup

After a cloud-specific test, preserve its required redacted evidence and clean
only its explicitly approved temporary resources on success, failure and handled
interruption. Use an independent deadline where approved, then verify cleanup.
Do not claim a forced process kill executed a finally block. Check for abandoned
owned resources at the next checkpoint before creating replacements.

Retire an obsolete candidate's traffic tag within its approved cleanup scope.
Preserve immutable images, source and compatible recovery assets. Retaining a
rollback image does not require keeping every historical revision warm. A hot
spare needs an explicit reason, cost allowance, expiry and owner.

Never stop shared production services, the canonical Job, queues, scheduler or
active customer work as an automatic test-cleanup action. Never delete required
backups, keys, secret versions, persistent volumes, source or recovery images to
hide cost. Keep unrelated batches and production activation holds intact.

Do not repeatedly rebuild unchanged images, retry known provider failures,
recreate environments, rerun passing CI, or issue repeated smoke tests without
a demonstrated regression or source/configuration change. Diagnose repeated
failures before another attempt and use a bounded alternative when appropriate.

## Cost evidence and measurement

Use existing Billing reports, Audit Logs and default Monitoring metrics first.
Do not enable a paid export, new monitoring service or charge-generating query
system merely to investigate costs. Never read customer secrets or task payloads
for a resource cost inventory. Keep credentials, prompts, audio and customer data
out of reports, command arguments, logs and version control.

Record billing account/project scope, usage dates, SKU, usage quantity, gross
cost, credits and net payable separately. Billing can arrive late. A dashboard
increase does not prove spending in the last few minutes. Monitoring allocation
estimates are not invoices. Attribute configuration actions using audit principal,
agent/user-agent labels and preserved operation receipts, not commit authors.

Before and after an approved saving change, compare the same service/revisions,
CPU and memory allocation, instance count, request volume, Job executions and
queue activity over a matched interval. Verify unaffected serving behavior with
the smallest relevant check. Reconcile later with posted SKU usage for that
interval, allowing for billing lag. Do not claim savings before they are measured.

## Current investigation hold

The October 31, 2026 founder directive permits a read-only spending investigation.
Pause nonessential new cloud operations. Existing production stays operational.
Proposed production changes require a separate explicit decision after the
impact assessment. Do not interpret old rollout approvals as authorization to
ignore this newer hold.
