# Xroga Browser Operator: gap assessment and evidence (night of 2026-11-12)

Branch `claude/ops-plugin-actions-20261111` (PR #965, stacked on #960, which is stacked on #942). Staging only: nothing here was released to production
except the Zurelay key reference and the faster request gate, recorded in section 6. Status words: VERIFIED (tested, evidence named), PARTIAL, FAILED,
NOT IMPLEMENTED, BLOCKED. A number from a single run is a single run, not an average.

## 1. Assessment by area

| Area | Status | Evidence and limits |
| --- | --- | --- |
| Single-agent browser execution | VERIFIED on public sites | Real Chrome: the full fixture scenario suite (282 of 282) and run-level checks pass. Real DeepSeek through staging: 18 real tasks (simple read, form fill without submitting, three sites, three-page reads, workers, a task graph); 13 ended `done`, one was recorded `failed` and one `interrupted` before a bug was fixed (a correct answer with no layer receipt counted as no work), and three were read at the short result-sync moment (shown as `interrupted`; the check was fixed). I read the end of each answer: the ones I checked against the pages were correct; I did not audit every answer line by line. NOT shown: signed-in business applications. |
| Advanced interactions | PARTIAL | Present and tested at fixture level: navigation, tabs, snapshot, find, read, scroll, click, hover, type, key chords, fill_form, select/check, dialogs, drag between referenced elements, upload of attached files, waits, postconditions, frames and open shadow roots. NOT IMPLEMENTED: downloads (no tool, so an exported file cannot be confirmed), pixel/canvas clicks (the agent is deliberately not given coordinates or selectors), native desktop applications (BLOCKED: the extension controls Chrome only). |
| Multi-agent execution | VERIFIED (scripted model in real Chrome; real model on public pages) | `delegate` (parallel page readers, search-then-read), `start_parallel_tasks` workers (each its own run, window and server turn counter; up to 4 assigned tasks per parent, 3 at a time), a dependency graph (`after`, results handed over), exclusive `resource` names, `batch` (when/unless/repeat). Real-Chrome checks: parallel-workers, parallel-graph, batch-tool. PARTIAL: which structure to use is chosen by the model from the playbooks, not by a measured scheduler. NOT IMPLEMENTED: a 5-worker mode (the account allows 4 active runs). |
| Parallel tab ownership | PARTIAL | Each worker has its own window and its own session-owned tabs; tasks that name the same resource never run together (unit-tested). NOT tested in real Chrome: two runs attacking the same tab, or a user tab being touched. |
| DeepSeek integration | VERIFIED on staging | Model `deepseek_v4_1_flash_1017` through the staging gateway with the active Zurelay key; per-turn server timing, tokens and settled cost read from the staging logs (section 3). |
| Connected-app actions | PARTIAL | The approved Sheets read/write path was failing because the provider refused an account field; fixed and exercised against staging at API level. NOT verified: a real approved write on the owner account by the owner. Gmail overlay work is #970 (Codex). |
| Recovery and resumption | PARTIAL | Run segments: a backend test drives one run past 450 turns and renews time; a real 60-turn DeepSeek run crossed the old 48-turn limit through a segment renewal. restart-restore passes in real Chrome. Worker table persists across an extension worker restart (unit-tested). NOT tested with the real model: service-worker suspension, Chrome crash, tool loss. |
| Planning and expertise | PARTIAL | 19 playbooks chosen from the request (including design editors, video editors, business records, work-split, Google and Meta Ads, SEO), selection VERIFIED by tests. Real execution of Meta Ads, Google Ads, a design editor or a video editor is NOT VERIFIED: no accounts. |
| Performance | VERIFIED where measured | Section 3. CPU and RAM with workers and the worker scheduler: section 3a (fixture model). Snapshot diffs are exact (unit-tested) and, on a synthetic 300-line outline with a dialog opened and one line changed, the diff text is under 10% of the full outline (a size relationship, not a figure for any real site; not measured on live pages). |
| Security | PARTIAL | Route-level tenant ownership, device authentication and turn fencing are tested in the backend. Workers get no connected-app tools and no worker-starting tools; each run needs its own approvals. NOT tested: two real accounts at once. The egress review of the Composio network call needs a human (CI job disposable-policy-database). |
| Production readiness | NOT READY | Section 6. |

## 2. What was built in this program (all on the branch above)

Bot-challenge recognition; parallel page readers; research-first reading; run segments with no total turn or time ceiling (the owner ledger is the spend
limit); parallel worker runs; the dependency graph and exclusive resources; the batch tool; domain playbooks; evidence counting for agent tools and
pre-run steps (a correct answer had been recorded as failed); a real-model acceptance harness. Source-level audit of six open-source projects with
licence checks and a status per capability is in `OSS-BROWSER-AGENTS-ANALYSIS.md`.

## 3. Real measurements (staging, real DeepSeek, real Chrome, one developer laptop; same three public pages)

Model request time per turn: 2 to 6 seconds (one 11 s turn on a long answer). Before the request gate was changed it was about 21 seconds per turn.
The cause was a database gate that spaced model requests 21 seconds apart per API key, not the model (queue 18,444 ms against provider first byte
1,576 ms in a staging log line).

Same workload, read the main heading of example.com, iana.org and wikipedia.org, three runs each:

| Strategy | Seconds per run | Median | Model turns |
| --- | --- | --- | --- |
| One agent, one page after another | 30.1, 62.9, 20.0 | 30.1 | 5, 3, 3 |
| `delegate` (parallel readers) | 10.8, 11.5, 19.9 | 11.5 | 2, 2, 2 |
| Three parallel workers | 36.2, 26.4, 43.5 | 36.2 | 5, 4, 5 |

All nine runs ended `done`. For reading simple pages, the readers were fastest and the workers slowest: a worker is a whole run with its own model
turns, so it pays off only for subtasks heavy enough to repay that. n = 3 per row; this is not a benchmark of heavier work.
Cost settled per task: 30 to 1,300 micro-dollars ($0.00003 to $0.0013). Other single runs: a form fill (not submitted) 16.9 s in 2 turns; a task graph
(a and b, then c) 20.8 s; three documentation sites 62 s in 6 turns.

### 3a. Worker scheduler, CPU and memory (real Chrome, fixture model with a fixed 3 s per worker turn; check `parallel-bench`)

| Phase | Wall clock | Against one worker | Chrome process tree peak memory | CPU seconds in the phase |
| --- | --- | --- | --- | --- |
| 1 worker | 5.5 s | 1.00 | 1,099 MB | 4.9 over 5.9 s |
| 3 workers together | 5.4 s | 0.99 | 1,287 MB | 5.8 over 5.4 s |
| 4 workers (the fourth waits for a free slot; cap is 3) | 9.1 s | 1.65 | 1,341 MB | 6.8 over 9.3 s |

Three workers took as long as one (the same three one after another would take about 12.3 s), and a fourth waited for a slot as designed. Idle Chrome with
the extension before the first phase was about 470 MB. Each extra worker window added about 100 MB. Caveats: one run on one laptop; the model is a fixture
with fixed latency, so this measures the scheduler and the browser, not DeepSeek; the CPU figure includes the check's own panel polling (every 150 ms) and
page loads, so it is an upper bound for the scheduler itself. Five-worker runs were not measured because the cap is three.

### 3b. Download confirmation (real Chrome, check `confirm-download`)

A page started a download the way an Export button does. `confirm_download` read Chrome's download list and reported the name and size (35 bytes,
text/csv) matching the file; a download that never began was refused after the 1.5 s wait it was given, and no folder path appears in the line. Chrome makes no
download record for an empty blob, so an empty export reads as "no download began"; a download that finished with 0 bytes is covered by unit tests only.
Not tested: a very large file, an interrupted download, the permission being refused in the product build.

