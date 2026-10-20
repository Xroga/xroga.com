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
- IN PROGRESS: migration `20261020000300_business_authority_dispatch.sql` extends the existing confirmation table and RPCs. It records dispatch admission, not a verified external postcondition. SQL has not yet run on disposable Supabase.
- READY, C008 AC03,08: Operations compatibility adapter and durable spend-bound verification. Merely refusing unbound financial requests does not satisfy the spend criterion.
- READY, C009 AC01-12: vault implementation, bounded credential inventory, caller migration, frontend consent and actual acceptance tests. Existing encryption and PKCE work is reusable evidence, not complete Command 009 acceptance.
- BLOCKED external dependency: actual production KMS provider and custody are unspecified. No provider has been provisioned or billed. Do not call development keys production KMS, and do not claim this is the only remaining blocker.

## Test observations

- Node 22.21.1, focused digest + business legacy-digest + Operations regression: 36/36 passed before bridge wiring.
- Focused digest, authority, business digest, existing confirmation claim and Operations regression after bridge wiring: 41/41 passed, zero failed or skipped.
- These are unit/loopback tests. They do not certify real database concurrency, live provider completion, production custody, complete adapter coverage or Phase 3 acceptance.
- Backend typecheck passed after correcting callback narrowing and typed RPC receipts.
- Golden journeys: 14/14 passed. Positive fixtures use an issued-actor canonical permit with an explicitly synthetic claim receipt. Actual adapter requests explicitly select the exact prepared account. Boolean-only and forged permits, wrong tenant session and changed/disconnected account deny. Provider failure and timeout still traverse the real adapter stub and cannot become success.
- Immutable handoff and finite Phase 2 register tests: 7/7 passed, including missing/rewritten criteria, fabricated completion and tampered baseline hash rejection.
- Local PGlite: 15/15 assertions passed, including service-only admission, owner/plan checks, one-use dispatch, in-flight cancellation, policy override, terminal recording, rollback and migration replay. This is synthetic schema SQL, not actual Supabase or lock-concurrency proof.
- Four actual disposable tests are registered in the existing integration suite. They cover real canonical confirmation with a stubbed external provider, exact persistence, foreign/browser denial, replay, held-row expiry/cancellation/plan changes, transaction rollback and held-policy read-only changes. Their execution is still pending.
- Preserved original73 packets and371 historical identities. A bounded source-position refresh maps13 prior sites and explicitly retains3 new dispatch/revocation sites as missing proof. Three new Buffer/Array conversions are source-traced as local non-persistence. Current-source generated counts are642 candidates, not a re-certification of the accepted636 snapshot.
- Public GitHub repository status was verified before CI use. The existing Vercel ignore script blocks this exact branch, and its test passed. No hosting settings changed.

No Phase 3 criterion is declared fully verified yet. No new CI has run, and no merge, deployment, production migration, live provider call, live credential operation or additional spending occurred.
