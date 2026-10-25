# XROGA Batch 1 / Phase 3 — implementation playbook

This playbook is the **actual coding specification** alongside the original source contract, `PHASE-3-EXECUTION-WORKLIST.json`, `PHASE-3-CRITERIA-MATRIX.csv`, `PHASE-3-TEST-MATRIX.csv`, and `PHASE-3-ACCEPTANCE-GATES.md`. It does **not** claim any Phase 3 code has already been implemented. Accepted predecessor: `a21a82029276d38d53c9e17c580a15f57b653fe3`.

## 0. Preserve invariants and understand the scope

Phase 3 = original Command **008** (canonical authority for consequential actions, 10 criteria) + original Command **009** (CredentialVault, 12 criteria). Phase 4 alone covers original Command 010 egress, redirects, DNS/SSRF, destination and size gates. Phase 3 still must prohibit unauthorized credential access, sensitive export and consequences under its own grants. Preserve Command 007 issued TenantContext, row ownership, RLS, service-role exceptions, worker run lineage, Postgres locks, optimistic revisions, exact receipts and genuine passing tests.

Mandatory build principles: (1) reused components instead of second authority engine, (2) actual effect-path coverage instead of policy documentation alone, (3) fail closed on missing authority, (4) never trust model/document/tool content as approval, (5) no surprise spend or real provider side effect, (6) honest proof and external blockers, (7) no self-referential source hash or invented receipt.

## 1. Establish one finite source-traced inventory

Scan actual routes/capabilities/adapters for reachable consequential dispatch, not just imports. Inventory action origin -> auth-issued user/run -> immutable plan -> account/target -> authorization -> provider/database effect -> result/audit/settlement. Include Composio, Operations, messaging/email, publish (GitHub/Vercel/CWS/EAS), billing/spend, connected-app writes, external upload, export, destructive file changes, browser state-changing actions, task/workers and scheduled runs. Each consumer marked `ACTIVE_ENABLED`, `DISABLED_FAIL_CLOSED`, `INTERNAL_TRUSTED_WITH_GUARDED_ADMISSION`, or `UNVERIFIED_BLOCKER`. No generic allowed shortcut.

Inventory each credential writer/read/exporter by **storage location**, user/provider/account/type/epoch, whether direct token fields still persist, crypto version, refresh, custom MCP, project runtime secret, platform webhook, env-based key, private Storage mirror and browser-local secret. Mark exact authoritative read and revocation strategy. Keep user-owned and platform-owned secrets separate; distinguish opaque account IDs and tokens.

Do not repeatedly scan the entire repo. Once inventory is established, refresh only changed paths and proof hashes. Preserve the original Phase 3 frozen handoff if recovered; use this pack as supplement, not substitute.

## 2. Command 008 — canonical authority architecture

### 2.1 Proposed interface (adapt to actual TypeScript)

Use an equivalent canonical interface under `backend/src/security/authority/`, reusing existing persisted confirmation, Operations and budget primitives:

```ts
interface PreparedAction {
  version: string; id: string; tenantId: string; subjectUserId: string;
  runId?: string; projectId?: string; actionClass: ActionClass;
  operation: string; provider?: string; connectedAccountId?: string;
  targetId?: string; targetVersion?: string | number;
  recipient?: string; destination?: string;
  payloadDigest: string; canonicalIntentDigest: string;
  sensitivity: string; risk: string;
  maxSpendMinor?: string; currency?: string;
  issuedAt: string; expiresAt: string;
}
interface ActionGrant {
  id: string; preparedActionId: string; intentDigest: string;
  issuerActorId: string; approvalProvenance: string;
  issuedAt: string; expiresAt: string;
  approvedUses: number; consumedUses: number;
  nonce: string; revokedAt?: string | null;
}
```

Illustrative types only; do **not** blindly create this exact schema alongside existing `operations_actions` and `business_action_confirmations`. First determine if existing tables can be extended with a canonical linkage and durable receipt rather than a new store. A preference (`full_access`) is not a grant and cannot override financial/credential/deletion/high-risk gates.

### 2.2 Canonical intent digest

