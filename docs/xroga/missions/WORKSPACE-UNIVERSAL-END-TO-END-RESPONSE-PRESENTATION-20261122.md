# XROGA WORKSPACE — UNIVERSAL AI ANSWER + RESPONSE PRESENTATION, COMPLETE END-TO-END IMPLEMENTATION ORDER

**Mandatory production UX correction (22 Nov):** Read and implement [WORKSPACE-UNIVERSAL-ADAPTIVE-PRESENTATION-AUTOMATIC-SEARCH-PRIVATE-ENGINEERING-20261122.md](./WORKSPACE-UNIVERSAL-ADAPTIVE-PRESENTATION-AUTOMATIC-SEARCH-PRIVATE-ENGINEERING-20261122.md) first. The owner's video shows ordinary public Search incorrectly routed to Confirm action / Review action with visible platform spend and internal operation metadata. Fix actual routing and consumer payload privacy; dynamically compose compact layouts for all prompt categories rather than hardcoding response templates. Preserve approval only for genuine consequential external actions.

**Mandatory accuracy addendum (22 Nov):** Read and implement [WORKSPACE-TRUTHFUL-TO-THE-POINT-ADAPTIVE-PRESENTATION-20261122.md](./WORKSPACE-TRUTHFUL-TO-THE-POINT-ADAPTIVE-PRESENTATION-20261122.md) as part of this same mission. It requires accurate source-grounded answers, proper search selection, no invented information, no repeated Markdown/native UI, concise response scope and 20 targeted verification cases. This complements sections 3, 4, 6 and 7 and does not introduce a competing renderer or an unconditional search/verification pass.

**Owner's engineering directive for Codex · 22 November 2026 · Xroga/xroga.com · Workspace PR #989 only**  
**Status: actionable engineering specification, not proof of implementation.** The target is a market-leading, *universal* prompt-to-outcome Workspace, not a collection of layouts hardcoded to known benchmark prompts. This file supersedes earlier narrow presentation requests where they conflict; keep previous verified architecture and acceptance artifacts. Do **not** confuse this task with Claude's Browser Operator PR #976.

## 0. Mandatory operating instructions — work in code, do not stop at another summary

1. **Implement → generate with the real model → render in the real signed-in Workspace → test actual controls/data/downloads → inspect screenshots and receipts → fix → rerun.** Do not substitute a static parser test, simulated provider, a green CI run, or a captured-response replay for fresh production-shaped acceptance.
2. Start with the current PR head, repo/worktree status, source SHAs, existing tests and approved provider/cost controls. Do not accidentally overwrite Codex work on a moving branch; re-fetch/rebase before pushing. Record changed code, provider identity and exact-commit build provenance. No alternate orchestration, no second response renderer, and no bypass of canonical Xroga scheduler/ledger, auth/tenant gates or private Storage Service.
3. Treat the founder's broad routine engineering authorization as sufficient for code changes, tests, private staging, local browser UX inspection and bounded approved provider spend. **Ordinary platform-funded public READ searches must not require a per-search confirmation/card**. External emails/ads publication, purchases, destructive or privacy-sensitive user actions, credential grants, MFA, and production promotion still require appropriate user/account authorization and gates.
4. The owner does not want repetitive “what should I do next?” interruptions. Choose work from this spec by severity and continue. Block only the action that genuinely requires missing authority; progress with independent engineering areas. No production rollout until every P0 blocker has *fresh exact-source* passing evidence and security/readiness review.
5. **Quality target:** user enters any reasonable prompt. The model chooses concise prose, text + citations, real links, tables, charts, interactive controls, diagrams, code, math, documents, maps/media (when grounded providers exist), or mixed structure according to purpose. The user receives ONE complete coherent answer. Nothing is duplicated, fabricated, stale, wrongly formatted, clipped, noninteractive, visually broken, or represented as completed without evidence. A finite software system cannot guarantee flawless handling of literally every possible prompt: measure unseen-prompt generalization and report honest residual failures.

