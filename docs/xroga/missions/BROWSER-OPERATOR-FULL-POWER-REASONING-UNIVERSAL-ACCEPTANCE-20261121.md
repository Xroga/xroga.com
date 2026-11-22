# XROGA BROWSER OPERATOR — FULL-CAPABILITY UNIVERSAL EXECUTION ENGINE

**Latest 22 November execution order:** [ADVANCED UNIVERSAL PRODUCTION FINISHING MISSION](./BROWSER-OPERATOR-ADVANCED-UNIVERSAL-PRODUCTION-FINISHING-20261122.md) and [36 advanced holdout acceptance contracts](../acceptance-specs/BROWSER-OPERATOR-36-ADVANCED-REAL-WORLD-ACCEPTANCE-20261122.json). Read these after the actual v8 final engineering report. They supersede stale assertions that high reasoning, native date controls, Blob exports, or 20-worker concurrency have not been implemented/tested. Preserve earlier source-first integration requirements while prioritizing advanced unrepaired outcomes and live release gates.
## Mandatory, source-verified engineering directive for Claude Code

**Founder scope:** Complete as much of the full Xroga Browser Operator as can genuinely be engineered, tested, and verified. Do not mistake passing narrow fixtures for a universally capable product. This is the **existing** Nanobrowser-derived Chrome extension integrated with Xroga OS, not Codex's separate Workspace UI/presentation branch.

**Where:** `Xroga/xroga.com`, draft Browser Operator PR **#976**, branch `claude/ops-integrated-20261112`. Baseline checked **21 November 2026**, before this file was committed: PR head `52966162b682ad8e3cd769a7cfea8fbb67c23347`. Re-read current HEAD before changing code. Latest handovers are in `docs/xroga/evidence/browser-operator-20261110/RELEASE-HANDOVER-20261121-v7.md` and `...-v8.md`.

**Read these canonical source documents before engineering:**

- `docs/xroga/missions/BROWSER-OPERATOR-SOURCE-FIRST-72-REPO-INTEGRATION-20261121.md` — full source-to-code integration playbook for all 72 supplied repositories, with 17 implementation cards and direct links.
- `docs/xroga/oss-capability-ledger.json` and `docs/xroga/OSS-REUSE-LEDGER.md` — pinned revisions, licensing, source-status evidence; **refresh stale statuses** after integration.
- `docs/xroga/evidence/browser-operator-20261110/DEEPSEEK-V4-1-FLASH-STUDY-20261120.md` — *probed*, *documented*, and *measured* model capabilities; check against current actual provider behavior.
- `apps/xroga-browser-extension/AGENTS.md`, `CLAUDE.md`, source, auth/security and existing tests.

**All engineering approvals:** You have founder approval for ordinary development, research, source-cloning for inspection, refactoring, disposable fixtures and accounts you are authorized to provision, automated local testing, existing paid model calls within the platform accounting, CI, protected/private staging, and creating source-matched private builds. Work autonomously. **This does not waive external site terms, private account consent, MFA, login, security, tenant isolation, ad spending, payment, secrets, sending email, publication, deletion or production release gates.** These are not arbitrary 'limitations'; they prevent an unreliable universal agent from acting against the wrong account. If the real task requires a human-controlled third-party permission, return the exact one-time blocker rather than pretending it was done. Do everything else without waiting.

### The product acceptance standard

Given a user's *authorized* goal, Xroga must understand the intent and deliverables; observe the current application or data; select among actually usable DOM/a11y, GUI, API, skill, file, script-console, batch or parallel tools; operate; inspect the effect; continue until **postconditions are verified**, a genuine user-only blocker is reached, or all reasonable verified routes are exhausted. It must not require one handcrafted workflow per website. It must not silently loop, repeat costly actions, guess that a click succeeded, or stop at a meaningless tool receipt. The user sees meaningful progress and the final actual outcome. Use accurate words such as verified/partial/blocked; do not promise success on every arbitrary external website.

## 1 — Baseline: what is real and what still fails

Read v7 and v8. At review time:

