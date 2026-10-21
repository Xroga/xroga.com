# Phase 3 execution state

## Current reconciliation, 2026-10-21

This section supersedes earlier pending/current engineering descriptions below, not historical receipts. Accepted software d750836bfa44bd6fa668f827a4529ed49dec5269 and OCI source 9d6234afdd0a20e99f584acf7f93e346c5c49164 remain separate immutable sources. Current main is pinned to da76de8947668cc17fd2a99e9d673bc6de24b21e. Main was reconciled into the review branch only, with UI PR825 and feedback PR824 corrections retained as individual commits. Nothing was merged into main or applied to production.

One criterion scoreboard follows. VERIFIED below describes the preserved accepted software proof, not final current-source acceptance. Every current acceptance row is BLOCKED until the new exact-source branch/integrated receipts are authenticated. C009 AC10 also retains the independent mandatory non-admin runtime-custody dependency. No Command008 implementation is classified as broken because custody is missing.

| Original criterion | Preserved software proof | Current acceptance | Exact remaining proof |
| --- | --- | --- | --- |
| XB01-C008-AC01 | VERIFIED | BLOCKED | Current-source canonical authority regression and authenticated CI |
| XB01-C008-AC02 | VERIFIED | BLOCKED | Current-source business dispatch/database regression and authenticated CI |
| XB01-C008-AC03 | VERIFIED | BLOCKED | Current-source Operations compatibility/database regression and authenticated CI |
| XB01-C008-AC04 | VERIFIED | BLOCKED | Current-source immutable binding regression and authenticated CI |
| XB01-C008-AC05 | VERIFIED | BLOCKED | Current-source replay/concurrency regression and authenticated CI |
| XB01-C008-AC06 | VERIFIED | BLOCKED | Current-source payload mutation regression and authenticated CI |
| XB01-C008-AC07 | VERIFIED | BLOCKED | Current-source expiry/revocation/lock-wait regression and authenticated CI |
| XB01-C008-AC08 | VERIFIED | BLOCKED | Current-source spend reservation/settlement regression and authenticated CI |
| XB01-C008-AC09 | VERIFIED | BLOCKED | Current-source forged/model-only authority regression and authenticated CI |
| XB01-C008-AC10 | VERIFIED | BLOCKED | Current-source twelve-class inventory regression and authenticated CI |
| XB01-C009-AC01 | VERIFIED | BLOCKED | Current-source enabled writer regression and authenticated CI |
| XB01-C009-AC02 | VERIFIED | BLOCKED | Current-source frontend/API secret-canary regression and authenticated CI |
| XB01-C009-AC03 | VERIFIED | BLOCKED | Current-source model/task redaction regression and authenticated CI |
| XB01-C009-AC04 | VERIFIED | BLOCKED | Current-source owner/AAD rejection regression and authenticated CI |
| XB01-C009-AC05 | VERIFIED | BLOCKED | Current-source tamper rejection regression and authenticated CI |
| XB01-C009-AC06 | VERIFIED | BLOCKED | Current-source rotation/recovery regression and authenticated CI |
| XB01-C009-AC07 | VERIFIED | BLOCKED | Current-source revocation/revision regression and authenticated CI |
| XB01-C009-AC08 | VERIFIED | BLOCKED | Current-source PKCE TTL/consume regression and authenticated CI |
| XB01-C009-AC09 | VERIFIED | BLOCKED | Current-source idempotent migration/interruption regression and authenticated CI |
| XB01-C009-AC10 | VERIFIED | BLOCKED | Current CI plus approved least-privilege identity, actual backend/provider access, valid wrong-principal denial, expiry/renewal/revocation and custody/cutover receipts |
| XB01-C009-AC11 | VERIFIED | BLOCKED | Current bounded credential inventory regression and authenticated CI |
| XB01-C009-AC12 | VERIFIED | BLOCKED | Current-source legacy cutover denial regression and authenticated CI |

Exact proof paths/markers remain in the unchanged command008/009 manifests. Original criterion text, 12 classes, 20 frozen bindings and evaluator are unchanged. No planning marker is treated as test proof.

The three current-main growth failures reproduce as nine STALE_FACT results caused by real time advancing beyond dated facts. Existing Phase3 tests already freeze only their test children and explicitly reject overdue facts. All three pass on the proposed integrated source. Separate review PR830 ports that bounded correction to main and corrects S03 placement after S02/before approved S04, following homepage removal commit0ff3f2a8. Main's later PR827/828 also intentionally removed the New Terminal text label, made the picker composer-wide and renamed Integrations to Plugins. Test corrections retain accessible names, visible icons, viewport bounds, upload order and real callbacks. No UI behavior was changed.

PR824 retains ten passing real disposable Supabase Auth/MFA/PostgREST/PG17 cases at e4ae5e7cc4bb2709fbe0c32d452546b899eedfcf. Targeted fresh/upgrade proof is not full-history or production parity. Legitimate-founder confirmation, owner role and MFA prerequisites must be reviewed before any production application. No founder account or role was changed.

