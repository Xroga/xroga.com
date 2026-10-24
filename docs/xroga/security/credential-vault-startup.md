# Managed CredentialVault server startup

Scope: original Command 009 runtime initialization. This extends the existing vault,
provider injection and v3 envelope. It is not deployed custody, new IAM authority,
live migration, Phase 4 work or release approval. Historical accepted receipts remain
bound to their original commits, including ddfa32d2.

## Server admission

The API entry point awaits `initializeCredentialVaultForServer()` before creating
Express or listening. Production, Fly and Vercel production hosts require explicit
`XROGA_CREDENTIAL_KMS_PROVIDER=oci` or `google_cloud`. Unknown, incomplete or mixed
provider configuration fails before admission. Local development/test without a
managed selection retains its existing explicit non-production behavior.

OCI configuration requires all of:

- `XROGA_OCI_KMS_KEY_ID`, the exact approved key OCID.
- `XROGA_OCI_KMS_ENDPOINT`, the regional OCI crypto endpoint.
- `XROGA_OCI_KMS_KEY_VERSION`, the selected encryption version, same region.
- `XROGA_OCI_KMS_AUTH_MODE`, `instance_principal`, `resource_principal` or `workload_federation`.
- `XROGA_OCI_KMS_PRINCIPAL_ID`, the exact approved non-user workload OCID.

The existing Google path requires `XROGA_GOOGLE_CLOUD_KMS_KEY_NAME`, validated by
the existing managed adapter. No Google billing/resource setup is authorized.

OCI startup does not read a CLI profile or accept `cloud_shell`, `workload_session`,
permanent API-key or browser-session modes. The official SDK obtains and renews its
configured workload authentication. Before each crypto request, an admission check
requires the SDK session subject to match the configured non-user workload identity
and its expiry to be current. This unverified-claims admission check is NOT signature
verification: OCI validates the signed real request, possession key and IAM authority.
Do not install founder credentials into resource-principal environment variables.

Before injection, startup wraps/unwraps only a random 32-byte readiness value with
random AAD and compares exact recovered bytes. Failure stops startup with a static
safe error. No stored credential, customer record or provider API secret is probed.
Initialization and each probe operation have a 15-second application deadline.
No provider switch or development fallback follows a failure.

`/health` remains liveness. `/ready` checks managed-provider readiness before the
existing database readiness check. Managed readiness is single-flight, cached for
60 seconds, and returns a static 503 on failure. It requires at most one synthetic
two-operation roundtrip per cache interval with requests, not a polling worker.
The health cache contains no credentials or reusable data keys. Real credential
operations still use KMS and fail closed during an outage even within the health
cache interval. Readiness success is not a tenant-authorization assertion.

Current Fly process configuration runs only the API entry point. No separate worker
startup was found in the inspected `RUN_SWARM_WORKER`/Worker registration paths.
Any future independent entry point must await this same initializer, not copy it.

## Tests and evidence boundary

`credentialVaultStartup.test.ts` covers missing/conflicting provider config, hosted
production flags, malformed endpoints/key/version, interactive identities, exact
roundtrip-before-injection, simulated expired/denied/unavailable identity, no fallback,
bounded hung initialization, coalesced outage/recovery and actual loopback HTTP 503.
The OCI test adds wrong/expired/user-subject admission negatives. These are explicitly
offline fixtures, not new provider-backed receipts or Fly deployment proof.

The previously preserved provider receipts establish real OCI cryptography, local
non-admin backend recovery/migration and fresh-session revocation. No source change
promotes those historical receipts to current deployed-runtime evidence.

## Unattended authentication: precise remaining external dependency

Oracle documents external JWT-to-RPST exchange through an Identity Propagation Trust.
Its documented request authentication requires an identity-domain OAuth client,
OCI service principal or instance principal. A Fly JWT alone does not establish
that authenticated exchange. Trust setup and a minimally privileged exchange caller
remain unconfigured/unapproved. No issuer/audience/subject or bootstrap identity is
invented, and no new trust, client, grant or credential was created.

