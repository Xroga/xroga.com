## Problem

Prepare the original Command 010 security boundary without bypassing blocked
Phase 3 managed-KMS custody or admitting Phase 4 to release.

## Change

Separate preparatory branch based on PR803 source
fb95f76bafc1b544b6655d435cddede260d9cd99. Reuse canonical authority, tenant,
private-file, CredentialVault and immutable audit interfaces. Add deterministic
egress/trust/classification decisions, safe receipt persistence, pinned upload,
selected actual GET caller migrations and Composio write enforcement.

Keep the frozen 12 criteria, Phase 3 evaluator and historical Phase 2/3 evidence
unchanged. The shared upload helper is not wired to every upload caller. The
complete current AST candidate register is not a blanket security certificate.

## Verification

- 52 focused security/regression tests passed without skips.
- Frontend: 1,155 passed, zero failures/skips.
- Backend clean harness: 3,158 collected, 3,145 passed, zero failed, 13 skipped.
- Local Chromium driver: all six tests passed without skips.
- Backend/frontend type checks, backend TS emit and frontend build passed.
  Frontend build retained warnings. Focused route/test lint passed.
- Mission policy, preserved Phase 2 finite register, unchanged handoff,
  current-source inventory and skip governance passed.
- Pinned Cline/Git/dependency checks passed. No new dependency.
- Strict egress completeness fails correctly: 132 candidates, 9 narrowly
  reviewed URL boundaries, 123 unresolved traces, 69 dynamic/SDK candidates.
  These are pending obligations, not 69 asserted exploits.

The first ad-hoc test commands had harness configuration errors. Corrections and
test-only DNS/socket/date fixture changes are explained in summary.md. No expiry
rule, existing assertion or security gate was weakened.

## External effects

Review branch push and draft PR only. No cloud resources, IAM changes, live
provider effects, migration, deployment, DNS, merge or spending.

## Remaining blockers or owner decisions

Formal Phase 4 admission waits for genuine Phase 3 acceptance. Remaining local
obligations are caller trace closure, consequential adapter/upload migration,
real disposable database receipt/concurrency proof and current-source provenance.
Read-only merge-tree against observed main
33b49da563528f110c4a139a90cb257e0bcc26df found an existing-history conflict in
WorkspaceLauncher.tsx outside the egress patch. This stacked PR does not claim
current-main integration compatibility. CI status must be read against its real
head and base, never copied from earlier Phase 3 workflows.

## Structured Xroga mission evidence

- Requirement XB01-C010, original AC01 through AC12 unchanged.
- KEEP canonical authority, vault and store. EXTEND transport and dispatch only.
- No schema change or live deployment. Mock transport evidence is labelled.
- Manifest: docs/xroga/missions/batch-1-phase-4-preparation.json.
- Detailed results: docs/xroga/evidence/command-010/manifest.json and summary.md.
- Release BLOCKED. No full product or all-Batch completion claim.
- Rollback: abandon/revert these preparatory commits before release. No data or
  credential rollback is needed because no live state changed.
