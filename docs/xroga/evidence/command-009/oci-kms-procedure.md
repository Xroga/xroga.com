# Isolated OCI KMS verification

The accepted Phase 3 software source remains `d750836bfa44bd6fa668f827a4529ed49dec5269`, with authenticated evidence in `refs/notes/xroga-phase3-acceptance`. OCI is an additive provider adapter, not a replacement vault or acceptance evaluator. All 22 criteria, 12 action classes and 20 interface bindings remain unchanged. Google Cloud billing stays closed and untouched.

## Cost and resource boundary

Use `me-dubai-1`, one standard vault, one SOFTWARE AES-256 key. The private-vault switch must be off. SOFTWARE keys are Always Free, and OCI does not charge for Vault cryptographic API requests. Cloud Shell is free within its monthly tenancy limits. No compute, private vault, HSM key, paid subscription, secret storage or production service is required by this probe.

Sources, checked 2026-10-21 Asia/Karachi:

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/security/cloud-security/key-management/
- https://docs.oracle.com/en-us/iaas/Content/API/Concepts/cloudshellintro.htm
- https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/keypolicyreference.htm
- https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/token_exchange_grant_type.htm

## Authentication and least privilege

Cloud Shell uses its existing short-lived delegated operator identity. Its administrator rights are not suitable application-runtime authorization. The adapter accepts explicit OCI instance/resource principals, or a `workload_session` profile containing an existing short-lived security token. It rejects permanent API-key profiles in the session path. It does not mint tokens, export keys, grant IAM, or select an arbitrary identity automatically.

An approved application principal must receive only `KEY_ENCRYPT` and `KEY_DECRYPT` for the exact test key. Do not grant `manage keys`, `manage key-family`, `KEY_EXPORT`, or tenancy administration. For an approved OCI resource principal, the narrow policy template is:

```text
Allow dynamic-group <approved-runtime-group> to use keys in compartment id <key-compartment-ocid> where all {target.key.id='<key-ocid>', any {request.permission='KEY_ENCRYPT', request.permission='KEY_DECRYPT'}}
```

Use the appropriate approved principal type for a federated workload instead of inventing a dynamic group. External runtime federation requires a trusted issuer and exact subject/audience mapping. OCI supports token exchange, but no current Fly runtime identity or federation trust has been verified. A browser login or Cloud Shell success cannot supply that proof. Do not create new IAM trust or move hosting merely to bypass this requirement.

Inject the reviewed provider through existing `configureCredentialVaultProvider()` at backend startup. Never use Cloud Shell operator credentials in production. No startup configuration or production credential was changed by this procedure.

## Exact probe

The source runner is `scripts/security/verify-oci-kms.ts`. Bundle it for Node 22 with the repository's installed esbuild, leaving packages external. Upload only that generated bundle to the isolated Cloud Shell directory. Install the two official, pinned `oci-common@2.144.0` and `oci-keymanagement@2.144.0` packages there with scripts disabled. Both use UPL-1.0 OR Apache-2.0 licensing. Confirm the bundle SHA256 matches the local build. Never upload `.env`, live credentials, API private keys or repository archives containing private user data.

Run with Node 22.21.1 and the exact observed resource IDs:

```sh
NODE_ENV=test node verify-oci-kms.mjs --phase prepare --key <test-key-ocid> --endpoint <test-crypto-endpoint> --version <initial-version-ocid>
```

The probe calls real wrap/unwrap, wrong-AAD, missing-key, unsigned-authentication and canonical CredentialVault positive/identity-negative cases. It writes only synthetic ciphertext and redacted request receipts, using exclusive creation to avoid overwriting previous proof. An unsigned denial is explicitly not proof of a valid, wrong-principal IAM rejection.

After successful prepare, create exactly one new SOFTWARE version of that same test key using the existing operator identity. Do not create another master key. Keep the original version enabled. Then use a separate process:

```sh
NODE_ENV=test node verify-oci-kms.mjs --phase rotation --key <same-test-key-ocid> --endpoint <same-test-crypto-endpoint> --version <new-version-ocid>
```

This verifies old-version reads from the preserved synthetic ciphertext after process restart and rotation, new-version wrapping, canonical revision rotation, and old-reader compatibility. Download both JSON receipts, compare bundle/resource identities and retain OCI request IDs. No database or live credential migration occurs.

## Recovery precautions

OCI's vault backup/restore service does not back up SOFTWARE-protected master keys. Retaining synthetic ciphertext is not a key backup. Keep this key and both versions enabled and retained. Do not export master material, disable/delete keys, schedule vault deletion, or remove the last decrypt-capable IAM principal. Recovery demonstrated here means retained-version decryption after process restart. Production disaster recovery, least-privilege identity recovery and custody ownership must be separately verified before cutover.

Source: https://docs.oracle.com/en-us/iaas/Content/KeyManagement/Tasks/backingupvaultsandkeys.htm

## Final gate

Do not relabel the accepted source's CI as proof for new adapter code. Preserve the existing receipt and authenticate any necessary changed-source checks once the adapter is stable. Do not rerun unchanged suites or alter historical evidence.

Only after provider proof, scoped runtime authentication, recovery/cutover proof and exact-source CI are all available, collect new repository-local observations and invoke the unchanged evaluator:

```sh
node scripts/security/evaluate-phase-three.mjs --evidence docs/xroga/evidence/phase-3-manifest.json --observations artifacts/<authenticated-final-observations>.json --require-complete
```

Do not set `VERIFIED_MANAGED_PROVIDER_AND_CUTOVER` in observations or the current command manifest merely because Cloud Shell cryptography passes. Until genuine runtime/cutover evidence exists, retain `CODE_READY_KMS_CUTOVER_BLOCKED`. No merge, deployment, live migration or Phase 4 is authorized.
