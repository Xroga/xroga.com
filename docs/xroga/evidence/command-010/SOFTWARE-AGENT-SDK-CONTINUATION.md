# SoftwareAgent SDK caller boundary

Continuation from verified preparation source f6dfa28e88238a40e94f71ff0086dc841e4f5761. Candidate 4c899876b9e3850af11b is the actual SoftwareAgent streaming SDK call, not the exported Black Hole gateway. The other two generic SDK candidates remain pending.

## Defects reproduced before repair

The real factory accepted a user ID without an issued dispatch scope. The new identity regression failed with Missing expected exception. Its legacy reservation path therefore omitted project, account-revision and immutable-wire checks.

The completed turn used recordUsage, whose three best-effort writes cannot prove one atomic completion receipt. A positive test requiring two verified receipts for two completed turns failed with actual0/expected2. This was a separate accounting defect, not a provider outage.

## Production trace and correction

Swarm's runBuildPipeline receives the verified request tenant context, checks database-project ownership and captures the admitted worker attempt. Both universal implementation branches forward that original context, database project, repository and attempt to runUniversalSoftwareImplementation. Its entry guard now requires the original issued context and owner before constructing any production adapter. The only tracked production importer of createXrogaAgentModelRoute is this adapter, verified by an AST import regression.

The model factory requires an issued TenantModelScope and matching outer/inner user IDs. It snapshots the selected scope and request, has no raw-user-ID reservation fallback and ignores the retained legacy credentialOverride input. Every route reuses withTenantModelReservation and the canonical CredentialVault account consumer. Explicit platform accounts remain platform accounts. Connected keys are current revision-bound vault records, never transferred to another provider.

The actual SDK receives only dispatch.payload and dispatch.beforeDispatch. That guard binds model, maximum tokens, messages and tools, checks current project ownership, admitted run attempt, account revision/revocation and any existing exact authority binding before every SDK wire attempt. Endpoint admission and no-redirect policy remain unchanged. Tool descriptions/results are data and cannot mint a consequential action permit. Model-generated tool calls remain subject to the existing SoftwareAgent tool authority boundaries, which this change does not replace or certify.

The turn buffers events until reservation settlement and persistUsageAccounting with the original issued context both succeed. Its actual model and token usage create one receipt through record_ai_usage_atomic. A missing/foreign/failed receipt throws PostCompletionAccountingError, yields no buffered event and never replays the provider. This is the existing ledger and RPC, with no schema change. Cancellation during chunk iteration also withholds buffered output.

## Positive and negative proof

- Actual factory rejects missing/cloned/wrong-owner context before lookup. The production implementation adapter rejects it before reading model configuration or creating bindings.
- Actual SDK SSE parser and request serialization preserve tenant/account/revision, immutable messages/tools, exact reservation and positive completion.
- Foreign credential, rotation during reservation, project transfer, malformed reservation and serialized wire substitution send zero extra provider bytes, including with a would-succeed alternate route.
- Revocation after a503 is rechecked before the SDK's retry, so that retry and fallback send no additional bytes.
- Settlement failure and foreign atomic receipt never replay completion or release buffered events.
- Caller cancellation sends zero bytes. Known accounting denial aborts an already-started planner hedge in the unchanged shared regression.
- Ordinary503 retains one bounded SDK retry followed by the authorized alternative, with its own reservation and exactly one completed receipt.
- Secret data, tool-schema secret names, unapproved provider endpoint and cross-provider credential namespace stay denied. Upstream mutable identity/request inputs cannot retarget the captured scope.

Focused19-case runtime/hedge/factory/SDK tests passed with zero failures/skips. A new disposable test in softwareAgentSdk.local.integration.ts additionally exercises actual Auth/PostgREST/PostgreSQL reservation, settlement, accounting receipt and a committed project transfer between reservation and wire. Only its fixed model response is synthetic. The test is registered in the mandatory full disposable suite and requires new exact-source execution, not reuse of the predecessor's209-case receipt. New-source CI and that receipt are collected externally after committing. This document does not predeclare their results.

## Scope, revocation and rollback

This review closes the named SDK dispatch boundary against the explicitly traced production caller, not arbitrary upstream content ownership, remote tools, generated code, other SDKs, live model-provider behavior or Phase4 acceptance. Already-dispatched bytes cannot be recalled, and there is no atomic transaction spanning database ownership and an external provider request. Revocation/attempt/account state is checked immediately before each actual wire attempt. A completed request with uncertain accounting remains terminal.

No confirmation rule, production config, migration, dependency, frontend feature or original evaluator changes. No provider request, deployment, IAM mutation or spend is authorized by this proof. Rollback is an ordinary reviewed revert before release, preserving existing ledger rows, ciphertext/revisions and revocations. The new path deliberately fails closed on production databases without the existing atomic accounting migration. Production rollout therefore remains approval-bound.
