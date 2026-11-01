# Command 010 preparatory engineering, October 23, 2026

Founder attachment 6d712e89-f0a1-4079-b46d-2c53ba462d85 explicitly permits isolated preparation while Phase 3 remains blocked. This is not formal Phase 4 admission or acceptance. Preserve the frozen handoff, original 12 texts, Phase 3 evaluator and all historical evidence unchanged.

Verified branch base: fb95f76bafc1b544b6655d435cddede260d9cd99, existing open draft PR803. Remote main observed at 33b49da563528f110c4a139a90cb257e0bcc26df. Work is isolated on codex/xroga-phase4-prep-20261023. Current-main integration has not yet been tested. The frozen handoff's 9869d6e7 source and running-CI statement are historical, not today's source status. No deployment topology or running production revision is inferred from a document.

| Dependency | Available proof/interface | Preparation allowed now | Remaining gate |
| --- | --- | --- | --- |
| Phase 2 tenant isolation | Accepted a21a8202, issued TenantContext and scoped persistence | Reuse contexts and add current-source negative tests | New callers require their own proof, not historical certification |
| Command 008 authority | enforce.ts, issued one-use permits, account/target/plan digests and durable revalidation | Integrate egress between exact permit checks and provider effect | No invented approval or second grant ledger |
| Command 009 vault | Canonical vault, startup, private consumers and production dev-key refusal | Assert no raw credential enters policy receipts or ordinary upload data | Real unattended managed-KMS custody and applicable cutover remain blocked |
| URL boundary | boundedPublicGet.ts already provides credential-free HTTPS, DNS pinning and bounded redirects/body/deadline | Verify, harden ambiguous URL parsing, migrate arbitrary GET adapters | Existing helper has no active callers at this base |
| Durable receipt store | Existing immutable production_audit_log, server-only grants and insert-subject admission | Add a fixed safe DTO adapter and fixture tests without a new event table | Real database receipt integration must be tested in disposable infrastructure |
| Formal Phase 4 and Batch 1 acceptance | Original 12 criteria and original Phase 3 gate | Local scoped results only | Phase 3 acceptance and founder admission still mandatory |

## Finite implementation sequence

1. Build the malicious instruction / synthetic secret / redirect denial slice, a redacted receipt and zero-effect tests.
2. Extend the existing URL helper rather than replace it, then migrate shared arbitrary GET callers with focused positive and SSRF tests.
3. Add deterministic classification/trust/egress decisions, reusing canonical permits. Integrate at the actual Composio dispatch after account readback and before permit consumption/provider execution.
4. Inventory executable network sinks using TypeScript AST, separately recording generated code, configured dependencies, pending review and high-risk bypasses. Never count an import or a review marker as semantic certification.
5. Run focused tests, backend type/build, frontend lint/type checks and relevant regressions once source stabilizes. Produce the original 12-row local evidence matrix and draft PR with unresolved obligations. Do not claim zero bypasses from an incomplete register.

No new schema, authority store, orchestrator, credential store, cloud resource, production request or paid scanner is planned. The existing audit table is a suitable candidate, so a migration is unnecessary unless actual schema tests demonstrate otherwise. Rollback is a bounded revert on this preparatory branch, never a deployment or reopening of historical security acceptance.
