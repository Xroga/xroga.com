# Narrow amendment to the approved isolated window

Requested, not applied. The original package is pinned at
`fa9e90d62f92a1961983d0b7e1f3cd2fa6836d6c` and the founder approved it.
The two-hour test window has not started.

## Demonstrated prerequisite

The real API calls `initializeCredentialVaultForServer`. With
`NODE_ENV=production`, `managedCredentialConfiguration` rejects an absent
managed provider. Private staging must preserve that production security
behavior. The original resource table omitted the temporary staging identity's
permission to use the already-existing staging KMS key. No permission on a
production customer-credential key is needed or requested.

## Exact addition

Grant `roles/cloudkms.cryptoKeyEncrypterDecrypter` only to:

`xroga-b15-stage-verifier@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`

on this existing staging key only:

`projects/project-c40d4821-e647-4fa2-92d/locations/us-central1/keyRings/xroga-p3-verify-20261023/cryptoKeys/xroga-p3-staging-20261024`.

The IAM condition expires at the end of the same approved two-hour window.
Remove the binding during the existing 90-minute cleanup. Configure the private
test API/Job for this key and native metadata identity. Use random synthetic
startup material and staging data only. The browser-host identity receives no
KMS permission. Do not touch production keys, ciphertext, credentials or IAM.

This adds no key, service, model call, production SQL, traffic promotion or new
verification window. The original $2 total ceiling, resource limits, cleanup,
zero-model spending and production/microphone preservation remain unchanged.
KMS operations must fit inside that same ceiling. Do not substitute a developer
key or turn off managed custody to work around this prerequisite.

Issue #898 requires a specific approval because this permission was absent from
the approved resource table. Image build preparation may continue under the
original approval after required CI passes. Staging IAM/startup waits for this
amendment.
