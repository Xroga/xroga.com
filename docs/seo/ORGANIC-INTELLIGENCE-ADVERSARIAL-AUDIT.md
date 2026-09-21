# Command 1 adversarial audit

Audit date: 2026-09-21

This review treated the original Command 1 specification as authoritative and did not accept file presence, documentation, generated reports, or a zero exit code as proof of behavior.

## Material defects found and repaired

1. GSC rows, prompt observations, mentions, and visibility records did not drive the main gap/opportunity engine. They now do.
2. Four reported FORMAT gaps were not evidence-backed. They came from arbitrary first-topic selection plus any missing format. FORMAT now requires a dated search, AI, or competitor preference signal; the real baseline has zero FORMAT gaps.
3. VISIBILITY, NARRATIVE, WEB_MENTION, DEMAND, and PRODUCT were effectively unreachable from realistic imported evidence. Controlled end-to-end fixtures now reach all six gap types and FIX, BUILD, INFLUENCE, PRODUCT, and IGNORE behavior.
4. GSC parsing accepted empty numeric cells as zero and did not reject duplicate dimension rows. It now rejects empty/non-finite values, malformed dates, duplicate headers, duplicate rows, unterminated quotes, and incomplete files.
5. AI visibility was aggregated across engines. Platform-specific summaries are now retained.
6. Mention Intersect did not require topical relevance. It now rejects low-relevance records and ranks using topic plus page-level evidence rather than domain authority alone.
7. Missing platform data could not be distinguished from an observed zero in execution. Visibility gaps now require an explicit AVAILABLE zero for Xroga; missing remains NO_DATA.
8. Canonical fact source paths were not checked. Local fact sources are now constrained to the repository and verified to exist.
9. Priority could silently treat unknown maintenance as a neutral value and award P1 without observed demand. UNKNOWN remains visible and baseline opportunities are capped below P1 until observed evidence exists.
10. Near-duplicate prompt families were only exact normalized-string duplicates. Semantic normalization now catches common repository/development variants.
11. Integration entities and facts cited three nonexistent `/integrations/*` public pages. They now cite the live canonical `/build-with/*` routes, with a source-registry regression assertion.

## Reproduced baseline

- Entities: 25
- Desired associations: 12
- TOPIC gaps: 11, all explicitly INFERRED repository-audit diagnoses
- FORMAT gaps: 0
- VISIBILITY gaps: 0
- NARRATIVE gaps: 0
- WEB_MENTION gaps: 0
- DEMAND gaps: 0
- Opportunities: 11
- External datasets: NO_DATA or UNAVAILABLE as applicable

The twelfth desired association, Next.js development and repair, has no matching demand topic in the current ontology and is therefore retained without inventing a gap.

Two runs from an empty ignored output directory produced identical normalized SHA-256 hashes for all six generated artifacts (`entities`, `gaps`, `discover`, `report`, `validate`, and `intelligence`). No generated file is required for a subsequent run.

## Repository and production lineage

- PR #679 was merged as `1f202f7e70a71ccd0335f7f9b3dbf9ba4b93f12c`; its implementation commits include `253740ac` and the Agent V2 compile repair `ed6ef0e6`.
- PR #680 was merged as production commit `0417276164959d3e2651f2e924030b224350df12`; its `cca8e056` change makes the growth CLI test runnable after a backend-only install.
- The associated Fly production workflow compiled and tested the backend, passed the Agent V2 launch gate, deployed, and recorded healthy liveness/readiness for `04172761`.
- Live production returned 200 for the homepage, robots, sitemap, `llms.txt`, pricing, feature, docs, comparison, blog, research, and canonical `/build-with/*` integration samples. The obsolete `/integrations/github` evidence URL returned 404 and was repaired in the registry.

## Earlier completion claims corrected

