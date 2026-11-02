# Response V2 rich Share and current-authority correction

Prepared November 2, 2026. PREPARATION ONLY, not yet approved, built or deployed.

Backend source `756c95e3ad484c3f9b949e837bacd98609dfe3e3`, branch `codex/response-completion-diagnostics-20261102`. Frontend source `994e1dab2c122616269c5bcf59b198f18dcbdd5d`, branch `codex/response-experience-v2-906`, draft PR #909. The previous approved f803 source is already deployed. This is a new exact-source decision, conditional on all required checks and authenticated Preview acceptance. No release approval is inferred from CI.

## Corrections to release

The existing Share endpoint and text column retain a bounded read-only V2 snapshot. Owner checks, explicit visibility, revocation, database schema and API path are unchanged. A compatible frontend validates and renders the snapshot, preserving original text, source ordering, diagrams and locally computed interactions. Legacy shares remain plain text. Malformed or oversized snapshots retain the complete text with an explicit notice. No tool execution, additional model request or new network destination is introduced.

The existing model request explicitly requires current tenant membership and permitted role/action rather than relying on stale JWT tenant claims. The existing completion review now flags the observed unsafe omission without rewriting the answer, automatically retrying or claiming universal factual validation. All model dispatch and accounting authority remain canonical.

Read-only inspection of the actual f803 production configuration on November 2 confirmed `XROGA_DISABLED_PROVIDERS=zhipu` already exists in the protected bundle. The planner ignored that existing restriction. This source fixes selection to honor the existing disabled-provider and allowed-model controls. No production credential, routing configuration, secret version, model registry or account permission changes are requested. Unknown prior GLM usage remains held. This repair prevents new planner selection of a disabled provider, it does not reconcile an old request.

## Exact production operations

Permit ONE source build in the existing Google Artifact Registry repository, immutable digest/source verification, one guarded zero-default-traffic candidate, and a paired cutover of existing `xroga-api` and Job/queue `xroga-canonical-production` in project `project-c40d4821-e647-4fa2-92d`, region `us-east4`.

Apply only SQL files `01-pause-current.sql`, `02-allow-response.sql`, `03-pause-response.sql` and `04-recover-current.sql` in this folder to the existing admission-fence singleton in Supabase `nzenxdfumxrnsmybazmo`. Preserve customer rows, financial history, schema, credentials and authority. Drain naturally, never force runs terminal. No mismatched API/Job source receives new work.

Maximum additional Google usage is $0.50 once and $0.10/month image retention, credits first. Maximum maintenance is 60 minutes. No new services, VM, IAM, DNS, minimum instances, paid API, subscription, top-up or model allowance. Remove only exact readiness Tasks and candidate tags after verification or recovery. Preserve all voice tags and the microphone. Existing source-pinned frontend release authorization remains conditional on checks and real acceptance. This package does not certify founder visual acceptance.

Immediate backend recovery is source `f803191cd7f04bc3539782aa71e212e37c0ce4fb`, revision `xroga-api-response-f80319-serving-1102`, image `sha256:09708ffde98bb350d0c9809faf46810ac8b31adabb11fb6a015a38263dd24fbc`. Preserve its Job export and older recovery assets. Frontend recovery must retain the new snapshot decoder while selecting the legacy renderer. An old frontend and old API cannot interpret new snapshots, although their underlying text is retained. Test the compatible fallback before allowing any new rich-share production write.

## One bounded acceptance amendment

The ORIGINAL combined model/research ceiling remains $0.50. Conservative current consumption is 3,552 micro-USD, comprising earlier settled 1,140, f803 settled 1,027 and the unresolved direct-Zhipu hold of 1,385. At most 496,448 micro-USD remains. Older unrelated unknown reservations and discrepancies also remain protected and may further restrict account availability. Do not release, settle, overwrite or mark any unknown usage zero.

The exact decision requested is to retain the unknown GLM hold conservatively and permit continuation with providers allowed by the existing production configuration. This specifically amends the preceding stop-on-uncertain-usage condition for that already identified, retained GLM reservation only. It does not authorize ignoring new uncertain accounting. No GLM login, new credential, top-up or financial-history SQL is requested.

Permit one additional corrected-source SaaS submission plus the three unrun distinct prompts: the $25 x 40 workshop calculator, one unrelated simple/code question, and one approved sourced-research question. Maximum six submissions total including the two historical SaaS submissions. This is the one specific exception to the previous no-manual-retry rule. No more retries if it fails. Each request and its existing planner/correction/fallback bounds must first fit the remaining allowance under canonical reservations. Stop on any new unknown accounting, provider failure, invalid output or failure to bound spend. No repeated paid search or second formatting-model call.

Use a new authenticated repository-free conversation. Verify SaaS graph direction, current-membership and server-side billing guidance, complete content order, authentic resource links, source metadata only when genuinely retrieved, workshop result $1,000, working sliders/reset, mobile viewports, save/reopen, Copy, private Share and revocation. Render and local control interactions must make zero extra model dispatches or provider reservations. Synthetic and captured-response checks do not count as fresh generated acceptance. A partial/invalid answer stays visibly partial and blocks the relevant promotion.

## Operator sequence and stop conditions

First pass all six exact backend gates and all eight frontend workflows, including integrated-candidate and the full isolated authenticated suite. Review the actual source SHA and current production target. No build before the specific approval. Record a fresh receipt from `RELEASE-APPROVAL-TEMPLATE.json`; do not copy any previous approved receipt. The scripts reject old source/package approvals.

Run `submit-build.py` once through the owned local runner. Inspect its journal before resubmitting anything. Run `verify-image.py`, `candidate.py`, `private-ready.py candidate`, then `cutover.py preflight`. The guarded candidate uses zero minimum instances, max one, request-based CPU and no startup reconciliation. The existing queue performs only the exact private readiness GET and its Task is removed in finally. No model or customer workload is submitted by these scripts.

Start the 60-minute deadline. Apply `01-pause-current.sql`, obtain a fresh closed/drained database receipt, then `cutover.py pause`, `serving`, `private-ready.py serving`, `job`, and `promote`. Verify actual immutable pair/readiness before `02-allow-response.sql`, fresh open-source receipt and `resume`. Preserve the serving capacity, service identity, network, secrets and microphone. A deadline, active job, stale receipt, source drift or nonpassing gate stops forward work.

If needed apply `03-pause-response.sql`, drain and refresh the fence receipt. Run `recover-job`, `recover-traffic`, verify the exact f803 pair and readiness, apply `04-recover-current.sql`, fresh source receipt and `recover-resume`. Recovery remains available after the forward deadline. Never revert only one pair member or delete recovery images. The known optional storage-housekeeping readiness warning is not certified resolved by this release.

## Evidence and current limits

The source fixes pass focused tests and source integrity locally. The original failed CI diagnoses were the Share JSX apostrophe and stale source/proof metadata, now corrected without editing any acceptance policy or test. Exact-source CI and authenticated Preview evidence are recorded separately. Operational guard tests run without contacting production. No claim of LIVE or finished product acceptance is made here.
