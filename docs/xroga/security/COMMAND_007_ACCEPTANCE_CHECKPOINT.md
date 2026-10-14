# Command 007 acceptance checkpoint — not verified

## Latest dependency decision (supersedes the initial candidate below)

Final local rerun: all eight Cline/Git tests PASS, zero failure/skip; all 20 preview access tests PASS (including malformed persisted state); backend typecheck and manifest/lock checks PASS. Two advisory-inventory fixtures PASS. These are scoped local results, not complete Command 007 or integrated CI acceptance.

The actual Cline import test REJECTED Git 4.0.1: `SyntaxError: The requested module 'simple-git' does not provide an export named 'default'`. Git 4.0.2 release fixes the VISUAL parser but does not document restoration of the default import. No Cline SDK/runtime was forked or installed package edited. The Git 4 override was withdrawn; retain SDK/core 0.0.82 and Git 3.36.0, override only its safety parser to 2.0.1 (MIT). Actual SDK repository metadata discovery passes without network; VISUAL casing denials pass; three executable-config tests caught the correct denial but initially assumed the v4 Error.name. They now assert the actual exported v3 GitPluginError instance and unsafe-control reason. No negative assertion removed. Full rerun required.

Current-lock audits return exit 1: aggregate 52 (6 low/15 moderate/30 high/1 critical); frontend 18 (1/4/13/0); backend 40 (5/13/21/1). Parser's critical advisory is removed; **simple-git's package-level critical and propagated high entries remain unresolved**, even though the actual delegated guard is mitigated by the parser. Do not waive or claim full critical remediation from that observation. Full dependency-path evidence stays in dependency-advisories.json. No production activation is authorized.

2026-10-14. Existing branch `codex/xroga-batch-01`; PR 803 stays draft. This assessment keeps implementation, automated scoped evidence and full release acceptance separate. Latest previously retained green runtime: `a8d9972b5671e4339230cfdfffbe11bafedd231b`. Its evidence cannot certify later integrated source.

| Original criterion | Actual status | Evidence / remaining failure |
| --- | --- | --- |
| 1. Every tenant-bearing table documented | Inventory implemented; classification incomplete | All 118 observed tables include columns, nullable ownership, FKs, policy predicates and grants. RLS enabled is not isolation certification. Retired schema drift, inherited/global classification and production orphan counts remain unresolved. |
| 2. Every privileged caller scoped or exempt | FAIL / incomplete | Conservative candidates retain REVIEW_REQUIRED; injected clients, callbacks, workers, growth/community, provisioning, publishing and credential callers need complete semantic review. Direct owner-filter syntax is not proof. |
| 3. High-risk negative tests | Scoped PASS; complete coverage incomplete | Previously 35 real database/security tests plus 3 browser tests, zero skipped. Preview binding/grant creation/revocation test added, execution pending for new SHA. Full caller/account/resource matrix still missing. |
| 4. Protected endpoints distrust supplied ownership | Partly verified | Existing project/file/run/session/provider/cost and account denial assertions pass. No claim covering every endpoint or callback. |
| 5. Owner survives job boundary | Partly verified | Owner-bound durable restore/collision/concurrency tests pass. All worker/callback/injected-client boundaries not yet certified. |
| 6. Provider selection scoped | Partly verified | Own/foreign connection and Storage policy assertions pass; every OAuth/publishing/default-account selection not yet reviewed. |
| 7. CI executes isolation tests | PASS at retained SHA | Disposable CLI/Docker Auth/Postgres/Storage/API/browser, no hosted test credentials or production data. Must rerun current source. |
| 8. Fresh and upgrade migrations | PASS scoped at retained SHA | All 69 full-history files fresh and representative sanitized pre-upgrade/reapply. This is not actual staging or production catalog compatibility proof. |
| 9. Legitimate same-tenant journeys preserved | Scoped PASS; integrated-tree proof pending | Both builds and repeated aggregate regression passed at retained SHA. Local main integration passes 67 homepage tests; complete integrated regression must rerun. |
| 10. Zero unexplained service-role bypasses | FAIL / incomplete | Registry and explicit tenant context are implemented, not universal SDK query enforcement. Remaining semantic reviews, preview signature/header policies and redaction must pass. |

## Bounded changes in this continuation

Local merge commit `a1d4c7f96fda4fee75eef1b563e7477fe1e69c61` integrates main `6aa3963b972fbb22f45398d0e9b7cf17c74bef1e` without modifying main. Three conflicts were examined hunk-by-hunk: actual S02 import rename, main's updated script types and Workspace inputs, and the actual S01 ordering assertion. S00/S01/S02 V12 and main's later S03 are preserved. Nothing was released.

The existing live-preview gateway now checks durable owner/project/session agreement, finite grant/session expiry, HTTP declared port and safe provider-owned hostname components for BOTH HTTP and WebSocket resolution. The grant writer verifies the persisted owner/session/project before inserting. Its exact-ID lookup is a named internal exception; signed hostname validation precedes upstream resolution. This is an intentional application-preview capability, not public private-file delivery. Preview run association, signing-key fallback and forwarded-header/WebSocket lifecycle review remain open. Unit tests cover 17 allow/deny cases; one real Supabase case additionally covers grant creation and revocation. No actual runtime machine or external upstream was used.

Critical Git dependency path is `backend -> @cline/sdk@0.0.82 -> @cline/core@0.0.82 -> simple-git@3.36.0 -> @simple-git/argv-parser@1.1.1`. Latest SDK 0.0.93 still pins Git 3.36.0, so a blind SDK bump is not remediation. Narrow candidate overrides select Git 4.0.1 and parser 2.0.1 (MIT); Cline's execution SDK remains unchanged. This transitive major adjustment needs real SDK metadata compatibility, unsafe editor/config negative tests, complete build/type/regression and isolated CI. Audit zero-critical is not acceptance of an untested upgrade. Do not activate in production before gates pass.

## Dependency and source failures remain internal engineering work

`dependency-advisories.json` records ALL findings, exact lock paths/versions, primary advisory URLs, propagated effects and fixes for aggregate/front/backend graphs. Audits return exit 1 while findings exist; no waiver or major Tailwind/Next downgrade is applied. Full private-transcript and 243 earlier-alias semantic reconciliation remains pending; hash-verified research requirements never become runtime completion merely by mapping them.

## External safety gates

No real staging, R2 canary, production KMS, production migrations, credentials/configuration changes, cloud resources or spending. Disposable CI continues without a hosted project. Staging proposals remain plan-only: temporary four-hour environment conservative envelope $7; separated four-hour topology $9, before tax/account minimums and unverified CI quotas (see STAGING_COST_OPTIONS.md). Required approval/configuration remains separate; no owner action or secret value needed for current internal work.

Commands 008–010 remain NOT STARTED: full Command 007 prerequisites have not passed. Batch 1 remains NO-GO.
