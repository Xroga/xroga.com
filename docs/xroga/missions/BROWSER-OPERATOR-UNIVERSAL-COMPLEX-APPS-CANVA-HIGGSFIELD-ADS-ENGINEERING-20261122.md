# XROGA BROWSER OPERATOR — UNIVERSAL HIGH-END EXECUTION: SOURCE-TO-CODE ENGINEERING MANUAL
## Founder directive for Claude Code — 22 November 2026

**Project:** Xroga Browser Operator, NOT Codex Workspace presentation. **Code:** Xroga/xroga.com PR #976, branch claude/ops-integrated-20261112. **Intended audience:** Claude Code acting in this exact repository with authorized development and private staging access.

**Status of this file:** Mandatory engineering requirements and proposed acceptance contracts; not evidence that code was implemented. Re-read current HEAD before changing code. The reviewed HEAD prior to this document was acaebfcb72b93b5ba4c75914ad9b1e6e7332e9bd. Every reference to status or benchmark below is as reported and source-inspected, not a production guarantee.

## 0. Read the actual product goal correctly

The founder does not want a basic assistant that clicks a few menus, memorizes TraceDraw, or has one scripted automation per website. Xroga should be a broadly capable, outcome-driven operator over an authorized Chrome session. Tomorrow's users may open Canva, Higgsfield, a video editor, Meta Ads Manager, Google Ads, Shopify, a CRM, a web database console, a blogging CMS, SEO platforms, email/calendar or an unfamiliar SaaS platform. Their requests can span multiple sites and files. The agent must inspect the present task and application, discover available methods, use the best permissible combination, perform meaningful work quickly, recover intelligently, and verify the user's requested outcome.

**Hard engineering distinction:** No fixed skill list or previously known website can guarantee every conceivable task. Universal means general mechanisms, adaptable reasoning, discoverable capabilities and verifiable recovery; it does not mean omniscient site access or magical API permissions. **Do not claim 100% universal success.** Engineer toward strong, statistically grounded unseen-task performance.

These instructions **supersede simplistic reliance on synthetic 3-step success or one canvas fixture** while preserving the earlier source-first 72-repository mission, its donor checks and the advanced completion mission. The 72 repositories are selected engineering material, not an instruction to bundle all 72 unrelated executors or install unknown-license code. Source inspect, reuse permitted compatible implementations, expose real callable tools and demonstrate real gains.

**Immediate user experience requirement:** User describes an authorized goal once. Xroga does the work, not a long back-and-forth about basic browser operations. Ask only when truly missing necessary source content, account access, MFA/CAPTCHA, recipient or spend authority, or a consequential external decision. Never infer a purchase/advertising budget or permission to publish/send from the mere presence of a logged-in session.

## 1. Reality check before implementing: what is known and what is not

The latest report in docs/xroga/evidence/browser-operator-20261110/FINAL-ENGINEERING-REPORT-20261122.md states:
- Real extension + Zurelay DeepSeek can execute basic browser tasks and numerous local site fixtures. 1,458 extension tests and 304 real Chromium scenarios passed on a reported earlier candidate.
- Backend staging is configured for high reasoning; a separate test revision recorded high turns. Max was directly probed but not proven by a stalled end-to-end product run on that serving staging tag. Baseline A/B, 31 tasks per effort: none 28 successes, high 25, max 28; high/max had higher latency on the sampled set. Do not report high/max as a general accuracy cure.
- Existing donor ports: Browser Agent relative count checks, Full Self Browsing element-value waits, OpenSidekick network diagnostics, BrowserSkill human-input attribution. Calendar date/time segment selection and Blob export/import have been repaired on tested fixtures.
- Executing workers achieved 20/20 page results in four runs, but 20 workers were not reliably faster; one run created 26 windows for 20 jobs. Distinguish the separate delegate read-only worker implementation from start_parallel_tasks executing workers.
- TraceDraw's full drawing task did not complete (47 turns, ~462 seconds); timeline-split and painted-menu seed 4 remain failures. Real accounts, signed-in owner Chrome, hostile digest-valid skill, two real users simultaneously, service-worker crash mid-write, cross-frame Blob export, independent security review, PR #997 re-attestation and production promotion are open.

**Why these facts matter:** The problem is not merely visual perception. A single bad target can trigger expensive turns because the executor does not reliably classify failed progress and commit a better action method. Longer timeouts and additional words in the prompt only conceal the defect. Fix the generic execution chain, not just the canvas.

Do not regress already working components. Distinguish: implemented code / isolated Chromium verified / real DeepSeek + private fixture verified / live third-party-account verified / owner-production verified. A source-ledger label may be stale; reconcile against current files and tests.

## 2. One universal architecture: from user outcome to verified delivery

Preserve the existing canonical scheduler, browser worker registry, task graph, authorization, tenant isolation, provider budget and evidence ledger. The Chrome extension is the user's authorized execution surface, not a competing cloud orchestrator. Do not add Playwright/Stagehand/UI-TARS as a replacement control plane or a second independent task database.

Implement or align the following contracts with existing TypeScript structures. These are conceptual fields; inspect current actual interfaces before adopting names.

~~~typescript
type OutcomeContract = {
  id: string;
  request: string;
  deliverables: Array<{
    id: string; kind: "record"|"design"|"video"|"campaign_draft"|"document"|"file"|"answer"|"other";
    acceptance: Array<{ claim: string; evidenceType: "app_state"|"server_receipt"|"file_hash"|"rendered_media"|"source" }>;
    requiredInputs: string[];
  }>;
  constraints: { sites?: string[]; accounts?: string[]; timeframe?: string; policy?: string; outputFormat?: string; budgetAuthority?: unknown };
  permissions: { browse: boolean; read: boolean; draft: boolean; writeScope?: unknown; publish?: unknown; externalSpend?: unknown };
  dependencies: Array<{ before: string; after: string }>;
};
type GroundedObservation = {
  tabId: number; frameId: number; documentIdentity: string; url: string;
  viewport: { width: number; height: number; deviceScaleFactor: number; zoom: number; scrollX: number; scrollY: number };
  a11yElements?: unknown[]; semanticDom?: unknown; screenshotRef?: string;
  candidates?: Array<{ id: string; role?: string; name?: string; bounds?: [number,number,number,number]; occluded?: boolean; confidence?: number }>;
  appSignals?: { navigation?: string; selectedTool?: string; dialog?: string; loading?: string; consoleErrors?: unknown[]; requestStatuses?: unknown[] };
  observedAt: string; isFresh: boolean;
};
type ActionCandidate = {
  goalId: string; method: "dom"|"keyboard"|"visual"|"batch"|"native"|"api"|"skill"|"worker";
  targetEvidenceIds: string[]; preconditions: unknown[];
  expectedEffect: string; action: unknown; idempotencyKey?: string;
  risk: "read"|"local_edit"|"external_write"|"financial"|"destructive";
};
type ActionOutcome = {
  dispatched: boolean; receipt?: unknown; observedEffect?: unknown;
  postconditions: Array<{ claim: string; verified: boolean; evidenceRef?: string }>;
  status: "verified"|"failed"|"uncertain"|"needs_user_authority";
  rollback?: unknown;
};
~~~

