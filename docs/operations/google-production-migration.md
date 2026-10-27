# Google production migration, current release procedure

The replacement API and canonical Job use application source
`faf56ff8e0d6b9de61cbeb412c2e86c75b17dac3`. Frontend URL, workflow-retirement
and evidence-only follow-ups don't change the Docker API inputs. Verify that
equivalence with `git diff faf56ff8 -- Dockerfile.api backend .dockerignore`
before reusing the immutable image. Never override its baked release SHA.

Production acceptance and frontend cutover remain in progress. This document
doesn't declare zero-Fly completion. Dated Command 004 inventory observations
remain historical evidence. This release record supersedes their hosting
procedures, without rewriting the original security or acceptance rules.

## Exact native resources

- Project `project-c40d4821-e647-4fa2-92d`, number `574998934848`.
- Cloud Run service `xroga-api`, region `us-east4`.
- Forward revision `xroga-api-google-faf56ff8-r1`.
- Compatible recovery revision `xroga-api-google-faf56ff8-recovery`.
- Runtime identity `xroga-api-runtime`, native metadata identity, no Fly WIF.
- Protected secret `xroga-platform-production`, pinned version `1`.
- Existing production credential key `xroga-production-credentials` in
  `us-central1`, key ring `xroga-p3-verify-20261023`. Preserve every required key
  version, ciphertext revision, ownership field and tombstone.
- Queue and Job `xroga-canonical-production`, `us-east4`. Queue starts paused
  until production admission checks pass. One canonical scheduler remains.
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
