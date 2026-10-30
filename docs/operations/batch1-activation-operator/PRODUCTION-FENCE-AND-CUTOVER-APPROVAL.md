# Batch 1 source-safe production cutover

Prepared October 31, 2026 Pakistan time. Approval is pending. No production SQL,
Job image switch or serving-traffic shift has been performed by this continuation.
The founder's separate production-SQL approval boundary remains in force.

## Exact scope

| Field | Selected target or action |
| --- | --- |
| Project | `project-c40d4821-e647-4fa2-92d`, region `us-east4` |
| Database | Existing Supabase project `nzenxdfumxrnsmybazmo` |
| Existing serving API | `xroga-api-batch1-ca94-serving3`, source `ca94c2f8a813524e47f5f7abc868acb1618a1c45` |
| Existing API/Job image | `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release@sha256:49505ef989f3c686ca443d2fa6a7265175e35d7a8440f75c6b0773e2d5862888` |
| Approved Batch 1 source | `85f83e3f1dcbb057d4a28d8a696dae8396d45114` |
| Existing verified replacement image | Same standard repository, digest `sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80` |
| Verified guarded candidate | `xroga-api-batch1-85f-guard-1031`, zero traffic, min 0/max 1, startup guard enabled. Temporary verification tag removed after HTTP 200. |
| Serving revision to create | `xroga-api-batch1-85f-serving-1031`, derived from the known ca94 serving configuration, same pinned replacement image and matching worker image, normal serving startup, min 1/max 1. Do not inherit the latest template. |
| Canonical Job and queue | Existing `xroga-canonical-production` |
| Identity and protected configuration | Existing `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`, native Google identity, `xroga-platform-production:3`, existing KMS configuration and exact base image ID `5308884476316794212` |
| Data preservation | No customer-row edits, credential rewriting, revision/tombstone changes, legacy format downgrade or replay of historical migrations |
| Other releases | No frontend release, main merge, microphone/voice route or PR change. No Batch 1.5/2/3/4 activation. Preserve every current voice tag and URL-map rule. |

## New database operations requiring approval

Only these five files are included. They were exercised against the fresh full
restore as the restored production `postgres` role, with its non-superuser role
attributes. Recheck their bytes before execution.

| File | SHA-256 | Effect |
| --- | --- | --- |
| `cutover-fence-upgrade.DRAFT.sql` | `3b4b28cba0f76714feb9758b4d4917ef619593895d296d7b1af958f9a2dddeed` | One RLS-protected `public.xroga_release_fence` table, a source-check trigger on `public.google_canonical_deliveries`, and a guarded replacement of the existing enqueue function. Initially admits only ca94. Service role can read the gate and cannot change it. Anonymous/authenticated roles have no access. |
| `cutover-pause.sql` | `2ba3b7649cacb260b39b5708e44f47c6f16f2ff4eef6d11a6fb857f423b53fa9` | Close admission under an exclusive transaction advisory lock, waiting for admitted transactions. Leaves run data intact. |
| `cutover-allow-85.sql` | `0849fc12176ee20efdb831911f826cc4132dccc51dfbdd5e105154c1b264b13a` | Admit only the replacement source after the gate is closed and all nonterminal canonical work has drained. |
| `cutover-allow-ca94.sql` | `54421453ee0b37d11c1609d56bffb295273bbe465463537fa9ce5a4c4a1ec501` | Recovery admission for ca94, subject to the same pause-and-drain guard. |
| `cutover-fence-rollback.DRAFT.sql` | `a188225ef4e9b3bbc8c2216e22f85ec3d0e4e2b9dc81d1ff794ee8fd1c508be2` | Restore the exact original enqueue function and remove only the new fence objects, after pause and full drain. |

The historical `released-google-canonical-deliveries.sql` is NOT production work.
It was needed only to bring the old October 27 isolated fixture up to the already
released transport schema. The fresh backup already contains that schema.

## Verified prerequisites

| Gate | Evidence and limits |
| --- | --- |
| Source | Pinned Batch 1-only source and immutable registry digest. Runtime change from ca94 is the Preview admission timeout and its regression test. Later-batch code at the historical PR's different integration head is excluded. |
| Tests | Exact-source run `40898491952` passed the canonical build, test and security baseline twice and compared the results. Its PR-only `integrated-candidate` job was skipped, not passed. Existing accepted Batch 1 evidence is retained. No CI rerun was started. |
| Security | Existing frozen source acceptance retained. Fresh isolated restore tests passed pause, wrong-source and foreign-owner denial, gate privilege denial, concurrent admission draining and exact rollback. No security requirement was weakened. |
| Runtime | Guarded source85 candidate returned private `/ready` HTTP 200 at `2026-10-30T22:09:02.437791Z`. Native identity/configuration and candidate worker image checked. The probe Task and its temporary tag were removed. This is not full production workflow acceptance. |
| Compatibility | The production enqueue body MD5 is `9014766f51e6d9fd878cc5d4724383c2`, invoker security, service-only execution. Current API/Job remain on the matching ca94 image. Fresh restored schema, role ownership, forward gate and recovery gate passed. Installation fails atomically on drift. |
| Cost review | Reuse the existing image, service, Job, queue, identity, network and worker pool. No new IAM, service, paid model, plan, DNS or load balancer. Candidates min 0. Remove the old Batch 1 warm tag at promotion while retaining its revision/image. Preserve unrelated voice tags. |
| Recovery | Fresh encrypted backup independently retrieved and authenticated, then fully restored into no-swap, networkless, tmpfs-only PostgreSQL. Forward and reverse source gates and exact function rollback passed. Container and temporary restore ciphertext copies removed. Recovery after admission opens remains conditional on draining new work, never forcing customer runs terminal. |

