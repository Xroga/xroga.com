# Mandatory cloud usage and cost containment

This policy applies to every Xroga development assistant, human operator, build,
test and release. Promotional credits and a free Cloud Shell session do not make
the resources controlled by their commands free.

## Capability and infrastructure efficiency

Build Xroga as a capable, production-grade AI execution platform. Cost control
must preserve security, reliability, tenant isolation, user experience and the
required execution capabilities. Do not reduce the product to avoid justified
infrastructure spending.

Before adding billable capacity, evaluate the relevant existing infrastructure,
open-source software, local processing, included CI and free quotas. Prefer a
no-additional-cost option when it meets the required functionality, performance,
security and reliability. Do not force an inadequate free option or choose paid
execution merely for convenience.

Paid infrastructure is appropriate when a demonstrated requirement cannot be
met adequately through suitable existing alternatives. Record the alternatives
evaluated, their concrete limitations, the expected benefit and one-time,
recurring, usage-based and idle costs. Obtain owner approval for material new
spending or uncertainty about a significant recurring increase. Normal work
within an existing approved budget and scope can continue without repeated
approval requests for its already-authorized steps.

Prefer demand-driven workers, browser sessions and heavy execution environments
where compatible with the workload. Release them after completion, cancellation
or expiry only after preserving required durable state and evidence. Account for
startup latency, warm-state requirements, recovery and actual concurrency needs.
An always-on resource requires a demonstrated operational reason and approved
cost, not a blanket prohibition or an assumption that credits make it free.

Continue the intended browser automation, multi-worker execution, complete SaaS
generation, connected-app workflows, AI Employees, durable tasks, voice input
and one-workspace experience within the assigned batch and release scope. This
principle does not activate held features or authorize another batch's work.
Reuse Xroga's canonical scheduler, authorization, budget ledger, worker controls
and verification. Do not add a competing orchestrator, service or infrastructure
layer when an existing component meets the requirement effectively.

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

Every temporary deployment, revision, traffic tag, Job, worker or test resource
needs one named responsible operator, purpose, source/run reference, creation
time, expected lifetime/cost, cleanup criteria and rollback provision. Inspect
the current repository, resource inventory, deployment ownership and dependency
map before creating a replacement. Reuse a suitable existing resource.
Use the existing mission manifests and release receipts for this record rather
than creating another resource-management service or parallel control plane.

Claude and Codex must use the same resource ownership record and approved scope.
Only one operator changes a shared production resource in an execution window.
Do not create duplicate infrastructure, race competing deployment paths, assume
the other agent owns cleanup, or perform an unapproved production experiment.

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

Track efficiency using the existing canonical run, accounting and evidence IDs:

- Cost per verified successful task, with a stated time window and task class.
  Include attributable failed attempts, retries and idle allocation in the cost
  numerator. Count only tasks that passed their required verification in the
  denominator. With no verified successes, report the cost and zero successes
  explicitly instead of inventing a cost-per-success figure.
- Idle compute cost, allocated CPU/memory time and actual utilization, separated
  from useful task execution and required warm production capacity.
- Task completion time and failure/retry rates, with sample counts and a clear
  distinction between logical tasks and execution attempts. Do not claim a
  reliable percentile or rate from insufficient or missing evidence.
- Gross cost before credits, applicable free allowances, net cash cost, recurring
  baseline and usage-driven cost. Promotional credits are finite funding.

Compare these measures together with isolation, verification quality and user
experience. A lower bill that increases failures or removes required capability
is not sufficient evidence of a better system. Missing measures are unverified,
not zero. Do not introduce a paid telemetry service or a parallel execution
framework to obtain these measures without demonstrated need and approval.

## Approval and release boundaries

The October 31 cost investigation was read-only. The founder subsequently
authorized only the nine historical traffic-tag removals, which were applied
with their serving API, voice route, Job, queues and recovery assets preserved.
Do not repeat that mutation or recreate the retired warm tags merely to retain
rollback images. Preserve the source-bound receipts and later cost measurement.

The permanent efficiency directive allows normal work within its existing
permissions, approved scope and budget. It does not grant new IAM access,
approve a plan upgrade or paid fallback, lift a batch/production activation
hold, authorize customer workloads, or permit unreviewed production changes.
Resolve new material spending and production impacts through the applicable
exact approval package. Do not repeatedly ask for already-covered routine work.

Build powerful systems. Reuse what already works. Spend where there is a
demonstrated need. Measure the results. Eliminate waste without sacrificing
capability.