### 3c. Real DeepSeek on staging, with the new tools (throwaway staging account, since deleted; one run each)

| Task | Result | What the model did |
| --- | --- | --- |
| Open a URL that answers with a file attachment, say whether the download finished, its name and size | done, 25 s, 3 turns | `navigate`, `confirm_download`, `done`. Reported "xroga-test.txt, 126 bytes, text/plain" from the browser's download record, and explained the `net::ERR_ABORTED` that a navigation to a file produces. VERIFIED that the model uses `confirm_download`. |
| Add two items on a public TodoMVC page and confirm the list has exactly two | done, 33 s, 3 turns | `type`, `type`, `done`. Correct answer, but the model did NOT use `expect.count`; it checked the page's own "2 items left" counter. So `count`/`exists` remain unit-tested and real-Chrome-tested but NOT seen used by the real model. |

| Add three items on public TodoMVC and make sure the list has exactly three (second try to see `expect.count` used; Auto mode, Allow pressed by the harness) | done, 44.7 s, 7 turns | `enable_actions`, `snapshot`, `type` x3 (each "expect met"), `read`, `done`. Correct answer. The model again verified by reading the list, NOT with `expect.count`. Two real runs, two times not used: `count`/`exists` stay unit- and real-Chrome-tested only. |

Findings from getting there: the product refuses localhost pages by policy (correct), so real-model tasks need public pages; typing on a site that is "always ask"
waits for an Allow press (the harness pressed Allow twice, only for this task); runs left waiting on approval count against the active-run limit of 4
(`BROWSER_RUN_LIMIT`), which blocked one attempt until the four stale test rows of the throwaway account were marked failed.