## 1. Exact observed state: don't reopen fixed issues as if unfixed

**Source anchor:** user-supplied `XROGA-WORKSPACE-VERIFICATION.md` from the November 21 session and screenshot of that report; inspect the latest repository and report before coding. The screenshot is a *verification report viewed inside ChatGPT*, **not** a screenshot proving that Xroga's production answer renderer works.

- **PR #989 head in the report:** `4941c0c4e0aaf1114324045846985f1734d3b73b` (Search budget handoff, citation overflow, repeated comparison table). Reconfirm actual HEAD and whether any new commits land.
- **Serving production in report:** frontend `d3e86fe8ab738781f8c487aba694760fd77e0df8`; API/Job `39e4e29195933df2d0abef92bd51f2eaff7c4b89`. Candidate work was not promoted. Deployment status **must** be read back; GitHub green does not establish production release.
- **R2:** owner enabled scoped staging credentials; actual R2 write/read/delete, isolated Supabase access and foreign-account rejection passed. **Do not tell the owner R2 still needs configuration** unless a new independent test shows a new expiry/revocation/blocker.
- **Live Search at `9d48bb13`:** one official DeepSeek Search retrieval, private storage, and two Zurelay synthesis calls produced a cited ten-company ranking without an action-confirmation card. **However:** 75.354 s; six requested official company websites absent, repeated ranking/comparison information, and a 320 px citation overflow failure; Search Copy/Share/Reopen was stopped. Local replay corrected duplication and overflow at `4941c0c4`, but **no fresh live Search acceptance on that commit**.
- **DOCX:** a fresh editable cue-sheet file with required rows was successfully downloaded, copied, shared, reopened and access-isolated in a private hosted run. Earlier attempts lacked file metadata or introduced duplicate/unrequested wording. Keep its positive result; stress-test unknown phrasing and preserve download fidelity.
- **Live calculator:** interactive edit and Reset eventually worked on corrected candidates in private staging; historical runs lost controls and repeated formulas. Preserve this and test fresh program generation + saved history. Do not claim universal calculators are solved from one example.
- **Live ChatGPT-vs-Xroga:** negative cash flow, Arabic rewriting, seasons explanation, JS Number/parseInt, interactive calculator and DOCX exposed broad answer-level weaknesses: factual inaccuracies, unrequested claims, redundant sections, missing visual controls and plan timeout. The exact original 30-prompt matrix remains mostly **unrun live**; deterministic contract inspection of 30 != 30 matched real comparisons.
- **CI:** 11 exact-source workflows passing at `4941c0c4` and broad local Chromium checks show good basic infrastructure, but do NOT certify live answer quality or new serving versions.

**Top release blockers:** (1) fresh Search missing source/official-link coverage, (2) no fresh accepted Search Copy/Share/Reopen after last fix, (3) new build/source-matched protected frontend/API and accurate serving markers, (4) real-model unseen prompt generalization and response integrity, (5) production approvals/security/canary.

## 2. Preserve the integrated technology; stop reinventing it

Source code and audit already show the foundation:

