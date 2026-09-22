# Command 2 adversarial audit

Date: 2026-09-22

Audit target: PR #682 (`codex/growth-command2-demand-content`) at `5eaa055c2c7fe9fd7eb8f624e7d0ecb01d9353a9`, based on `9e7a42f3e8de8ddb1ef732e42bb82f65a2befca2`.

This document records independently executed evidence. It does not treat the implementation report, comments, generated reports, or a zero exit code as proof on their own.

## Material findings and repairs

1. All 540 seeded/modifier records were correctly labelled `GENERATED_IDEA`, but the pipeline still created asset-resolution decisions for them. The pipeline now permits asset resolution only after external keyword evidence promotes a candidate to `VALIDATED_DEMAND`.
2. The content pipeline hard-coded `brandAssociationMissing: false` and inferred product support from any related entity. BRAND gaps were therefore unreachable and PRODUCT safety was not grounded in Command 1. Both values are now derived from Command 1 gap/action evidence, with an end-to-end BRAND regression test.
3. Existing-asset resolution did not distinguish intent and could never return `REPOSITION`. It now keeps distinct intents separate and exercises BUILD, UPDATE, MERGE, REPOSITION, and IGNORE outcomes.
4. Controlled-batch selection could admit non-indexable assets and did not require the associated manifest to pass the source, claim, evidence, visual, and quality gate. Selection now operates only on indexable assets with valid manifests.
5. The GitHub visual is a designed product illustration, not a captured product screenshot. Inventory, manifest, runtime content, alt text, tests, and the independently recomputed quality score now call it `ILLUSTRATION`; the visual-proof component is capped at 5/10.
6. Manifest validation did not prove that evidence source IDs existed or that sources and claims declared the page using them. Those links are now enforced. Duplicate normalized claim text is also rejected.
7. `resolveSafeContentPath` was lexically bounded but could follow a junction/symbolic link outside the repository. It now verifies the canonical filesystem target and has a traversal/junction regression test.
8. Video evidence could prove that the inventory lacked video while the result still said `NO_DATA`. It now reports `ABSENT` only on that evidence-backed path.
9. The synthesis changes bundled in PR #682 restore a fail-closed universal-review gate and are unrelated to Growth OS. They were split into PR #683 with focused tests and no Growth OS files.

## Independent baseline

- Research candidates: 540, deterministic and unique.
- Validated keyword candidates with the checked-in source state: 0.
- Asset decisions without validated demand: 0 after repair (540 before repair).
- GSC rows: 0; this is `NO_DATA`, not zero performance.
- Ahrefs import: `NO_DATA`; the Command 1 provider separately distinguishes `UNAVAILABLE` and `PLAN_LIMITED`.
- SERP observations: 0; format, competitor, and video conclusions remain unknown unless fixtures/imports provide evidence.
- First controlled batch: 2 existing FIX assets, `/build-with/github` and `/tools/production-readiness-checker`.
- Briefs: 2; both have zero validated keyword IDs and say so.
- Command 1 current gaps: 11 evidence-backed TOPIC gaps; no fabricated external visibility, mention, demand, or format observations.

## Verification matrix

