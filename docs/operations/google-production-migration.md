# Google production migration, current release procedure

## Current accepted production state, 2026-10-27

`XROGA_ZERO_FLY_MIGRATION_ACCEPTED`. This section supersedes the historical
in-progress release notes below. The source-bound final receipt is
[`FINAL-PRODUCTION-ACCEPTANCE-20261027.json`](../xroga/evidence/zero-fly/FINAL-PRODUCTION-ACCEPTANCE-20261027.json).

- Merged implementation: PR856 `3c3bc0f5`, PR864
  `5ada5db7526efb1e0a4e426dbf4feab3d538597f`. Tested integration tree:
  `1562214154b7f58c51d8d4bbd188d5d7540e4a31`.
- Baked runtime source: `b11841ead316913cb46316fa7c16e76c6519b392`.
- Immutable forward and independent Google recovery digest:
  `sha256:3374633058c62d7a205f4fe95d28a4b312de1eab21068555fde7c0f73ea9dc43`.
- Service `xroga-api`, `us-east4`, forward
  `xroga-api-google-b11841ea-r1` at 100%, recovery
  `xroga-api-google-b11841ea-recovery-r1`. Both were promoted and passed readiness.
- Native `xroga-api-runtime` identity, existing production KMS key, platform
  secret version 2 and direct Whop secret version 1. Preserve these bindings.
- Canonical queue is RUNNING. Completed/cancelled fixture deliveries returned
  204 on the corrected revision. The exact canonical Job template is restored.
- Production worker allocation, saved ownership, execution, Preview HTTP and
  WebSocket, revocation, cancellation, durable results and cleanup passed using
  bounded model-free fixtures. Accepted process-loss recovery evidence is reused.
- Both Fly API machines are stopped with autostart false and restart `no`.
  The Fly federation pool and old KMS service identity are disabled. Native
  Google health and normal signed-in owner data still work. No active Fly runtime
  dependency remains. Cold Fly assets are retained for final owner deletion approval.
- Vercel production stays at `3c3bc0f5`, with API `https://api.xroga.com`.
  Whop's active callback uses the Google API. Supabase and private R2 stay preserved.

### Recovery without Fly

Pause new canonical admissions before a recovery switch. Preserve claimed work,
fences and terminal records. Use the already verified native recovery revision:

```sh
gcloud tasks queues pause xroga-canonical-production --location=us-east4 --project=project-c40d4821-e647-4fa2-92d
gcloud run services update-traffic xroga-api --region=us-east4 --project=project-c40d4821-e647-4fa2-92d --to-revisions=xroga-api-google-b11841ea-recovery-r1=100
```

Verify `/health` and `/ready` through `https://api.xroga.com`, native custody,
authenticated functionality and the matching Job image/configuration before
resuming the queue. Forward and recovery use the same verified compatible digest
under independent registry names. Keep the encrypted backup at
`gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/`.
The actual isolated restore passed. No destructive schema rollback is required
for the applied expand-only delivery migration. Restore data only under the
applicable incident authorization. Never select a legacy-only credential writer,
erase delivery history, or re-enable retired Fly workflows.

Required CI already passed on the exact integrated tree. Do not rebuild or rerun
those suites for this evidence-only closure. Known model failures remain separate.
Optional timed private-file links lack a signing key in both preserved bundles
and aren't claimed verified. Owner private-file storage passed.

## Historical execution notes, superseded by the accepted state above

> Live update, 2026-10-27: PR856 is merged at `3c3bc0f54b9e1f38e67641284de4b16073016fdb`. Vercel production `13C195qgr3vsaYs3GPB52tGnjJP4` is Ready at that source and uses the Google API. Native API/recovery revisions now end in `r4`/`recovery-r4`, with platform secret version `2`. The founder explicitly approved private R2 configuration and its documented account-wide read capability. The original 107 settings are preserved and only five approved R2 settings were added. The unchanged native API preflight passes. The production queue remains paused during final acceptance. Fly stays intact.
>
> The actual production worker fixture exposed a cold allocation that took 108 seconds, beyond the earlier 120-poll budget. It stopped before saving its native allocation receipt. Exact native diagnostic `xroga-canonical-production-9mnm9` confirmed permissions/session persistence and removed that synthetic VM/disk. The correction records native operation targets early, uses a bounded three-minute creation wait and refuses to declare cleanup while creation remains pending. Focused tests pass. Its replacement image and final production acceptance are still pending, so this is not zero-Fly completion. Optional timed file links have no signing key in either preserved configuration, and no signed-link success is claimed. Existing owner-authorized private upload/read integrity passes.
>
> Dated records below remain historical. Use the latest source-bound operator state and receipts before resuming. Never rerun the old r3/r4 release operators over existing immutable revisions.

The replacement API and canonical Job use application source
`faf56ff8e0d6b9de61cbeb412c2e86c75b17dac3`. Frontend URL, workflow-retirement
and evidence follow-ups don't change production runtime code. The sole backend
difference is `legacyRetirement.test.ts`, updated to require the retired Fly
workflow to refuse deployment. It isn't imported by the production entrypoint.
Check the exact backend diff before reusing the image. Never override its baked SHA.

Production acceptance and frontend cutover remain in progress. This document
doesn't declare zero-Fly completion. Dated Command 004 inventory observations
remain historical evidence. This release record supersedes their hosting
procedures, without rewriting the original security or acceptance rules.

## Exact native resources