Use deterministic, injective-for-supported-values JSON canonicalization for relevant plan fields. Include action class, provider, exact canonical connected-account ID, tenant/user/run/project, target and version, recipient/destination, attachments, payload digest, amount+currency, approval scope, expiry/revision/nonce. Reject unsupported values, `NaN`, infinities, ambiguous numeric formats, Unicode/control confusions as appropriate and mutable object references. Separate safely redacted UI snapshot from authoritative raw-parameter digest; never hash a redacted value that merges different destinations. No secret bytes written to proof logs.

Tests must replace each bound field independently and deny before dispatch. Two semantically equivalent supported objects with key ordering differences should canonicalize consistently when appropriate. Cross-provider or wrong target/version always deny.

### 2.3 Issuance and user-facing approval

Authenticated backend creates immutable prepared-action object and server-held grant request. UI displays exact target/account/recipient/summary/amount/currency/risk/expiry and permits approve/cancel. Confirmation is an authenticated server action recorded with user/session/correlation and durable audit; a generic message of `yes` in conversation history is NOT approval to unrelated later tool effect. LLM, document text, tool metadata, web page and prompt-injection content never mint grants. Implement explicit risk policy for all 12 original classes; harmless READ can avoid destructive confirmation when permitted. Dual approval required only when original Operations role policy demands it.

### 2.4 Decisive effect enforcement

Use an adapter middleware or canonical executor that derives authority from issued actor context and immutable persisted plan. Before side effect: (a) recheck current actor/role/tenant/project/target, (b) reselect canonical provider connected account, (c) recompute digest, (d) verify grant TTL/revocation/allowed uses/second approver, (e) enforce risk/spend and currency, (f) claim in a serializable/row-lock-safe transaction with idempotency key. Dispatch **only** approved snapshot, not fresh model parameters. Persist exact result identity, grant/action receipt, audit and accounting settlement. Revoke/expire during awaited lock must deny.

For internal DB effects, reuse the verified Operations atomic mutation+completion where possible. For external HTTP effects **never hold a database transaction open** across network I/O; save pre-effect durable claim, provider-supported idempotency token, and later effect receipt. A network timeout after possible effect is `UNCERTAIN_RECONCILE`, not automatically a safe failure. No blind retry of sending/publishing/purchasing. If downstream supports no idempotency or queryable receipt, pause for reconciliation rather than repeat.

### 2.5 Durable effects, approval lifecycle and clock

Account for prepare -> awaiting approval -> approved -> claimed -> effect pending -> completed / declined / expired / revoked / uncertain. Every transition must have actor and persist exact version. A failed-before-effect claim may release; an effect possibly completed must not release and silently permit another call. Use real clock/expiry and DB authoritative status; frozen historical test clocks cannot change live freshness policy.

### 2.6 Spend and settlement

Reuse `reserveProviderBudget` / `settleProviderBudget` / `finishFailedProviderReservation` and durable usage ledger. Distinguish AI entitlement percentage from authority to purchase/pay/spend on user's behalf. Grant spend ceiling binds exact currency/provider/account/target and budget purpose. Use integer minor units or existing micro-USD, avoid floating-point money arithmetic and unverified FX conversions. For concurrent reserves, enforce cap transactionally; detect stale target/cycle/owner. Reserve before potential spend and settle once after confirmed effect. Maintain uncertainty hold if provider completed but accounting receipt is missing; never re-execute because accounting failed. For truly absent financial capabilities, mark class `DISABLED_FAIL_CLOSED` with test, not a fake money transfer.

### 2.7 Adapter migration strategies

- **businessAction:** keep `prepareBusinessAction`, `verifyPlanDigest`, durable `claim_business_action_confirmation`; ensure actual `executeComposioActionTool` path sees canonical valid grant, current account and a strictly matching plan. Existing `explicitUserAuthorization: true` is not adequate by itself for high-risk actions.
- **Operations:** preserve `ACTION_DEFINITIONS`, project-role access, approvalRole, action digest/lease, `mutate_operations_internal_target` and `finalize_operations_automation_run`. Canonical compatibility adapter may map existing strong verified action rows to grant interface without writing duplicate approval states.
- **Publishing:** staging/production differences bound to precise destination/account/artifact; sandbox stub tests for CWS, EAS, Vercel, GitHub; do not publish for real.
- **Communication/CRM:** recipient, account, content digest and send channel bound; a draft is not sending consent.
- **Files/browser/upload:** external upload and sensitive data export require exact signed/stored data/destination and permission. Phase 4 destination DNS/SSRF still separate; do not claim it is implemented.
- **Scheduler/workers:** durable owner/run admission and exact current permission at execution time, not caller text. Use existing scheduler.

