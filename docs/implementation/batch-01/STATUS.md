# Xroga OS Batch 01 implementation tracker

## Governing sources and scope

- Authoritative report: `Xroga OS Batch One — Backend Foundation, Security, and Execution Truth`, supplied as `Pasted text.txt` on 2026-10-13.
- SHA-256: `a0926f4e47149450c3f9fc33c59782eac31d19be57789f11950b20b03c01b499`.
- Repository: `https://github.com/Xroga/xroga.com`; default/production branch: `main`.
- Starting SHA: `3b2bad21561e8abcb9a4a3bd0e98a7241d0efc3d`; starting checkout clean.
- Implementation branch: `codex/xroga-batch-01`.
- User amendment: proceed using available report/code/documentation. Missing historical research remains `INACCESSIBLE_PENDING_EXPORT`; do not invent or claim reconciliation of the 119 feature rows or 72 missions. This deferred coverage does not prevent Commands 003–010 where their technical dependencies are satisfied.
- Execute and verify commands sequentially; commit each verified command. Merge/release only after final security, migration, CI, and GO/NO-GO gates. No production mutation during Commands 001–006. Commands 007–010 require isolated and staging verification before production rollout.

## Commands and gates

| Command | Scope and required proof | Dependencies | Status | Commit |
| --- | --- | --- | --- | --- |
| 001 | AST/import-aware repository truth; all routes/queues/migrations/named paths; classified placeholders; deterministic schema-valid regeneration; positive/negative inventory tests | Clean fetched default branch | VERIFIED (inventory; existing gaps recorded) | `a06f8cb9a2b167f41fcb4dfe5ea53582f5734097` |
| 002 | Available-source hashes, canonical ledger, dependency register, row/mission mapping where actually supplied, integrity/coverage validation | 001; user-approved deferred historical coverage | VERIFIED available-source implementation; original coverage DEFERRED | `c7230c815870ad3942f5f74ddf70c9ddff2ec988` |
| 003 | Frozen installation, explicit toolchain, fail-propagating aggregate baseline, skip/lockfile/migration validation, clean-run evidence | 001–002 | VERIFIED credential-free baseline; authenticated E2E separately BLOCKED | `9c4fc0a5fa64760c8dbf5dbc1d6a41f0856af3ab` (verified code) |
| 004 | Actual/configured/legacy/proposed topology; all env readers by name; runtime/dependency schema and unsafe-default checks | 001 and 003 | VERIFIED read-only inventory with recorded risks | `38b426d28b14082868362d46cb3d261610baa74e` (verified code) |
| 005 | Twelve golden journey contracts and executable existing journeys; explicit known gaps; negative auth/approval/evidence/recovery tests | 001–004 | VERIFIED harness; 12 full journeys BLOCKED_KNOWN_GAP | `48900380305fe23924f2610f888cb9478d35e033` (verified code) |
| 006 | Preserve and strengthen AGENTS; twelve invariants; structured mission policy, evidence/rollback/security gates and fixtures | 001–005 | IN PROGRESS | — |
| 007 | Canonical server tenant context, scoped privileged access, ownership/RLS, high-risk cross-tenant tests, fresh/upgrade DB and staging checks | 001–006; isolated/staging DB | NOT STARTED | — |
| 008 | One action authority API; durable identity/account/digest/expiry/replay/spend controls; adapter enforcement and migration checks | Verified 007 | NOT STARTED | — |
| 009 | Tenant-bound authenticated encryption/vault, PKCE TTL/one-use, rotation/revocation, safe legacy migration; actual production KMS and staged cutover | Verified 007–008; KMS and migration environments | NOT STARTED | — |
| 010 | Central consequential egress and URL guard; SSRF/redirect/DNS/injection/tenant/secret tests; no unexplained bypass; final GO/NO-GO | Verified 007–009 and topology | NOT STARTED | — |

## Command 005 checkpoint

