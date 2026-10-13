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
| 004 | Actual/configured/legacy/proposed topology; all env readers by name; runtime/dependency schema and unsafe-default checks | 001 and 003 | IN PROGRESS | — |
| 005 | Twelve golden journey contracts and executable existing journeys; explicit known gaps; negative auth/approval/evidence/recovery tests | 001–004 | NOT STARTED | — |
| 006 | Preserve and strengthen AGENTS; twelve invariants; structured mission policy, evidence/rollback/security gates and fixtures | 001–005 | NOT STARTED | — |
| 007 | Canonical server tenant context, scoped privileged access, ownership/RLS, high-risk cross-tenant tests, fresh/upgrade DB and staging checks | 001–006; isolated/staging DB | NOT STARTED | — |
| 008 | One action authority API; durable identity/account/digest/expiry/replay/spend controls; adapter enforcement and migration checks | Verified 007 | NOT STARTED | — |
| 009 | Tenant-bound authenticated encryption/vault, PKCE TTL/one-use, rotation/revocation, safe legacy migration; actual production KMS and staged cutover | Verified 007–008; KMS and migration environments | NOT STARTED | — |
| 010 | Central consequential egress and URL guard; SSRF/redirect/DNS/injection/tenant/secret tests; no unexplained bypass; final GO/NO-GO | Verified 007–009 and topology | NOT STARTED | — |

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

## External/deferred prerequisites

The source ZIP, 119-item CSV, 72-mission Markdown/manifest, final research Markdown, and GitHub catalog were not found in the supplied attachment, Downloads, or Codex folders. Only an older frontend Command 3 document matched the filename search. User explicitly authorized deferred historical reconciliation.

Isolated/staging database availability, production KMS, and production migration/release approvals have not yet been verified. They must be inspected before the affected safety gates; no credentials or production secret values belong in this tracker.
