# Open-source browser agents: source-level audit, what was taken, what was not

Date: 2026-11-12. Scope: Xroga Browser Operator (`apps/xroga-browser-extension`). Every upstream figure below is the upstream author's own and
was not reproduced here. Status words: VERIFIED (tested, evidence in the repository or the PR), PARTIAL, BLOCKED, NOT IMPLEMENTED, UNSAFE.

## 1. Sources (shallow clones outside the repository; nothing from them was run or installed)

| # | Repository | Commit | Licence file | Reuse decision |
| --- | --- | --- | --- | --- |
| 1 | AliSharjeell/OpenBUA | 98d68ba | none (README says "MIT"; no LICENSE file ships) | ideas only; nothing copied |
| 2 | dylansantwani/openbrowser | 1f67080 | MIT, "Copyright (c) 2026 OpenBrowser contributors" | adaptation allowed with the notice; the batch planner is ported (attributed) |
| 3 | anomalyco/browse | 3fa9866 | MIT, "Copyright (c) 2025 opencode" | adaptation allowed with the notice; ideas used, attributed |
| 4 | jeet-dhandha/agent-webbridge | a14cd1d | MIT | nothing copied |
| 5 | uiuing/browser-agent | a8517e2 | MIT | ideas; nothing copied yet |
| 6 | pinchtab/pinchtab | a626620 | MIT | study only (a separate Go service) |

Note: the OpenBrowser repository ships an `openbrowser-1.0.0.zip`; it was not unpacked. Dependencies of any adapted code were not imported: the
OpenBrowser planner is dependency-free and was ported to TypeScript by hand.

## 2. What each repository contains (read from its source layout, README and key modules)

1. **OpenBUA** (Chrome extension). Parent agent with up to 3 worker windows (`parallel-tasks.ts`, `window-coordinator.ts`): a job table with owner,
   states, whole-batch validation, results truncated to 16 KB, sensitive snapshots dropped at the end, window-closed handling, cancel propagation,
   workers cannot spawn workers. Also: per-site form agents and recovery, document editors, a social-posting skill set, page-trust checks, memory and
   vault, and `captcha-auto.ts`, which sends challenge screenshots to a vision model and clicks the answer (UNSAFE, see section 4).
2. **OpenBrowser** (extension + hub/MCP). 15 composable tools grouped by action enums; trusted input through the debugger; compact accessibility
   snapshots with refs that carry their frame; `mode: diff`; region `outline` mode; actions return their own delta; `expect` on actions; `batch.js`
   (a pure planner: `when` / `unless` / `repeat{until, while, max}` / groups, ceilings on repeats, nesting and total calls); `macros.js` (saved and
   replayed sequences); background jobs; GIF recorder; frames and open shadow roots; refs re-resolve through a stored selector after a re-render;
   obscured-target detection; CAPTCHA detected and not bypassed; a mutation queue; federation of hubs on other machines.
3. **anomalyco/browse** (extension + relay + MCP). Named sessions with their own tabs, agents use only tabs they opened or were lent, per-session
   allowed origins, bot-challenge classification (wait / person / block), HAR capture, video and flight recorder, site secrets typed without the
   agent seeing them, handoff cards, idle-tab cleanup, redaction of password, code and card fields.
4. **Agent WebBridge** (extension + Node daemon + MCP). `chrome.debugger` per tab; one daemon per Chrome profile and a router, so concurrency is
   profiles x tabs; 15 tools; SDKs; community recipes. Multi-profile needs a local daemon per profile.
5. **browser-agent** (MV3 extension, pnpm monorepo: `engine/page`, `engine/orchestrator`, `engine/batch`, `guardrails`, `trace`, `tools`, `llm`). The
   `page_act` pipeline: perception, grounding by semantic fingerprints (survives re-renders), execution through DOM and CDP channels, verification
   by post-conditions (`value_equals`, `element_exists`, `text_present`, `url_matches`, `list_count_delta`, `element_state`), bounded failure
   strategies chosen by failure reason, structured trace. Typed tools with risk tiers `read / act / dangerous`; skills extracted from verified runs;
   batch execution of a skill over table rows (rows independent, verified independently, failed rows retried, a delivery report).
6. **PinchTab** (Go binary, HTTP API). `internal/` includes instance and profile orchestration, headed and headless, accessibility-first refs,
   text and snapshot extraction, `contentguard`, `idpi` (injection defence), `navguard` and `netguard`, a scheduler, a dashboard, and also
   `autosolver`, `stealth` and `cfchallenge` (challenge solving and fingerprint evasion).

## 3. What the Xroga extension already has (checked in this repository)

Compact accessibility snapshots with refs; diff observation; scoped and windowed reads; targeted `read` and `find`; per-tab locks and background
tabs; session-owned tabs only; sensitive-field masking; `expect` postconditions (`url`, `text`, `textGone`, `value`, `checked`, `gone`); frames and
shadow roots in perception; obscured-target checks; risk-classified tools with the Chrome approval card; hand-over and take-over; a visible agent
pointer; several tool calls in one reply with stop-on-change; parallel page reads (`delegate`); research-first reading; segments and resume;
connected apps with approvals; domain playbooks; parallel worker runs; bot-challenge handling.

## 4. Capability inventory and status