The accepted Phase3 branch already has a disposable-only browser workflow with per-run keys, local endpoints, full-history migration, readiness and teardown. Main's missing hosted-project secrets are not supplied or bypassed. Reuse that existing workflow for the reconciled source. Preserve the previous cold-start timeout. Local browser runs now wait for a real HTTP200 Next document before navigating and assert the rendered composer, rather than sleeping or raising assertion timeouts.

Read-only OCI inspection confirms the existing Dubai SOFTWARE AES256 key remains enabled. Earlier real Cloud Shell crypto receipts remain scoped to operator cryptography. The existing Free domain had only an administrator user, so no approved non-admin application identity exists. The exact local/native-session proposal is durably preserved in refs/notes/xroga-phase3-acceptance at6385041f3f11ca09dcbb44df86ca9c536c767aa4 and in the founder delivery bundle. No identity, group, policy, trust, credential or grant is authorized by this directive. Stop those actions until explicit owner approval. Keep both versions and ciphertexts. SOFTWARE key backup is unsupported, and retained-version/process recovery is not disaster recovery. Google billing is untouched.

Current final status remains B1_P3_BLOCKED while new integration evidence is pending. If software/integration proof completes and only external custody remains, use the founder-requested reporting label B1_P3_CODE_READY_EXTERNAL_CUSTODY_BLOCKED without changing the evaluator's original CODE_READY_KMS_CUTOVER_BLOCKED semantics. No Phase4 implementation.

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

- SOFTWARE VERIFIED, C008 AC01-10: canonical authority, actor provenance, deterministic 12-class risk floors, durable confirmation, one-use dispatch, Operations budget admission, exact account selection, redacted receipts and positive, negative, concurrency and database tests are implemented. Final-source branch and integrated CI receipts are still required.
- IMPLEMENTED WITH FINAL CI PENDING, C009 AC01-12: enabled vault writers and private consumers use v3 envelopes, browser legacy import requires consent, migrations are owner and revision bound, and rotation, revocation, tamper, PKCE, recovery and concurrency tests are implemented. The bounded audit retains 117 candidates in 37 semantic groups and seven canonical vault importers, including runtime receipt validation. Original criterion acceptance still requires the corrected database and CI receipts.
- CODE READY: Google Cloud KMS is the selected managed adapter. Runtime selection uses the exact CryptoKey resource and Application Default Credentials. Focused tests cover exact key/AAD binding, malformed provider responses, substitution, data-key length and development-provider production refusal.
- BLOCKED external dependency: no Google Cloud KMS key, billing authorization, least-privilege runtime identity or real isolated cutover receipt exists. No provider call, live credential migration or production change has occurred. This prevents `B1_P3_VERIFIED` even after software CI succeeds.

## Test observations

- At `25a3090d`, the disposable integration reached 204/209 passing tests. Five remaining failures exposed one invalid fixture profile role, separate per-process test keys, PostgreSQL timestamp representation in runtime vault AAD, and lost Vercel provider-account identity after lease admission. The corrections use a fresh masked per-run test-only wrapping key shared with the disposable API, canonical timestamp serialization, a current account/revision/lease recheck before refresh, and the schema's legitimate `member` role. Production still refuses test keys. Focused runtime/vault/account tests pass 22/22 and disposable bootstrap tests pass 8/8. New-source CI remains required.

- Final verification correction after `68b68be2`: browser run `39465995054` passed 201 of 209 real database tests. Eight failures identified obsolete raw OAuth fixtures, a missing Operations owner billing cycle, a v1-only receipt decoder on the runtime v3 writer, and a stale BYOK envelope assertion. The decoder now accepts structurally valid v3 records while retaining owner, project, metadata and version rejection. OAuth fixtures now use actual vault envelopes and preserve the original one-use, revocation, race and exact foreign-row assertions. Final-source database verification remains pending.
- Unit job `118778145066` failed on stale current-state source hash `SRC-3d3190a1571aa705`, before baseline execution. Its missing-summary artifact error was a consequence of that early exit. Regenerate inventory before requirement reconciliation and validate both before pushing the corrected source.
- Focused vault, PKCE, GitHub revocation, Vercel refresh and runtime receipt tests pass 20/20. Provenance, immutable handoff, closure and evaluator fixtures pass 24/24. Backend typecheck passes. These local results do not substitute for the pending real database and integrated CI receipts.
- Authenticated Google Cloud inspection found a closed Free Trial billing account, no active billing accounts and no displayed credits or expiry. KMS redirects to the billing gate. Local ADC probe returned `ADC_UNAVAILABLE`. Exact observations and pricing sources are retained in `docs/xroga/evidence/command-009/google-cloud-observation.json`. No resource or credential was created, and provider calls and trial-credit usage remain zero.

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

No complete Phase 3 acceptance is declared. Final-source CI and real managed-key custody/cutover evidence remain mandatory. No merge, deployment, production migration, live provider call, live credential operation or additional spending occurred.
