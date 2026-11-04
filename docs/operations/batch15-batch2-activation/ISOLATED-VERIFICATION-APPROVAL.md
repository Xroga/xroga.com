# Specific approval: isolated Batch 1.5 verification

Status: REQUESTED, NOT AUTHORIZED. This package does not authorize production
activation. Founder Issue #898 requires separate approval for new billable
resources, IAM and credential access. No cloud clock starts while approval,
required CI, image verification or account prerequisites are pending.

## Why this step is necessary

Batch 1 is live on source85 and stays untouched. Browser queue/recovery resources
already exist, but no browser host is running. The accepted browser requires
host-level Docker controls, Chromium sandbox, reviewed seccomp, isolated job
networks and an egress proxy. Local/CI tests cannot prove the Google-hosted
runtime and its API transport. Running Chromium inside the privileged API or
turning off its sandbox is excluded.

Use the existing project, VPC/subnet, registry, load balancer, synthetic Supabase
project and test R2 bucket. The existing universal staging service has another
release identity and several tagged candidates. This package leaves it alone
and creates one disposable private test API, with zero idle instances, to avoid
overwriting another operator's environment. It is the same Xroga API and
canonical browser scheduler, not another orchestrator.

## Source and preconditions

- Source is the reviewed correction in PR #899, initially `1e6cb7ca`, plus its
  required inventory/evidence corrections. All required exact-source CI must
  pass. Record the final full SHA before building or running anything.
- One bounded build through the existing Cloud Build identity
  `574998934848-compute@developer.gserviceaccount.com`. No new build identity
  permission is included. Stop if existing permissions are insufficient.
- Build the source-pinned API/coordinator, browser and proxy artifacts once in
  the existing `cloud-run-source-deploy` repository. Record immutable registry
  digests, source labels and byte sizes before use. No mutable tag is a runtime
  image pin. Do not rebuild unchanged artifacts after a failed smoke test.
- Existing synthetic Supabase project `dqxnatoessviphudbhei` is healthy and
  already contains the eight Drive/lease/browser/Builder tables with RLS.
  No migration or SQL is included in this approval.
- Confirm that the existing stage configuration points only at that database
  and a private synthetic-only R2 bucket `xroga-drive-test`. Stop on any
  production destination, unknown bucket or unrelated active staging work.

## Exact temporary resources and access

All resources are in `project-c40d4821-e647-4fa2-92d`.

| Resource | Exact scope |
| --- | --- |
| Private browser VM | `xroga-b15-host-verify-20261031`, `us-central1-a`, one `e2-medium`, one 20 GB auto-delete standard boot disk, existing `xroga-verify-subnet`, no external IP, 2-hour automatic DELETE deadline, one browser job at a time |
| Base image | Existing `xroga-exec-base-20261026`, exact numeric ID `5308884476316794212`; no new image family or infrastructure provider |
| Host identity | New `xroga-b15-host-stage` service account, only Artifact Registry Reader on existing `cloud-run-source-deploy`, and Secret Accessor on the new signing secret below; no production database, KMS, model or customer secret permission |
| Signing secret | New `xroga-b15-stage-coordinator-20261031`, random signing secret only; host and stage-verifier access, no customer credential transfer |
| Stage identity | New `xroga-b15-stage-verifier`, access only to the signing secret and existing `xroga-platform-stage-20261026`; code pins stage config version 2. Secret-level IAM permits other versions of those same secrets, it is not version-only IAM |
| Private staging API | `xroga-b15-activation-stage-20261031`, `us-east4`, zero minimum and maximum two instances, concurrency 1, 1 CPU/1 GiB each, request-based CPU, 900-second request limit, exact image, stage identity, existing private API subnet, startup reconciliation guard enabled |
| Stage invocation | Run Invoker for stage identity only on this private test API. No public invoker. Browser requests still require their normal server-verified Supabase identity |
| Stage queue | `xroga-b15-browser-stage-20261031`, `us-east4`, 1 dispatch/second, maximum 2 concurrent dispatches, bounded retries and 900-second delivery deadline, target only the private test API |
| Queue permissions | Stage identity gets Tasks Enqueuer only on the stage queue and Service Account User only on itself for that queue's OIDC identity. Existing Google Tasks service-agent permissions remain unchanged |
| Verification Job | `xroga-b15-verification-20261031`, `us-east4`, one task/execution, parallelism 1, retries 0, 1 CPU/1 GiB, 20-minute execution limit, stage identity, synthetic configuration only. Bounded executions may test independent processes, never customer work |
| Private host backend | Zonal NEG `xroga-b15-host-stage-neg`, backend `xroga-b15-host-stage-backend`, TCP health check `xroga-b15-host-stage-health`, port 8080, only the named private VM |
| Host ingress firewall | `xroga-b15-host-stage-lb`, only TCP 8080 from Google's documented global load-balancer/health-check ranges `35.191.0.0/16` and `130.211.0.0/22` to tag `xroga-b15-host-stage`, existing VPC. No public VM ingress or SSH rule |
| Existing HTTPS URL map | Add only `/v1/jobs` and `/v1/jobs/*` on `api.xroga.com` to the temporary host backend. These previously unused paths retain the coordinator's HMAC, freshness, replay and lease checks. Preserve the default Batch 1 API and exact `/api/voice/transcribe-free` rule, all certificates, DNS and frontend |

