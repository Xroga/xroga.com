# PR evidence template

- Current base SHA and branch:
- Requirement IDs / bounded mission scope:
- Changed files:
- KEEP / EXTEND / REPLACE / DEPRECATE decisions:
- Schema/migration impact, installer order, staged fresh/upgrade proof and orphan/remediation:
- Auth and tenant impact:
- Approval / account-resource-action authority impact:
- Credential / key-management impact:
- Egress / untrusted-input impact:
- Cost / storage / billing impact:
- Canonical runtime integration; replacement/new control-plane RFC when applicable:
- Actual tests/commands, counts, failures/skips and evidence/SHA:
- Negative tests and isolated environment boundaries:
- Rollout / required approvals / kill switch:
- Rollback / schema-data compatibility:
- Known gaps and external prerequisites:
- No-fake-completion declaration: fixture/component PASS is not verified provider work; code, scoped verification and live release are distinct.
- Structured manifest in `docs/xroga/missions/` and `node scripts/xroga/mission-check.mjs` result:

Do not include environment values, private repositories, customer data, production logs or authenticated session traces. Link sanitized evidence, not secret payloads.
