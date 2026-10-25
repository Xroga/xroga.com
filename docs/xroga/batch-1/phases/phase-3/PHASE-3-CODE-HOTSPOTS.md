# Exact baseline code hotspots and already-known architecture

Source inspection baseline: accepted code `a21a82029276d38d53c9e17c580a15f57b653fe3`, which has an untouched application-code baseline from `0aa0c700...`. **These are source observations, not proof of current Phase 3 implementation.** Re-open each actual file and trace current callers before modifying.

## Command 008

| Code path | Observed behavior and targeted work |
|---|---|
| `backend/src/services/integrations/businessAction.ts` | `BusinessActionPlan`, `verifyPlanDigest`, `snapshotBusinessActionPlan`, `executePreparedBusinessAction` exist. Existing `explicitUserAuthorization` boolean and plugin risk reclassification are **not independently sufficient** for a single canonical durable user grant across all write paths. Tie actual dispatch to current durable grant/digest/account. |
| `backend/src/services/integrations/businessActionConfirmations.ts` | Durable confirmation, `claim_business_action_confirmation`, `finish_business_action_confirmation`, pending/claimed/completed state and TTL. Reuse, map into a canonical authority API; preserve race safety and loss-of-reply handling. |
| `backend/src/services/integrations/pluginPermissionPolicy.ts` | Modes `always_ask`, `read_only`, `low_risk`, `full_access`. This preference is **not unlimited authority** for destructive/financial/credential actions. |
| `backend/src/services/integrations/composioClient.ts` | Actual connected-business external action executor. Guard effect invocation, not merely planner/manifest. |
| `backend/src/operations/operationsEngine.ts` | `ACTION_DEFINITIONS` maps risk/role/confirmation and `actionPlanDigest` binds exact params, and includes high-risk roles and benchmark spend. Extend via adapter; do not create a second Operations engine. |
| `backend/src/operations/operationsService.ts` | Durable action, approval, confirmed claim/lease, atomic internal mutation, automation finalization and receipts. Integrate with canonical grant without destroying Command 007 controls. |
| `backend/src/operations/providerAdapters.ts` | Actual provider effect boundary; synthetic refusing adapters required in tests. |
| `backend/src/ai/providerBudget.ts` | `reserveProviderBudget`, `settleProviderBudget`, `finishFailedProviderReservation`, micro-USD. Spending authority and allowance metering are different requirements. |
| `backend/src/ai/postCompletionAccounting.ts` | Explicit uncertain accounting error with `providerCompleted=true`; no duplicate provider execution. Preserve. |
| `backend/src/routes/integrations.ts`, `backend/src/routes/publish.ts`, `backend/src/capabilities/modules/businessAction.ts` | Actual authenticated client entrypoints and capability selection; user/model text alone must not become authorizing grants. |

## Command 009

| Code path | Observed behavior and targeted work |
|---|---|
| `frontend/src/lib/credentialVault.ts` | **Concrete insecure client implementation:** Base64-encoded password hash, XOR-based encryption, localStorage encrypted values. Determine usage; no silent access to browser-local secrets. Replace new secret custody with backend vault; consented import/reconnect. |
| `backend/src/services/integrations/userProviderKeys.ts` | **Concrete risky key fallback:** `USER_SECRETS_ENCRYPTION_KEY || SUPABASE_SERVICE_ROLE_KEY || SUPABASE_JWT_SECRET`, and dev constant key fallback. Remove production fallback without breaking old records before migration. Also contains private Storage mirror logic subject to canonical authority. |
| `backend/src/services/integrations/oauthPkceStore.ts` | Token writes into `user_integrations` and PKCE RPCs; canonical DB authority and revision/tombstone protections exist. Add actual vault ciphertext custody; never resurrect revocation through old mirror. |
| `backend/src/services/integrations/credentialEnvelope.ts` | Existing AEAD AES-256-GCM v2 codec for provider/runtime domains, explicitly **unwired Command 009 preparation only**; no production key custody. Extend AAD to actual account/type/record and CryptoProvider. |
| `backend/src/services/integrations/supabaseAuth.ts` | OAuth exchange, access/refresh, PKCE; keep owner/revision protections and migrate actual saved secrets. |
| `backend/src/services/integrations/vercelAuth.ts` | OAuth refresh lease, revision and direct/mirror storage. Retain concurrency correctness during vault migration. |
| `backend/src/services/publish/chromeWebStore.ts` | Google OAuth, CWS publish, existing BYOK and key paths. Exact publishing permissions belong to Command 008; keys to Command 009. |
| `backend/src/services/publish/easCredentials.ts` | Real GraphQL upload for Google/Apple key material. Do NOT perform live upload in development. Restricted backend credential consumption and exact authority needed. |
| `backend/src/synthesis/projectRuntime/store.ts` | Runtime secrets/project scope; preserve owner/project/name/scope and exact existing receipts. |
| `backend/src/services/integrations/composioClient.ts` | Connected-account identity vs raw token must remain separated. |

## Existing files versus new files

**Existing files above are verification targets, not a mandate to rewrite them.** For new modules, use the original Command 008/009 recommended paths under `backend/src/security/authority/` and `backend/src/security/credentials/` only where equivalent canonical modules are missing. The original repository source and current migration ordering determine actual SQL file names.

## Do not assert these things without verification

- A frontend folder named `credentialVault` is secure custody.
- AES-256-GCM alone means proper production KMS.
- Issued TenantContext alone means permission to spend or approve.
- Green CI means real provider publication / paid transaction succeeded.
- `full_access` means unlimited purchase, export, permission change or high-risk grant.
- An untracked local handoff file exists in the GitHub branch.
- A source-baseline hash proves future changed code without revalidation.