**Operational loop:**
1. Parse the real request, ask only for truly essential missing/permission information.
2. Determine what constitutes a completed external result and what evidence will prove it.
3. Observe currently available sites, account state, UI and connected APIs; never invent tool capabilities.
4. Select and rank plausible actions based on correctness probability, preconditions, time, risk, cost and reversible effects. Allow DeepSeek to choose; do not put it in a site or English-keyword allowlist.
5. Execute the minimal grounded action or precondition-checked batch.
6. Observe the **actual effect** and independently verify the next goal predicate. A changed DOM hash or pixels alone is not proof of a finished save, campaign, video export or database mutation.
7. If no meaningful progress, diagnose and choose a genuinely different action family; preserve previously confirmed work, do not re-run uncertain external writes.
8. Final user-facing result is concrete: verified design/project URL, saved draft state, exported file, row IDs or sourced findings; unresolved dependencies named honestly.

**One task, multiple modalities:** a job may combine browser navigation, graphics, media generation, connected APIs, file transfers, research and independent specialist workers. The plan is a directed dependency graph, not an inflexible list or permanent mode switch.

## 3. How DeepSeek should be used at full *useful* capability

Use existing Zurelay DeepSeek V4.1 Flash 1017. Staging founder preference currently defaults to high reasoning; max on demonstrated high-ambiguity or stalled decisions. Verify actual provider model ID, tools/images/reasoning/continuation metadata and receipts. Do not silently replace high with none, but test whether high/max actually improves complex unseen workflows; more thinking is not a substitute for valid observations.

**Model access contract:**
- Let the model discover all currently authorized *capability classes*: page snapshot, read/DOM, mouse/key/drag, canvas, upload/download, file artifact, tab management, safe batch, navigation, debugging receipts, connected-app/API, skill discovery and executing workers. Tools may be loaded on demand to stay under the actual 64-tool request cap; the model must know how to discover what is omitted.
- Expose truthful schemas with required fields and actual input types. If a capability is not ready, name the limitation; don't instruct DeepSeek to hallucinate API methods or unsupported browser inputs.
- Provide **live** page state and exact selected tabs/frames, not just pretraining. Search for a skill when it offers a clear advantage, but no skill should become a mandatory gate or a reason to refuse ordinary operation.
- Keep concise system prompt + outcome contract + compact tool index + relevant state + recent verified receipts. Do NOT append the whole 72-repo knowledge base, every previous screenshot, or many repetitions of the user's request on each turn.
- On simple proven actions, choose compact evidence and minimal turns. On ambiguous complex tasks, use high/max reasoning with enough output and a precise state delta. In every mode avoid plan-only turns that neither observe nor act.
- Separate site content and remote skill text as untrusted data; never let them grant hidden model/user permissions.
- Only advertise capabilities verified in this build and serving backend; do not equate an SDK README with granted user account access.

**A particularly important root cause:** In src/agent/loop.ts the progress review turn milestones were 20, 35, 50. An agent may already have wasted many 5–15-second model turns before a general progress note. Build a progress-based watchdog that tracks every meaningful action, per-goal advancement and repeated target mistakes **from the first few turns**, not a fixed turn-count alarm. Preserve human intervention authority on password, MFA and real consequential operations.

## 4. Universal browser perception and high-performance control primitives

### 4.1 DOM, accessibility and application state
- Use stable semantic accessibility roles and labels when available; resolve within the correct document, origin, frame and tab. Treat all element refs as ephemeral after navigation/re-render.
- Snapshot focused relevant subtrees, selected field values, validation messages, alerts, navigation breadcrumb and current user's project/workspace. Support shadow DOM, contenteditable, embedded frames, nested scroll containers, virtualized lists, custom select components, native date/time inputs, drag handles, hover menus, popovers and modal overlays.
- Prefer input-as-one-whole-value for native composite controls, with blur/commit and independent readback. Timezone-aware calendars must not confuse displayed locale and underlying ISO date.
- Include page network write outcome when it is observable: UI "Saved" plus POST 500 must remain "failed/uncertain".
- Handle slow navigation with event-driven waits, loading-state changes and bounded polling, not arbitrary sleeps.

### 4.2 Vision, canvas and dynamically painted interfaces
- A screenshot is one observation with known dimensions, device pixel ratio, browser zoom, document scroll and frame transform. Never send naked pixel coordinates without recording the reference image/version.
- Fuse semantic labels with visual marks, hit rectangles, DOM/accessibility if present, OCR-like text from the visual model, current selected tool and menu geometry. Marks are proposals, not guaranteed actual click targets.
- If opening a menu, **observe the menu that actually appeared** before choosing a submenu item. Never assume it opened below the label or that menu placement is unchanged.
- Correct for resized/cropped source images, enlarged region crops, x/y offsets, zoom, iframe transforms, CSS transforms, canvas scaling, scroll and sticky sidebars. Independently cross-check mark mapping via browser geometry whenever possible.
- Selection and dragging must be semantic: determine what object is selected, what handles are active, where object center/bounds are now, then drag with feedback and verify new object geometry. Avoid repeated blind clicks around a coordinate after no meaningful effect.
- For a timeline, infer pixels-per-second from a verified visible ruler and current viewport zoom, then snap/cross-check the actual timestamp readout. Verify clip boundaries and final media duration by saved project state/export.

### 4.3 More capable action primitives instead of per-site macros
Identify missing reusable methods: text insertion, fill/replace, drag/drop (HTML5 + pointer where required), file drag/drop, move canvas object, resize bounding box, right-click/context menu, hover, keyboard shortcuts, clipboard with permissions, multi-select, line/shape selection, timeline split/trim/reorder, layer visibility/order, zoom/pan and active viewport, tab/frame navigation, on-demand network diagnostics, download/upload, progress wait, async job polling. Implement these at the control/action abstraction and independently test them across multiple unrelated applications.

**Do not run arbitrary page JavaScript on logged-in sites as a shortcut.** Xroga intentionally withholds unrestricted eval/devtools from the model. If a legitimate documented app API or connected MCP exists, use a reviewed typed connector under the user's permissions; do not silently turn the Chrome extension into a credential-stealing scripting shell. Site-specific snippets may be offline test fixtures, never universal production assumptions.

### 4.4 Smart performance and task speed
For each call measure: target type, model queue / reasoning, screenshot capture+encoding, browser activation, network, JS/tool dispatch, validation, postcondition and persistence. Report on incomplete runs too. Cache only non-sensitive safe observations with explicit freshness, and invalidate after relevant UI change. Batch steps only when their preconditions can be verified; trade one prompt turn for a correct full form fill rather than five prompt turns for five fields. If uncertain state/action cost is high, gather one higher-quality observation rather than ten bad clicks.

