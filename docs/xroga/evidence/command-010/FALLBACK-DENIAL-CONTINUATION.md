# Terminal security denials across planner fallback

Preparatory work authorized by the 2026-10-24 overnight directive. Phase 3 production custody remains unresolved. This is neither Phase 4 admission nor Command 010 acceptance.

Baseline: 01fa0c340800345790f96b274b00d78a9a97369a on PR #844. No frontend implementation, frozen criterion, accepted historical receipt, security assertion or strict audit requirement changed.

## Reproduced gap and correction

The actual executeHedgedPlannerFallback called executeWithProviderFallback per route. The shared provider wrapper converted local model security denial into generic PROVIDER_UNAVAILABLE, so the outer planner could start a second route and discard denial identity. The regression test failed before correction with Every compatible planning route failed.

Preserve the original request denial across the shared wrapper. Recognize canonical TenantAccessError, AuthorityError, EgressDenied and stale execution binding failures. Preserve already-classified shared account capacity failure. The hedged planner records a terminal refusal, cancels active peers, refuses a newly started fallback after a known refusal, and does not replace the known refusal with a peer cancellation or success. Post-completion accounting refusal retains the same terminal behavior. The outer semantic planner preserves local security identity rather than replacing it with planner availability.

This does not undo provider bytes already dispatched by an earlier hedge. Every route must independently pass its current tenant/project/credential/reservation admission before sending. A successful peer that finishes before a later refusal cannot retroactively be withdrawn. This patch does not certify upstream provenance or all generic SDK callers.

The actual universal entrypoint already returns a blocked, unverified, non-mutating result when interpretation fails. A new execution test proves one denied interpretation performs zero commits and no alternate interpretation. It does not assert that every production interpreter caller has complete provenance.

## Actual checks

- Initial new security identity regression: failed before the code fix.
- Focused final suite: 57 passed, zero failed, skipped or cancelled. Files: semanticRequestPlanner.test.ts, providerRuntime.test.ts, tenantModelDispatch.test.ts, postCompletionAccounting.persistence.test.ts, universalEntrypoint.test.ts. Canonical safeTestEnvironment was used. Actual SDK/database protocols are intercepted synthetic fixtures, not live provider/database proof.
- New tests cover four local model denial codes, tenant/authority/egress refusal, stale execution, shared capacity, post-completion accounting, denial from either already-running hedge, legitimate provider-outage fallback and universal zero-commit refusal.
- Backend TypeScript checked locally. Final source-bound CI is recorded separately after push, not borrowed from the baseline.
- Inventory regenerated without exclusions or waived reviews. Counts remain 134 candidates, 14 reviewed, 120 pending and 65 high-risk pending candidates. This fix closes a concrete fallback defect, not any whole SDK caller disposition. Strict completion still fails.

Follow-up continuation now migrates semanticRequestPlanner from raw-user-ID reservation to the existing withTenantModelReservation. The authenticated /api/phase1/plan route passes requireTenantContext(req.tenantContext). The planner checks exact actor/user agreement before even the social fast path, snapshots request data while preserving the issued context, reserves the explicit platform account and passes the canonical exact-payload beforeDispatch callback to the real SDK. No new identity issuer, vault or ledger was added.

The actual planner/SDK test passes with one legitimate completion, one canonical reservation, one exact settlement and one atomic accounting receipt. Forged context, wrong owner and a foreign reservation produce zero additional provider sends. An invalid reservation cannot trigger another model/account. The combined budget/evidence/settlement/planner suite passed 15 tests, zero failed/skipped/cancelled. These are controlled protocol fixtures, not live provider or database execution.

Generic reservation admission failures and unverified release outcomes now retain a terminal PROVIDER_RESERVATION_DENIED code. Existing capacity and post-completion uncertain-accounting semantics remain distinct. Error messages/assertions and reservation/settlement validation were not removed.

The planning endpoint sends only request-supplied planning metadata and does not load repository files. A request-supplied repository name is not an owned-project grant. Actual repository/file provenance, every other generic SDK caller and SDK-internal provider image fetches remain unverified. Existing pipeline universal interpretation already uses withTenantModelReservation, but complete upstream data provenance remains separate work. Inventory dispositions and whole-criterion statuses are unchanged.

Final combined affected regression after both changes: 72 tests passed, zero failures, skips or cancellations across the nine files listed above. TypeScript passed after the caller migration. Canonical inventory, finite Phase2 register and requirements-source integrity checks passed after source metadata regeneration. The six historical mapped budget functions were compared byte-identically. Only their enclosing file binding was refreshed, with prior hash and scope retained. Original authoritative requirement text and requirement owners did not change.
