# Phase 3 production-shaped staging

Status: prepared, not deployed. Source baseline cbc79b816a54d0d0c50841e4763087a8854771d1. This target does not establish production customer cutover or change the original acceptance evaluator.

## Safety contract

Keep Fly xroga-api serving customers. No frontend/DNS change, production migration, production service-role key, live provider credential, sandbox token or customer record is allowed here. API startup calls reconcileOrphanedRuns and shutdown can fail active runs, so zero customer traffic alone is insufficient isolation. Provision a separate empty Supabase project only after organization/cost approval. Apply the source migrations only to that disposable project after positively checking its project ID differs from production nzenxdfumxrnsmybazmo and unrelated XrogaLOGIN lztqfktsahpzitybthld. Do not restore either old synthetic KMS key.

Reuse Dockerfile.api without a competing vault, SDK client or orchestrator. Build from the exact recorded source with XROGA_RELEASE_SHA build argument, record context tree and resulting image digest, and push only after repository/spend approval. The previous a67e66a9 image is a probe harness, not this API image. Record actual image/build provenance before substituting the template sentinel.

The service is IAM-private, not network-internal. Ingress all permits authenticated Cloud Shell verification without a VPC. IAM checks remain enabled and no allUsers or allAuthenticatedUsers grant is allowed. Read back the effective invoker policy, including inherited access. Its existing application routes remain protected behind Cloud Run IAM and normal application authentication. No public admin/probe route is added. Cloud Run startup probes are platform-originated and do not grant external unauthenticated invocation.

Use dedicated runtime SA xroga-p3-staging-20261024. Metadata ADC supplies Google credentials. Never create/download a service-account key, set GOOGLE_APPLICATION_CREDENTIALS, copy an operator token into the container or grant project Editor. Bind roles/cloudkms.cryptoKeyEncrypterDecrypter on only the new exact CryptoKey. Bind roles/secretmanager.secretAccessor on only the two candidate Supabase secrets. Do not grant access to production secrets or other KMS keys. Existing authorized operator may receive roles/run.invoker on only this service after itemized approval.

Use max 1 revision instance and max 1 service instance, min 0, concurrency 1, 1 CPU/1 GiB, request-based CPU and no startup boost. Max instances and billing alerts are not hard cost caps. Service timeout is 30 seconds, startup allows 240 seconds. The migration window stays disabled. No scheduler, external provider credential or remote sandbox token is supplied. Default background behavior still operates exclusively against the empty isolated database. This is not proof of request-based CPU suitability for long-running production workers.

## Preflight and dry-run

1. Confirm the new itemized authorization, organization, current quote, trial eligibility, $0-cash constraint and teardown owner before any creation. The historical $5 approval is spent scope, not authority for this service.
2. Record the actual dedicated identity, exact new key resource, immutable backend image, test-project ID and two test-only Secret Manager version IDs. Verify secrets came from the new isolated project without logging their values. Compare source migration history using scripts/security/compare-production-migrations.mjs. Never point the production migration runner at live production here.
3. Validate the rendered JSON locally. It is also valid YAML. Refuse unresolved __SOURCE_BOUND_IMAGE_BY_SHA256__, a tag-only image, production Supabase IDs, any GOOGLE_APPLICATION_CREDENTIALS, legacy window enabled, provider API keys or extra IAM permissions.
4. Run `gcloud run services replace RENDERED.json --dry-run --project=project-c40d4821-e647-4fa2-92d --region=us-central1` only once the referenced image/identity/secrets exist. This is server validation, not deployment. A local template check is not a successful server dry-run. None has been claimed yet.
5. After authorization and successful preflight, create the new private service through the approved deploy path. Read back revision/image digest, serviceAccountName, effective IAM, scaling/env fingerprint and ADC principal. Verify unauthenticated health invocation is denied, authenticated health reports the exact source, and /ready requires the database plus managed KMS.

## Remaining real proof

Exercise the existing canonical credential writer and actual consumer using two synthetic owners in isolated real persistence. Save only source-bound redacted receipts. Check wrong owner, revoked/current revision, exact AAD, closed legacy window, rotation and prior-version read, wrong key/identity and provider outage. Existing six harness runs retain their original scope and are not repeated merely because a service now exists. Each additional check needs a specific full-API or real-persistence gap. No automatic replay on uncertain effects.

Do not add an unauthenticated diagnostics endpoint. If invoking an internal consumer requires a verifier, use an authenticated, reviewed execution path or a one-off approved test process with the same image and identity. A health probe alone is not credential persistence/consumer verification.

## Production boundary and rollback

The live release observed before staging preparation is f9ac71ef55d939eecc81d9c514ac22f0e7e32164, Fly release 1247. Source-bound inspection shows legacy AES-GCM provider-key custody and no Phase 3 startup/KMS provider in that release. Do not deploy Phase 3 to Fly with its existing environment. It will fail closed without the managed-provider configuration and requires coordinated schema/custody compatibility.

Production has 82 history records corresponding to 70 exact source identifiers out of 142 files. The other 72 require compatibility rollout review, not blind application. History does not prove no drift. Never roll back v3 credentials to the deployed legacy reader. Retain tombstones and ciphertext. A pre-cutover image rollback is useful only while no incompatible schema/credential write has occurred and after independent health/compatibility attestation.

Staging rollback routes no customers, removes only the new candidate service and its new bindings/secrets/repository/SA after preserving receipts, and schedules only new test key versions for destruction with the approved retention delay. Key-ring/CryptoKey metadata cannot be deleted. Preserve the old proof archive and do not restore scheduled old keys. Destructive cleanup must meet action-time confirmation requirements. No customer secrets are purged.

The unchanged evaluator must still report CODE_READY_KMS_CUTOVER_BLOCKED until its genuine mandatory production condition is satisfied. Staging success does not silently change this status. Obtain a separate exact production rollout/migration authorization after evidence and rollback review. Formal founder acceptance and Phase 4 admission remain separate.

## Official references

- [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)
- [Cloud Run YAML schema](https://docs.cloud.google.com/run/docs/reference/yaml/v1)
- [Non-mutating server dry-run](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/replace)
- [Health-check configuration](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [KMS pricing](https://cloud.google.com/kms/pricing)
