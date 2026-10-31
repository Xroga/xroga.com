# Batch 1.5 Browser Worker: one consolidated host decision

Status: REJECTED by the founder on 2026-10-31. Historical proposal only. Do not provision these resources or present this approval again. Issue #898's updated title/body and comment #6545943076 require Cloudflare Free first, existing resources second, on-demand paid execution only under separate approval. The original proposal is retained below as history, not an active request.
Founder instruction: https://github.com/Xroga/xroga.com/issues/898#issuecomment-6545735540
Prepared 2026-10-31. Batch 2 is stopped, including model tests and Builder fixes.

## Demonstrated blocker and preserved release

The focused project-wide Compute instances read returned `[]`. There is no existing VM to reuse in project `project-c40d4821-e647-4fa2-92d`. The merged `browserCoordinatorHost.ts` and `containerBrowserWorker.ts` require a Docker host for isolated Chromium and egress-proxy containers. Moving that contract into ordinary Cloud Run has not been verified and is not proposed. A free shared-core host has not passed this workload's memory/isolation requirements. The existing reviewed e2-medium host pattern is the smallest supported candidate, not a claim of measured production capacity.

Preserve serving API `xroga-api-b15b2-ac8168-serving-1031`, API/Job source `ac8168f940d6e56079bbeb5e717ef33001b8b171`, digest `sha256:7b3551559fa0585c2efb422397163fc796dd0e287b9f833936df98046944d549`, the canonical queue and admission source. Preserve the microphone routing/frontend and all recovery assets. Drive/R2/DB/Google Jobs acceptance is reused. No model-provider requests, production SQL, Builder activation or unrelated API/Job source cutover.

The earlier $2 isolated window remains unused. It does not authorize this retained host and will not be started in parallel or charged on top of this request. Its disabled staging-secret and scheduled-destruction staging-key prerequisites are not silently restored.

## Exact requested resources and access

All resources below are in the existing project. Maximum one host, no autoscaling group and no extra scheduler.

| Resource | Requested scope |
| --- | --- |
| Compute VM | `xroga-b15-browser-host`, `us-central1-a`, e2-medium, one 20 GiB pd-standard auto-delete boot disk, no external IP, base `xroga-exec-base-20261026` ID `5308884476316794212` |
| Network | Existing `xroga-verify-net` and `xroga-verify-subnet`; no new subnet or SSH ingress |
| Host identity | New `xroga-b15-browser-host@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`; Artifact Registry Reader on only existing us-east4 `cloud-run-source-deploy` repository and Secret Accessor on only the signing secret below |
| Signing secret | New `xroga-b15-browser-coordinator`; random HMAC signing key, accessible only to host identity and existing `xroga-api-runtime` identity; never printed or included in VM metadata |
| Egress | Router `xroga-b15-browser-router`, NAT `xroga-b15-browser-nat`, one reserved address `xroga-b15-browser-nat-ip`, us-central1, scoped to existing `xroga-verify-subnet`; no general project-wide NAT or public VM address |
| HTTPS host attachment | Zonal NEG `xroga-b15-browser-neg`, backend `xroga-b15-browser-backend`, TCP health check `xroga-b15-browser-health`, port 8080; existing `xroga-api-url-map` adds only `/v1/jobs` and `/v1/jobs/*` to this backend |
| Host inbound firewall | `xroga-b15-browser-from-lb`, TCP 8080 only from Google frontend ranges `35.191.0.0/16`, `130.211.0.0/22`, target tag `xroga-b15-browser-host`; no Internet-wide ingress |
| Durable dispatch | Queue `xroga-b15-browser-production`, us-east4, 1 dispatch/second, maximum one concurrent dispatch, bounded task retries/deadline; existing API `/internal/browser/execute` with existing runtime identity OIDC |
| Dispatch IAM | Existing runtime identity Tasks Enqueuer on that queue, service-account-user on itself only if absent, Cloud Run Invoker on existing API only if absent; no project-wide grants |
| Images | Existing registry and Cloud Build identity only, coordinator/browser/proxy exact reviewed source and digest pinned before execution; reuse matching available images, no mutable-tag execution |

Host receives no production database, customer, model, KMS or R2 credentials. Evidence flows through the existing authorized API into existing private Drive storage. Browser containers retain the existing Chromium sandbox, seccomp, resource/process limits, per-job network/proxy, signed dispatch, replay protection, leases and cleanup. No broad IAM roles.

NAT covers the named existing subnet, not just an application label. Record other subnet users at creation and attribute their usage before proceeding. If shared use would invalidate the cost ceiling or scope, stop rather than silently broadening it.

## Cost decision

Request one initial period of at most 30 days, not indefinite renewal. Gross charges, before credits:

