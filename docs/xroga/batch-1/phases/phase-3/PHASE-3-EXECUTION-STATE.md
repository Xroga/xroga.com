# Phase 3 execution state

This ledger references the unchanged canonical `../PHASE-3-FROZEN-WORKLIST.json`. It adds no acceptance criteria and changes none of its 22 original criteria, 12 action classes or 20 baseline interface bindings. Historical baseline statuses describe the frozen handoff, not current implementation certification.

## Preserved source and admission

- Accepted Phase 2 source: `a21a82029276d38d53c9e17c580a15f57b653fe3`. Immutable, not reopened.
- Handoff archive: remote branch `codex/xroga-phase-3-handoff-a21a8202`, commit `e93845d90011acce0223606f25e15024bd282da6`.
- Founder separately authorized Phase 3 implementation on `codex/xroga-batch-01`, draft PR 803.
- Original contract preflight passed with no errors or warnings. Original raw contract SHA256 `a0926f4e47149450c3f9fc33c59782eac31d19be57789f11950b20b03c01b499`.
- Supplementary engineering pack was absent from the repo. Source-only guidance was recovered from the supplied ZIP, with entry checksums verified and no overwrites. It supplements, rather than replaces, the original frozen worklist.

## Concrete implementation sequence

1. Extend existing business confirmation claims with strict canonical payloads, opaque in-process permits, account-bound provider dispatch and final locked expiry/revocation checks. Completion requires legitimate positive dispatch plus mutation, replay, cancellation, wait and failure receipts through actual adapters and disposable DB.
2. Reuse Operations claims and approvals as a documented canonical authority adapter. Preserve internal atomic completion, worker and project admission. Complete bounded effect inventory and 12-class policy coverage, including existing budget reservation and settlement. No new approval engine.
3. Extend the existing envelope, token revision, PKCE and runtime-secret mechanisms into canonical CredentialVault custody. Complete one writer/reader inventory, then migrate actual enabled writers and consumers. Preserve user consent for browser-only legacy imports and explicit reconnect flows.
4. Verify focused tests, actual disposable Supabase, relevant Phase 2 regressions, then source-bound branch/integrated CI. No duplicate unchanged suites. Record all 22 original criterion outcomes against authenticated evidence.
5. Freeze accepted source and prepare Phase 4 handoff only if mandatory Phase 3 acceptance passes. No Phase 4 implementation.

## Current engineering, not acceptance

- IN PROGRESS, C008 AC01,02,04,05,06,07,09,10: shared strict JSON digest, issued-actor executor, opaque single-use permit, exact-scope checks, deterministic 12-class policy floors and business/provider bridge.
- IN PROGRESS: migration `20261020000300_business_authority_dispatch.sql` extends the existing confirmation table and RPCs. The initial admission version passed disposable Supabase at `f011d7e1`. Later receipt and absent-policy serialization additions require new-source database verification. Neither version claims an independently verified external postcondition.
- READY, C008 AC03,08: Operations compatibility adapter and durable spend-bound verification. Merely refusing unbound financial requests does not satisfy the spend criterion.
- IN PROGRESS, C009 AC04,05,06,10: canonical backend envelope and injected CryptoProvider, identity-bound random data keys, key rotation primitives and production refusal. Nine focused crypto tests pass. None of the old storage writers is cut over yet.
- READY, C009 AC01-03,07-09,11-12: bounded credential inventory, actual writer/reader cutover, database rotation/revocation and migration, frontend consent and complete acceptance tests. Existing PKCE work is reusable evidence, not complete Command 009 acceptance.
- BLOCKED external dependency: actual production KMS provider and custody are unspecified. No provider has been provisioned or billed. Do not call development keys production KMS, and do not claim this is the only remaining blocker.

## Test observations