| Capability | Source | Xroga today | Status / action |
| --- | --- | --- | --- |
| Parent with up to 3 worker agents, own windows | OpenBUA | `start_parallel_tasks` / `parallel_task_status`: each worker is its own canonical run, own window, own counter; job table persists; stop cascades | VERIFIED (16 unit tests; real-Chrome check `parallel-workers`; not yet run with the real model on staging) |
| Workers cannot spawn; batch validated first; truncated results | OpenBUA | same | VERIFIED |
| Adaptive worker count (scheduler picks 1..N from task independence) | task text | the model chooses 1 to 3 from tool guidance; the server limits 4 active runs per account | PARTIAL: no measured scheduler; no 5-worker mode; benchmarks not run |
| Bot-challenge classification | browse | `challenge.ts`, wired to every page read and to parallel readers | VERIFIED (12 tests) |
| Parallel reads in background tabs, search then read top results | WebBridge / OpenBrowser idea | `delegate`, research-first | VERIFIED (20 tests; real Chrome S1/S2) |
| Batch with `when` / `unless` / `repeat`, groups, ceilings | OpenBrowser | planner ported (`batch-plan.ts`); NOT yet exposed as a tool | PARTIAL: planner VERIFIED (10 tests); integration into the run loop NOT IMPLEMENTED (design below) |
| Macros: save and replay verified sequences | OpenBrowser, browser-agent | none | NOT IMPLEMENTED |
| Skills from verified runs, batch over table rows with per-row verification | browser-agent | none (domain playbooks only) | NOT IMPLEMENTED |
| Post-conditions `list_count_delta`, `element_exists`, record-exists checks | browser-agent | `expect` has 6 kinds; none counts rows | NOT IMPLEMENTED |
| Bounded failure strategies by failure reason | browser-agent | loop guards (repeat, no effect, errors, read streak) | PARTIAL |
| Semantic fingerprints that survive re-render | browser-agent, OpenBrowser | refs re-resolve in our layer | already implemented; reliability across SPAs not measured |
| Compact snapshots, diff mode, actions return delta, `expect` on actions | OpenBrowser, PinchTab | present | already implemented |
| Region `outline` mode for dense pages | OpenBrowser | none (scope and window exist) | NOT IMPLEMENTED |
| Frames and open shadow roots; obscured-target detection | OpenBrowser, browser-agent | present | already implemented |
| `inspect` (console, network, cookies, storage), `zoom`, GIF | OpenBrowser | none | NOT IMPLEMENTED (cookies and storage reads need a privacy review) |
| Session ownership: only tabs the agent opened or was lent | browse | session-owned tabs | already implemented |
| Idle agent-tab cleanup | browse | helper tabs closed after use; run tabs closed with the run | already implemented |
| HAR capture, video recording, flight recorder | browse | none | NOT IMPLEMENTED (records page content: needs its own privacy review) |
| Site secrets typed without the model seeing them | browse | credentials never go to the model | NOT IMPLEMENTED (needs a design with the credential review) |
| Multiple Chrome profiles | WebBridge | one profile | BLOCKED: needs a local daemon per profile; not a default requirement |
| Isolated browser instances, headless, container isolation | PinchTab | none | not applicable to an extension; BLOCKED unless a verified need appears |
| Typed tools with risk tiers; site policies | browser-agent | present and stricter (approval cards, write policy) | already implemented |
| Page-trust and injection defences | OpenBUA, PinchTab | untrusted-content boundary on every page read | already implemented |
| Vision-model CAPTCHA solving | OpenBUA | refused | UNSAFE: not taken; a person must answer a challenge |
| Fingerprint evasion, stealth, challenge auto-solvers | PinchTab | refused | UNSAFE: not taken |
| Hub federation / running browsers on other machines | OpenBrowser, browse | none | BLOCKED: needs a relay; not a default requirement |
| Local MCP servers and hubs | OpenBrowser, browse, WebBridge | none | not applicable: no daemons by default |

## 5. Design for the next integration: a `batch` tool on the existing loop

The planner is pure and tested. The integration into `AgentLoop` has two constraints that must be respected, and was not rushed:
1. Each step must go through the loop's normal execution path (`#executeCall`: gate, journal intent on disk before dispatch, layer call,
   `afterToolCall` for hand-over, dialogs, verification debt and guards), because a write that crashes mid-batch must still be fenced on recovery.
2. The model protocol allows only one result per tool call, so the batch is ONE tool call with ONE result (the trail plus the last step's text);
   the steps are visible as activity rows but are not separate tool-result messages.
Conditions are answered through the layer's `wait` with a 1 ms limit (so the answer is instant), steps may not name `batch`, `delegate`,
`start_parallel_tasks`, `ask_user` or `done`, a consequential step still raises the Chrome approval card for its own action, and a step that changes
the page so that a later target no longer exists stops the batch, as a reply of several calls already does.

## 6. Parallel workers: what exists and what does not

Exists (VERIFIED in real Chrome with a scripted model, not yet with the real model): the design in section 5 of the previous version of this document, now
built: workers are runs of their own with their own counters and reservations against the owner ledger, at most 3 active per parent, cancel cascades,
a closed window fails only its worker, results are compact, workers have neither worker-starting tools nor connected-app tools.

Does not exist: a scheduler that measures whether 2, 3 or 5 workers finish a workload faster; benchmark numbers; a UI panel for workers beyond their
own conversations; per-worker screenshots in the parent; parent-side conflict resolution (the parent model compares results).

## 7. Open points

- OpenBUA: no LICENSE file. Ask its author to add one before any code is taken.
- Upstream numbers (token savings, parallel speedups) are not Xroga measurements. Nothing in this document claims a speedup for Xroga.
