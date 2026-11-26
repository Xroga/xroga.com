# XROGA BROWSER OPERATOR — SOURCE-CODE REUSE & UNIVERSAL CAPABILITY IMPLEMENTATION PLAYBOOK

**FOUNDER-APPROVED ENGINEERING INSTRUCTION — 21 November 2026**  
**Recipient:** Claude Code working on `Xroga/xroga.com` / Browser Operator PR **#976**  
**Not for:** Codex Workspace presentation PR #989; do not mix the two.  
**Mission:** Convert the deliberately selected open-source browser automation repositories into *working, measured, safely callable Xroga capabilities*, then generalize those capabilities across unfamiliar real websites and tasks. **This is an implementation order and acceptance plan, not another metadata catalog or PR comment.**

## Read this first — correction to previous work

The owner supplied dozens of strong, practical browser-agent/skill/control repositories because Xroga should reuse their software engineering substance. Source inspection is only step zero. **Do not merely clone, document, score or describe them.** Find specific implementation modules, test them, adapt/port or connect appropriate pieces into Xroga's existing architecture, expose them to DeepSeek as usable capabilities, and measure whether actual authorized tasks complete more quickly and reliably.

**Do not take the opposite wrong approach:** installing 72 complete competing programs is not an integration. Cloning does not grant LLM capabilities. Many candidates are test fixtures, reference implementations, external API clients, licensable/unknown-license code, or heavy media backends. Several use other schedulers, CDP daemons, cloud browsers, arbitrary page evaluation, or require separate model services. Keep those outside the main extension unless a *measurable, compatible and permitted* module is justified. The user wants **one universal operator**, not 72 fragile toolchains.

The founder authorizes autonomous ordinary engineering decisions, local source cloning, approved private staging, existing-model calls and isolated tests. **User-level access and external effects remain scoped**: do not bypass login/MFA, purchase ads, send external messages, delete customer data, publish ads, change account permissions or run arbitrary site scripts without the relevant authorization. This distinction protects real customers and does not make the agent less capable.

## Current source facts Claude must reconcile (NOT claims of production readiness)

- Xroga's existing private fork already uses a Nanobrowser-derived deterministic browser layer, plus agent loop, sidepanel and signed-in Workspace bridge. Preserve the canonical execution scheduler, worker registry, provider budget ledger, approval state, tenant isolation, evidence and durable runs.
- The latest reviewed draft PR #976 HEAD was `1f493a59cc303cf56226d7db4bacd5a9226390fa` at inspection; **recheck the actual current HEAD** before editing or building.
- `docs/xroga/oss-capability-ledger.json` listed **72** candidates at the 2026-11-20 generated baseline: **56 INSPECTED metadata only**, 3 SOURCE REVIEWED, 3 CODE INTEGRATED, 2 INTEGRATED/UNIT, 1 ADAPTED IN CODE, 1 BEHAVIOR-COMPARED, 1 LIVE DEEPSEEK VERIFIED, 4 ALREADY PRESENT, 1 BLOCKED. **These labels are source-ledger state, not today's verified shipped integration coverage.** Refresh it after code changes.
- The browser handover v7 reports that `screenshot marks:true` and `canvas mark:N` are wired into the extension, 1,429 unit tests passed, and Chromium randomized canvas menus improved on some layouts. **TraceDraw still did not finish after 47 turns and 462 seconds.** Fix transferable failure classes, not one site's hardcoded coordinates.
- Repo evidence: `src/agent/strategy-selector.ts` uses hardcoded scoring over outline word matches; `src/agent/progress-tracker.ts` follows and recycles a fallback ladder; `src/agent/tool-selection.ts` uses English-like keyword cues to hide action tools; `src/agent/subagents.ts` implements parallel *readers without model calls*, not independent executing subagents. They are starting points for real engineering, not automatic showstoppers, but they must not be misrepresented as fully adaptive or full multiagent execution.
- The universal agent prompt previously asserted that painted dropdowns open below labels at roughly the same x coordinate. **Remove this false general rule.** Observe actual current menus, targets, geometry and postconditions.
- As of the last check, staging DeepSeek screenshots reached Zurelay and the model; production settings and current owner-browser foreground verification are still not proven. Don't conflate them.

**Primary developer entry points:** `apps/xroga-browser-extension/src/agent/{loop.ts,tools.ts,tool-selection.ts,subagents.ts,prompt.ts,progress-tracker.ts,strategy-selector.ts}`, `apps/xroga-browser-extension/src/browser-control/**`, `apps/xroga-browser-extension/src/extension/**`, `backend/src/routes/localBrowser.ts`, `backend/src/ai/**`, `docs/xroga/evidence/browser-operator-20261110/**`, and existing task/worker/budget/authorization modules (locate on current HEAD). Do not create guessed files without finding their true owners.

## Highest-priority engineering outcome

**A user gives Xroga one authorized natural-language request.** The engine discovers the user's outcome and context; loads current live browser evidence; selects among effective browser, connected-app and skill capabilities; executes with safe automatic progress; verifies the actual requested result; avoids repeated failed actions and unnecessary model calls; resumes interrupted work; and returns an accurate final report. It must operate on a previously unseen web app even when no named skill exists. Skills accelerate high-value repeatable work; they cannot form a website allowlist. No product can truthfully guarantee perfect success on every possible website, but failures must be bounded, attributable, safe and actionable.

## What 'integrate this repository' means — binding acceptance contract

Every repo feature Claude elects to use MUST have all the following in one reviewable commit or PR set:

| Gate | Minimum evidence |
|---|---|
| 1. Upstream identity | Canonical URL, source SHA/tag, license and dependencies, exact source file/function(s) actually read |
| 2. Xroga gap | Reproduced missing capability or suboptimal performance on existing app/task, with before result |
| 3. Architectural fit | Existing Xroga module owning the feature, data/permission flow, no second browser orchestration/control plane |
| 4. Implemented adapter | Compiling code changes; typed input/output; model-discoverable tool or policy; no hidden handoff to unrelated process |
| 5. Actual availability | Real Zurelay DeepSeek request can discover/select/call the capability, and its result reaches the agent |
| 6. Postcondition | Independent verifier checks page/account/file outcome rather than the model merely saying success |
| 7. Security | License/provenance, owner scopes, prompt-injection boundary, file/path safety, no surprise unapproved external writes |
| 8. Test proof | Unit, Chrome integration, real model on at least two unrelated interfaces, rejection/error tests, p50/p95 where sample size permits |
| 9. Recovery/rollback | Failure is typed, no duplicate effects, versioned reversible implementation, updated source-to-Xroga integration ledger |

**Status labels:** `CANDIDATE`, `SOURCE_STUDIED`, `ALREADY_COVERED`, `PORTED_UNIT`, `CHROME_VERIFIED`, `LIVE_DEEPSEEK_VERIFIED`, `APP_ACCOUNT_VERIFIED`, `BLOCKED`, `REJECTED`. Report the highest actually achieved, never inflate.

## Fast read-only source acquisition protocol (use the donor code, not just GitHub READMEs)

