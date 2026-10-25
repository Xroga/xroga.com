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

## Native execution transport checkpoint

The next implementation slice adds Compute resource validation, native-only identity, bounded no-SA workers, OS Login with expiring SSH keys, authenticated host-key pinning and encrypted stdin transport. The physical controller refuses owner/image/source/expiry drift, mutable images, capacity exhaustion and provider denials before workload dispatch. It does not issue product actor authority, reserve product budgets or replace the canonical scheduler. The protected configuration loader validates a versioned Google Secret Manager bundle atomically before provider imports, without moving any live secret yet.

Twenty focused TypeScript tests and six Python protocol tests pass. A new test first reproduced an accidental five-minute timeout restriction, then verified the existing ten-minute command contract and rejection beyond that limit. Backend type checking and the real mission-policy checker pass. These tests are credential-free fixtures, not live OS Login evidence. Neither the new controller nor its Job harness is registered with production.

The next exact access scope is documented in `native-execution-verification-approval.md` and `infra/google/execution-verification-scope.json`. No Compute/OS Login grants, new subnet, firewall or Job have been applied. Existing Google image build and recovery retention, and the completed real GCE host/Chromium experiment, remain valid evidence and are not repeated.

PR #852 head `0f00e3e32e8e3bd86b91345693fdad5d04e37952` removes automatic triggers from both Fly workflows and requires explicit manual confirmations. Both workflows remain `disabled_manually` in GitHub. Coordination was recorded in [PR #852](https://github.com/Xroga/xroga.com/pull/852#issuecomment-6398193332). No Batch 1.5 branch was changed or merged. The separate Google auto-deployment trigger remains held.

## Approved native window, October 25

The founder approved the exact temporary access scope. The former test VPC and execution subnet had been removed since inventory. Their same names and private ranges were recreated as empty verification prerequisites. All four expiring bindings were applied and read back. The installed stable subnet CLI lacked the conditional-binding flag, so the stable v1 REST API applied the identical condition with policy version 3 and an etag. No broader grant was substituted.

The one approved Job execution `xroga-gce-transport-verify-20261025-swgcc` ran exact source `f90abe82248bdef83fcc058e208dae3df6fe0347` and immutable digest `sha256:f5442805565737306eb0c4980f1581e11a1aed7cd27d9d2b2b9d423852489f15`. It verified the attached native principal, secret-free bounded worker creation, authenticated OS Login/SSH, exact worker source and foreign physical-owner denial. The later isolated Node execution failed with `NATIVE_SSH_EXECUTION_DENIED_OR_INTERRUPTED`. The seven Node isolation checks are NOT verified by this window. Six retained OS Login policy checks were granted, with no denied audit entries in the targeted query. They do not identify the SSH subprocess failure.

The failure exposed an observability defect: the adapter discarded all SSH stderr and the exit code at its error boundary. A focused test reproduced the missing diagnostic. The correction now retains an allowlisted failure category and numeric exit code, bounds diagnostic input to 16 KiB, and discards raw stderr and failed-command stdout. It preserves denial, single dispatch, key revocation and private-key cleanup. All nine focused transport tests pass, and backend type checking passes. The underlying live failure remains UNKNOWN until the changed source is tested. No retries, identity fallback, broader IAM or successful execution are inferred.

The Job, VM, boot disk, four temporary bindings, firewall and recreated execution subnet were independently removed. `xroga-api-private` and its otherwise empty VPC remain pending because Google retains internal reservation `serverless-ipv4-cloudrun-1792939555541134225`. Google documents a 1–2 hour subnet-release delay after deleting Cloud Run resources. Retrying deletion does not count as completed cleanup. There is no remaining test worker or temporary runtime IAM access.

The source-bound partial receipt is `docs/xroga/evidence/zero-fly/native-transport-f90abe82-20261025.json`. Original workspace cloud/audit/cleanup receipts are preserved without rewriting prior acceptance evidence. PR #852 is now merged at `bc669f8acb1838a4476d19a3f7193a0b4b71ce69`; both Fly workflows were rechecked and remain disabled. The isolated transport proof is tied to f90abe82 and does not claim validation of the new main backend. No production service, customer configuration, Fly resource or traffic changed.

## Resumption and local storage policy, October 25

The migration branch now integrates main at `bc669f8a` through merge `36c95330`,
with no conflicts. The repository's narrow fetch refspec initially left the local
main reference stale. Explicitly fetching `refs/heads/main:refs/remotes/origin/main`
and comparing GitHub's actual main resolved that discrepancy. No Batch 1.5 branch
was modified and no new main merge or deployment occurred.

The SSH propagation correction is committed at `c23f351c`. It waits five seconds
after OS Login key import and rechecks ownership, host identity and admission
expiry before dispatch. Forty-two focused integration tests pass, including the
native controller/transport, startup/configuration and merged route boundaries.
The frozen installed-dependency check passes for 1,186 packages. Backend type
checking and the unchanged mission policy pass. These are source/fixture checks,
not proof of successful live SSH execution.

