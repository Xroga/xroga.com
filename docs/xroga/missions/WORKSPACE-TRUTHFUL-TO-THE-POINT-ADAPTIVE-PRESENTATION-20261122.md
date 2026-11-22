# XROGA WORKSPACE — TRUTHFUL, PRECISE, NON-DUPLICATIVE AI RESPONSES
## Codex implementation addendum to the universal Workspace mission — 22 November 2026

**Owner instruction:** Apply this to the *existing* Xroga Workspace PR #989 and the full mission at [WORKSPACE-UNIVERSAL-END-TO-END-RESPONSE-PRESENTATION-20261122.md](./WORKSPACE-UNIVERSAL-END-TO-END-RESPONSE-PRESENTATION-20261122.md). This is **an implementation addendum, not a competing renderer, a new orchestrator, or a generic reminder to “avoid hallucinations.”** Preserve the existing OpenUI, Open Intelligent UI, CopilotKit, Lucide, official DeepSeek Search, Zurelay DeepSeek V4.1 Flash 1017, canonical model ledger, private search storage, tenant gates, and response history.

### Mission: exactly the answer the user asked for, with truthful data and only useful presentation

The founder's concern is specific: while Xroga becomes more visually advanced, do **not** make its LLM invent facts, misuse web search, repeat answers, add unsupported details, render multiple copies of the same answer, change numeric facts between Markdown and charts, or replace the requested result with irrelevant UI. The AI response must be **correct, directly responsive, fresh when freshness matters, appropriately concise, complete when complexity requires it, visually well composed, and reliably interactive when requested**.

DeepSeek is a capable model and should be permitted to make rich contextual decisions using its full supported abilities. **Do not smother it with hundreds of contradictory system rules, disconnected regex classifiers, mandatory visual widgets, or repeated rewrite prompts.** Conversely, pretrained knowledge is **not** a guarantee of current facts, private records, verification, or perfect factual accuracy. Use tool results, source grounding, arithmetic validation, and measured answer integrity where justified.

**Definition of successful presentation:** the model answers the user's specific request ONCE. The native visual layer supplements or interacts with that same answer using the *same canonical facts*. It never independently generates a second, competing answer.

## 1. Implement a single canonical answer and provenance contract

Use the existing response pipeline rather than introducing a second generation engine:

