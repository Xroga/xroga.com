# Response V2 webhook guidance correction, exact release decision

Prepared November 2, 2026. NOT APPROVED OR DEPLOYED.

Package ID: `response-v2-webhook-correction-fd3b6632`.

## Reason and exact source

The new SaaS acceptance response incorrectly described receipt of a webhook as
proof its effects had completed, and recommended timestamps for ordering Stripe
events. This is a content failure, not a passing product acceptance result.
The correction uses the existing model request and adds no formatting request.

Candidate backend: `fd3b663290cf150da51768171021860b032df025`.
Relative to live `1d487ce977699ba0f049d1227ab8c0b4920d8c1f`, application changes
are the existing presentation guidance and its regression tests. The other
changes reconcile generated evidence hashes. Six exact-source release workflows
passed. Prompt tests cannot prove a future model answer is correct.

## Requested action and cost

One source-pinned build in the existing Artifact Registry repository, a guarded
zero-traffic API readiness check, then the existing paired API/canonical Job
release process in project `project-c40d4821-e647-4fa2-92d`, `us-east4`.
Update only the existing admission-fence singleton in Supabase
`nzenxdfumxrnsmybazmo` using the four SQL files in this directory. No schema or
customer-record changes. Maintenance is limited to 60 minutes with drain before
switching either execution source.

Maximum additional Google usage: $0.50 once and $0.10/month incremental image
retention, credits first and within the existing personal-cash allocation.
These are ceilings, not measured charges. No new services, IAM, DNS, VM,
minimum instances, model/search allowance or paid-plan upgrade. Preserve voice
tags, microphone and the independent frontend rollback. Existing production
capacity remains unchanged. Remove the two temporary readiness tags afterward.

No suitable existing image contains this correction. Local tests and free CI
have already supplied the source verification. A new immutable image is needed
for the existing production API and Job to run the correction.

## Recovery and controls

Current recovery source: `1d487ce977699ba0f049d1227ab8c0b4920d8c1f`.
Current API revision: `xroga-api-response-fded88-serving-1101`.
Recovery image:
`us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release@sha256:3a9fef6760287c91befcbf55e9c7bfa06598f1d96118ccd57e335cea6080eee6`.

Preflight must prove this API/Job pair, running queue, recoverable image, current
fence and no active execution. Candidate startup reconciliation stays disabled.
Forward steps require exact-source CI, a fresh closed/drained-fence receipt,
matching immutable image/source identities and unexpired maintenance window.
If checks fail, preserve or restore the current pair while admission is closed.
Only reopen the matching recovery source after health and parity checks.
Never cancel real work or mark it complete to force a drain.

The scripts reject the prior consumed approval package. A new approval receipt
must identify this package, the exact candidate source and the owner's actual
decision. No approval receipt has been created.

## Execution order after approval

1. Record the actual approval, then `submit-build.py` once through the owned
   local runner. Inspect its journal instead of resubmitting unknown outcomes.
2. `verify-image.py`, `candidate.py`, `private-ready.py candidate`.
3. `cutover.py preflight`. Recheck the live database fence read-only. Create
   the 60-minute maintenance receipt, apply `01-pause-current.sql`, drain,
   and save a fresh closed/drained receipt. Then `cutover.py pause`.
4. `cutover.py serving`, `private-ready.py serving`, `cutover.py job`,
   `cutover.py promote`. Verify readiness, source parity and healthy traffic.
5. Apply `02-allow-response.sql`, save a fresh open-fence receipt, then
   `cutover.py resume`. Confirm healthy API, matching Job and running queue.
6. If recovery is necessary, close the candidate fence with
   `03-pause-response.sql`, drain, use `recover-job` and `recover-traffic`,
   apply `04-recover-current.sql` only after parity, then `recover-resume`.

## Acceptance still required

This release does not establish finished Response V2 acceptance. A newly
generated answer must still demonstrate correct guidance and rich blocks.
The previous financial attempt returned `EMPTY_PROVIDER_RESPONSE`; its pending
accounting reservation remains preserved. No automatic retry or new model
budget is authorized by this package. Source-aware research and quantitative
interaction acceptance remain unverified. Do not label them PASS from CI.
