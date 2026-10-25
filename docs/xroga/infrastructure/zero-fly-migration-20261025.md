# Google Cloud migration, source c14c3e11

State: IN_PROGRESS. Production traffic remains on the verified Fly release. This is an infrastructure migration, not Phase 4 admission or a new orchestration system.

## Confirmed inventory

Read-only receipts are preserved in the workspace `outputs/fly-to-gcp-20261025/`. No secret payload was collected. Two Fly apps exist: the production API with two existing Machines, and the suspended execution app with no Machines. Neither app has volumes or custom-domain certificates. The API has 103 platform secret names. Scrapfly is a separate integration and must remain available.

Google already contains a private `xroga-api` service in `us-east4`, native runtime identity `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`, Artifact Registry repository `cloud-run-source-deploy`, 20 named secrets and the existing protected production backup bucket. Both runtime identities already have the exact production credential-key crypto role. No Compute instances or Cloud Run Jobs were found. Tasks and Scheduler inventory failed because those APIs are disabled, not because successful queries returned empty lists.

The existing Google service has only 19 environment variables, a 300-second request timeout, request-based CPU allocation and no minimum-instance setting. Its authenticated health and readiness return 200, but release identity is `unavailable`. Unauthenticated requests return 403. These are limited readiness observations, not parity or cutover evidence. An existing Cloud Build trigger automatically builds and deploys main. It needs a verified release interlock before this branch can merge.

## Execution order and acceptance gates

1. Inventory all tracked Fly references and live dependencies. Classify immutable historical evidence separately from operational paths. Record callbacks, webhook destinations, frontend configuration, platform secrets and recovery images without exposing values.
2. Harden native KMS authentication to use attached service identity only. Retain the same CryptoKey and envelope/AAD formats. Deny static operator credentials and mixed Fly/native identity. Keep Fly custody working during the transition.
3. Mirror and verify the exact forward and compatible recovery image digests in Artifact Registry. Pin secret versions and image digests. Replace the automatic deployment trigger with a reviewable, source-bound release gate. No historical SQL replay.
4. Run the existing canonical API and scheduler on Cloud Run with CPU available for detached work. A scale-to-zero, request-CPU deployment is not approved for this implementation. Size and recurring costs must be reviewed against the founder's stated cash allocation before provisioning. Cloud Tasks or Jobs may transport existing bounded work only after caller and retry semantics are verified, without a competing scheduler.
5. Replace disposable Fly execution and persistent interactive sessions using Compute Engine isolation. Use dedicated secret-free execution VMs, enforced maximum lifetime and automatic deletion, immutable guest images, protected control transport, no attached platform service identity, and restricted metadata and network access. Verify browser execution, files, processes, snapshots, cancellation and controller-crash cleanup. Do not claim container-only isolation is VM equivalence.
6. Replace Preview's Fly private DNS construction with the verified Google execution target. Preserve issued owner/project/run admission, signed and revocable grants, HTTP and WebSocket behavior. Verify each real caller. Resolve public Preview routing and TLS explicitly, without relying on an untested Preview service feature.
7. Transfer required platform secrets directly into protected Google configuration. Verify names and bindings, never print values. Preserve Supabase, R2, model routing, accounting and confirmations. Reconcile all 103 Fly names individually, including unused and duplicate configuration.
8. Verify Google staging parity for authentication, tenant isolation, existing workloads, billing webhooks, connected apps, browser execution, storage, background recovery and callbacks. Reuse unchanged Phase 3 evidence, run focused tests for changed boundaries and the required final integration gates once on a pinned source.
9. Verify recovery in Google, announce the controlled maintenance window if needed, drain outgoing runs and change traffic and callback destinations. Observe production health, accounting and managed custody. Retain working Fly recovery until Google replacements and traffic are independently verified.
10. Remove active Fly deployment/runtime dependencies, verify zero outgoing Fly control-plane, registry, DNS and metadata dependencies, and produce an exact retirement list. Do not destroy Fly resources automatically. Preserve immutable historical evidence and Claude's independent Batch 1.5 branches.

## Recovery

Before traffic changes, rollback is leaving the existing two healthy Fly Machines untouched. During cutover, return traffic only to the verified managed-compatible image, never a legacy custody image. After Google verification, recovery must use Google-hosted immutable images, native service identity and the retained encrypted backup/legacy-key escrow. Preserve all key versions, ciphertext, revisions, tombstones and newly authorized customer writes. No production SQL is currently required by this migration.

## Outstanding demonstrated gaps

- Google service lacks complete configuration and exact runtime release identity.
- Detached work and interval scheduling require a supported always-CPU or verified durable dispatch deployment.
- Interactive Preview currently constructs `<machine>.vm.<app>.internal`.
- Both isolated execution provider defaults are Fly-specific.
- Release/recovery images, frontend API configuration, integrations and deployment automation still require individual parity verification.
- Current credit balance, resulting recurring costs and the exact Google execution/network permissions must be established before consequential provisioning.

Zero-Fly acceptance remains BLOCKED until every operational replacement and recovery path is verified. No Phase 3 acceptance evidence is changed by this record.

## First verified implementation slice

Native production KMS now selects the metadata-only Google `Compute` credential client. A negative test first reproduced acceptance of an operator credential file. Startup now rejects static ADC, metadata-host overrides and mixed Fly/native configuration before constructing the provider. Existing Fly custody stays supported during the migration. Focused custody tests and the backend TypeScript build pass. This code is not yet deployed.

The portable API Dockerfile now requires a full source SHA and emits the OCI revision label. The new Google build configuration builds and retains an image only. It does not deploy. The native API release preflight rejects image tags, incorrect service identity, mutable or missing secrets, inherited Fly identity, missing background CPU, unbounded scale, stale health release identity and absent Google-hosted recovery. It is explicitly not a cutover acceptance evaluator.

The existing automatic Cloud Build trigger `acb94fe0-ea2f-4a7b-a403-98c25b093a5f` was disabled through the supported console control. Console and CLI readback both confirm `disabled: true`. No running service or traffic changed. Earlier API attempts returned `INVALID_ARGUMENT`; they were not counted as success.

The authenticated credit ledger on October 25 shows $299.32 remaining from the paid-account upgrade credit, expiring January 22, 2027. This is not a permanent free tier or a hard spending limit. The account remains linked and billing-enabled. Recurring always-CPU, execution, registry, secrets, networking and storage costs still require a complete cost model before cutover.