- Node 22.21.1, focused digest + business legacy-digest + Operations regression: 36/36 passed before bridge wiring.
- Focused digest, authority, business digest, existing confirmation claim and Operations regression after bridge wiring: 41/41 passed, zero failed or skipped.
- These are unit/loopback tests. They do not certify real database concurrency, live provider completion, production custody, complete adapter coverage or Phase 3 acceptance.
- Backend typecheck passed after correcting callback narrowing and typed RPC receipts.
- Golden journeys: 14/14 passed. Positive fixtures use an issued-actor canonical permit with an explicitly synthetic claim receipt. Actual adapter requests explicitly select the exact prepared account. Boolean-only and forged permits, wrong tenant session and changed/disconnected account deny. Provider failure and timeout still traverse the real adapter stub and cannot become success.
- Immutable handoff and finite Phase 2 register tests: 7/7 passed, including missing/rewritten criteria, fabricated completion and tampered baseline hash rejection.
- Local PGlite: 15/15 assertions passed, including service-only admission, owner/plan checks, one-use dispatch, in-flight cancellation, policy override, terminal recording, rollback and migration replay. This is synthetic schema SQL, not actual Supabase or lock-concurrency proof.
- At `f011d7e1a8e29970e883b921e2a36fa672a8107a`, disposable run39439419199/job118685013898 passed all208 security tests, including the four new canonical business/dispatch tests. The receipt was independently retrieved and authenticated by API, exact checkout and test names, with log SHA256 `a21717b246dd0e48a5df913e690151102ee37d78d722164d73c54adb32ff3fd8`. The provider was intercepted, not live.
- The first integrated baseline at virtual source `2a3aed71c33d73093df1343189150f7ff0d9a1f5` passed3104 backend tests, backend/frontend builds, types and lint, then failed the frontend assertion expecting the removed full-access bypass. Standalone frontend build39439419238 failed because a frontend contract test imported the provider's new server dependency chain. The pure shared namespace extraction and corrected non-bypass assertion pass10 focused tests locally. Frontend typecheck also passed after that fix. Neither failed workflow is labeled green.
- New receipt and approval additions after that verified source are mandatory original-contract work. They add structured account/destination/redacted critical parameters and the persisted result digest, with reported-success/uncertain/not-dispatched outcomes. Updated source needs real Supabase and branch/integrated proof. A fifth real browser scenario is prepared to verify account/parameter display, secret redaction, cancellation and refusal of old unbound plans without any external action.
- The expanded local SQL probe passed18 assertions with exact result receipt, immutable terminal replay and altered-account receipt rejection. The original15-check proof remains historical, not latest-source acceptance.
- A focused real-adapter stub test reproduced raw credential fields in provider results before the fix. The shared read/write result boundary now returns only the expected DTO, redacts credential values and nested credential objects, retains ordinary result URLs, and hashes the complete pre-redaction data for receipts. Golden journeys now pass15 tests, including a legitimate read with no write confirmation. This closes that demonstrated leak, not every prompt or credential caller.
- The new approval page passed targeted lint and frontend typecheck. Its real browser scenario compiles and lists successfully but has not yet executed on the updated source. Backend typecheck and focused authority/business/crypto/Operations suites pass locally. No disabled test, weakened assertion or production deployment was used.
- The original required credential audit tool now performs one bounded AST snapshot:119 source candidates in38 groups, including21 write candidates,4 lifecycle candidates and94 private consumer candidates. These include non-secret preferences, metadata and revocation markers and are not119 vulnerabilities. Three adversarial audit tests pass, and audit plus integration-projection tests pass8/8. The snapshot explicitly reports zero static backend importers of the new vault, so actual caller cutover is visibly incomplete. CI checks source drift without calling any candidate security-certified.
- Preserved original73 packets and371 historical identities. A bounded source-position refresh maps19 prior sites and explicitly retains3 new dispatch/revocation sites as missing proof. Pure Buffer/Array conversions are source-traced as local non-persistence. Current-source generated counts are651 candidates, not a re-certification of the accepted636 snapshot.
- Latest focused business digest and adapter tests pass23/23, including rejection of incomplete provider outcomes, getter-free argument validation and read-only policy denial before confirmation creation. The new database test covers policy insertion as well as updates while dispatch waits. Its actual PostgreSQL concurrency result remains pending until the next source-bound CI run.
- Public GitHub repository status was verified before CI use. The existing Vercel ignore script blocks this exact branch, and its test passed. No hosting settings changed.

No complete Phase 3 acceptance is declared. Final-source CI, Operations integration, spend accounting and actual vault writer/reader cutover remain mandatory. No merge, deployment, production migration, live provider call, live credential operation or additional spending occurred.