- **OpenUI** (pinned reference `5afae00a`): `@openuidev/lang-core`, `@openuidev/react-lang`, schema generation, parsing, bound expressions, React renderer.
- **Open Intelligent UI** (pinned `9df2e64b`): vendor-derived layout, text, chart, inputs, local pure computations, accessible interaction, color/list/math functions.
- **CopilotKit** (pinned `c7815d9a`): reviewed ChoicePicker/Apply/Cancel adapter and documented standard component catalog.
- **Lucide:** current versioned same-origin icon catalog contains ~1,986 icon names. Use semantic icons as requested; don't dump the whole icon list into every LLM prompt.
- **Canonical Xroga path:** `backend/src/ai/nativeOpenUiCatalog.json`, `nativeOpenUiPrompt.ts`, `nativeOpenUiWorkspace.ts`, `nativeOpenUi.ts`, `nativeOpenUiValues.ts`, `nativeOpenUiEditorial.ts`, `nativeOpenUiAccuracy.ts`, `nativeOpenUiRecovery.ts`, `nativeDocumentDownload.ts`, `workspacePublicSearch.ts`, `responsePresentation.ts`; UI `frontend/src/components/native-openui/{NativeWorkspaceAnswer,NativeSurface,Diagram,Editorial}.tsx`, native upstream components, `frontend/src/lib/{xrogaCitations,xrogaResponseDocument}.ts`, Copy/Share/Reopen and renderer error boundaries.
- **Truth source:** `docs/operations/native-openui/{CAPABILITY_AUDIT.md,coverage.json,prompt-suite.json}`. Audit claims 55 registered components and 30 registered functions; many upstream choices already have reasons for excluding network/eval/HTML/time/random. Validate before altering. **Registered != real-model selected != interactively verified.**

First draw an **actual capability matrix** per behavior: available schema, permitted props, model exposure, syntactic validity, runtime render, real input interaction, saved serialization, replay, Copy/Share/Reopen/download, and holdout pass. Fix weaknesses in the existing system. Port upstream code only for measured missing capability; do not silently copy another renderer, remote code execution mechanism, unlicensed fork or browser runtime. Preserve existing source attribution and licences.

## 3. Fix the answer architecture — one canonical result, not three competing copies

**Known code issue to inspect:** `nativeOpenUiPrompt.ts` asks the model for complete Markdown and an OpenUI program that renders `Markdown(_xroga_answer)` once, while `NativeSurface.tsx` can additionally present `summary`, render the program, and append `details`; the recovery and editorial paths can inject more prose. Do not assume a single prompt instruction prevents duplication.

Implement and verify a **canonical semantic answer document** with stable block/section IDs and provenance:

1. `AnswerContract`: user intent, requested forms/deliverables, data/facts/sources, dependencies, confidence, required interactivity and file format, freshness expectation, style/length, risk/permissions.
2. `ContentBlocks`: authoritative prose/sections, data tables, calculation definitions, source IDs, code, and artifacts. One underlying datum must not be independently regenerated into unrelated Markdown, metric captions, charts and exports with contradictory values.
3. `VisualProgram`: references canonical content/data and registered pure UI components. If the model emits Markdown plus native Lang, detect that a section/table/formula is *the same content* across representations, preserving novel useful elements. Use semantic fingerprints of normalized headers, row values, units, equations, section role, and source identities—not only string equality.
4. `PresentationPlan`: choose the right amount of UI. One-sentence answer → one sentence. Email → copyable message. Research → sourced editorial answer. Interactive calculator → real controls and readouts. Complex architecture → linked diagram with text alternative. Don’t hallucinate images/maps/live data that have no trusted resolver.
5. `OutcomeValidation`: required output present, correct numerical inputs/units, sources support claims, charts and readouts match, links resolve as authorized, controls work, downloaded file exists, no overlapping mobile UI. On optional visual failure, recover without losing the requested user outcome; mark partial when essential capability genuinely failed.
6. `PersistentSnapshot`: immutable, sanitized, tenant-scoped canonical text + native program + references + data + artifact IDs + version + model/provider/tool receipts. Rendering, Copy, Share, Reopen and exports are projections of **the same snapshot**; never regenerate and silently change claims.

**Engineering constraint:** avoid a large storage migration just to express the logical contract. Extend canonical response document/snapshot in a versioned backward-compatible way, with a parser or projection adapter for saved historical turns. Keep deterministic/offline replay to bisect regressions. This is response presentation state, not a rival task scheduler.

## 4. Automatic public research: completeness, coverage, freshness and no friction

The infrastructure now works in isolated staging. Finish *quality and complete answer*:

