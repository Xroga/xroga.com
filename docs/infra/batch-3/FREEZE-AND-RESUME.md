# Batch 3 status (resumed 2026-10-29)

The freeze of 2026-10-27 was lifted by the founder on 2026-10-29: development resumes, production activation stays paused. Draft PR #865 stays a draft. Nothing is merged, deployed, migrated or activated.

What changed since the freeze, and what is still open, is recorded in `CERTIFICATION.md` section 11. The original freeze notes follow, kept for history.

## Original freeze notes (2026-10-27)
Batch 3 development is frozen. Draft PR #865 stays a draft. Nothing is merged, deployed, migrated or activated. Resume only after Batch 1.5 and Batch 2 pass final acceptance.

## Checkpoint

- Branch `claude/batch3-existing-editor`, worktree `C:\Users\hp\xroga-b3`, base `main` at `5ada5db7`.
- Final code commit `ec5090e3`; documentation and registers after it. The freeze commit is the branch head. No uncommitted work exists.
- Working tree was clean at freeze.

## Completed (do not redo)

Phase 1 connection, ZIP import and code map; Phase 2 safe change execution, project-derived real tests, bounded repair, durable revisions, draft-PR delivery and export; Phase 3 workspace tab, workbench, stacked follow-ups, denied receipts, Golden A to L. Full evidence: `CERTIFICATION.md`, `TRACEABILITY.md`, `PHASE-1-COMPLETE.md`, `BATCH3-PHASE-2-COMPLETE.md`, `BATCH3-PHASE-3-COMPLETE.md`.

## Tests at freeze

Backend full suite 3,877 tests, 0 failed, 14 registered skips. Frontend full suite 1,196, 0 failed. Batch 3 own tests 159 backend and 14 frontend, all pass. CI on the PR had not reported.

## Known gaps and bugs (not fixed, by decision)

No real GitHub, model, Google-sandbox, browser or database run. Google-mode changes end unverified until a canonical run attempt is connected. Preview and browser verification not connected (Golden E blocked, H not run). Go tests never executed. UI not run in a live browser. No retention policy for old changes. Four migrations (`20261027000000` to `20261027030000`) are not applied anywhere.

## Exact resume point

1. Rebase or merge the branch onto the then-current `main` once Batch 1.5 and Batch 2 are on it. Expect conflicts only in generated registers (`docs/xroga/**`) and the reviewed-table list in `scripts/security/schema-catalog.mjs` (keep both sides, bump the pinned count in `schema-catalog.test.mjs`, regenerate registers once after the final code commit).
2. Connect execution to the Google runtime via a canonical run attempt per change (`backend/src/existingSource/change/production.ts`, `productionExecutionPort`), reusing whatever Batch 2 builds for project runs. This is the largest remaining item.
3. Connect Preview and browser verification through the `previewVerifier` hook in `change/toolHost.ts`.
4. Run live verification when a disposable GitHub account and a model budget are authorised.
5. Re-run `golden.test.ts` and the full suites, then request release authorisation.
