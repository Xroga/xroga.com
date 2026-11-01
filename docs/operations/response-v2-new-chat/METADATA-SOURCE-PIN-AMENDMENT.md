# Evidence-only release source pin correction

Pending owner decision. This amends only the source identity in the approved
84264961107e6642ffe21d61380b479f7f117da9 package. It does not start another
spending or maintenance window.

The approved fded88f45384d0514ae9a6c69d87a726b61d9669 commit failed two
baseline-negative-fixtures checks because historical transport and model-dispatch
proof metadata still referenced the pipeline before its presentation wiring.
Tests and security policies have not been weakened. Both failing proof checks
pass locally after correcting the current bindings and preserving historical
records. The broader local group passed 48/49, with the remaining check unable
to resolve the locally absent Tailwind dependency. Clean exact-source CI is
running and remains mandatory.

Requested replacement source: `1d487ce977699ba0f049d1227ab8c0b4920d8c1f`.
Its only differences from fded88 are three evidence JSON files:

- `docs/xroga/evidence/command-010/TRANSPORT-LIFETIME-PROOF.json`
- `docs/xroga/evidence/command-010/MODEL-DISPATCH-PROOF.json`
- `docs/xroga/evidence/command-010/CURRENT-PROOF-METADATA-CONTINUATION-20261028.json`

Application source, dependencies, Dockerfile, workflows, tests, schema and
security controls are identical. Verified Git object equality:

| Build input | Object at both commits |
| --- | --- |
| backend tree | `095af9ded6d779a9ff987250a8a0c19525a60654` |
| Dockerfile.api | `045dcc9e7d2e7c90997cf66be651ffc333bbd872` |
| .dockerignore | `20fefb9adfad1d8a325d510afd14db4237a62d12` |

The build source argument, OCI identity, API/Job source labels and admission-fence
source value will all use 1d487ce9 together. `02-allow-response.sql` and
`03-pause-response.sql` change only that literal SHA. The bc6 recovery source,
drain predicates, locking, timeouts and all resource identifiers remain exactly
as approved, including the existing fded88-named revision/tag labels. Those
names are labels, not source attestation.

The frontend remains 85895d2816baf8c475cab8e5d9f534a3b464d2ad. The same six
mandatory backend gates must pass on 1d487ce9. No gate inheritance or override
is permitted. No cloud build, candidate, production SQL or traffic change has
been performed for this correction.

The original total ceilings remain $0.50 one-time Google usage and $0.10/month
image storage. No additional model/search allowance, services, IAM, schema or
paid plan. The same 60-minute maintenance maximum and rollback apply.

The operator scripts require a separate metadataPinAmendmentApproved receipt
before any build or production operation. The previous approval alone cannot
silently authorize the changed production source literal.