- The model should decide whether retrieval materially changes the answer. Public current release, news, prices, statistics, rankings and source-required claims normally need fresh Search. User-provided data, simple arithmetic, creative writing and explicit “do not browse” do not. Multilingual/implicit requests and novel phrasing must not depend exclusively on regex keyword gates; combine bounded semantic planning with conservative deterministic public/private data classification.
- Route **ordinary authorized public READ research automatically** through the existing official DeepSeek Search API; do not insert an “approve Search,” “add card,” “configure payment,” “choose a website,” or account consent interstitial. Preserve authorization for sensitive private sources or externally consequential actions. No fake results and no unmetered repeat search.
- **Required-output coverage** is distinct from citation count. The ten-company example requested official websites for all ten entities. Before model synthesis, examine whether retrieved sources include credible first-party domains. If not, run a targeted *authorized bounded* follow-up lookup for only unresolved entities; or state which links could not be verified. Do not infer links from company names or turn an unrelated cited URL into an official homepage. Carry typed `OfficialLink{entity, verifiedUrl, sourceEvidenceId, status}` through synthesis into native Link/Resource/Source UI.
- Give the model a source coverage plan: entities and fields required, which are verified, which unknown, freshness/retrieval timestamps, credible primary vs secondary source distinctions. Require source citations adjacent to claims, no invented publication dates, and correct mapping to evidence IDs. Label editorial rankings with disclosed method/weights and note subjectivity. Don't source a factual claim from unrelated evidence.
- Preserve canonical path: prompt → safe public query projection → official DeepSeek Search → receipt and private evidence storage → authorized Zurelay DeepSeek synthesis → source-matched finished answer → Copy/Share/Reopen. Store sources privately; sanitize URL/query/headers; enforce egress/privacy/SSRF checks and tenant isolation. Do not lose a verified retrieval to a transient synthesis failure; resume without billing twice.
- Use provider-output quality control: check missing requested entities, official links, cited claims, internally inconsistent scoring, hallucinated sources and duplicate narrative. Correct recoverable missing fields with measured targeted retrieval or one bounded answer repair; never let an “editorial pass” introduce unsupported data.
- **P0 reproducer:** “Top 10 best AI companies of 2026. Give your criteria, explain why each ranks where it does, link each official website, and cite reliable sources.” The canonical output must include ten distinct entities, ten verified official links or clearly identified missing verifications, meaningful cited evidence, no repeated table, responsive 320 px source controls, no confirmation UI, and persisted full answer. If all ten official links were explicitly requested, incomplete links are a failure, even if six citations appear.
- Measure real Search dispatch/retrieval vs planner/synthesis separately. The observed 75.354-second output included 63.801 seconds in synthesis (10,102 reasoning tokens out of 12,565 outputs), so blindly optimizing the citation chip is **not** performance optimization. Profile model prompting, reasoning selection and output redundancies; optimize time to complete accurate answer, not speed at the expense of correctness.

## 5. Universal adaptive presentation: content-driven, not a catalog dumping exercise

For any prompt (including unfamiliar categories), choose by user need and evidence, not a fixed list of 30 hardcoded prompts:

| User intent | Appropriate answer pattern | Must work |
|---|---|---|
| Short factual / greeting | concise readable prose | no card/chart/tool theater |
| Writing / email / translation | faithful standalone copyable text, RTL when required | preserve details, no invented people/reasons |
| Long research | coherent hierarchy, inline source citations, real official links | coverage, source dating, summary, no repetition |
| Comparison / decision | exact table plus one supported conclusion | consistent units, costs, assumptions, optional sorting |
| Numeric data | accurate bar/line/scatter/chart and data table when useful | negative axes, dates, totals, labels, alt text |
| Interactive calculator | editable inputs/selectors/sliders, outputs, Reset, constraints | all dependent readouts recompute, no ghost controls |
| Processes / systems | connected flow/diagram with correct graph edges | responsive topology, accessible equivalent |
| Programming | code block, syntax labels, Copy, explanatory tests | correct code, no arbitrary execution |
| Mathematics | correct equations, LaTeX, steps when requested | symbols, substitution, accessible math |
| Deliverables | genuine DOCX/PDF/XLSX/PPTX/media when supported | signed artifact, correct bytes and editable structure |
| Location / routes / media | verified provider-backed map, route or media where available | never invent provider metadata or inaccessible assets |
| Connected tasks / actions | progress, receipts, files, outcomes, approvals only when necessary | no fabricated completion or private data leak |
| Advanced mixed prompts | choose only complementary patterns | no duplicate or cross-section inconsistencies |