| Area | Observed from source or latest handover | Engineering implication |
|---|---|---|
| Model | Browser turns from `backend/src/routes/localBrowser.ts` explicitly dispatch `reasoning_effort:'none'`. Extension `src/xroga/model.ts` declares `reasoning:'none'`, `reasoningDropped:true`. | The user's **high/max** request is **not implemented** merely by listing provider features. Implement the complete end-to-end contract, not only the outgoing parameter. |
| Provider support | Zurelay probes document `none`, `high`, `max`; requesting `low` was treated as `high`. A separate `medium` has **not been verified**. | Verify accepted values and receipts. Do not fake medium support or expose an ineffective UI option. |
| Reasoning with tools | The provider study reports assistant `reasoning_content` continuity is needed when thinking and tools are combined, or API may return 400. | Server request/response schema, conversation serialization and replay, output budgets, security and reconnect must change together. |
| Model capacity | The study lists provider-advertised 1M context/384k output, but product uses **32k profile**, **2048 output**, **96 KB text request cap** and per-turn ledger limits. | Do not assume the advertisement equals the product's implemented allowance. Expand adaptively only with serialization, compaction, DLP, token reservation and real performance tests. |
| Engine | Evidence-based `progress-tracker` replaced fixed ladder; tools are broadly offered; extra run-control paths exist. | Instrument and validate this new behavior in real runs. Fix goal-level stall loops, not just repeated tool strings. |
| Source reuse | v8 reports four actual donor ports: Browser Agent relative count, FSB value waits, OpenSidekick diagnostics+network status, BrowserSkill human-input attribution. | Valuable but narrow. Do not call 72 candidate repositories 'fully integrated'. Continue selective meaningful ports and full invocation tests. |
| Browser tests | v8: 303 Chromium scenarios, 1443 unit tests before the final prompt-only edit, 10/10 hard-category new vs 9/10 previous (one run per variant). | Positive but small/fixture-weighted. Broaden live independent unknown-site evaluation and reliable benchmark statistics. |
| Parallel | v8 real DeepSeek single-agent median 127 s versus 4-slot workers median 92 s (n=3 per arm); default 3-slot workers were not faster. The model chose **not** to delegate in two unprompted runs. | Concurrency is a scheduling optimization, not a magic success guarantee. Correct worker count, work partition, data ownership and cost accounting before scaling. |
| Connected apps | Ads/Meta/Shopify/Drive real-account end-to-end not verified; SkillsHub returned 402; owner Chrome and release gates open. | Build generalized safe fixtures and adapters, then obtain or use authorized disposable integrations. Report genuine remaining dependencies. |
| Graphics | TraceDraw finished **none** of the 47-turn / 462-second product run despite marks improvements. | One unresolved hard visual-editor case; never let it dominate the whole product roadmap. |

**No false '100%' label.** Completion requires measurable acceptance across different application classes and authorized accounts. Cost tolerance is higher than before; that is **not** authorization for infinite retries, unlimited unobserved spend, or destructive effects.

## 2 — PRIORITY ZERO: Make DeepSeek *actually* use high/max and its relevant supported features

**Current source entrypoints:**

- `backend/src/routes/localBrowser.ts` — `turnBody`, `router.post('/runs/:runId/turn')` (source around current lines 915–992), `reasoning_effort:'none'`, `max_tokens` default 2048, request byte guard, accounting, active run limits.
- `apps/xroga-browser-extension/src/xroga/model.ts` — local chat adapter, upstream-compatible request shaping, output limit, `reasoning:'none'`, context window, resume.
- `apps/xroga-browser-extension/src/agent/loop.ts` — model message history, tool results, turn handling, prompt/tool availability, truncation and compaction.
- `backend/src/workers/browserModelDispatch.ts` — canonical provider dispatch and ledger; security, per-turn reservation, settlement and no hidden retries.
- Related `src/llm` adapter serialization / message conversion; locate and test exact current files rather than guessing names.

Implement **all** of the following, not just a one-line effort override:

**2.1 Reasoning effort policy.** The founder wants high/max capability used. For normal substantive multi-step agent tasks, support and normally dispatch **high**. Escalate to **max** when the goal or *observed ambiguity* warrants deeper planning (many conflicting controls, multiple domains, uncertain postcondition, long dependency graph, incorrect prior reasoning, or specialized domain decisions). For very small deterministic commands, benchmark high versus max; do not indiscriminately spend expensive max calls where high works just as well. `medium` can be supported **only after a real successful provider probe**, never assumed. A `none` arm remains in tests strictly as a baseline, not the default for the founder's requested product. If high/max causes worse completion or a provider-specific schema failure, surface actual evidence and fix the integration—not quietly fall back to none and claim high works.

**2.2 Verify actual provider contract.** Run real low-risk staging probes for high and max with: (a) normal text, (b) multiple tool calls, (c) screenshot+tool, (d) multi-turn tool result continuation, (e) compaction and resumed run, (f) streaming if supported. Inspect response headers, exact request parameter, provider-reported usage and `reasoning_content` fields. Handle unsupported effort as typed capability error; no silent downgrade. State exactly what Zurelay accepts for THIS model ID as of the test.

**2.3 Reasoning continuity.** Preserve the provider-required reasoning state *privately within the model conversation transport* through a tool call and tool result. Validate assistant tool IDs and messages; ensure repeated tool calls do not attach the wrong reasoning. Do not put raw private reasoning into user-facing UI, analytics, third-party logs, shared reusable skills or cross-tenant records. Respect provider terms and local retention requirements. If continuation cannot be safely replayed, use a supported alternative and mark high/max multi-turn as BLOCKED; do not fabricate a complete solution.

**2.4 Output/context budget.** `max_tokens:2048` can truncate thought+tool decisions. Implement a measured dynamic completion limit: simple short commands vs complex reason/plan/tool messages. Update both extension profile and server admission, content-length validation, output-reservation, recovery and schema caps in one reviewable change. Do not simply set 384000 and hope the provider/extension supports it. Confirm that screenshot payloads and tool schemas fit and that summaries run only when needed. Profile prompt cache, image sizes, tool descriptions, compaction frequency and expensive repeated history. Provider capability ceilings, network payload caps and platform financial ceilings are separate constraints.

**2.5 Model-driven tool intelligence.** Model sees a compact, accurate catalog of **authorized available** tools with exact schemas and relevant current-page observations. Support find/list/details/activate of more specialized skills, actions or connected tools on demand; preserve the generic actions. Do not hand it the whole 72-repo catalog every turn or hide needed general actions through English keyword shortcuts. Each invocation checks scope and postconditions. Enable complex planning without adding a competing orchestrator.

**2.6 Performance A/B.** Use at least 20 diverse task instances for initial comparisons, pairing the same model, fixture, available tools, tab foreground state and verified output with effort `none` (control), `high` and `max`. Record success, wrong action, turns, wall time p50/p95 and N, token and billed provider usage, effect on compaction and resumes. The user explicitly prioritizes high/max even if they cost more; the engineering decision should nevertheless be justified with accurate capability and speed evidence.

## 3 — Universal semantic task architecture (one canonical execution path)

