# Production canary and validation repair, November 17

This is a failed-canary record and repair evidence, not completed product acceptance.

## Exact release and rollback

Candidate `490e088a49a1a8330db5d02c7f665e551d7d784a` passed all eleven exact-source workflows. The production-settings Vercel artifact was `dpl_VwmbUVr8uUdBLfp2cGz73XexMDCV`. The API and canonical Job used image digest `sha256:e23921bfd4d206b53b89555265946b3aeb9b594b9d6a0b382ca6f4b8e42e6bb2`.

The matching frontend, API, Job and admission fence were promoted under the owner's standing rollout authorization. Both live release endpoints returned that exact source. The API retained internal/load-balancer ingress. No authentication, credentials, browser pairing, scheduler or schema settings changed.

The calculator canary failed its interaction requirement. The release was rolled back. Verified recovery is frontend `98c6e4253fb7765d75400ec8218ce9343a72e172`, Vercel `dpl_57Q7nf7xfAT3BjUazZksYQUi4hPW`, and API/Job/fence `0f170fdd4d9e0d5addc529f44ec0cd2f43a7612a`. Admission is open. Each fence switch checked that no canonical deliveries remained unsettled. Saved test conversations were preserved.

## Genuine authenticated Workspace observations

Both prompts were submitted once through the normal signed-in production composer. There were no model retries or formatting-only model calls.

| Prompt | Result | Provider receipts and settled cost |
| --- | --- | --- |
| Make a sortable table: Red 9.2, Green 1.15, Blue 12.8 seconds. | Completed native program. Ascending and descending controls preserved numeric values and units. The saved answer exists in owner-scoped cloud history. Extra explanatory content and a repeated opening title remain quality defects. | Planner `req_0eqxqCgIutIccKohzrrc7Ids`, 110 micro-USD. Answer `req_L2hQnZeb39dUtgE2tPncZnZ2`, 572 micro-USD. |
| Build an interactive compound-interest calculator with principal, interest rate and years. | Failed interaction acceptance. The readable answer survived. The native program was rejected and correctly marked partial in storage, but the displayed fallback did not clearly identify the missing calculator. | Planner `req_i5R1XjrVVu4arm6l3IshzcPD`, 44 micro-USD. Answer `req_QqyfsVorilUplwlVTtYE38KT`, 1,837 micro-USD. |

Total settled provider cost was 2,563 micro-USD, or $0.002563. Both answer requests used `deepseek_v4_1_flash_1017` through the existing Zurelay integration. The calculator answer used 14,778 output tokens, including 12,299 reasoning tokens. Its reservation-to-settlement interval was about 89 seconds. This is ledger timing, not a measured first-token latency.

The calculator diagnostic reported `authority / budget`, statement 19, program length 7,497, followed by missing `calculator`. Its first twelve statement shapes were retained without customer literals. The rejected program itself was not retained, so an exact replay of that lost program is unavailable. Do not describe a synthetic reproduction as a replay of this model response.

## Focused repair

The validator previously spent one 6,000-node allowance across all declarations. Root traversal expanded shared references, then later declarations expanded those references again. A deterministic 31-year forecast reproduces that cumulative-audit rejection. With a separate allowance per declaration it passes. The same 6,000-node expanded-expression bound, depth bound, statement bound, cycle checks, schema checks, authorization checks and data checks remain. Unreachable declarations are still audited. This changes the maximum aggregate audit work to at most 96 bounded declarations, not the allowed complexity of an individual evaluated expression.

The new diagnostic identifies node exhaustion versus depth exhaustion and includes the failing statement's redacted shape even after statement twelve. No prompt text, identifier values, source strings or credentials are logged.

A missing requested calculator now produces a specific readable notice while preserving the complete available answer. A leading Markdown heading that repeats a visible native Title is collapsed only when its content matches, allowing colon versus spaced dash heading separators. Distinct text, code, links and citations remain visible. The plain-text fallback retains its heading.