**Visual system:** restrained premium typography, meaningful spacing, single readable hierarchy, dark/light, mobile 320/390/tablet/desktop, small Lucide icons only when semantically useful, correct focus/keyboard/hover/ARIA, RTL/bi-directional text, reduced-motion, 200–400% zoom, safe overflow, charts with responsive legend and data equivalent, popovers that remain in viewport, no fake clickable surfaces. For 50-component answers, use grouping, but do not overwhelm a 1-line question with controls.

**Interactivity contract:** every displayed button, slider, select, checkbox, sort header, filter, tab, calculator, choice picker, date picker, timer, upload/download or link must have a working state transition or real authorized host action. Prohibit decorative inert controls. Validate range, bounds and null; propagate state to all dependent readouts; preserve semantic focus; test Reset, back/forward and refresh/reopen. A source citation chip is NOT a generic action button; it must open the actual sourced page/preview and be keyboard accessible.

**Map/media provider limitation:** current audit states map tiles, routing geometry and arbitrary model-selected images still lack approved resolvers. Either implement a safe trusted data/image/map resolver through existing Xroga capability registry with source evidence, privacy, permissions and measurable tests, **or** provide grounded links/tables and honestly mark this sub-capability unsupported. Do not include random external pixels, user-provided HTML, raw network loads or phantom maps. It is acceptable for a feature to be not ready; not acceptable to claim it rendered.

## 6. DeepSeek model utilization, schema, validation and recovery

Use the existing Zurelay DeepSeek V4.1 Flash 1017 and official DeepSeek Search routes. Inspect the current supported model features and account spending ceilings, not a README assumption. Do not add a new provider or use arbitrary undocumented SDK parameters.

1. Understand the requested deliverable with a small typed intent/answer plan. **Do not require the model to emit every registered UI component schema** or a huge hardcoded library for trivial prompts. The current generated native catalog is the source of truth; retrieve the relevant schema groups on demand without permanently narrowing what can be requested. Non-English prompts and paraphrases must receive equivalent capabilities.
2. Avoid forcing very long reasoning/high effort on trivial outputs. On difficult research/architecture/multistep instructions, use the highest **supported and measured** reasoning effort appropriate to actual gains; track first-token/complete time, quality, reasoning tokens and costs. Context, output and tool continuity must respect provider contracts. Bigger output windows alone don't fix missing data.
3. Stop silent loss of essentials when OpenUI program fails. Classify failure: syntax, schema, missing refs, invalid function, ungrounded source, data mismatch, incomplete program, optional visual failure, irrecoverable required interaction. Keep canonical prose intact and preserve any individually valid control groups. **Do not tell users to change a slider that wasn't rendered.** Recover or explicitly say which requested capability did not complete.
4. Before accepting a UI program, test all live bindings: state dependencies, pure function evaluation, numeric edge cases, true control interactivity, source IDs and no runtime exception. The current validator can reject valid sensitivity examples or formulas when it confuses example assumptions with active readouts; correct the semantic validator, not the user data. Preserve true detected errors.
5. For model-produced compound answers, require a final supported-format checklist: requested item count, entities, official sites, sources, fields, chart axes, interactions, file format, conclusion. Apply deterministic validation and bounded targeted repair, not giant loops that multiply provider cost/latency and reintroduce contradictions.
6. Prompt injection/uncertain website data remains untrusted. No invented application tools, link URLs, code execution, verified evidence or actual task completion. Content generation may be automatic; sensitive external side effects require real permissions.

