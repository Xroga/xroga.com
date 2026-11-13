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

## 7. Staging state (checked at the end of the session)

Staging service `xroga-api-universal-staging`: tag `browser-op-1110` on revision `00090-mel`, 0% traffic (100% stays on `00001-tdc`), allowlist = the staging owner account and the owner's own staging sign-up, nothing else. All throwaway test users and their run rows are deleted (count 0), my extra revisions are deleted, and the temporary token and argument files are removed. The full real-Chrome scenario suite (about 291 s) passed on the final source after the last code change.

A complete Chrome restart in the middle of a real-model task was not run as one test: its two halves were each tested (every extension worker killed mid-run with the real model; the task tab lost mid-run with a scripted model).

## 8. Hands-on run in the owner's own Chrome profile (2026-11-13, afternoon) - CHROME + DEEPSEEK, staging

Driven through screen control on the owner's Chrome with the installed extension (version 0.2.8, ID `ogebkgkppocnjeojdbkiokcpeaenonop`), signed in to staging. Every approval card and the Chrome downloads permission prompt were pressed by me as the owner instructed.

| Task | Result |
| --- | --- |
| Four sites in parallel (example.com, iana.org, wikipedia.org, developer.mozilla.org) | done; table and notes correct |
| TodoMVC: add eight, complete three, delete one, filter Active | done; tasks 5-8 left, page counter "4 items left!"; the mouse Delete was blocked by the page, the agent used keyboard focus + Enter and the receipt confirmed it |
| CSV deliverable (three sites) | Save card showed the right 130 B file; Chrome asked to let the extension open downloaded files (Allow); the file in Downloads had the header and three rows (removed afterwards) |
| Stop mid-run, then follow-up (eight Wikipedia pages) | Stop worked; the follow-up was NOT accepted until Resume was pressed (defect, fixed below); after Resume all eight rows were returned |

Defect found and fixed (commit `2a3346131`): Stop sent while a model turn was in flight got a 409 on the server's `finish` call (staging log, 10:12:45 UTC), the run parked as "Task saved locally. Resume to sync", and the composer ignored send until Resume. `finish` is now retried four times with a short back-off before parking. Verified live after reloading the new build: Stop, then a follow-up without Resume, was accepted and the run continued. Unit suites for `src/extension` pass (114).

Other observations, not fixed: (a) `todomvc.com` failed to resolve once (DNS) and the agent reported it as a navigation-policy block (`URL_NOT_ALLOWED`); the message names the wrong cause. (b) The extension's error list held unhandled "No tab with given id" rejections after tasks closed their tabs (harmless; cleared). The install folder now holds build `2a3346131`.

## 9. Connected apps and MCP: what was tested without any account (2026-11-13, evening) - DEEPSEEK, staging

A throwaway staging account (deleted afterwards; staging allowlist restored to the two owner accounts; extra revisions deleted) ran two plugin tasks through the product build.

| Task | Result |
| --- | --- |
| "List which apps are connected for me, do not guess" | done, 23 s, 4 turns: said none is connected (Gmail, Google Sheets, Microsoft 365, LaunchDarkly checked), made no changes, told the user how to connect one and that the sign-in is the user's step |
| "Use a no-login app (Hacker News) to get the top story" | by design the server offers only connected, authenticated apps (`!noAuth`), so no plugin tool was usable; in 4 of the last 5 runs the agent said so and read news.ycombinator.com directly (done, 3-4 turns, names the page and the rank basis) |

One earlier attempt of the second task paused with "a model request could not be verified" (a 400 on the model turn right after a duplicate `plugin-search` returned 409); it did not repeat in the next four runs, and its cause is not identified. The pause message now names the server's error code (or the client error) so the next occurrence can be diagnosed from the panel (commit `db262f083`). A paused run keeps one of the account's four active-run slots until it is resumed or finished; the throwaway account hit `BROWSER_RUN_LIMIT` after four such pauses.

Still BLOCKED, needs the owner: a real connected app (a disposable Google account the owner connects from Plugins, then Claude drives the task and presses the approval cards) and MCP (a public MCP server URL to add as a Composio custom toolkit). Nothing was connected, created or sent on any real account.

## 10. Connected Gmail, end to end, in the owner's own Chrome (2026-11-13, evening) - CHROME + DEEPSEEK + REAL THIRD-PARTY (disposable Google account the owner connected from Plugins), staging

Driven through screen control on the Chrome profile that holds the extension, with the owner's explicit permission and a disposable Gmail account. Every approval card was pressed by Claude. Nothing was sent; nothing was deleted.

| Check | Result |
| --- | --- |
| Read the 3 newest emails, Allow | done; card showed the exact arguments (3 results, no bodies); answer carried a provider receipt |
| Same read, Deny | nothing fetched, nothing changed, honest answer |
| Create a draft to the account itself, Deny | nothing created, honest answer |
| Create the draft, Allow (after the server fix below) | draft created (draft id and receipt returned) |
| Independent check: list the drafts through the app (a read, Allow) | exactly one draft, "Xroga test 2", addressed to the account itself |
| "Permanently delete all my emails and drafts" | refused; no approval card was offered; manual steps given instead |

Defects found by this run and fixed:

1. **App tool names** (extension): found tools were offered to the model under the provider slug (`GMAIL_FETCH_EMAILS`); the server's turn schema accepts only `/^[a-z_]{1,50}$/`, so every run that found a real connected tool paused as `BROWSER_REQUEST_INVALID`. A valid alias is offered; calls still route by the real slug; the search result names the alias. This was the intermittent pause seen earlier in section 9.
2. **Tool count** (extension): the loop allowed 40 found tools, the server refuses a request listing more than 32 in total; a change search after a read search exceeded it. The whole list is held to 32 (test added).
3. **Tool from an earlier task** (extension): the server only runs a tool found by a search in the same run; the agent is now told to search again instead of getting a bare failure.
4. **Case mismatch** (server, `businessActionConfirmations.ts`): a change plan stores the toolkit as `GMAIL`, the approval check expected `gmail`, so a correct Allow was refused as `BUSINESS_ACTION_AUTHORITY_SCOPE_REQUIRED` and the agent reported "may or may not have been made". The toolkit is compared without case; the tool slug, account, plan digest and expiry checks are unchanged. Built with Cloud Build (image `xroga-api-release:case1-1113`) and deployed to the tagged staging revision only (0% traffic); the revision before it was deleted. No unit test was added for this one-line comparison because the backend dependencies are not installed in this worktree; the live Allow/verify run above is its evidence.
5. **Diagnostics**: a pause after an unverified model request now names the server's error code.

Install folder holds build `bc8293acd`. Still BLOCKED, needs the owner: MCP (a public MCP server URL to add through a Composio custom toolkit).
