# Open-source browser agents: what was read, what was taken, what was not

Date: 2026-11-12. Scope: Xroga Browser Operator (`apps/xroga-browser-extension`). Nothing in this document is a performance claim for Xroga;
every upstream figure below is the upstream author's own and was not reproduced here.

## 1. Provenance and licences (checked, not assumed)

The request named six projects by short name. Four resolved unambiguously and were cloned shallowly (`--depth 1`) into separate folders
outside the repository. Nothing from them was run or installed. Two names are ambiguous and are NOT cloned (section 6).

| Name in the request | Repository | Commit read | Licence file | Decision on code reuse |
| --- | --- | --- | --- | --- |
| OpenBUA | AliSharjeell/OpenBUA | 98d68ba | none; the README says "MIT" but no LICENSE file ships | study only; ideas re-implemented from scratch |
| anomalyco/browse | anomalyco/browse | 3fa9866 | MIT, "Copyright (c) 2025 opencode" | adaptation allowed with the notice; used for ideas, attributed |
| Agent WebBridge | jeet-dhandha/agent-webbridge | a14cd1d | MIT | adaptation allowed with the notice; nothing copied |
| PinchTab | pinchtab/pinchtab | a626620 | MIT | study only: a Go service, a different runtime |
| OpenBrowser | not identified (several repositories share the name) | - | - | needs the exact URL |
| browser-agent | not identified | - | - | needs the exact URL |

The GitHub licence field for OpenBUA is empty. Until its author adds a LICENSE file, treat the code as all-rights-reserved: ideas only.

## 2. What each project actually contains (from its source and README)

- **OpenBUA** (Chrome extension, side panel). `start_parallel_tasks` opens up to 3 worker windows, each with its own chat, model loop and start
  URL; `parallel_task_status` lets the parent wait up to 15 s for a change. A background coordinator keeps a job table: state
  (starting, running, completed, failed, cancelled), an owner window, at most 3 active per owner, the whole batch validated before any window is
  created, results truncated to 16 KB, sensitive snapshots deleted when a job ends, closed windows turn jobs into failed or cancelled, parent
  cancel propagates to children, and workers cannot spawn workers. Also: form agents and recovery, document editing, social-platform skills.
- **anomalyco/browse** (extension + local relay + MCP). Named sessions with their own tabs; agents work in background tabs they opened or were
  lent; allowed-origin lists per session; a bot-challenge classifier (wait, person, block) for Cloudflare, Akamai, DataDome, PerimeterX,
  Imperva, AWS WAF, reCAPTCHA, hCaptcha; HAR capture, video recording with an optional ghost cursor, a flight recorder; site secrets typed
  without the agent seeing them; handoff cards; idle-tab cleanup; redaction of password, code and card fields in snapshots.
- **Agent WebBridge** (extension + Node daemon + MCP). `chrome.debugger` per tab, so N tabs of one profile run concurrently; one daemon per
  profile, so concurrency is profiles x tabs; 15 tools; Node and Python SDKs; community recipes for logged-in sites. The upstream five-tab demo
  (3.5 s parallel vs 9.3 s sequential) is one hardware-specific run.
- **PinchTab** (Go binary, HTTP API). Multiple isolated Chrome instances and profiles, headed or headless, accessibility-first element refs,
  text extraction (upstream: about 800 tokens per page), a dashboard, container isolation, distributed use. A separate service, not an extension.

## 3. What the Xroga extension already has (verified in this repository)

Compact accessibility snapshots with stable refs; diff observation after actions (`observe: diff`); targeted `read` and `find`; per-tab locks and
background tabs; session-owned tabs only; sensitive-field masking; postconditions (`expect`) checked after actions; risk-classified tools with the
Chrome approval card for consequential actions; hand-over and take-over; a visible agent pointer; several tool calls in one model reply; parallel
page reads (`delegate`, this branch); research-first reading before the first model turn (this branch); connected-app tools with approvals;
domain playbooks; durable run segments with resume (this branch).

