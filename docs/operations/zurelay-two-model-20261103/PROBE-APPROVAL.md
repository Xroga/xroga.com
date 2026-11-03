# One Zurelay compatibility probe, not a production cutover

PREPARATION ONLY. The credential setup was separately approved and completed. It authorizes no inference or deployment. This package needs a new specific owner decision after all seven backend checks pass.

## Exact source and resources

- Backend `3bed89e65411fea9376bce0da8aacd1bd8c72f92`, draft PR #915. Reuse this verified source without rebuilding it if its exact digest is already available. Otherwise build it once in the existing `us-east4` Cloud Build/Artifact Registry pathway.
- Create only temporary on-demand Cloud Run Job `xroga-zurelay-probe-1103` in project `project-c40d4821-e647-4fa2-92d`, region `us-east4`. One task, parallelism one, one CPU, 1 GiB memory, 120-second task timeout and zero task retries. No VM, minimum instance, API revision, queue or new service.
- Reuse the current canonical Job's existing private configuration, network, runtime identity and protected platform-config mount. Keep all values only in memory. Add only the already-approved `xroga_models_zurelay:1` secret reference to the temporary Job. No new IAM, KMS grant, key or secret version.
- `smoke.mjs` is the reviewed operator program embedded into the temporary Job's command. It does not run the canonical worker entry point, reconcile customer runs, consume the production queue, or start the API.
- A local probe would require exporting the production database configuration to the laptop. A new CI credential would add another trusted recipient. This short Job reuses the already-approved production runtime identity and protected configuration without either expansion. It has no idle execution charge after its single task ends. The Google ceiling includes the necessary source build, not just the few seconds of inference.
- Read only the ID, owner ID and repository binding of already-existing founder acceptance project `85730a9a-fca9-4eb8-aa89-4e9c6172e2c5`. Its current owner SHA-256 is pinned as `b176f6da5215efd572021fd19140e483df58bfe5e18bf1b755609e98dee201a3`, independently rechecked through a read-only metadata query. Refuse owner drift or an attached repository before establishing persisted-owner context. The existing tenant dispatcher independently rechecks the same project with an owner predicate before reservation and HTTP. Do not read or send customer prompt/history/files. No new user or project is created.

## One request, hard limits and receipts

Authorize one fixed synthetic JSON arithmetic request to `https://api.zurelay.com/v1/chat/completions`, model `deepseek-v4.1-flash-1017`. Maximum output 128 tokens, conservative input bound 1,024 tokens, reasoning off, no tools, search, attachments, Sonnet, alternatives, manual retry or formatting call. The existing canonical ledger and tenant SDK boundary must reserve once, validate exact request/response identity and usage, and settle the same reservation. The fixed new idempotency key is `d29e5edc-6cb2-4e55-b0bf-1bd589de0372`.

Request ceiling is 1,000 micro-USD, or $0.001, including the canonical minimum reservation. The existing provider key stays restricted to $0.01/day and month and one request/minute. Those key limits are an independent ceiling, not permission to consume their remainder. No subscription, top-up or auto-recharge is included. Preserve the old $0.038282 Kimi and $0.001385 GLM holds. Do not charge this probe against or release those historical reservations.

Maximum additional Google use is $0.50 total for the one build, short execution, logs and up to 72 hours of image retention, using existing credits first within the existing cash allocation. No recurring resource allowance is requested. Remove the new image after that retention period if it has not received a separate release/recovery authorization. Never remove recovery images, shared layers or existing source objects. Inspect exact build and image metadata instead of resubmitting an unknown build.

One 30-minute operator window starts only when prerequisites and the seven exact-source gates pass. The approval receipt needs an explicit expiry. No protected database backup, SQL file, schema change, admission-fence update, production traffic, frontend, microphone or canonical API/Job mutation is authorized.

## Execution and cleanup

1. Save this explicit owner decision as `PROBE-APPROVED.json` with the exact package/source, one request, $0.001 request cap, $0.50 Google cap and expiry. Existing generic or prior-source approvals must be refused.
2. `release_gates.py` independently checks all seven final-source gates. `submit-build.py` builds only the exact Git archive, journals before submission and refuses replay. `verify-image.py` checks Cloud Build provenance and the OCI source label and baked SHA without saving image environment values.
3. `probe_job.py` verifies current canonical recovery source/digest and identity, creates and starts the one temporary Job, and journals before either mutation. The Job derives the actor only from the exact hash-checked synthetic project owner, never a request body or operator-supplied user ID. An existing journal blocks another execution. No API traffic, canonical Job template or SQL file is changed.
4. Read only the exact execution's redacted `zurelayProbe` receipt. Independently compare the reservation/settlement and provider activity/charge. A success exit alone is not acceptance. Verify request ID, exact model, token counts, price version and actual provider debit. Preserve a conservative hold if usage is uncertain.
5. On success or handled failure, cancel any still-running exact probe execution, delete only this temporary Job and verify absence. Google's 120-second execution timeout bounds compute if the local controller is killed. A killed controller does not run `finally`, so the next operator checkpoint must verify absence. Retain financial evidence and image provenance.

Stop on first failure, changed source/configuration, owner mismatch, output mismatch, identity substitution, missing usage or charge discrepancy. No further inference or paid loop is permitted. The probe does not certify strict JSON-schema enforcement, streaming, Sonnet, founder MFA, Workspace response quality, or production migration. Those remain separate gates with a later exact-source release and bounded new-chat acceptance decision.
