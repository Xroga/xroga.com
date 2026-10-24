# Change safety and rollback

Inspect branch/status/base, canonical callers and deployment before editing. Preserve unrelated work. Use bounded reviewable commits/PRs, frozen npm installs, actual versions and source/evidence hashes. Never force-push, reset user changes, bypass reviews/CI or suppress a failing test.

Schema changes require actual discovered tables, migration filename/order, fresh/upgrade isolated proof, staged rollout, orphan/remediation report before constraints, compatibility and rollback. Prefer expand/migrate/contract; do not delete unknown data or disable RLS. Production migration is not a normal fixture test.

High-risk changes require explicit rollback: reversible code/config entry point, prior verified release, data/schema compatibility and owner action when restoration is not automatic. A successful revert is not permission to destroy persisted data or discard legacy credentials. Vault migration retains old records until independently verified cutover and real managed key custody.

No production fixture users, customer data, unapproved emails/messages, payment behavior/new charges, DNS/hosting migration or external publishing. Use reviewed isolated accounts and bounded cleanup; do not infer authority from an available token or link. Evidence contains no tokens/cookies/private prompts/provider dumps. Failure diagnostics remain local/restricted and redacted; public errors are concise and actionable.

Continue safe independent work when external configuration blocks a gate. Record exact blockers and resumable checkpoints, never declare those gates passed. Merge/release remains blocked until every mandatory relevant gate actually passes.