**Acceptable engineering direction:** one-minute human task should usually remain within a small number of productive model/tool turns under similar network/system constraints. That is a performance objective, not a claimed current guarantee. Never use a 20-minute timeout to mask repeated wrong actions.

## 5. Applications are task scenarios — not mandatory site-trained skills

### 5A. CANVA: complex design, layers, drag/drop, text, animation, video and export
**Case:** User opens their logged-in Canva design and requests a 20-second vertical branded promotional video with four scenes, supplied logo/product photos, headline/subtitles, on-brand colors, animated text, music, and MP4 export. A different user requests a multi-page pitch deck or 20 social posts; same executor, different outcome contract.

**Implementation path:**
1. Read user's actual brief, brand materials, scene count, aspect ratio, exact editable deliverable, desired timing. Identify the current Canva project and whether the account permits the requested assets/features. Don't invent stock licenses or brand colors.
2. Inspect the editor: current design type, page/scene navigator, element/layer controls, timeline, media library, selections, toolbar, export menu. Record semantic refs and screenshot geometry; choose strongest available control method. If an authorized Canva tool/API is genuinely connected and its exact operation covers the request, use it; otherwise operate the UI with browser primitives.
3. For each scene/page, create an **atomic deliverable subgoal**: correct background, image, text content, font/size/layout, animation/timing and order. Use typed action preconditions and readbacks. Multiple unrelated edits may be batched; dependent state changes must be re-observed.
4. For drag/drop: locate source asset and destination canvas, establish pointer coordinate transform, use correct input events, observe selection/placement, verify layer object identity and bounds. For timeline: match scene duration to ruler/time, drag or input duration, verify active segment and total sequence.
5. Protect existing content: duplicate page/template if user requested non-destructive edit, checkpoint before destructive replacement, inspect undo history and whether the actual design autosaved. Avoid duplicate text/media due to retry.
6. Export in requested file format. Wait for actual completion, collect file bytes or completed download with hash, inspect basic media metadata (duration, dimensions, format, page count), verify design remains editable and shareable only under user's permitted scope. Report a real URL/artifact, not "I clicked download".
7. For unfamiliar Canva UI updates, preserve general steps (find current editor controls, inspect, act, verify) and let the model choose newly observed controls. **No hardcoded Canva selectors/menu path in the universal agent system prompt.**

**Critical external knowledge/limit:** Canva's official developer docs describe Design Editing/Apps SDK and REST export/autofill, but an SDK embedded in an authorized Canva app is NOT automatically usable from an ordinary third-party Chrome extension. REST/MCP scopes, eligible Canva plans and app installation must be verified for the current user. User login is not equivalent to unrestricted official API access.
Official docs: https://www.canva.dev/docs/apps/design-editing/ and https://www.canva.dev/docs/apps/rest-apis/reference/ and https://www.canva.com/help/canva-api/

**Independent proof:** project visibly contains the correct number/order of editable scenes/elements, text and provided brand assets; total target duration and 9:16 size correct; export bytes playable and duration matches; no accidental duplicates; saved project reload retains edits. Test against Canva-like replicas AND real disposable Canva account if actually authorized; do not conflate them.

### 5B. HIGGSFIELD: asynchronous AI video creation and editing
**Case:** User opens logged-in Higgsfield, supplies two product images and asks for a 15-second 9:16 cinematic video with specific mood, camera movement, brand-safe text overlay, edits, preview and final export.

**Execution plan:**
1. Translate the brief into shots, reference-asset map, requested output duration/aspect and quality. Inspect the currently available Higgsfield tool and plan; media model/tool choice depends on capabilities the actual account shows, not a model-invented button.
2. Select the applicable creation/editing mode from the real UI or authorized connected tool, upload verified input assets, and inspect actual quota/credit implications before paid generation. Do not blindly trigger costly repeated generations. If the requested media output spends user-owned credits, apply the account's documented authorization rules; platform-funded inference and user account spend are separate.
3. Prepare coherent prompt/shot parameters and input references, submit a single idempotency-protected generation request, and record the job ID/status. A generation request being accepted is **not** a finished video.
4. Wait asynchronously by real job status, with bounded event/polling, checkpoint/resume and cancellation if supported. Handle pending/failed/rejected generations and avoid duplicate charged jobs after network disconnect.
5. Inspect the actual resulting preview and metadata; perform user-requested refinement (trim/reframe/extend/text/scene edits) through the observed UI or authorized tool; verify final output rather than assuming creative intent matched perfectly.
6. Export, verify exact file bytes, duration, codec/format where inspectable, resolution/aspect, ownership and working download, while preserving the project and its output reference. Explain unavoidable output quality limitations succinctly.
7. If there is an officially supported MCP tool available to the user, discover its exact schemas and scopes and compare against GUI execution; do not invent an integration, secret API endpoint or assume an MCP connector already exists inside Xroga.

Official references checked 22 Nov 2026: https://higgsfield.ai/creator-hub/help-center/tools/which-higgsfield-tool-should-i-use and https://higgsfield.ai/ai-video-editor and https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop (official site describes distinct video tools and possible MCP access; *actual user capability requires connected/authorized tool verification*).

**Independent proof:** ONE paid generation when expected, actual completed job receipt, correct uploaded reference file hashes, correct exported video bytes and metadata, no duplicate charge, saved project found after reload. Simulate long wait, 429, wrong aspect, missing quota and session expiry. A fixture that simply shows "generation complete" is not proof of a usable real video.

### 5C. Generic timeline editors, image retouchers and design software
Build generalized editor grammar: [asset library, project navigator, layers, properties panel, canvas/stage, timeline, playback/preview, export]. Detect which are actually present, support transforms and keyboard accelerators only after verifying. Tasks may involve multitrack audio/video, selecting and trimming specific clips, transitions, overlays, color/layer changes, subtitles, keyframes, motion paths, export presets. Every operation must have meaningful postconditions (selected object ID, property value, timeline boundaries, saved project, output bytes). Test 3+ unrelated editor implementations; TraceDraw is only one holdout, not a reason to force all editors through scripting console or coordinate mark clicks.

### 5D. GOOGLE ADS and META ADS: autonomous professional reasoning, NOT site-specific recipes
**Case:** User says "I want growth for my local service business; choose campaign, buyer targeting, keywords/audience, creatives and budget" while signed into Google Ads or Meta Ads.

**First collect evidence, do not invent:** business offer, location, customer/lead objective, actual landing funnel, conversion tracking, market/competitor evidence, margin/lead value, budget authority, policies and platform-specific account context. Use search/analysis and dashboard inspections for missing current information. If a required financial constraint is unknown, draft a justified scenario budget as a proposal rather than pretending the user approved a live spend.