## 7. Accuracy and editorial integrity

Recent live defects cannot be solved by superficial visual styling:

- **Seasons:** user requested one factual sentence; previous Workspace displayed a corrected answer plus a rejected “original draft,” retaining an inaccurate angle reference. Correction belongs in **the** final answer, not in duplicated before/after narration unless the user asked to compare drafts.
- **JS Number/parseInt:** correct parse semantics; avoid claiming optional signs work on prefixed hexadecimal without checking the actual runtime. Provide requested code with a true Copy control.
- **Arabic rewrite:** do not add an invented “prior commitment,” promise or unexplained reason. Respect exact weekday/time, user tone and length. Test RTL at 320 px.
- **Negative cash flow:** a correct $0 total is insufficient if the requested signed chart disappears or loss bars no longer show below zero. Keep the data series and graph consistent.
- **Tables and statistics:** distinguish percentages from percentage-point change, median from mean, sort numeric values numerically, preserve signed zeros/decimals and ties, avoid chart/data mismatch and false precision.
- **Editorial deduplication:** verify equivalent tables across Markdown and native cells even when formatting varies (`12000`, `12,000`, `$12,000.00`), but do not remove a chart’s necessary accessible table, new assumption, or user's explicit repeat request.

Add property-based/metamorphic tests: paraphrases, random entity counts, shuffled column order, negatives, zero denominators, timezones, RTL, alternative currencies, decimals, sparse sources and unknown layouts. Never train the response engine by appending hardcoded text for every failing fixture.

## 8. Files and artifact generation: real bytes, not visual theater

Preserve existing DOCX/PDF/XLSX/PPTX generator. Build and verify document contracts independent of exact trigger phrasing: “make a Word memo”, “downloadable editable DOCX cue sheet”, “export spreadsheet with formula”, “one slide deck”, sentence split across paragraphs or languages, and attachments.

- A document request requires an actual downloadable authorized artifact; native text representation alone does not finish it. Never claim it is downloadable when file creation failed.
- DOCX: editable headings, lists/tables, no duplicated entries, accurate referenced values. PDF: readable typography, page boundaries and links. XLSX: exact rows/types/formulas where supported, no formula injection/incorrect recalculation. PPTX: legible slides, no overflow or blank content. Inspect programmatic structure and rendered sample.
- Verify MIME, extension, length, zip part validity where relevant, formulas, image placement, source links, ACL and exact user-owned byte identity after download / Share / Reopen. No reliance on clipboard copies as proof of file equivalence.
- Private files, inline attachments and connected-app resources must use correct scoped references; no cross-user URL leakage. All snapshots and downloads require authentication and revocation behavior.

## 9. Persistence, sharing, streaming, long jobs, app UX

- One chat, one Workspace: users ask follow-ups, research, work with files, launch tasks and interact with answers without switching manual modes. Conversation remains responsive during long tasks. Preserve context, file references and per-run ID; avoid duplicate task creation when client reconnects.
- Share/Copy/Reopen must preserve canonical text, citations, requested artifact, UI program, source IDs and data; renderer may initialize interactions from original defaults, but must not change facts. Expired/revoked shares must fail closed.
- Model streaming: render stable validated complete prefixes, not half-formed syntax/flash of different answers. Cancellation stops pending provider/tools, persists already verified partial progress, and never marks a broken output complete. Reload/resume under the same tenant retains source identity and tool receipts.
- UI errors: readable noninvasive recovery, no huge internal debug traces, no duplication from error boundary fallback. Distinguish incomplete research, provider error, authorization need, tool failure, output limit and missing external data. Don't show irrelevant confirmation cards for normal public answers.
- Performance: instrument route/classification, Search, private storage, budget admission, Zurelay planner and synthesis, parse/validate, render, citation lookup, artifact conversion and persistence separately. Report distribution and failures; optimize redundant model calls and repeated sections. Measure time to **verified useful result**; fast but incorrect is not success.
- User preference: visible usage allowance as accurate percentage remaining when relevant, not token/dollar accounting UI. Internal ledger and quotas stay precise.