Temporary new IAM bindings expire at the end of the two-hour verification
window and are explicitly removed during cleanup. Identities, services, Job,
queue, secret and network objects are removed afterward. No project-wide
custom role, production identity change or customer credential access is included.
Confirm path availability, existing network identity, image ID, permissions and
quotas before creation. A missing prerequisite stops execution rather than
silently expanding this scope.

## Tests and data boundary

Create at most two synthetic auth fixtures in the existing staging database,
without sending email. Exercise small and multipart Drive writes/read-back,
checksum equivalence, other-tenant denial, quotas, cleanup and evidence. Use
only the `b15-activation-20261031/<session UUID>/` test object prefix.

Test the actual hardened host and changed coordinator protocol, browser HTTP
transport, tenant/profile isolation, revocation/cancellation, duplicate delivery,
expired lease rejection, independent executors, forced-loss recovery and bounded
cleanup. Reuse original unchanged GCE/model evidence where its semantics remain
valid. Do not repeat the entire historical experiment suite.

Model spending is zero in this window. Test deterministic plans and model-budget
denial, with no provider subscription, top-up, model call, customer task or
external provider write. Batch 2 model-dependent and provider acceptance will
need their own exact bounded approval and disposable account scope.

## Spending and lifecycle

Maximum additional gross usage: $2 total, credits first where applicable. This
includes the one image build/copy, private VM/disk, private API/Job requests,
queue, network/storage operations and at most 72 hours of new artifact retention.
No plan upgrade, new paid subscription or retained always-on host is authorized.

Google lists `e2-medium` in `us-central1` at $0.03350571/hour, about $0.067 for
two hours. Its shared CPU and 4 GiB RAM must pass the actual single-job limits.
If insufficient, stop and report the measured result. No unapproved larger VM.
The $2 allowance includes other usage and is not a claim of a settled invoice.
Resource limits, bounded work and deadlines constrain consumption. Alerts are
not hard billing caps. Stop initiating work before the allowance is exhausted.

Begin the two-hour security/test window only after CI, immutable artifacts and
prerequisites are ready. Start cleanup at 90 minutes. The VM independently
deletes at two hours. No extension, repeat window or retry of unchanged failures
is implicit in this approval. Do not use Cloud Shell for the operation.

Artifacts may remain for at most 72 hours, within the $2 total allowance, while
their source/digests and receipts are preserved. Delete only new unused versions
after checking that no production or recovery reference uses them. Never prune
shared registry content or recovery images. No indefinite retention is included.

## Rollback and cleanup

Keep the original URL-map fingerprint and sanitized route snapshot. Remove only
the two added paths after checking for concurrent changes. Restore the original
default and microphone routing exactly. Never replace another operator's map.

Stop dispatch, cancel only the test executions, delete the temporary private
API/Job/queue and VM/boot disk, remove the temporary NEG/backend/health check and
firewall, revoke the new IAM bindings, delete the new signing secret and stage
identities. Remove only this session's staging fixtures and test-prefix objects
after preserving sanitized evidence. Keep existing schemas, buckets, identities,
queues, universal staging service, production data and recovery assets.

Verify all deletions, unchanged production source85 API/Job pairing, RUNNING
production queue, unchanged voice routing and healthy public endpoints. Record
actual usage estimates separately from billing posted later. A failed test is
FAIL or BLOCKED, not production acceptance. Retained production browser hosting,
source-fence SQL, production frontend promotion and Batch 2 provider writes are
outside this package and require their specific gates and approval.

References: [Google VM pricing](https://cloud.google.com/products/compute/pricing/general-purpose)
and [Google load-balancing pricing](https://cloud.google.com/load-balancing/pricing).
