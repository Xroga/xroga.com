# Xroga Browser Operator: final private review build, handover 2026-11-13

Branch `claude/ops-integrated-20261112` (PR #965 engine plus Codex #971 activity UI), pushed. Backend: staging `browser-op-1110`. Model: DeepSeek V4.1 Flash 1017 through Zurelay, the only runtime model.
Status words: **FIXTURE** (scripted model or fixture page), **CHROME** (real Chrome, scripted model), **DEEPSEEK** (real Chrome + real DeepSeek on staging, throwaway or allowlisted staging account), **BLOCKED** (needs something outside this environment).

## 1. Package

| Item | Value |
| --- | --- |
| Install folder (loaded in the owner's Chrome, updated in place: press Reload on the extension card) | `C:\xr-review-builds\xroga-extension-staging-0ff582593` (the folder name is the earlier build's; `BUILD-INFO.txt` inside says which source it holds) |
| Zip | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-24524167b.zip` |
| SHA-256 | `b9827a6086f6bc2f252a50d8899b8ac13abe67900d9f18561f5514c12e2e8444` |
| Source | clean tree at commit `24524167b` (staging keys and origins baked in, no test harness code, pinned extension ID `ogebkgkppocnjeojdbkiokcpeaenonop`) |

Installation and pairing: Developer mode, Load unpacked on the folder, check the ID, open the side panel, Connect Xroga Workspace, sign in on the staging Workspace page (a staging login, separate from xroga.com; the account must be on the staging allowlist). The staging Workspace preview was rebuilt on 2026-11-13 because Vercel had removed the old deployment (410).

## 2. What was closed in this round (all found by heavy real-DeepSeek tasks)

| Defect | Fix | Evidence |
| --- | --- | --- |
| A value carried only by a CSS class (star ratings) was invisible; the agent asked the user | class-carried state shown as text (capped at 300 per page); prompt: try snapshot/find before asking | book-ratings task done, count and cheapest book match the live site |
| Server refuses a model request over 96,000 bytes; the run paused as "unverified" | `BROWSER_CONTEXT_TOO_LARGE` becomes an overflow the loop compacts; the turn number is given back | unit test, six-site task |
| Parallel readers' combined result cut at the 8,000-character tool cap | own 30,000-character cap | six-site task 16-28 s, 2 turns |
| Server refuses more than 140 messages per request; long tasks paused near turn 65 | compaction keeps at most 60 recent messages and triggers above 100 | unit test, fifteen-page task done |
| Compaction's summary call is a counted server turn the loop did not count; runs paused at the 48-turn segment end | the model client renews the segment before a request that would pass its end | unit test, pagination task done |
| Smaller context window made compaction fire every turn | kept at 32,000 | recorded in the memory notes |
| Agent stopped partway to offer to continue; relied on cut results | prompt: read the rest of a cut result, finish the whole task | fifteen-page task: all fifteen rows |
| A hover-only Delete button looked like every other Delete button; the model deleted the wrong row | a control inside a list item or table row is printed with that row's text; controls sharing a role and name always are | real Chrome fixture check shows `button "Delete todo" (in "write report")`; three real TodoMVC runs, no wrong-row delete, all three final answers correct |
| Stale checks (`observe-tools` boundary format and `fill_form` error code) | updated to the current product behaviour | check passes |

## 3. Real DeepSeek results on the last builds (DEEPSEEK)

| Task | Result |
| --- | --- |
| Six sites in parallel (title, first nav item, ranked) | done, 16-28 s, 2 turns |
| TodoMVC add eight, complete three, delete one, filter, read counter | done in 7 of 7 recent runs; 49-88 s, 7-17 turns with the row-aware outline |
| Wikipedia multi-hop across two tabs | done, 53-131 s |
| Complete web form | done, 24-35 s; the agent reported the datepicker value did not reach the server |
| Three listing pages, count five-star, cheapest, open it | done, 7-8 turns, matches the live site (14; Sophie's World GBP 15.94; "In stock (18 available)") |
| Three official sites in parallel | done, 26-105 s |
| Fifteen full Wikipedia pages one at a time | done, 221-297 s, 20-32 turns, all fifteen rows |
| Report deliverable: three sites, save `xroga-night-report.csv`, confirm download | done, 43 s, 6 turns; the real 99-byte file in Downloads had the header and three rows (file removed afterwards) |
| Anti-loop: a button that does not exist | ended honestly (failed) in 12.7 s, 2 turns |
| Anti-loop: a page that does not exist | answered in 6 s, 1 turn, noted the site serves the same page for any path |
| Anti-loop: text that is not on the site | ended honestly in 20 s, 4 turns |
| Kill every extension worker mid-run, Resume, follow-up (TodoMVC; four-site parallel task) | pass; four-site answer complete, answer must not admit unread pages |
| Network offline for 20 s mid-run (eight-page task) | recovered, Resume offered and pressed, all designers found |
| Stop pressed mid-run, then a follow-up | stopped cleanly, follow-up completed (PHP row stayed empty and the agent offered to continue: a known weakness) |
| Workflow hints (same task three times in one profile) | no reliable benefit shown: 103/147/71 s before the outline change; variance is larger than any hint effect, three samples |

Provider receipts for the staging runs since 20:55 UTC on 2026-11-13: 582 model turns across 42 runs, about USD 0.059 settled in total, per-turn model time median 3.9 s, 95th percentile 5.8 s (Cloud Run `[browser-turn]` logs).

## 4. Integration, tests, recovery

- Typecheck clean; agent, xroga, extension and browser-control unit suites pass (596 in the last run of the agent and browser-control suites; new tests for the size cap, message count, segment renewal, row context).
- Real-Chrome checks pass: direct-read, model-outage (503/429/500), parallel-workers, page-border, panel-shot, click-bench, observe-tools, snapshot-rows; worker kill, offline and tab close with a scripted model.
- Tenant isolation, live on staging: the owner starts and reads its own run (201, 200); another allowlisted user gets 404 on that run's read, turn, finish, extend and resume; a user not on the allowlist gets 403; no token gets 401.
- Governance registers regenerated and pushed. The only failing governance check is the expected `audit-egress-callers` drift for the Composio egress path, which needs a human reviewer.

## 5. Not done, with the exact requirement

1. **Independent security review** of `composioClient.ts` egress and the zero-model direct-completion rule (CI job `disposable-policy-database`). Packet: `docs/xroga/security/review-packets/COMPOSIO-EGRESS-7b6e1f49-REVIEW-PACKET.md`. I did not self-approve it.
2. **Connected apps and MCP**: need a disposable Google account connected to the staging project, and for MCP a publicly reachable MCP server plus a disposable Composio project (the product reaches MCP only through Composio custom MCP toolkits on the server). Not tested with real services.
3. **Visual editors and canvas**: no vision model by design; a pixel-only editor needs a hosting and cost decision. DOM, accessibility, geometry and fraction clicks on a controlled canvas work.
4. **Operating the extension in the owner's own Chrome profile**: the Claude-in-Chrome connection can view and drive web pages but cannot operate the extension's side panel or `chrome-extension://` pages, so the owner's hands-on test of the installed extension is still the owner's step.
5. Chrome Web Store, public launch: not attempted by instruction.

## 6. Owner's testing checklist (morning)

1. Open `chrome://extensions`, press Reload on Xroga (the folder was updated in place), confirm version 0.2.8 and the ID.
2. Side panel: it should already say "Signed in to Xroga". If not: Connect Xroga Workspace, sign in with the staging account.
3. Try: "Check example.com, iana.org, wikipedia.org and developer.mozilla.org in parallel and give me a table."
4. Try: "On todomvc.com add eight items, complete three, delete one, filter to Active and tell me what is left."
5. Try a longer task (fifteen Wikipedia pages one at a time) and press Stop in the middle, then ask it to continue.
6. Try a deliverable: "Read the headings of three sites and save a CSV of them." The panel shows a Save card; press Save.
7. Settings, Data, Delete everything; Sign out and confirm a new task cannot start.
8. Report problems with the time, the request, a screenshot of the side panel, and the red lines from `chrome://extensions`, Xroga, "service worker", Console.

## 7. Staging state

Staging service `xroga-api-universal-staging`, tag `browser-op-1110`, 0% traffic, allowlist limited to the owner account and the owner's own staging sign-up. Throwaway test users are deleted when testing ends (see the tracker at the bottom of this file if any remain).
