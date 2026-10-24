# Phase 3 — immutable acceptance and honest stop gates

## Baseline

Phase 2 original Command 007 is accepted at `a21a82029276d38d53c9e17c580a15f57b653fe3`. Do not alter the accepted SHA, alter its evidence, or re-classify Command 007 from scratch. Phase 3 changes must preserve the applicable Phase 2 regression matrix.

## Command 008: ten original criteria (all mandatory)

1. **XB01-C008-AC01** — One canonical authority API exists.
2. **XB01-C008-AC02** — businessAction consequential writes use it.
3. **XB01-C008-AC03** — operationsEngine high-risk operations use it or a documented compatibility adapter.
4. **XB01-C008-AC04** — Grant binds tenant, user, action, target and digest.
5. **XB01-C008-AC05** — Replay tests pass.
6. **XB01-C008-AC06** — Mutation-after-confirmation tests pass.
7. **XB01-C008-AC07** — Expiry/revocation tests pass.
8. **XB01-C008-AC08** — Spend-bound tests pass.
9. **XB01-C008-AC09** — LLM text alone cannot create authority.
10. **XB01-C008-AC10** — Every canonical consequential action class has a policy entry.

**Independent final conditions:** exact canonical adapter inventory, server-issued grants, no enabled bypass, all 12 action classes with deterministic policies, grant+digest+account+recipient+amount+currency bindings, safe expiry/revocation/replay/concurrency, amount ceiling with durable reservation/settlement, refusal of model/document-only approval, positive legitimate workflows, recorded post-effect uncertain outcomes without blind replay. Real disposable DB tests for transactional behavior; synthetic stub result labeled as stub. Need source-bound evidence and fresh/integrated CI.

## Command 009: twelve original criteria (all mandatory)

1. **XB01-C009-AC01** — All newly stored OAuth/provider secrets use CredentialVault.
2. **XB01-C009-AC02** — No frontend endpoint returns raw secrets.
3. **XB01-C009-AC03** — No LLM/task prompt receives raw provider credential.
4. **XB01-C009-AC04** — Wrong-tenant retrieval test passes.
5. **XB01-C009-AC05** — Ciphertext tamper test passes.
6. **XB01-C009-AC06** — Rotation test passes.
7. **XB01-C009-AC07** — Revocation test passes.
8. **XB01-C009-AC08** — PKCE has TTL + one-time semantics.
9. **XB01-C009-AC09** — Legacy migration is idempotent.
10. **XB01-C009-AC10** — Production cannot use development crypto provider.
11. **XB01-C009-AC11** — Credential audit reports remaining direct storage callers.
12. **XB01-C009-AC12** — Remaining legacy callers are zero or explicitly blocked from production cutover.

**Independent final conditions:** full writer/reader inventory, newly saved enabled secrets encrypted through canonical vault; private backend consumer only; owner/provider/account/type/AAD tamper tests; key and credential rotation + revocation; one-use PKCE; idempotent legacy migration; browser-only user-consented import for XOR local records; canary absence; production refuses dev/auth-key fallback; no enabled uncutover direct writer. Relevant actual production key provider and custody verified if claiming complete live vault.

## Outcome status semantics

- `B1_P3_VERIFIED`: **008 10/10 + 009 12/12 genuinely verified**, including all applicable mandatory real key custody gates; exact source bound; no unsafe enabled adapter or legacy writer; final regression+CI green. Prepare Phase 4 handoff then STOP. No Phase 4 coding.
- `CODE_READY_KMS_CUTOVER_BLOCKED`: software and applicable test-mode criteria substantially verified, but actual production KMS/provider/cutover required by original Command 009 is unresolved. This is NOT complete Phase 3 or license to move to Phase 4 as if security is verified. Provide exact founder-only action and stop blocked portion after independent engineering finished.
- `B1_P3_BLOCKED`: other incomplete original criterion, with exact criterion ID, code path, trust gap, positive/negative missing test and fix. Continue autonomous independent engineering; do not declare PASS.

## Critical negative controls

No criteria rewrite, no green CI substituted for live proof, no fabricated provider receipts, no synthetic key labeled production KMS, no test-only fallback in production, no `confirmed=true` bypass, no fake disabled adapter closure, no unapproved production migration or spend, no skipping Phase 3 requirement to Batch1.5/Phase4.

## Evidence to produce

`docs/xroga/evidence/command-008/summary.md`, `manifest.json`; `docs/xroga/evidence/command-009/summary.md`, `manifest.json`; `docs/xroga/security/authority-model.md`, `action-risk-matrix.md`, `credential-model.md`, `credential-migration.md`; source SHA and integrated SHA; exact 22 status records, action adapter matrix, direct-credential caller list, actual migration filename(s) if any, positive/negative/concurrency test IDs, authenticated CI references, KMS/production unknowns.

**Don't use a self-referential commit hash in the committed report.** Reference immutable externally attested receipts as needed.