Private-run review also found a separate deadline mismatch. Both the SDK and wire used 180 seconds despite the existing canonical generation budget allowing 300 seconds. Their timeout now derives from that budget with a ten-second margin. The private staging bridge allows 420 seconds for generation, confirmed retrieval and settlement. The prepared temporary services allow 600 seconds. The current production API already allows 3,600 seconds, so it needs no timeout configuration change. Caller cancellation still applies immediately, retries remain disabled, and text still requires a verified receipt and canonical settlement before publication. Forty model transport/builder regressions and the hosted bridge regressions passed after this change. This static mismatch was found before another hosted build or inference, not inferred from a new paid timeout.

## Verification and remaining gates

- A baseline comparison reproduced the cumulative-audit rejection and verified the corrected validator on the same synthetic program. Oversized individual expansions and cyclic references still fail.
- All 96 native backend, calculation and answer-coverage regressions passed.
- All 1,572 frontend tests passed. Frontend TypeScript checking passed.
- Credential-free Chrome regression passed 43 scenarios at five widths in both themes, plus 200% reflow checks. The 390px opening-title screenshot was visually reviewed. These are renderer regressions, not authenticated model acceptance.
- New exact-source CI, private hosted verification, a fresh relevant model-generation check and a successful production canary remain required. These local results do not establish live calculator acceptance.
- Search approval readability passed a controlled five-width browser test on the failed candidate. No fresh Search dispatch or source-provenance acceptance was completed in this canary.
- Guest admission remains independently blocked by unavailable shared Redis configuration. No in-memory accounting bypass or disabled credential was enabled.

The recovery pair is available. Completion for every user or every possible prompt has not been verified.

## November 18 hosted follow-up and focused repairs

All eleven workflows passed for `0d5a5e9345db4017dff023badb1cd6c668bf3495`. The exact preview was Ready. The private authenticated Workspace passed IAM invocation, owner/outsider/guest isolation, and provider-disabled persistence, Copy, Share, revocation and Reopen of the labeled synthetic forecast. Two earlier harness interruptions consumed no model calls. All three private windows were closed with runtime resources and grants removed and dedicated keys scheduled for destruction. No production promotion occurred.

The one fresh compound-interest prompt completed in 89.293 seconds. Planner `req_eivrEjriMBqrNSqbTKqIF4fm` settled 108 micro-USD. Answer `req_P8RP7PyyCanF7X4uhHdwJtZ0` settled 1,922 micro-USD, including 7,599 input and 14,113 output tokens. The existing model produced a valid interactive program without a second formatting model. Controls, calculated totals, chart and comparison updated correctly in four independently checked states. Total settled usage was $0.002030. The second planned prompt was withheld after quality review failed.

The actual answer revealed these defects:

- The fallback projection resolved table rows but not a calculated column heading, preventing duplicate reconciliation. Headings now use the same pure initial evaluator as rows. Failed evaluation cannot fabricate blank headings.
- An interest metric incorrectly described total balance as a principal multiple. A bounded deterministic review removes an explicitly contradictory ratio only when its USD principal, labeled result and amount are unambiguous. It retains the valid calculator and complete corrected readable answer. Distinct examples, qualified balance claims and currency conversions are not inferred. Model instructions also explain the distinction.
- A review notice before the native Markdown document prevented exact duplicate reconciliation. Complete verbatim documents can now be reconciled at paragraph boundaries while preserving the notice and distinct surrounding content.
- Financial chart data displayed long binary floating-point values. The existing registered currency formatter now formats display cells. Raw values, matching keys and calculations retain their precision.
- Reopening history inserted its historical sent prompt into the composer. Restoration now keeps only a current, owner/session/project-scoped unsent draft when restoring the active chat. Opening another conversation starts with an empty composer.
- The calculator appeared after a long explanation. Existing prompt guidance now asks for requested interactive controls and primary results before lengthy background, subject to the user's requested order.

The captured provider answer was preserved and replayed after correction without new inference. This is a controlled replay of a genuine response, not fresh generation acceptance. Chrome passed 44 scenarios at five widths in both themes, with zero reported accessibility violations and representative 200% reflow checks. All 1,575 frontend regressions and 98 focused backend regressions passed. Fresh exact-source CI, hosted generation and production acceptance remain required.

The fresh answer's first Copy assertion stopped on Windows CRLF versus LF. Content loss was not established. Fresh-answer Share and Reopen were therefore not completed in that window, despite passing on the separate synthetic replay. The harness must normalize clipboard line endings and must not treat copied historical receipt files as current evidence.

