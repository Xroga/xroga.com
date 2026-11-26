# XROGA BROWSER OPERATOR — UNIVERSAL BUG-ELIMINATION, NO-LOOP & VERIFIED-OUTCOME ENGINEERING MASTER
## Implementation order for Claude Code · 22 November 2026 · PR #976

**Project:** Xroga's existing Nanobrowser-derived Chrome extension plus its canonical Xroga backend. **Branch:** \`claude/ops-integrated-20261112\`. **Source check:** 43393d42f1347d9ad170cb89a556236b1de6c8cd was the branch HEAD when this directive began; recheck HEAD and avoid overwriting concurrent changes.

**The founder's non-negotiable product goal:** A user opens any authorized website and asks Xroga to complete a task. Xroga must intelligently interpret the objective, discover live browser and connected-app capabilities, execute correctly, adapt immediately when wrong, stop repeated actions and agent conflict, independently verify the requested outcome, and deliver it fast. This must work across unknown design apps, editors, marketing consoles, databases, CRM, Shopify, SEO/content, multi-site workflows, and applications we have never trained on.

**This is a source-code repair order, not another documentation sprint.** You must implement and independently test the general runtime corrections below. Do not hardcode TraceDraw, Canva, Ads, or specific prompts in the universal system message. Apps below are **holdout tests of generalized capability**, not required per-site skills. Do not claim literally every future task can succeed with no bugs: unauthorized sites, MFA, outages, API denials, unknown features and other external constraints exist. The engineering goal is verifiable high coverage, bounded recovery and no false claims.

The founder authorizes routine development, deep inspection of compatible OSS source, staging, testing and ordinary platform-funded model execution. **This does not authorize using someone else's login credentials, bypassing MFA, sending external messages, charging a user's account, publishing ads, deleting records, exporting private data, or changing production permissions without the appropriate account/task authorization.**

---

## 1. First correct the obsolete “45%” narrative

The previous ~45% completion estimate was a **subjective judgment**, not a benchmark. Do not repeat it as a current objective measure or turn it into fake 100%. Some of its old findings are now false.

