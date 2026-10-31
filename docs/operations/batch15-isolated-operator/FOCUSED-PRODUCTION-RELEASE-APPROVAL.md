# Batch 1.5 / Batch 2 focused API and canonical Job release

Status: OWNER APPROVAL REQUIRED. No operation in this package has executed.
Scope comes from Issue 898 and founder comment 6542353939. This is a backend release, not a declaration of full batch acceptance.

## Exact source and existing targets

- Source: `ac8168f940d6e56079bbeb5e717ef33001b8b171`, reviewed in PR 902, merged in `3abc33a0cc108ace6efa0ab282137e10081513cf` after PR 899. All seven required checks passed on that source.
- Google project: `project-c40d4821-e647-4fa2-92d`, region `us-east4`.
- Existing registry: `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release`.
- Existing service: `xroga-api`. Existing canonical Job and queue: `xroga-canonical-production`.
- Existing runtime identity: `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`.
- Guarded candidate revision: `xroga-api-b15b2-ac8168-check-1031`, 0% default traffic, zero minimum instances, startup reconciliation guard enabled.
- Serving revision, created only after candidate readiness: `xroga-api-b15b2-ac8168-serving-1031`. Preserve the current API limits and copy the actual Batch 1 serving configuration, not the latest voice revision's template.
- Supabase project: `nzenxdfumxrnsmybazmo`. No schema migration, DDL, customer export or credential rewrite.

## Requested operations and spending

1. Build the exact source once using the existing Cloud Build identity and registry. Resolve and record the immutable digest and source attestation. Reuse an already available matching digest instead if one is found. Never deploy a mutable tag.
2. Create only the guarded candidate in the existing API service. Verify readiness without startup reconciliation. No new service, IAM binding, secret, network, DNS or load-balancer object.
3. Announce a maintenance window of at most 60 minutes. Close canonical admission, let existing work drain for at most 20 minutes, then pause the existing queue. Abort without changing the pair if it cannot drain. Never force customer runs terminal.
4. Change the canonical Job and serving API together to the same verified digest/source. Preserve identity, KMS custody, secrets, worker base image, limits and recovery configuration. Reopen admission only after parity and readiness pass. Preserve every current voice tag and the exact microphone URL-map rule.
5. Within the existing worker pool, permit at most one ordinary private `xroga-exec-` verification worker and its 20 GiB boot disk, using the existing subnet/base image and a 45-minute deletion deadline. Record its exact generated ID before use, then delete only that test worker/disk. No additional capacity, networking or IAM.
6. Retain the healthy release and recovery assets. Candidate tags are removed after verification so they cannot accumulate idle minimum instances.

Requested additional Google usage ceiling: **$0.50 one-time**, including build, candidate verification and the bounded worker. Requested image retention allowance: **up to $0.10/month for at most 1 GiB** in the existing registry, credits first. No plan upgrade, purchase, funding top-up or knowingly exceeding the founder's existing cash allocation. These are approval ceilings, not measured invoice amounts or a claim that billing alerts impose a hard cap. Stop before an operation whose conservative estimate exceeds them.

The separately approved model test remains **one attempt, $0.10 maximum from existing model balance**. It may execute only after aggregate reservation-cap enforcement is proven. No model call has occurred. Missing usage is a terminal failure with the uncertain hold preserved, never an automatic retry. If this prerequisite fails, stop the model stage and report it rather than increasing the cap or creating another budget system.

## Exact production database effects

Only update `public.xroga_release_fence.allowed_source` on its existing singleton row. Reuse the reviewed admission advisory lock `hashtextextended('xroga-canonical-admission',0)`, five-second lock timeout and 30-second statement timeout.

- Pause: require the current singleton source to be `85f83e3f1dcbb057d4a28d8a696dae8396d45114`, then set `allowed_source=NULL`.
- Forward: require admission paused and the same all-status drain predicate already reviewed in `batch1-activation-operator/cutover-allow-85.sql`, then set `allowed_source='ac8168f940d6e56079bbeb5e717ef33001b8b171'`.
- Recovery: under the same pause/drain and pair-verification requirements, restore `allowed_source='85f83e3f1dcbb057d4a28d8a696dae8396d45114'`.

No other SQL mutation is authorized. The old ca94 acceptance branch is not an allowed release source in this package. Do not use the old hardcoded paired-cutover script unchanged.

## Recovery and feature boundaries

Current recovery revision: `xroga-api-batch1-85f-serving-1031`.
Current matching API/Job digest: `sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80` in the same registry. Recover the pair under the closed/drained fence, verify readiness, then reopen only source 85f. No database restore over newer customer data. Preserve KMS, credential revisions, tombstones and encrypted recovery objects.

The frontend and microphone stay untouched. No broad Builder UI enablement, GitHub/Supabase/Vercel delivery, QA PASS, Batch 3 or Batch 4 activation. Drive remains active independently. Any model, budget, tenancy or recovery failure stops that capability and retains the healthy release.

## Browser-only blocker, excluded from this release request

No approved retained isolated host exists. The one supported route examined is the existing hardened container coordinator on a single private e2-medium / 20 GiB standard-disk host in the existing us-central1 network, with the already reviewed NAT pattern. At 730 hours, the estimated additional fixed base is $29.93/month: VM $24.46, disk $0.80, single-VM NAT $1.02 and NAT IPv4 $3.65, before credits and variable traffic/logging. This is not a verified production-host quote or an approved total spending cap.

A retained host requires an exact permanent resource/identity/signing-secret access approval beyond the existing two-hour package. Its identity must have only registry read and its signing-secret access, no API/database/model credentials, with the reviewed GFE-only inbound rule. No host, NAT or KMS experiment will run under this backend release approval. Browser Worker stays BLOCKED and does not hold Builder source integration hostage.

Price references: https://cloud.google.com/products/compute/pricing/general-purpose , https://cloud.google.com/products/block-storage , https://cloud.google.com/nat/pricing .