| # | Requirement | Implementation evidence | Automated/runtime evidence | Status | Notes |
|---:|---|---|---|---|---|
| 1 | Reconstruct original Command 2 | Original command was read and reduced to demand, evidence, planning, publication, safety, and verification invariants | This matrix maps every audit section | PASS | No Command 3 work was started |
| 2 | PR / Git state | PR #682 exists; head/base/commits and 32-file diff verified | GitHub API and local commit graph | PASS | PR remains open during audit |
| 3 | Command 1 to Command 2 | Pipeline loads the canonical Command 1 source and `buildIntelligence` output | Snapshot tests and real CLI flow | PASS | No parallel strategic queue |
| 4 | Command 2 models | Zod contracts cover research, SERP, assets, evidence, visuals, briefs, decay, and sleepers | Parsers and 59 growth tests exercise the models | PASS | File-based records remain inspectable |
| 5 | Demand ingestion | CSV/JSON Ahrefs imports preserve null metrics and reject malformed/duplicate records | Adversarial import tests | PASS | No API metrics are invented |
| 6 | GSC end to end | Command 1 GSC parser feeds classifications, decay, cannibalization, and brief IDs | Existing adversarial GSC tests plus content brief test | PASS | Checked-in state is `NO_DATA` |
| 7 | SERP intelligence | Structured observations drive intent, format, video, and competitor gaps | Majority-intent, invalid input, format, and video tests | PASS | No checked-in SERP evidence |
| 8 | 540 ideas | 18 topic clusters × 30 deterministic variants | Exact count, uniqueness, UNKNOWN status, and zero asset decisions asserted | PASS | Research universe is not a publication queue |
| 9 | BID | Product fit, business potential, difficulty, AI satisfaction risk, and click defensibility remain separate | High-volume/low-fit and tool-intent tests | PASS | UNKNOWN is visible |
| 10 | Query fan-out | Prompt families and desired associations produce bounded questions | Shared-family and coverage tests | PASS | Current real source yields a small bounded set |
| 11 | Existing assets | Intent-aware BUILD/UPDATE/EXPAND/MERGE/REPOSITION/IGNORE logic | All material outcomes tested | PASS | Distinct intent is no longer silently collapsed |
| 12 | Cannibalization | Same-topic, same-intent overlap is measured | Duplicate-intent test | PASS | Does not flag different intent merely for topic overlap |
| 13 | Sleeper pages | Requires dated historical decline plus an inventoried page | Positive and no-history tests | PASS | Age alone is insufficient |
| 14 | Content decay | Claim verification deadlines and GSC decline produce typed signals | Stale claim and decline tests | PASS | No fake date refresh |
| 15 | Briefs | Briefs bind opportunity, demand, evidence, visuals, links, limitations, and CTA | Two real briefs parse against schema | PASS | Validated keywords remain empty honestly |
| 16 | Source registry | Source IDs, staleness, page use, and evidence references are enforced | Missing/stale/duplicate/page-mismatch tests | PASS | Private data is not a public source |
| 17 | Claim registry | Claim IDs, normalized duplicates, source links, staleness, and page use are enforced | Adversarial registry tests | PASS | Volatility remains explicit |
| 18 | Narrative truth | Public text preserves authorization, verification, and deployment boundaries | Source-contract tests and browser read | PASS | No guaranteed outcomes |
| 19 | Visual truth | Illustration is no longer presented as a screenshot | Manifest/runtime/test assertions plus direct image inspection | PASS | Material repair |
| 20 | Visual manifest | Type, source, alt, caption, verification date, and public-safety flag are required | Schema and citation-ready gate | PASS | Contract supports future visual classes |
| 21 | Workflow diagram | Release evidence workflow is semantic HTML | Accessibility source test and browser AX tree | PASS | Not explanatory text baked into an image |
| 22 | Quality score | Weighted components and deficiencies recompute deterministically | Score tests; manifests validate at 85 and 90 | PASS | Illustration-only proof is capped |
| 23 | Citation-ready structure | Sections, metadata, sources, claims, public evidence, visuals, and score are gated | Negative and real-manifest tests | PASS | Controlled selection uses this gate |
| 24 | Content components | Editorial page, evidence figure, workflow, chart, and checker are connected | Frontend tests and production build | PASS | Chart retains accessible table |
| 25 | CTA | CTA mapping follows intent and repository workflow | CTA tests and rendered links | PASS | No forced deployment claim |
| 26 | Internal links | Self-links are removed, duplicates rejected, and related links are scored | Link/orphan tests and SEO crawl | PASS | New routes have audited inbound links |
| 27 | File-based architecture | JSON registries/manifests are loaded incrementally alongside existing runtime content | Real CLI reads files and validates manifests | PARTIAL | Manifests gate publication planning but do not generate runtime pages |
| 28 | Comparison framework | Required sections and current sources are enforced | Thin/stale comparison tests | PASS | No benchmark claims without evidence |
| 29 | Alternatives framework | Multiple legitimate options and source contract exist | Family contract coverage | PASS | Framework exists; no new page generated here |
| 30 | Migration framework | Prerequisites, transfer boundaries, steps, failure modes, validation, and sources are required | Family contract coverage | PASS | Existing migration pages remain separate |
| 31 | Troubleshooting framework | Symptom, cause, diagnostics, fix, and verification are required | Family contract coverage | PASS | No generic thin page admission |
| 32 | Research framework | Method, dataset, results, limitations, sources, and original data are mandatory | Fabricated-results rejection test | PASS | No results publish without a dataset |
| 33 | Chart system | Real points are required and an accessible table/source/date are retained | Frontend source test | PASS | No chart is fabricated in the current batch |
| 34 | OG image system | Existing site-wide OG route and absolute metadata remain intact | Production build and 40-route local SEO crawl | PASS | Command 2 did not create a parallel OG generator |
| 35 | Editorial quality | Filler, unsupported superlatives, placeholders, and repeated sentences are rejected | Editorial tests | PASS | Deterministic checks, not an LLM score |
| 36 | First batch | Maximum 8; current batch is 2 valid indexed FIX assets | Snapshot and non-indexable regression tests | PASS | No mass page creation |
| 37 | Eleven Command 1 gaps | All 11 current gaps were reproduced from clean source | CLI snapshot/report | PASS | They remain TOPIC/FIX; no external gaps fabricated |
| 38 | Command 1 feedback | Keyword evidence is applied before Command 1 intelligence and gap results feed content classification | Evidence and BRAND end-to-end tests | PASS | PRODUCT safety now uses Command 1 action evidence |
| 39 | CLI | Intelligence/entities/gaps/discover/report/validate and all content commands executed | Actual, dry-run, JSON, verbose, malformed-path tests | PASS | Exit codes are meaningful |
| 40 | `growth:content` semantics | Returns `CONTROLLED_PLAN_ONLY` and never publishes | CLI execution and tests | PASS | Name is documented; behavior is non-destructive |
| 41 | Security/privacy | Imports remain private, paths are canonicalized, no secret values are serialized | Junction/traversal tests and repository scan | PASS | Generated intelligence is ignored |
| 42 | Performance/frontend | Two static routes, optimized image, CSS scoped to editorial components | Next production build and desktop/mobile screenshots | PASS | No new client network pipeline |
| 43 | Exact CI baseline | Feature has 17 frontend failures; main has the same inherited failing contracts and files | GitHub run comparison and local 670-test run | PASS | 653 pass, 17 fail; zero Command 2 test failures |
| 44 | Do not weaken CI | No assertion, workflow, or snapshot was weakened | Diff review | PASS | New tests increase coverage |
| 45 | Main backend failures | Main review gate defect was reproduced and isolated | PR #683, 40 focused tests, backend build | PASS | Split from Growth OS |
| 46 | All Command 2 tests | Growth, backend, frontend-specific, build, lint, and SEO checks executed | Results below | PASS | Inherited frontend failures remain explicit |
| 47 | Preview | Both routes rendered; checker interaction changed 0/8 to 1/7; desktop/mobile reviewed | AX tree, interaction, four screenshots | PASS | Old protected PR preview required authenticated browser; local production build was fully tested |
| 48 | Verification matrix | This table records implementation, tests, runtime, and limitations | Manual audit | PASS | Status is not inferred from file existence |
| 49 | Repair defects | Nine material issues repaired with regression tests | 59/59 growth tests | PASS | No mass content rewrite |
| 50 | Merge policy | Command 2 remains unmerged until repair PR and updated checks are reviewed | Git state | PASS | No premature merge |
| 51 | Production deployment | Not performed before certification | Git/deployment state | NOT APPLICABLE | Required only after merge |
| 52 | Post-merge production | Pending by definition while PR #682 is open | Production state | NOT APPLICABLE | Must be completed after merge |
| 53 | Clean reproducibility | Started with no generated artifacts; full flow ran twice | Six normalized structural hashes matched | PASS | Timestamps were normalized only for comparison |
| 54 | Certification | Command 2 code is technically repairable and validated; lifecycle awaits PR integration/checks | This audit | PARTIAL | Final verdict must wait for merge/deploy evidence |
| 55 | Evidence over claims | Decisions expose evidence and UNKNOWN state | End-to-end report and negative tests | PASS | Missing external data never becomes zero |

## Executed validation

- Growth tests: 59 passed, 0 failed.
- Backend tests: 2,598 total; 2,585 passed, 13 skipped, 0 failed.
- Backend build: passed.
- Frontend production build: passed; 165 routes generated.
- Frontend tests: 670 total; 653 passed, 17 inherited failures, 0 Command 2 regressions.
- Focused Growth UI tests: 5 passed.
- Lint: passed with 14 inherited warnings.
- SEO audit against local production build: passed (28 public routes, 6 private routes, 5 discovery files).
- SEO audit against the protected Vercel preview could not run unauthenticated because Vercel returned its login page; authenticated browser inspection passed.
- `git diff --check`: passed; Windows line-ending notices only.
- Clean structural regeneration: six content JSON artifacts matched across consecutive runs after normalizing only generated timestamps.

## Remaining external unknowns

- No real Ahrefs export/token-backed dataset was supplied.
- No real GSC export was supplied.
- No structured SERP observation import was supplied.
- No external competitor or video evidence was supplied.
- These remain `NO_DATA`, `UNAVAILABLE`, or `PLAN_LIMITED` as appropriate; they are not zero.