Cloud Build `aa228957-d4ac-47fd-941b-a0e7cafdfd33` successfully built source
`78e28fab94b77746d742e5cc33481804afb41cdc` into
`sha256:4190b3474dcc2ff113a0defd87eae30acf88a4a408808a06266d58b568e637b5`.
It was not deployed. The earlier diagnostic build was read back as successful
rather than repeated. The former test subnet and VPC were finally deleted after
checking exact resource IDs and the absence of references. Both deletion commands
and independent empty-list readbacks succeeded. No temporary network cleanup
remains from the first window.

The permanent local cleanup rule is now in AGENTS.md, the PR checklist and
`LOCAL_STORAGE_CLEANUP.md`. Windows root build/test entrypoints automatically use
repository-owned bounded jobs. Failure/cancellation cleanup preserves evidence,
handles Windows long paths and transient receipt-file sharing, and refuses
production/recovery images, persistent volumes, source and uncertain data.
Seventeen native cleanup tests and six dispatch tests pass. An actual failing
job preserved its required receipt and removed its temporary files. A successful
standard command also exercised automatic dispatch and cleanup. Docker safety
tests use fixtures because the local engine remains stopped.

Two inactive old Xroga webpack caches were reviewed and removed, 2,396,867,825
logical bytes. Both worktrees' Git state and references were unchanged. Temporary
npm downloads created during this task were also removed after frozen installation
and patch verification. All owned temporary directories are absent. Installed
dependencies required for current migration work remain intact.

The prior single-execution IAM approval was used and all of its bindings were
removed. The next exact single recheck request is preserved in the workspace's
`NATIVE-EXECUTION-RECHECK-APPROVAL.md`, bound to the new immutable digest and the
same narrow roles, private resources, one VM and $0.25 ceiling. Fresh action-time
confirmation is required before recreating that security-sensitive access.
Production, customer credentials/data, Fly resources and Phase 4 remain unchanged.

## Approved native recheck, October 26 Pakistan time

The founder approved the exact new single-execution window. Its independent
ledger preserves the earlier failed execution without overwriting it.
Execution `xroga-gce-transport-verify-20261025-tvhzv` ran source
`78e28fab94b77746d742e5cc33481804afb41cdc` and immutable digest
`sha256:4190b3474dcc2ff113a0defd87eae30acf88a4a408808a06266d58b568e637b5`.
Cloud Run reports one successful task, zero configured retries and completion
at `2026-10-25T19:08:42.112959Z`.

The actual receipt verifies native service identity, the exact worker source,
foreign physical-owner denial before SSH, and seven real Node checks: non-root,
read-only root, metadata denial, external-network denial, platform-secret absence,
memory limit and process limit. The revised admission path now passes. The
original discarded stderr still prevents a definitive claim about its historical
failure cause. No repeated KMS experiment, full CI run or new image build occurred.