### 3d. Connected-app write path, fixture harness (backend golden journeys, fake Composio origin, no real account)

28 journeys pass (3 new): a permit already used for a successful write is refused before any provider call, so a client that lost the response and retries
cannot write twice (execute count stays 1); a provider 5xx on the write is reported and attempted once; and only the multi-account refusal is answered with a
second call, any other 400 is reported after one attempt. Already covered before: tenant and cross-account denial, account changed or disconnected, forged
permit, provider failure/timeout/input_required/malformed never recorded as success, redacted audit rows, credential canaries stopped before egress.
NOT covered here: independent readback of the changed data (the agent's job; the business-records playbook requires it, and no real run has proven it), a real
disposable account, durable claim races (need an isolated database), and reconnect to a different account in the middle of a retry beyond the account-changed check.
Status: VERIFIED IN CONTROLLED ENVIRONMENT for the items above; the real Sheets write remains BLOCKED BY PERMISSION (needs one disposable Google account connected to the staging Xroga project).

### 3e. Route A: open and read without a model call (real Chrome, real staging backend)

`agent/direct-read.ts` answers a request that is only "open this site and read its heading or title" from the page itself. The matcher is narrow (one site,
one read verb, one target, nothing else: no click, search, comparison, condition or second site), and the answer is given only when the loaded page is on the
same site, no challenge or login stands in the way, and a heading really is on the page; otherwise the normal path runs unchanged. The answer names the page
title as well when it differs from the first heading, because "the heading" can mean either.

| Path | Runs | Wall clock (s) | Model turns | Result |
| --- | --- | --- | --- | --- |
| Route A, product build, real staging backend, iana.org | 3 | 2.3, 2.3, 2.9 | 0 | done, result settled on the server |
| Same page, request with one more clause so it goes to the model (real DeepSeek) | 3 | 9.6, 9.6, 19.8 | 1, 1, 3 | done |
| Route A in the autorun build, no server, iana.org and wikipedia.org | 6 | 2.8 to 4.1 | 0 | PASS |

Single runs, one machine, a different question on the model side (it also asks what the site is for), so this shows the size of the saving, not an exact ratio.
Findings that changed the code: (1) example.com's heading is not exposed as a heading by the layer, so Route A hands over and the model answers from the title; (2) the
`snapshot` outline does not list headings the way `read` does, so Route A reads with `read`; (3) the first heading element on iana.org ("Domain Names") is not what a
person calls the page heading (the banner/title), which is why the answer shows both; (4) the server refused a completed result with no model turn
(`BROWSER_RESULT_UNVERIFIED`), so the finish route now accepts `direct: true` only for the actions `navigate` and `read` with a short result (backend change in
`routes/localBrowser.ts`, asserted in `localBrowser.test.ts`: not marked direct, a non-read action, no actions, an over-long result and another account are all refused).
That backend change touches the file that is under the pending security review and needs the same human review; it cannot complete anything that changes state.
Staging image `direct1-1112` (commit 914fd69a2) carries the first version of the rule; the stricter server check (recorded goal must be a plain open-and-read, the answer must name the run's site, age under 5 minutes, no evidence yet) was then built as `direct2-1112` (commit 51b43b527) and verified the same way: three product-build runs (two headings, one title) all `done`, 0 model turns, 2.2 to 3.5 s, settled on the server. Not measured: a login-wall or challenge page in the product build (covered in unit tests only).

### 3f. Click latency and the visual pointer (real Chrome, product code path, fixture model that answers instantly)

Check `click-bench`: ten clicks in one model reply, and ten replies with one click each, with the visual pointer on and off, three runs each. The run recorder's phase
timings put essentially all the time in the browser action (`tool.layer`), not in the model turn, gating or persistence (model 20-30 ms per turn here).
Stage timing inside one click, measured by temporary instrumentation that was removed afterwards:

| Stage (visible tab, pointer off) | ms per click |
| --- | --- |
| resolve target | 5 |
| actionability (includes a fixed 50 ms stability gap) | 72 |
| confirmation gate | 2 |
| evidence begin | 10 |
| CDP dispatch (move, press, release, three guard checks) | 20 |
| **settle** (two quiet polls of 100 ms, then a volatility watch) | **about 640 before, about 437 after** |
| page state after the action | 16 |

Findings: (1) the dominant cost of an ordinary click is the post-click settle, almost all of it a fixed 400 ms "does the block keep changing by itself" wait that runs when
the only evidence is the block's own mutations; it is now 200 ms. The ticking-clock scenario (10 Hz) and scenario sets C and D still pass in real Chrome; a page that changes
more slowly than 5 Hz can now be attributed to the click, and that verdict is information for the model, not a gate. Ten clicks: 8.1-8.4 s before, 6.2-6.3 s after (median of three
runs each, one machine). (2) In a hidden tab the first mouse-move dispatch took 160-190 ms without the pointer and 620-860 ms with it (an early benchmark ran the page in a background
tab, which is not how a user sees it); in a visible tab the dispatch is 20-25 ms with the pointer on or off, so the pointer has no measurable cost there. The pointer hook is not awaited by the action.
Not changed: polling interval and the 100 ms quiet window (shortening them would make "no effect" a weaker claim and risks a repeated click), the pointer's own 240 ms movement.
Not measured: real DeepSeek action-to-action gaps (the model turn there is 2-6 s and dominates), CPU and RAM of the pointer, a screenshot-heavy task, task-to-task slot release.

### 3g. Hidden-tab pointer penalty, and what changed in the integrated build

Cause found by measurement: in a hidden tab each pointer update queued page script (two executeScript calls per click) ahead of the next input event, and the first mouse-move
dispatch grew from 160-190 ms to 620-860 ms. The pointer is now not drawn into a tab nobody can see (`visible` port in `PageBorder`, newest command wins, drawn on `tabs.onActivated`);
the existing `page-border` check was updated to the new rule (held back while hidden, shown on activation, still absent from screenshots, still follows Back and the Settings switch).
Ten clicks in a hidden tab, medians of three runs: pointer on 10.7 s and 10.9 s, off 10.8 s and 10.5 s (before: 16.9 and 15.6 against 10.4 and 10.7). A hidden tab is still slower than a visible one
(about 10.5 s against 6.2 s for ten clicks) because Chrome throttles it; that part is not Xroga's.

A request such as "add two rows ... and tell me when done" was classed read-only (the verb "add" was not in the action list), so the run started without click tools and spent a model turn on
`enable_actions`; common action verbs were added (unclear requests already keep every tool, so this only removes a wasted turn).

Integrated build (`claude/ops-integrated-20261112`: #965 head plus Codex #971): typecheck clean, 1,111 unit tests pass, 284 of 284 real-Chrome scenarios pass, and the `panel-shot` check captured the
live panel in real Chrome: "Black Hole is working" header with the animated mark, status "Clicking a page control", the activity row "Clicked button «Add a row»", and the Stop button.

### 3h. Real DeepSeek strategy benchmark (staging, product build, real Chrome, two runs each, page titles of public sites)

| Strategy | Sites read | Run 1 (s) | Run 2 (s) | Model turns | Browser RAM peak (MB) | Answers |
| --- | --- | --- | --- | --- | --- | --- |
| One agent, sites one after another | 4 | 74.9 | 73.5 | 4 | 1,277 / 1,704 | all four titles, correct |
| Parallel readers (`delegate`) | 4 | 16.7 | 13.5 | 2 | 1,673 / 1,671 | all four titles, correct |
| 2 workers (one site each) | 2 | 24.4 | 26.3 | 4 | 1,584 / 1,495 | both titles |
| 3 workers (one site each) | 3 | 35.3 | 26.3 | 4-5 | 1,468 / 1,560 | all three titles |
| 4 assigned tasks (3 run, 1 waits) | 4 | 29.6 | 28.2 | 4 | 1,529 / 1,518 | all four titles |

All ten runs ended `done`. Read the table with care: the worker rows read 2, 3 and 4 sites, not the same four, so their times are not a like-for-like speed comparison; the
like-for-like rows for four sites are one agent (about 74 s), readers (about 15 s) and four assigned workers (about 29 s). Readers were fastest by a wide margin, then workers, then a single agent,
which matches the earlier fixture measurement: a worker is a whole run with its own turns, so it pays off only for work heavy enough to repay that. The four-task limit and queue behaved as designed
(three running, one waiting, all four reported). Browser RAM peaked between 1.3 and 1.7 GB for every strategy with no clear ordering (the sampler windows are approximated from task durations, so
per-strategy CPU seconds are not reported: they were noisy and should not be quoted). Settled provider cost per run was not collected this round (earlier staging log readings: 30 to 1,300 micro-dollars
per task). Not measured: two-worker against four-worker on the same four sites, dependent workflows, and lower-powered hardware.
Consequence for routing: independent page reads should use readers; the router already keeps worker tools out of ordinary requests, and prompts for 3 or more sites still offer them, so a prompt that
asks for workers explicitly gets them, but nothing here justifies choosing workers over readers for simple reads.

### 3i. Real service-worker kill, and the no-progress cycle guard

`fixtures/sw-kill.mjs` drives real Chrome over the DevTools protocol (no extension code in the loop): it opens a fixture page, the side panel and an operator page, scripts the fake model to
add three rows with delays, stops every service worker (`ServiceWorker.stopAllWorkers`) after the second row while the third step is pending, and watches. Result: the worker came back, the
page had the same two rows right after the restart (no action replayed), the panel showed the run as Interrupted, and a follow-up message finished the run (Done, two rows). The earlier "restart"
checks only wrote stored state and called restore; this is the first test that kills the live worker. Limits: autorun build with the fixture model (the product build shows a Resume button instead;
not exercised here), no network-loss or tab-loss case, one run.

Guard gap found and closed: repeated identical calls only produced a nudge, and an agent alternating two calls (A, B, A, B...) never reached the repeat limit, so nothing ever stopped it. A window of recent
calls with at most two distinct calls, none of which changed the page, now stops the run after nine calls (the existing salvage path, so the user gets an honest summary); `wait` and `parallel_task_status`
polling and any call whose outcome was "changed" (add ten rows, next page) are exempt. Six unit tests cover alternating pages, a failing click, legitimate repeats, polling, many different pages and reset on
progress. Four existing long-run tests had scripted dozens of byte-identical reads to fill a context window, which is exactly the loop the guard stops; their scripted reads now vary the offset.

## 4. NOT IMPLEMENTED or BLOCKED, with the reason

Canvas pixel interaction (BLOCKED by the single-model rule: the only allowed model, deepseek_v4_1_flash_1017, has no vision, so it cannot see a canvas;
point targets exist in the layer but are offered only to a model with vision); native desktop applications (BLOCKED); macros and skills extracted from verified runs; region outline snapshots; HAR, video and
flight recorder (privacy review); typing stored secrets without the model seeing them (credential review); multiple Chrome profiles (BLOCKED: needs a
local daemon); a worker count chosen automatically from measurements (the cap of three is fixed; section 3a shows it behaves as designed); a worker
panel beyond the workers own conversations (the extension transcript is being changed in #971 by Codex, so this was not touched).

Built since the first version of this list: `confirm_download` (section 3b) and the `exists` / `count` postconditions (unit-tested and exercised in real
Chrome by scenario S3; NOT yet seen used by the real model).

## 5. Things that need a person

1. Human egress review of the Composio call in `composioClient.ts` (CI job disposable-policy-database).
2. Coordination with Codex: #971 and #972 change the extension transcript; this branch changes the loop and run manager; expect conflicts to resolve at merge.
3. Real accounts for Meta Ads, Google Ads, a design editor and a video editor, to turn the playbooks from tested selection into verified execution.
4. Approval for any production cutover of the extension and backend (section 6).

## 6. Production state

Done on 2026-11-12 with the owner approval: the production service reads the active Zurelay key (`ZURELAY_API_KEY`, revision `xroga-api-00259-quy`, rollback
`xroga-api-00256-fup` which holds the revoked key) and the production database has the configurable request gate (migration `zurelay_pacing_capacity_v2`,
defaults 600 ms, 8 in flight, 2 per user for new keys). No authenticated production model call has been observed yet. The extension and the browser
backend changes are NOT released: they need the egress review, the merge order #942, #960, #965, and the owner approval.
