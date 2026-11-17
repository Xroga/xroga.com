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

## Verification and remaining gates

- A baseline comparison reproduced the cumulative-audit rejection and verified the corrected validator on the same synthetic program. Oversized individual expansions and cyclic references still fail.
- All 96 native backend, calculation and answer-coverage regressions passed.
- All 1,572 frontend tests passed. Frontend TypeScript checking passed.
- Credential-free Chrome regression passed 43 scenarios at five widths in both themes, plus 200% reflow checks. The 390px opening-title screenshot was visually reviewed. These are renderer regressions, not authenticated model acceptance.
- New exact-source CI, private hosted verification, a fresh relevant model-generation check and a successful production canary remain required. These local results do not establish live calculator acceptance.
- Search approval readability passed a controlled five-width browser test on the failed candidate. No fresh Search dispatch or source-provenance acceptance was completed in this canary.
- Guest admission remains independently blocked by unavailable shared Redis configuration. No in-memory accounting bypass or disabled credential was enabled.

The recovery pair is available. Completion for every user or every possible prompt has not been verified.
