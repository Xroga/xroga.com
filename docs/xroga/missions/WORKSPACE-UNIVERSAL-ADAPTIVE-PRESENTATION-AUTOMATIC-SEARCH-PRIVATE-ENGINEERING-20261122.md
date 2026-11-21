# XROGA WORKSPACE — UNIVERSAL ADAPTIVE RESPONSE ENGINE, ZERO-FRICTION PUBLIC SEARCH, PRIVATE BACKEND, PROFESSIONAL COMPOSITION

**Owner's corrective implementation mission for Codex — 22 November 2026**  
**Repository:** `Xroga/xroga.com`  
**Working pull request:** [Workspace PR #989](https://github.com/Xroga/xroga.com/pull/989), branch `codex/workspace-adaptive-acceptance-20261114`  
**Distinct from:** Claude's Browser Operator PR #976  
**Supersedes in priority:** attempts to finish this mission by tuning an enumerated set of sample prompts, replacing the renderer, increasing the number of components, or filing another status-only report.  
**Companion missions:** `WORKSPACE-UNIVERSAL-END-TO-END-RESPONSE-PRESENTATION-20261122.md` and `WORKSPACE-TRUTHFUL-TO-THE-POINT-ADAPTIVE-PRESENTATION-20261122.md` in this directory. Reuse their validated contracts; the implementation below gives the urgent corrections more precision.

## 0. A direct product principle

**Xroga Workspace is a general-purpose AI workspace for unbounded user intents. It is NOT an 80-prompt template app, a fixed set of dashboards, or a search client that demands consent for its own API calls.** The user sends a prompt. DeepSeek understands what output best serves it. It uses authorized evidence sources and the registered OpenUI component vocabulary to compose a clear, accurate, restrained, functional response. The user should experience the *result*, not the internals of billing, authorization, routing, planner, model selection, developer trace, implementation metadata, or model-call accounting.

A universal system does not require a custom component for every future task. It needs general-purpose compositional primitives, trustworthy functions and tool results, dynamic capability discovery, dependable rendering, flexible data/interaction binding, compact presentation conventions and safe fallbacks. The model must remain free to choose arrangements of approved components rather than be trapped in a small intent-to-template table. More components, longer prompts, extra model calls and bright UI are not automatically improvements.

**Security boundary:** This request authorizes ordinary platform-funded public READ searches and normal product engineering without extra per-search permission dialogs. It does **not** remove actual external-user consent for publishing, sending messages, spending a user's advertising money, purchasing, deleting, changing permissions, granting account scopes, accessing unconnected private data or other consequential effects. Preserve those specific gates. Keep internal model/provider cost and instrumentation private by default.

## 1. Grounded evidence from the owner-provided 20.53-second production screen recording

Video: `20261121-2104-50.8655741.mp4` supplied by the owner. Sampled the visible frames in the current task; these are **observed** facts, not assumptions about unseen output behavior.

- **00:00–00:06**: signed-in `xroga.com/workspace`, user prompt similar to **"top 10 best ai companies of 2026"**; Workspace starts and shows a status saying Black Hole is working / starting request.
- **~00:09–00:12**: in the Workspace response area, instead of a researched answer, it renders a card **"Search the public web"**, **"Review details"**, **"Up to $0.00575"**, **"Confirm action"** and **"Cancel"**. This blocks ordinary public research and leaks provider-cost accounting into a consumer-visible answer.
- **~00:15–00:20**: opening Review details navigates away from the chat to `/dashboard/actions/confirm/<id>`, to a **"Review action"** screen for `Xroga Native Research` and risk `Write`. It displays account `deepseek-search:platform`, operation `XROGA_RESEARCH_SEARCH`, digest, spend ceiling `5750 micro-USD` and a critical-parameters JSON preview.
- **Observed classification bug:** a platform-paid **public retrieval** is presented as a high-risk *write* needing interactive account-level approval. That classification is not appropriate to this workflow.
- **Limited observation:** The recording does *not* show a generated research answer, a chart, a calculator, or responsive desktop/mobile output. Reports of oversized, misaligned components and duplicated answer content come from the owner's separate usage and earlier authenticated verification runs, not directly from these 20 seconds.

**The user-facing target for this exact prompt:** “Searching the web…” (optional discreet status), then the complete ranked and grounded answer in the same conversation. No confirmation card, no `Review action`, no backend cost, no operation JSON, no provider name exposed, no redirect, and no dead-end. Link each official website if requested, cite actual results, and do not invent the rankings as objective fact.

## 2. Actual repository root causes to investigate and correct

At the source inspected immediately before this document, the latest PR #989 head was `6f9693bd38c6952f5cd35b8f4d5147d2fb20409a`; **re-read the current HEAD before editing** because the branch changes during Codex work.

### A. Two competing public-research routes

`backend/src/ai/parallelApproval.ts` contains TWO very different paths:

1. `prepareParallelApproval(...)` constructs a `BusinessActionPlan` for native research with a `risk:'write'` / confirmation request and returns `{needsConfirmation:true, reviewUrl:'/dashboard/actions/confirm/...', message:'Research has not been sent...'}`. It uses the server's business-action confirmation machinery. This is the **observed class of mistaken path** in the video.
2. `executeWorkspacePublicSearch(...)` already performs an **automatic scoped READ/PUBLIC** lookup. It checks platform account authority, calls `workspacePublicSearchQuery`, invokes official DeepSeek Search, enforces the server's egress and canonical accounting, saves the evidence privately and returns it to answer synthesis. Private research and truly consequential operations retain their separate gates.

**Implement a definitive router invariant:** every normal signed-in Workspace prompt that entails **public, non-private, server-funded READ research** must use the second path, not the prepared external-write confirmation path. Trace all entry points: new conversation, resumed conversation, expanded project, “Search the web” explicit command, automatic semantic research decision, cached search/evidence, and follow-up questions. Compare the actual serving production branch/API/aliases to the PR branch; a staging fix is not proof the production domain uses it. Do not simply change `risk:'write'` to `read` on an existing pending confirmation; ensure the request enters the proper already-accounted read transport **before** any confirmation record is created.

**Decision contract** (illustrative, not an exhaustive keyword classifier):

```
USER PROMPT
  ├─ Ordinary public fresh information needed or explicitly requested?
  │     └─ yes -> authorized platform READ/PUBLIC -> official DeepSeek Search ->
  │               private evidence and provider receipt -> Zurelay answer ->
  │               OpenUI presentation in same chat. NO per-search confirmation.
  ├─ Supplied data / stable explanation / translation / calculation / no-web?
  │     └─ answer directly with DeepSeek, no external search.
  ├─ Private connected source?
  │     └─ verify actual user connection and scope; read with existing authority.
  └─ External side-effect (send, publish, purchase, spend user funds, delete)?
        └─ enforce action-specific existing approval/permissions; never execute silently.
```

Don't force the above into a brittle English phrase lookup: use the existing semantic planner and authoritative permission/evidence classifier, with targeted deterministic safety checks. Failure of Search should yield a graceful sourced limitation, not a navigation to internal review screens.

### B. Consumer-visible confirmation renderer

`frontend/src/lib/formatAiMarkdown.tsx` renders `BusinessActionConfirmationInline`. Its source includes a `savedSearch` special case for `xroga-native-research`, and presents `Review details`, `Up to ${maximumSpend}`, and a confirmation action. `frontend/src/context/TerminalChatContext.tsx` additionally includes handoff support for pending research confirmation and receipt revival. `frontend/src/app/(shell)/dashboard/actions/confirm/[id]/page.tsx` renders `approval.accountReference`, `approval.operation`, digest, ceiling and critical JSON. `backend/src/services/integrations/businessActionConfirmations.ts` can serialize those fields to a response; `backend/src/routes/phase1.ts` includes confirmation-required events.

**Fix the root path first**: platform public READ should never produce these confirmation UI objects. Then **minimize client data exposure** for normal users. Remove platform research accounting/credential identifiers/internal operation JSON from the consumer response payload entirely, not just by CSS `display:none`. Treat model receipts, provider costs, queue names, internal strategy IDs, planner budgets, token counts, prompt injection diagnostics, private storage keys, action digests and server traces as server-only data (with privileged operator diagnostics, separately authenticated). Return the minimum semantic status for ordinary progress, e.g. `{phase:'researching', kind:'public_web'}`. A user-requested account-billing page may show **their own product charges/allowance**, never the platform's upstream secret accounting. Avoid making production logs, history, Share, exported Markdown, errors, browser DevTools network payloads or citation footnotes leak these internal fields.

**Do not remove real audit records, provider settlements, cancellation, retry safety, user-to-tenant checks or consent screens that protect consequential effects.** Admin/operator logs remain available only through audited privileged backends.

### C. OpenUI already exists; stop building fixed prompt-specific UI

`docs/operations/native-openui/CAPABILITY_AUDIT.md` and `coverage.json` report 55 registered native components and 30 functions, plus Open Intelligent UI, CopilotKit adapters and approximately 1,986 Lucide icon names. The actual code includes `backend/src/ai/nativeOpenUiCatalog.json`, `nativeOpenUiPrompt.ts`, `nativeOpenUiWorkspace.ts`, `nativeOpenUi.ts`, `nativeOpenUiValues.ts`, `nativeOpenUiEditorial.ts`, `frontend/src/components/native-openui/NativeSurface.tsx`, `upstream/components/components.css` and `surface.css`. Use **one** existing renderer and pure-state execution system; do not install another competing renderer, model service, arbitrary HTML/JS execution or an unconditional widget template generator.

The current prompt emits Markdown plus OpenUI Lang and an `_xroga_answer` reference. The current surface may also place `summary` outside the renderer, the native renderer inside, and `details` below. This can cause repeated facts or oversized stacked blocks if the model and native document duplicate each other. Normalize one canonical answer and bind UI to it; do not merely delete text indiscriminately or lose accessibility fallback.

## 3. Universal adaptive output: model-selected composition, not prompt-to-template lookup

Implement (or strengthen, if present) a **general response composition contract**, keeping the model's supported free-form reasoning and OpenUI language:

```
Intent = {userGoal, requestedDeliverables, audience, length/tone, constraints,
          mustBeInteractive, evidenceRequirements, outputFormat, deviceContext}
Evidence = {userFacts, authorizedRecords, retrievedSources, timestamps, uncertainty}
Answer = {canonicalMarkdown, stableSemanticSections, metrics, evidenceRefs,
          artifacts, state, completionStatus}
Presentation = OpenUI program referencing Answer's data and approved component registry
```

**Not** a code branch for “top AI companies”, “interest calculator”, “email”, “CRM”, “weather”, “travel”, “sports”, etc. No millions of special cases. Use a **composable library**: Col/Row/Grid, Text/Markdown/Section, Cards and compact callouts, typed Table, Chart, Diagram, Code, Math, controls and state, icons, link/citation, file previews, popovers and small media only with trusted resources. Let model decide what to combine, based on the user's actual job. The registry/schema is stable; the **arrangement/content is generated at runtime**. Unfamiliar requests must still produce clean Markdown, and add supported rich structure when genuinely useful. If a specific rich interaction is not supported, preserve a correct readable answer and mark missing functionality honestly; do not hallucinate a control or render a button that does nothing.

Use **capability discovery by semantic need** rather than dumping the entire component/function catalog into every model call. Allow the model to choose from named component groups (data, flow, forms, media, copyable drafts, code, resources) and obtain the corresponding validated spec. This avoids both hardcoded prompt layouts and enormous prompts. Don't hide needed components because an English regex did not match the request. Benchmark unfamiliar/RTL/long mixed prompts; the renderer should handle combinations of primitives it has never seen paired together.

**OpenUI capability ≠ content knowledge**: DeepSeek should compose the presentation, but the requested facts remain grounded in prompt/data/evidence. Do not let the visualizer invent a second narrative, extra figures, assumptions, claims or sources. Preserve ordinary text-only outputs when rich UI is unnecessary.

## 4. Professional UI layout policy (concrete sizing, spacing and hierarchy)

The problem is not simply color: users report huge charts, calculators, tables, random cards, overly large headings, poor alignment and excessive empty regions. Codex must build and verify a **shared density-and-measure policy** at the component and response-container level, not tweak one demonstration screenshot. Use the **existing tokens and design system**; the measures below are starting targets, not an excuse to hardcode all layouts:

| Element | Default engineering target | When to expand |
| --- | --- | --- |
| Answer reading column | Comfortable readable measure, roughly **680–840 CSS px max** on desktop, responsive to actual chat pane; no forced narrow 400px area in a wide pane | Wide datasets and architectural diagrams may use a scoped wide surface within the conversation |
| Heading hierarchy | H1 within answer usually about 22–28px; H2 about 17–21px; H3 about 15–17px. No 40px decorative headers for ordinary replies | Only genuine long-form artifact cover/hero intentionally requests it |
| Body and captions | Body around 14–16px / 1.45–1.7; captions around 12–13px, adequate contrast | Accessibility text scaling and readable dense data tables |
| Response spacing | Use a consistent 4/8/12/16/24px scale. Section gap typically 16–24px; inside compact card 12–16px; avoid stacking 3 large cards for a 2-sentence answer | Complex documents may need more whitespace between independent sections |
| Tables | Intrinsic/minmax columns; compact cell padding around 8–12px; numeric columns right-aligned and aligned on digits; header visible and readable | Table can scroll horizontally *within its boundary* on mobile, never overflow the entire chat |
| Charts | Prefer compact chart height approx **240–360px** in normal answer; bounded max width; labels/legend understandable; preserve negatives, units and source data | Deliberate dashboard, detailed scatter or dense chart may request larger/expandable surface |
| Calculators/forms | One clear result with inputs grouped compactly; don't make a 2-input calculator a full-page modal; bounded max width, functional Reset, keyboard labels and state | Complex multi-field financial planning may use stages or an expandable detail panel |
| Diagrams/flows | Fit connected nodes and labels, at natural width; no uncontrolled giant SVG or detached edges; allow scoped scroll/zoom for broad graphs | Complex explicit architecture can offer full-screen/expand without breaking reading width |
| Cards and badges | Use only when they improve grouping or selection; subtle borders, neutral surfaces and restrained accent | Significant status/alert/action meaning, not decorative color for every heading |
| Mobile 320–390px | No body horizontal scrolling, no clipped chart labels, no invisible control, no overlay collisions or giant empty margins; compact responsive stack | Individual wide data content may scroll within itself with visible affordance |

**Enforce dimensions in component-level CSS and layout containers**, including the current `.iui-card`, `.iui-grid`, `.iui-title-xl` / `2xl` / `3xl`, `.native-diagram`, chart wrappers, `.xroga-native-openui`, side panel and copied/shared renderers. Use responsive `minmax()`, sensible `max-width`, CSS containment/overflow, typography tokens and non-overlapping zoom/long-label behavior. Support 320, 360, 390, 768, 1024, 1280, 1440, 1920px, light/dark, RTL, 200% browser zoom and keyboard-only access. Don't “fix” appearance by hiding data, shrinking text below accessible sizes, hardcoding exact desktop offsets or clipping charts.

**Component size should follow information density and task intent**: direct fact = prose; ranking = one compact list or table (depending user request) with citations; short comparison = two columns or a tight table; true interactive calculation = one correctly sized control surface; workflow = connected compact flow. More UI is not necessarily better UI. No giant default callouts, badges, rounded blocks or dashboard framing on every prompt.

## 5. One canonical answer; no misinformation or duplication

Implement shared semantics so content is authored **once**. The OpenUI program references canonical Markdown, metrics and verified source IDs rather than paraphrasing entire answer blocks. Use semantic block IDs/roles to avoid rendering the same table in Markdown and native Table, the same formula in a metric caption, or a second answer below a validated native response. Deduplicate equivalent formatted numbers without confusing different hypothetical scenarios. Never suppress necessary chart accessibility data, sourced explanatory prose or distinct conditional alternatives.

Before publishing, enforce proportional checks:

- **Exact user request:** entity count, requested official URLs, chosen language, units, source dates and specific deliverables all covered. No invented background details, extra reminders or false claims of completed external operations.
- **Search evidence:** source URL/id actually exists and supports relevant factual claim; sources are not guessed. A ten-company ranking that omits six official websites is a *failed output requirement* even if it has citations.
- **Numerical consistency:** signs, units, arithmetic, formula results, rendering, table exports, chart series and interactive initial readout match. Preserve scenario sensitivity examples.
- **UI validity:** approved OpenUI grammar and pure functions, no arbitrary remote code, all controls callable and bound, no fake downloads, no broken icon identifiers, correct `reset` semantics.
- **No duplicate representation:** one visible answer, supplemental component only where it adds information or interaction. On renderer failure, use one full readable Markdown fallback without appending old native fragments.

Avoid a universally enforced expensive second model verifier, lengthy tool manifests and English-only regex cascades. Fast stable questions should stay fast. The LLM is intelligent but pretrained knowledge alone is insufficient for evolving public facts or data inside unconnected accounts. Source-check only where needed, with a clear uncertainty boundary.

## 6. Full user experience and backend encapsulation

For **routine public Search**, the user UI should show at most:

- Subtle **Searching sources...** or **Researching...** progress (optional; no modal), cancel affordance consistent with existing product design.
- Completed grounded answer, inline citations and official URLs, any useful rich components, and normal Copy / Share / Reopen actions.
- If there is a real platform-service failure, a **concise actionable error** without backend stack traces, provider account or token/cost information; safely retry with idempotency and the same evidence when possible.

The UI should **not** show: approval card, internal cost (e.g. `$0.00575`), `deepseek-search:platform`, provider billing, internal model ID, `XROGA_RESEARCH_SEARCH`, action digest, JSON parameters, private storage IDs, API route paths, token accounting or server error trace. Those remain in owner/operator controls behind proper roles. Removing the card is insufficient if the network response/Share/export still exposes it. Build consumer response DTOs with deny-by-default for internal fields, unit/integration tests for serialization and privilege boundaries, and harmless minimal user status fields.

For connected private systems, use the real user account connection; show sign-in or account selection only if genuinely absent. For consequential account actions, show a comprehensible confirmation (the intended side effect and destination) rather than dumping internal JSON, and ensure the user grants authority at the correct security boundary. This is **not** the same as platform-funded public read search.

## 7. Full-product testing: unseen prompts, real deployment, visual measurements

Test universal **behavior**, not a fixed prompt menu. The original 30 and new 80 cases are regression / test-seed catalogs, **not** the limit of supported prompts. Add randomized holdouts and adversarial mixed requests. Measure and classify results as LIVE_DEEPSEEK, LIVE_SEARCH, CONTROLLED_PROVIDER, RECORDED_REPLAY, MOCKED_UNIT, and UNRUN; do not combine these evidence levels.

### P0 regression: reproduce exact video first

- Fresh, signed-in browser on **production `xroga.com/workspace`**: enter `top 10 best ai companies of 2026`. Record (a) rendering/no confirmation, (b) request's internal routing decision, (c) official DeepSeek Search invocation, (d) Zurelay synthesis, (e) evidence storage, (f) final answer, (g) verified source links, and (h) Copy/Share/Reopen.
- Repeat on exact-commit protected staging, then compare API/frontend source markers and feature flags. A private staging pass does not validate the public production route. Find which backend caller still invokes `prepareParallelApproval` for this task and prove it was removed from the public READ path.
- Check `Search the public web`, `Review details`, `$0.00575`, `XROGA_RESEARCH_SEARCH`, and `deepseek-search:platform` do **not** appear in the consumer response, copied answer, shared URL payload, saved history or client-visible network body. They may remain in secure operator traces and actual cost ledgers.
- Verify `no web`, rewriting, simple math, supplied dataset and translations make **zero** public search calls. Verify official fresh versions, public rankings, new companies, public prices and dated requests search when relevant. Confirm private/credential-bearing prompts do not leak into public Search.
- Verify the old high-risk account write and actual user ad-spend/publication still receive permission checks. Negative tests must fail closed, not disable all confirmation logic.
- If production still runs older source while candidate passes, document the precise deployed frontend/API/canonical job SHAs, gates, promotion and rollback. Do not claim the fix is live without matching the serving domain.

### Generalization + UI holdout suite

For each group, test at least 2 unfamiliar variants and both simple/complex prompts:

1. Small fact, greeting, concise explanation, explicit one-line answer.
2. Drafts/emails/social posts and language translation including Arabic RTL.
3. Current public rankings and software releases with verified links.
4. Source-rich research with entities, differing date ranges, conflicts and uncertainty.
5. Exact supplied numeric/financial data with negative values, units, percentages and consistency.
6. Sortable and filterable tables, varying columns / long words / changing order.
7. Interactive pure-state calculators/forms/timers, edits and Reset, 2–15 inputs.
8. Technical coding, math, copied code, diagrams/flows, nested dependencies.
9. DOCX/PDF/XLSX/PPTX file requests that produce real bytes and faithful download.
10. Decision frameworks, planning, mixed prose + chart + sources, unfamiliar domain language.
11. Linked private app context, missing connection, false external completion and actual user confirmation boundary.
12. Large answer streaming, partial/truncated model output, failure/recovery, Copy/Share/Reopen.

Test on randomized, **not hardcoded in prompts** values/sections/layouts. Score: requested factual coverage, unsupported claims, search relevance, layout compactness, horizontal overflow pixels, card/chart/form size, heading hierarchy, line lengths, keyboard focus, screenreader labels, actual control action, duplicate semantic blocks, persistence integrity, latency, API charges and error leakage.

### Objective release gate

- **Public Search**: 0 unexpected action-confirmation prompts for authorized public READ; actual official DeepSeek Search and Zurelay response verified on live candidate and on serving production after authorized rollout.
- **Privacy**: 0 exposed platform-cost/operation/account/critical parameter fields to normal users for public research, including consumer API payloads, errors, Copy, Share and saved artifacts.
- **Required output**: complete official links and evidence-backed claims where asked, no fabricated URLs, no silent missing controls/files.
- **Presentation**: 0 body horizontal overflow at 320/390/768/1280/1440 in selected generalization cases; no giant default chart/table/calculator relative to pane; one canonical answer and accessible fallback.
- **Interactions**: 100% of displayed controls invoked in acceptance cases perform their advertised pure-state behavior; successful export bytes reopen correctly.
- **Security**: private search evidence and tenant access isolation preserved; ads purchase/send/delete still gated; active PR and production security checks green at exact promoted SHA.
- **Evidence**: provide raw screenshot/video comparisons and a per-case record. Never claim universal 100% from finite tests; report categories and known limitations.

## 8. Execution order (actual code work, not another study)

**Sprint 0 — Source and serving truth:** sync current PR #989 HEAD, exact live frontend/backend SHA readbacks and confirm owner video reproduction. Preserve PR #976 separation. Capture source files and baseline timing.

**Sprint 1 — P0 public search without consent card:** trace the incorrect native-research confirmation route into `parallelApproval.ts`, `phase1.ts`, `formatAiMarkdown.tsx` and Workspace routing; use `executeWorkspacePublicSearch` for signed-in public READ; preserve private-account actions as separately authorized. Verify end-to-end in signed-in candidate.

**Sprint 2 — P0 backend data privacy:** replace consumer public-research DTOs/events with safe user-purpose information only; maintain internal cost/trace in operator-only ledgers; test client payload and persistence/exports. Remove or hide misleading provider approval UI for *this class only* because the path is gone.

**Sprint 3 — Reusable universal composition:** audit existing OpenUI model specs, generated programs, `NativeSurface.tsx` and `nativeOpenUi*`; implement one canonical answer and schema-driven composition. Eliminate duplicated markdown/native rendering without destroying distinct data or accessibility. Do not create a new set of website/prompt-specific templates.

**Sprint 4 — Design system fit and finish:** normalize heading/card/chart/table/calculator/diagram density tokens and pane responsive handling. Measure against ChatGPT via allowed browser UI solely to learn answer hierarchy, sizing and interaction behavior, not to copy proprietary frontend code or add imitation-only decorations. Use unknown and advanced prompts.

**Sprint 5 — Accurate result acceptance:** official-link completeness, table/metric dedup, controls and artifact fidelity, source validity, long answers and error handling. Fresh model output, not only injected fixture replays. Sample latency and real search/synthesis costs **internally only**.

**Sprint 6 — Source-matched protected release:** pass 11 exact-source CI workflows where applicable, private staging auth/tenant/egress/storage/security gates, production canary, rollback readiness. Obtain required production approvals before promotion. Verify end-user results on `xroga.com/workspace` after the authorized rollout. Do not conflate Ready with serving.

**Expected handoff:** real source diffs and tests; the former public-search confirmation repro turned into a no-confirm, finished answer; screenshots before/after (320/390/1440 dark/light); no developer-cost leak; twenty+ varied live/controlled prompt comparisons with honest levels; latency/quality metrics; source SHAs, promoted or unpromoted status, unresolved blockers and rollback. The next response should contain working implementation evidence and exact failures, **not** an expanded list of component names or another affirmation of universality.

## 9. Final acceptance sentence

**A user should be able to ask a new, unfamiliar question; Xroga should research when necessary through its own properly funded services, let DeepSeek compose one accurate complete answer using a flexible OpenUI component grammar, and show it in a compact, professional, appropriately interactive and mobile-safe layout—with only the user's requested information on screen.**