Implementation checkpoint `f5eb888177690758ad83112755bcedc6c7d894ad` extends existing Node/tsx/Playwright, with twelve stable typed journey contracts and seven policy, twelve backend and four frontend boundary tests passing. Both type checks pass after fixing malformed fixture typing and the hoisted compiler invocation. Actual clean Windows built-app guest/reload + denied-founder SSR/RSC browser tests pass (2/2); a third narrow/reduced-motion safe-failure case is added. Aggregate 19-stage and dedicated golden CI are running, not yet final evidence. All twelve FULL journeys remain BLOCKED_KNOWN_GAP, zero PASS; component/stub/browser passes do not certify provider/backend product features.

Further audit corrects earlier discovery scope: inventory now includes browser suites/helpers outside src, and skip governance covers helpers under e2e/tests. The existing unchanged founder-session helper is manually registered against `c7230c8`; registered source sites are now 20, with zero new runtime skips and mandatory authenticated-browser CI still blocked/failing. No test assertion was removed or relaxed. Final Command 005 evidence and verification are pending before Command 006.

Command 005 final verification: code `48900380`, tested CI merge `de8069014a2cd98c35c0c754be837e79abab5c80`. Unit run 38410876836 passes twice all 19 stages: backend 2,729/front 991/guards 13/inventory-ledger-runtime-golden 41, zero failed/skipped, both builds/type/lint/SQL(67)/drift/dependencies/repeatability passing. Golden CI 38410876854 passes all three desktop/mobile/reduced-motion/reload/SSR-RSC guest browser tests plus boundary suites. Raw manifests retained. Full product journeys remain 12 BLOCKED_KNOWN_GAP / zero PASS; no real provider transaction or authenticated integration claimed. No production mutation. Proceed to 006 under the user's safe-work amendment.

## Command 001 checkpoint

The full report (2,910 lines) has been read. Default branch fetched; no production changes made. Actual manifests declare Next.js 15.5.21, React 18, Tailwind 3, Express 4.22.2, npm workspaces, Supabase, and BullMQ. Installed TypeScript versions differ across root/backend; Command 003 must reconcile actual locked/runtime versions rather than rely on old AGENTS text.

Initial findings requiring evidence in the truth map:

- Four BullMQ queue definitions; no `new Worker` production source found yet.
- `taskGraphRunner.ts` exists, but no production call to its exported runners was found; do not call it the active runtime based on its name.
- OAuth PKCE/provider token storage uses database fields and a storage mirror; encryption/expiry/one-use need later audit.
- Auth middleware returns some internal configuration/error text to callers; record now, repair in the applicable security command.
- Automations/Library pages explicitly present upcoming capabilities; they are not operational workflow/Drive systems.

Tests, changed files, acceptance evidence, and commits will be recorded as each gate completes. Final release is not yet authorized by passing gates.

Command 001 verification: inventory check passes with zero duplicate IDs and deterministic regeneration; nine inventory fixture tests pass. Source counts: 1,308 surfaces, 258 route registrations, 219 endpoint paths, four queues, 67 migrations, 14 workflows, 402 test files, and 351 classified markers (301 in reachable source). Changed files and full acceptance/rollback evidence: `docs/xroga/evidence/command-001/{summary.md,manifest.json}`. Static source reachability is not live behavior certification. No application source, database, production environment, credentials or architecture was changed.

## Command 002 checkpoint

Available-source ledger gate passes: 264 records (ten command specifications, 43 mandatory capability families, 211 historical repository-ledger records); 23 primary pinned repository metadata records; no new runtime dependencies. Eighteen combined validator/inventory tests pass. Source records were 1,534 at verification (1,527 available, seven inaccessible). Original coverage remains 0/119 and 0/72 supplied; 243 later owner assignments are explicitly deferred, not invented. Full evidence: `docs/xroga/evidence/command-002/{summary.md,manifest.json}`. Portable Git-canonical hashes and exact-byte attachment preservation were added. Proceed to Command 003 under the user's source-coverage amendment.

## Command 003 checkpoint

