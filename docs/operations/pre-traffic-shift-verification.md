# Mandatory pre-traffic-shift verification

This permanent founder rule applies to future Xroga batches, Cloud Run revisions,
worker and browser automation activations, frontend promotions, endpoint routing
changes and other production releases. Production rollout is the final controlled
verification stage. Do not use serving traffic to discover preventable defects.

Follow the existing release manifest, canonical promotion evaluator, security
requirements and [cloud usage policy](cloud-usage-policy.md). This document does
not replace those controls, create another release system or grant deployment,
IAM, data, spending or batch activation authority.

## Gate before requesting traffic-promotion approval

All seven outcomes must be PASS with source-bound evidence:

`Source PASS + Tests PASS + Security PASS + Runtime PASS + Compatibility PASS + Cost Review PASS + Rollback Ready`

Missing evidence is BLOCKED, not PASS. A known release-blocking defect must be
fixed before requesting promotion approval. If an exact test-access window or
new expense is indispensable to obtain evidence, request only that bounded test
scope. Approval to test a candidate is not approval to promote it.

### Source, tests and security

- Record the exact source SHA for each component and the intended complete change.
  Resolve blocking review comments and exclude unrelated batch changes.
- Run relevant lint, types, unit, integration and security checks through local
  development or existing CI first. Required CI gates must pass for the release.
  Preserve accepted evidence for unchanged scope and identify which checks a new
  source or configuration change actually affects. Do not rerun unchanged suites
  blindly or describe evidence from another source as exact-source verification.
- Bind the tested source, build exit status, immutable image digest and provider
  build identity. Keep different frontend, API and Job identities explicit.
  Verify the image's source provenance. Do not deploy an unknown or mutable tag.
- Verify the built frontend's environment-dependent behavior. A Preview artifact
  built with different settings is not proof of the intended production artifact.
- Preserve canonical authorization, tenant ownership, approval, credential,
  revocation, cancellation and accounting gates. Do not bypass one to get a
  functional test to pass. A stubbed provider success is not real provider proof.

### Runtime and compatibility

- Verify required configuration and exact secret references without printing or
  exporting secret values. Check identity, auth, authorization and request/response
  contracts under the intended runtime configuration.
- Verify schema compatibility against the candidate and recovery pair. Keep any
  production SQL approval separate. A source migration file is not evidence that
  an existing production catalog or restore path is compatible.
- Verify the canonical API, Job, queue, scheduler and worker source/protocol
  compatibility, including pending deliveries, durable claims, cancellation,
  retries, resumption and accounting where affected.
- Check actual CPU, memory, concurrency, billing mode, service and revision
  scaling, and startup/background behavior. Clear release-blocking errors.
- A candidate with zero default traffic can still mutate shared state or consume
  a live queue on startup. Preserve the verified startup-reconciliation guard and
  prevent unapproved side effects, background claims or customer execution.
- Verify through a controlled environment with synthetic authorized fixtures.
  Use an already approved zero-production-traffic candidate when real cloud
  behavior is required. Direct candidate testing must preserve authentication,
  ingress/network restrictions and the healthy serving revision. Do not add a
  public bypass or duplicate infrastructure merely to reach the candidate.

### Actual changed functionality

Exercise the actual changed path before sending production users to it. Record
the environment, source/image, inputs, results, failures and limitations.

| Release type | Minimum relevant functional evidence |
| --- | --- |
| Microphone | Recording, transcription, editable composer text, cancellation/late-result handling and manual Send. Separate real capture/provider evidence from mocked recognition and identify device/browser coverage. |
| Browser automation | Authorized navigation and execution, tenant/tool/network security boundaries, cancellation and independently verified requested postconditions. |
| Batch activation | Its unchanged required acceptance cases in a controlled environment, including real dependencies where mandatory. |

Do not label separate unit/provider fixtures as a verified combined end-to-end
flow when that actual flow has not run. Simulations, missing device coverage,
unavailable credentials and other untested conditions must remain explicit.
Do not run real customer tasks, paid model requests or consequential Send actions
outside their approved scope to complete a demonstration.

### Cost review

