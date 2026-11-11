# Xroga Browser Operator: gap assessment and evidence (night of 2026-11-12)

Branch `claude/ops-plugin-actions-20261111` (PR #965, stacked on #960, which is stacked on #942). Staging only: nothing here was released to production
except the Zurelay key reference and the faster request gate, recorded in section 6. Status words: VERIFIED (tested, evidence named), PARTIAL, FAILED,
NOT IMPLEMENTED, BLOCKED. A number from a single run is a single run, not an average.

## 1. Assessment by area

| Area | Status | Evidence and limits |
| --- | --- | --- |
| Single-agent browser execution | VERIFIED on public sites | Real Chrome: the full fixture scenario suite (282 of 282) and run-level checks pass. Real DeepSeek through staging: 18 real tasks (simple read, form fill without submitting, three sites, three-page reads, workers, a task graph); 13 ended `done`, one was recorded `failed` and one `interrupted` before a bug was fixed (a correct answer with no layer receipt counted as no work), and three were read at the short result-sync moment (shown as `interrupted`; the check was fixed). I read the end of each answer: the ones I checked against the pages were correct; I did not audit every answer line by line. NOT shown: signed-in business applications. |
| Advanced interactions | PARTIAL | Present and tested at fixture level: navigation, tabs, snapshot, find, read, scroll, click, hover, type, key chords, fill_form, select/check, dialogs, drag between referenced elements, upload of attached files, waits, postconditions, frames and open shadow roots. NOT IMPLEMENTED: downloads (no tool, so an exported file cannot be confirmed), pixel/canvas clicks (the agent is deliberately not given coordinates or selectors), native desktop applications (BLOCKED: the extension controls Chrome only). |
| Multi-agent execution | VERIFIED (scripted model in real Chrome; real model on public pages) | `delegate` (parallel page readers, search-then-read), `start_parallel_tasks` workers (each its own run, window and server turn counter; up to 8 tasks, 3 at a time), a dependency graph (`after`, results handed over), exclusive `resource` names, `batch` (when/unless/repeat). Real-Chrome checks: parallel-workers, parallel-graph, batch-tool. PARTIAL: which structure to use is chosen by the model from the playbooks, not by a measured scheduler. NOT IMPLEMENTED: a 5-worker mode (the account allows 4 active runs). |
| Parallel tab ownership | PARTIAL | Each worker has its own window and its own session-owned tabs; tasks that name the same resource never run together (unit-tested). NOT tested in real Chrome: two runs attacking the same tab, or a user tab being touched. |
| DeepSeek integration | VERIFIED on staging | Model `deepseek_v4_1_flash_1017` through the staging gateway with the active Zurelay key; per-turn server timing, tokens and settled cost read from the staging logs (section 3). |
| Connected-app actions | PARTIAL | The approved Sheets read/write path was failing because the provider refused an account field; fixed and exercised against staging at API level. NOT verified: a real approved write on the owner account by the owner. Gmail overlay work is #970 (Codex). |
| Recovery and resumption | PARTIAL | Run segments: a backend test drives one run past 450 turns and renews time; a real 60-turn DeepSeek run crossed the old 48-turn limit through a segment renewal. restart-restore passes in real Chrome. Worker table persists across an extension worker restart (unit-tested). NOT tested with the real model: service-worker suspension, Chrome crash, tool loss. |
| Planning and expertise | PARTIAL | 19 playbooks chosen from the request (including design editors, video editors, business records, work-split, Google and Meta Ads, SEO), selection VERIFIED by tests. Real execution of Meta Ads, Google Ads, a design editor or a video editor is NOT VERIFIED: no accounts. |
| Performance | VERIFIED where measured | Section 3. Not measured: CPU and RAM overhead, 5-worker runs, differential against full snapshots. |
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

## 4. NOT IMPLEMENTED or BLOCKED, with the reason

Downloads and exported-file confirmation; canvas pixel interaction; native desktop applications (BLOCKED); macros and skills extracted from verified runs;
postconditions that count rows or confirm a record exists (the playbook asks the agent to search again instead); region outline snapshots; HAR, video and
flight recorder (privacy review); typing stored secrets without the model seeing them (credential review); multiple Chrome profiles (BLOCKED: needs a
local daemon); worker-count scheduler driven by measurements; a worker panel beyond the workers own conversations (the extension transcript is being
changed in #971 by Codex, so this was not touched).

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
