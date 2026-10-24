# CODEX — START BATCH 1 PHASE 3 HERE

**FOUNDER AUTHORIZATION:** Begin Phase 3 coding and tests for original **Command 008** (10 acceptance criteria) and **Command 009** (12 acceptance criteria). Do NOT begin Phase 4; do NOT reopen the already verified Phase 2 by default.

## Required first actions (do them, not merely summarize them)

1. `git status --short && git rev-parse HEAD && git branch --show-current`. Preserve uncommitted changes. Work on branch `codex/xroga-batch-01`, existing draft PR #803. Accepted Phase 2 checkpoint is `a21a82029276d38d53c9e17c580a15f57b653fe3`.
2. Read complete original `COMMAND 008 —` and `COMMAND 009 —` sections in `docs/xroga/research/inputs/batch-one-report.txt`, preserving 22 exact original acceptance texts. **Never use this pack to override the original contract.**
3. Check for the pre-existing untracked `docs/xroga/batch-1/phases/PHASE-3-FROZEN-WORKLIST.json` and validator. Recover them if available and compare their 20 hash-bound interfaces. Do not fabricate previous hashes if files are absent.
4. Run `python docs/xroga/batch-1/phases/phase-3/validate_phase3_preflight.py --repo .`. Resolve actual missing repo-file/source problems, not by deleting criteria. The validator does not claim code security.
5. Read `PHASE-3-ENGINEERING-PLAYBOOK.md`, `PHASE-3-CODE-HOTSPOTS.md`, `PHASE-3-ACCEPTANCE-GATES.md`, and both CSV matrices. Commit these as reviewed Phase 3 guidance documents only after verifying contents. Do not overwrite the original frozen worklist.
6. Start real engineering: map reachable consequential-action effects and vault writer/consumer paths **once**, then implement shared fixes. Do not create duplicate execution/authority/vault systems.

## Execute with actual code and tests

**Command 008 implementation:** reuse `businessAction` digests/confirmations, Operations claim/approval/leases, existing permission mode, budget reservations and accounting. Make all enabled side-effect adapters pass canonical actor/tenant/account/target/digest/expiry/grant/risk/spend pre-effect enforcement. Persist exact effect receipts, no blind provider replay. Complete all 12 policy classes, including explicit fail-closed classes with no supported live adapter.

**Command 009 implementation:** reuse issued ownership, PKCE one-time epoch, connection tombstones, existing authenticated envelope and allowed adapters. Introduce canonical vault + CryptoProvider, versioned AEAD AAD-bound to owner/provider/account/type/record/scope; encryption before storage; migrate enabled writers/consumers; remove production fallback to service-role/JWT/dev keys; handle browser XOR/localStorage credentials with explicit user consent. Tests use ephemeral keys; production KMS is an honest external dependency until selected and verified.

## Finite engineering loop — one requirement at a time

For each of the 22 original criterion IDs: trace existing code and real consumers; identify exact missing invariant; implement **shared** minimal fix; run focused positive/negative tests; use actual disposable DB for transactions; record current SHA/test IDs/receipts; advance only when proof is valid. Do not label a criterion PASS based on a document. Do not invent more Phase 3 sub-phases or founder approval gates.

**Bounded retries:** after two failed attempts at a specific defect, identify root cause, try a distinct technical approach or continue another independent item. Do not run unchanged full CI repeatedly. Keep one durable progress register and review existing evidence before writing new tests.

**Integration:** run full branch + integrated regression at coherent implementation checkpoints, and at final source. Preserve Phase 2 tests; no production migration, live OAuth/Composio send/publish, paid AI calls or real customer data changes.

## Exact stop policy

- `B1_P3_VERIFIED` only if original008 **10/10** + original009 **12/12** actually pass, every enabled relevant caller is governed, final source-bound real tests pass, and any mandatory real production key custody/cutover required by original009 is actually verified.
- `CODE_READY_KMS_CUTOVER_BLOCKED` if code/tests complete but actual managed production key provider is UNSPECIFIED or not approved/verified. Provide exact founder action, cost if any, required permission, and continue all independent work. **Not** full production vault verification.
- `B1_P3_BLOCKED` for other precisely named original criteria not satisfied; provide exact file, defect, test and next fix—not another sprawling review.

After genuinely passing Phase 3, stop and prepare Phase 4 (Command 010) handoff. **Do not start Phase 4 without separate founder authorization.**

**Restrictions:** $0 extra, draft PR only, no merge/deploy/live changes/paid tool or provider action. Founder-only requests must be specific. This message is the Phase 3 authorization; no repeated questions for normal coding decisions.
