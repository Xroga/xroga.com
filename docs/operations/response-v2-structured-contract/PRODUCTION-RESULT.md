# Ordered response release and actual new-chat result

Recorded November 2, 2026 UTC, November 3 in Pakistan. The approved release completed. Full Response V2 product acceptance FAILED. PR #909 and stacked backend PR #914 remain draft. No additional paid acceptance submissions were made after the failure.

## Live release

| Item | Verified value |
| --- | --- |
| Backend source | `cd5541c6c887a11ba68aaf3cccfb78609f906167` |
| API revision | `xroga-api-response-cd5541-serving-1102`, 100% default traffic |
| API and canonical Job image | `sha256:70a2be6f9f8b2452e7e6505ff13f9d1c571899aca18f011e5bbacc731daef28d` |
| Canonical Job and queue | `xroga-canonical-production`, matched source/image, queue RUNNING |
| Google Build | `9d41fc0c-0ff5-4aa0-a186-633148c15431`, SUCCESS |
| Frontend source | `d86c8c44fae0777fb1e2a503bb316f7f314b196a` |
| Vercel production | `G7cvCHDqZJPZm9B4kYMB1LpRMAWe` |
| Immutable frontend URL | `https://xrogaai-1q82mjmd1-xrogas-projects.vercel.app` |
| Production domain | `https://xroga.com/workspace` |

All seven backend source checks and all nine required frontend checks passed. Exact check URLs and source IDs are retained in `final-source-ci.json` and `frontend-source-ci.json`. No failing workflow was rerun unchanged. A GitHub status watcher encountered a TLS timeout, then resumed bounded read-only polling. This did not restart CI.

Vercel's first exact-source Preview was skipped by the existing Ignore Build Step. The reviewed rebuild used cache with that step unchecked. Preview `7BGA23cKzRxXcYHKMpSHBp7v4KGY` returned exact source d86c8c44 before promotion. Both Preview and production `/api/release` identities were verified. No auth or MFA bypass was used.

## Cutover, safety and cleanup

Candidate `xroga-api-response-cd5541-check-1102` had startup guard enabled, minimum zero and maximum one instance, zero default traffic and private readiness HTTP 200. Its exact readiness Task was removed. The serving revision independently returned private readiness HTTP 200, and its exact Task was removed.

Only approved SQL 01 and 02 changed the existing admission-fence singleton. Admission was closed and zero nonterminal canonical deliveries were verified before queue pause or API/Job mutations. The Job was validated and updated, API/Job parity verified, then traffic switched, the new fence opened and queue resumed. Maintenance lasted 298.549327 seconds. No customer run was forced terminal.

Public `/health` and `/ready` returned HTTP 200 and source cd5541c6. Environment, database, storage and storage quota checks were OK. The existing `storage_reconcile_not_scheduled` housekeeping warning remains and is not represented as passing. Both microphone traffic tags were preserved. Candidate/check traffic tags were removed. No VM, service, IAM grant, credential, schema change or DNS change was introduced.

Immediate API/Job recovery remains source `7a1b4da064c643a02e60dd61369fa741bf481499`, revision `xroga-api-response-7a1b4d-serving-1102`, digest `sha256:e4a91c189f3a287472874a51889c3091dd39855ee3126df0ed92c9736226a23c`. Its native-reference Job configuration is retained privately. Frontend recovery is source `994e1dab2c122616269c5bcf59b198f18dcbdd5d`, deployment `GwPNLTadwd3XtJ1JpxrSu1Poqa1V`. Older bccd/f803 assets remain intact. Recovery uses SQL 03, natural drain, queue pause, `recover-job`, `recover-traffic`, parity/readiness verification, SQL 04 and `recover-resume`. Never open admission on a mixed pair. Recovery was prepared and verified by configuration and existing accepted evidence, not executed against current traffic for this check.

Seventeen completed local jobs had their logs and metadata copied and SHA-256 verified before removing only owned inactive temporary files. 17,000,567 logical temporary bytes were removed. Sources, recovery assets and personal files were preserved. No global Docker cleanup was performed.

## Genuine fresh production response

Chat `567d40a0-3c58-40ab-bacf-ec9f64fd39a5` was created at 18:58:43.817Z in a new empty authenticated conversation. It used the existing owned synthetic project with no repository or attachments. One user submission produced two existing-purpose DeepSeek requests, semantic planning and answer generation. No second formatting call, image generation or GLM dispatch occurred.

The original 10,037-character `xroga-response-json-v1` document contains six sections. All six were retained through the existing API, projected response, saved featureOutput and reopening. The real answer rendered seven connected nodes and seven edges, six component role cards and six workflow steps. It explains current membership checks, user-editable metadata, service-role/BYPASSRLS behavior, webhook deduplication, verified billing state and atomic effects or durable inbox processing. This does not certify all possible future model claims.

Copy produced 8,508 readable characters with the diagram relationships, workflow and RLS caveat, without raw UI protocol. Reopening preserved identical rendered text. The real owner-only Share page retained the six sections, seven nodes and seven edges. No public sharing was enabled. Desktop 1440x1000, tablet 1024x900 and mobile 390x844 had no page-width overflow. Mobile prose computed to 16px Inter, weight 400. Screenshots and the complete synthetic saved record are retained locally under `outputs/genome-review/cd5541-new-saas-*`.

Full acceptance nevertheless FAILED:

1. The semantic plan did not request a proposed data/schema table, and none was generated.
2. Tenant isolation remained prose, without the required tenant comparison cards.
3. Typed role cards have no authored URL field, and their renderer has no reviewed identity fallback. The actual answer rendered no official brand links. Existing Markdown resource enrichment does not cover this typed-card path.

This is an upstream semantic-coverage gap plus a typed-card integration gap. It is not a dropped-block, storage-loss or empty-completion failure. Shape completeness against the model-selected six-section plan cannot establish completeness against the founder's broader product contract. No missing schema, tenant facts, source citations or logos were fabricated to fill these gaps.

The approved stop condition was applied. The workshop calculator, sourced research and unrelated/simple new-chat prompts remain NOT TESTED on this release. Incremental HTTP/Workspace streaming was not independently established by this observation. Provider streaming and deterministic projection tests are separately evidenced. No full product acceptance or universal quality claim is made.

## Spending

OpenRouter generation metadata reports $0.0005005 for planning and $0.0012831 for the answer, totaling $0.0017836. The ledger conservatively settled 1,785 micro-USD. After Copy, Share, resize and reopen there were still exactly two reservations, both settled DeepSeek requests. Those presentation interactions made zero additional model reservations.

The original combined $0.50 allowance conservatively has $0.492420 remaining. The historical $0.001385 GLM hold remains pending and counted. It does not authorize any future GLM request or another manual SaaS retry.

Google Build ran from 18:46:28.159422935Z to 18:49:24.560832Z. The compressed image is 154,705,510 bytes. Actual Google billing is not yet verified. The approved $0.50 one-time Google and $0.10/month image ceilings are limits, not measured charges. No new infrastructure or spending allowance was added.

## Remaining release gate

Close semantic coverage and typed-card identity handling in reviewed source before proposing another corrected-source acceptance exception. Do not reuse this already-consumed one-attempt approval, silently promote a different backend SHA, or run the remaining three prompts after this failed gate. Keep the healthy current release, financial history, microphone and rollback intact. No new owner decision was requested for an unfinished correction.