1. Read `docs/xroga/oss-capability-ledger.json` with pinned SHAs. Verify repo URL and license in source. Compare feature class and Xroga's current handlers first.
2. Clone relevant upstream repositories into a **separate temporary investigation folder**, pinned to the ledger SHA; never overwrite or blend them into `apps/xroga-browser-extension` just because they are cloned. Clone the top-priority compatible candidates first. Add the rest only when inspection reveals a concrete gap. All 72 are considered, but **the target is full useful functionality, not a clone count**.
3. Run source searches such as `rg -n 'page_act|postcondition|element_state|value_equals|list_count_delta|read_page|wait|trigger|upload|registerTool|load_skill|session|lease|fingerprint|recovery|receipt|saveWorkflow|skill' upstream/src upstream/packages upstream/extension`; open the actual implementation and tests. Follow imports until you understand the effect boundary. If available, run donor's unit tests in isolation.
4. Compare the exact upstream function with the nearest Xroga handler. Use an **adapter/cherry-pick** when appropriate; reject redundant or less reliable code with evidence. Do not silently copy entire unknown packages, npm postinstall hooks, GitHub actions, generated assets, host-specific scripts, third-party telemetry or cloud keys.
5. For each adopted source, include its license/NOTICE and an `UPSTREAM-SOURCE-MAP` entry with SHA, file/function, changed Xroga path, test and measured benefit. Do not mark read-only inspection as integration.
6. Never use `--depth 1` as a substitute for a required pinned commit that is absent in the shallow history. Fetch only the necessary commit or tag. Validate fetched code before running untrusted install scripts. Never use a personal token in a terminal command or copy credentials into the repo.

### Example minimal shell discovery workflow (adjust exact directories to repository reality)

```bash
# From the Xroga checkout; safe *read-only* exploration, no production deployment.
mkdir -p .scratch/browser-donors
# Example donor; use pinned SHA from docs/xroga/oss-capability-ledger.json,
# not an unreviewed floating latest branch.
git clone --filter=blob:none https://github.com/uiuing/browser-agent.git .scratch/browser-donors/browser-agent
(cd .scratch/browser-donors/browser-agent && git fetch origin <PINNED_SHA> && git checkout --detach <PINNED_SHA>)
rg -n 'page_act|value_equals|list_count_delta|element_state|recovery' .scratch/browser-donors/browser-agent/packages/extension/src
# Inspect the actual source, dependencies, tests and licensing, then port selected logic.
# Delete the scratch folder only after evidence is captured and no active process needs it.
```

No command above is an instruction to run downloaded code blindly. If no source checkout is possible, record the access blocker and continue engineering unrelated verified capabilities.


## Priority source inspections — concrete functionality and Xroga implementation contract

The following are the **first wave**, not a new hardcoded source allowlist. These module paths are confirmed by the supplied docs and public source layouts where noted; **Claude must re-check actual file/function implementations at the pinned SHA** and report when paths changed. Implement the strongest reusable features from this list before adding more metadata-only rows.

### 01. [Nanobrowser](https://github.com/nanobrowser/nanobrowser) — Chrome debugger control, deterministic layer, stale refs, event receipts, tab/frame ownership

