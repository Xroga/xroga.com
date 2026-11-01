# Response V2 paired release result

The founder approved the pinned bc6cbc43 package in this session. The historical approval document remains unchanged as the exact approved scope.

## Production state

- Backend source: bc6cbc434a800c8e7aa086afc1edbbee447294f0.
- Revision: xroga-api-response-bc6cbc-serving-1101, 100% default API traffic.
- Immutable digest: sha256:3fb9ce8f8fc9961679559dbb5d764355436d5b5dc0bb6f6ad12969896b3f3969.
- Canonical Job uses the same image and source. Admission fence permits that source and the queue resumed at 13:28:07 UTC.
- Maintenance began around 13:22 UTC and completed around 13:28 UTC. No active customer runs were forced terminal.
- Both temporary readiness tasks and candidate traffic tags were removed. Existing voice tags and route were preserved.
- ac8168 and 85f recovery assets remain retained. No database restore occurred.
- Frontend production remains 2547ca11. Preview 0f1da118 was not promoted.

## Acceptance

Six exact-source backend release checks passed. Frontend unit and integrated-candidate checks passed on 0f1da118, including the previously failing integrity and negative-fixture checks.

Both candidate and serving private readiness probes returned HTTP 200. Public readiness reported database, storage and quota checks OK. Its existing storage_housekeeping check still reports storage_reconcile_not_scheduled, so this is not an all-health-checks PASS.

The authenticated Preview uses https://api.xroga.com. One newly generated SaaS answer on the released backend failed product acceptance: ASCII architecture rather than a structured graph, and an unsafe recommendation to authorize tenants using user-editable raw_user_meta_data. No model retry was made.

Recorded ledger charges at 13:28:42 and 13:28:58 UTC were $0.000231 and $0.000592, total $0.000823. Google billing has not yet been reconciled. The approved $0.50 is a ceiling, not actual spending.

## Focused correction, not deployed

Branch codex/response-backend-release-20261101, correction f0b2beb1 removes contradictory guidance that required retrieved data even for conceptual architecture, provides a connected graph example, and explicitly forbids user-editable authorization claims. It distinguishes webhook event-ID deduplication from outbound request idempotency.

Two new prompt regressions failed before the correction. All 11 focused prompt tests passed afterward. This tests the guidance contract, not model compliance or factual correctness of future output. Exact-source unit workflow: https://github.com/Xroga/xroga.com/actions/runs/41311963051, started and not yet accepted in this receipt.

Official references checked: https://supabase.com/docs/guides/database/postgres/row-level-security and https://docs.stripe.com/webhooks.

## Remaining gates

New source requires final source-pinned CI, an amended paired-release scope because the approved SQL is pinned to bc6cbc43, and bounded real-response acceptance. Do not reuse old CI or silently change the approved fence source. Frontend promotion remains held. Research positive handoff, generated rich-answer compliance and final production acceptance remain unverified. Preserve the lost historical research receipt without rerunning its paid search.