## November 18 composed-expression rejection

All eleven workflows passed for `cd71eac345f175c02b1455fc4b8e2fcb237b4f79`. Its private provider-disabled replay passed captured calculator controls, Copy, owner-only Share, outsider denial, revocation, Reopen and accessibility. The latest prompt and reply remained visible on mobile, and a manual 200px history scroll remained unchanged after the answer mounted.

One fresh compound-interest answer then completed in 95.356 seconds. Planner `req_9Nr0ahmXN0Ju4ILYcYuiLeiC` settled 107 micro-USD and answer `req_iMNHHXVOa8Csvx0oCgM4hYpS` settled 2,041 micro-USD. The canonical ledger settled both calls, totaling $0.002148. The next prompt was withheld. The calculator was not accepted and production was not changed.

The privacy-safe rejection diagnostic identifies `authority / budget / expression_depth` in root statement 1 of an 8,332-character program. The previous depth limit of 28 counted both component layout and shared formula references. Workspace retained the complete readable calculation with an explicit partial status, but withheld the requested interactive controls. The original rejected program was not retained, so this evidence establishes the rejection class rather than a byte-for-byte replay of that program.

A deterministic calculator with shared formula references reproduced the same rejection without inference. The existing shared backend/frontend validator now permits up to 96 expanded levels while retaining its separate 6,000-node limit per declaration, source/token limits, cycle detection, registered-function allowlist and verified-source checks. Diagnostics include only the observed numeric depth, without private identifiers or values. Regression cases cover accepted composed calculations, excessive depth, repeated expansion, cycles, unknown functions, unverified sources and Share serialization. All 91 focused backend tests passed. Chrome interaction checks exercise the same composed calculation at five widths in both themes.

The correction still requires its own exact-source CI, browser result, fresh hosted generation and production canary. It does not change model, renderer, registry, authentication, accounting or external-action permissions.

## November 18 captured-answer visual review

Candidate `b05ffcd195e07625955d8ffaa2bb19b5622fc175` passed all eleven workflows and generated one genuine calculator through the authenticated private Workspace. The planner and answer settled 63 and 1,940 micro-USD. The answer preserved an interactive program and a complete corrected explanation, with an explicit `partial/data_review` state. The original outer draft was not retained, so this does not establish pristine model accuracy or the exact triggering numerical claim.

Independent replay verified the saved program's principal, rate, years, all four compounding frequencies, keyboard changes, Reset and zero-value boundaries. Screenshot inspection then found two actual presentation defects that those numerical assertions had missed. An initially unresolved chart could mount its DOM frame after the width observer's one-time effect and remain blank. Markdown display equations appeared as literal TeX even though the registered Math component already supported KaTeX.

The existing chart now observes its actual mounted frame. The existing Markdown renderer reuses the registered Math component's bounded, untrusted KaTeX configuration for explicit display equations and parenthesized inline math. Prices, fenced code, canonical text and saved program formats remain unchanged. Block equations are keyboard-scrollable. No model, component registry, provider, transport, authorization or accounting architecture changed.

The captured calculator passed again at 320, 390, 768, 1280 and 1440 pixels in both themes, now asserting two visible chart paths and two rendered equations as well as the numerical controls. No serious or critical accessibility violations or external requests were observed. Nineteen focused Markdown/chart tests passed. The renderer regression added a chart whose data becomes available after its first render and a Markdown equation case. These remain local results until exact-source CI and authenticated hosted acceptance confirm the correction.

The same-source private recovery continuation was stopped before inference, with zero new model calls and no rebuild. Its operator verified runtime, identity and grant cleanup and scheduled the dedicated test key for destruction. A hidden radio-input click in that harness was replaced with a visible label interaction for the next run. The old failed window is not reclassified as successful.

Adversarial testing then reproduced an unexpected KaTeX `RangeError` at 3,500 nested groups despite `throwOnError: false`. The native equation renderer now retains escaped formula text if the typesetter throws. The existing general-answer math renderer previously returned failed input through its HTML insertion path. Its catch now renders a React text child instead. Regression inputs include embedded image/event-handler markup and verify both that no HTML node is created and that the following answer text survives. This is a correction to the two existing math renderers, without another renderer or inference call.