1. Parse the requested outcome and relevant entities from natural language in **any supported language**. Avoid overusing brittle regex. Identify whether this is a question, research, analysis, drafting, data change, publishing, download/upload, application configuration or multiple independent jobs.
2. Determine authorization scope and what the model can observe. Distinguish user-provided information, live app state, connected API data and missing data.
3. Establish lightweight acceptance evidence: exact record field, UI state, file hash, exported document, published status, report value, etc. Simple requests need no verbose plan; multi-deliverable requests need a concise versioned outcome contract and verified milestones.
4. Discover capabilities from CURRENT site and Xroga adapters: DOM/a11y refs; visual hit targets; app scripts/command palette only if supported and authorized; reviewed site actions; reusable local verified skills; website-published/remote skills after provenance review; authorized API/Composio/MCP; cross-tab file tools; scoped worker delegation.
5. Choose the **best justified next action**, not a fixed method ladder or website name. Model may call tools and revise strategy from evidence. Apply deterministic preconditions and safety before dispatch. Preserve tab/document/frame identity and fail closed on stale refs.
6. Use a fast batch when subsequent steps and postconditions are already known. Do not batch a decision that needs to inspect an intermediate screen, or retry a potentially duplicate consequential write.
7. Verify effect independent of model self-report. Differentiate input dispatched, page reacted, server accepted/failed, target state reached, uncertain delivery. Network receipts (e.g. 404 after 'Saved!') must override false UI optimism.
8. Recover from a causal diagnosis, changing **target or strategy**, not solely words. Prevent self-reinforcing click loops with hashed target/action/effect history, state diffs, external blocker detection and a bounded unproductive-action window. Persist checkpoints and resume without redoing accepted writes.
9. Assemble final outcome with only confirmed successes, precise partial failures and artifacts/links that exist. Store sanitized evidence and authoritative state for the user's future follow-ups.

Universal **does not mean** 'never require authentication or permissions'. It means the engine generalizes and handles authorized diverse workflows without writing code for every site.

## 4 — Intelligence for complex professional work (no per-site scripting requirement)

**Google Ads scenario** — Given a business, objective, country, language, budget and authorized Ads account, discover or analyze: business offering, target customers and service geography; existing account and analytics; policy/eligibility; campaign objective/type choice (Search/Performance Max/other as supported, with reasons); keywords and intent with actual Keyword Planner data if available; negative keywords; geography/device; conversions and call tracking; creatives/ad-copy; daily budget and forecast as assumptions; campaign/ad group configuration; draft preview; validation and actual Google Ads API/UI receipts. Do **not** invent keyword volume, buyer demand, ad eligibility, ROAS, or campaign results. A live launch spends user money and needs explicit scope/authorization. If user asked for planning, give the plan without creating a campaign. If properly authorized to create a draft, complete it and verify draft state. Skills are domain knowledge, not a restrictive task list.

**Meta Ads scenario** — Different underlying platform: campaigns, objectives, conversion locations, special ad categories, targetable audiences permitted by current Meta policy, placements, creative variants, pixel/CAPI events, account assets, catalog, preview and validation. Do not force Google keyword workflows onto Meta. Actual ad activation is a consequential spend; use account-specific authorization and report precise unresolved steps.

**Database / cloud scenario** — Read schema, migrations, ownership/tenant bounds, backups and change safety; propose or execute only scoped permitted SQL/schema and verify results. No arbitrary destructive queries or secrets in model context. Use API/schema tools when authorized rather than forcing the browser GUI.

**CRM/e-commerce scenario** — Understand entity IDs, dedup, filters, product inventory data, orders, pricing and connected account state; operate generic UI/API tools; verify record ID/value and preserve idempotency. Do not hallucinate hidden database permissions.

**Research/coding/docs/creative/media** — Research sources, code version-aware APIs, edit UI documents or media with grounded controls, use app-native scripting only where documented; when the task needs a backend artifact worker, hand off to Xroga's actual authorized worker and return the real file, not a claim of creation.

## 5 — Parallel and multi-agent execution: 2, 4, 10, 20 workers **where useful**

Use the **existing** canonical task graph, worker registry, leases, budget ledger and extension run bridge. The backend's `activeRunLimit` currently allows an env-configured maximum up to 24, default 13; the extension's prior default 3-worker setting queued the fourth task. Do not infer a 20-worker effective product from an env max alone; independently verify provider rate limits, browser memory, tab availability, available signed-in accounts, task lease semantics and worker quotas.

