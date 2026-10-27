# Native Google execution verification access

Status: PREPARED, NOT GRANTED OR EXECUTED. This is the next missing live migration proof, not a repeat of the completed container/Chromium host experiment. The changed boundary is Cloud Run attached identity through Compute resource validation, OS Login and private SSH into the secret-free VM.

The exact machine-readable scope is `infra/google/execution-verification-scope.json`. All resources are in project `project-c40d4821-e647-4fa2-92d`, number `574998934848`, linked to billing account `01D20E-3C6059-8BB147`.

## Access and network changes

Grant existing native identity `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com` two custom roles with a two-hour expiry. The provisioner role contains only instance/disk creation, fleet listing and zone-operation read permissions. These project-scoped creation permissions cannot enforce the application's VM size or name bounds by themselves. The application admits one synthetic VM and the verification Job has no retry. This is not an IAM-enforced spending cap.

The operator role contains the exact permissions listed in the JSON, limited to `us-central1-a` instance and disk names beginning `xroga-exec-`. It permits physical administration and OS Login on those workers, not existing unrelated instances. `setServiceAccount` is included only for explicit empty-service-account instance creation. No `actAs` permission is granted, and no permission to attach a platform identity is added. Verify effective denial before admitting production execution. Unsupported or denied permissions stop execution rather than triggering a broader role grant.

Grant image-use access on existing image `xroga-exec-base-20261025`, checked against immutable ID `8312988193178802095`, and network-use access on existing execution subnet `xroga-verify-subnet`. These bindings also expire after two hours. There is no Editor, Owner, key creation, token-creator, new KMS or new secret access.

Create subnet `xroga-api-private`, `us-central1`, `10.91.0.0/26`, in existing VPC `xroga-verify-net`, with Private Google Access. Create firewall `xroga-exec-from-api-ssh`, allowing only TCP 22 from that subnet to the `xroga-exec` target tag. No public SSH or Preview ingress is added. Check existing effective firewall rules before launching the test. Abort if a broader unexpected ingress rule exists.

## One bounded execution

Build the exact reviewed commit once with the existing build-only Cloud Build configuration. Pin its Artifact Registry digest and source provenance before creating Job `xroga-gce-transport-verify-20261025` in `us-central1`. The Job executes only `node dist/scripts/verifyGceExecution.js`, using the existing native identity, private VPC egress, one task, one CPU, 512 MiB, no retry and a 600-second timeout. It receives no database, model, customer or platform secret binding.

The harness creates one `e2-medium` worker in `us-central1-a` with one automatically deleted 20 GiB boot disk, a bounded 128 MiB workspace and no attached service account. A native 600-second maximum runtime deletes the VM even if the controller disappears. The application verifies image ID, instance ID, physical ownership, worker source hash, network and authenticated SSH host identity. It checks actual native service identity, owner denial, secret absence, read-only/non-root execution, denied network, memory and process limits. The completed real Chromium host proof is reused unchanged.

Expected incremental test consumption is below $0.25 of available promotional credit, including the short VM, ephemeral external IP, disk and Job. The previously retained base image has ongoing storage consumption of approximately $0.20/month. No reservation, subscription, paid plan upgrade or new fixed-price network connector is created. Credit accounting can lag, and budget alerts are not a hard cap. Do not launch additional test instances or knowingly commit beyond the existing $30 personal-cash allocation.

## Cleanup and recovery

The harness waits for authoritative instance deletion. Independently verify that the instance and its boot disk are absent. Delete the disposable Job and remove the new IAM bindings and verification-only firewall. Remove the new subnet after confirming no resource uses it. Preserve the base image, Google-hosted recovery image and receipts. If cleanup fails, record the exact resource, stop additional work and verify the ten-minute physical deletion deadline. Expired IAM bindings are not counted as completed cleanup until removed.

Fly production, current customer traffic, Supabase, R2, production ciphertext and all deployment holds remain unchanged. A successful result authorizes no traffic switch and proves only the native infrastructure transport boundary. Full caller integration, production-compatible Google recovery, operational parity and controlled cutover remain separate acceptance obligations.

## Reviewed sources

The Compute [instance creation API](https://docs.cloud.google.com/compute/docs/reference/rest/v1/instances/insert) defines field-specific permissions and maximum runtime. [OS Login](https://docs.cloud.google.com/compute/docs/oslogin) provides native account admission. Cloud Run [Direct VPC configuration](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc) requires a /26 or larger subnet for this path. The live permission inventory did not contain `compute.instances.deferredDelete`, so that speculative permission is deliberately excluded.
