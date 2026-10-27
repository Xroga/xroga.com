## Problem

Describe the user or operator problem this change addresses.

## Change

Describe the scoped implementation and what was intentionally left unchanged.

## Verification

- [ ] Focused tests passed
- [ ] Relevant full test/build checks passed
- [ ] Security and privacy boundaries were reviewed
- [ ] No secrets, private repositories, customer data or generated artifacts were committed
- [ ] Temporary resources cleaned on success/failure, required evidence retained, before/after disk measurements recorded for storage-heavy work

## External effects

List repository writes, deployments, migrations, package releases, outreach or other external actions. Write “none” when none occurred.

## Remaining blockers or owner decisions

List any release, licensing, permission or production decisions still required.

## Structured Xroga mission evidence

- Base SHA / requirement IDs / changed files:
- KEEP / EXTEND / REPLACE / DEPRECATE:
- Schema/migration impact, isolated fresh/upgrade and staged proof:
- Auth / tenant / approval / credentials / egress / cost / billing impact:
- Actual tests, negative cases, counts, failures/skips and tested SHA:
- New/replacement control-plane RFC (otherwise canonical integration decision):
- Rollout / approvals / rollback and data compatibility:
- Sanitized evidence / known gaps / external prerequisites:
- [ ] No fake completion: fixture PASS is not real provider work or deployed success
- Structured manifest / `node scripts/xroga/mission-check.mjs` result:

Full checklist: `docs/xroga/PR_EVIDENCE_TEMPLATE.md`. Never paste secret values, customer data or unredacted authenticated traces.