- The reported 12 TOPIC plus 4 FORMAT gaps were not reproducible as evidence-backed results. The corrected baseline is 11 inferred TOPIC gaps and no FORMAT gap.
- GSC, prompt-observation, web-mention, and generic visibility imports existed but were not connected to opportunity generation.
- Platform-specific AI visibility, PRODUCT routing, WEB_MENTION opportunities, and external gap actions were overstated; behavioral fixtures now exercise the real paths.
- The claim of 17 inherited frontend failures was ultimately accurate, but the earlier report had not established it against the pre-Command-1 SHA. The direct before/after comparison now does.

## Inherited frontend test comparison

The pre-Command-1 base `fa509768a53f69fb15e9704fa840975a54f0f636` and the audited Command-1 tree both report 665 tests: 648 passed and the same 17 failed. The failures are:

1. `formatAiMarkdown.test.ts`
2. outgoing write metadata canonical-context assertion
3. semantic planner execution-path assertion
4. build-failure fallback assertion
5. client-generated message ID assertion
6. immediate `onStart` assertion
7. stalled-read polling assertion
8. 15-second keepalive assertion
9. stalled run without a run ID assertion
10. duplicate `onStart` suppression assertion
11. interrupted run-ID assertion
12. stopped-message run-ID assertion
13. durable Stop cancellation assertion
14. unconfirmed Stop state assertion
15. fresh-product project-isolation assertion
16. plain factual AI-status assertion
17. honest waiting-line assertion

Command 1 introduced no frontend source change and no additional frontend failure.

## Agent V2 adapter review

`ed6ef0e6` was a necessary compile repair: `workingFiles` and `forceContinueFromCheckpoint` had been placed outside the runtime-options object in `softwareAgentImplementationAdapter.ts`. The commit moved those properties into the existing options object without changing the adapter architecture. Current backend tests cover the universal execution and Agent V2 integration path; no Command-1-specific adapter change remains necessary.

## Verification matrix