Toolchain selected from the existing API Docker pin: Node 22.21.1, npm 10.9.4; existing locked TypeScript 5.9.3. A shell-free npm CLI resolver, one fail-propagating baseline, lock integrity, AST skip/focus governance, and PostgreSQL WASM syntax/identifier checks are implemented. Fourteen existing platform/browser skip sites are individually registered; no runtime test was newly skipped. Existing unit CI is becoming the aggregate baseline; the Agent V2 lock workflow retains its dependency checks while automatic lock rewriting/main pushes are removed. PR migration verification is made secret-free; protected production migration steps are preserved. All Node setup workflows use the same runtime file.

Only new package so far: root dev-only `libpg-query@18.1.5` (MIT), with locked `@pgsql/types@18.0.0`; no runtime dependency versions upgraded. npm 10 rewrote some optional-package metadata in the standalone frontend lock; clean installs must verify that behavior. Installation audit reports existing advisories (root: 62, including six critical; frontend: 21, including one critical). These need runtime/admission classification and final security review; no automatic or force audit fix is authorized by this checkpoint.

Checkpoint commit: `eb71f668e3c20c06fae6048c74f349cc7148c2ea`; draft PR: https://github.com/Xroga/xroga.com/pull/803. All ten negative baseline tests and 67 SQL parser checks pass. Frozen installation succeeds in the developer checkout and first clean clone. API Docker and standalone frontend builds pass in CI, as do dependency locking, SQL, authority and growth checks. The aggregate first CI run correctly fails: 2,717 backend tests, 2,712 passed, five failed, zero skipped. Cause: existing local sandbox collector expects the image browser cache while the probe used the default CI cache. Fix under verification: one explicit test-only browser cache shared by install, probe and local executor; no product behavior or test assertions changed. The strengthened skip audit also discovers five existing shorthand `{ skip }` sites that the first audit missed; these will be reviewed/registered against the unchanged Command 002 SHA, bringing source sites to 19 without adding runtime skips.

The existing authenticated-browser job fails closed because isolated test variables/secrets are absent. Requested GitHub configuration: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_ISOLATED_PROJECT_REF. This is a release/integration blocker, not permission to use production fixtures. Main branch protection returned HTTP 404 / “Branch not protected”; rulesets returned an empty array. User-mandated security and verification gates still apply before merge.

User amendment: authenticated-browser verification is `BLOCKED_PENDING_TEST_CONFIGURATION`; continue safe credential-free work and subsequent satisfied prerequisites. Do not disable the job or claim its acceptance passed. Security-sensitive production merge/deployment remain blocked until authenticated E2E and staging security checks pass.

Further baseline findings: Linux run at `e9d6ba183ea56cbeb24ea9dae2fc1c872a4f05a0` passes all 2,717 backend tests with zero skips, then fails frontend type-checking on 27 pre-existing errors. Fixes under verification preserve all assertions: ES2018 compiler syntax target for existing dotAll regexes (noEmit), typed crawler-map values, and a semantic-execution fixture matching its current Goal Contract. Root lock contained backend TypeScript 6.0.3, dotenv 17.4.2 and Node types 26.0.1 outside declared ranges despite the standalone backend lock holding 5.9.3/16.6.1/22.20.1. Earlier attribution to only stale installed packages was incomplete. Restore/pin these existing standalone versions rather than broaden ranges or upgrade dependencies. A new installed-lock-index and direct-range checker rejects hidden dependency drift and fingerprints actual installed versions. Package-manager lock-only operations retained obsolete local records and briefly introduced an unintended backend self-link; those transient edits were removed before commit. Frozen installation must prove the repaired state. Windows runner also needed case-insensitive preservation of system `ComSpec`; its actual backend build succeeds after the correction.

Next: finish the first clean baseline, fix any actual failures, then execute the complete baseline twice at the final clean isolated SHA without developer environment files and obtain aggregate CI evidence. The tracked frontend public configuration is allowed only when all its keys are overridden by explicit fixture values. Fresh/upgrade DB execution and staging security validation remain separate mandatory gates for Commands 007–010.

