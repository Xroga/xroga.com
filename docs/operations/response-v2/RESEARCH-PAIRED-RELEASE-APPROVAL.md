# Response V2 research and guidance paired release

Status: SPECIFIC APPROVAL REQUIRED. Prepared only. No production mutation executed.

## Pinned scope

Release backend source `bc6cbc434a800c8e7aa086afc1edbbee447294f0` from `codex/response-backend-release-20261101`. This is the currently serving ac8168 source plus the reviewed response guidance, private research-result handoff and regression fixes. Do not build the historical PR 909 backend or the main-integrated PR 910 source for this release. They are different trees.

Frontend candidate is PR 909 source `0f1da118` or its exact-source-verified descendant containing only necessary release corrections. Its production promotion remains conditional on authenticated Preview acceptance. The legacy renderer and previous deployment remain the immediate frontend rollback.

Existing resources only:
- Project `project-c40d4821-e647-4fa2-92d`, region `us-east4`.
- Cloud Run API `xroga-api`, canonical Job and Tasks queue `xroga-canonical-production`.
- Registry `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release`.
- Build identity `574998934848-compute@developer.gserviceaccount.com` and runtime identity `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`.
- Supabase `nzenxdfumxrnsmybazmo`, existing `public.xroga_release_fence` singleton only.
- Candidate revision `xroga-api-response-bc6cbc-check-1101`, serving revision `xroga-api-response-bc6cbc-serving-1101`.

No new service, worker, IAM, secret, network, DNS, database schema or feature activation outside the response experience. Preserve voice tags and the voice load-balancer route, Drive, existing KMS custody, credentials and all current feature gates.

## Operations and ceilings

1. Require passing exact-release-source CI. Check for an existing source-attested digest before building. If absent, build this source once using the existing build identity and registry. Journal submission before sending it and inspect unknown outcomes instead of resubmitting. Record immutable digest and source attestation before deployment.
2. Copy the actual serving API configuration, not the latest voice template. Deploy the guarded candidate at 0% traffic and zero minimum instances with startup reconciliation disabled. Verify readiness and exact image identity. Stop on configuration drift.
3. Announce maintenance of at most 60 minutes. Under the existing admission lock, pause only an exact ac8168 fence. Let work drain for at most 20 minutes, then pause the existing queue. Abort if work cannot drain, without forcing any customer run terminal.
4. Update API and canonical Job to the same verified image/source. Validate readiness and pair identity before reopening the source fence and queue. Do not reopen mismatched workers.
5. Validate owner-only research-result access and existing application health. Use prior evidence before any paid request. This package grants zero additional model or search budget and no automatic retries. Newly generated acceptance remains subject to an enforceable existing balance/allowance.
6. Remove only the new temporary candidate traffic tag after checking that no route depends on it. Retain the serving and rollback images. Record actual usage, source, digest, revision and acceptance results.

Requested incremental ceilings are $0.50 one-time Google usage and $0.10/month for at most 1 GiB of new image retention, credits first, within the existing cash allocation. These are ceilings, not measured charges. There is no idle VM, minimum-instance increase or paid plan. Stop before exceeding either ceiling. Existing approval for the old ac8168 release is not being reused as approval for new SQL or spending.

## Exact database effects and rollback

Use the existing reviewed five-second lock and 30-second statement timeout and advisory lock `hashtextextended('xroga-canonical-admission',0)`.

- Pause requires exactly one singleton with source `ac8168f940d6e56079bbeb5e717ef33001b8b171`, then writes NULL.
- Forward requires paused admission, the existing all-status delivery/run drain predicate and verified matching API/Job, then writes `bc6cbc434a800c8e7aa086afc1edbbee447294f0`.
- Recovery pauses only the exact new source, drains safely, restores the ac8168 API/Job pair, verifies readiness, then reopens only ac8168. If no forward change happened, restore ac8168 admission only after verifying the unchanged pair.

Recovery revision `xroga-api-b15b2-ac8168-serving-1031`, digest `sha256:7b3551559fa0585c2efb422397163fc796dd0e287b9f833936df98046944d549` in the same registry. Preserve the additional 85f managed-custody recovery assets. Never restore a database over newer customer data. No DDL, customer export, credential rewrite or other SQL is included.

The ordered SQL files in this directory are preparation only and require this specific approval plus runtime preconditions. Passing CI or a candidate health check does not constitute live response acceptance.
