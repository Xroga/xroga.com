# Response V2 new-chat correction, exact paired release

PREPARED, NOT APPROVED OR EXECUTED. This is a new source-specific window.

## Source and purpose

Backend `e1408f548c40c3faff6c1e987160faf1b3ec2101`, branch `codex/response-backend-release-20261101`. The currently live backend is `bc6cbc434a800c8e7aa086afc1edbbee447294f0`. The correction connects the rich answer contract to the actual chat pipeline, separates conceptual diagrams from source-backed claims, corrects tenant-authorization guidance, and specifies bounded linked calculator outputs. No second model call is introduced. Local tests do not establish model compliance.

Frontend `85895d2816baf8c475cab8e5d9f534a3b464d2ad`, PR #909, Preview deployment `4VZ8TJbMpXerD1VjAc3YvpefVS3v`. Presentation-only promotion remains conditional on source-pinned CI, authenticated Preview and new generated response acceptance. Keep the legacy renderer and current production frontend as rollback.

## Exact existing resources

- Google project `project-c40d4821-e647-4fa2-92d`, region `us-east4`.
- Cloud Run API `xroga-api` and canonical Job/Tasks queue `xroga-canonical-production`.
- Registry `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release`.
- Existing build identity `574998934848-compute@developer.gserviceaccount.com` and runtime identity `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`.
- Candidate revision `xroga-api-response-e1408f-check-1101`, temporary tag `response-e1408f-check`.
- Serving revision `xroga-api-response-e1408f-serving-1101`, temporary readiness tag `response-e1408f-serving-check`.
- Supabase project `nzenxdfumxrnsmybazmo`, existing `public.xroga_release_fence` singleton only.

No new service, VM, IAM, secret, network, DNS, schema migration, model provider or paid plan. Preserve all voice tags and load-balancer routing, existing feature gates, KMS, credentials, Drive, Batch 1 and customer state.

## Ordered authorized operations requested

1. Require all six existing exact-backend-source release gates. Verify the final frontend gates separately. Inspect source-attested images before building. If no matching image exists, submit one bounded build with the existing identity/registry. Journal unknown outcomes and never resubmit blindly. Verify the immutable digest, OCI source label, baked source, platform and build provenance before deployment. The digest is not yet available and must not be invented.
2. Copy the actual current serving revision configuration. Create the guarded candidate at zero default traffic, min instances 0, max instances 1, request-based CPU and startup reconciliation disabled. Verify private readiness through one exact removable task on the existing queue. Any unexpected configuration difference blocks promotion.
3. Announce a maintenance window of at most 60 minutes. Execute only `01-pause-bc6.sql`, which requires exactly the current bc6 source before setting admission to NULL. Drain existing work for at most 20 minutes, without forcing customer runs terminal. Pause the existing queue after the drain.
4. Create the matching serving revision without default traffic, verify private readiness, then update the existing canonical Job to the same immutable image. Switch API traffic only while admission remains closed and the queue is paused. Verify the exact API/Job/source pair. Execute only `02-allow-response.sql` to open admission for e1408f, then resume the queue after a fresh source-fence readback.
5. Perform the requested new-chat acceptance using existing authenticated account and canonical model accounting only. This package grants no additional model/search allowance. Do not repeat already charged search requests. Check the remaining account allowance before generation, retain usage receipts, and stop on unknown accounting. Rendering and local controls make no model calls.
6. Promote only the verified frontend through the existing Vercel process, with the current frontend retained for immediate rollback. Verify real xroga.com/workspace, including fresh response, saved reopening, copy/share and mobile. A backend health result is not product acceptance.
7. Remove only the two new temporary traffic tags and exact readiness tasks after checking no route depends on them. Retain serving and recovery images. Clean owned source archives after preserving provenance. Record measured or pending charges truthfully.

## SQL and rollback

All four SQL files use the existing canonical admission advisory lock, a five-second lock timeout and 30-second statement timeout. No DDL or customer-row rewrite is included.

Forward pause requires bc6 exactly. Forward open requires paused admission plus the existing all-status delivery/run drain predicate, then writes e1408f. Recovery uses `03-pause-response.sql` to pause only e1408f, drains safely, restores the bc6 API/Job pair, verifies readiness, and uses `04-recover-bc6.sql` to reopen only bc6. If forward promotion never occurred, reopen bc6 only after verifying the unchanged pair. Never restore a database over newer customer data.

Current verified recovery revision `xroga-api-response-bc6cbc-serving-1101`, image `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release@sha256:3fb9ce8f8fc9961679559dbb5d764355436d5b5dc0bb6f6ad12969896b3f3969`. Read-only pair and RUNNING queue observed at `2026-11-01T16:08:01.670622+00:00`. Recheck immediately before mutation. Preserve older ac8168 and 85f recovery assets as well.

Current frontend deployment `9qVig...` at source `2547ca11524ae91cb874da85dc109132a969ed50` was observed READY. Resolve its full deployment ID and confirm active aliases before any promotion. Never use a guessed rollback ID.

## Spending decision

Maximum $0.50 one-time incremental Google usage, and $0.10/month for at most 1 GiB of new image retention, credits first within the existing cash allocation. These are requested ceilings, not measured charges. No minimum-instance increase or idle VM. Stop before knowingly exceeding either ceiling. No model/search top-up or new allowance is included.

The previous c9267696 approval applied to bc6 and has already been executed. It is not reused as authorization for this new source, fence update or spending window. Approval of this exact package covers the listed steps as one window, conditional on required gates, without per-step permission requests.