Command 003 verification completed in Linux CI run https://github.com/Xroga/xroga.com/actions/runs/38389954256: two full 17-stage executions at tested PR merge SHA `6d4cfeb0392b131dcdfb08283a5dc02fa7ac9438`, branch code SHA `9c4fc0a5fa64760c8dbf5dbc1d6a41f0856af3ab`. Per run: backend 2,717/2,717, frontend 987/987, guards 12/12, inventory/ledger 18/18, zero failed/skipped; both builds/type checks, lint, SQL parser (67), drift and Agent resolution pass. Actual installed lock-index count 1,144/fingerprint, all three locks and suite counts match; tracked source unchanged. Raw manifests retained in Command 003 evidence. Other Docker/frontend, lock, migration, authority and growth CI pass. Authenticated E2E remains `BLOCKED_PENDING_TEST_CONFIGURATION`, not PASS. Windows supplemental repeat is running with 13 platform skips; completed Linux proof satisfies the clean baseline gate. No merge, production deploy or DB changes occurred. Proceed to Command 004.

## Command 004 checkpoint (read-only audit in progress)

Command 003 evidence commit: `f9d8f0aad68ee6acb37566c6ae5d428f7f7e43da`. Supplemental Windows clean clone (`Documents/Codex/2026-10-13/batch01-baseline-a`) also completed both 17-stage runs at `9c4fc0a5fa64760c8dbf5dbc1d6a41f0856af3ab`: backend 2,704 pass/13 existing platform skips out of 2,717; frontend 987 pass; guards 12; inventory/ledger 18. Both runs pass with identical Windows installed fingerprint `6a1268f42db2a5d900064897a7f46b488e88c47d0ca5321fbbfe182d995a08bc`, unchanged locks and source. Linux proof has zero skips; cross-OS optional package hashes legitimately differ.

New AST discovery code is implemented under `scripts/xroga/runtime-discovery.mjs` with seven passing fixture tests. It inspects production source, typed/default env parameters, scoped aliases, helper calls, documented aliases, dynamic bindings, credential-free URL host metadata and memory/filesystem candidates without copying values. Latest scan: 168 named readers/aliases and 21 dynamic bindings requiring explicit finite/catalog or caller-policy reconciliation; no malformed inferred names. Discovery is not yet the complete dependency inventory/runtime validator. Remaining Command 004 work: resolve bindings against MODELS/operatorConfigKeys, CODING_MODEL_TIERS, capability requiredCredentials, sandbox allowlist and caller-supplied safeConfigurationStatus; create full dependency schema/catalog, generated topology/secret-name docs, known-risk registry, validator/negative tests, CI integration and evidence. No application behavior is changed by this scanner.

Actual read-only observations on 2026-10-13 UTC:

- `https://xroga.com/api/release`: 200, release `3b2bad21561e8abcb9a4a3bd0e98a7241d0efc3d` (a first request failed, retry succeeded; no failure disguised).
- API `/health` and `/ready`: 200, ok/ready, release `41665b7f9a8e593c1d4d0ce42272c32f6ee7c6b2`; latest successful existing Fly deploy run https://github.com/Xroga/xroga.com/actions/runs/38135445708 matches. Backend/config tree comparison against starting main has no differences; frontend-only releases do not imply API stale code.
- Authenticated Supabase project metadata: canonical `nzenxdfumxrnsmybazmo`, ACTIVE_HEALTHY, ap-northeast-1; older `lztqfktsahpzitybthld` (“Xroga LOGIN”), INACTIVE, ap-southeast-1. Do not use that legacy project as an authorized test environment.
- Authenticated Vercel project `prj_OFS4CCMNe4dPFDpgdOtVUszg8vMv`, `xrogaai.com`, Next.js, configured Node 24.x; repository/CI/API image pin is 22.21.1. Hosting runtime/build drift requires explicit recording, not silent project mutation. The project tool wraps data in `result`; never dump its env payloads.
- Local Fly CLI has no access token; production metadata beyond public health and existing CI remains unverified. GitHub has a named FLY_API_TOKEN secret; this does not authorize retrieving its value.
- Production and Preview GitHub environments have no protection rules or branch restrictions; main has no branch protection/rulesets. User-mandated release gates remain mandatory despite absent platform enforcement.
- Last existing Fly sandbox verification run https://github.com/Xroga/xroga.com/actions/runs/37031296255 passed at `fc65cc3783cd307f180ee3e383d0d9859906a58f`; historical proof is not current sandbox liveness.