- Project `project-c40d4821-e647-4fa2-92d`, number `574998934848`.
- Cloud Run service `xroga-api`, region `us-east4`.
- Forward revision `xroga-api-google-faf56ff8-r3`.
- Compatible recovery revision `xroga-api-google-faf56ff8-recovery-r3`.
- Runtime identity `xroga-api-runtime`, native metadata identity, no Fly WIF.
- Protected secret `xroga-platform-production`, pinned version `1`.
- Existing API-only `WHOP_WEBHOOK_SECRET`, pinned version `1`, retained from
  the pre-release Google configuration. Shared secret comparisons all match.
- Existing production credential key `xroga-production-credentials` in
  `us-central1`, key ring `xroga-p3-verify-20261023`. Preserve every required key
  version, ciphertext revision, ownership field and tombstone.
- Queue and Job `xroga-canonical-production`, `us-east4`. Queue is running after
  native admission checks. One canonical scheduler remains. Its configured mode
  is `cloud`, matching the existing authenticated scheduler route.
- Two bounded `xroga-exec-` slots in `us-central1-a`, immutable base
  `xroga-exec-base-20261026`, numeric image ID `5308884476316794212`.
- Private SSH and Preview port 3000 from control subnet `10.91.0.0/26` only.
- Existing Supabase and R2 remain the data and storage services.

Forward image is
`us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-migration@sha256:6eb0f38749d62d5cc6e0d61a5de77d42bc8428a4b34580b6c4a8cff86e3f89d6`.
Independent recovery reference uses repository `xroga-google-migration-recovery`
at the same digest. Both references were actually started with native production
configuration, and `/health` and `/ready` passed at the baked source SHA. Readiness
performs managed KMS wrap/unwrap and database connectivity checks.

The unchanged native API preflight passes on actual native readbacks. Production
Cloud Tasks OIDC dispatch and the existing authenticated Scheduler both returned
204. Native Job `xroga-canonical-production-l7cqt` succeeded after denying an absent
delivery claim. This verifies real startup and claim denial, not successful model
generation. Accepted isolated worker lifecycle, Preview and recovery tests remain
separately source-bound evidence. Final authenticated frontend cutover is pending.

The active Whop callback now uses `https://api.xroga.com/api/billing/webhook/whop`,
with its existing signing secret and nine subscribed events preserved. A signed
malformed body reached signature verification and was rejected before database
writes. Unsigned events are denied. Ingress is internal/load-balancer only.
Internal Scheduler and Tasks still return 204 after that restriction.

All required CI, including two complete feature and integration baselines and
authenticated tenant tests, passed at `5e8b4e7b33517486751ca060864228f2ab1bead6`.
The final follow-up retires the two local Fly deploy/credential scripts and
records operational evidence. Preserve the earlier exact-source results.

Production acceptance is blocked on private-storage configuration approval and
the final frontend cutover. Both preserved deployments lack all five names used
by current private R2 storage. The copied legacy xroga-assets credential returned
401 on a read-only bucket check and is not used by that private-storage code.
Cloudflare lists six retained empty buckets. Do not repurpose Claude's separate
`xroga-drive-test` bucket. The exact additional credential/bucket proposal is
`outputs/fly-to-gcp-20261025/PRODUCTION-PRIVATE-STORAGE-CONFIGURATION-ADDITION.md`
in the operator workspace, pending founder approval. No storage access is granted
by this document and no private-storage check is promoted to PASS.

## Protected recovery and schema

Current encrypted recovery point is
`gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/`.
The current database, roles and 40 private credential objects passed an actual
isolated PostgreSQL17 restore. Plaintext stayed in memory or container tmpfs.
The exact container was removed, with a verified cleanup receipt. Earlier
encrypted recovery points and original acceptance evidence remain preserved.

The only production expansion is
`20261026000000_google_canonical_deliveries.sql`, normalized SHA256
`8038463a25c4f3bde741fc768ddd781595685267e582af915a5edef4b1070d9b`.
Its prior full-history and current-snapshot restore/upgrade proof is retained.
Production application and service-only privilege readback are recorded under
`docs/xroga/evidence/zero-fly/PRODUCTION-SCHEMA-EXPANSION-20261027.json`.
Never replay historical migrations or apply unrelated Batch1.5 SQL.

## Promotion and recovery

Keep automatic Fly deployments and the existing Google Cloud Build deployment
trigger disabled. The retired Fly workflows deliberately refuse new operations.
No production deployment may be inferred from a main merge or green build.
Both `scripts/deploy-api.sh` and `scripts/setup-fly-auth.sh` also refuse all
operations. Historical manifests and frozen audit fixtures remain preserved,
with optional Fly adapters inactive because no Fly configuration is admitted
to the Google production environment. A string inventory is not live evidence.

Use the named HTTPS front door and only `api.xroga.com` and
`*.preview.xroga.com` DNS records. Preserve apex/Vercel, mail records and unrelated
callbacks. Keep the frontend's branch-specific synthetic staging overrides
separate from production. Production frontend API origin is `https://api.xroga.com`.

Before traffic changes, read current service traffic and exact image/identity/
secret-version configuration. After promotion, verify native readiness, normal
authenticated requests, deterministic workers, canonical Jobs and Preview.
Keep model-output failures classified separately. Don't spend provider balance
retrying known model failures.

If acceptance fails, stop new admissions and pause the named queue. Preserve
active claims, checkpoints, usage accounting and delivery history. Switch to
the verified native recovery revision, then verify readiness and owned task
recovery before resuming admission. Don't drop the expansion, purge queues with
active work, deploy the legacy credential-only recovery image, or re-enable an
old Fly deployment workflow. Fly resources remain intact until Google acceptance
and recovery requirements pass. Their final retirement is separately recorded.

Use existing promotional credit first. Approved retained baseline is roughly
$65-$70/month before worker and other variable use. Alerts aren't a hard cap.
Don't knowingly exceed the stated $30 cash allocation or buy additional credits.