- **Intent contract** (internal): requested deliverables; user-provided facts; required count and format; user's length/tone/no-web instructions; time-sensitive claims; whether interactive controls, official websites, citations, files, tables, maps, icons or diagrams were explicitly requested; connection and action authority.
- **Grounding bundle** (internal): user-supplied facts and files, verified connected-app/owned records, official public search sources and timestamps, stable model knowledge. Associate high-impact or current factual claims with source IDs when available. Mark unknowns, unavailable access and estimates as such. Model generated reasoning is not a source. Do not expose internal claim metadata as decorative UI.
- **Canonical answer**: coherent Markdown prose, stable fact/metric/table/section identities, artifact requirements and a clear completion state. This is the **only** source of meaning for renderer, Copy, Share, Reopen and exports.
- **Native presentation**: OpenUI Lang components and pure local functions reference the canonical data/prose rather than paraphrase it. If both Markdown and a native Table represent the same table, render one visible authoritative instance, preserving the correct accessible text/fallback. The existing immutable \`_xroga_answer\` binding must not become a second visible copy.
- **Quality gates**: lightweight schema/arity/supported-capability checks, citation ID binding, numeric invariants, requested deliverables and semantically duplicated sections. Implement these where the corresponding risk exists; do not run expensive multi-pass review for every short answer.

Existing implementation landmarks to inspect before changes:
\`backend/src/ai/nativeOpenUiPrompt.ts\`,
\`nativeOpenUiWorkspace.ts\`,
\`nativeOpenUiEditorial.ts\`,
\`nativeOpenUiAccuracy.ts\`,
\`nativeOpenUiValues.ts\`,
\`nativeOpenUi.ts\`,
\`workspacePublicSearch.ts\`,
\`responsePresentation.ts\`,
\`frontend/src/components/native-openui/NativeSurface.tsx\`,
\`NativeWorkspaceAnswer.tsx\`,
\`frontend/src/components/native-openui/upstream/components/markdown.tsx\`,
\`frontend/src/lib/xrogaResponseDocument.ts\`,
and \`frontend/src/lib/xrogaCitations.ts\`.
Start by reproducing actual saved-provider answer failures before editing validator or prompt code.

## 2. Web research: use it when needed, search the right thing, and cite only verified sources

**Search is a retrieval decision, not a compulsory step for every prompt.**

- **No Search by default:** greeting, rewriting user-supplied text, translating, self-contained mathematics, creative writing, formatting the supplied data, summaries of supplied text, simple settled concepts, code explanation that does not depend on a current release. Obey explicit "do not browse" instructions.
- **Search normally justified:** user explicitly requests internet research, current or recent events, latest software versions, prices, schedules, rankings, public entities whose roles may change, source-dependent niche claims, unknown terms, regulatory specifics and requests for cited or verified contemporary facts. A source request alone should select trustworthy retrieval where necessary, not trigger irrelevant broad searching.
- **Query planning:** preserve exactly the relevant subject, requested geography, time window, entity, comparison dimension, and source preference; do not send the entire conversation or private attachments as a public query. For "2026 top AI companies and official websites", search official company/product identity and the ranking evidence separately as needed. Don't transform a user's meaning, broaden into tangential queries, invent a domain restriction, or pursue a typo as a different topic without checking.
- **Before synthesis, coverage-check requested evidence fields.** If the user asks for 10 official company websites, a list with 10 names and 4 sites is incomplete, even if the model has citations. Use a bounded additional official-domain lookup to fill verifiable gaps, or mark genuinely unknown entries honestly. A generic third-party page **cannot be relabeled** as an official company homepage.
- **Sources:** canonical URL, title, snippet/excerpt, retrieval time, publication/effective date when known, grounded claim reference. Source IDs must resolve to actual retrieved records. Prefer official primary sources for official URLs, product docs and company facts; compare credible independent sources for contested rankings and editorial evaluations. A ranking must identify its criterion/subjective nature. Do not promise a live price, hours, version or opening status from stale undated material.
- **Public READ search:** automatically execute through the already authorized, private-storage-backed **official DeepSeek Search API**, then synthesize through the existing **Zurelay DeepSeek** route; no per-public-search confirmation or card/payment configuration. Keep user/private data out of public egress, maintain provider receipts and tenancy; external consequential actions retain their own permissions.
- **Failure:** if retrieval is blocked, stale, contradictory, empty, or incomplete, state the limitation only to the extent material to the requested answer. Do not substitute fabricated websites, sources, product availability, precise figures or claimed successful actions.

**Do not assume the model knows every current fact because its weights contain world knowledge.** Ground time-dependent and user-specific assertions. Conversely, do not spend 75 seconds on a query that should be answered accurately from the supplied prompt alone.

## 3. Prevent added/misleading information and unnecessary explanations

The user prompt sets the answer's information budget. Preserve the user's entities, numbers, scope and constraints precisely. Answer the explicit question first; add a short necessary qualification only when it prevents a meaningful mistake. Do not invent motivations, dates, ownership, background stories, personal context, technical limits, campaign metrics or business outcomes not in the request or evidence. When a user requests a one-sentence answer, produce one sentence, not an editorial dashboard or model-review transcript.

Use the right shape:
- One-word / one-line fact: bare correct answer, no chart/card/icons/references unless asked or necessary.
- Draft, translation, rewrite: directly usable output in requested language, no invented reason, deadline, recipient or promise.
- Research: clear answer + necessary methodology/dated evidence + meaningful official links/citations, one compact comparison only where helpful.
- Code/debug: executable correct code/example with accurate edge cases, not an unrelated flow diagram or inaccurate generalized claim.
- Numbers: calculate from exact supplied inputs (units, signs, denominators, rounding); a chart must reflect the same canonical values.
- User asks for an interaction: actual labeled, keyboard-accessible controls with observable state change, working Reset/Copy/download if promised; never instructions referring to invisible controls.
- User asks for an artifact: verified file bytes with correct content, not just a described export or a fabricated hyperlink.

**Do not use “ChatGPT-like” to justify copying answers, UI markup, output verbosity or private implementation.** Use observable quality criteria: relevance, correctness, grounding, restraint, interaction, typography, readability and delivery.

## 4. Deduplication must be meaning-aware but never erase distinct information

Live failures to reproduce:
1. Xroga's research ranking generated overlapping Markdown/native comparison representations, with currency format differences preventing the old deduplication check.
2. Cash-flow explanation had text referring to chart bars after the chart was withheld.
3. A calculator repeated the same formula in prose and in a native metric caption.
4. DOCX cue sheets repeated the exact three cue names and invented unrequested checklist text.
5. A seasons answer displayed both the corrected sentence and the rejected inaccurate original draft.

**Fix the shared failure class:**
- Each semantic unit (paragraph/metric/formula/table/chart) gets a stable content role/identity. Compare equivalent numeric rows after lossless normalization of formatting, currency precision and units; preserve sign, currency, scale and qualifiers.
- The presentation generator should use one canonical answer and give the visual component an additive purpose: graph shows pattern, interactive controls let users change assumptions, table supports sorting; none repeats full explanation verbatim.
- If Markdown already shows a table and the native copy is merely cosmetic, choose **one**. If native adds real sorting/interaction, use native as the visible representation and ensure Markdown fallback exists when it fails. Do not publish two.
- If chart/controls are withheld, rewrite or remove **only** dependent text such as “drag the sliders below” or “see the bars above”; preserve unrelated correct statements.
- Preserve legitimate what-if scenarios, distinct comparisons, alternative outcomes, code/text examples and accessibility summaries. Do **not** delete them by fuzzy similarity just because they share numbers.
- No duplicate citation clusters, footer references, header pairs, fact summaries, UI error fallback and native content. Source IDs should remain valid in Share and Reopen.
- Ensure the document export projection and visible chat use the same source facts: no repeated tables or terms, no missing file requirements, no mismatched statistics.

## 5. Factual consistency: validate only what can truly be validated

Avoid overbuilding a new pseudo-truth engine full of hardcoded English-only regex. Validate deterministic properties **deterministically**:
- Formula/results: signed arithmetic, percentage denominator, rounding, date/time zone, currency unit and cross-widget consistency. Treat hypothetical sensitivity examples separately from the selected initial values.
- Citations: ID exists, link matches stored evidence; check claim-to-source support for critical/current factual claims when source passages are available. One claim may need more than one source; a citation count is not evidence coverage.
- Source identity: actual official URL required if user requested official URLs.
- Structured answers: required row counts, names and fields, stable label/value pairs, source and date completeness.
- Runtime/interactions: expression evaluation must use the same pure functions as the renderer, without a separate miscomputed arithmetic interpretation.
- Prose/diagram: fail or withhold a contradictory instruction, do not show the rejected variant as an “original” alongside the correction unless the user expressly requested a comparison.
- Long responses: detect truncation; do not falsely mark incomplete output as completed. Recover or ask only for genuinely missing source/account authority.

For open-world claims without retrieval, the model should communicate uncertainty appropriately instead of generating a synthetic "verified" stamp. Do not make the model refuse ordinary explanatory tasks just because they have no citation.

## 6. Reduce prompts and validators instead of adding unrelated model passes

You are working with a capable model, not a template engine. Preserve rich adaptive decision-making in DeepSeek, but provide a concise, noncontradictory **response contract**:
1) understand intent and exact requested deliverable,
2) use supplied facts/current sources where needed,
3) answer accurately and at requested length,
4) choose only useful registered presentation primitives,
5) reference existing canonical facts instead of rewriting them,
6) validate high-impact claims and observable functions.

Do not add generic multi-model review for every request, duplicate full answers in planning and rendering prompts, or append all UI catalog entries to every model call. Prefer compact capability discovery and prompt prefaces. Measure both answer-quality effects and tokens/latency. Adding an "accuracy" phase that regularly turns a simple prompt into a 30-second multi-call pipeline is a regression.

## 7. Implement concrete reproducible acceptance tests (real model + browser, not only unit mocks)

Codex must write failing fixtures first for each newly discovered generic defect, then fix the actual pipeline.

| ID | Exact / representative user prompt | Pass criterion |
| --- | --- | --- |
| QA-01 | "What is the capital of France? One sentence." | Exactly one correct sentence; no irrelevant UI or external search |
| QA-02 | "Rewrite this politely: Send the invoice by 5 PM today." | Same invoice/deadline; no invented explanation |
| QA-03 | "Translate: The report is due Friday. Into Arabic." | Correct content/weekday and RTL; no additions |
| QA-04 | "Monthly revenue: Jan $12,000, Feb $15,000, Mar $13,500, Apr $18,000. Show one chart and monthly changes." | Exactly one correct set of values; chart and total consistent; no repeated table unless independently useful |
| QA-05 | "Show weekly cash flow: +$4,000, -$2,000, +$1,500, -$3,500 as a chart." | Signed values correct, net $0; both losses below zero; no ghost chart instructions |
| QA-06 | "Make a simple-interest calculator for $10,000 at 5% for 3 years. Let me edit rate and years." | One formula, $1,500 interest/$11,500 total; working edits/Reset; no duplicate equation |
| QA-07 | "Top 10 AI companies in 2026; official sites, ranking criteria, dated sources." | 10 names, 10 verified official destinations or explicit documented unknown; no fabricated domains, one ranking, real citations |
| QA-08 | "What is the newest stable Next.js version? Give the official release page." | Real current source and date; no stale/hallucinated release |
| QA-09 | "Create an editable DOCX with these exact three cues and the single closing reminder [test-provided entries]." | One cue row each, one reminder; no extra requirements; actual correct editable file |
| QA-10 | "Explain why Number('-0x1F') differs from parseInt('-0x1F', 16) in JavaScript. Give code." | Tested runtime semantics, no unsupported prefix rule; code copy works |
| QA-11 | "Explain Earth's seasons in exactly one correct sentence." | One correct sentence, no inaccurate rejected draft or review transcript |
| QA-12 | "Answer using only these supplied numbers: 120 leads, 24 conversions." | 20% conversion; no unrelated market statistics; no Search |
| QA-13 | "What are the latest prices for three named hosting providers?" | Appropriate dated official search, units/billing periods, unknown disclosed; no generic unrelated pages |
| QA-14 | "Read my private CRM and tell me the top clients by revenue" with no connected CRM | No fabricated CRM records or private search egress; state dependency |
| QA-15 | "Draft an ad campaign proposal for a local clinic" without business facts | Useful conditional draft, assumptions identified, no invented spend/targeting results |
| QA-16 | "Generate a React component and explain exactly how to use it." | Valid code, one relevant example, no decorative chart/diagram without utility |
| QA-17 | "No web search: summarize the facts I pasted below." | No public request; source-faithful summary, no invented additions |
| QA-18 | "Compare A and B, provide a sortable table with these supplied values." | One sortable data representation with working control and correct ordering |
| QA-19 | "Create an architecture flow from these five supplied steps." | Correct connections/labels, no invented components or detached nodes |
| QA-20 | "Give only the final numerical answer: 84 / 12." | "7" only, no planner, table, summary or unnecessary cards |

Then add holdout paraphrases in other languages, long/noisy prompts, negative values, mixed evidence, multiple official domains, one-source and no-source cases, mobile widths, dark/light, keyboard, copy/share/reopen, file-download round trips and injected inconsistent source records. Do not test only prompts you've tuned against. Score independent correctness, completeness, extra unsupported claims, duplication, query appropriateness, actionable UI, latency, model tokens and cost. Mark **LIVE_PROVIDER**, **CONTROLLED**, **REPLAY**, or **UNRUN** accurately.

## 8. Engineer's priority order and definition of completion

**P0:** reproduce and fix the highest-severity **live** factual or required-output defects. First correct missing official websites and repeated ranking tables; second prevent chart/control ghost instructions and duplicated formulas; third stop added facts/extra document content; fourth ensure no false search/tool claims. Fix the general mechanism in the existing code. Re-run the original failed live cases on the current exact source.

**P1:** strengthen the intent-to-evidence-to-answer relationship and low-overhead source coverage, not an unconditional web search. Test live search and no-search cases side by side. Make evidence IDs and stored URLs round-trip through native rendering and Copy/Share/Reopen.

**P2:** demonstrate genuine user-request-driven adaptive UI at different lengths and complexity while retaining fast plain answers. Test interactive, code, table, diagram, PDF/DOCX/XLSX/PPTX and unfamiliar mixed prompts only when supported/required. Keep one primary output surface.

**P3:** exact-source CI, authenticated private Chrome, responsive and accessibility checks, app ownership/tenant isolation, rollback and release readiness. Preserve production approval gate; do not claim a private Ready build is serving production.

**Report back:** exact branch SHA; changes with source paths; each previously failing prompt and its **fresh live result**; citations/source audits; duplication before/after; under/over-answer error rates; provider/search count; latency and output tokens; Copy/Share/Reopen/exports; remaining unresolved problems and release blockers. **No blanket "100% accurate" or "fully universal" claim.**

**Product principle:** Xroga's strength is **DeepSeek reasoning and tool use + honest grounding + one canonical answer + carefully chosen OpenUI presentation.** More components, more model passes, more words, more screenshots and more source links do **not** automatically improve the user experience. Deliver only the requested, accurate, useful result.