## 10. Accessibility, responsive, security and privacy

Include systematic checks at 320, 360, 390, 768, 1024, 1280, 1440 and 1920 px; dark/light; browser zoom 200–400%, reduced motion, RTL, 1.5× text, screen readers and keyboard-only navigation. No overflow from citation-chip margins, chart tooltips, long URLs, nested tables or diagram node labels. Controls have semantic name and predictable focus.

Keep strict no-arbitrary-HTML/no-remote-script/native sandboxed function evaluation, sanitation, CSP, signed private media only, SSRF controls for Search URLs, proper credential redaction, tenant RLS, token/approval safety and accessibility. Test anonymous, foreign-account, revoked share, stale signed URL, same-source retry, prompt-injection content and idempotent provider settlement. No bypass of an authorization gate just to satisfy a demo.

## 11. Required REAL acceptance campaign (not a 30-row spreadsheet with 'contract checked')

**Existing cases:** execute *the exact original 30 user prompts* (original prompt file, no paraphrase unless explicitly marked) with live Xroga and, when the authorized Chrome session is available, live ChatGPT. The last report still marked most cases UNRUN. Keep columns: baseline production, latest candidate, matched ChatGPT, controlled-replay-only, provider receipts, target requirements, correctness, UI choice, interactivity, citations, duplicate count, desktop/mobile/a11y, artifact bytes, latency, cost, pass/fail. Do not blend unlike model settings or old source versions.

**New cases:** use the [80-case acceptance specification](../../operations/native-openui/WORKSPACE-UNSEEN-80-CASE-ACCEPTANCE-20261122.json). This is an 80-case **test design**; implement the harness and test them independently rather than marking the JSON passed. Run both broad and priority cases, with randomized/held-out variants across at least: concise facts, translation/RTL, writing, long synthesis, public live research, domain sources, ranking, math, numeric statistics, charts, date/time, code, system diagrams, interactive calculators, filters/tables, file exports, maps/media, connected-task receipts, unknown mixed requests, privacy/adversarial and resilience. Ensure no hidden provider-only/mock wins are marketed as live.

**Evidence bar:** fresh Zurelay answer inside exact-commit signed-in protected Workspace, real official Search for research prompts, true outside-source clicks/URLs, real input controls operated and reset, screenshots at breakpoint widths, artifact downloads validated from bytes, saved history/Copy/Share/Reopen after reload, foreign-account denial and no duplicate ledger charge. Test production after canary before claiming release.

**Comparison to ChatGPT:** assess actual output quality and interaction against the same prompt and comparable permitted sources. Do not copy ChatGPT's proprietary markup/code, inspect secret tokens or use its session without legitimate permission. A 30/30 contract inspection is not ChatGPT parity. Where ChatGPT is unavailable, label comparison NOT_RUN.

**Go/no-go scoring:** P0 exact-request blockers must all pass; no missing required official links, unsupported factual claim, dead control, missing requested file, false “completed”, relevant stale data, extra unauthorized external action, source leakage, broken mobile layout, or duplicate core answer. P1 quality metrics include completeness, appropriate visual selection, coherence, source relevance and latency. Report per-category rates, confidence intervals/sample counts and holdout failures without claiming a universal 100% success rate.

## 12. Practical order of work, with no artificial stop after the first success

**Sprint A / P0: prove the fixed live research chain.** On current HEAD, reproduce the ten-company ranking with authentic Search and require official-link coverage. Add first-party domain coverage projection + targeted bounded follow-up (if needed), no invented domains. Fix actual duplicated visible content (not just a captured table); responsive source previews; authenticated Copy/Share/Reopen on the **new** output. Budget receipt, storage readback and URL mapping. Keep source-matched screenshots.