Read \`docs/xroga/evidence/browser-operator-20261110/FINAL-ENGINEERING-REPORT-20261122.md\` and v8 handover, then inspect the live branch. Reported since then:
- **High reasoning is now enabled in the staging backend**, and the earlier private backend logged 50 real high turns. Direct provider probes tested max, but a high→max escalation through the currently tagged actual device chain is not yet proven.
- Direct-provider 31-task arms passed none 28, high 25, max 28; higher reasoning **did not prove greater success** and increased latency. High stays the founder's staging default unless expressly changed; fix observability and tool grounding rather than substituting “more thought” for failed actions.
- **20 workers were actually run** against independent tiny pages. They succeeded but were **not reliably faster**; one run created 26 browser windows for 20 jobs. Distinguish read-only \`delegate\` from executing \`start_parallel_tasks\`.
- Native date/time handling improved calendar fixtures from 1/6 to 6/6. File transfers of top-page \`blob:\` exports into a second app were demonstrated with real DeepSeek. SkillsHub's 402 is **contained by a circuit breaker/fallback**, not globally resolved.
- A real TraceDraw run failed after 47 turns and 462 seconds; the timeline-split and painted-menu seed 4 remain failed. Owner signed-in Chrome, real Ads/Meta/Shopify/Drive accounts, two actual signed-in test users, hostile digest-valid skill, interrupted remote write, iframe-created Blob export, independent security review and production gates remain unfinished.
- Reported 1,458 unit tests and 304 Chromium scenarios belong to specified earlier candidates, not automatically this new HEAD.
- Of 72 pinned OSS candidates, most original source-ledger records remain **INSPECTED**; a few source ports are real. Do not confuse inspected/cloned with an invocable, tested capability.

**Action:** Create ONE risk-ranked failure register with exact reproduction, start state, outcome predicate, source SHA, observed trace, independent result and remediation. Use current code and real provider. Avoid more generic broad claims.

## 2. THE critical design error: a changed page is NOT a completed goal

Actual code:
- \`apps/xroga-browser-extension/src/agent/progress-tracker.ts\` fingerprints \`[tool,action,args,tab]\` and \`[tab,url,resultText,isError]\`; its repeat/failure/no-effect counters trip at 3/3/4.
- In \`src/agent/loop.ts\`, broad “progress checks” still appear at model turns **20, 35, 50**.
- \`src/agent/completion.ts\` has observation debt, and a subsequent same-tab \`snapshot/find/read/screenshot\` can clear certain debts without proving the original external goal predicate.

An AI can click different menus endlessly, causing a changed screenshot every time, while doing **zero actual task work**. Re-opening Image/Window/Effects/Tools is action activity, NOT creation of the requested shape. A click that triggers a toast is NOT a saved ad draft. A UI “Saved!” is NOT database commit. A \`blob:\` download trigger is NOT an actual usable uploaded file.

**Fix this with TWO separate ledgers:**
1. \`ActionObservationLedger\` — what tool was dispatched, what input target, tab/frame/document identity, before/after visual/DOM revision, network status, effect/no-effect, dispatch uncertainty.
2. \`OutcomeVerificationLedger\` — what the user actually requested, canonical goal IDs/dependencies, which precise acceptance predicates have been independently proven, verified external object IDs/files/project IDs, and what remains incomplete.

A fresh screenshot may clear *lack-of-observation* but cannot by itself certify a server-side mutation or an exported file. Completion must require every required goal predicate to be verified with the appropriate source. Preserve partial verified goals across errors/restarts.

### Proposed typed contracts — fit existing scheduler rather than adding a second one
~~~typescript
type GoalPredicate = {
  id: string; deliverableId: string;
  kind: 'field_value'|'record_exists'|'record_updated'|'artifact_bytes'|
        'media_metadata'|'canvas_object'|'timeline_state'|'source_claim'|'permission';
  expected: unknown;
  verifier: 'dom_readback'|'server_readback'|'receipt'|'file_hash'|'visual_state'|'trusted_source';
  status: 'pending'|'verified'|'failed'|'unverifiable';
  evidenceRef?: string;
};
type ActionAttempt = {
  id: string; runId: string; goalId: string;
  method: 'dom'|'visual'|'keyboard'|'batch'|'app_native'|'connected_api'|'skill'|'worker';
  targetIdentity?: string; tabId?: number; frameId?: string; documentRevision?: string;
  preconditionHash?: string; requestedChange: string;
  dispatched: boolean|'unknown'; actualEffect: 'changed'|'none'|'unknown';
  goalProgress: 'verified'|'none'|'unknown'; errorCode?: string;
  idempotencyKey?: string; externalObjectId?: string;
  spentMs?: number; providerTokenCost?: number;
};
type BrowserRunCheckpoint = {
  goals: GoalPredicate[]; lastVerified: string[];
  attempts: ActionAttempt[]; pendingExternalWrites: string[];
  tabLeases: unknown[]; lastKnownStateDigest: string;
  modelContextSummary: string;
};
~~~

Implement as an **extension of the existing ExecutableTaskNode/Outcome Contract, scheduler, tool result and run store**, with backwards compatibility and tenant ownership. Avoid a new status store or duplicate orchestration service.

### Definition of verified completion
- Drawing: actual selected canvas/project contains requested shape type, color, geometry and saved document state.
- Video: generation job completed, final file is playable, duration/aspect/metadata match, one user-credit charge where relevant, project persists.
- Ads: campaign **draft** ID, exact goal/geography/objective/keyword or audience/budget fields verified after reload; no accidental live spend.
- Database: correct owned row IDs/values and row count verified by readback, RLS never violated.
- SEO/report: sourced claims, requested document exists and no invented volume/traffic estimates.
- Client research: deduped verified company/site/contact information and no unsolicited outreach.
- Cross-app: matching input/output hashes, exact destination record and no duplicate upload.

**Guard:** A model cannot call \`done(success)\` merely because it has performed N tools or seen another image. It must produce credible evidence refs for all required predicates; else partial/blocked/failed with precise reason.

## 3. Universal no-loop / no-fighting controller

Build an explicit diagnostic layer (within the EXISTING loop, not a new top-level agent) that distinguishes seven problems:

| Failure class | How it looks | Required remedy |
| --- | --- | --- |
| **Exact duplicate** | Same action+target+page again | Stop repeat until fresh evidence/precondition |
| **Cosmetic oscillation** | Different panels/screens, goal never changes | Compare verified-goal digest; switch method or identify blocker |
| **Self-undo** | Agent undoes a successful edit on next turn | Preserve verified goal state and detect contradiction |
| **Wrong object/selection** | Tool applies to background or different clip | Read selected-object identity, active tool and bounds |
| **Stale reference** | Ref/mark from old document, scroll, zoom, iframe | Invalidate target, observe current frame/document revision |
| **Async double-submit** | Pending generation/export causes re-click | Track job ID/status; wait with bounded polling, never duplicate charge |
| **Multi-agent conflict** | Parent, worker, retry and human edit same tab | Single writer lease, task scope, human-first arbitration |

Controller requirements:
- Evaluate **goal progress after EVERY meaningful action**, not only after 20 turns. No-progress sequence with changed pixels still counts as no progress.
- Diagnose *cause* before retry: wrong tab/frame, stale element, overlay, disabled control, validation, app server 4xx/5xx, loading/async job, model tool not available, platform permission, user took control.
- Keep a per-goal \`failed[(target,method,state)]\` registry. Reject another identical attempt until some relevant external state or validated precondition changes.
- Try **genuinely different available methods**: semantic DOM, accessibility ref, re-grounded vision, keyboard shortcut actually present, reviewed native command, authorized API, batched deterministic actions, verified reusable procedure, or isolated worker where independent.
- Do not “recover” by merely changing prompt wording while running the same wrong click again. Do not always restart the entire task, losing valid work.
- If all actual available methods are blocked, stop that subgoal with one accurate blocker. Other verified deliverables must remain usable.
- Uncertain external writes enter **READBACK_ONLY** recovery until remote reconciliation proves whether previous write landed. Duplicate transaction, upload, payment, ad edit, email or delete is unacceptable.
- Counterexample test: wrong menu changes content after every click, so the old effect/no-effect tracker would never stop it. New controller must detect **zero verified goal advancement** and recover promptly.

Illustrative flow:
~~~typescript
async function classifyAndAdvance(goal, attemptedAction, newObservation, runLedger) {
  const proof = await verifyGoalAgainstExternalState(goal, newObservation);
  runLedger.record(attemptedAction, proof);
  if (proof.verified) return { next: 'dependent_goal', checkpoint: true };
  if (attemptedAction.dispatched === 'unknown')
    return { next: 'read_only_remote_reconciliation' };
  const rootCause = diagnoseTargetAppMethodAndState(goal, attemptedAction, newObservation, runLedger);
  const next = selectAuthorizedAlternative(rootCause, runLedger.availableTools(), goal);
  if (!next || !isMateriallyDifferent(next, attemptedAction))
    return { next: 'block_subgoal', cause: rootCause, keepVerifiedGoals: true };
  return { next: 'execute', action: next };
}
~~~

## 4. Reliable targeting: DOM, frame, zoom, canvas, drag-and-drop and timeline

A **universal action must be grounded in the CURRENT UI**, not a familiar menu guess from model training.

**Stable DOM/a11y**: identify exact current tab, frame, document revision, role/name, hidden/disabled/occluded state, active selection, validation and connected account. Treat refs as invalid after route change/re-render/virtualization. Support Shadow DOM, contenteditable, nested scroll, RTL, custom form fields, native date/time values, overlay dialogs, custom selects, hover and drag gestures. Fill whole input values; verify after blur/submit and after actual persistence.

**Visual target**: bind screenshot to exact viewport, devicePixelRatio, zoom, scroll and frame transform. If cropped or enlarged, preserve transformation matrix. Marks are candidate labels, NOT guaranteed correct locations. Detect ambiguous/illegible mark and re-observe, never click random neighboring coordinates. When menu opens, observe where the actual popup exists; do not assume below or beside original control.

**Canvas object actions**: determine active tool, selected object/handle, layer and geometry before dragging. Track image/pixel diffs **and object-level postcondition**. Verify that the new red triangle or blue circle actually exists, not just a highlighted menu. After zoom/resize, recalculate coordinates, including nested frame coordinate origins.

**Timeline and media**: resolve clip ID, track ID, playhead timestamp, frames/seconds and ruler scale from actual app state. Split or trim with known preconditions; verify persisted clip boundaries and exported duration. Test 3 unrelated editors with shuffled layouts, not one TraceDraw path.

**Browser actions**: implement robust mouse/pointer/keyboard/clipboard/drag/drop/right click/hover/multiselect/scroll/upload/download/select/edit/wait semantics. If browser-level native HTML5 drag differs from pointer events, choose grounded correct delivery; do not use arbitrary page eval on logged-in websites to bypass Chrome security.

**Postcondition:** do not trust a menu toggle, file download started event, job accepted toast or cosmetic UI hash as goal completion. Use app object and server state, media bytes or verifiable project/readback.

## 5. Realistic complex workflows Xroga must be ready for

These are **capability acceptance examples, never required hardcoded skills**.

**Canva / visual editors.** User asks for a multi-scene branded vertical ad with supplied product assets: inspect project and brand inputs, identify pages/layers/timeline, import assets, place and resize, edit text/fonts, animate, set scene durations, verify saved design, export and check playable file/dimensions. Use a connected official Canva tool only if actual permissions/tool schemas exist; user browser login does not automatically grant a public SDK to Xroga. Detect paid stock assets and ask before spending user credits.

**Higgsfield / AI generation.** Choose real available model/workflow, validate references, aspect and duration, avoid unsupported assumptions about plan/features, submit job once, keep job ID, watch asynchronous status, inspect output, make requested edits and export working file. No duplicate paid generation after network drop.

**Google Ads.** Understand user's actual business, geography, goal, landing page and conversion setup; research verified search intent/eligible keywords/negative keywords, select campaign type and **draft** settings, verify exact fields and policy flags. Never claim qualified buyers or guaranteed ROAS from model speculation. Publishing/spending user ad funds requires scoped approval.

**Meta Ads.** Different platform: verify Pixel/CAPI/event availability, objective, audience/placement, creative and geography; save verified hierarchy of campaign/ad set/ad in **draft**. Do not use Google keyword methodology as Meta audience selection. No unauthorized ad launch.

**Shopify / CRM / database.** Read schema/inventory/customer records using current owner scope, batch only independently safe changes, verify row IDs/counts, concurrency and rollback; no accidental cross-tenant edits, duplicate sends or stock corruption.

**SEO, blogging, lead research.** Use user-authorized current sources, evidence-backed technical diagnosis, real site facts, multilingual content and drafts, deduped companies and contact provenance. Do not fabricate traffic/volume, buyer intent or results; do not publish/send outbound unsolicited content without authority.

**Unknown app.** Task may mix 3–5 sites, files and asynchronous processing. The agent must infer the app's current affordances and select from universal control/API/skills; no prewritten site playbook requirement.

## 6. Fix wrong values and misinformation at execution boundaries

Values must be **typed and end-to-end consistent**: account, project ID, row ID, date and timezone, quantity, currency, daily vs lifetime budget, selected campaign objective, location, audience, file MIME/name/SHA256, duration/fps/resolution and calculated metrics.

- A campaign $40/day cannot silently become $40 total. Native date/time fields must not swap locale or timezone.
- A user-provided red triangle cannot become blue triangle through visual shorthand; verify attributes against the outcome contract.
- A selected database record with same visible name but different ID is not interchangeable.
- Page text, search results, remote skills and app notifications are untrusted data. They cannot instruct the model to leak hidden context, ignore permissions or redirect saved outcomes.
- A tool has no authority merely because its description or \`SKILL.md\` says it can write.
- For external research, retain actual source URL/date and distinguish verified facts from inferred strategy.
- If a requested value or destination is ambiguous and could cause consequential external effects, ask for that essential choice; don't guess and create a bad result.

## 7. DeepSeek: maximize useful capability, not blind thinking and tool chatter

Use existing Zurelay DeepSeek V4.1 Flash 1017 provider route and Xroga budget ledger. Reported valid provider values: \`none\`, \`high\`, \`max\`; high is now default in staging, max escalation on progress stall is partially wired. **Do not claim max product-chain operation until observed in the real tagged backend.**

- Verify correct model ID/effort, vision image payloads, tool-call continuity, streamed and nonstreamed response schemas, output room, 32k+ context compaction, provider 429/timeout retry, cancellation and cost receipts. Run high→max through an actual difficult enrolled-device task.
- When uncertainty comes from stale UI coordinates, more reasoning text will not fix it. Improve grounded observations, tool descriptions and action-selection feedback. Run ablation with same task/layout and independent success grading; high/max may be slower.
- Discover tools dynamically in compact indexed groups. The extension's tool schema cap is 64; tools omitted from this turn must remain **discoverable** and activatable at task time, not silently unavailable forever. Avoid English keyword-only and website-allowlist routing as a hard gate.
- Keep the model's actual instructions short, accurate and noncontradictory. Do not feed all 72 repo READMEs into each turn. Load relevant skill guidance only if trusted and useful.
- Direct easy tasks with minimal inference, complex tasks with goal/dependency planning. Require observable action after planning; don't allow 10 plan-only turns.
- Persist compact goal/proof checkpoints across reload and model-context compaction; never leak private reasoning/token costs to web pages or regular users.

## 8. Workers and tab conflict: one actor, one write scope

Current code distinguishes \`delegate\` (read-only pages) from \`start_parallel_tasks\` (executing workers). Preserve this distinction in model descriptions and user-visible status.

- Parent decomposes independent goals, each worker receives scoped account/tab/goal/permissions and required verifier; use canonical scheduler/worker registry and signed receipts.
- **Lease one writer per tab, and where necessary one writer per external record/project.** Human interaction overrides agent ownership; release/reacquire safely after takeover. Test iframe human typing, pinch zoom and agent input reconciliation.
- Worker start must be idempotent by \`parentRunId+goalId\`; retry should reattach, not create an extra window. Trace and eliminate 26-window/20-job anomaly.
- Check worker startup, child timeout, window cleanup, cancellation, provider 429 and merge of verified results. A failed child should not cause parent to duplicate other children's successful writes.
- Run concurrency 1/2/4/8/12/20 only when independent work may benefit; record total time, tokens/cost, workers/window count, p50/p95 including failures. 20-way concurrency is not necessarily a performance win.
- Test two truly signed-in disposable owners concurrently against same backend: reject cross-tenant run, tab, files, screenshots, evidence and worker operations.

## 9. Files, media, external APIs and replay after crashes

Current top-frame \`blob:\` capture was useful, but contains a main-world \`URL.createObjectURL\` wrapper and does not prove iframe-generated blob captures. Require security review of origin isolation, memory-only TTL and size, accidental interference with app behavior, and cleanup. Scope capture to an authorized download-keep workflow where feasible. Verify exact SHA-256 both before and after upload, no duplicate destination POST and no file exfiltration.

**Critical chaos cases:**
1. Remote server accepts record write; MV3 worker crashes before acknowledgment. On resume, reconcile existing remote state first, never duplicate mutation.
2. Paid generation accepted, provider connection times out; resume same job ID rather than paying again.
3. Child worker loses window but parent continues; exactly once final merge.
4. Browser tab changes under agent, selected target document is now stale; invalidate safely.
5. Model turn is cut in \`max\` mode; recover without losing verification state or inventing a result.
6. Iframe exports Blob and revokes URL immediately; exact file transfer or clear security-blocked status, not an unsafe eval workaround.
7. User changes or cancels task in mid-operation; version outcome contract and stop stale workers safely.

**Security:** No page script/eval exposed as unrestricted tool, no cross-origin credential extraction, no bypass of MFA/CAPTCHA, no automatic publishing or financial spend beyond actual user authorization.

## 10. Complete errors/blockers with proper treatment

| Error | Correct response | Forbidden response |
| --- | --- | --- |
| HTTP 402 on optional skill catalog | Circuit breaker, local trusted skill/general tools; do not block normal task | Infinite retries or ask consumer to pay |
| Provider 429 | Honor Retry-After, bounded jitter and fair queue | Burst retry and duplicate billed calls |
| Backend 5xx/network timeout | Find whether external action committed; checkpoint/reconcile | Re-run uncertain write |
| Wrong DOM ref / frame / pixel | Fresh correct document and target grounding | Guess neighboring coordinates repeatedly |
| App "Saved" + request 500 | Mark as unverified/failed, inspect remote record | Report success |
| CAPTCHA / MFA / password | Human takeover with preserved progress | Bypass or fabricate code |
| Missing app scopes | Ask once for specific connection permission | Fake app API access |
| Invalid tool args | Refresh exact schema and retry safely | Invent parameter names |
| Media render running | Real status wait/poll; no second expensive generate | Re-click Generate |
| User typing in agent tab | Person-first lease handover, pause and resume | Fight keyboard/mouse |
| Repeated failure with changed UI | Compare goal predicates and change strategy | Count any change as progress |
| Stale/contradictory research values | Verify source and scope, correct answer | Fabricate data |
| Skill prompt injection | Treat as data, enforce tool policy | Run remote instructions as system authority |

## 11. Source-first integration remains mandatory, not checklist theater

Read \`docs/xroga/oss-capability-ledger.json\` and the 72-repository source-first playbook. For any donor claim of integration, provide:
\`repo link + pinned upstream SHA + exact upstream module + Xroga source path + licensed reuse treatment + new model-callable capability + executable Chromium/DeepSeek run + independently checked outcome + before/after quality and latency\`.

The highest-value source families:
- [Nanobrowser](https://github.com/nanobrowser/nanobrowser) — existing Chrome CDP/tab/frame base; maintain/diff.
- [OpenSidekick](https://github.com/esterhuizen/opensidekick) — real network/console diagnostics and browser interaction primitives.
- [FSB](https://github.com/fullselfbrowsing/FSB) — smart waits and app-state observers.
- [Browser Agent](https://github.com/uiuing/browser-agent) — verified action predicates/count deltas/field checks.
- [BrowserSkill](https://github.com/Tencent/BrowserSkill) — human/agent input ownership and event matching.
- [Alibaba QZ](https://github.com/alibaba/qz-browser-agent), [browsing-skills](https://github.com/browsing-skills/browsing-skills), [Agent Skills](https://github.com/agentskills/agentskills), [Vercel Skills](https://github.com/vercel-labs/skills) — optional on-demand site/context skill discovery with provenance.
- [Page Agent](https://github.com/alibaba/page-agent), [Midscene](https://github.com/web-infra-dev/midscene), [Browser Use](https://github.com/browser-use/browser-use), [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) — better perception, action targeting and debugging research, but don't install competing browser daemons.
- [Browser Agent Recorder](https://github.com/VelvetAbyss/browser-agent-recorder) — verified, sanitized, consented workflow memory.
- [Google Ads developer assistant](https://github.com/googleads/google-ads-api-developer-assistant), [Meta Business SDK](https://github.com/meta/facebook-python-business-sdk), [Shopify skills](https://github.com/Shopify/agent-skills) — professional domains and official API shape, only with real authorization.
- [FFmpeg WASM](https://github.com/ffmpegwasm/ffmpeg.wasm), [Mediabunny](https://github.com/Vanilagy/mediabunny), [Sharp](https://github.com/lovell/sharp), [MarkItDown](https://github.com/microsoft/markitdown), [Docling](https://github.com/docling-project/docling) — on-demand backend/media and artifact checking where relevant.

Do not claim that simply cloning all repositories makes Xroga universal. Some are reference code, incompatible runtimes, heavy processors, unknown-license/AGPL or paid services. Refuse unsafe/unlicensed copying and record reasons. Prioritize **actual transferable fixes** over donor count.

## 12. Implementation work packages — surgical source edits and gates

**WP1 (P0):** Add goal predicates and outcome ledger to existing task graph/loop. Make \`progress-tracker.ts\` detect changing-page/no-task-progress within first few turns. Write reproducible negative test before code edit. Verify wrong panels do not trigger infinite retries.

**WP2 (P0):** Strengthen \`completion.ts\` distinction between observed-page result and independently verified external action. Add explicit uncertainty/idempotency/remote readback for all irreversible writes.

**WP3 (P0):** Repair frame, coordinate, mark, selected-object and editor/timeline targeting on unseen apps. No hostname-specific shortcuts. Test at least three unrelated canvas/timeline editors including one real authorized product if accessible.

**WP4 (P0):** Worker/tab/record ownership and human takeover; fix 26-window anomaly and worker retry/orphan cleanup. Test 2 signed-in users and actual service-worker kill.

**WP5 (P0):** Instrument latency across failed and successful product-chain runs; fix wasted screenshots, model calls and duplicate observations. Compare same tasks before/after, not different easy fixtures.

**WP6 (P0):** Extend real DeepSeek high→max product-chain proof, long context, provider costs and tool discovery; no fabricated high/max benefits.

**WP7 (P1):** Secure frame-aware Blob export/cross-app files, asynchronous media jobs, professional application drafts and source-grounded SEO/client work.

**WP8 (P1):** Reconcile selected donors against actual source and acceptance evidence; integrate the highest-value missing functions safely, one change at a time.

**WP9 (P0 Release):** Exact-HEAD tests, signed-in staging extension+backend, fault injection, security/tenant/cost gates, manifest+SHA256 and rollback. No production promotion without independent security review, PR #997 re-attestation and founder authorization.

Do not spend entire engineering effort writing more documents. Every work package needs an actual source change, before/after independent run and honest remaining defect entry.

## 13. Required test campaign and performance scoring

Baseline simple click tests remain valuable as smoke, **not universal proof**. Advanced holdouts must use unfamiliar layouts, dependent steps, hidden failure conditions and independent app/server state verification. Randomize text, positions, delayed buttons, fields and selected account objects; keep unseen variants held out from model prompt tuning.

For every test record \`testId, category, real third-party vs authorized replica, initial app state, exact user task, expected verified goal IDs, forbidden side effects, tool/model settings, source SHA, backend/image digest, screenshots/receipts as relevant, success/partial/failed/blocked, wall time including timeouts, turns, model/image/cost totals, repeats, wrong-action recovery, last verified state\`.

Measure p50/p95 and sample counts separately for simple and advanced categories; a 20-minute timeout is a **failure**, not a fallback success. Do not drop failures from latency statistics. A task that can genuinely be completed by a person in 1–2 minutes should be benchmarked for gap in action count, observation quality and external latency; seek large improvements but avoid fabricated universal SLA guarantees.

### Additional failure-class acceptance contracts
| ID | User-level task / injected failure | Pass condition independently checked |
| --- | --- | --- |
| LOOP-01 | Wrong menu clicks always change pixels | Stop oscillation or change real method before extended loop |
| LOOP-02 | Exact same click/no effect four times | No fifth duplicate attempt on unchanged state |
| LOOP-03 | Previous correct object is accidentally deleted | Restore/checkpoint correct goal; no false success |
| DOM-01 | Rerender invalidates old element ref | Re-observe correct document and use fresh target |
| DOM-02 | Nested shadow DOM and iframe select | Intended target only, persisted readback |
| VIS-01 | Zoomed canvas triangle and circle | Both exact shapes/colors saved |
| VIS-02 | Menu opens above/left after viewport resize | Actual popup observed, correct item |
| VIDEO-01 | Split at timestamp on timeline with zoom | Exact saved clip bounds |
| VIDEO-02 | 3-scene video export with queue | Correct playable file, one paid job |
| ADS-01 | Google Ads-style campaign with policy flags | Correct eligible draft, no spend |
| ADS-02 | Meta Ads-style objective/creative | Correct saved draft, no irrelevant keywords |
| DATA-01 | UI success toast while server POST 500 | Failed/unverified result, no false write |
| DATA-02 | Cross-tenant similar record names | No unauthorized data changed |
| FILE-01 | Blob URL revoked immediately | Correct SHA256 transfer once |
| FILE-02 | Iframe Blob export | Safe exact-byte capture or truthful blocker |
| CRASH-01 | Service worker dies after server accepted write | Exactly one write on recovery |
| CRASH-02 | Long max reasoning turn interrupted | No duplicate call; task state survives |
| HUMAN-01 | Human types in iframe during agent action | Human input wins; agent safely parks |
| WORKER-01 | 20 jobs retry startup | Exactly 20 jobs, no unnecessary orphan windows |
| WORKER-02 | Two workers target one record | Exclusive writer ownership; one correct change |
| USER-01 | Two signed-in account runs simultaneously | Tenant and artifact isolation |
| SKILL-01 | Valid digest, hostile skill content | No permission override or data leak |
| PROVIDER-01 | Provider returns 429 | Bounded backoff, no double billing |
| PROVIDER-02 | Skill catalog returns 402 | General tools/local skill fallback, no user billing prompt |
| CONTEXT-01 | Task goes past 32k tokens | Goal and evidence survive compaction |
| WRONG-01 | $50/day budget vs $50 lifetime UI default | Correct daily budget stored |
| WRONG-02 | Native timezone date input | Correct actual UTC/local event persisted |
| RESEARCH-01 | SEO analysis with no verified volumes | No invented volumes/traffic/ROAS |
| RESEARCH-02 | Multi-site duplicate company discovery | Correct dedup and factual provenance |
| RELEASE-01 | CI passes but external security review missing | Staging only; no false production claim |

**Test result provenance labels:** \`LIVE_REAL_THIRD_PARTY\`, \`LIVE_DISPOSABLE_REPLICA\`, \`REAL_CHROME_FIXTURE\`, \`DIRECT_PROVIDER\`, \`CONTROLLED\`, \`UNIT_ONLY\`, \`BLOCKED\`, \`UNRUN\`. Do not pool these into a fake 100% universal score. Add unseen multilingual/task-paraphrase variants.

## 14. Exact implementation sequence

1. **Baseline and reproduce:** check source SHA and previous v8 report; reproduce independent no-progress loop, selection error, timeline split, service-worker write uncertainty and window duplication with step-level trace. Do not run a 20-minute TraceDraw timeout as a primary development strategy.
2. **Fix correctness:** implement goal-progress ledger, postcondition requirements, one-writer/one-target arbitration, idempotency and truly adaptive recovery. Run regression across at least three unrelated apps, not just one fixed fixture.
3. **Fix general controls:** grounded DOM/visual/drag/frames/timeline/file primitives and their independent verifiers. Port donor source where it provides concrete measured advantage.
4. **Fix performance:** remove redundant model turns, screenshots and tool chatter; optimize safe batches and waits; record before/after p50/p95 and actual total costs.
5. **Fix complex scale:** multi-agent ownership, dual users, crash+resume, 429/402 and hostile remote skill; real DeepSeek high/max staging proof.
6. **Advanced holdout campaign:** media/editor, Google+Meta drafts, database, Shopify, CRM, content/SEO/client research and multi-app artifacts, with 2+ unseen variants each.
7. **Release candidate:** exact-HEAD extension ZIP+hash, matching staging backend digest/model/vision, upgrade+rollback, independent security and owner production approval gates. Clearly distinguish staging vs production.

## 15. Reporting contract: no fake “completed 100%” answer

Claude's next checkpoint must include **actual source changes**, source SHA, passing/failing independently graded scenarios, real-model traces and specific integration capabilities; not another descriptive handoff alone.

Report the TOP FIVE highest-severity systemic failures with (a) before, (b) exact code fix, (c) after on unrelated apps, (d) latency and costs, (e) remaining risk. Show which 72-repo sources gave a proven integrated behavior. Include progress/task plan, exact blockers, external account requirements and security review status. Any missing legitimate connection is \`BLOCKED_BY_ACCOUNT\`, not “fixed.” Any unrun test is \`UNRUN\`, not “covered.” A release ZIP without real account verification and independent security gates is **STAGING ONLY**.

**End requirement:** Do not make Xroga fight an app or a human, and do not allow DeepSeek to spin for minutes on a changed-but-unproductive screen. Fix the general runtime so a user prompt becomes a verified, correctly valued, efficiently completed outcome—even when the website, controls and task are unfamiliar.

### Required existing source documents
- [72-repository source-first implementation playbook](./BROWSER-OPERATOR-SOURCE-FIRST-72-REPO-INTEGRATION-20261121.md)
- [Complex Canva/Higgsfield/Ads engineering manual](./BROWSER-OPERATOR-UNIVERSAL-COMPLEX-APPS-CANVA-HIGGSFIELD-ADS-ENGINEERING-20261122.md)
- [Advanced universal finishing mission](./BROWSER-OPERATOR-ADVANCED-UNIVERSAL-PRODUCTION-FINISHING-20261122.md)
- [High/max DeepSeek and 64 acceptance contract](./BROWSER-OPERATOR-FULL-POWER-REASONING-UNIVERSAL-ACCEPTANCE-20261121.md)
- [Final code/evidence report](../evidence/browser-operator-20261110/FINAL-ENGINEERING-REPORT-20261122.md)
- [v8 source and release handover](../evidence/browser-operator-20261110/RELEASE-HANDOVER-20261121-v8.md)