Official source inspected 2026-10-21:
https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/token_exchange_grant_type_workload_id-federation.htm

The Fly OIDC reference redirected to a documentation host unavailable to the web
reader in this bounded inspection. Current Fly token claims, host/socket permissions,
actual runtime token issuance and compatibility with the OCI exchange are therefore
not independently verified by this patch. Do not infer lack of support or working
federation from this documentation-access limitation.

An existing OCI-native instance/resource principal could exercise this startup only
in its applicable runtime. It is not proof that production Fly can authenticate.
No existing isolated OCI runtime with the needed grant has been verified. No compute,
paid identity domain, administrator bootstrap or hosting change is authorized.

## Unrelated-key control

No valid current positive-control identity and independent existing Key B are
established by the preserved receipts. Probe membership is revoked and all local
session files removed. Policy text, nonexistent-key 404 and post-revocation denial
are not provider-backed exact-key isolation proof. Future separately approved testing
must establish Key A success and existing Key B denial under the same valid identity,
with actual request IDs. Do not create keys/grants or reactivate users to manufacture
this evidence under current authority.

## Rollout, rollback and recovery

Draft PR only. Production must NOT deploy this startup change until the owner approves
the actual workload identity, least-privilege grant, complete config and isolated
readiness proof. No runtime identity is made available by adding environment names.
The previously deployed release may be restored through its existing reviewed release
procedure. Do not disable custody admission, re-enable plaintext writes or delete
encrypted/legacy records as a rollback. No schema/envelope migration occurs here.

Both OCI SOFTWARE key versions remain enabled. Retained-version/process recovery
is verified historical evidence, not SOFTWARE-key backup or recovery after master-key
deletion/regional loss. Those limitations remain explicit and unwaived.

The unchanged strict evaluator and original 22 criteria remain authoritative.
`VERIFIED_MANAGED_PROVIDER_AND_CUTOVER` cannot be set from this code/test patch.
Actual identity/custody and applicable cutover proof remain BLOCKED, with production
migration and deployment still requiring separate authorization. No Phase 4 admission.

## Approved isolated workload-federation proof

The additive bridge supports the specifically approved GitHub Actions identity,
not an inferred Fly OIDC integration. It validates the exact repository ID, branch,
workflow reference, environment subject, audience and reviewed source SHA. Oracle
must independently verify the signed JWT and issue the pinned non-user RPST.
An ephemeral proof-of-possession key stays in process memory. Renewal is single-flight
and starts sixty seconds before expiry. Failed renewal clears the cached session,
and there is no personal-session or development-provider fallback.

The confidential exchange client has no administrator roles. Its bootstrap secret
is still a long-lived credential, held only in the dedicated approved GitHub
environment. This is not fully secretless authentication. Client revocation blocks
new issuance, while already issued RPST access also depends on token expiry and
the temporary exact-key policy deadline. Do not claim immediate invalidation of
already-issued tokens. Only an observed provider denial establishes that outcome.

`command3-auth-browser.yml` has manual `bootstrap` and `custody` modes. The ordinary
PR/browser job does not receive this environment's secret. Bootstrap discovers the
real principal without KMS permissions. Custody uses that separately approved,
exact-principal Key-A grant and the existing disposable PostgreSQL environment.
The two persistence steps use separate processes and the canonical startup and
provider-key writer/reader. They certify only their recorded cases, not the entire
acceptance contract. The separate health workflow has an opt-in genuine signed
wrong-workflow control and skips production health requests in that mode.

Neither opt-in harness proves a Fly deployment or live customer cutover. Final
custody, renewal, isolation and applicable lifecycle receipts remain required.
Keep the trust inactive until its SHA is pinned. After proof, disable only the new
client/trust, remove its bootstrap secret, expire/remove its temporary policy,
and preserve all original keys, versions, test identities and historical evidence.
