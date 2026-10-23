# Phase 3 current-main reconciliation candidate

This is a review candidate, not Phase 3 acceptance or release authorization.

Parents are preserved Phase 3 `fb95f76bafc1b544b6655d435cddede260d9cd99` and independently fetched current main `3e343287c8f95f9d9e83fd282c6f58153ff3625b`. PR 803 and stacked PR 844 are not rewritten or merged. Phase 4 remains separate.

## Resolution decisions

- Keep main's current navigation, project-resume behavior, flat suggestion rows, compact composer identity and ten starter capability cards. No UI replacement or unrelated feature implementation.
- Combine main's empty-workspace composer visibility guard with Phase 3's owner/session/project-bound draft snapshot and synchronous flush before hiding. Remove the duplicate import introduced by the merge.
- Keep the shared crypto font definitions and main's current metadata/open-graph fields.
- Use main's WorkforceStage filename. The competing WorkforceSurface and WorkforceStage contents were identical. Keep one implementation and matching imports/tests, avoiding the case-insensitive workforce.ts collision.
- Reconcile source-shape tests with these actual controls. Preserve negative assertions for retired message deletion, duplicate navigation and empty-workspace hiding. Project-resume tests check missing-project rejection and resuming the latest conversation before starting a new task. SQL ownership tests ignore line comments so an explanatory tautology example is not mistaken for executable policy. The real parent-row ownership assertions remain.
- Generate the standalone frontend lock entry for main's already-declared exact @xyflow/react 12.12.0 and its required dependencies. No manifest dependency added, backend lock changed or audit-fix command used. Existing package versions must remain unchanged.

## Verified locally

Canonical Node 22.21.1 and npm 10.9.4. Frozen root npm ci succeeded, followed by existing reviewed compatibility/security patches. Initial full frontend run: 1,157 passed and 13 failed. These failures were preserved before reconciliation. Focused post-resolution run: all 131 tests in the nine affected files passed. Frontend TypeScript no-emit check, lint and production build with the canonical credential-free build environment passed. Warnings remain. Standalone frontend npm ci dry-run passed after lock reconciliation, which is not an actual standalone installation receipt.

No backend/security implementation, frozen criterion wording, historical receipt, original evaluator or live database was edited. Application backend tree remains the preserved Phase 3 tree. New source-bound CI is required before accepting this merge candidate. Existing main already has failed unit run 39963310990 and failed frontend build run 39963310817. Its build log reports missing @xyflow dependencies in the standalone lock, and its unit log reports five growth-suite failures. Those old runs do not certify this candidate.

## Managed-cloud proof and remaining gates

A separate founder-approved synthetic verification built the exact preserved Phase 3 backend and canonical vault/Google adapter into digest `sha256:a67e66a9932dbd68d50bced56ccb1a77e5f3a1246efcd5b5b4292cfc3403d5bb`. Six real Cloud Run executions passed bounded seal/open, binding/tamper denial, SQL fixture migration/recovery, unauthorized principal, actual key rotation, revoked access, disabled versions and post-expiry metadata ADC renewal. Protected redacted provider receipts and cleanup readbacks are retained separately. This is synthetic workload custody, not production cutover or full Supabase Auth/RLS parity.

Formal status remains B1_P3_BLOCKED. Production credential migration, release, DNS changes and Phase 4 admission remain unauthorized. The strict evaluator must not be changed to count synthetic proof as production custody/cutover. Keep applicable authenticated, disposable fresh/upgrade DB and staged security gates. No production URL or deployed candidate SHA is claimed.

## Rollback

This branch is isolated from both preserved PR branches. Reject the candidate or revert its reconciliation on a new review branch if required. Do not reset or force-push either preserved branch, remove Phase 4 work, reverse accepted historical migrations in a live database, or touch the existing release.