### 2.8 Safe legacy approvals and migrations

Inspect existing `business_action_confirmations`, `operations_actions`, approval RPCs and SQL grants. Determine smallest necessary migration; optionally bridge old approvals via strictly scoped compatibility adapter with bound immutable plan, TTL and single use. Do not grandfather unbound `confirmed=true` into new permissions. Stage new writes, bounded legacy compatibility, expire/transition existing authorizations, then disable legacy effect bypasses. Rollback restores earlier **verified** safety, never unguarded execution. Every enabled consequential entrypoint must be governed by the canonical API/explicit equivalent.

## 3. Command 009 — secure CredentialVault architecture

### 3.1 Concrete existing security problems to address

`frontend/src/lib/credentialVault.ts` currently persists XOR-obfuscated secrets and Base64-encoded password-like values in `localStorage`. That is not secure authenticated encryption. Investigate real callsites; stop new secret saves to browser storage, replace with backend masked-state UX and require explicit user consent for any existing local browser import. Backend cannot inventory remote users' localStorage automatically. User should reconnect/rotate previously exposed credentials when appropriate.

`backend/src/services/integrations/userProviderKeys.ts` derives AES key material from a chain including `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` and a development fixed fallback. These are unsafe production custody choices; do not abruptly delete old key material before legacy decrypt migration, but eliminate fallback from **new production** encryption and prove startup fail-closed without managed key.

`backend/src/services/integrations/oauthPkceStore.ts` still persists `access_token`/`refresh_token` fields under canonical DB authority; legacy storage mirrors remain. Preserve revision, owner and tombstone enforcement while implementing actual encrypted custody. `credentialEnvelope.ts` already contains AEAD but explicitly states it is **unwired** and does not provide production KMS.

### 3.2 Vault identity, API and scope

Create/extend `backend/src/security/credentials/{types,credentialVault,cryptoProvider,redaction}.ts` only if suitable equivalents do not exist. Distinguish user-owned OAuth access/refresh, BYOK, runtime secret, service-account file, publishing and webhook/platform signing secret. Do NOT encrypt harmless connected-account IDs as if they were secret material. Canonical owner identity, provider/account/type/record/scope and revocation/epoch must be in each access decision.

Prefer `withAuthorizedCredential(context, accountId, type, capability, callback)` or a similarly narrow backend-only interface instead of universal raw decrypt response to LLM/frontend. Return metadata/status/masked account identity to UI. The backend authorized provider adapter may access plaintext transiently for transport, with least necessary capabilities; avoid promises of reliably zeroizing JS strings.

### 3.3 Authenticated envelope and key custody

Use vetted crypto, e.g. 256-bit AES-GCM with random 96-bit nonce and 128-bit tag (correct nonce uniqueness per key). AAD must bind owner/tenant, provider, connected account, type, credential record ID, crypto version, project/scope when applicable. Unknown envelopes, tag/nonce/ciphertext tampering, swapped account or wrong key must fail closed. Strict decoding, input length and algorithm/version constraints.

Use versioned DEK/KEK design where suitable. Data encryption key material must not be stored with its unwrapping authority in the same DB/storage compromise boundary. Define `CryptoProvider` with `generate/wrap/unwrap/rewrap`, provider identity and key-version policy; controlled CI test provider uses ephemeral/test-only material. Do not implement home-grown key exchange. For production, real managed KMS/provider option is **UNSPECIFIED until verified**. Cloud proposal is not a live KMS. If configured with dev/test, missing KMS, service-role or JWT fallback in production, refuse startup and credential operations. **No new production credentials encrypted with legacy fallback.**

### 3.4 Vault DB schema

Before adding `..._xroga_credential_encryption_v2.sql`, inspect actual migration order and source schema. Reuse canonical account revisions; add/enforce credential ID, tenant/user, provider, account ID, type, envelope, DEK/KEK reference and key version, created/updated/expires/rotated/revoked, safe metadata, migration state, receipts and CAS where needed. Server role access and safe RLS. Keep canonical authority source in DB and no stale private Storage mirror resurrection. Never materialize raw decrypted secrets into migration diagnostics.

### 3.5 Writers/consumer compatibility