**Sprint B / P0: remove general model-to-UI loss.** Audit how sections/Markdown/prose outside renderer double-render. Implement canonical answer projection and schema validator fixes; enforce one source of truth; preserve requested interactive controls, chart/table and code. Run live negative-bars, calculator, sortable table, translated draft, one-sentence scientific answer, JS debug and complex diagrams.

**Sprint C / P0: generalize artifacts and mixed responses.** Verify real DOCX/PDF/XLSX/PPTX bytes and natural phrasing with fresh live model; connected data/links, code Copy, chart tooltips, icon choice, diagram links, popover/focus, share and history.

**Sprint D / P1: broad generative robustness.** Execute 30 exact + 80 unseen tests. Diagnose unknown-prompt failures; add generic schema/property validation, source coverage and UI composition improvements rather than prompt-specific keyword patches. Bench source relevance, editorial style, token+wall cost and performance.

**Sprint E / release:** fresh paired immutable protected Vercel/Cloud Run/Job builds tied to exact final code, complete CI, tenant/security/provenance gates, URL/ACL tests, authorized canary, independently read back serving SHA, rollback tested. Never auto-promote on a green build alone. Existing production remains unchanged until gates/authorization pass.

## 13. Mandatory report at the end of the execution period

Give the owner **one concise but complete** end-of-work engineering report that includes: latest exact PR SHA; deployed protected candidate and old production SHAs; actual code changes with paths and test receipts; measured Search and model outputs; requested fields/official URL coverage; every actual live tested prompt and failure; 80-case newly run count; Copy/Share/Reopen and download bytes; mobile/RTL/accessibility pass/fail; cross-tenant/security results; costs and latency with sample sizes; any capability whose provider cannot be legally/trustworthily accessed; release decision and exact missing approvals. Keep rollback and storage cleanup evidence.

Do not say complete because 11 workflows passed, because OpenUI lists 55 components, because an isolated preview looked good, or because the file exists in this repo. **A working adaptive universal Workspace is proven by accurate, functional, current, appropriately composed real answers to new prompts, end to end.**

## 14. Source locations and repository references (grounded, no new runtime)

- PR: https://github.com/Xroga/xroga.com/pull/989 (separate from Browser Operator PR #976).
- Latest verification report supplied by owner: `XROGA-WORKSPACE-VERIFICATION.md`, November 21, source head `4941c0c4`, serving markers listed in §1. Use exact local report evidence with screenshots; source path not guaranteed to exist in repo.
- OpenUI pinned: audit `docs/operations/native-openui/CAPABILITY_AUDIT.md` and `coverage.json`, `@openuidev/lang-core`, `@openuidev/react-lang`.
- Open Intelligent UI pinned: vendored functions and component library in `frontend/src/components/native-openui/upstream/` and generated `backend/src/ai/nativeOpenUiFunctions.generated.ts`.
- CopilotKit pinned: ChoicePicker and standard component coverage recorded in `coverage.json`.
- Lucide: versioned same-origin assets under existing generated native icon setup.
- Core response/files/citation sources: `backend/src/ai/nativeOpenUi*.ts`, `nativeDocumentDownload.ts`, `workspacePublicSearch.ts`, `responsePresentation.ts`, `frontend/src/components/native-openui/`, `frontend/src/components/terminal/`, `frontend/src/lib/xrogaResponseDocument.ts`, `frontend/src/lib/xrogaCitations.ts`.
- Test entry points: `scripts/generate-native-openui-spec.mjs --check`, `scripts/verify-native-openui-browser.mjs`, existing isolated authenticated staging flow and both original native `prompt-suite.json` and user 30-prompt parity inputs.

**Important last instruction:** Codex, do not reply only with a plan. Work through the highest-impact code defects now, continue while source changes and tests are available, and clearly separate *implemented* from *tested* from *deployed* from *still blocked*.
