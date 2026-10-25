# Phase 3 prerequisites, setup and founder dependency checklist

## A. Current resources — should be enough for independent development

- Existing GitHub repository `Xroga/xroga.com`, branch `codex/xroga-batch-01`, draft PR #803.
- Existing backend/frontend/SQL code, prior Command 007 TenantContext, verified disposable Supabase Auth/Postgres/Storage and GitHub Actions.
- Python for the included read-only preflight; code/tests use project's existing Node/TypeScript toolchain.
- Existing free disposable CI, existing crypto libraries (`node:crypto`), secure randomly generated CI test keys and refusing synthetic provider adapters.
- Original Commands 008/009 in `docs/xroga/research/inputs/batch-one-report.txt` and this package.

**No new subscription, extra API key or paid account is authorized.** First inspect actual package lock, deployment configuration and cloud permissions; do not invent entitlement.

## B. Founder-only external setup — not yet authorized

One real production encryption-key provider decision may be needed to certify production CredentialVault. Codex must produce **one** consolidated, evidence-grounded request specifying:

- Proposed actual KMS/provider **supported by Xroga's real deployed infrastructure**, not merely a roadmap proposal.
- Whether current account already has KMS/managed key service enabled.
- Resource region, key ring/key identity, rotation and retention policy.
- Application workload identity, least-privilege encrypt/decrypt/unwrap roles, audit logs.
- Secure access method across API/worker runtime; fail-closed behavior during outage.
- Free entitlement or **explicit published cost model/estimate**, if any; current authorized spending $0.
- Needed founder UI steps, MFA, billing acceptance, key provisioning and secret/recovery policy.
- Which tests prove provider-backed custody versus synthetic CI.
- How legacy encrypted records will be rewrapped without reading live secrets until approved.

Do **not** unilaterally provision key, enable paid billing, change production app configuration or touch live credentials. If this is the only gap, report `CODE_READY_KMS_CUTOVER_BLOCKED` and ask for an explicit separate decision.

## C. Production migration/cutover — separate founder authorization

Even with code complete, migration of live OAuth/BYOK/runtime secrets, deletions of legacy object mirrors, rotation of actual keys, real provider credential writes, production DNS, deploys and paid provider effects require independent approval. Do not confuse local dry-run with production cutover. Reconciliation and rollback evidence must be planned ahead.

## D. Immediate Codex preflight

Run included `validate_phase3_preflight.py`. If it reports original untracked frozen worklist absent, look in existing workspace/output attachments; do not stall or rewrite the original research. Use reconstructed worklist **supplementarily** and source original requirements directly. Commit Phase 3 planning files to branch only after review; do not modify the already accepted Phase 2 commit object.

## E. Scope separation

Original Command 010 (egress) is Phase 4 and unimplemented. Production schema parity, provider-backed R2, dependency advisories and hosting eligibility are separate unwaived release dependencies; record them, but do not use them to silently rewrite the original 22 Phase 3 criteria.