- The scheduler decides if the task actually splits into independent branches. Use 1 worker for simple jobs; 2–4 for limited research; 10–20 only for enough independent, nonconflicting work and measured net benefit. The user is willing to fund more model calls, but does not demand that 20 agents be used when 1 is faster.
- Each executing worker gets its **own run identity, model-turn accounting, scoped context, tools, tab/window ownership, checkpoint and permission budget**, with distinct task and evidence IDs. Maintain one writer per tab/record and no shared mutable credentials in prompts. A parent merges independently verified results.
- Handle fan-out/fan-in, partial worker failure, cancellation, race conditions, app rate limits, human takeover, stale tabs, service worker restart, duplicate action suppression, model gateway backpressure and deterministic result merge.
- Preserve existing `delegate` read-only page readers as an inexpensive specialized path; do not describe them as full executing agents.
- In the v8 four-page comparison, **4 slots** beat sequential by median 92 vs 127 seconds at n=3 each, **3 slots** did not. That is not statistically strong evidence to force workers on every task. A/B 1, 2, 4, 8, 12 and 20 workers when infrastructure permits; report each arm's N, correctness, p50/p95, mean, cost, tokens, warm-up and browser resource utilization. Stop concurrency experiments safely if rate limits or isolation fail.

## 6 — Upstream source engineering: implement actual reusable capabilities

Read the complete **72-repository playbook** linked at the start of this file. Below are prioritized direct links to sources and **specific capabilities to integrate or prove redundant**. All source claims must be verified at pinned commits. Clone in isolated source caches; do not embed entire foreign runtimes or unreviewed licenses into a commercial Chrome extension.

