# Zurelay two-model migration, development checkpoint

Status: IN PROGRESS. No production cutover or Zurelay inference has occurred.

The founder's November 3 guide supersedes earlier provider choices. The executable catalog contains only `deepseek_v4_1_flash_1017` and `claude_sonnet_5_5`, with external IDs `deepseek-v4.1-flash-1017` and `claude-sonnet-5-5` at `https://api.zurelay.com/v1/chat/completions`. The SDK fixes fallback off and rejects routed/substituted responses. Legacy financial identities and prices remain readable, without dispatch authority.

## Implemented development paths

- Canonical default routing, planner, chat, research synthesis, attachments, repair, SoftwareAgent, guest and Browser model adapters use the approved default. The planner makes one request with compact nonthinking output, without hedge or automatic correction. Parallel remains retrieval-only, not a second generative provider.
- Sonnet requires an exact canonical task spend permit, reason, scope, payload and ceiling. It has no automatic monthly entitlement or fallback. User-facing complex-task approval wiring is not yet verified and is not claimed live.
- Real SDK JSON and SSE parsers are tested with synthetic HTTP, including exact identity, provider trace, terminal usage, dropped streams, rotation, cancellation and uncertain-accounting holds. No key or provider balance was used.
- Terminal completion usage includes reasoning. Published cache-read rates are priced consistently between reservation settlement and usage receipts. Unexpected cache writes remain blocked. These are catalog-price usage estimates, not independently measured provider charges.
- Explicit requested formats supplement the existing semantic planner. Missing diagram, comparison and schema requirements cannot be satisfied by an unrelated role table. Original provider JSON and bounded coverage metadata persist through the existing Workspace envelope. Invalid/incomplete output remains partial. This is not a universal factual-accuracy certificate.
- Frontend persistence tests preserve the answer through reopen, Copy and Share without exposing private planning instructions. Legacy rendering is unchanged.

## Evidence and open gates

The owned local logs are retained under `.local-task-storage/jobs`. Credential-free focused groups have passed, including 99 policy/boundary tests and a later 55-test transport/accounting regression group. These counts overlap and are not a final exact-source CI total. Frontend type checking passed. A full legacy backend run timed out and exposed retired-provider fixtures. Those fixtures are being migrated without dropping their negative security cases. Canonical backend and frontend type checks pass. The final AI group has 1,404 passes, zero failures and seven existing Linux-only skips. A separate 88-test scaffold/browser/hardening group and six unchanged proof-integrity tests pass. The frontend response group has 109 passes and no skips. Strict egress is 149 reviewed, zero pending and zero unresolved high-risk bypasses. Runtime inventory and mission policy pass with their existing recorded risks. Exact-source clean-install CI and authenticated isolated acceptance remain open. OFFLINE-VERIFICATION.json binds the retained log hashes.

The production preflight receipt is `production-preflight.json`. It records serving API `xroga-api-response-cd5541-serving-1102`, canonical Job source `cd5541c6c887a11ba68aaf3cccfb78609f906167`, and digest `sha256:70a2be6f9f8b2452e7e6505ff13f9d1c571899aca18f011e5bbacc731daef28d`. The nonserving latest template is distinguished from live traffic. Voice tags, queue and recovery pair remain unchanged. Frontend baseline is deployment G7cvCHDqZJPZm9B4kYMB1LpRMAWe at d86c8c44fae0777fb1e2a503bb316f7f314b196a.

Existing secret `xroga_models_zurelay` was identified by metadata only. No secret value, key restrictions, account balance or provider usage was inspected. The guide requires separate specific authorization before credential binding, provider probes, new spending or production SQL/release. Earlier approvals for other exact sources do not cover this branch.

Historical Kimi reservation 6d33d7e6-e376-484d-95e0-10d50dae55f9 remains unknown at $0.038282. GLM reservation f91a8a7c-1309-49ca-afd9-7bfb259ba4db remains unknown at $0.001385. Neither was deleted, released or labelled paid/free. New model spending during this development work is $0. The prior conservative $0.452489 remainder does not authorize Zurelay tests.

## Resume and release

Review EXECUTION-PATHS.md and the source-bound packets. Complete exact-source clean-install CI and authenticated security gates. The historical broad tenant inventory has unresolved manual/structured obligations and is not certified by the narrower egress result. Prepare one reviewable source-pinned minimal probe package with secured credentials, model IDs, request/token/spend ceilings, cancellation and receipt requirements. Stop on any failed or uncertain provider probe. A separately approved paired API/Job and compatible frontend release is required before new-chat production acceptance. Retain current serving API/Job, frontend deployment, historical ledger and voice routing for rollback. Do not apply SQL, access protected backup data or change traffic from this development branch.

The current recovery image predates Zurelay. Preserve it, but do not reopen model admission onto historical providers during a new-policy rollback. A reviewed Zurelay-compatible recovery path is required before cutover. Sonnet task approval issuance and real provider behavior remain explicit open work. No new model allowance is inferred from an account balance.

## Wider CI correction

The first full clean-install backend CI run at 10d6f51d ran 5,284 tests with 63 failures, primarily retired-provider fixture selections. It also identified two synthesis loops that could traverse alternate model candidates. Those paths now retain only the canonical selected model. A separate focused correction group verifies no alternate purchase after outages, invalid protocols or truncated individual files. Existing source-preservation, cancellation, owner, accounting and real database assertions are retained. The real database fixtures now reject historical Kimi and unapproved Sonnet before reservation. See CI-CORRECTION-REVIEW.json. Corrected-source CI and authenticated isolated verification remain required, and the earlier passing checks are not relabelled as final-source acceptance.