| Component | Conservative planning amount |
| --- | ---: |
| e2-medium, $0.03350571/hour, 730 hours | $24.46 |
| Standard disk, 20 GiB at $0.04/GiB-month | $0.80 |
| Single-VM NAT, $0.0014/hour, 730 hours | $1.03 |
| One NAT IPv4, $0.005/hour, 730 hours | $3.65 |
| Fixed monthly/idle-running estimate | $29.94 |
| One-time build/copy/bootstrap and bounded acceptance allowance | Up to $1.00 |
| Variable traffic, registry, API/Tasks, secrets and logging allowance | Up to $4.06 |
| Total first-period authorization ceiling | $35.00 |

Use existing promotional credits first. Personal cash consumption must still stay within the founder's remaining $30 allocation across the project, not an additional $30. Do not top up or upgrade plans. If credits or remaining cash cannot cover the authorized operation, stop. Billing credits/remaining cash must be checked before provisioning, without assuming the historical balance is current.

NAT processing is $0.045/GiB; Internet transfer and load-balancer processing are additional usage, not included in the fixed estimate. Limit the initial owner-only workload to one concurrent job, 15 minutes per job, at most 1 GiB total browser transfer for the initial period, at most 2 GiB additional registry storage and 100 MiB new logs. These operational limits must be verified before enabling dispatch. They are not claims that Google offers a hard dollar cap. Reconcile accrued cost plus conservative outstanding usage before each bounded session, stop admission early if the ceiling would be exceeded, and retain a safety allowance for delayed billing. No unattended broad rollout under this package.

Prices checked against Google's published pages on 2026-10-31:
- https://cloud.google.com/products/compute/pricing/general-purpose
- https://cloud.google.com/compute/disks-image-pricing
- https://cloud.google.com/nat/pricing

Stopping a VM does not stop disk, NAT IP or storage charges. The fixed estimate is for an idle-running retained host. An idle shutdown may reduce compute cost but is not an implemented demand-driven wake mechanism. Do not claim scale-to-zero support or introduce a new controller as part of this decision.

## Activation and safety conditions

1. Verify approved cost headroom and source/digest pins. Prepare resource expiry, cleanup and protected rollback receipts before creating anything. The first synthetic acceptance session is at most 90 minutes within the same $35 ceiling, with zero model requests.
2. Start the existing hardened coordinator at maximum concurrency one. Verify sandbox readiness, absence of privileged credentials, signed dispatch and allowed egress before any authenticated application test.
3. Wire only browser-specific URL, signing-secret reference and Tasks configuration into the existing API. Preserve all existing production settings, API/Job source parity and microphone routing. Any required configuration revision must retain startup reconciliation protection and use zero minimum instances during readiness; remove obsolete test tags afterward.
4. Founder-only authorization is a mandatory server-side prerequisite. A hidden UI button is insufficient. The inspected public browser route currently authenticates tenants but does not itself demonstrate a founder-only allowlist. Reuse and verify the existing server-owned founder gate, including its identity/role/AAL requirements, before exposing the host. If a focused source correction is required, review and test only that correction and publish its exact source before promotion. This package does not authorize substituting a new API/Job source or changing the admission-fence SQL. Do not enable an ungated public route just because the host is ready.
5. Execute one deterministic public-page title/screenshot run through Xroga, then essential tenant denial, credential isolation, blocked egress, cancellation/revocation and crash-recovery checks. Persist owner-scoped run IDs and evidence without secrets. No repeat Drive/storage audit, full unrelated CI, Builder work or model call.
6. Classify Browser Worker LIVE only after real UI/API progress, result and private evidence access pass. Otherwise keep browser admission closed and preserve the healthy release.

## Cleanup and rollback

On failed acceptance: close browser admission, pause only the new browser queue, drain/cancel only test runs, restore the previous browser configuration and exact two URL-map paths, then delete the named host/boot disk, backend/NEG/health check/firewall, NAT/router/address and new queue. Remove only the new IAM bindings. Disable the new signing-secret version after consumers are detached. Preserve the existing API, canonical queue/Job, microphone, all customer/Drive data, release/recovery images and required audit evidence.

If retained after PASS: record creation time, owner, expiry and cost evidence; no second host. Before 30 days or earlier cost exhaustion, stop browser admission and perform the same resource cleanup unless the founder explicitly renews. Export durable browser evidence before deleting the disposable boot disk. Do not leave a stopped VM's NAT address accruing charges. Billing alerts are advisory, not a spending cap.

## Decision requested

Approve this exact private host, scoped access, browser-only configuration and one owner-only model-free acceptance session, with a $35 gross maximum for the first 30 days and no increase to the existing $30 cash allocation. No resources have been created under this request. Founder-gate verification and exact-source release safeguards remain mandatory execution gates, not claimed completed results.
