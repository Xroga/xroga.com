# Independent security review packet: the two remaining CI gates (2026-11-23, branch head after 87073cb49)

Nothing here is self-attested. The two CI jobs below fail because two security-frozen files differ from their reviewed bytes. A reviewer other than the author must decide; this packet is the minimum they need.

## Gate 1: `Unit tests` / "Verify frozen Phase 2 register" — RESOLVED on the branch by restoring reviewed bytes
- File: `backend/src/services/integrations/oauthPkceStore.ts`; frozen packet `B1-P2-d068943836963a9c`; reviewed SHA-256 `d0d00b074aee1a1c610abbe6dd2424f8b9f581c3c73f7780619317d69ce7fc96` (equals main).
- The branch carried commit `4ddf499b7` (4 lines): `if (!isPolicyProvider(provider)) requireLegacyCredentialMigrationWindow();` so a saved plugin permission choice loads. Resulting SHA-256 was `fb2837e0...ed3e0`.
- Done: file restored to the reviewed bytes (hash verified in the commit). Effect on this branch: saved permission choices fall back to "always ask" (safe failure).
- Reviewer action, only if the fix is wanted: review the 4-line diff (PR #997), approve, rebind `sourceSha256` in `docs/xroga/batch-1/phases/PHASE-2-REVIEW-DECISIONS.json` to `fb2837e03ed8fd00981da4bf29d422cc66a7a49c07d8fd89d01e5f5bd58ed3e0`, then re-apply `4ddf499b7`.
- Whether the "Unit tests" job now passes beyond this step is shown by the next CI run (the log could not be fetched when this was written).

## Gate 2: `Xroga tenant security fixtures` / "Bind audit inventory to the actual virtual merge" — OPEN, needs reviewer
- Error: `Stale or unknown caller review: backend/src/ai/resourceMeter.ts`.
- Record in `docs/xroga/security/caller-reviews.json` binds the file to SHA-256 `41d41394517529873968222975159e930630e672a03f7f6d786507d63cee1a3d` (the bytes of the merge base `2605a3b99`). The branch file is `a7052c1dcbc6eea80c1049639f813704072432f907a7c706620df413d0cf0f26`.
- Change (commit `5b5994cd2`, "record remote worker compute in the canonical resource ledger"), 2 lines:
  1. `measure(...)` gains an optional 4th parameter `describe?: (result) => string | undefined`.
  2. `ledger.settle(reservationId, units)` becomes `ledger.settle(reservationId, units, describe?.(result)?.slice(0, 256))`.
- What the reviewer must judge: the description is optional text (at most 256 chars) stored with the settlement; the units charged, the reservation, the cap and enforcement are unchanged (INV-07). It runs only when a caller passes `describe`. Callers: `backend/src/sandbox/meteredExecution.ts` and `repoRun.ts` (tests: `backend/src/sandbox/meteredExecution.test.ts`). Check that the description can never carry a secret or another tenant's data into the ledger, and that `ledger.settle` tolerates the third argument.
- Why it was not reverted: the same commit changes four more files (`localBrowser.ts`, `meteredExecution.ts`, `repoRun.ts`, tests) that depend on the new parameter; reverting only the frozen file would not compile. Reverting the whole feature is the other option and is the owner's decision.
- Reviewer action: approve or reject the 2-line diff; if approved, rebind the record's `sourceSha256` to `a7052c1dcbc6...0f26` and regenerate the register with `scripts/security/caller-reviews.mjs`.

## Gate 3 (same cause family): `Isolated Supabase authenticated browser verification`
- Failing step "Full migration history and sanitized upgrade compatibility": `'NOT_RUN' !== 'PASS'` from the audit record that Gate 2 prevents from binding. Re-check after Gate 2.

## Gate 4 (added 2026-11-23): Browser Automation output removed from the Workspace (owner decision)
- Owner decision: a browser task is run, shown and controlled only in the Xroga extension; the Workspace must print no task status, activity or result and start no task from its chat.
- Change (removal only, `frontend/src/components/browser/WorkspaceBrowserOperator.tsx`): `WorkspaceBrowserProgress` renders nothing; `isLocalChromeRequest` always returns false (so the chat bar's `/chrome` and "in my Chrome" branch no longer starts a run). The pairing card and the extension pairing/messaging code are unchanged. `tests/chrome-extension/operator.mjs` now asserts that the Workspace shows no "Browser task completed" / "Browser activity" text and that a `/chrome` message starts no run.
- Effect on governance: `node scripts/security/audit-egress-callers.mjs` reports `Egress review evidence drift:6631f0cfac960ae10cff` for this file (its egress review evidence is bound to the previous bytes). It is a removal of rendering and of one call path (`browserOperator.start`), no new egress. Reviewer action: confirm removal-only, rebind the egress review evidence `sha256` for this file, and regenerate `egress-callers.json`, `privileged-callers.json` and `caller-reviews.json`. I did not rebind them myself. The local run could not confirm the rest of the inventory because the local TypeScript differs from the repository's pinned version; CI is authoritative.
- Not run locally: the frontend build and `tests/chrome-extension/operator.mjs` (dependencies for them are not installed in this checkout).

## Gate 5 (added 2026-11-24): `backend/src/routes/localBrowser.ts` limits lifted (owner decision)
- Change: `MAX_TURN_REQUEST_BYTES` 96,000 to 1,200,000; zod `max_tokens` max 8,192 to 32,768; TURN_POLICY high 4,096/5,000 micros/100 s to 24,000/30,000/150 s, max 6,144/8,000/120 s to 32,000/34,000/200 s. Cost stays bounded: the per-request safety bound `PER_TURN_JOB_COST_MICROS` (36,000) is unchanged and above both ceilings; settlement and the turn fence are untouched. Request bodies stay under the global 10 MB parser limit.
- Reviewer action: confirm the bounds are acceptable for spend (a 200,000-token turn costs about 0.6 cent uncached at the provider's listed price), rebind the file's caller-review and egress records, regenerate the registers. Rollback is a one-line tag move (see handover addendum 21).
