# Response V2 live acceptance, November 2

Status: PARTIAL. PR #909 remains OPEN and DRAFT. No frontend production promotion has been made from this checkpoint.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Approved source/image | Backend a2b972fcd50b2f6a431795e393e552aac26454a7, immutable digest 6d755ef8375c762c00848c9fee0702b1f2a87bc7c91b4c3da61840ccc7e08c66, build 2e5d4e50-b37d-4723-b13a-feba1fcd9b59 | PASS |
| Guarded readiness | Private readiness 200, min0/max1 candidate, startup reconciliation guard | PASS |
| API/Job paired release | xroga-api-response-a2b972-serving-1102 and canonical Job match, fence opened, queue RUNNING, 473 seconds maintenance | PASS |
| Existing voice and recovery | Both prior voice tags retained, 4500 and older recovery assets retained | PASS_CONFIGURATION, no new voice or restore test |
| New SaaS provider completion | One submission, planner plus answer, finish stop, 1,678 native answer tokens, zero reasoning tokens | PASS_COMPLETION |
| New SaaS diagram | Five nodes and five real connections emitted and shown in actual signed-in Workspace | PASS_RENDERING, not full product acceptance |
| Original rich-block reading positions | Serving frontend e8feb strips composition/sourceText, appending graph after narrative | FAIL_PRODUCTION, preserved candidate correction not promoted |
| SaaS factual guidance | Absolute false RLS bypass claim, stale JWT authority and Stripe metadata assumptions | FAIL, source correction prepared |
| Conceptual workflow | Model supplied completed/current statuses without execution evidence | FAIL, guidance/examples corrected, not retested live |
| Empty repository-free task | Explicit test project inherited prior MIKE selection on bootstrap | FAIL, frontend correction committed with focused positive/negative tests |
| Copy and private Share regression | Corrected Preview export retains exact identifiers and all five connections. No public share created | PASS_CANDIDATE, not production |
| New workshop calculator | Not submitted after the failed SaaS acceptance | NOT_TESTED |
| New research and unrelated code/simple answer | Not submitted, no paid search repeated | NOT_TESTED |
| Presentation-only inference | Existing render/export/local interactions do not call a formatting model | PASS_SOURCE_AND_ACCEPTED_REGRESSION, no extra dispatch observed |
| Mobile/desktop | Candidate saved-answer measurements recorded independently. New 1440px article uses Inter16/400 and graph width822. 390px prose/page width checked, graph absent in immediate lazy-load observation | PARTIAL, do not certify unobserved mobile graph |

The test was a NEW genuine generated answer, not a fixture. It is preserved privately with the exact prompt, payload, provider IDs and captures. Wrong guidance was not edited out or relabeled as passing. Reopening the same answer is only persistence/rendering evidence, not another new generation.

Measured model cost: planner $0.0002471 plus answer $0.000892 = $0.0011391. Xroga settled 1,140 micro-USD, the correct conservative rounding. Reserved micro-USD remained516543 and safetyHold0. The earlier unknown $0.001265 answer reservation and earlier4500 estimate discrepancy remain unreconciled and are not released or rewritten.

Google build time was131.09 seconds. Actual incremental Google charges are NOT yet established from billing, so the approved $0.50 ceiling is not presented as actual spend. No VM, new service, IAM, minimum instance, model top-up or subscription was added. The exact temporary readiness Tasks and two check tags were removed. Serving/recovery images remain intentionally retained.

The healthy backend is live. The improved frontend and subsequent narrow answer/context corrections are not certified LIVE. The next source-specific paired correction needs the standing exact-source fence/spending decision after gates pass. The original $0.50 model/research allowance is preserved, $0.001140 conservatively consumed. No second SaaS attempt is authorized merely by remaining balance because the preceding package prohibits manual retries.

Production frontend rollback remains deployment AesRbbThqvzgh2Y2Rgc34MfkdVXK, source e8feb297673c856b34034d30851e0c0ba82561ac. Backend immediate paired recovery is xroga-api-response-4500d0-serving-1102 and digest bb429763e6ac0c2791e31c88c3cb05dab70fb07ea8c417cfb3b552c23d7a6a7a. For the next correction, the current a2b972 pair becomes its immediate guarded recovery. No restore or disruptive rollback was performed solely to collect evidence.

Optional existing warning storage_reconcile_not_scheduled remains separately tracked. No new paid scheduler was created.
