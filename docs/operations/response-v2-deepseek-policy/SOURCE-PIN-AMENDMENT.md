# Enforce the founder's disabled-GLM policy before the paired release

PREPARATION ONLY. This amendment is not an approval receipt and has not been deployed.

The founder approved source `756c95e3ad484c3f9b949e837bacd98609dfe3e3` and explicitly required no future GLM execution. That source fixes planner selection. A focused source trace found that guest fallback and repository summarization can still select GLM directly, bypassing ranking. The existing production protected configuration already has `XROGA_DISABLED_PROVIDERS=zhipu`. It must also be enforced at dispatch.

Separate draft PR [#912](https://github.com/Xroga/xroga.com/pull/912) adds that enforcement at source `bccd300a71454711154791ce5714c44d11b0d027`, branch `codex/deepseek-provider-policy-20261102`, directly on top of the approved backend source. The approved branch and source are unchanged. Only three runtime files change, plus one negative-test file and required current-source integrity metadata. No historical evidence, ledger row, reservation, credential or model identifier is deleted.

The guard uses the existing operator provider policy. It denies disabled providers before ordinary and Operations reservations, before credential resolution and immediately before every SDK HTTP attempt. This covers direct callers, cached clients and SDK retries. The existing terminal denial stops fallback from bypassing the rejection. It does not silently select another provider. DeepSeek remains the first planner route. No additional inference or formatting call is added.

## Exact decision requested

Replace only the pending backend source pin and admission-fence source from `756c95e3` to `bccd300a71454711154791ce5714c44d11b0d027`, conditional on all seven exact-source backend gates and the already-passing frontend gates. The seven include the integrated-candidate gate triggered by separate PR #912. Frontend remains `994e1dab2c122616269c5bcf59b198f18dcbdd5d` under its existing presentation release authorization.

Use the existing API, canonical Job/queue, registry, identities, secrets and networking. One build, one guarded zero-default-traffic candidate and one fenced paired cutover. No new service, VM, IAM, SQL schema, credential, subscription, routing configuration or paid API.

Apply only this folder's four reviewed singleton SQL operations in Supabase `nzenxdfumxrnsmybazmo`: `01-pause-current.sql`, `02-allow-response.sql`, and recovery-only `03-pause-response.sql`, `04-recover-current.sql`. The only forward-SQL difference from the approved packet is the new source SHA. The old-source guard remains f803. Drain naturally and do not force customer runs terminal.

This REPLACES the pending build/release within the SAME total $0.50 one-time Google ceiling, $0.10/month new image retention ceiling and 60-minute maintenance window. It does not add another allowance or another maintenance window. No Cloud Build was created by the failed local 756 upload. Its exact release tag was checked and returned an empty build list. The local failure was Windows MAX_PATH during SDK source packing, followed by cleanup of its open archive. The prepared launcher now submits a compressed exact Git archive directly, which the installed gcloud documents as supported. No speculative rebuild or resource experiment is needed.

The original $0.50 combined model/search ceiling and four remaining submissions are unchanged. Conservative prior consumption is 3,552 micro-USD, including the retained unknown GLM hold of 1,385. Remaining scope maximum is 496,448 micro-USD, subject to canonical account availability. No GLM request, top-up, automatic paid upgrade or extra manual retry is authorized. Stop on any new unknown usage, inability to bound spend, provider failure or invalid output.

Preserve f803 revision `xroga-api-response-f80319-serving-1102`, image `sha256:09708ffde98bb350d0c9809faf46810ac8b31adabb11fb6a015a38263dd24fbc`, its native-reference Job export, all older recovery assets and the microphone. Recovery to f803 restores its known missing provider guard. Stop paid acceptance after such recovery and explicitly report that limitation. Do not claim that old source enforces the new policy.

## Verification and execution

Local verification passed 74 focused tests, including actual SDK no-network denial, redirect protection, planner restriction, budget and source-binding regressions. Backend type check passed. The unchanged strict audit reports 150 reviewed, zero pending and zero unresolved high-risk candidates. Metadata refresh preserves original proof archives and original acceptance obligations. These are development results, not live acceptance.

Required CI is running on immutable source `bccd300a`. Do not build or apply SQL until the exact amendment is approved and all required checks pass. Start from a fresh `RELEASE-APPROVAL-TEMPLATE.json` receipt. Old package approval receipts are refused by the scripts.

The operational order and guarded recovery stay the same as the approved packet: `submit-build.py` once, `verify-image.py`, `candidate.py`, `private-ready.py candidate`, `cutover.py preflight`, start the 60-minute clock, `01-pause-current.sql`, fresh closed/drained receipt, `pause`, `serving`, private serving readiness, `job`, `promote`, pair/readiness verification, `02-allow-response.sql`, fresh open-source receipt, `resume`. Exact readiness Tasks are removed in finally. Temporary candidate tags are removed on promotion or recovery. Preserve source/recovery images and voice routing.

Only then use the four already-approved new-chat acceptance attempts. Report actual production outcomes and settled costs. Keep PR #909 and #912 draft until their respective gates and acceptance requirements pass.
