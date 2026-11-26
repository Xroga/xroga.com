# Heavy-task testing, 2026-11-13

Class: **DEEPSEEK** = real Chrome (Chrome for Testing build, headful) + the packaged product build + real DeepSeek V4.1 Flash 1017 through Zurelay on staging (`browser-op-1110`), throwaway staging account (deleted afterwards, allowlist back to the owner only, extra revision deleted). Not the owner's own Chrome profile: the Claude-in-Chrome connection was not available, so nothing here ran in the owner's signed-in Chrome.

## Tasks (all public sites, auto mode, harness presses only Allow and Done)

| Task | Final result on the last build |
| --- | --- |
| H1 six sites in parallel (title and first nav item, ranked) | done, 16-28 s, 2 turns |
| H2 TodoMVC: add eight items, complete three, delete one, filter, read counter | done, 60-95 s |
| H3 Wikipedia multi-hop across two tabs (designer, birth data, latest release) | done, 53-131 s |
| H4 complete web form and submit | done, 24-35 s; the agent itself reported that the date field did not reach the server (the page's datepicker), it did not claim otherwise |
| H5 three listing pages, count five-star books, cheapest, open it | done, 7 turns; count 14, cheapest Sophie's World GBP 15.94, "In stock (18 available)" all match the live pages |
| H6 three official sites in parallel (Node, Python, Go versions) | done, 26-105 s |
| H7 fifteen full Wikipedia pages one at a time (year and designer) | done, 220-300 s, 20-32 turns, all fifteen rows |
| Kill every extension worker mid-run, then Resume and follow-up: TodoMVC | pass: exactly alpha, beta, gamma, no duplicate |
| Same on a four-site parallel task | pass: Resume offered, all four sites in the final answer, answer must not admit unread pages |

## Defects the heavy tasks found, all fixed in this round

1. A value carried only by a CSS class (star ratings) was invisible to the read tools and the agent asked the user. Class-carried state (rating, score, level, status, ...) now appears as text, capped at 300 per page; the prompt says to try snapshot/find before asking.
2. The server refuses a model request over 96,000 bytes with `BROWSER_CONTEXT_TOO_LARGE`; the extension treated it as "could not be verified" and paused the run (about turn 48). It is now an overflow the loop compacts, and the turn number is given back.
3. The parallel readers' combined result (28,000 characters) was cut at the general 8,000-character tool-result cap, dropping whole sites. The readers have their own cap (30,000).
4. The server also refuses more than 140 messages per request. A long task of many small steps hit that at about turn 65 and paused. Compaction now keeps at most 60 recent messages and triggers above 100.
5. Compaction's own summary call is a model request the server counts and the loop does not, so a run could reach the end of its 48-turn segment unannounced (409) and pause. The model client now renews the segment before a request that would pass its end.
6. A smaller context window was tried and rejected: it made compaction (a model call) fire almost every turn.
7. The prompt now says: read the rest of a cut result, and finish every part of the task instead of stopping to offer to continue.

Unit tests added or changed: size-cap overflow, message-count compaction, segment renewal at the boundary, the overflow-recovery test's simulated limit. Typecheck clean; agent, xroga and extension suites pass.

## What this does not show

- Not run in the owner's own Chrome profile or with the owner's signed-in Workspace.
- No connected third-party app, MCP server or real account.
- Model answers on heavy tasks vary between runs (turn counts differ by up to 4x for the same task); the results above are the last passing run of each, with the earlier failing runs described above.
- The independent security review of the Composio egress path and the direct-completion rule is still pending (CI job `disposable-policy-database`).