New enabled OAuth/provider credential writes must encrypt through vault **before DB persistence**. Migrated consumers include Supabase/Vercel/GitHub OAuth, CWS, Expo/EAS, user-provider keys, Composio/custom MCP, project runtime secrets, other publishing adapters and webhook/platform secret sources where applicable. Inventory actual paths, don't assume all named paths exist. Credential use for consequential actions should require valid Command 008 action authority and Command 007 ownership. Keep PKCE state short-lived, owner/redirect/session/epoch bound, one-time via existing DB CAS.

### 3.6 Refresh/revoke/rotate and uncertain outcomes

Preserve existing OAuth revision and Vercel refresh lease single-flight. On disconnect, tombstone canonical account; late refresh/old token cannot resurrect. Rotation is versioned and idempotent: new encrypted revision verified before retiring old one, old key retained during planned transition, and interrupted rewrap resumes without data loss. Revocation check at consumption and after relevant waits. No plaintext fallback if DB is down. Failed credentials return safe errors, not the secret.

### 3.7 Legacy migration with no live data access

Implement dry-run/inventory, controlled old-read compatibility, v2 encrypted write, exact roundtrip, canonical account/owner CAS, mark, observe, retry, then founder-approved cleanup. **Never delete plaintext originals until new data decrypts correctly and users have successfully transitioned.** After cutover, no new legacy plaintext writes, no unbounded fallback reads and no legacy object that can regain authority after revocation. Migration CLI must be idempotent, redacted, resumable and safe to run in `--dry-run` without production credentials. Live migration/cleanup requires separate authorization. Prepare rollback allowing strictly controlled reads only, no return to plaintext writes.

### 3.8 Frontend, prompt, logs and canary tests

Replace frontend XOR/localStorage for **new** secret saves; display only masked metadata from authenticated server. Old local values are handled by explicit opt-in import/reconnect; never silently extract from browser. Allowlist UI, WebSocket, API and LLM outputs. Inject synthetic token canaries in disposable tests; fail if present in logs, errors, prompts, task graph, tool result, evidence, telemetry, private/public caches or frontend response. Use restrictive auth middleware and browser-origin protections already implemented in Phase 2.

### 3.9 Production readiness and blocking dependency

Finish independent code, disposable DB, rotation, PKCE, migration and canary tests even if KMS not selected. Research/verify actual zero-surprise key-provider eligibility under **current** infrastructure. Request a single consolidated founder decision for production KMS/provider permissions and any cost. No paid plan creation or key provisioning without consent. If provider absent, report **`CODE_READY_KMS_CUTOVER_BLOCKED`** (code/test verification only), not `B1_P3_VERIFIED` or fake production custody. The original Command 009 expressly prohibits production vault completion with unspecified key provider.

## 4. Regression and acceptance method

Do deterministic focused unit tests first. Real disposable Supabase/Postgres for concurrent grant/claim, budget, PKCE, vault RLS, rotation, migration and cleanup. Use synthetic refusing provider for Composio/messaging/publish/spend; a synthetic response cannot certify real production effect. Apply fresh and supported upgrade migrations; include unauthorized browser/HTTP and source-bound secret-canary proof. Repeat branch+integrated baseline only at meaningful source checkpoints. Preserve prior CI failures, don't rerun unchanged source to obtain new green.

For each original 008/009 criterion, record source SHA, test IDs, positive and negative receipts and complete caller inventory; only then assign VERIFIED. Handoff's 22 `PLANNED_NOT_IMPLEMENTED` statuses are NOT proven implemented. At final source, run original safety/evaluator gates and all ten Phase 2 regressions, then 008/009 strict evidence audit. Report blockers literally, never infer from test names.

## 5. Prevent an endless audit loop

- Do one **bounded full inventory** each of consequential effects and credential writers/consumers, then incremental changed-source reconciliation.
- Prioritize a **shared root cause** over each individual source call.
- After two failed attempts at one issue, write the diagnosis and switch approach or to independent work; no repeated broad repair guesses.
- Keep existing operations, scheduler, grants and budget as canonical.
- No optional feature requests or command010 egress implementation.
- Every added test must prove specific missing original criterion and exercise actual source path.
- Stop on all 22 genuinely VERIFIED **plus** mandatory production key custody if required; otherwise stop with exact blocker state and founder checklist.