**Google Ads-specific reasoning:** choose Search/other inventory based on intent and objective, match type and keyword eligibility, search terms, negative-keyword structure, location presence, schedule/calls, landing page, conversion actions, CPC/volume assumptions and policy review. Use Google Ads UI or official connected Ads tool only when actually accessible. Save draft, verify fields, check eligibility warnings. Publishing/charging requires explicitly scoped account/spend authority.

**Meta Ads-specific reasoning:** select campaign objective/event, Pixel/CAPI status where available, audience and geo, exclusions, placements, creatives, frequency, attribution and form/landing destination. Keyword strategy is not interchangeable with Google Search bidding. Save and verify draft at correct campaign/ad set/ad hierarchy, no invented reach/ROAS. Publishing/charging requires relevant authority.

**Shared universal mechanisms:** inspect actual UI, research opportunity, apply domain-appropriate strategic reasoning from verified current docs, fill forms, resolve tool descriptions, detect validation, persist exact draft, verify after refresh and share results. Skills/repositories can add *knowledge*, not replace the model's general ability to reason on unfamiliar marketing software.

**Independent proof:** saved campaign draft ID, exact buyer/goal/geography/creative/keyword-vs-audience settings, no unauthorized live state or spend, policy flags recorded and hypotheses distinguished from facts. Test with legal sandbox replicas; mark real platform untested until disposable owned accounts and access exist.

### 5E. DATABASE ADMIN / CLOUD CONSOLES
**Case:** user asks to fix slow reporting query, adjust schema and update selected tenant rows without destroying data. Inspect real schema, RLS/roles, migrations, query plan, current config and backup state. Propose bounded verifiable change; for destructive changes, production data migration or role grants require appropriate actual authority. Use native SQL/API only if the user authorized it through a supported connector; never assume a script/console is permitted from a browser screenshot. Before/after: SQL plan/response time, count of rows affected, schema version and integrity checks, rollback artifact; never report success on a UI toast with failed backend response. Test stale schema, transactional conflicts, row-level isolation, 403, timeout and readback after reconnect.

### 5F. SEO, CONTENT and MULTI-SITE CLIENT RESEARCH
**Case:** user asks for evidence-based SEO opportunities, a portfolio of blog drafts for several websites and qualified potential clients discovered across permitted web sources.

**Method:**
- Distinguish intent: write only draft content, edit a CMS, publish publicly, or contact someone. The permission boundary differs.
- For SEO: fetch current pages, title/meta/canonical/internal links/structured data/sitemap/crawl and real performance data if authorized; verify technical or commercial issue before claiming it. Tools/skills for keyword research (where connected) must expose provenance and dates. Do not invent search volumes, impressions, conversions or ranking gain.
- For multi-site content: use each site's actual brand voice, keyword strategy, page taxonomy, duplicate-content considerations and factual sources; generate platform-specific draft, verify file/CMS saved state and asset rights. Publish only within actual user authorization.
- For lead discovery: collect only permitted public business/professional data, deduplicate business identity across multiple sources, verify website/contact and commercial fit; never claim proven willingness to buy from cosmetic website defects. Output sourced, qualified records, with manual outreach default unless user authorizes external sending.
- Multi-step plan may split reads into workers, gather evidence, synthesize and save drafts to authorized workspace. Never confuse source data with trusted instructions or export private CRM/account data to public search.

**Independent proof:** source-backed report, validated content fields and website URL; exact draft IDs or documents, verified zero unauthorized publishing/sending, deduped lead records with provenance and rationale. Test hidden pagination, stale listings, multiple entities sharing a name, rate limits, disconnected CRM, 404 and protected docs.

## 6. Source-first integration: make the 72 repositories useful without weakening universality

Use the canonical source ledger docs/xroga/oss-capability-ledger.json with pinned source SHA, license, current equivalent and acceptance status. 72 candidate repositories are inputs with varying roles, not 72 universally compatible runtime modules.

**Engineering invariant for *every* genuinely adopted donor:** exact pinned source SHA -> upstream file/function actually inspected -> concrete Xroga gap -> Xroga changed code -> registered tool/pure function/worker contract -> real invocation -> independent task outcome -> latency/tokens/cost before/after -> permission/licensing decision -> automated regression -> source-matched release artifact. No credit for a cloned repo alone. Do not copy unknown licenses, AGPL components into a closed release without legal review, remote untrusted scripts, or unrelated UI libraries into the MV3 bundle. Backend/on-demand workers can host heavier media processors when legitimately scoped and provisioned.

