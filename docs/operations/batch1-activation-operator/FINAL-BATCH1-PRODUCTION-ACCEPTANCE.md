# Batch 1 production activation, October 31, 2026

Result: `PASS_BATCH1_ONLY_PRODUCTION_ACTIVATION`.

The approved Batch 1 API/Job pair is serving on Google Cloud. The production
source fence is installed, admission is open only for the deployed source, and
the canonical queue is running. The outstanding model-free production checks
passed. No Batch 1 activation blocker remains within the approved contract.
Claude's microphone work, frontend and voice routing were untouched. Batch 1.5,
2, 3 and 4 activation remains on hold. Browser Worker and Drive belong to Batch
1.5 and are excluded from this Batch 1 acceptance.

## Exact deployed release

| Item | Verified value |
| --- | --- |
| Project / region | `project-c40d4821-e647-4fa2-92d` / `us-east4` |
| Application source | `85f83e3f1dcbb057d4a28d8a696dae8396d45114` |
| Serving API revision | `xroga-api-batch1-85f-serving-1031`, default traffic 100% |
| API and canonical Job digest | `sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80` |
| Image repository | `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release` |
| Canonical Job / queue | `xroga-canonical-production` / `RUNNING` |
| Native identity | `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com` |
| Existing protected platform configuration | `xroga-platform-production:3` |
| Worker base image ID | `5308884476316794212` |
| Production database | Supabase `nzenxdfumxrnsmybazmo` |

The existing voice tags `voice-054d7ae4` and `voice-9f62bba5` remain. Temporary
verification tags and the old minimum-one serving tag were removed. The serving
API retains its existing min 1/max 1 allocation. No new recurring service, IAM,
DNS, frontend release or main merge was introduced by this cutover.

## Authorized cutover and safety

The founder approved the exact package at commit
`ca01136f77da1e930559159e1a08f437d0027652`. The immutable scope and SQL hashes
remain in `PRODUCTION-FENCE-AND-CUTOVER-APPROVAL.md`, with the approval recorded
in `CUTOVER-APPROVED-20261031.json`.

The restore-tested fence migration was applied, admission closed, old work
drained and the queue paused. The API and Job changed as a matched pair while
admission remained closed. Private serving readiness passed before traffic was
promoted. Only then was source85 allowed and the queue resumed. The admission
pause was approximately 22:28:50 to 22:33:38 UTC, within the 60-minute maintenance
limit. No customer work was force-completed or cancelled to satisfy the drain.
No historical migration replay or whole-database production restore occurred.

`paired-cutover-journal.jsonl`, `private-serving-readiness.json` and the gate
receipts preserve the sequence. The final gate permits only the exact source85
SHA. RLS is enabled, anon/authenticated cannot read the gate and service_role
cannot update it. The advisor's INFO notice about no client RLS policy is the
intended service-only deny behavior, not a reason to add a client policy.

Public `/health` and `/ready` returned HTTP 200 and source85 at 23:19:40 and
23:19:42 UTC. Certificate verification stayed enabled. See
`final-public-health.json` and `final-fence-access.json`.

## Live acceptance

The native Job execution `xroga-canonical-production-f4jz7` succeeded at
23:03:09 UTC, using the same deployed digest. Its operator fixture SHA-256 is
`7332bd25ff310e685c37e6fcb4ef3331ef5a8736004949d4441858fd7628d40f`.
The fixture was a per-execution override. The canonical Job template fingerprint
was unchanged by the test.

| Production check | Result and evidence |
| --- | --- |
| Native Google identity and managed KMS startup | PASS, `NATIVE_KMS_STARTUP_PASS` |
| Authenticated application read | PASS, signed-in production Library read the existing synthetic project after cutover |
| Unauthenticated execution | PASS, `/api/swarm/execute` returned 401 |
| Tenant and actor admission | PASS, fabricated/cloned actor and foreign project denied before dispatch |
| Durable claims and duplicate dispatch | PASS, native issued claim accepted, duplicate and fabricated claim denied |
| Private worker and saved ownership | PASS, allocated Google worker, persisted ownership, foreign owner denied |
| Preview HTTP and WebSocket | PASS, real production gateway HTTP 200 and WebSocket echo |
| Grant revocation | PASS, subsequent HTTP 410 and already-open WebSocket closed |
| Execution persistence and completion | PASS, durable deterministic completion recorded |
| Worker loss and recovery | PASS, actual child process killed with SIGKILL, fenced checkpoint recovered under a new authorized generation, exact file hash matched |
| Stale generation and cross-tenant checkpoint | PASS, stale writes and foreign checkpoint access denied |
| Cancellation and retry denial | PASS, wrong owner denied, authorized cancellation accepted, cancelled claim denied |
| Native Task delivery | PASS, real cancelled Task acknowledged with HTTP 204, removed without manual deletion and no new Job launched |
| Accounting | PASS, valid zero-cost receipt, idempotent replay, conflicting receipt denial and unknown-owner denial, all writes rolled back |
| Cleanup | PASS, both sequential temporary VM incarnations and their boot disks removed, no execution workers remain |