## 4. Capability matrix and decisions

| Capability (source) | Xroga today | Decision |
| --- | --- | --- |
| Bot-challenge classification and what to do (browse) | none: a blocked page was retried or read as content | TAKEN: `src/agent/challenge.ts`, wired into every page-reading result and the parallel readers; 12 tests |
| Parallel page reads in separate tabs (WebBridge, OpenBrowser idea) | `delegate` readers, search-follow | already done (earlier this session) |
| Compact snapshots, diffs, targeted reads (OpenBrowser, PinchTab) | present | no gap found |
| Post-action verification (browser-agent idea) | `expect` postconditions | no gap found |
| Parent agent with up to 3 worker agents, own windows (OpenBUA) | none | DESIGNED, not built: needs approval (section 5) |
| Job table, cancel propagation, no worker spawning, batch validation (OpenBUA) | n/a | required parts of the design in section 5 |
| Reusable verified workflows / macros / conditional batches (OpenBrowser, browser-agent) | playbooks only | blocked: the two repositories are not identified |
| HAR, video, flight recorder (browse) | screenshots only | NOT built: large, and it records pages, which needs its own privacy review |
| Site secrets typed without the model seeing them (browse) | credentials never go to the model | NOT built: needs a design with the credential-egress review |
| Multiple Chrome profiles (WebBridge) | one profile (the extension's own) | NOT feasible inside a single extension |
| Isolated browser instances (PinchTab) | n/a | NOT needed; out of scope for an extension |
| Idle agent-tab cleanup (browse) | helper tabs closed after use; run tabs closed with the run | no gap found |

## 5. Design to approve: worker runs (OpenBUA pattern) on the existing coordinator

Why not "subagents sharing one run": every model request of a Xroga run is accounted by the server turn by turn, in order, against the run's own turn
counter. Concurrent model calls inside one run collide with that accounting (this was built first and broke a real run). OpenBUA does not have this
constraint; Xroga does.

Proposal (no new scheduler, no new service): a worker is an ordinary canonical run.
1. The parent calls `start_parallel_tasks({ tasks: [{ instruction, url }] })`, 1 to 3 tasks. The extension creates one conversation and one canonical
   run per task through the existing `/runs` route. The existing limit of 4 active runs per account is exactly one parent plus three workers.
2. Each worker has its own turn counter, its own spend reservations against the same owner ledger, its own window and tab ownership, and its own
   history. Spend is therefore bounded by the owner's entitlement exactly as today.
3. Workers get the parent's permission mode, cannot call `start_parallel_tasks`, and every consequential action raises its own approval card in
   its own window. Approvals never transfer between runs.
4. The parent gets `parallel_task_status({ waitSeconds <= 15 })`: states and a compact result per worker (truncated), never the transcripts.
5. Parent stop or cancel cancels the children; a closed worker window fails only that worker; the parent decides whether it still needs it.
6. Terminal workers drop their snapshots. Results are observations, not instructions (same untrusted-content boundary as page text).
7. Tests: a fake-layer unit suite for the job table; a real-Chrome scenario with three fixture pages; a staging run with three real worker runs.

Risks to review before building: three windows asking for approvals at once; the shared Chrome profile (same cookies and logins in every
worker); extra cost per task (three loops instead of one); whether the active-run limit is acceptable for users who already run two tasks.
This touches INV-02 (no second orchestrator): the argument is that it reuses the one coordinator, once per worker. An exception RFC may still be
required by the owner of that rule.

## 6. Open points

- OpenBrowser and browser-agent: several repositories use these names and a search did not settle which are meant. Send the two URLs and they
  will be read the same way.
- OpenBUA: no LICENSE file. Ask its author to add one before any code is taken.
- Upstream numbers (token savings, parallel speedups) are not Xroga measurements.