Important pre-existing findings to carry into security implementation: frontend public Supabase config hardcodes the production URL and ignores test URL env, so missing E2E configuration is not the only test-isolation prerequisite; preserve production pin and add an approved isolated-build contract during the security phase, never a client-side authorization bypass. OAuth/PKCE storage uses plaintext JSON in private `xroga-github-tokens` as well as DB fields; BYOK vault encryption exists in `userProviderKeys.ts`, so extend it rather than inventing a replacement. Production KMS is not yet proven. R2 storage may fall back to data URLs or `/tmp/xroga-media`; record durability risks. Four queue definitions still have no discovered consumers. Cloud Run/Jobs and Cloudflare Workers hosting remain proposed, not permission to migrate.

Only GitHub secret/variable NAMES were inspected; no values retrieved. Missing E2E names remain separately user-owned configuration work. No deploy, DNS change, key rotation, DB query/migration, paid provider call or payment change occurred in Command 004.

Command 004 runtime outputs/validator are implemented: 12 core definitions plus source-host/reference candidates (166 total records), 199 configuration NAMES, 21 reviewed dynamic bindings, all manifests, generated topology and exact source/config drift validation. Fifteen runtime tests pass with zero skips; a further unknown-expression fixture is added. Nine P1 risks are recorded, including process-only billing/quota/universal ledgers and missing/swallowed run persistence. This is not certification that every one of 669 static memory/filesystem candidates is a persistence fallback. Existing unit CI now includes the runtime gate (18 stages); final aggregate verification is pending. No production semantics were changed.

## External/deferred prerequisites

Command 004 final gate passes in CI run 38404145138 at branch `38b426d2` / tested merge `add9ee8937a4996712b24062e4a73fcd7bbbbf0b`: twice all 18 stages, backend 2,717/front 987/guards 12/inventory-ledger-runtime 34, zero failures/skips; builds/type/lint/SQL(67)/drift/dependency/repeatability all pass. Windows additional 46 focused tests pass. Nine P1 risks remain unwaived; this is read-only evidence consistency, not certification of every optional integration or semantic candidate. Raw manifests retained in Command 004 evidence. Proceed to 005; no production mutation or merge.

Command 004 first aggregate CI (`88c8e702`, run 38402382559) fails at requirements integrity, after 2,717 backend/987 frontend tests and both builds/type/lint pass. Its manifest was created after ledger generation, leaving a stale evidence path; regenerate with all evidence files present and verify the exact outputs. This is a real caught integrity failure, not an authenticated-test prerequisite, and must be fixed before marking 004 verified.

Fixed ledger integrity at `3f741308`; validator passes. Final audit adds guest Redis fallback/payment memory deduplication and actual BYOK derivation findings without values. Production memory-risk downgrade is now mechanically rejected; seven runtime fixtures pass. Regenerate current truth after all files exist, then run the exact aggregate CI gate before 004 completion. Missing isolated credentials remain a separate release blocker; no security test was bypassed.

The source ZIP, 119-item CSV, 72-mission Markdown/manifest, final research Markdown, and GitHub catalog were not found in the supplied attachment, Downloads, or Codex folders. Only an older frontend Command 3 document matched the filename search. User explicitly authorized deferred historical reconciliation.

Isolated/staging database availability, production KMS, and production migration/release approvals have not yet been verified. They must be inspected before the affected safety gates; no credentials or production secret values belong in this tracker.
