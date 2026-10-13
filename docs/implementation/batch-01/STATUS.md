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
| 001 | AST/import-aware repository truth; all routes/queues/migrations/named paths; classified placeholders; deterministic schema-valid regeneration; positive/negative inventory tests | Clean fetched default branch | VERIFIED (inventory; existing gaps recorded) | Recorded after commit |
| 002 | Available-source hashes, canonical ledger, dependency register, row/mission mapping where actually supplied, integrity/coverage validation | 001; user-approved deferred historical coverage | NOT STARTED | — |
| 003 | Frozen installation, explicit toolchain, fail-propagating aggregate baseline, skip/lockfile/migration validation, clean-run evidence | 001–002 | NOT STARTED | — |
| 004 | Actual/configured/legacy/proposed topology; all env readers by name; runtime/dependency schema and unsafe-default checks | 001 and 003 | NOT STARTED | — |
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

## External/deferred prerequisites

The source ZIP, 119-item CSV, 72-mission Markdown/manifest, final research Markdown, and GitHub catalog were not found in the supplied attachment, Downloads, or Codex folders. Only an older frontend Command 3 document matched the filename search. User explicitly authorized deferred historical reconciliation.

Isolated/staging database availability, production KMS, and production migration/release approvals have not yet been verified. They must be inspected before the affected safety gates; no credentials or production secret values belong in this tracker.