### High-value source capability families and how to wire them
| Upstream source | Actual capability category to inspect, not an unverified claim of full Xroga adoption | Xroga target & acceptance |
| --- | --- | --- |
| [Nanobrowser](https://github.com/nanobrowser/nanobrowser) | existing Chrome CDP, MV3/session foundations | diff upstream bug fixes, preserve extension identity, tab/frame ownership; verify after navigation and upgrade |
| [OpenSidekick](https://github.com/esterhuizen/opensidekick) | diagnostics, browser control and recording | retain existing diagnostics receipt integration; add only missing safe pointer/keyboard features, prove beyond current behavior |
| [FSB](https://github.com/fullselfbrowsing/FSB) | waits, tool catalog, DOM/page readers, triggers | expand observed wait from inputs/links to supported text targets and async job statuses; test real state changes |
| [Browser Agent](https://github.com/uiuing/browser-agent) | postconditions, list count delta, semantic verification | add richer attribute/value expectations, independent server readback, idempotent retry; exercise real model |
| [BrowserSkill](https://github.com/Tencent/BrowserSkill) | human-first tab and input attribution | one-to-one matching in iframes/zoom, touch and concurrent workers; test real takeover |
| [Alibaba Page Agent](https://github.com/alibaba/page-agent) | DOM-first page action understanding | compare its semantic locator patterns against existing trusted CDP path; do not port synthetic event patches if weaker |
| [Alibaba QZ](https://github.com/alibaba/qz-browser-agent) | site-context activation and scoped skill selection | dynamic discover/enable helpful action metadata without website-specific requirement |
| [Browsing Skills](https://github.com/browsing-skills/browsing-skills) | site action contracts and structured read/write metadata | accept only signed/reviewed declarative actions with postconditions and no page eval |
| [Agent Skills](https://github.com/agentskills/agentskills), [Vercel Skills](https://github.com/vercel-labs/skills) | SKILL.md metadata, versioning, discovery | on-demand retrieval of relevant guidance; permissions never granted by skill text |
| [WebGenie](https://github.com/derpx06/webgenie), [OpenBrowser](https://github.com/dylansantwani/openbrowser) | checkpoints, reasoned recovery, bounded batches | move from turn-count warning to per-goal evidence ledger, measured fast batching |
| [Midscene](https://github.com/web-infra-dev/midscene), [OmniParser](https://github.com/microsoft/OmniParser), [UI-TARS](https://github.com/bytedance/UI-TARS) | visual grounding and multimodal action research | investigate model/memory/runtime licensing and feasibility; optional bounded visual primitives, no new mandatory model |
| [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), [Agent Browser](https://github.com/vercel-labs/agent-browser) | instrumentation and accessibility locators | reuse technique/test code, not parallel browser daemons |
| [Browser Agent Recorder](https://github.com/VelvetAbyss/browser-agent-recorder) | reusable action demonstrations/workflows | consented capture -> sanitize -> parameterize -> verify across layouts -> deterministic Experience procedure |
| [OpenReel](https://github.com/heychintan/openreel), [OpenCut](https://github.com/opencutvideo/Opencut), [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | timeline/media-editor source examples | inspect edit semantics, scene timing and export test techniques; do NOT assume these apps control Canva/Higgsfield |
| [FFmpeg WASM](https://github.com/ffmpegwasm/ffmpeg.wasm), [Mediabunny](https://github.com/Vanilagy/mediabunny), [Editly](https://github.com/mifi/editly), [Sharp](https://github.com/lovell/sharp) | media metadata/export/format pipelines | use an authorized on-demand media artifact worker when supported; do not ship heavy processing on every extension start |
| [Google Ads tools](https://github.com/googleads/google-ads-api-developer-assistant), [Meta Business SDK](https://github.com/meta/facebook-python-business-sdk), [Shopify skills](https://github.com/Shopify/agent-skills) | professional vocabulary, genuine API schemas | reviewed business-domain capability discovery with connection/rights and release-gated actions |
| [Readability](https://github.com/mozilla/readability), [MarkItDown](https://github.com/microsoft/markitdown), [Docling](https://github.com/docling-project/docling) | normalized research/document extraction | use when relevant; preserve source URLs and document provenance; no extra external data egress |
| [Core Marketing Skills](https://github.com/coreyhaines31/marketingskills), [Remotion Skills](https://github.com/remotion-dev/skills) | specialized task guidance | load only if relevant and compatible; judge with domain-specific artifact acceptance |
| [SkillsHub](https://github.com/ComeOnOliver/skillshub) | remote skill discovery candidate | current external HTTP 402 is not fixable by forced retries; bounded circuit-breaker and local signed fallback; never masquerade as connected |

**Decision principle:** A donor module that is redundant, unsafe, improperly licensed or slower may be documented as REJECTED WITH EVIDENCE. Some libraries are backend processors, test harnesses or professional context instead of extension code. This is *actual engineering selection*, not neglecting their capabilities.

### Full 72-repository source ledger snapshot
The table below is mechanically generated from Xroga's previously pinned ledger on this branch, **not a fresh verification that those licenses/statuses remain unchanged after all Claude commits**. Status refers to the original ledger, not production or passing advanced tests. Claude must refresh and justify actual adoption after each meaningful port.

| # | Repository (direct link) | Pinned source | Ledger status | Ledger reuse route |
| ---: | --- | --- | --- | --- |

| 1 | [nanobrowser/nanobrowser](https://github.com/nanobrowser/nanobrowser) | 291d5f3927 | ALREADY PRESENT | MAINTAIN + DIFF |
| 2 | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | 4605d82cfc | ALREADY PRESENT | ADAPT TARGETING |
| 3 | [dylansantwani/openbrowser](https://github.com/dylansantwani/openbrowser) | 1f670809ca | ADAPTED IN CODE | EXTEND EXISTING PORT |
| 4 | [Tencent/BrowserSkill](https://github.com/Tencent/BrowserSkill) | ae87b539fd | SOURCE REVIEWED | ADAPT TAB LENDING |
| 5 | [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | 22ecf8545d | INSPECTED | ADAPT / FIXTURES |
| 6 | [alibaba/page-agent](https://github.com/alibaba/page-agent) | d8dd334487 | BEHAVIOR-COMPARED | BENCHMARK + PORT |
| 7 | [derpx06/webgenie](https://github.com/derpx06/webgenie) | 56b5d8bccf | INSPECTED | ADAPT RECOVERY |
| 8 | [openbrowse-ai/openbrowse](https://github.com/openbrowse-ai/openbrowse) | 9c1bec9d92 | INSPECTED | SELECTIVE ADAPT |
| 9 | [browserbase/stagehand](https://github.com/browserbase/stagehand) | 4d72a87ff7 | INSPECTED | BENCHMARK (NO PAID CLOUD) |
| 10 | [browser-use/browser-use](https://github.com/browser-use/browser-use) | ccbdb8095f | INSPECTED | ADAPT PRIMITIVES |
| 11 | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | eb9b030280 | INSPECTED | TEST + PROFILING |
| 12 | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | 2337aff021 | INSPECTED | TEST / OPTIONAL CAPABILITY |
| 13 | [microsoft/playwright](https://github.com/microsoft/playwright) | 2f1592a70b | ALREADY PRESENT | TEST INFRASTRUCTURE |
| 14 | [AliSharjeell/OpenBUA](https://github.com/AliSharjeell/OpenBUA) | 98d68ba43a | INSPECTED | REFERENCE ONLY UNTIL LICENSE |
| 15 | [anomalyco/browse](https://github.com/anomalyco/browse) | ae5d9d07ba | ALREADY PRESENT | ADAPT SESSION POLICY |
| 16 | [uiuing/browser-agent](https://github.com/uiuing/browser-agent) | a8517e2c5c | INTEGRATED/UNIT | ADAPT VERIFICATION |
| 17 | [jeet-dhandha/agent-webbridge](https://github.com/jeet-dhandha/agent-webbridge) | a14cd1dcdf | INSPECTED | REFERENCE ONLY |
| 18 | [pinchtab/pinchtab](https://github.com/pinchtab/pinchtab) | a62662027f | INSPECTED | BENCHMARK IDEAS ONLY |
| 19 | [motailab/open-browser-agent](https://github.com/motailab/open-browser-agent) | b0791b8c44 | INSPECTED | REFERENCE / TEST |
| 20 | [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene) | 4afc9fd110 | INSPECTED | BENCHMARK + PORT COMPATIBLE METHODS |
| 21 | [microsoft/OmniParser](https://github.com/microsoft/OmniParser) | 3540212013 | INSPECTED | REFERENCE; LICENSE + MODEL REVIEW |
| 22 | [bytedance/UI-TARS](https://github.com/bytedance/UI-TARS) | 582f3a7ea5 | INSPECTED | RESEARCH ONLY |
| 23 | [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) | 3ac2cb8d94 | INSPECTED | ARCHIVED REFERENCE |
| 24 | [A9T9/RPA](https://github.com/A9T9/RPA) | 17b6302f16 | INSPECTED | REFERENCE; GPL/AGPL REVIEW |
| 25 | [fabricjs/fabric.js](https://github.com/fabricjs/fabric.js) | ab604137e0 | INSPECTED | TEST FIXTURES |
| 26 | [konvajs/konva](https://github.com/konvajs/konva) | bf1927c1cf | INSPECTED | TEST FIXTURES |
| 27 | [tracedraw/tracedraw](https://github.com/tracedraw/tracedraw) | 118f9657d6 | LIVE DEEPSEEK VERIFIED | REGRESSION ONLY |
| 28 | [agentskills/agentskills](https://github.com/agentskills/agentskills) | 83021e2be4 | INTEGRATED/UNIT | SKILL REGISTRY ADAPTER |
| 29 | [anthropics/skills](https://github.com/anthropics/skills) | e4bb5d960d | INSPECTED | ADAPT ELIGIBLE SKILLS |
| 30 | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | c799c8552b | INSPECTED | COMPATIBLE MCP TOOL ADAPTER |
| 31 | [Shopify/agent-skills](https://github.com/Shopify/agent-skills) | unresolved | INSPECTED | DOMAIN SKILLS ON DEMAND |
| 32 | [Shopify/Shopify-AI-Toolkit](https://github.com/Shopify/Shopify-AI-Toolkit) | 0388268a61 | INSPECTED | DOMAIN SKILLS; REVIEW TELEMETRY |
| 33 | [googleads/google-ads-api-developer-assistant](https://github.com/googleads/google-ads-api-developer-assistant) | dbb730a199 | INSPECTED | DOMAIN KNOWLEDGE / SANDBOX PLUGIN |
| 34 | [googleads/google-ads-python](https://github.com/googleads/google-ads-python) | f253b400dc | INSPECTED | ON-DEMAND API WORKER |
| 35 | [meta/facebook-python-business-sdk](https://github.com/meta/facebook-python-business-sdk) | 947c427b4a | INSPECTED | ON-DEMAND API WORKER |
| 36 | [mozilla/readability](https://github.com/mozilla/readability) | ab4027a8b3 | INSPECTED | EMBED / PORT READER |
| 37 | [apify/crawlee](https://github.com/apify/crawlee) | 446c6898fd | INSPECTED | BACKEND SANDBOX ON DEMAND |
| 38 | [microsoft/markitdown](https://github.com/microsoft/markitdown) | ed178952a6 | INSPECTED | BACKEND PARSER |
| 39 | [docling-project/docling](https://github.com/docling-project/docling) | f93ee6bc72 | INSPECTED | BACKEND PARSER |
| 40 | [ServiceNow/BrowserGym](https://github.com/ServiceNow/BrowserGym) | 62a678feef | INSPECTED | EVALUATION HARNESS |
| 41 | [ServiceNow/AgentLab](https://github.com/ServiceNow/AgentLab) | 8488c564ee | INSPECTED | EVALUATION HARNESS |
| 42 | [Aepzie/cutline](https://github.com/Aepzie/cutline) | ab71520285 | INSPECTED | ON-DEMAND / TEST |
| 43 | [heychintan/openreel](https://github.com/heychintan/openreel) | 5f3c85e5fc | INSPECTED | TEST / REFERENCE |
| 44 | [openfilm/openfilm](https://github.com/openfilm/openfilm) | unresolved | INSPECTED | TEST / REFERENCE |
| 45 | [opencutvideo/Opencut](https://github.com/opencutvideo/Opencut) | a7dc1f8fa9 | INSPECTED | TEST / REFERENCE |
| 46 | [Panoptik-Studio/Panoptik](https://github.com/Panoptik-Studio/Panoptik) | e16fcb0901 | INSPECTED | REVIEW / TEST |
| 47 | [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | 7b91435c30 | INSPECTED | ON-DEMAND ARTIFACT WORKER |
| 48 | [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | f876f907c7 | INSPECTED | ON-DEMAND / ISOLATED |
| 49 | [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | 6bb7c03241 | INSPECTED | ON-DEMAND (MPL REVIEW) |
| 50 | [mifi/editly](https://github.com/mifi/editly) | dc46674052 | INSPECTED | ON-DEMAND SANDBOX |
| 51 | [lovell/sharp](https://github.com/lovell/sharp) | 9a34cfeda1 | INSPECTED | BACKEND ARTIFACT PRIMITIVE |
| 52 | [visioncortex/vtracer](https://github.com/visioncortex/vtracer) | aede2c6197 | INSPECTED | ON-DEMAND SANDBOX |
| 53 | [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | a4abfb2979 | INSPECTED | ON-DEMAND AFTER LICENSE/COST REVIEW |
| 54 | [manimCommunity/manim](https://github.com/ManimCommunity/manim) | 04002e069e | INSPECTED | ON-DEMAND SANDBOX |
| 55 | [eracle/OpenOutreach](https://github.com/eracle/OpenOutreach) | e3f6baf373 | INSPECTED | ON-DEMAND SCOPED READS |
| 56 | [Mahanaicoach/google-maps-scraper-kit](https://github.com/Mahanaicoach/google-maps-scraper-kit) | c3e63f1934 | INSPECTED | EVALUATE SOURCE PERMISSIONS |
| 57 | [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | fdd8518c5f | INSPECTED | ON-DEMAND SANDBOX |
| 58 | [browser-use/workflow-use](https://github.com/browser-use/workflow-use) | f00e27edd7 | INSPECTED | CONCEPTS ONLY UNTIL LEGAL REVIEW |
| 59 | [alibaba/qz-browser-agent](https://github.com/alibaba/qz-browser-agent) | 96d1c8f66c | CODE INTEGRATED | ADAPT SITE MATCHING AND SKILL ACTIVATION |
| 60 | [browsing-skills/browsing-skills](https://github.com/browsing-skills/browsing-skills) | 07855b500d | CODE INTEGRATED | ADAPT REVIEWED ACTION CONTRACTS (NO ARBITRARY PAGE.EVALUATE) |
| 61 | [ComeOnOliver/skillshub](https://github.com/ComeOnOliver/skillshub) | def8531e65 | BLOCKED | OPTIONAL ONLINE DISCOVERY PROVIDER WITH FALLBACK AND CACHE |
| 62 | [vercel-labs/skills](https://github.com/vercel-labs/skills) | 57217cf86b | INSPECTED | ADAPT REMOTE SKILL RESOLVER (NO NODE CLI IN EXTENSION) |
| 63 | [browserbase/browse-plugin](https://github.com/browserbase/browse-plugin) | 5a538bd0d4 | INSPECTED | STUDY CATALOG AND DISCOVERY; NO CLOUD DEPENDENCY |
| 64 | [ScottSyms/Browser-Agent](https://github.com/ScottSyms/Browser-Agent) | 6e5eea8736 | INSPECTED | IDEAS ONLY UNTIL CODE LICENSE CONFIRMED |
| 65 | [cloudflare/agent-skills-discovery-rfc](https://github.com/cloudflare/agent-skills-discovery-rfc) | 1bd1167983 | CODE INTEGRATED | EXPERIMENTAL OPT-IN WELL-KNOWN RESOLVER |
| 66 | [esterhuizen/opensidekick](https://github.com/esterhuizen/opensidekick) | 6f11eeea67 | SOURCE REVIEWED | COMPARE CONTROL AND RECORDING FEATURES; ADAPT MISSING PRIMITIVES |
| 67 | [fullselfbrowsing/FSB](https://github.com/fullselfbrowsing/FSB) | 28284b8c4d | SOURCE REVIEWED | SELECTIVELY PORT MISSING PRIMITIVES |
| 68 | [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | 9657318e43 | INSPECTED | TRUSTED SUBSET ON DEMAND; LICENCE PER SKILL |
| 69 | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | 5b2b400eec | INSPECTED | TASK-SCOPED PROFESSIONAL EXPERTISE ON DEMAND |
| 70 | [amzn/selling-partner-agentic-toolkit](https://github.com/amzn/selling-partner-agentic-toolkit) | 4563bfcb17 | INSPECTED | AUTHORIZED BACKEND WORKER; REAL SELLER SCOPES REQUIRED |
| 71 | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 6f55706d10 | INSPECTED | MEDIA WORKER GUIDANCE ON DEMAND |
| 72 | [VelvetAbyss/browser-agent-recorder](https://github.com/VelvetAbyss/browser-agent-recorder) | 9e632a32ac | INSPECTED | ADAPT CAPTURE TO SANITIZE TO VERIFY TO REPLAY IN EXPERIENCE ENGINE |


**Source-first acceptance audit:** for each of the 72 rows, the next handover must say *why* it is adopted, already covered, backend-only, deferred, blocked or rejected, with source+implementation and evidence. This does **not** mean copy every repo into the extension or force every skill to run.

## 7. Engineering worklist by actual Xroga source file (modify code, not prose only)

1. **apps/xroga-browser-extension/src/agent/loop.ts**: instrument every model turn with active goal, current complete/partial deliverables, tool availability, selected action and real progress. Reconcile end conditions with outstanding verification debt. Implement early diagnostic no-progress detection rather than waiting for [20,35,50] turn notices. Keep compact context and evidence snapshots, model tool-call continuity, cancellation and resumability. Add direct tests for repeated wrong target that still changes UI, mistaken "saved" toast, stale refs, and empty model reasoning output.
2. **apps/xroga-browser-extension/src/agent/progress-tracker.ts**: define goal-progress fingerprints (object selected, file emitted, draft saved, row mutated) rather than only method and page-state fingerprint. Distinguish cosmetic change from task advancement. Track failed target/method combinations and force new observed state before retry. Delay retry if real async job is in progress.
3. **apps/xroga-browser-extension/src/agent/tools.ts** and browser-control/**: expand/repair genuinely missing reusable input primitives and schemas for hover, drag/drop, frames, custom controls, media timelines, download and upload; avoid changing security policy by exposing unrestricted eval. Tool names/descriptions must make the model aware of what it can really do, and dynamic discovery must work across mixed or multilingual requests.
4. **apps/xroga-browser-extension/src/agent/prompt.ts**: cut false universal coordinate rules, app-specific assumptions and long background explanations. Keep goal, tool contract, observation, grounded verification and concise recovery. Avoid "a skill must exist before action" framing; site skills are optional accelerators.
5. **apps/xroga-browser-extension/src/agent/subagents.ts**, start_parallel_tasks implementation and **backend/src/routes/localBrowser.ts**: distinguish read-only delegation from executing workers, enforce one-writer-per-tab and bounded worker windows, investigate 26 windows/20 jobs, retry/orphan cleanup, provider 429/timeout and per-tenant execution. Do not spend 20 workers on a 3-click task. Keep high as founder staging default, verify product max escalation and compare success/cost honestly.
6. **apps/xroga-browser-extension/src/browser-control/core/blob-capture.ts**: frame-aware, origin-scoped memory-only Blob handling with correct ownership and checksum; review MAIN-world createObjectURL wrapper side effects and lazy activation on authorized file workflow. Test nested iframe Blob, revoked URL, large files and double upload.
7. **Canonical Xroga backend task/lease/store/evidence modules**: use one existing outcome scheduler and budget ledger; implement typed stable action receipts, idempotency keys, checkpoint/recovery after a remote accepted write with no response, progress streaming and verified artifact outputs.
8. **skills modules in src/agent/**: apply reviewed source imports only when they add a callable capability. Provenance + pin + license + prompt-injection data boundary + dynamic tools. Break out from SkillsHub 402 to local/discovered general tools, never to public approval or billing popups.
9. **Extension side panel**: show concise task goal, verified progress, artifacts, task-specific current step, one actionable error; hide backend provider spend/cost, raw logs/keys and internal method switches from the regular user. Provide pause/resume and ownership-aware takeover with actual state recovery.

**Implementation discipline:** one reviewable code change per generic failure class; reproduce before and after; test at least two unrelated sites, preferably one held out. Keep the running existing Xroga extension and canonical authorization/ledger. Don't declare a donor "integrated" because you authored a compatibility wrapper without exposing a model-callable tool or because a mock test passed.

## 8. Advanced test campaign: completion measured by independent state, not model narration

Replace "three clicks and a toast" as the main test signal. Keep those as fast smoke checks. For every advanced task record: exact user prompt, seeded app state, allowed accounts, fresh UI layout, independent expected result, forbidden duplicate/unauthorized actions, real model/tool trace, screenshot only when relevant, saved server state, file checksum, actual wall time, tokens/latency/cost and whether the app was a replica or a real authorized account.

**12 deliberately difficult categories with unfamiliar variants:**
- **Design/editor:** three unrelated editors. Create multi-element poster, edit font/position/layers, drag/resize, preserve autosave, export PNG/PDF. Canvas transforms, zoom, scrolling and selection.
- **Video/timeline:** trim, reorder and split 3+ clips, insert overlay and audio, verify clip boundaries and duration. Deliberate timeline zoom, lazy-loaded assets and unsaved warning.
- **AI generation:** asynchronous video generation, quota check, prompt/reference consistency, job status, one request not duplicates, playback and correct file export.
- **Google Ads:** business diagnosis → eligible keyword/negative selection → account-appropriate draft → verify fields and no spend. Change conversion requirement mid-task.
- **Meta Ads:** objective/event tracking → placements/creative/audience → draft verified. No incorrect Google Search keyword imitation.
- **Database:** RLS-aware read, schema/row update, rollback and no duplicate writes across disconnected service worker.
- **CRM:** merge duplicate customer accounts and update five records while preserving two exceptions, exact server IDs after save.
- **Shopify/e-commerce:** variants, taxes/inventory, pagination and exact CSV export/import, no unintended stock loss.
- **SEO/content:** audit actual page/indexability evidence, produce sourced multilingual blog drafts in two CMS platforms, no unsupported search volume/traffic claims.
- **Client discovery:** search 3+ permitted sources, identify commercially meaningful fit, deduplicate, validate official site and contact, produce useful record, no automatic unsolicited message.
- **Files/Docs:** PDF read with source provenance, multi-tab draft, iframe Blob export, cross-app file transfer, exact bytes/hashes, sharing permission.
- **Novel cross-site workflow:** unfamiliar app UI, shadow DOM/iframe/RTL/mobile zoom, sequential dependencies, a surprise provider 500 and real recovery.

**Independent verifier** means DOM/server state from the application itself, artifact metadata/hash, known sandbox state, provider job receipt, or a separate readback; **not** the model saying "Done" or a mere screenshot of a clicked button.

### Minimum operational chaos tests
A. Kill MV3 service worker after server accepts a write but before action receipt; resume and verify **exactly once**.
B. Reconnect in a true high→max product-chain turn; no tool call loss, no cross-account replay.
C. Two signed-in different accounts concurrently; no evidence, file, cookie, token or record mix.
D. Digest-valid but hostile imported skill text tries to override tool permissions; reject escalation, still complete safe user goal.
E. 20 executing workers on independent jobs; zero leaked windows, one active writer per tab, no duplicate cost, compare to sequential.
F. An iframe creates a Blob export then revokes URL; capture only where authorized and transfer exact file once.
G. A page says "Saved" but backend returns 500; no false success or uncontrolled retry.
H. Prompt-injection source on SEO/research, mixed with valid material; no tool-authority escalation or private-data egress.
I. Very long task (>32k context), saved checkpoints, reload/cancellation; continuation without losing acceptance criteria or hallucinating completed steps.
J. Canvas editor with transformed coordinate space, unknown menu geometry, dynamic toolbars, non-English language and timeline ruler changing zoom.
K. Provider 429, 502, delayed response, false redirect, session expiry, MFA and human takeover; proper bounded treatment without a 20-minute loop.
L. Expired, oversized, ambiguous, duplicate or cross-user file attachments; reject unsafe upload and retain clean previous results.

### Acceptance scorecard, not invented percentages
| Dimension | Evidence to record | Example release target to evaluate, NOT current achievement |
| --- | --- | --- |
| Unseen advanced outcome completion | independently verified numerator/denominator per category | agree on statistically meaningful target; show confidence intervals |
| One-minute task latency | p50/p95 including stuck/timeouts, task complexity | eliminate pointless 20-minute retries; compare to human baseline |
| Wrong action recovery | failures diagnosed, retries and successful alternate methods | no repeated no-effect action cycle; zero false successes in test set |
| Media artifact fidelity | dimensions/duration/layers/bytes/metadata | all explicitly required properties met in test artifacts |
| Accounts/actions | scoped authority, no surprise spend/publish/delete | no unauthorized consequential actions |
| Parallel | workers vs sequential, windows spawned, cost, success | only enable speed-effective parallel plans; no orphan windows |
| Cross-app transfer | input/output hash and destination receipt | exactly one authorized upload, no corruption |
| Security | independent audit, prompt injection, tenant isolation | pass real two-account boundary and signed security tests |
| Release | exact source ZIP, backend image, contract, staging, rollback | no production claim before required signed gates |

Avoid fabricated "~99% universal coverage" based on tiny synthetic samples. A 20-worker run with 20 correct tiny tasks is not equivalent to 20 simultaneously completed professional workflows.

## 9. Execute in this order; do not stop at another report

**Sprint 0 — inspect exact live source:** verify current PR head, branch, source-first ledger, backend/model revision, full report, current tests; preserve teammate edits and canonical code. Categorize actual failing vs untested vs account-blocked.

**Sprint 1 — fix the universal action/progress mechanism:** instrument real per-step task advancement and latency on stuck tasks, choose top three generic failing classes, implement tested changes in current source. Include the deliberate no-effect click/selected-wrong-control and timeline target. Re-run on at least three unrelated UI forms.

**Sprint 2 — complete reusable media/editor primitives:** accurate transformed drag/drop, selection and timeline operation, layer-aware after-action readback, data-size/format export and iframe file handling. Apply to two unrelated editor fixtures and one real authorized product where possible. No TraceDraw-only branches.

**Sprint 3 — connected professional workflows:** discover actual official APIs and user scopes for Canva/Higgsfield/Ads/Meta/Shopify if available; otherwise use current authorized browser UI with verified drafts and simulate protected external workflows. Business reasoning should be sound, evidence-based and account-specific, not a "make Ads" one-click bot.

**Sprint 4 — operations/chaos:** remote-accepted-write crash, deep model reconnect, two owners, valid hostile skill, provider 429/502, 12/20 worker fairness and window count. Actually run with real DeepSeek and signed-in test devices whenever possible.

**Sprint 5 — real-world evidence and release:** execute advanced holdouts, correct failures, then exact-source unit, Chrome, backend tenant, permission/security, upgrade/rollback and build checks. Source-matched private ZIP and staged API/vision model proof. Independent security review, PR #997 re-attestation and founder production authorization remain mandatory; no quiet promotion.

**Mandatory handover, concise but factual:** changed source modules and new tools actually callable by DeepSeek; upstream link + SHA + license + implemented capabilities with tests; before/after real results across multiple unrelated apps; task trace of longest failing job; cost, reasoning effort, worker counts, source-matched build and serving tag; blockers that require the owner's legitimate external-account connection; exact remaining failures. Do not substitute a rewritten document for engineering work.

## 10. Read these earlier Xroga working references; do not restart research
- [Source-first 72-repository playbook](./BROWSER-OPERATOR-SOURCE-FIRST-72-REPO-INTEGRATION-20261121.md)
- [Advanced universal production finishing mission](./BROWSER-OPERATOR-ADVANCED-UNIVERSAL-PRODUCTION-FINISHING-20261122.md)
- [Full-power DeepSeek engineering mission](./BROWSER-OPERATOR-FULL-POWER-REASONING-UNIVERSAL-ACCEPTANCE-20261121.md)
- [64 universal baseline tests](../acceptance-specs/BROWSER-OPERATOR-64-UNIVERSAL-ACCEPTANCE-SEEDS-20261121.json)
- [36 advanced acceptance contracts](../acceptance-specs/BROWSER-OPERATOR-36-ADVANCED-REAL-WORLD-ACCEPTANCE-20261122.json)
- [Latest engineering report](../evidence/browser-operator-20261110/FINAL-ENGINEERING-REPORT-20261122.md)
- [Latest release handover](../evidence/browser-operator-20261110/RELEASE-HANDOVER-20261121-v8.md)

**Concluding instruction:** The founder's desired feature is not a "Canva skill", "Meta Ads skill" or "TraceDraw skill". It is the ability to confront any authorized unfamiliar application, discover the best current actions, reason about the user's complete objective, carry out a verifiable workflow, correct mistakes quickly, and deliver the real result. **Build and test this in code, with the complete compatible source implementations from the supplied repositories wherever demonstrably useful.**
