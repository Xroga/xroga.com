# Governance re-binding for PR #922 (evidence summary)

Why: the branch integrates the Zurelay two-model and durable-pacing source with the live response V2 frontend, so 14 security-reviewed files differ from `main`. Reviews bound to a source hash must not be re-stamped blindly. Each record below was re-bound only after a check, and every change is stored inside the register entry (`reboundOnBranch`, `sourceFileReboundOnBranch`, `callReboundOnBranch`, `evidenceReboundOnBranch`, or `reviewedOnBranch`) and in `REBIND-REPORT.json`.

Method for persistence reviews (`caller-reviews.json`): each reviewed call is located in the `main` version, mapped to exactly one call in the branch file by enclosing function, kind, target and ordinal, and its whole call chain (including predicates) must be byte-identical. If the whole enclosing function is also byte-identical, the record is re-bound. If the function changed elsewhere, the diff was read by hand and a written review is stored with the record.

Results:
- Persistence reviews: 49 records re-bound (36 byte-identical, 13 with a manual diff review). One new scanner candidate in `parallelApproval.ts` (`Uint8Array.from(page.bytes)`) was added as `NOT_PERSISTENCE`. Tenant audit: PASS, 24 of 24 tests.
- Egress reviews: 10 re-bound (6 call hash unchanged; 4 with a manual review: three provider calls in `openaiCompat.ts` and one Parallel fetch in `parallelDispatch.ts`), 1 retired (the Gemini fetch no longer exists), 8 evidence hashes updated (one reworded marker). Strict check: 149 of 149 reviewed, none pending, no unresolved high-risk bypass, 3 of 3 tests.
- Credential usage inventory: regenerated. No consumer was added; one was removed (the Gemini key reader). 4 of 4 tests.
- Phase 2 decisions: 4 source hashes and 1 related-binding set re-bound with notes (files identical to `main` take `main`'s value).

Not covered by this change: the Phase 3 authority delta position continuations (`phase-three-authority-delta.json`) still reference caller ids that moved when source offsets shifted. They have no generator and need their own careful mapping, so the Phase 2 check (`scripts/xroga/phase-two.mjs --check`) still fails there. These registers certify progress, not tenant security.