Record current observed allocations, candidate minimum instances, billing mode,
CPU/memory, concurrency/retry bounds, test duration, expected incremental and
retained cost, old/new overlap, ownership, expiry and cleanup. Review every
traffic tag and revision minimum, not just the latest service template.

Prefer minimum-zero, request-based temporary candidates where compatible. An
approved exception needs a reason, cost and deadline. Retaining a recovery image
does not require a warm historical tag. Do not recreate the retired nine tags or
leave inactive candidates silently consuming recurring allocation.

### Rollback ready

Before the first traffic change, identify the actual current known-good revision,
traffic percentages, immutable image, configuration and canonical Job pairing.
Verify its health and compatibility. Preserve the assets and exact restoration
procedure, database/credential-format compatibility and external-side-effect
handling. Define observable failure thresholds and the recovery operator.

`xroga-api-batch1-ca94-serving3` is a historically verified Batch 1 serving
revision. It is not a permanent assertion of current state or an automatically
valid future rollback target. Recheck its current health, image and API/Job/schema
compatibility before selecting it. Do not deploy an incompatible legacy custody
image or assume that image existence proves recovery readiness.

## Required owner approval report

Complete this report only after the required pre-release gates pass. Link actual
receipts and state limitations. Approval covers the exact source, image,
configuration, traffic plan and recovery procedure shown to the owner.

| Required field | Evidence to provide |
| --- | --- |
| Release purpose | Exact changed functionality and exclusions from other batches |
| Source SHA | Exact tested commit for each released component and immutable digest |
| CI status | Required passing checks and their source identities |
| Functional tests | Actual results, environment, real versus simulated scope and limitations |
| Current revision | Actual serving revision, image, configuration and traffic percentages |
| Candidate revision | Exact image/source, runtime/secret references and startup safeguards |
| Compatibility | API, Job, queue, scheduler, workers, schema, contracts and security |
| Cost | Incremental/recurring/idle cost, test duration and old/new overlap |
| Rollout | Bounded traffic steps, observation windows and measurable promotion/stop gates |
| Rollback | Verified compatible recovery assets, thresholds, exact procedure and side-effect handling |
| Cleanup | Owner, temporary tag/resource expiry and verification of final allocation |

Do not request traffic-promotion approval with known blockers or an incomplete
evidence package. Existing approval for another build or a test window does not
automatically cover a different source, permission, expense or production scope.
Respect an existing exact approval while its conditions still hold. Do not ask
again for unchanged steps already covered by that authorization.

## Controlled rollout after exact approval

1. Re-read current source, revision, traffic and ownership at the change boundary.
   Preserve the known-good configuration and stop on an unexplained concurrent
   modification. Never overwrite current state with a stale full-service export.
2. Use a bounded canary, such as 1-5%, only when appropriate for that service,
   traffic volume and compatibility protocol. Source-paired API/Job execution
   must remain valid for both serving sources and pending deliveries. If a safe
   mixed-source canary is not supported, use an approved compatible source-safe
   transition and controlled synthetic verification through the existing canonical
   system. Do not invent another scheduler or silently bypass source admission.
3. Observe real error rate, latency, health, resource usage and cost against the
   predefined thresholds. Quiet or insufficient natural traffic is not evidence
   of success. Use controlled authenticated synthetic cases where necessary.
4. Advance traffic only after the measured gate for the current step passes.
   Recheck API/Job/queue compatibility and required user-visible behavior. Do not
   automatically advance through percentages based only on elapsed time.
5. If a failure threshold is crossed, use the verified compatible recovery plan.
   Preserve evidence, diagnose the cause, fix the defect and repeat the affected
   pre-release checks before another proposed rollout. Do not immediately retry
   or treat a failed rollout as permission for an endless redeployment loop.

## Successful or failed release closeout

Inspect temporary tags, every revision minimum and actual allocations. Retire
unneeded candidates within the approved cleanup scope, preserving required
revision definitions, immutable images, durable state and rollback evidence.
Verify serving API/Job health, queue compatibility, final traffic, instance counts
and resource configuration. Record deployed source/digests and outstanding
conditions honestly. Do not claim all post-release acceptance passed from a
provider READY state, URL, health endpoint or source-level tests alone.

Test first. Verify first. Check cost first. Prepare rollback first. Shift traffic
last.
