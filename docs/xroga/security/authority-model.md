# Phase 3 authority model, implementation in progress

Original authority is Command 008 in `docs/xroga/research/inputs/batch-one-report.txt`. The frozen 22-criterion worklist remains unchanged. This document is not acceptance evidence by itself.

## Business action boundary

`security/authority/enforce.ts` exposes `executeAuthorizedAction`. It accepts an original issued TenantContext, an exact prepared scope and an existing durable claim adapter. It never takes a request boolean as a grant. The adapter is trusted backend code, not a serialized public API.

The existing `business_action_confirmations` record is the grant, consumption state and receipt record. No second approval table exists. The grant ID is its UUID. Owner and subject are the authenticated confirmation owner, the run ID is null for this synchronous path, and the server-prepared scope binds provider account, operation, action class, exact payload digest, time and nonce. Its locked claim timestamp records explicit authenticated confirmation provenance. Cancellation status and completion time record user revocation. These are derived from the existing durable record, not model text.

Every new business write requires this durable confirmation, including full-access preferences. The read lane remains separate and rejects mutating tools. Current read-only preference blocks an approved write. Legacy plans remain readable, cancellable and safely terminalizable, but a plan without the new scope cannot dispatch.

The opaque in-process permit is backed by a private WeakMap. Copies, JSON objects, stale permits and a second consumer fail. Exact arguments are snapshotted before asynchronous work. The real Composio sink checks session ownership, discovered tool, current connected account, then consumes the permit after the last account lookup. Consumption invokes `authorize_business_action_dispatch`, which rechecks the exact claimed row, database expiry and current stored read-only policy under locks. The provider request explicitly selects the approved `account` using the documented session execute API. Helper/meta actions that can ignore top-level account selection are refused by this path.

Reference: https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSessionBySessionIdExecute

## Approval and receipt contract

The owner-only confirmation projection adds structured account, operation, destination, redacted critical parameters, digest, expiry, risk and spend ceiling. No session, OAuth token or raw credential is returned. Redaction does not affect the digest, which binds the original exact payload.

The existing terminal RPC retains its immutable owner/claim/plan comparisons and records a minimal scoped receipt. It persists account, action, plan digest and a result digest, never the raw provider response. `provider_reported_success` means the adapter reported success, not an independently verified external postcondition. `dispatch_uncertain` means admission started but success was not verified. `not_dispatched` means the record never reached dispatch admission. Unknown outcomes are not automatically executed again.

Revocation and dispatch linearize on the same confirmation row lock. Once dispatch admission has committed, cancellation cannot undo an external effect. A lost dispatch acknowledgement may conservatively leave an uncertain outcome even if the application never sent the provider request. This is deliberately not an exactly-once distributed transaction.

## Operations reuse and remaining scope

Operations already has current-role/project/parent admission, confirmation digests, independent approver roles, database-time approval expiry, attempt leases and atomic internal completion. Its existing tables and RPCs must be the compatibility adapter. Do not replace them with a second approval engine.

Original C008-AC03 remains incomplete until that adapter's canonical scope and policy mapping are reconciled at every enabled registry capability. Delegated project actors must retain their identity separately from the project owner. The current personal TenantContext must not be repurposed to silently impersonate that owner.

Original C008-AC08 remains incomplete. Binding a positive monetary ceiling, or refusing a financial action without one, is not durable reservation and settlement. Reuse `providerBudget.ts`, quota, post-completion accounting and actual benchmark spend caps. Complete their relationship to the user-approved ceiling, currency, action and idempotency key before claiming this criterion.

The documented Composio v3.1 response also includes provider input-required/failed states and an optional instant-charge observation. HTTP 200 alone is not completion. Non-completed responses are now refused without automatically submitting provider approval answers. Platform/tool execution fees still need explicit pre-effect funding and grant-ceiling reconciliation under C008-AC08. No live fee-bearing request was made, and no zero-fee production assumption is certified.

## Verified source versus current work

`business-authority-receipt.json` in Command 008 evidence authenticates four actual disposable tests and all 208 security tests at `f011d7e1a8e29970e883b921e2a36fa672a8107a`. External provider execution was intercepted, not live. Subsequent receipt/approval projection changes require their own changed-source verification. The accepted Phase 2 commit remains `a21a82029276d38d53c9e17c580a15f57b653fe3`.

The first integrated baseline passed 3,104 backend tests, then failed one frontend assertion expecting the removed full-access bypass. The standalone frontend build also found a transitive backend dependency in a contract test import. Both precise fixes have focused local proof. These failures are not represented as a complete green baseline.
