# Batch 1 development closure

Status: COMPLETE for development and integration. Production activation remains held by the founder.

Verified implementation: `ff4032ca02c4b233c2598724caf44ab04b91fb0f`, merged through [PR878](https://github.com/Xroga/xroga.com/pull/878). Historical PR844 is closed as superseded, and its branch and source checkpoint remain preserved. This documentation records an already verified implementation. It does not claim that its own enclosing documentation commit was the tested implementation.

Phase1, Phase2 and Phase3 retain their previously accepted checkpoints and evidence. Phase4 passes all twelve original development criteria. The original strict audit reports148 reviewed callers,0pending and0unresolved high-risk callers. Original137 reviews and11current-main caller traces are preserved.

Ten exact-source PR workflows, the real PostgreSQL/Chromium Builder compatibility run on identical application/test/build source, and all four automatic merged-main workflows passed. The source-equivalence receipt records the four generated documentation differences for the retained Builder run. Both merged-main baseline manifests are retained alongside the receipt.

## Original Phase4 development criteria

| Criterion | Original requirement | Development |
| --- | --- | --- |
| XB01-C010-AC01 | All arbitrary outbound URL callers are inventoried. | PASS |
| XB01-C010-AC02 | High-risk URL callers use central URL policy. | PASS |
| XB01-C010-AC03 | All consequential external data egress passes egressPolicy. | PASS |
| XB01-C010-AC04 | businessAction integrates authority + egress before provider execution. | PASS |
| XB01-C010-AC05 | Tool descriptions cannot create authority. | PASS |
| XB01-C010-AC06 | Malicious document/web/tool-output tests cannot override policy. | PASS |
| XB01-C010-AC07 | Loopback/private/link-local/metadata SSRF tests pass. | PASS |
| XB01-C010-AC08 | Redirect-to-private test passes. | PASS |
| XB01-C010-AC09 | Cross-tenant external upload test passes. | PASS |
| XB01-C010-AC10 | Credential-secret egress test passes. | PASS |
| XB01-C010-AC11 | Security decision evidence contains no raw credential. | PASS |
| XB01-C010-AC12 | audit-egress-callers reports zero unexplained high-risk bypasses. | PASS |

Development blockers: none. Backend4923passed with6governed skips, frontend1269passed, actual isolated database212passed, Builder353passed. No failed test or pending CI is represented as passing.

## Production boundary

Keep `deploy/PRODUCTION_ACTIVATION_HOLD.json` enabled. No new production feature, deployment, SQL, IAM or credential operation is authorized. Existing production acceptance from Phase3 and the Google migration remains preserved. This Phase4 source has not received live production acceptance. A future coordinated release needs pinned compatible API/Job/browser images, retained native Google KMS and recovery, any separately validated catalog delta, and authenticated production tenant, worker, Preview, cancellation, recovery and accounting verification.

## Resume rule

Batch1 development is closed. Do not restart its caller reviews, integration merge, CI or historical KMS experiments. Reopen a development item only for a demonstrated regression or an explicit new requirement. Batch1.5 and Batch2 activation remain outside Codex's Batch1 closure.

Machine-readable closure: `BATCH-1-DEVELOPMENT-CLOSURE.json`. Exact-source CI, manifests and criteria: `../evidence/command-010/development-closure-20261029/VERIFIED-IMPLEMENTATION-RECEIPT.json`. Historical current-state snapshots are retained in the same evidence folder.
