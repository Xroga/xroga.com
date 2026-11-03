# Zurelay migration and response acceptance

PARTIAL. Development, credential setup and the specifically approved single nonstreaming DeepSeek JSON probe are verified. No production API/Job cutover, production SQL or new-chat acceptance occurred. The one-request probe authorization is exhausted.

## Live probe, completed November 3 at 14:42 UTC

One exact-source build `0306d700-a3db-4696-ba21-23bc60f3bfa5` produced verified digest `sha256:b060ee406046c1e62f192bdd52d830225a9dd816f3c9f4202168fc6e6bead007`. Source, OCI label, baked SHA, platform and immutable source archive provenance passed. Build duration was 164.215 seconds. The new 154,716,936-byte compressed image may be retained only until November 6 at 14:34:37 UTC unless separately authorized for release/recovery. Preserve all existing recovery images and shared layers.

Execution `xroga-zurelay-probe-1103-prcps` verified `25 * 40 = 1000` through the real tenant reservation and SDK boundaries. Request `req_gFEmpGJpXM9Ee1Jh7pALlxIr` used Zurelay model `deepseek-v4.1-flash-1017`, with 58 input tokens, eight output tokens and zero cache/reasoning tokens. Authenticated provider activity independently confirms HTTP 200, the same model/request/usage, 813 ms provider latency and a $0.0000027 debit. Ledger reservation `5c0b95bd-82f8-4576-bfe3-9ab88b5b5a4a` settled three micro-USD, the expected conservative integer rounding of 2.7 micro-USD. PROBE-LEDGER-RECONCILIATION.json and probe-receipt.json retain evidence. The private full native screenshot stays local at outputs/zurelay-provider-probe-charge.png.

The temporary Job was deleted, and independent HTTP 404 readback verifies absence. POST-PROBE-CLEANUP.json confirms serving API/Job source, digest and voice tags unchanged. No Sonnet, alternate model, tools, search, customer content or retry was used. This probe does not certify strict JSON-schema enforcement, streaming, Sonnet, founder UI/MFA or rich new-chat Workspace quality.

The initial registry preflight stopped before submission because this gcloud version emits the exact command-specific `Image not found.` error rather than `NOT_FOUND`. A narrow operator-only compatibility correction and two focused tests now accept only that exact absence error while denying permission, network and ambiguous failures. One actual build and one Job execution occurred, under the same window and caps. Application source did not change.

## Verified development source

Backend `3bed89e65411fea9376bce0da8aacd1bd8c72f92`, draft PR #915. Frontend `fa2d942da56c69f298e933ee1a5a476012a4b4ce`, draft PR #916. All seven required checks pass for each source, including authenticated isolated browser/database verification. FINAL-CI.json contains the exact check IDs and URLs. Backend clean-install baseline ran 5,284 tests, with 5,278 passes, zero failures and six recorded skips. The PR test snapshot and source have the same complete Git tree, independently verified in the evidence. The approved candidate image was built once in Google and used only by the now-deleted probe Job. No application CI was unnecessarily repeated.

The source restricts future model transport to Zurelay's two exact IDs, blocks retired destinations before reservation and HTTP, removes automatic alternate-model attempts, validates terminal model/trace/usage, and preserves uncertain outcomes. Versioned pricing uses the reviewed current provider pages, not an inferred account debit. Source-bound egress review is 149 reviewed, zero pending and zero unresolved high-risk candidates. Broader historical tenant obligations are not certified by that narrower count.

The existing semantic planner receives request-specific answer coverage. Separate schema, comparison and diagram requests cannot disappear behind an unrelated role table. Original JSON and bounded coverage survive persistence, reopening, Copy and Share. Local frontend regression covers rich rendering, citations, graphs, calculators and preservation. These are offline regressions, not fresh generated product acceptance.

Sonnet is safely gated by exact task/payload/cap authority. Automatic selection or a prompt reason alone cannot grant spending. User-facing complex-task approval issuance and durable resumption are still incomplete and must be finished and verified before claiming selective Sonnet availability. No Sonnet probe is proposed by this package.

## Approved custody, completed

The founder approved CREDENTIAL-SETUP-APPROVAL.md at backend source 3bed89e6. Existing key `xroga models` now allows only `deepseek-v4.1-flash-1017` and `claude-sonnet-5-5`, explicit smart routing off, $0.01/day, $0.01/month and one request/minute. Saved UI readback and masked screenshots are retained. This limit is initial verification custody, not a production model allowance.

Existing Google secret `xroga_models_zurelay:1` passed the approved in-memory format/masked-prefix check, without revealing or saving its value. Only `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com` received secret-specific Secret Accessor. The exact before/after IAM policies and rollback are in CREDENTIAL-SETUP-RECEIPT.json. No production secret reference was added. No new key, secret version or KMS permission was created.

## Probe approval and safeguards

PROBE-APPROVED.json records the founder's exact approval. The window began at 14:28:21 UTC and closed at 14:42:52 UTC. The one small DeepSeek JSON compatibility check used the existing tenant ledger/SDK and no customer data. Limits were one source-pinned build, one temporary 120-second on-demand Job with zero retries, $0.001 model use and $0.50 total Google use. Existing infrastructure and identity were reused. The synthetic project owner was hash-pinned before actor construction and rechecked by canonical tenant dispatch. No customer prompt, files or history were sent. This is an operator probe, not founder UI/MFA acceptance. Do not replay its idempotency key, extend its window or infer further requests are authorized.

The probe controller refuses missing/expired/wrong-source approvals, changed recovery configuration, duplicate journals, foreign ownership, unsafe image references and missing final CI. Its normal cleanup cancels the exact execution, deletes only the temporary Job and verifies absence. The platform bounds execution to 120 seconds if the controller is killed. A later checkpoint must verify cleanup after forced termination. Financial evidence is never deleted. Thirteen offline probe/operator tests pass. No permission to run the probe is inferred from the credential setup.

## Production and money

The current production-preflight.json records the actual serving API/Job and microphone traffic tags, distinguishing the nonserving latest template. The healthy retained serving baseline is cd5541, frontend d86c8c44. This migration has not changed their traffic. Do not claim the existing production backend already uses Zurelay.

Actual new provider debit is $0.0000027 for one request. Canonical ledger settlement is $0.000003 after integer upward rounding. Google build/execution charges are not yet available, so no exact Google bill or zero-cost claim is made. The $0.50 Google ceiling includes the one build, short execution, logs, cleanup and 72-hour candidate image retention. No recurring compute resource remains. Historical Kimi $0.038282 and GLM $0.001385 holds remain unresolved, conservatively counted and unchanged. No historical paid/free settlement was invented.

Remaining gates are unfinished Sonnet approval/resumption, Zurelay streaming and structured-response compatibility, a Zurelay-compatible recovery path, an exact-source paired release decision and real new-chat SaaS/workflow/calculator/research/simple-response acceptance with separately bounded spending. Production release, fresh generated response quality, streaming on Zurelay and user-visible Sonnet are NOT VERIFIED. Keep all development PRs draft and preserve the serving pair, microphone, legacy frontend and financial history. The completed probe grants no further inference or production-cutover permission.
