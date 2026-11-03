# Proposed rate-limit amendment and one bounded acceptance recheck

NOT APPROVED. No key edit, second maintenance window or additional model request is authorized by this file. The completed first window and failed attempt must never be reset or relabelled.

## Observed failure and current production

The source-pinned release reached frontend `4830b424d32e0f30aac11901374dcb09c68b4e9a`, Vercel deployment `C5wPjib6H4yD1SNRmWfBqU2fiEhM`, and backend `76c158aaeecf82f524659454b7b3726b4d255679`. All seven backend and eight frontend exact-source checks passed. Both named backend revisions returned private HTTP 200 before promotion. None of those checks proved generated-answer acceptance.

The sole fresh SaaS submission completed one Zurelay DeepSeek call, `req_BuVn7BX9g8U8tSYAK6jYhcwi`, with 2,682 input and 780 output tokens. Canonical reservation `0e0b3d56-c1f6-421c-b5e3-339f0ba2a527` settled automatically at 175 micro-USD. At `2026-11-03T22:19:44.118054Z`, the follow-on chat call failed with `rate_limit_exceeded`: `429 Rate limit reached for this API key: 3 requests per minute.` No rich answer was produced. No manual model retry, later prompt or research request was submitted.

The provider dashboard does not expose a complete count of rejected requests. This evidence establishes the gateway rate-limit rejection, not why its counter reached three or that raising it will necessarily solve every compatibility requirement.

Recovery completed at `2026-11-03T22:28:04.135264Z`, within the original window. Current API and canonical Job use approved compatible source `3bed89e65411fea9376bce0da8aacd1bd8c72f92`, digest `sha256:b060ee406046c1e62f192bdd52d830225a9dd816f3c9f4202168fc6e6bead007`, revision `xroga-api-zurelay-3bed89-serving-1103`. The queue is running and public API health is HTTP 200. The frontend was restored to retained deployment `9YVdkEj6cnK38r6djSwsXzwSMHU5`, source `5c337e05fa0bf50de7ce161752709110b278a014`. Both microphone tags were preserved. All package-owned verification tags were removed. Recovery minimum instances are zero. No images or revisions were deleted. Recovery readiness is not a claim of fresh model-answer acceptance.

## Exact proposed decision

1. Change only the existing `xroga models` key's requests-per-minute setting from **3 to 6**. Preserve its $0.10 daily and $0.10 monthly limits, both exact allowed models, smart routing off, credential, expiry and all other settings. No purchase, top-up, extra key, IAM or subscription.
2. Reuse the existing source-verified backend image `sha256:83291696c4d1e87244965789f0d1707563b40090d7a04cacf87058f658f1a3f8` and already-built production-environment frontend deployment `C5wPjib6H4yD1SNRmWfBqU2fiEhM`. Application source and build inputs remain unchanged. No backend build, new service, VM or replacement scheduler is included.
3. Authorize the four guarded SQL files in this directory on Supabase `nzenxdfumxrnsmybazmo`. The starting fence source is now the verified `3bed89e6` recovery source, rather than retired `cd5541`. Close and drain, pause the existing queue, attach a temporary zero-traffic tag to the existing `76c158` revision, verify one private readiness GET with exact Task cleanup, match the existing canonical Job, deliberately promote the retained frontend, then switch API traffic and reopen admission only after parity checks. Preserve the `3bed89` recovery and `5c337e05` frontend rollback. No schema or customer/billing writes.
4. Permit **one additional exact SaaS prompt** in a new authenticated founder chat. Only if it fully passes may the five previously unrun prompts proceed: workshop calculator, approved sourced research, proposed workflow, simple conversation and explicitly approved read-only Sonnet analysis. The cumulative maxima become **seven chats and thirteen model HTTP attempts**, including the failed chat and conservatively counting its denied follow-on attempt. At most one retrieval remains. Stop at the first subsequent failure, partial answer, factual defect, unknown charge or accounting mismatch. No further manual retries or formatting-model requests.
5. Authorize **one new, separately recorded maintenance window**, maximum 60 minutes, after prerequisites and owner browser access are ready. Preparation expires **November 4 at 00:30 UTC**. The completed first window remains immutable. Do not overlap windows or extend one after it starts.

## Unchanged cumulative money and security limits

The original release's **$0.50 total Google allowance**, **$0.10/month image-retention allowance** and **$0.10 combined model/retrieval ceiling** remain cumulative. This requests no additional dollar allowance and no new build. All prior usage remains counted. Google invoice attribution is not independently available, so no zero-cost claim is made.

Conservatively counted model baseline is **188 micro-USD**, leaving at most **99,812 micro-USD** within the original acceptance subcap before any additional reservation. This consists of the 13-micro-USD account baseline plus the settled 175-micro-USD attempt. The two older direct request origins remain UNATTRIBUTED. Their priced account usage is counted without inventing customer settlements. Historical Kimi **38,282 micro-USD** and GLM **1,385 micro-USD** holds remain unchanged and separately counted against the original accounting ceiling.

Zurelay remains the sole future generative provider. Only `deepseek-v4.1-flash-1017` and selectively approved `claude-sonnet-5-5` are allowed. No GLM, Kimi, OpenRouter, silent escalation, SDK retry, credentials exposure, MFA bypass, microphone change or other-batch activation. An approval here would permit the bounded recheck, not certify product acceptance.

## Reviewable implementation

`RELEASE-APPROVAL-TEMPLATE.json` defaults to `approved: false`. No executed approval or old maintenance journal is copied into this directory. `cutover.py` accepts only the existing verified revisions and refuses creation when one is absent. Its preflight requires the current `3bed89` pair and no active execution. `private-ready.py` records intent before its one GET and removes its exact Task. `release_contract.py` requires the new package identity, cumulative ceilings, zero additional builds and RPM six. A single, explicitly approved `saas-rate-recheck` exception can reopen testing after the captured failure. It cannot certify the failed attempt as passed, replay the recheck or unlock later prompts until the recheck actually passes.
