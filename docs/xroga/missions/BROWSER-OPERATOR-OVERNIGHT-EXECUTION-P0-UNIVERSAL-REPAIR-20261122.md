# CLAUDE CODE — XROGA BROWSER OPERATOR: OVERNIGHT P0 ENGINEERING EXECUTION ORDER
**Founder directive | 22 November 2026 | 4–5-hour focused engineering window**

**Repository:** Xroga/xroga.com, Browser Operator [PR #976](https://github.com/Xroga/xroga.com/pull/976), branch \`claude/ops-integrated-20261112\`.
**Product:** Xroga's existing Nanobrowser-derived local Chrome extension, backed by the current Xroga scheduler/tool registry, Zurelay DeepSeek V4.1 Flash 1017, authorization, task evidence and cost ledger. **Do not confuse this with Codex's separate Workspace rich-response PR #989.**

> **Read this as an IMPLEMENT-NOW order.** The founder is going to sleep and delegates ordinary coding, debugging, refactoring, testing, selected compatible open-source reuse, private staging experiments, build and non-production release preparation. Work through as much of this as is responsibly feasible in the current 4–5-hour active session. **Do not pause for routine technical choices, do not stop after one fix, do not end with only a document, and do not make an unsupported claim that “all websites and tasks now work.”** Your output must be actual code changes and reproducible demonstrations of verified user outcomes. Preserve source/build integrity and other active contributors' work.

## 0. Interpret the founder's "full authority" correctly

The owner has explicitly designated the two accessible Chrome profiles (Evander Throne and M. Muhammad Abdullah, as locally available) and the existing authorized computer environment for this project's engineering work. **Use only the profiles and resources actually present and authorized to Claude in the current session**; don't infer that a profile has a particular account/service logged in or that ordinary login equals permission to spend its money, publish content, delete data or send messages.

You may independently:
- inspect, clone and study pinned public code, choose and adapt licensed compatible code and fixes;
- modify Xroga's existing extension and relevant paired backend, run tests, check real model behavior, produce instrumented builds;
- use disposable test projects/accounts, authorized fixture pages and approved non-production deployment configurations;
- test two different Chrome profiles when not colliding with a real human's work, and clean up only your own disposable tests;
- use the existing model gateway with the existing metering and provider rate/price controls; don't request new approvals to run routine developer tests.

**Never disable tenant isolation, credential safety, meaningful site/financial authorization, external provider rate limits, legal/OSS license obligations, or required production/security approval gates.** Unbounded personal spending or unlimited model output does not make automation more reliable. No forced CAPTCHA bypass, password/MFA guessing, privileged account access, blind high-spend ad campaigns, unsolicited outreach, real payment, destructive DB mutation or live campaign publishing. These are operational permission boundaries, **not** a reason to reduce the extension to a handful of allowed sites or commands. When a legitimate user authorization genuinely becomes necessary, preserve work and name the specific dependency while continuing independent engineering.

**No background promise:** perform this work during the actual active Claude Code session; don't promise a future result without running it.

## 1. First 10–20 minutes: inspect source and eliminate stale assumptions

The founder's earlier “~45% complete” was a qualitative estimate **from an older state**, not a fresh audit. **Do not repeat as current fact: "model still forced to none", "parallel only measured to 4", or "Blob cross-site transfer missing."** These were subsequently addressed in staging/fixtures.

Read, in order:
1. \`docs/xroga/evidence/browser-operator-20261110/FINAL-ENGINEERING-REPORT-20261122.md\`
2. \`docs/xroga/evidence/browser-operator-20261110/RELEASE-HANDOVER-20261121-v8.md\`
3. \`docs/xroga/missions/BROWSER-OPERATOR-UNIVERSAL-COMPLEX-APPS-CANVA-HIGGSFIELD-ADS-ENGINEERING-20261122.md\` (detailed generic action-engineering contracts, real media/editor/Ads/DB/SEO workflows, and the full 72-link donor register)
4. \`docs/xroga/missions/BROWSER-OPERATOR-ADVANCED-UNIVERSAL-PRODUCTION-FINISHING-20261122.md\`
5. \`docs/xroga/missions/BROWSER-OPERATOR-SOURCE-FIRST-72-REPO-INTEGRATION-20261121.md\`, \`docs/xroga/oss-capability-ledger.json\`
6. \`docs/xroga/acceptance-specs/BROWSER-OPERATOR-36-ADVANCED-REAL-WORLD-ACCEPTANCE-20261122.json\` and the existing 64-test suite.
7. Actual \`git status\`, PR HEAD, main diff, installed extension version/hash, staging API revision/tag and model/tool route. Recheck current PR #976 HEAD; earlier inspection just before this order showed \`6742dde831d1f64a70065de080e7ef5f6e28e748\`. **That is a snapshot, not a build guarantee.**

Establish a baseline with reliable logs, run the quickest meaningful existing tests, and list exact failed/untested items. **Do not spend the first hour rewriting a new plan**. By the end of this timebox, reproduce one general failure with a useful full trace, identify the code owner, and start fixing it.

### Status that must NOT be overstated
Latest report says: 1,458 unit tests, previously 304 Chromium scenarios, a real DeepSeek 20/20 independent worker task run across four iterations, 20-worker windows anomalously reaching 26, calendar native inputs repaired (1/6→6/6), Blob export→upload repaired on tested top-level pages (0/5→4/4), and \`high\` reasoning enabled on staging. **However:** high/max did not improve aggregate accuracy over none in a 31-case/provider arm, max wasn't verified as a triggered product-chain escalation, a 47-turn/~462 s TraceDraw job failed, and timeline-split/panels remain unreliable. Professional real-account tests, authentic two-account concurrent Chrome test, crash-after-write, hostile digest-valid skill, iframe Blob, 20-worker efficiency, security review, PR #997 re-attestation and production release remain incomplete. Treat all as prior reported evidence subject to current-source verification.

## 2. Non-negotiable architectural direction: ONE universal adaptive operator

**Don't create a “TraceDraw agent,” “Canva agent,” “Higgsfield agent,” or a site-keyword command executor as the central product.** For each natural-language task, the same runtime should:
1. extract outcome, deliverables, constraints, input files, account and location, permitted actions, acceptance evidence;
2. inspect the current authorized tab(s), available tools, actual app state and connected APIs/MCPs;
3. choose a fast, valid execution strategy: semantic DOM/a11y, native input, selection/drag/key, canvas/image grounded action, app-native command/script only when legitimately supported, verified skill, connected service operation, file worker, or independent workers;
4. execute goal-directed actions in checked batches with verifiable preconditions, not a screenshot + model turn for every pixel;
5. **measure real progress after every meaningful action** and change method quickly if a goal is not advancing;
6. verify remote server state, saved project, produced file, media metadata, campaign draft, DB row or other requested deliverable;
7. deliver the actual result, not “you can do this yourself”.

Skills and repositories augment, **never bound**, the available general controls. A missing website skill must not imply the site is unsupported. Conversely, DeepSeek pretraining does not know current pixels, active tabs, missing authentication, accurate current SaaS APIs or which button actually saved.

Keep canonical Xroga scheduler/task graph/Outcome Contract, model gateway, permissions and ledger. Do not build another orchestration stack, separate hosted browser, user-visible complicated mode switches or a new general LLM provider.

## 3. P0: Repair action failure, repetitive clicks and "agent fighting itself" before adding features

### 3.1 End-to-end action evidence chain
Instrument and connect:
\`active tab/frame + viewport -> DOM/a11y/canvas observation -> grounding candidates -> selected target/method -> dispatched native CDP input -> page/network response -> meaningful postcondition -> persisted goal state\`.

For all recorded actions capture (redacted and sampled):
- task/goal ID, exact verified requirements still open, tool available/selected and candidate alternatives;
- page tab ID/window/frame origin, screenshot dimensions, zoom/DPR/scroll, element ref freshness and target bounding box if relevant;
- ordered tool parameters, dispatched status, action/network settling, actual changed state and app server receipt, current strategy and retries;
- provider latency, screenshot/capture/encoding delay, tool/executor delay, active/inactive tab, startup delay, total end-to-end elapsed;
- fingerprints: \`(goal, action family, target, expected state, observed state)\` to detect repeating ineffective operations.

**Never log passwords, API keys, cookies, personal message contents, private CRM/customer data or system prompts.** Side panel gets user-understandable progress, engineering trace remains privileged.

### 3.2 Universal progress and recovery controller
Current progress mechanisms include strategy ranking, trackers, screenshot marks and loop warnings, but recorded failures still contain dozens of wrong-target turns. **Replace escalation dependent on waiting for 20/35/50 turns with a per-goal progress signal**. When two or three consecutive actions fail to create meaningful progress, or a repeated action-fingerprint cycle is detected, capture one current observation, classify reason and explicitly choose a different *action family*, not a nearby click with unchanged assumptions.

General failure taxonomy with distinctive recovery:
- **Wrong target/occlusion/coordinate transform** → reread focused state; correct document/frame/viewport/scroll/zoom and use semantic target, keyboard, indexed screen mark or inspected menu geometry; do not repeatedly guess the same coordinate.
- **Canvas-painted menu** → inspect opened menu after top-level click; fresh screenshot/grounded mark of actual submenu; don't assume dropdown appears below the label or that menu_path can select painted UI.
- **No effect** → detect page isn't ready, selector stale, disabled control, missed drop target, wrong active tab, human takeover or hidden modal. If screenshot changes but requested object didn't, not success.
- **Typing/editing** → check focus, native date/time composites, contenteditable and hidden textbox; replace existing example instead of splice; verify exact resulting field value and save, no duplicates.
- **External write uncertain** → read server state before any retry; idempotency key/receipt where possible; no repeated charged media generation, ads, duplicate events or uploaded documents.
- **Provider slow/429/502** → classify transient provider error, use reported retry timing and server ledger; avoid prompt rewriting loops, watch for unexpected bills.
- **Missing tool/MCP/permissions** → discover another eligible built-in tool, validated connector or general browser action. External authorization only if actually required; do not hand off ordinary clicks.
- **Async rendering/job** → job status + meaningful event-driven wait, not a model request every few seconds.
- **No achievable route** → preserve partial work, explain specific blocker; don't secretly loop for 20 minutes.

Reimplement or extend *existing* \`progress-tracker.ts\`, \`agent/loop.ts\`, \`tools.ts\`, grounded browser-control layer and backend receipts as needed. Include an explicit no-repeat-write state machine for uncertain remote actions. Run a live TraceDraw and at least **two unrelated unfamiliar GUI apps** after the generic fix, not a TraceDraw-specific macro. A failure still open at the end must have a precise evidence trace, no false success.

### 3.3 Minimal productive plan; not endless planning
A genuinely short task should have one direct decision and fast tool execution; a multi-deliverable job should get a small checklist keyed to independently observed milestones. No duplicate task planning, no hallucinated “in progress”, no switching to Google/random pages when the user has an active owned tab. Human remains in control when physically using a tab. Use verifiable programmatic postconditions rather than dozens of repeated visual checks.

## 4. P0: Make Nanobrowser ACTUALLY fast and responsive

Optimize wall-clock *verified outcome time*, not just provider tokens or how fast clicks are animated. Measure before/after on a matched cohort, include all failures/timeouts in p50/p95 and preserve success at least at baseline.

### Trace and audit
- source \`agent/loop.ts\` (tool calls/output, compaction, stale screenshot and prompt growth), \`progress-tracker.ts\`, browser control/Chrome debugger, tab service, screenshot capture path, file/download, service worker lifecycle;
- backend \`localBrowser.ts\` provider queue/wait, screenshot payloads, reasoning default, tool schema and authorization ledger;
- keep UI responsive and pause/cancel usable while model work is running.

### Engineering improvements to implement when justified by measurements
1. DOM-first compact fresh snapshots and differential observations; one trustworthy screenshot when needed, not repeated duplicate visual captures.
2. High-reliability batched field fills/selected sequential operations with precondition checks; avoid one LLM turn per field or click when method is obvious.
3. Event-driven page load/selector/validation and async job waits with differentiated timeout, not fixed large delays.
4. Automatic intended existing-tab adoption with stable run-tab ownership; explicitly scoped tab switching for legitimate multi-tab workflows; no duplicate site tabs or wrong tab capture.
5. Accurate pointer/drag/selection, wheel/scroll, keyboard, contenteditable, iframe/shadow DOM/RTL, native date/time, zoom/pan. Support user-selected files through authorized extension and connected-app mechanisms without requiring manual repetitive steps.
6. Use task-aware concurrency only for independent work. Prevent two workers editing the same tab/object. User-facing side panel must stay interactive and reflect reality.
7. Context compaction, tool catalog discovery and image management: don't send all 72 skills or all screenshots on each turn. Verify DeepSeek sees actual image, tool and postcondition.

Set an explicit **fast-task outcome SLO candidate** (e.g., the human-comparable 30–60 s small task as aspiration) and measure on a reproducible mixed suite. A provider turn may alone take 3–8 s; don't promise 30 s for an incompatible complex site. No hidden artificial waiting to make a result seem thorough. Report p50/p95 and failure share.

## 5. P0: Use DeepSeek high/max effectively; no fake model restrictions

The model is DeepSeek V4.1 Flash 1017 through Xroga's Zurelay route. The founder prefers \`high\` and \`max\`; staging reportedly defaults to high. Current 31-case A/B had NONE 28/31, HIGH 25/31, MAX 28/31 and higher median time for high/max. **Do not misrepresent more thinking as better**; keep declared founder staging preference until authorized change, but select tools and observations efficiently and only escalate where diagnosed uncertainty warrants it.

Real product-chain work:
- Verify paired staging extension/backend sends expected reasoning effort, vision image parts, correct selected tab and tool schemas; exercise **actual high→max on a stalled goal**, then rollback to high on evidenced progress, and verify provider receipts.
- Compare high/max on complex, novel, meaningful goals (not merely three pages with static IDs); if high/max doesn't help, fix inadequate grounding or tool affordances before repeating high-level thinking.
- Test out-of-context-size (>32k), full tool list discovery, model replies longer than 2,048 output tokens, truncated JSON and context compaction. The backend may have practical budgets and rate limits; adapt, don't drop complete task requirements.
- Support reuse of trusted verified action procedures, but never put an upper bound on what kind of tasks users are *allowed* to ask based on which skills are preinstalled.
- Separate subagents from model: \`delegate\` is a read-only helper, \`start_parallel_tasks\` is an executing worker architecture. DeepSeek cannot magically instantiate extra workers unless tools are exposed and eligible. Verify exact capability discovery.

## 6. P0: Full open-source source-to-code reuse (72 candidate ledger)

The founder sent 72+ researched public repositories specifically to reuse their proven code, capabilities, skills, execution techniques and tests. **Do not interpret source-first as inventory-only**. Read exact pinned SHA and license, actual algorithm/source code, dependencies and tests. Port eligible missing capabilities into the existing executor; expose callable tools so DeepSeek can invoke them; compare measured user outcomes.

Existing ledger: \`docs/xroga/oss-capability-ledger.json\` contains 72 rows, 56 marked INSPECTED in its older snapshot; source-adopted portions are far fewer. Newer source ports may be under-recorded: reconcile current HEAD before reporting. Each adopted row must identify upstream source file/function, compatibility/license, Xroga code changed, test invoking it in real Chromium + DeepSeek, before/after effect, overhead and rollback. Don't copy AGPL/unknown-license material without appropriate review; don't force unrelated dependencies into the MV3 extension, ship a separate browser daemon, or install all 72 frameworks as mutually competing agents.

Prioritize **measurable generic capability gaps** using:
- Nanobrowser upstream: debugger/CDP, tab leases, native user-like input and MV3 recovery.
- OpenBrowser, FSB, browser-agent, OpenSidekick: compact snapshots, efficient batching, rich waits, network/result receipts, verified recovery and action state.
- Alibaba Page Agent, QZ Browser Agent, Browsing Skills, Agent Skills and SkillsHub (402): site context, dynamic tool discovery, optional reviewed site skills and fallback to general tools.
- BrowserSkill, browser-agent recorder: human takeover, stable task memory, sanitized reusable workflows.
- Midscene, OmniParser, UI-TARS, Stagehand, Browser Use: source/test techniques for visual grounding and efficient action planning where legally/licensably compatible, **not mandatory replacement of Xroga's existing model or Chrome worker**.
- Open-source media/editing tooling (when applicable and permitted): timeline parsing, file metadata checking, stable export validation and efficient asset operations. Only load expensive media processors for jobs that require them.

**Do not waste the overnight window porting 40 random repositories.** Prefer the 2–4 strongest donor modules that directly repair a reproduced general failure class, plus tests that show the real model can use the port and achieve a task more reliably. More than one unrelated source can contribute to the same general capability when justified.

## 7. P0: Advanced universal task demonstrations, not basic 3-click fixtures

Keep the existing quick tests, but the overnight acceptance emphasis is **complex workflows with actual outcomes and unfamiliar variants**. Full contracts: \`docs/xroga/acceptance-specs/BROWSER-OPERATOR-36-ADVANCED-REAL-WORLD-ACCEPTANCE-20261122.json\`. Do not memorize or insert page-specific steps in the system prompt.

Select representative complex tasks for the 4–5-hour window:
1. **Canva-like design or unfamiliar web editor:** multi-layer layout with image/text, drag/drop and resize, save, export and inspect real image/file. Where a live authorized Canva account is available, run a safe disposable project; otherwise mark a replica honestly.
2. **Higgsfield-like asynchronous video creation/editing:** upload source media, choose actual tool available, track job to completion, edit/trim and verify exported video metadata; do not burn third-party user credits without a scoped approved test budget. An asynchronous replica is not proof of actual Higgsfield.
3. **Google Ads and Meta Ads** are different domains: assess business intent, location, buyers, campaign objectives, eligible keywords vs audience/events, conversion readiness, creative and justified spending scenarios. Prepare drafts and read them back in sandbox; do not publish or charge a real account without explicit campaign-spend authority.
4. **Database and CRM:** inspect actual tenant-scope data, make a safe scoped non-destructive update in disposable workspace, check constraint/row count and outcome; no cross-tenant access or blind production changes.
5. **SEO/blog and multi-site client research:** permitted sites, real source provenance, business-fit reasoning, edited draft posts in a CMS, and structured verified leads; no fabricated traffic, promised customers or unsolicited sending.
6. **Cross-app files:** Blob download from authorized app → durable in-task bytes/hash → upload once to another authorized app, and check content. Extend to iframes if safe; preserve origin-scoped memory/TTL.
7. **Challenging new site:** RTL, virtualized rows, shadow DOM, zoomed canvas, dynamic popovers, hidden background tabs and failure responses; independently grade final server state, not the model's completion message.

Use a **balanced quick/complex/adversarial sample** and focus code fixes on error classes that appear across multiple categories. Treat each real SaaS account as an external dependency; do not claim it tested if it was not connected.

## 8. P0: Robustness, parallel tasks, and failure recovery

### Mandatory high-priority chaos tests
A. Kill MV3 worker **after server accepts one write and before local receipt**; test real-model resume and exactly-once external state.
B. Real DeepSeek \`max\` turn interrupted while tool operates; verify recovery and no duplicate action/cost.
C. Two authorized disposable signed-in users concurrently through separate Chrome profiles; prove server tenant/file/run isolation with real tool requests, not solely unit mocks.
D. Remote skill whose SHA matches but which contains hostile instructions to ignore permissions; Xroga ignores escalation, continues safe task.
E. 20 executing workers: verify no more than intended windows/tabs, no accidental 26 for 20, no orphan processes and no parallel writer collisions. Report speed against a sequential arm; don't use 20 agents just because user permits spending.
F. Exporting a file from an embedded frame/Blob with immediate URL revocation; verify byte hash and no cross-origin leak or unnecessary MAIN-world persistence.
G. A save screen that falsely says success while HTTP returned 404/500; don't claim success or blindly retry.
H. Human uses the tab simultaneously (including inside frame and zoom); agent yields correctly and doesn't misattribute input.
I. Provider 429/502, tool schema mismatch, slow rendering, expired session, MFA and CAPTCHA: distinct blockers with viable recovery vs essential user step.
J. Browser open at a random never-seen editor: verify action selection independent of known-site and skill keywords.

### What counts as fixed
For each failure: store before trace, root cause, changed code, unit/fake negative case, real Chromium + DeepSeek positive case, independent page/server state confirmation, and no regression in unrelated workflows. Lack of model result/denied account must be explicitly labeled—not quietly skipped.

### Workers
Recent real-model 20-page work: 20 workers all 20/20 correct in four runs, wall 89/147/210/234 s; sequential 175 s once; one run opened 26 windows. **No proven uniform speedup.** Keep default adaptive based on independent durations, queue pressure, tool/provider constraints and tab ownership. Investigate extra-window cause before raising permanent worker cap.

## 9. Four-to-five-hour execution order — do as much actual engineering as possible

This is an **engineering time allocation**, not a hidden runtime cap or hard guarantee. If an upstream service stalls, stop wasting minutes and continue an independent code slice; preserve evidence.

| Window (approx.) | What to do | Required proof before moving on |
| --- | --- | --- |
| 00:00–00:20 | Recheck exact source, paired staging backend, current regression and one failing complex run | Correct source SHA + reproducible failure trace; no stale assumptions |
| 00:20–01:20 | Repair high-impact general no-progress/action/grounding defects in executor and browser control | At least one actual code fix, unit + two unrelated Chromium acceptance cases |
| 01:20–02:10 | Optimize Nanobrowser action batching, tab/frame ownership, event waits, model/tool calls, human takeover | Baseline vs candidate time-to-verified-outcome; no wrong/duplicated actions |
| 02:10–03:00 | Source-first integrate top 2–4 genuinely useful donor modules, and wire DeepSeek tool discovery | Source pins/license + callable code + model-selected tool and external postcondition |
| 03:00–03:45 | Advanced unfamiliar editor + business/data/cross-app workflows, generalize failures | Verified saved/exported/draft/row state, no hidden site-specific prompt |
| 03:45–04:25 | Chaos and worker correctness: crash-after-write, two users, hostile skill, worker window count, provider retry | Real evidence or precisely recorded blocker; no false-success |
| 04:25–05:00 | Exact-source CI, Chromium suite, build/upgrade, staged browser/model replay, evidence and next actions | Clean SHA-aligned ZIP, hashes, backend compatibility, unchanged production, rollback steps |

When a phase is done early, spend remaining time on the **highest-severity failing user outcome**. Don't waste hour three rewriting an elaborate handover. When time runs short, prioritize correctness and tested production-suitable fixes above broad but unverified new features.

### Continue without repeated requests
- Routine coding, fixing tests, using public repo references, staging with already-approved resources: **proceed**.
- Truly new costly credentials, third-party paid generations or ad spend, publishing, sending messages, destructive prod actions and protected production rollouts: **do not guess permissions**. Use safe drafts/replicas and keep coding other things.
- If CI fails from your changes: diagnose and fix rather than changing assertions to hide errors.
- If benchmark worsens: revert/adjust; do not report theoretical gains.
- If the app cannot be used because of an external 402 or missing account: don't loop calling it; use local fallback or an independent test and report the blocked real-account case.
- Never promise 100% of all possible tasks; report actual outcome coverage, measured latency and open defects.

## 10. Exact final deliverables for founder's morning review

At the end of **actual executed work**, leave one concise human-readable report linked to source and evidence:

1. **Code:** branch, exact HEAD, changed files/modules, behavior before vs after; commits pushed.
2. **Model:** served staging revision/tag + actual DeepSeek high/max/vision verified on product chain and any tool decision improvements.
3. **Browser:** controls, snapshots, coordinates, drag/drop, canvas, file, timeline, tab ownership and responsiveness changed and tested.
4. **Reliability:** repeated action loops broken, wrong target retries, business write idempotency, service-worker recovery and human-control proof.
5. **Workers:** sequential vs 2/4/8/12/20 when run, spawned windows vs intended, wall clock/cost/success and suspected anomalies.
6. **OSS actual reuse:** repo name, pinned SHA/license, selected function/code, target Xroga source, model tool call evidence and measured result—not clone count.
7. **Advanced outcome tests:** real vs replica vs controlled vs unrun, prompt class, independent verification, screenshot/artifact/server receipt and exact errors.
8. **Benchmarks:** p50/p95 task time, provider wait, tool/image overhead, turns, retry count, failure rate, false-success count and real model billable cost *only if measured*.
9. **Package:** exact-source extension ZIP path and SHA-256, source manifest, install/upgrade smoke, compatible backend image/digest, rollback steps, status of independent security review and PR #997 re-attestation.
10. **Incomplete:** honest list of unresolved critical failures, accounts/authorizations needed for real external tests, items intentionally deferred and best next engineering work.

**Classification labels required:** \`BUILT+PROVED_REAL_PRODUCT\`, \`BUILT+CHROME_FIXTURE\`, \`UNIT_ONLY\`, \`NOT_RUN\`, \`FAILED\`, \`EXTERNAL_ACCOUNT_REQUIRED\`, \`SECURITY_REVIEW_REQUIRED\`. Don't conflate a mocked page with real Meta/Canva/Higgsfield, nor test coverage with product completion.

## 11. Cross-reference and no-regression rules
- [Universal complex-app 72-repo engineering manual](./BROWSER-OPERATOR-UNIVERSAL-COMPLEX-APPS-CANVA-HIGGSFIELD-ADS-ENGINEERING-20261122.md)
- [Advanced production-finishing mission](./BROWSER-OPERATOR-ADVANCED-UNIVERSAL-PRODUCTION-FINISHING-20261122.md)
- [Source-first 72-repo implementation playbook](./BROWSER-OPERATOR-SOURCE-FIRST-72-REPO-INTEGRATION-20261121.md)
- [36 advanced acceptance contracts](../acceptance-specs/BROWSER-OPERATOR-36-ADVANCED-REAL-WORLD-ACCEPTANCE-20261122.json)
- [Full-power reasoning and 64 universal seeds](./BROWSER-OPERATOR-FULL-POWER-REASONING-UNIVERSAL-ACCEPTANCE-20261121.md)
- [Current reported engineering status](../evidence/browser-operator-20261110/FINAL-ENGINEERING-REPORT-20261122.md)
- [v8 handover and exact build addenda](../evidence/browser-operator-20261110/RELEASE-HANDOVER-20261121-v8.md)

**The founder's key requirement:** Build a genuinely advanced, responsive, adaptive and reliable browser executor with **general-purpose competence on unfamiliar software**, not a limited site-script generator. Xroga should itself complete authorized browser work, intelligently choose actual methods and discover skills/tools, stop wasteful loops, verify outcomes and deliver real evidence. The current real failures are your engineering backlog. **Do as much substantial code-and-proof work as possible in the active 4–5-hour session.**