| Donor | Real capability of interest | Concrete Xroga engineering requirement | Test |
|---|---|---|---|
| [Nanobrowser](https://github.com/nanobrowser/nanobrowser) | Browser/CDP/action foundation | Diff upstream bug fixes vs existing layer, preserve extension identity and deterministic handles | upgrade+tab/frame action |
| [OpenSidekick](https://github.com/esterhuizen/opensidekick) | Browser action primitives, console/network diagnostics, recorded workflows | Extend v8 network receipts into generic diagnostics and trace/replay; inspect unported hover/drag/keyboard behaviors | failed save and multi-step workflow |
| [Full Self Browsing (FSB)](https://github.com/fullselfbrowsing/FSB) | Broad tool registry, smart waits, application discovery, trigger/watcher patterns | Extend current value wait to non-control text counters and event-driven state; compare on slow page & pagination | dynamic counter and delayed table |
| [Browser Agent](https://github.com/uiuing/browser-agent) | Verified actions, outcome receipts, workflow extraction/reuse | Extend `expect.count.delta`, verify changed record server-side and conditionally replay trusted procedures | true vs false success |
| [WebGenie](https://github.com/derpx06/webgenie) | Long-run checkpoints, recovery/navigation memory | Port useful state/evidence concepts into the canonical loop; no second orchestrator | resume across crash |
| [Tencent BrowserSkill](https://github.com/Tencent/BrowserSkill) | Person/agent input authority, tab handover | Preserve v8 one-to-one matching, test zoom/iframes/concurrent typing; do not overclaim all human races solved | HUM tests plus fuzz |
| [Alibaba Page Agent](https://github.com/alibaba/page-agent) | DOM-first structure and semantic interactions | Run matched token/accuracy benchmarks against existing CDP/a11y; port only a proven gap | complex shuffled form |
| [Agent Browser](https://github.com/vercel-labs/agent-browser) | Compact browser controls and target identification | Compare compact snapshots/action patterns; adapt to MV3 without side daemon | long list and stale handles |
| [OpenBrowser](https://github.com/dylansantwani/openbrowser) | Efficient browser action batching | Strengthen current batch port with pre/postconditions, state diffs and one model turn when known | multi-field forms |
| [Browser Use](https://github.com/browser-use/browser-use) | General browser agent patterns and state recovery | Inspect source for portable targeting/replanning; no hidden hosted service | unknown app holdouts |
| [Midscene](https://github.com/web-infra-dev/midscene) | Visual GUI automation/semantic interface reasoning | Compare visual grounding; adopt only proven permissible improvements | canvas and screenshot scaling |
| [OmniParser](https://github.com/microsoft/OmniParser) | Screen parsing/UI target detection | Study weights/license and optional backend parser; do not ship heavyweight dependencies by default | dense icon panel |
| [QZ Browser Agent](https://github.com/alibaba/qz-browser-agent) | Site-scoped on-demand skills and concurrent lanes | Extend existing site matching and task-scoped capability activation, not per-site hardcoding | known then unknown domains |
| [Browsing Skills](https://github.com/browsing-skills/browsing-skills) | Ready website action schemas | Use only vetted declarative, source-versioned actions as shortcuts; fallback to generic tools | changed site refuses unsafe action |
| [Agent Skills](https://github.com/agentskills/agentskills) | Skill metadata and lazy body loading | On-demand provenance-check `SKILL.md` adapter, token-efficient retrieval | unknown skill search |
| [Vercel Skills](https://github.com/vercel-labs/skills) | Skill repository discovery/version resolution | Port compatible resolver/index concepts, not the full Node CLI to MV3 | same task new skill version |
| [SkillsHub](https://github.com/ComeOnOliver/skillshub) | Online skill lookup service | Treat 402 as external provider failure; local/first-party or another authorized catalog fallback, no blocked task | 402/timeout/malformed fallback |
| [Cloudflare skill discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) | Website-published skill metadata/digests | Keep reviewed same-origin digest validation; do not execute arbitrary fetched scripts | forged digest denied |
| [Browser Agent Recorder](https://github.com/VelvetAbyss/browser-agent-recorder) | Workflow recording and skill packs | Build opt-in capture→sanitize→parameterize→test→verify→persist→reuse via Experience Engine | reusable workflow without leaked data |
| [MCP Servers](https://github.com/modelcontextprotocol/servers) | Typed connected tools | Preserve canonical scoped adapter, authorization and idempotent receipts | connected CRM test |
| [Google Ads API assistant](https://github.com/googleads/google-ads-api-developer-assistant) | Google Ads domain knowledge and tools | Verified planner/Keyword Planner/eligible campaign draft workflow where connected | disposable Ads account or mock |
| [Meta Business SDK](https://github.com/facebook/facebook-python-business-sdk) | Meta Ads official API workflows | Scoped account discovery, analysis, draft changes and receipts | isolated account or mock |
| [Shopify skills](https://github.com/Shopify/agent-skills) | Shopify development/domain operations | Load relevant task guidance, prefer authorized scoped API, verify product/record state | Shopify sandbox |
| [Marketing Skills](https://github.com/coreyhaines31/marketingskills) | SEO, ads, CRO workflows | On-demand professional quality rubrics, never claimed guarantees | user-goal-consistent recommendation |
| [Amazon SP-API toolkit](https://github.com/amzn/selling-partner-agentic-toolkit) | Seller operations | Optional authorized seller API worker; no assumption every user has seller scopes | isolated seller-mock |
| [MarkItDown](https://github.com/microsoft/markitdown) / [Docling](https://github.com/docling-project/docling) | Parse Office/PDF/docs | On-demand backend parsing, preserve source/page ranges, not heavyweight browser bundle | cross-app source-preserving transfer |
| [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Browser profiling and network inspection | Use in isolated test tooling for exact latency and failed requests; not a competing runtime | phase-by-phase performance |

**Donor engineering definition of DONE:** pinned source SHA + exact donor module/function + missing Xroga behavior + code integrated into existing callable tool + happy/negative tests + real Chrome verification + DeepSeek tool selection in a representative task + latency/cost evidence + license notice and rollback. Increment the ledger status only to the highest stage genuinely reached. A cloned README or source read is **not** a feature. If code is redundant or incompatible, record an evidence-grounded rejection and invest in the next useful donor.

## 7 — Error/402/blocker response: remove friction without lying

| Error | Expected handling |
|---|---|
| SkillsHub HTTP 402 / `DEPLOYMENT_DISABLED` | This is a **third-party service/provider response**, not solved by changing a local retry counter. Verify service status once; use local skill registry, source-pinned skill repo, same-origin site metadata, official documentation or generic model browser tools. Show a compact diagnostic to developers, not an endless user-facing 'pay/configure' loop. If legitimately self-hostable under terms, evaluate separately with owner-approved infrastructure. |
| Missing Ads/Meta/Shopify accounts | Use logged-in authorized accounts or disposable sandbox/dev accounts. If absent, complete research/draft/mock-and-fixture work; do not mark a real campaign live. Provide the exact one-time required connection or account action. |
| CAPTCHA/MFA/password/identity check | Hand over the one unavoidable human-only authentication step. Do not bypass it, phish credentials, or retry endlessly. Resume automatically after reauthentication. |
| Provider 400 reasoning+tools | Fix message replay/schema continuity; never silently claim high/max active if calls were downgraded. |
| Model gateway 429/rate limit | Queue with bounded backoff and cancellation, prevent duplicate provider charges. Increase authorized concurrency only after capacity evidence. |
| Browser failed navigation / stale reference / overlay | Fresh page context; diagnose; use another grounded method. No blind click repetition. |
| Extension service-worker eviction | Checkpoint, restore run/lease/step evidence, never duplicate an uncertain external write. |
| Unknown external write outcome | Verify remotely before retry. If still unknown, report uncertainty without resending. |
| Unsupported feature by page | Try legitimate alternatives or explain precise external limitation. Do not invent page features. |
| Security/release review missing | Build, test and stage; do not claim production readiness or bypass sign-off. |

## 8 — 16-category independent acceptance plan

Build *at least* two randomized unseen variants for each category and grade by independent app state, not assistant self-report. Use the JSON companion fixture contract and existing Chrome/autorun harness. Every task should include the specific result, expected check, known blockers and timing.

1. **Tiny navigation/search/read** on ordinary pages, with no redundant screenshot/model call.
2. **Forms** with field shuffles, validation, masked inputs, dependent dropdowns, button overlays and redirects.
3. **Cross-tab evidence research** with source dating and no repeated browsing.
4. **CRM** record create/update/dedup and partial failures.
5. **Google Ads-style** market research, eligibility and draft configurations; real dev accounts only if available.
6. **Meta Ads-style** campaign/objective/audience/placement/creative draft distinctions.
7. **E-commerce/Shopify** products, orders, returns, inventory edits and safe data consistency.
8. **Cloud/database** read/schema/authorized safe change/verification, transaction rollback.
9. **Spreadsheet/table** value edits, sorting, formulas and exports with exact data checks.
10. **File workflows** download → bytes SHA → cross-app upload, image/document attachment and parser references.
11. **Email/Calendar** research, composing drafts, event creation, human-only external sending boundaries.
12. **Coding/devtools/repository UI** scoped file edits and test readback.
13. **Docs/wiki/notetaking** structured edits and verified content persistence.
14. **Canvas/design/timeline** unknown editor; TraceDraw ONE holdout only; no trained menu coordinates.
15. **Mixed multi-app end-to-end workflows** use browser + connected API + private artifact, with idempotent receipts.
16. **Novel adversarial UI** random language/RTL, zoom, nested cross-origin iframes, shadow DOM, slow rendering, disappearing elements, pages with deceptive 'Saved!' labels and failed network calls.

Add cross-cutting stress variants: service worker killed between writes, human concurrent input, cancellation, network timeout, provider 400/429/502, SkillsHub 402, account switch, 2-tenant isolation, 12 workers, 20-worker resource admission, mobile-width/high-DPR, independent sample holdouts. No generalized capability is considered proven merely from a single smoke test.

### Explicit measurable release gates

- All 16 categories exercised with **at least 2 unseen variants**, independently graded; report pass/fail per category and stage. Extend to 5+ variants in weak categories before marketing claims.
- Model **high/max** actually verified end-to-end with tool calls, images where needed, correct multi-turn continuation, reasonable token budgets and reconnection (no silent `none`).
- Zero *known* duplicate consequential writes, zero unauthorized cross-tenant requests, zero intentional bypasses of human-control guard or approval boundaries in security tests.
- All generic postcondition, retry, idempotency, download SHA, upload and checkpoint tests pass under real Chromium.
- Parallel measured versus sequential on **multiple independent websites**, with n stated. Never claim '20 agents' unless 20 actually ran concurrently through server and browser correctly.
- P50/P95 **time to verified outcome** and cost at meaningful sample size, split by category, active model effort and worker count. Include failures/timeouts in distributions as failures, not silent exclusions.
- Final source-matched private ZIP; correct SHA-256, upgrade/rollback, staging backend model effort flag, safe replay, test evidence, product-chain owner-browser status, independent security PR #997 and production authorization status.

## 9 — Engineering execution plan: actual code, not more documents

**Phase A: model power end-to-end (first).** Reproduce current `none` product behavior. Add authenticated high/max capability path to backend + extension with tool reasoning continuity, dynamic context/output budget and exact provider receipt tests. Keep permissions/budget. Run live multi-turn browser probes. Commit and report measurements.

**Phase B: reliability and universal tool orchestration.** Identify top 3 cause classes from hard-category and holdout task logs. Fix real wrongly selected tool/target/stale state/bad menu observation, bounded recovery, progress evidence and task completion. Introduce no site-name rules; test unknown variants. Measure action phases even when tasks fail.

**Phase C: donor ports.** Continue source-code integration from the pinned 72-list, prioritize best measurable missing features (e.g. plain-text value wait, generic typed outcome, robust public/source reading, compact semantic snapshots, verified reusable workflows) over high superficial count. Implement fully, not documentation-only. Update ledger with current code references and evidence.

**Phase D: executing subagents.** Validate correct 1/2/4-worker choices first; then 8/12/20 on independent tasks if feasible and safe, using platform capacity and rate limits. Prove one-writer-per-tab and parent-child budgets, cancellation, resume and aggregation. Fix queue bottlenecks rather than forcing artificial delegation.

**Phase E: real user domains and blockers.** Complete generic fixture pathways for Ads/Meta/CRM/database/Shopify/Drive. When connections actually exist and authorized, perform disposable real-account tests; preserve unverified label otherwise. Fix 402 by fallback; verify signed-in user Chrome only if actually accessible.

**Phase F: broad acceptance/release artifact.** Run complete unit + Chromium + real DeepSeek + security tests, source-matched ZIP and SHA, rollback, real product chain, evidence matrix and updated handover. Fix regressions. **Do not skip any phase because a prior fixture passed.** When time is limited, implement the highest-value working changes and accurately report remaining work rather than promising a magical 100%.

**Parallel work organization:** Different Claude engineering subagents can independently audit model protocol, browser-control donor ports, fixtures/verification, and backend worker scheduling, but **one owner integrates changes sequentially** under code-review gates. No conflicting PR branches or simultaneous edits to shared agent runtime files without coordination.

## 10 — Mandatory final evidence report (not a progress narrative)

Return one compact engineering report with:

| Field | What must be filled |
|---|---|
| Source | branch, exact SHA, changed files and build identity |
| Model capability | requested effort, provider acknowledged effort, reasoning tokens, tools+reasoning continuity, image support, truncations, provider errors, maximum tested prompt size |
| Donor work | each upstream link and pinned module, actual Xroga code path, integration test, license, highest verified status |
| Quality | independent pass/attempts in 16 categories, unknown holdouts, false-success and duplicate-write counts |
| Speed/cost | n, p50/p95 verified latency, model vs browser vs bridge breakdown, provider charges, concurrency overhead |
| Workers | active count observed, task isolation, sequential comparison, rate limiting and cancellation results |
| Blockers | what was self-resolved, third-party 402 fallback, actual external credentials/consent missing, exact one-time owner action |
| Security | human takeover, tenant isolation, prompt injection, external spending/approval, DLP, release gates |
| Release | staged private ZIP SHA256, install/upgrade, rollback, deployed backend revision and production not-yet-live distinctions |

**End statement:** "Xroga is universal in architecture, but coverage is measured task by task. A capability is not complete until its real behavior is proven." The founder asked for a market-leading system; the engineering team must deliver working, measured functionality, not unbounded claims.