- **Upstream capability (documented or source-located):** Chrome debugger control, deterministic layer, stale refs, event receipts, tab/frame ownership.
- **Source to inspect:** Upstream repository itself; inspect action and frame modules in actual pinned tree.
- **Actual integration task:** Compare pinned upstream source and Xroga fork; cherry-pick concrete missing fixes, not full framework.
- **Required Xroga callable behavior:** Xroga layer must execute DOM, keyboard, tabs, file inputs, iframe interactions with typed receipts and no hidden substitute.
- **Independent acceptance:** NB-001: 12 randomized DOM/stale-ref/iframe forms with independent state assertions.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 02. [OpenSidekick](https://github.com/esterhuizen/opensidekick) — Accessible element map

- **Upstream capability (documented or source-located):** Accessible element map; click/type/select/scroll/hover/double/right click/drag/shortcuts; multi-tab; workflow record/replay; opt-in network/console.
- **Source to inspect:** `src/content/content-script.js`, repo feature directory `src/background/` (locate exact file on pinned SHA).
- **Actual integration task:** Study `src/content/content-script.js` and the background browser tools referenced by README; diff against Xroga tools. Port missing input and hover/drag semantics, not an alternative agent loop.
- **Required Xroga callable behavior:** Expose complete typed interaction tool family; record/replay must be sanitized and rerender-tolerant.
- **Independent acceptance:** BROWSE-002: hover-open menu, right-click context menu, drag across transformed frame, redirect, valid postconditions.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 03. [Full Self Browsing](https://github.com/fullselfbrowsing/FSB) — Browser tool registry, DOM snapshots, reactive trigger watchers, smart waiting, site guides, real-file upload path

- **Upstream capability (documented or source-located):** Browser tool registry, DOM snapshots, reactive trigger watchers, smart waiting, site guides, real-file upload path; data/risk checks.
- **Source to inspect:** `extension/background.js`, `extension/ai/`, `extension/README.md`.
- **Actual integration task:** Inspect `extension/background.js`, `extension/ai/`, content action modules and tests. Port event-driven waits, missing typed browser actions, and safe file/DOM capability discovery.
- **Required Xroga callable behavior:** One Xroga tool registry with explicit effect receipts, no parallel MCP daemon; watches obey tab ownership and no unsafe page polling.
- **Independent acceptance:** BROWSE-003: event arrives after lazy render, no fixed sleep; file upload bytes match, watcher stops on cancellation.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 04. [Browser Agent](https://github.com/uiuing/browser-agent) — Semantic page perception

- **Upstream capability (documented or source-located):** Semantic page perception; `page_act`; role/name/structural re-grounding; checks `value_equals`, `url_matches`, `list_count_delta`, `element_state`; trace and batch skill replay.
- **Source to inspect:** `packages/extension/src/engine/page/`, `tools/`, `trace/`.
- **Actual integration task:** Inspect `packages/extension/src/engine/page/`, `tools/`, `trace/`. Port verifiable postconditions and typed failure reasons into the current layer/Outcome Contract.
- **Required Xroga callable behavior:** A write is COMPLETED only when the user-requested state is observed; uncertain effects must not auto-repeat.
- **Independent acceptance:** VERIFY-004: CRM create/rename row; toast without record is failure, correct record counts as verified, 2nd dispatch refused.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 05. [Alibaba Page Agent](https://github.com/alibaba/page-agent) — DOM-first page controller independent of LLM

- **Upstream capability (documented or source-located):** DOM-first page controller independent of LLM; browser state simplification; grounded element observation; useful conventional app-form automation.
- **Source to inspect:** `packages/page-controller/`, `packages/core/src/PageAgentCore.ts`.
- **Actual integration task:** Inspect `packages/page-controller/` and `packages/core/src/PageAgentCore.ts`, compare output token size and click accuracy to Xroga accessibility snapshot.
- **Required Xroga callable behavior:** Use robust DOM/a11y observation as default for normal SaaS, not screenshot-every-click; remain within Xroga deterministic chrome.debugger invariants.
- **Independent acceptance:** DOM-005: randomized CRM, select, hidden input, React rerender, non-English accessible names.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 06. [WebGenie](https://github.com/derpx06/webgenie) — Planner/navigator/validator separation as a reference

- **Upstream capability (documented or source-located):** Planner/navigator/validator separation as a reference; checkpoints, DOM navigation, validation and recovery semantics.
- **Source to inspect:** `src/background/agent/`.
- **Actual integration task:** Inspect `src/background/agent/` source and tests; adapt checkpoint/progress/revalidation into canonical run, not a new orchestrator.
- **Required Xroga callable behavior:** Persist last verified deliverable and only resume unfinished steps across service-worker death.
- **Independent acceptance:** RESUME-006: kill worker between two verified records; resume once with zero duplicate writes.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 07. [BrowserSkill](https://github.com/Tencent/BrowserSkill) — Human-first tab lending, authority boundary on native effect, cross-frame input observation and agent/person reconciliation

- **Upstream capability (documented or source-located):** Human-first tab lending, authority boundary on native effect, cross-frame input observation and agent/person reconciliation.
- **Source to inspect:** `docs/architecture.md` and tab-control modules in pinned repo (find implementation by `ControlAuthority`).
- **Actual integration task:** Compare source modules to Xroga `core/human-guard.ts`, `host/cdp-session.ts`, `probe/source.ts`; preserve user control even mid-action.
- **Required Xroga callable behavior:** A person touching an owned tab revokes/delays agent write immediately; independent tabs not blocked.
- **Independent acceptance:** HUM-007: type inside iframe during agent action, no mistaken attribution; user take-over no duplicate click.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 08. [Alibaba QZ Browser Agent](https://github.com/alibaba/qz-browser-agent) — Global/site/resident skills

- **Upstream capability (documented or source-located):** Global/site/resident skills; `load_skill`; extensible capability SDK; task/tab aliases; concurrent research lanes; skill resource handling.
- **Source to inspect:** `src/capabilities/README.md`, `skills/qz-browser-agent/SKILL.md`.
- **Actual integration task:** Study `src/capabilities/README.md`, `skills/qz-browser-agent/SKILL.md`, and skill match/activation implementations. Add bounded site skill index + typed capability catalog and retrieval on demand.
- **Required Xroga callable behavior:** Unknown websites work without skills; known site has optional local skill; cross-site scope never leaks.
- **Independent acceptance:** SKILL-008: visit unknown then recognized site; discover relevant skill in one call; no irrelevant skill injected.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 09. [Browsing Skills](https://github.com/browsing-skills/browsing-skills) — Website-scoped `SKILL.md` action indexes, references with input schemas, structured outputs, maintained action contracts

- **Upstream capability (documented or source-located):** Website-scoped `SKILL.md` action indexes, references with input schemas, structured outputs, maintained action contracts.
- **Source to inspect:** `SKILL.md`, `skills/<domain>/SKILL.md`, `skills/<domain>/references/*.md`.
- **Actual integration task:** Port only reviewed declarative action definitions into existing Xroga site action registry. Their README permits JS/eval inside pages: DO NOT execute downloaded/untrusted scripts.
- **Required Xroga callable behavior:** Validate origin, pinned digest, preconditions, postcondition, repeat-write safety and scoped data egress.
- **Independent acceptance:** SKILL-009: action works on reviewed version, refuses changed version before dispatch; unknown site falls back to general tools.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 10. [Vercel Skills](https://github.com/vercel-labs/skills) — Source resolver, SKILL.md discovery, find/use/add/check/update/remove CLI, lock/provenance and bounded archives

- **Upstream capability (documented or source-located):** Source resolver, SKILL.md discovery, find/use/add/check/update/remove CLI, lock/provenance and bounded archives.
- **Source to inspect:** `src/blob.ts`, `src/cli.ts`, `docs/commands.md`, `src/resolve.ts` if present.
- **Actual integration task:** Inspect `src/blob.ts`, `src/resolve.ts` (verify naming on pinned source), command handlers. Port resolver and metadata logic to backend, no Node CLI requirement for end users.
- **Required Xroga callable behavior:** Search task/domain skill index, verify source/digest/license, fetch only chosen instructions and permitted resources.
- **Independent acceptance:** SKILL-010: find via synonym, cache, pin source; malicious SKILL.md cannot override system/tenant permissions.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 11. [Agent Skills](https://github.com/agentskills/agentskills) — Standard SKILL.md frontmatter

- **Upstream capability (documented or source-located):** Standard SKILL.md frontmatter; progressive disclosure; skill directory and resource conventions.
- **Source to inspect:** `docs/home.mdx`, `docs/client-implementation/adding-skills-support.mdx`.
- **Actual integration task:** Validate parser and registries against upstream spec; only metadata in general prompt, full body only when task matching.
- **Required Xroga callable behavior:** No unlimited skill prompt dump; no skill has implicit power to execute code or grant privileges.
- **Independent acceptance:** SKILL-011: 1000 indexed skills, only selected one loaded; unknown request still runs generic browser.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 12. [Browser Agent Recorder](https://github.com/VelvetAbyss/browser-agent-recorder) — Local click/input/dialog/navigation capture with screenshots, SOP and machine-readable agent skill export

- **Upstream capability (documented or source-located):** Local click/input/dialog/navigation capture with screenshots, SOP and machine-readable agent skill export; learning notes.
- **Source to inspect:** `src/content/recorder.ts` and exported trace/skill contract.
- **Actual integration task:** Inspect `src/content/recorder.ts`; implement opt-in capture->scrub->parameterize->multi-layout test->certify into Xroga Experience Engine.
- **Required Xroga callable behavior:** Never copy private values into shared workflows. Replay uses new semantic refs and checks, never fixed recorded coordinates.
- **Independent acceptance:** MEM-012: demonstrate 3-step form once; replay on shuffled DOM with new values, no personal leakage.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 13. [OpenBrowser](https://github.com/dylansantwani/openbrowser) — Action batching, low model-turn page dispatch

- **Upstream capability (documented or source-located):** Action batching, low model-turn page dispatch; Xroga has initial `batch-plan.ts` port.
- **Source to inspect:** Source code for batch/step scheduling at pinned SHA (identify exact modules).
- **Actual integration task:** Audit donor against Xroga `agent/batch-plan.ts` and `loop.ts#runBatchTool`; extend checks only for proven missing capability.
- **Required Xroga callable behavior:** Safe known-step batch with checkpoints between state-changing dependencies; no blind chained writes.
- **Independent acceptance:** BATCH-013: 8 controls in 1 model turn, same verified final state as single steps.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 14. [Midscene](https://github.com/web-infra-dev/midscene) — Visual locators, screenshot-based grounding, action/expectation workflow patterns

- **Upstream capability (documented or source-located):** Visual locators, screenshot-based grounding, action/expectation workflow patterns.
- **Source to inspect:** Review current implementation under `packages/`/`src/` before code port.
- **Actual integration task:** Benchmark target localization and region/zoom ideas against Xroga marks and canvas controls, using independent rendered layouts.
- **Required Xroga callable behavior:** Use visual coordinates only when semantics unavailable; reject low confidence or unstable hitboxes.
- **Independent acceptance:** VIS-014: responsive, zoomed, RTL, moving panels, semantically blank canvas across 20 seeds.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 15. [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) — Debuggability and protocol-level tracing, network and performance analysis

- **Upstream capability (documented or source-located):** Debuggability and protocol-level tracing, network and performance analysis.
- **Source to inspect:** Source repo and protocol-oriented trace examples.
- **Actual integration task:** Use as developer-side tracing reference; instrument Xroga own Chrome debugger phases, do not add a second runtime.
- **Required Xroga callable behavior:** Every run including timeout emits phase breakdown and last verified action.
- **Independent acceptance:** PERF-015: failed run phase timings available, independent of run finalization.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 16. [MCP Servers](https://github.com/modelcontextprotocol/servers) — Tool schema contracts, server discovery, parameter typing, transport conventions

- **Upstream capability (documented or source-located):** Tool schema contracts, server discovery, parameter typing, transport conventions.
- **Source to inspect:** MCP reference servers and modelcontextprotocol schema docs.
- **Actual integration task:** Use existing backend supported MCP/Composio integration; implement tool-discovery schemas, scopes, idempotent calls and receipts, not extension-side arbitrary network access.
- **Required Xroga callable behavior:** Model can use authorized app tool or generic browser without a compulsory prebuilt website script.
- **Independent acceptance:** MCP-016: connected mock CRM read/write with scoped authorization; unauthorized tool hidden and refused.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.

### 17. [Workflow Use](https://github.com/browser-use/workflow-use) — Reusable recorded workflows and RPA-like replay with parameterization

- **Upstream capability (documented or source-located):** Reusable recorded workflows and RPA-like replay with parameterization.
- **Source to inspect:** Repository workflow generator and executor (locate exact paths).
- **Actual integration task:** Inspect source plus legal compatibility; adapt safe procedure compilation concept into verified Experience Engine rather than fixed site map.
- **Required Xroga callable behavior:** Replay validates each step and recovers to generic browser when current app differs.
- **Independent acceptance:** MEM-017: same business task across varying DOM structures with different data; no coordinate dependence.
- **Don't do:** clone the donor and claim these features exist in Xroga; do not ship its full orchestrator or bypass user permissions. If the current Xroga code already meets the test, report `ALREADY_COVERED` and move to the next highest-value missing capability.


## Xroga executable architecture — the model uses capabilities instead of reading about them

### One canonical pipeline

```text
USER OUTCOME + CURRENT CONVERSATION
  -> classify data sensitivity / account authority (not a website allowlist)
  -> goal decomposition only when needed; outcome contracts & verification gates
  -> live authorized Chrome tab observations (DOM/a11y, page text, screenshot, network only where permitted)
  -> scoped capability discovery from the actual engine, apps, and optional skills
  -> DeepSeek V4.1 Flash 1017 decides a reliable authorized approach
  -> tool call dispatched through one typed permission/lease/ledger boundary
  -> deterministic Chrome/browser action OR scoped backend API worker
  -> action receipt (DISPATCHED / REACTED / VERIFIED / UNCERTAIN / BLOCKED)
  -> compact model feedback with actual changed evidence, not entire repeated page
  -> update milestones / change approach if no progress
  -> save verified end-result and report; resume partial work when necessary
```

**Do not insert site-name `if/else` branches** for every application. A CRM, Google Ads-like console, e-commerce site, spreadsheet, video editor and unknown admin UI must share the exact same generic grounding, action, permission, progress and outcome machinery. Domain skills may inform semantics or offer reviewed shortcut tools, but must never be required for basic navigation and form/editing workflows.

### Core interfaces to implement / align with the existing actual TypeScript types

The names below are an **illustrative target contract**, not a demand to create duplicate APIs if Xroga already has equivalent classes.

```ts
interface BrowserCapability {
  id: string;                       // e.g. browser.dom.set, browser.canvas.drag, connected.crm.update
  class: 'observe' | 'navigate' | 'interact' | 'file' | 'connected' | 'skill' | 'worker';
  supportedContext: string[];       // grounded frame/page/connector requirements
  effect: 'READ' | 'WRITE' | 'SENSITIVE';
  inputSchema: unknown;             // validated at the server/tool boundary
  requiredAuthority: string[];     // never generated by the model
  estimatedLatencyClass?: 'fast' | 'medium' | 'slow';
  proofKind: 'dom' | 'visual' | 'app' | 'file' | 'external_receipt';
  sourceAndVersion: {kind: 'native' | 'ported' | 'connected'; ref: string};
}
interface ObservedBrowserTarget {
  tabId: number; frameId?: string; documentEpoch: string;
  groundedRef?: string; role?: string; name?: string;
  screenBox?: {x:number;y:number;width:number;height:number;dpr:number};
  evidenceOrigin: 'DOM' | 'A11Y' | 'PIXELS' | 'VERIFIED_APP_ACTION';
  observedAt: string;
}
interface ActionReceipt {
  taskRunId: string; capabilityId: string;
  intentFingerprint: string; idempotencyKey?: string;
  status: 'not_dispatched' | 'dispatched' | 'observed_changed' | 'verified' | 'uncertain' | 'refused';
  expectedPostcondition?: unknown; actualPostcondition?: unknown;
  failureKind?: 'stale_ref' | 'wrong_target' | 'occluded' | 'not_ready' |
                'permission_denied' | 'network' | 'provider' | 'human_takeover' | 'unknown';
  latencyMs: number; evidencePointer?: string; // never include secrets by default
}
```

**Capability discovery needs two tiers:** a small always-on index of names, kinds, risk levels, inputs and known availability; and a second `discover_tools`/`load_capability`/`find_skill` mechanism that returns detail only when relevant. This prevents enormous system prompts and allows the model to access a *broader* capability space with **lower latency**. Do not hard-gate the correct tools based on English regex phrases. If a read-only classifier is uncertain, allow the model to discover interaction tools immediately. Tests must include implicit actions in English, Urdu, Arabic, Hindi and paraphrases, with no unexpected denial.

### Execution policy: high autonomy without unsafe unconditional authority

- User already authorized navigation, reading, form drafting and normal non-consequential operations? Act automatically and return actual results. Don't repeatedly ask how to click a field or where the menu is.
- Account connected with scoped write authority? Apply permitted changes and verify; respect site-specific Ask/Auto user settings and explicit permission contract.
- Spending user money, publishing ads, sending messages, payment, destructive deletion, credential input, access grants, external account connections, CAPTCHAs/MFA? Follow the actual per-action security/consent rules. **Founder permission to develop the product is not blanket consent on future customer accounts.**
- Prompt text, webpage contents and retrieved skills are untrusted task data. They cannot grant permissions, change browser ownership, override system rules or execute remote scripts.

### Tool-selection change: why current heuristics are underperforming

**Audit/replace the behavior (not necessarily every existing file) of:**

- `src/agent/tool-selection.ts`: it currently applies word regexes to decide whether actions are available. Compare an **all-appropriate-tools** control and dynamic discovery; measure extra tool tokens versus missed capabilities and extra enable-actions turns. Use structured task intent only as an optimization, not a restrictive gate.
- `src/agent/strategy-selector.ts`: page element counts and fixed relative costs are a cheap signal, but not the best path. Let the model receive the real tool affordances, task intent, verified site context, past failures and actual latency estimates. Choose based on observable effects: DOM form => batched typed inputs; visual canvas => grounded GUI; app-native command => only if documented and visible; connected API => only if authorized and materially better.
- `src/agent/progress-tracker.ts`: the strategy ladder recycles without proving novelty. Add **intent/target/outcome fingerprints**, forbidden retry of uncertain writes, failure-class-specific repair, distinct alternative validation, a meaningful attempt budget and truthful blocked conclusion. Stalled tasks must not silently click 16 almost-identical points.
- `src/agent/prompt.ts`: replace invented dropdown geometry and general “use console” assumptions with evidence-based instructions. Tiny generic system prompts are better than 72 repeated donor descriptions. Let the LLM choose operations.
- `src/agent/subagents.ts`: its current `delegate` is parallel read-only scraping, not full executing subagents. Keep efficient reader delegation, add actual executing worker type only through canonical scheduler/worker registry, with per-tab leases, task budget, scope, isolated memory and final merge. Compare with sequential and avoid parallel overhead on small jobs.

**Measure before/after on the same unseen holdouts.** A model can be powerful while the harness obscures needed observations/tools, overconstrains choices or burns unnecessary turns. Do not solve by “unlimited retries,” longer task caps, blindly maxing reasoning on every turn, or stuffing all available skills into context.

### Layer behavior / action targeting

1. **Structured pages:** Prefer accessibility/DOM refs with current document/frame epoch, correct form interaction semantics, and a confirmable postcondition.
2. **Unstructured visual pages:** Use screenshot/crop/mark *with actual pixel geometry and transforms*, optional local CV assistance, and re-observe every meaningful state change; never hallucinate control coordinates or assume dropdown alignment.
3. **Menus and overlays:** Detect placement by observation, manage hover/focus/menu state, viewport edges, RTL, zoom, sticky headers, offscreen panels and rerender; verify the menu *actually opened* before selecting a child.
4. **Files:** Preserve verified download bytes+digest, MIME, filename and size across app tasks with tenant-bound storage and scoped upload. The XFER-1 existing 2/2 fixture needs cross-origin, cancellation, stale artifact, quota and privacy negatives.
5. **Page unload and Chrome worker suspension:** Durable checkpoint the *last verified postcondition*, not just the last model message; resume from live current site state and never blindly replay sensitive uncertain writes.
6. **Human takes tab:** A human's input always outranks agent action. Protect frames/iframes, tab focus and transferred ownership. Use authoritative native-dispatch correlation instead of loose time windows.
7. **Connected app/API:** Prefer official API when it is actually connected and safer than the UI; preserve provenance, approved scopes, typed errors and idempotency. Never assume a Google Ads/Meta/Shopify API is operational without real account proof.

### Whole-product path and outcome coverage

Avoid treating browser automation as only “clicking.” Users may ask Xroga to research, compare, create a SaaS record, edit a spreadsheet, draft an ad campaign, inspect a dashboard, transfer a PDF, create a document, update an inventory record, schedule a meeting, manipulate a visual editor, configure a development tool or coordinate multiple unrelated websites. The core should handle the generic operations across *all* these categories. A task that needs an external connected app, the Xroga backend filesystem or artifact worker should use that authorized worker and bring the result back to the one chat.

### Experience Engine: verified skills without required per-site training

After repeated successful generalized executions, optionally derive sanitized procedures from receipts. Extract **parameter slots** and **postconditions**, run several randomized site/layout/data variations in disposable sessions, verify source and rights, then register as a scoped skill. Unverified learned recipes remain task-local. No customer-identifying values or credentials enter shared procedures. A completely new site always falls back to the general tools immediately. Do not attempt to author 10,000 mandatory website procedures.


## Universal acceptance suite — prove generalization across unfamiliar websites, not memorized demos

The previous comprehensive engineering file contains **88 scenario seeds**: `XROGA_BROWSER_OPERATOR_88_GENERALIZATION_FIXTURE_SEEDS_2026-11-21.json`. Use them where available, but create real runnable fixtures from their specifications and grade **independent state**, not generated prose. The following **12 categories x 3 variants** are the high-value holdout suite for this donor-integration mission. Hide the fourth variant/seed until after changes are implemented.

| Category | Three required variants (randomize layout, language, loading and node identities) | Independent pass condition |
|---|---|---|
| 1. Public research | Compare three vendor pages; follow search results; extract dated specs | Correct URLs, source-backed data, no duplicate reads, complete answer |
| 2. SaaS form & navigation | Create/edit record; nested form iframe; relabeled form fields | Exact target record/values persisted once |
| 3. CRM | Create contact; update existing with duplicate labels; multi-record bulk edit | Correct IDs, row counts, no unauthorized duplicates |
| 4. Ads operations | Navigate mock campaign dashboard; update **draft** budget; read campaign metrics | Exact draft fields saved, no live spend |
| 5. E-commerce | Add/edit a product; inventory count; discount draft | Correct product state, no accidental publish |
| 6. Database/cloud | Read table; edit disposable row; navigate multi-step console | Correct record and evidence, no privileged production writes |
| 7. Spreadsheet / office | Sort/filter; formula input; export and import | Correct values and file bytes/hash |
| 8. Email/calendar | Compose draft; schedule draft slot; find attachment | Draft exists, no unauthorized send/invite |
| 9. Coding/admin tool | Change code setting in disposable project; run web-based test; inspect error | Exact source/setting/output, traceable result |
| 10. Tab/file/handoff | Transfer file across two apps; delegate independent reads; person takeover | SHA-256 equality, lease safety, correct merge |
| 11. Graphics/media | One timeline fixture; one plain canvas; one real visual editor (**TraceDraw max one run as a holdout**) | Accurate object/state edit with bounded attempts |
| 12. Novel interface | Generated unknown controls; RTL/zoom/iframes; lazy loading/occluded targets | Complete task despite changed appearance and no skill |

**Adversarial axes** in every category: viewport/DPR/zoom, late rendering, random field order, localization, server errors, blocked network, stale element identity, user simultaneously editing another tab, service-worker death, ambiguous labels, misleading success toast, prompt injection, partial API responses. **Never reward raw click count or the agent saying 'done'.**

### Benchmark protocol

- Keep the model, site fixture, task definition, authentication, request budgets and build pinned. Compare baseline vs donor-backed implementation; run repeated randomized seeds with a held-out half. Record precise **attempt count**, actual independent success/failure, false success, p50/p95 wall-clock time, provider p50/p95, actions, screenshots, turns, tool payload bytes, token usage, billed cost and repaired failures.
- Log per-phase latency **even on timeout/cancellation**: browser snapshot, image encode, tab focus, extension bridge, backend queue, model request/response, tool dispatch, page reaction wait, evidence capture, agent UI and persistence. TraceDraw's roughly 14s/turn reportedly includes about 5.4s backend model latency and other unexplained time; investigate this generically across multiple apps.
- Benchmark six categories that are *not* graphics before spending further effort on TraceDraw. Spend at most a small fraction of the test budget on that app, then keep its failure as one tracked regression item.
- Run with no site skills first; then test one optional known-site skill or a completed donor port. **A universal improvement must transfer to unseen categories and not merely improve a trained benchmark.**
- After a failure, emit a typed diagnostic and last verified milestone, not repeated action cycles or a misleading success.
- Audit prompt injection, credential redaction, human tab interference, unauthorized external sends, repeated write safety, cross-user isolation, download file path validation and safe remote skill handling.

### Acceptance thresholds (targets, not fictitious current results)

1. At least 36 holdout variants executed with real Chromium and the real model on at least 8 unrelated task categories, with all outcomes logged including failures. A smaller validated sample is better than fake coverage; disclose actual denominator.
2. **No repeated no-effect action** after a verified stall without new evidence or a genuinely different method; no second write on an uncertain first receipt.
3. Rerendered forms and simple browser reads should use a small number of model turns; avoid a 30s request becoming 18 min. Define practical baselines before claiming speed improvement.
4. At least 6 high-value donor implementations compared with current Xroga; integrate the highest-value nonredundant subset and show end-to-end DeepSeek invocation proof. Do not artificially require all six to be adopted if they duplicate working features; report explicit `ALREADY_COVERED`/`REJECTED` evidence.
5. Typed postconditions and scoped tab/worker ownership must be enforceable in code, not just prompts.
6. Signed-in owner Chrome, actual Google Ads/Meta/Shopify, provider-specific production flags and independent security gates remain separately labeled until available. No production promotion on an unverified candidate.


## Execution order — implement continuously, not only write more plans

The following is a recommended priority sequence for the next focused engineering period, **not a claim everything can be completed in five hours**:

1. **Baseline and working tree:** Re-read latest PR/head, handovers, ledger and current model routing. Identify actual current test failures and costs in two ordinary (non-canvas) Chrome tasks, then reproduce one site-agnostic failure in a test. Capture code/trace before editing.
2. **Capability donor sprint:** In parallel read source of OpenSidekick, FSB, Browser Agent, Alibaba Page Agent, WebGenie and QZ. Map each to an existing Xroga module; select top two or three high-impact missing *implemented* primitives. Source checkout and code study should lead to code changes **in the same session**, not another 72-row spreadsheet.
3. **Fix the model-to-tool harness:** Ensure dynamic tool index and capability invocation, accurate grounded page evidence, no hardcoded dropdown position assumptions, no English-only action-tool hiding, and progress-ledger recovery.
4. **Ship independent postcondition receipts** for common DOM forms, app records and uploads. If replay/verification logic already exists, extend coverage rather than rebuild.
5. **Measure true subagent path:** Record that current `delegate` is read-only. Add scoped execution through canonical backend worker if supportable this session, or implement independent work prerequisites (leases, per-worker ledger and cancellation) plus a real test. Never claim full execution concurrency from read-only fetching.
6. **Generalization tests:** Validate a minimum meaningful sample in unrelated categories, including at least one completely unknown site without a skill, one multi-tab transfer, one human takeover and one login-gated disposable app. Add negative tests for each port. Break/fix the worst shared failure class.
7. **Performance:** Profile a successful and a failed task with per-phase metrics. Remove avoidable model turns/screenshots/waits; report before/after with sample size.
8. **Final deliverables:** Commit reviewable changes to current dedicated Browser Operator branch. Run typecheck, lint, unit suite, real Chromium, real DeepSeek, staging product chain where approved. Build source-matched ZIP, hash and upgrade/rollback evidence *only after* the tests; give owner concise accurate statuses.

**Do not promise background or unattended work if the executor cannot actually continue while the laptop sleeps**; arrange authorized continuous foreground execution only if available. The previous benchmark paused during machine sleep. Never equate a long timeout to permission to loop forever.

### Required donor result table in the handover

| Repo + pinned SHA + source file | Measured missing Xroga feature | Changed Xroga source + callable tool | Unit/Chrome/live DeepSeek | Improvement measured | Limits / release gate |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

For each of the 72 rows: source identity, license, classification, repo features, actual disposition and explicit status. For the chosen donors: **demonstrate exact code** and task outcomes. Do not mark unused/no-license/irrelevant code as integrated just because it was cloned. Never claim guaranteed success on every website.

### Exact prompt to execute, not reinterpret

> Claude, the owner's selected repositories are not a reading assignment. They are a code library of browser agent capabilities. I authorize focused, safe source cloning and compatible code reuse. Fix the universal Xroga execution engine using actual source implementations: robust DOM and GUI control, real postcondition verification, fast action batching, human tab ownership, task recovery, dynamic skill/tool discovery, cross-app files, and scoped parallel workers. Make the features callable to our existing Zurelay DeepSeek model, run real Chromium tests across unrelated unknown sites, and show verified improvements. No TraceDraw-centric hardcoding. No competing orchestrator. No false claim of '100%' from metadata and passing unit tests. Keep working through the highest-value code changes and give evidence of what truly works.


## Appendix A — COMPLETE 72-repository linked donor implementation register

This covers all 72 URLs in the earlier source handoff in **one place**. The "potential source feature" and "target check" columns are **proposals until pinned source and tests verify the implementation**; a capability appearing in a README or in this appendix is not automatically callable in Xroga. The baseline status comes from Xroga's `oss-capability-ledger.json` generated 2026-11-20. Prioritize the implementation cards above, while re-checking every candidate for unique functionality and license.

| # | Donor and direct GitHub link | Candidate feature to extract / investigate | Specific Xroga adaptation or acceptance question | Ledger baseline |
|---:|---|---|---|---|
| 1 | [Nanobrowser](https://github.com/nanobrowser/nanobrowser) | CDP action dispatch, frame sessions, stable refs, navigation, UX and current upstream patches | What reliable upstream improvements are missing in the derived engine? Does it reduce exact action failures/latency? | ALREADY PRESENT |
| 2 | [agent-browser](https://github.com/vercel-labs/agent-browser) | Compact accessibility snapshots, deterministic targeting, code-first control, wait conditions | Are Xroga's snapshots and targeting already as good? Compare measurable failures | ALREADY PRESENT |
| 3 | [OpenBrowser](https://github.com/dylansantwani/openbrowser) | Batch planning/verification, tool efficiency, interaction dispatch | Adapt only proven missing batch/verification behavior | ADAPTED IN CODE |
| 4 | [BrowserSkill](https://github.com/Tencent/BrowserSkill) | Borrowed tabs, human takeover, collaboration/session ownership | What tab lease/handoff mechanism is missing? How safely avoid collisions? | SOURCE REVIEWED |
| 5 | [browser-harness](https://github.com/browser-use/browser-harness) | Deterministic browser tasks and evaluation patterns | Expand fixtures for changeable web apps rather than hardcode site skills | INSPECTED |
| 6 | [Alibaba Page Agent](https://github.com/alibaba/page-agent) | DOM extraction, interactable control semantics, page-state representation | Compare element maps and token overhead with current DOM/a11y layer | BEHAVIOR-COMPARED |
| 7 | [WebGenie](https://github.com/derpx06/webgenie) | Checkpoint/replan, route memory, agent recovery | Borrow useful checkpoint semantics without another planner/scheduler | INSPECTED |
| 8 | [OpenBrowse](https://github.com/openbrowse-ai/openbrowse) | Local context, task memory, browser agent workflow | Use only component-level improvements, no competing orchestrator | INSPECTED |
| 9 | [Stagehand](https://github.com/browserbase/stagehand) | Grounded actions, extraction, observation, agent reliability | Benchmark concepts; do not introduce hidden cloud browser costs | INSPECTED |
| 10 | [Browser Use](https://github.com/browser-use/browser-use) | Agent loop, context/state, model-browser interaction, browser benchmarks | Study methodology and transferable verified execution patterns | INSPECTED |
| 11 | [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Browser protocol semantics, debugging, trace/error instrumentation | Offline development reference; don't replace extension-native CDP path | INSPECTED |
| 12 | [Playwright MCP](https://github.com/microsoft/playwright-mcp) | A11y/DOM actions, tool designs, browser eval harness | Test fixtures, not an unapproved separate browser service | INSPECTED |
| 13 | [Playwright](https://github.com/microsoft/playwright) | Real Chromium test automation, tracing, screenshots | Build high-quality deterministic generalization tests | ALREADY PRESENT |
| 14 | [OpenBUA](https://github.com/AliSharjeell/OpenBUA) | Computer-use ideas, uncertain source rights | Reference only until license verified; no unauthorized code copy | INSPECTED |
| 15 | [Browse](https://github.com/anomalyco/browse) | Browser/task control concepts, compact tool interfaces | Compare task cost and reliability only after actual source study | ALREADY PRESENT |
| 16 | [Browser Agent](https://github.com/uiuing/browser-agent) | Postcondition verification, structured errors, healing, workflow reuse | Continue integrating only verified diagnosis and replay mechanisms | INTEGRATED/UNIT |
| 17 | [agent-webbridge](https://github.com/jeet-dhandha/agent-webbridge) | Browser/web integration, local bridge concepts | Determine if it fills a real approved interop gap | INSPECTED |
| 18 | [PinchTab](https://github.com/pinchtab/pinchtab) | Fast browser interaction/control | Measure speed and rights; no parallel executor without need | INSPECTED |
| 19 | [open-browser-agent](https://github.com/motailab/open-browser-agent) | Agent/browser implementation patterns | Reference/applicability from code, not README | INSPECTED |
| 20 | [Midscene](https://github.com/web-infra-dev/midscene) | Screenshot-grounded GUI interactions and verification | Compare coordinate precision on unfamiliar canvas, DPR/zoom, no new mandatory model | INSPECTED |
| 21 | [OmniParser](https://github.com/microsoft/OmniParser) | Visual control/element parsing | Check model weights, license, GPU/runtime cost; candidate optional helper | INSPECTED |
| 22 | [UI-TARS](https://github.com/bytedance/UI-TARS) | GUI grounding and computer-use methods | Research/eval source; don't silently add another inference model | INSPECTED |
| 23 | [UI-TARS desktop](https://github.com/bytedance/UI-TARS-desktop) | GUI+desktop interaction patterns | Archived/rights/runtime checks; Chrome scope remains limited | INSPECTED |
| 24 | [A9T9 RPA](https://github.com/A9T9/RPA) | Automation recorder / fallback concepts | Copyleft restrictions review; no unauthorized proprietary copying | INSPECTED |
| 25 | [Fabric.js](https://github.com/fabricjs/fabric.js) | Canvas geometry and transformation test helpers | Useful for controlled fixtures; not a dependency required by every site | INSPECTED |
| 26 | [Konva](https://github.com/konvajs/konva) | Canvas objects, interactions, drag/zoom fixtures | Build generated test pages with varied transforms | INSPECTED |
| 27 | [TraceDraw](https://github.com/tracedraw/tracedraw) | Paint/canvas/script editor and export regression target | One fixture class; not the center of the product architecture | LIVE DEEPSEEK VERIFIED |
| 28 | [Agent Skills](https://github.com/agentskills/agentskills) | Standard SKILL.md/progressive metadata | Existing parser/catalog correctness and on-demand selection | INTEGRATED/UNIT |
| 29 | [Anthropic Skills](https://github.com/anthropics/skills) | Task-specific procedural examples | Import only compatible appropriately licensed instructions on demand | INSPECTED |
| 30 | [MCP Servers](https://github.com/modelcontextprotocol/servers) | Standard tool contracts and transport | Custom MCP connection, schemas, scopes and error handling | INSPECTED |
| 31 | [Shopify Agent Skills](https://github.com/Shopify/agent-skills) | Current Shopify platform/API development methods | Relevant official guidance with actual browser/API execution | INSPECTED |
| 32 | [Shopify AI Toolkit](https://github.com/Shopify/Shopify-AI-Toolkit) | Shopify workflows/tool patterns | Validate actual API permissions and supported operation types | INSPECTED |
| 33 | [Google Ads API Assistant](https://github.com/googleads/google-ads-api-developer-assistant) | Google Ads API understanding | Specialized route for connected permitted Ads tasks | INSPECTED |
| 34 | [Google Ads Python](https://github.com/googleads/google-ads-python) | Official API client/runtime | Isolated worker if needed; no secret exposure in model logs | INSPECTED |
| 35 | [Meta Business SDK](https://github.com/facebook/facebook-python-business-sdk) | Meta Ads/account data and actions | Authorized account/grant and verified campaign receipts | INSPECTED |
| 36 | [Readability](https://github.com/mozilla/readability) | Main article extraction | Long-page quality/token compression, source fidelity | INSPECTED |
| 37 | [Crawlee](https://github.com/apify/crawlee) | Permitted crawling/extraction | Evaluate source rights and worker separation; no stealth scraping | INSPECTED |
| 38 | [MarkItDown](https://github.com/microsoft/markitdown) | Convert common documents into useful text | Existing artifact worker import + source integrity | INSPECTED |
| 39 | [Docling](https://github.com/docling-project/docling) | Document structure/table parsing | Compare parser accuracy and memory/cost | INSPECTED |
| 40 | [BrowserGym](https://github.com/ServiceNow/BrowserGym) | Browser benchmark suites | Use methodology for transfer tasks and error labels | INSPECTED |
| 41 | [AgentLab](https://github.com/ServiceNow/AgentLab) | Agent evaluation methodology | Measured completion, trajectory/turn analysis, failure taxonomy | INSPECTED |
| 42 | [Cutline](https://github.com/Aepzie/cutline) | Video timeline/editor interaction reference | Browser fixture or app-native edit if rights permit | INSPECTED |
| 43 | [OpenReel](https://github.com/heychintan/openreel) | Video/editor workflow reference | Browser editing fixtures, verify license and runtime | INSPECTED |
| 44 | [OpenFilm](https://github.com/openfilm/openfilm) | Media editing workflows | Test as isolated editor or reference if appropriate | INSPECTED |
| 45 | [Opencut](https://github.com/opencutvideo/Opencut) | Video editor candidate | License previously unclear; do not copy without rights | INSPECTED |
| 46 | [Panoptik](https://github.com/Panoptik-Studio/Panoptik) | Media/composition components | Conditional asset/media worker, version/license audit | INSPECTED |
| 47 | [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | Motion graphics/composition | Optional authorized artifact-worker pathway | INSPECTED |
| 48 | [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | In-browser media transforms | Only where resource/runtime constraints justify it | INSPECTED |
| 49 | [Mediabunny](https://github.com/Vanilagy/mediabunny) | Browser media processing | Optional worker for supported media operations | INSPECTED |
| 50 | [Editly](https://github.com/mifi/editly) | Programmatic video editing | Isolated worker and license/dependency check | INSPECTED |
| 51 | [Sharp](https://github.com/lovell/sharp) | Image processing | Authorized file/image artifact workers | INSPECTED |
| 52 | [VTracer](https://github.com/visioncortex/vtracer) | Raster-to-vector transformation | Optional media conversion, not Chrome action replacement | INSPECTED |
| 53 | [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | Upscaling | Separate compute/GPU/cost/rights requirement | INSPECTED |
| 54 | [Manim](https://github.com/ManimCommunity/manim) | Animated mathematical visuals | Optional backend artifact worker, never mandatory browser dependency | INSPECTED |
| 55 | [OpenOutreach](https://github.com/eracle/OpenOutreach) | Research/outreach workflow ideas | No autonomous unsolicited messaging without user permission | INSPECTED |
| 56 | [Google Maps Scraper Kit](https://github.com/Mahanaicoach/google-maps-scraper-kit) | Local business discovery approach | Source permissions/terms; verify real prospect data and no invented buying intent | INSPECTED |
| 57 | [JobSpy](https://github.com/speedyapply/JobSpy) | Job-data extraction | Current source rights, actual live job status | INSPECTED |
| 58 | [Workflow Use](https://github.com/browser-use/workflow-use) | Reusable verified browser workflows | Adapt safe parameterized procedures without brittle scripts | INSPECTED |
| 59 | [Alibaba QZ Browser Agent](https://github.com/alibaba/qz-browser-agent) | Global/site/resident skills, \`load_skill\`, tab contexts, concurrent lanes | Strict origin match, load only relevant scoped skill, no skill-mandatory execution | CODE INTEGRATED |
| 60 | [Browsing Skills](https://github.com/browsing-skills/browsing-skills) | Site-specific action contracts, preconditions, input/output | Reviewed **declarative** VerifiedSiteAction; no untrusted downloaded JS eval | CODE INTEGRATED |
| 61 | [SkillsHub](https://github.com/ComeOnOliver/skillshub) | Natural-language skill search and retrieval | Optional discovery only; recorded HTTP 402; no blocked native flow | BLOCKED |
| 62 | [Vercel Skills](https://github.com/vercel-labs/skills) | Find/use/install/version Agent Skills | Reuse metadata/on-demand resolution, no required end-user CLI | INSPECTED |
| 63 | [Browse Plugin](https://github.com/browserbase/browse-plugin) | Browser-site task catalog/CLI manifest | Understand plugin is not full runtime; use skill-method ideas selectively | INSPECTED |
| 64 | [ScottSyms Browser-Agent](https://github.com/ScottSyms/Browser-Agent) | Learn Mode and site-scoped playbooks | Reference concepts only until permissive license/permission verified | INSPECTED |
| 65 | [Cloudflare Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) | \`/.well-known/agent-skills/index.json\`, SHA-256-digested index | Optional same-origin, version/digest checked resolver, not assumed universal standard | CODE INTEGRATED |
| 66 | [OpenSidekick](https://github.com/esterhuizen/opensidekick) | Broad mouse/keyboard/tab/recording tools | Compare real UI primitives; avoid unapproved third-party page egress | SOURCE REVIEWED |
| 67 | [Full Self Browsing](https://github.com/fullselfbrowsing/FSB) | Broad tool catalog, waits, memory, app capability references | Prefer useful actions, reject arbitrary force-stop design | SOURCE REVIEWED |
| 68 | [Agentic Awesome Skills](https://github.com/sickn33/agentic-awesome-skills) | Large professional skill index | Select individual safe skills; do not inject thousands into context | INSPECTED |
| 69 | [Marketing Skills](https://github.com/coreyhaines31/marketingskills) | SEO/CRO/ads/copy procedures | Advice only until real app tools actually execute and verify | INSPECTED |
| 70 | [Amazon Seller Toolkit](https://github.com/amzn/selling-partner-agentic-toolkit) | Seller analytics/listing/inventory tooling | Needs real seller authorization and supported API scopes | INSPECTED |
| 71 | [Remotion Skills](https://github.com/remotion-dev/skills) | Video motion/caption/render guidance | Use with compatible media worker/editor when relevant | INSPECTED |
| 72 | [Browser Agent Recorder](https://github.com/VelvetAbyss/browser-agent-recorder) | Record browser demonstrations as skills | Parameterize/sanitize/validate before Experience Engine promotion | INSPECTED |


## Appendix B — Additional direct source and architecture links (public research, checked 21 November 2026)

- [OpenSidekick source tree](https://github.com/esterhuizen/opensidekick) — repo README locates `src/content/content-script.js` and browser tool definitions; verify current implementation.
- [FSB extension README](https://github.com/fullselfbrowsing/FSB/blob/main/extension/README.md) — `extension/background.js`, `extension/ai/`, canonical tools; inspect handlers and risk boundaries.
- [Browser Agent page execution architecture](https://github.com/uiuing/browser-agent) — `packages/extension/src/engine/page/` and verified `page_act` checks.
- [Alibaba Page Agent developer guide](https://github.com/alibaba/page-agent/blob/main/docs/developer-guide.md) — `packages/page-controller/` and core/controller split.
- [QZ capability SDK](https://github.com/alibaba/qz-browser-agent/blob/main/src/capabilities/README.md) and [QZ skill contract](https://github.com/alibaba/qz-browser-agent/blob/main/skills/qz-browser-agent/SKILL.md) — site scope, load on demand, runtime responsibilities.
- [Browsing Skills action format](https://github.com/browsing-skills/browsing-skills) — `SKILL.md`, per-site references, verified action schemas; note README's page-eval code is not Xroga-safe to execute unreviewed.
- [Vercel Skills resolver documentation](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) and [blob discovery code](https://github.com/vercel-labs/skills/blob/main/src/blob.ts) — skill find/use and source locks.
- [Agent Skills client implementation](https://github.com/agentskills/agentskills/blob/main/docs/client-implementation/adding-skills-support.mdx) — progressive disclosure; no per-turn skill dump.
- [WebGenie agent implementation guide](https://github.com/derpx06/webgenie) — source tree `src/background/agent/` for checkpoint/validation ideas.
- [BrowserSkill architecture](https://github.com/Tencent/BrowserSkill/blob/main/docs/architecture.md) — human-first authority and tab lending.
- [Browser Agent Recorder](https://github.com/VelvetAbyss/browser-agent-recorder) — `src/content/recorder.ts` and workflow-learning artifacts.

**Public research is for verifying what donors describe and which source files appear available; it is NOT equivalent to independently running all their code.** Use pinned source and local tests as the ultimate integration evidence.

## Appendix C — How to deliver evidence files

Save within the existing Browser Operator evidence folder, adjusting file naming for current date and commits:

```text
docs/xroga/evidence/browser-operator-20261110/
  SOURCE-PORT-INVENTORY-20261121.md          # 72 candidates with explicit statuses
  SOURCE-TO-XROGA-IMPLEMENTATION-20261121.json # code provenance and adapter contract
  UNIVERSAL-HOLDOUT-RESULTS-20261121.jsonl   # all successes AND failures, no cherry-picking
  LATENCY-PHASES-20261121.jsonl              # successful and timed-out runs
  RELEASE-HANDOVER-20261121-vNEXT.md         # code source, final ZIP SHA, rollback, blockers
```

Use existing filenames when they already exist instead of creating competing ledgers. Sensitive evidence stays private and redacted. Release must still pass separate security and production authorization gates.