| # | Requirement | Implementation evidence | Automated/runtime evidence | Status | Notes |
|---:|---|---|---|---|---|
| 1 | Entity graph | Typed entities and relation validation | Duplicate id/slug, invalid and self-relation tests | PASS | Source graph validates. |
| 2 | Desired associations | Association source and validator | Duplicate identity/id and product-truth tests | PASS | Internal strength is not external visibility. |
| 3 | Canonical facts | Fact registry, conflict/stale/page-use/source checks | Duplicate/conflict/stale/path/outdated tests | PASS | Highest-value volatile facts seeded. |
| 4 | Demand ontology | Distinct keyword/prompt/family/topic/intent/job/audience/stage kinds | Semantic prompt-family duplicate tests | PASS | No prompt-to-page expansion. |
| 5 | Seeded demand universe | Twenty reviewed records | Source validation and report execution | PASS | Demand values remain NO_DATA. |
| 6 | BID | Business potential, intent/asset, difficulty fields | Priority and UNKNOWN tests | PASS | Difficulty is UNKNOWN without evidence. |
| 7 | AI Satisfaction Risk | First-class scored/UNKNOWN field | Scoring fixture coverage | PASS | Not treated as traffic. |
| 8 | Click Defensibility | First-class scored/UNKNOWN field | Scoring fixture coverage | PASS | Included in rationale inputs. |
| 9 | Six Brand Gaps | Evidence-driven builders for all six types | Six isolated end-to-end fixtures | PASS | No unrelated gap in each fixture. |
| 10 | Five actions | Deterministic action engine and product queue | FIX/BUILD/INFLUENCE/PRODUCT/IGNORE fixtures | PASS | Unsupported demand cannot become BUILD. |
| 11 | Explainable priority | Component scores plus rationale | UNKNOWN/maintenance/product/external tests | PASS | No black-box total score. |
| 12 | SEO visibility model | GSC plus generic visibility metrics | Imports affect demand/visibility gaps | PASS | Missing is not zero. |
| 13 | AI visibility model | Observation samples and platform summaries | Five-engine fixture | PASS | No fixed-rank claim. |
| 14 | Ahrefs states | Provider abstraction, injectable dataset loader and safe failure | Missing, plan-limited, empty, available and thrown-provider tests | PASS | No hard dependency on an Ahrefs API client; verified data can be supplied without fabricated defaults. |
| 15 | GSC ingestion | Strict reordered-column CSV parser | Normal, quoted, percent, decimal, zero and malformed tests | PASS | Duplicate dimensions rejected. |
| 16 | Prompt Observatory | JSON import and engine-specific storage | Sample metrics and engine isolation tests | PASS | Raw imports remain private. |
| 17 | AI visibility states | Four explicit states | Per-state rate/gap tests | PASS | Share of Voice is not emitted without sufficient model. |
| 18 | Platform visibility | Engine/platform retained in summaries/gaps | Platform-specific fixture | PASS | No universal AI score. |
| 19 | Format Coverage | Full format enum and evidence gate | Video preference fixture | PASS | Missing alone produces no gap. |
| 20 | Web Mention intelligence | Typed import with page/topic fields | Parsing and gap fixture | PASS | Page evidence preserved. |
| 21 | Mention Intersect | Competitor overlap plus topical relevance | A/B/C publication fixture | PASS | Xroga-present and irrelevant pages excluded. |
| 22 | Product routing | Product opportunities derived from PRODUCT gaps | Unsupported entity/demand fixture | PASS | No deceptive content action. |
| 23 | Confidence states | VERIFIED/OBSERVED/INFERRED/UNKNOWN/STALE | Report and evidence tests | PASS | Baseline gaps are INFERRED. |
| 24 | Freshness | CURRENT/VERIFY_SOON/STALE/UNKNOWN | Boundary tests | PASS | Dated evidence retained. |
| 25 | CLI commands | Six root commands | Every command dry-run plus JSON/verbose tests | PASS | Default writes only ignored artifacts. |
| 26 | Human report | Required operational sections | Real and synthetic reports read/tested | PASS | Separates evidence and missing data. |
| 27 | Crawler policy | Search/retrieval separated from training | Source validation plus live robots audit | PASS | Unknown training policies remain unknown. |
| 28 | Technical baseline | Existing production SEO audit reused | Live audit covers public/private/discovery files | PASS | No duplicate SEO engine. |
| 29 | Documentation | Architecture, imports, semantics, limitations | Reviewed against runtime | PASS | Corrected baseline documented. |
| 30 | Automated tests | Behavioral domain/CLI fixtures | Growth suite expanded from 14 to 27 tests | PASS | No source-string-only growth tests. |
| 31 | Malformed input | Strict CSV/JSON schema failures | Malformed number/date/quote/shape tests | PASS | Clear nonzero CLI failure path. |
| 32 | Duplicate handling | Entity/slug/association/fact/demand/import checks | Duplicate fixture coverage | PASS | GSC dimensions also protected. |
| 33 | Missing-data handling | Provider and evidence states | NO_DATA/UNKNOWN/zero/unavailable/stale tests | PASS | States do not collapse. |
| 34 | Existing SEO compatibility | No public SEO source replacement | Git diff and production audit | PASS | Registries, sitemap and metadata untouched. |
| 35 | Public route compatibility | No new public routes | Live representative route checks | PASS | Private intelligence stays private. |
| 36 | Build/lint/test state | Workspace scripts and CI | Backend/growth/build/SEO pass; inherited frontend failures compared | PASS | Command 1 introduced zero additional failures; the repository-wide unit job remains red on 17 identical pre-existing frontend failures. |
| 37 | Preview/live production | Normal PR/Fly workflow | Production SHA, health, readiness and live endpoints | PASS | Frontend deployment not required for backend-only repair. |

## Remaining external unknowns

- Ahrefs API entitlement and metrics
- Real GSC export for this execution
- Real prompt-observation samples
- Real third-party mention/intersect records
- Real cross-platform visibility metrics
- Ranking difficulty and external authority metrics

These are intentionally not converted into zeroes or fabricated opportunities.