Source CI: https://github.com/Xroga/xroga.com/actions/runs/40898491952

Fresh recovery point:
`gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261030T220451Z/`.
Database object generation `1793398370274989`, encrypted size 13,125,031 bytes,
SHA-256 `5e97644e99532dce14d837812c1289c80700e32d9886dcac82208b12e73c0115`.
Roles, private credential objects, encrypted manifest, legacy-key escrow and
KMS-wrapped backup secret are retained in the same protected prefix. Their
redacted integrity receipts are in `fresh-backup-and-fence-proof-20261031.json`.
No plaintext backup or credentials were persisted to the laptop or ordinary logs.

## Single bounded execution window

After exact owner approval, announce the maintenance start. Maximum window is
60 minutes. Run submission can temporarily fail closed during the admission
pause. Account reads and unrelated healthy routes should remain available.

1. Recheck current traffic, Job source, queue, empty active Job executions and
   the SQL guard. Stop on unreviewed drift. Do not overwrite another release.
2. Apply only the guarded fence upgrade, initially allowing ca94. Close admission
   with the reviewed pause SQL. Keep the old API/Job pair and queue running while
   already-admitted work drains. If it cannot drain within 20 minutes, abort the
   cutover and safely reopen ca94 without changing either image.
3. Once no nonterminal canonical work or active Job remains, pause the queue.
   Create the named replacement serving revision at 0% with normal serving
   configuration while admission is closed. Keep the isolated startup guard on
   the verification candidate. Verify readiness and the exact image/config.
4. Change the canonical Job to the replacement digest, source label and matching
   `XROGA_GOOGLE_WORKER_IMAGE`. Preserve its command, identity, secrets, networking,
   exact base image ID and resource limits. Re-read the Job and verify parity.
5. Verify the pre-traffic gates again. Switch only default API traffic to the
   named replacement serving revision. Preserve every current voice tag and
   voice URL-map rule. Remove only the old `batch1-ca94-serving` warm tag so its
   retained revision becomes cold. Use concurrency protection. No mixed-source
   canary is permitted with this single canonical Job.
6. Verify new-source health/readiness and the matched API/Job pair while admission
   is still closed. Apply the reviewed allow85 SQL and resume the queue.
7. Run one bounded synthetic, model-free acceptance session on the existing
   authorized synthetic project: dispatch/claims, persistence, cancellation,
   accounting, ownership/tenant denial, private worker lifecycle, Preview HTTP,
   WebSocket and grant revocation. Reuse unchanged recovery/storage evidence and
   distinguish synthetic execution from successful AI generation.
8. Record results, exact source/digest, traffic and Job state. Destroy the test
   worker and its boot disk and remove exact test-only Tasks/process overrides.
   Leave canonical Job configuration restored and compatible. Preserve required
   evidence and recovery objects.

The test may use one private `e2-medium` worker in existing
`xroga-verify-subnet`, one 20 GB boot disk and the existing canonical Job.
No model calls. Automatic VM deletion at 45 minutes. Requested maximum additional
test consumption is $0.25, from existing credits/funding, with no new subscription
or increase to the founder's $30 personal-cash allocation. Existing approved image
retention and production baseline ceilings remain unchanged. Billing posting
lags, so this is a bounded estimate/allowance, not a claim of settled cost.

## Failure and recovery

Close admission and pause the queue before changing a pair. Preserve all customer
work. Never mark it completed/cancelled merely to satisfy the drain guard. If
drain succeeds, restore the retained ca94 serving revision and the exact ca94 Job
image/configuration together, verify health, then apply allowca94 and resume.
If work cannot drain, keep admission closed and the healthy compatible pair in
place, report the precise condition and recover the affected work under its
existing authority. Do not restore the obsolete b0 image or rounded base-image ID.

Removing the new schema is optional recovery work only after the same pause/drain
checks. Do not restore the whole database over newer customer data as a routine
rollback. Keep encrypted recovery assets, KMS custody, revisions and tombstones.

## Owner decision

Approve only these five exact production SQL files, this source-safe Batch 1
API/Job cutover and the bounded $0.25 model-free verification session. All
operations remain conditional on the stated gates and stop conditions. This
does not authorize microphone changes or activation of other batches.