The Job, worker, auto-deleted boot disk, firewall, execution subnet and all four
temporary IAM bindings are independently removed. The remaining control subnet
`xroga-api-private`, ID `4594549406886522110`, and VPC `xroga-verify-net`, ID
`8264173866930401105`, cannot yet be deleted because Google retains internal
address `serverless-ipv4-cloudrun-1792955156502262487`. Google's
[Direct VPC documentation](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
requires waiting 1–2 hours after deletion before subnet cleanup.

A bounded cleanup-only watcher checks these exact identities and refuses changed
resources, unknown dependencies or new access. It creates nothing and stops by
the original access expiry. Two hourly follow-ups verify the result and finish
only the already approved residual cleanup if needed. Network cleanup is PENDING,
not accepted as complete. The native recheck proof is
`docs/xroga/evidence/zero-fly/native-transport-recheck-78e28fab-20261026.json`.

Full native provider/caller integration, workspace operations, Preview,
configuration parity, background execution, Google-compatible recovery and
production cutover remain separate migration obligations. No production, Fly,
customer-data or Phase 4 operation was performed by this window.

## 2026-10-26, native project runtime source integration

The residual verification control subnet and VPC were deleted at
2026-10-25T20:17:00Z. Independent readback at 21:06:58Z confirmed absence.
The completed cleanup is recorded in the durable migration checkpoint and
`outputs/fly-to-gcp-20261025/native-recheck-final-cleanup-readback.json` outside
Git. The previous native proof and all original Phase 3 evidence remain intact.

The existing project runtime manager now has an explicitly selected Google GCE
provider. Preview HTTP request callers supply their issued tenant context.
Pipeline and SoftwareAgent Preview callers supply the existing opaque worker
generation. Raw user IDs and copied context objects cannot enable Google
execution. Canonical source is persisted before remote workspace transfer.
Admission refreshes owner/project/run lineage, source fingerprint, durable
session binding and cancellation before operations and again after OS Login.
Native restore denial never triggers replacement allocation. Explicit restart
and known TTL expiry retire an owned handle before fresh creation admission.

Workspace RPCs use bounded batches and descriptor-relative Linux file access.
They reject traversal, symlinks, special files and expired authority. Writes are
atomic and temporary files are removed on failure. No cloud resource, Docker
operation or customer data was used for the 16 passing Linux filesystem tests.
The original isolation runtime semantics remain unchanged. The portable API
build workflow now includes these Linux tests without adding a deployment step.

Google Preview targets come from authenticated Compute lookup, never a stored
address or request parameter. The signed grant and durable owner/session/port
binding are rechecked after admission. HTTP streams and WebSocket connections
have bounded admission watches, immediate expiry timers and no automatic
reconnection after denial. Unit fixtures verify these helpers, not the live
frontend-to-backend workflow.

Two focused negative reproductions exposed concrete gaps. A terminal durable
run could still pass a dispatch check while its hot row appeared running. A VM
whose boot admission failed could remain until its hard deletion deadline.
Fresh dispatch now requires a running durable worker generation. Allocation
handles are persisted before boot admission, and verified owned allocations are
deleted on boot/persistence failure. Failed cleanup remains explicit. Unknown
creation outcomes still require reconciliation and the native hard deadline.

Tests and source hashes are retained in
`docs/xroga/evidence/zero-fly/project-runtime-source-checkpoint-20261026.json`
and `workspace-linux-unit-20261026.json` in that directory. These are source and
filesystem evidence only. Production traffic, IAM, customer data, Fly resources,
main and Phase 4 were not changed. No accepted cloud experiment or full CI suite
was repeated.

Release remains blocked on real caller staging, private Preview networking and
frontend E2E, one-shot sandbox/browser callers, globally bounded allocation under
multiple API/worker processes, durable background dispatch, complete required
configuration/callback parity, verified forward/recovery images and controlled
traffic cutover. Missing Python/Rust image admission fails explicitly and must
be completed before claiming toolchain parity. The two prior temporary access
windows are consumed. They do not authorize new persistent grants.

## 2026-10-26, bounded physical allocation slots

New workers use only `xroga-exec-slot-1` and, when explicitly configured,
`xroga-exec-slot-2` in the pinned project and zone. Resource-name uniqueness
prevents multiple API processes from creating different random names after a
stale fleet read. A conflict is a capacity denial with no replacement retry or
deletion of the winning worker. Instance IDs, runtime UUIDs, owner/project
bindings, source hash and expiry still fence slot reuse. Legacy UUID-named
handles remain readable for recovery and count against admission.

The negative slot test failed before the correction. Focused controller, SSH,
provider and target tests pass. A two-process HTTP fixture forces both
inventories to be stale, verifies one allocation and one capacity denial, and
verifies exactly one owned deletion. This is adapter concurrency evidence, not
a repeated live Google experiment or a project-wide spending cap. Evidence is
`docs/xroga/evidence/zero-fly/allocation-slots-source-20261026.json`.

No IAM, VM, Job, network, deployment or production mutation was performed.
The accepted live native execution proof remains preserved. Real caller
staging, uncertain-outcome reconciliation and the other migration gates remain.

## 2026-10-26, canonical one-shot Google execution

The four inspected execution seams now issue an opaque sandbox binding from
the current canonical run attempt and owner-bound durable source. Explicit
Google mode refuses raw requests before probing providers and cannot select a
Fly fallback. Compile setup and denied-network verification run sequentially
in one quota-bound workspace. Native stage receipts determine the compile
verdict, rather than untrusted process output. The retained browser digest has
an explicitly verified driver-version mapping.

Cancellation, authority-read timeout, ownership denial and missing durable
allocation/stage receipts prevent further dispatch and verified completion.
Owned cleanup runs after success and failure. Unverified cleanup is explicit.
Three focused negative SDK tests reproduced swallowed sandbox denials. The
existing executor abort latch now preserves those fatal denials across SDK
tool-error handling. Consequential-action confirmation remains unchanged.

Focused positive and negative tests and backend type checking passed. Exact
source identities and local receipts are in
`docs/xroga/evidence/zero-fly/canonical-sandbox-source-20261026.json`.
These synthetic tests do not certify upstream caller groups or live Google
integration. No production, IAM, deployment, main or Phase 4 changes occurred.
Next are real Preview integration and durable background transport through the
existing canonical pipeline. The original live and 13-workflow proof is retained.

## 2026-10-26, Preview routing integration

Local HTTP/WebSocket fixture tests pass for routing, worker redirects, echo,
reconnect, expiry and denied reconnect. Google URLs now use one 57-character
label so an ordinary wildcard certificate can cover them. Existing two-label
grants remain parseable during migration. Worker redirects no longer retain a
private port. Final pre-connection admission is bounded and fails closed.
Negative and passing receipts are in `docs/xroga/evidence/zero-fly/preview-routing-source-20261026.json`.
This does not certify Google-hosted Preview, production DNS or TLS deployment.