Detailed immutable events are in `model-free-fixture-events.json`, execution
state in `model-free-execution.json`, native routing/cleanup in
`final-native-verification.json` and accounting in
`accounting-rollback-receipt.json`. Recovery used explicit owner-revalidated
resumption after targeted known-worker reconciliation. This does not claim a
new automatic orphan-recovery behavior from later batches.

Two unsuccessful operator-fixture attempts are retained. The first stopped
before allocation because Node data-URL imports needed file URLs. The second
correctly rejected an unsupported fixture network-policy value and cleaned its
worker. The correction reused the canonical process's approved network policy.
Neither failure required a production image rebuild or weakening a security
control. One logical worker slot was used, with two sequential VM incarnations
and no simultaneous extra worker. Attempts and cleanup remain auditable.

## Frozen security acceptance and CI

The original accepted development/security evidence is reused, not regenerated
or rewritten. Phase 4 has 12/12 preserved source criteria. The integrated strict
audit has 148/148 reviewed callers, 0 pending and 0 unresolved high-risk bypasses.
The original auditor was unchanged. Its command remains
`node scripts/security/audit-egress-callers.mjs --require-complete`.
No new application caller was added by this operator release.

| Criterion | Preserved source result |
| --- | --- |
| AC01, outbound caller inventory | PASS |
| AC02, central URL policy on high-risk callers | PASS |
| AC03, consequential data-egress enforcement | PASS |
| AC04, authority and egress before business provider actions | PASS |
| AC05, tool descriptions cannot grant authority | PASS |
| AC06, malicious document/web/tool output cannot override policy | PASS |
| AC07, private/link-local/metadata SSRF denial | PASS |
| AC08, redirect-to-private denial | PASS |
| AC09, cross-tenant external-upload denial | PASS |
| AC10, credential/secret exfiltration denial | PASS |
| AC11, decision evidence without raw credentials | PASS |
| AC12, zero unexplained high-risk bypasses | PASS |

The JSON companion maps each original criterion to its preserved source-bound
evidence at the deployed commit. These are source regression results deployed
unchanged, not twelve newly repeated live external-provider experiments.
Batch 1 development integration remains `ff4032ca02c4b233c2598724caf44ab04b91fb0f`.

[Exact-source CI run 40898491952](https://github.com/Xroga/xroga.com/actions/runs/40898491952)
is successful on source85. Its unit job ran the canonical build/test/security
baseline twice and compared results. The PR-only integrated-candidate job was
skipped, not passed. Historical PR #882 is merged, but later-batch integration
head checks are not substituted for source85 checks. CI, images and accepted
audits were not unnecessarily rerun or rebuilt for this cutover.

## Protected recovery and operational handoff

Fresh encrypted recovery set:
`gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261030T220451Z/`.
The database object generation is `1793398370274989`, 13,125,031 encrypted bytes,
SHA-256 `5e97644e99532dce14d837812c1289c80700e32d9886dcac82208b12e73c0115`.
The set also retains encrypted private credential objects, roles, manifest,
legacy-key escrow and the KMS-wrapped backup key.

Independent retrieval, authentication and full restore passed in a verified
no-swap, network-isolated, tmpfs-only environment. The five exact SQL files,
both source transitions and exact original function rollback passed using the
restored non-superuser production role. Restore containers/tmpfs and temporary
downloaded ciphertext were cleaned. Customer plaintext was not saved to the
laptop. See `fresh-backup-and-fence-proof-20261031.json`.

Compatible cold recovery revision: `xroga-api-batch1-ca94-serving3`, image
`sha256:49505ef989f3c686ca443d2fa6a7265175e35d7a8440f75c6b0773e2d5862888`.
The exact old canonical Job template is retained in `ca94-job-recovery.json`.
Images, encrypted credentials, revisions, tombstones, KMS configuration and
recovery assets remain available. No legacy-only image was deployed.

Recovery order is mandatory: close admission with `cutover-pause.sql`, drain
nonterminal runs/deliveries and active native executions, pause queue, obtain a
fresh gate-closed receipt, restore matching ca94 Job and API while the fence
stays closed, verify readiness and parity, apply `cutover-allow-ca94.sql`, then
resume the queue. Never force customer rows terminal. Never run the function
rollback while work is active. A live traffic rollback drill was not performed.
The full restored-database recovery tests and retained known-good release are
the verified recovery evidence.

Future releases must preserve this fence and pair API/Job sources. Do not use
`--to-latest`, deploy unrelated main, restore an incompatible legacy image or
blindly re-enable old deployment workflows. Old gate receipts are expired
evidence and cannot authorize a new mutation.

## Costs and scope limits

Verification stayed within the approved $0.25 usage ceiling by estimate. Exact
settled cloud billing is not yet available. Model calls and model spend were
zero. The two sequential private e2-medium VM incarnations, 20 GB boot disks,
candidate verification Tasks and temporary traffic tags were cleaned. No new
recurring service or minimum-instance allocation was added. Protected recovery
storage and immutable images are intentionally retained.

Known model quality, insufficient provider balance and provider-output failures
remain separately tracked. This session proves deterministic infrastructure,
security and accounting behavior. It does not claim a successful paid-model
software-building task. No model router, prompt or intelligence redesign was
performed. No new user authorization is needed to close this approved Batch 1
activation. Later-batch production activation remains a separate decision.
