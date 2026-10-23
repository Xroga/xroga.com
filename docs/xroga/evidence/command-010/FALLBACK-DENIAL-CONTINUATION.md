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

Remaining smallest next boundary: semanticRequestPlanner currently reserves by raw user ID. Its authenticated /api/phase1/plan caller must pass the issued context into canonical withTenantModelReservation and prove the real planner path's zero-byte refusal, current ownership and budget admission. Existing pipeline universal interpretation already uses withTenantModelReservation, but complete upstream data provenance remains separate work. Do not add another identity issuer, vault or reservation ledger.
