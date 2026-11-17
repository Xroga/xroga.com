# Browser Operator gap register, 17 November 2026

Source: branch `claude/ops-integrated-20261112` (integrated worktree). Staging only. Classes: **V** implemented and verified, **U** implemented but unverified, **B** broken or incomplete, **N** not yet implemented. Evidence kinds: unit (vitest), real Chrome + real DeepSeek on staging, blocked.

## Open pull requests (reconciliation status)

| PR | State | Note |
| --- | --- | --- |
| #960 pointer and latency | open | Superseded in part by the integrated branch; not re-reviewed line by line |
| #965 Composio write path | open | Its behaviour is in the integrated branch; not merged to main |
| #986 Composio validation and resume | open | Research branch; not reconciled, not touched |
| #942, #971, #976 | not inspected this session | Unknown |

Nothing here is merged to main. Release remains blocked on review and approval.

## Register

| Area | Class | Evidence / defect |
| --- | --- | --- |
| Free official public API read (`http_get`, no credentials, SSRF-bounded) | V | Real Chrome: Bitcoin price from Kraken after CoinGecko 403, cross-checked with Coinbase |
| Task-aware method choice (API / connected app / MCP / marketplace / browser) | V (two tasks) | DefiLlama TVL and Bitcoin price answered without detours; other task families not run |
| Gmail read, draft | V | Earlier runs, receipts recorded |
| Google Sheets read, create, write, read-back | V | Receipts `4e3ec7c5...` (read), `c198db03...` (create), `395b3b74...` (update); one self-corrected missing argument |
| Pinned custom MCP (Monid) discover, inspect, run | V | Free DefiLlama TVL, receipt `9c3d3c72...` |
| Connect by authorization link, user handover | V (to the handover) | Notion link opened, user card shown, cancel stops cleanly. Completed connection not shown |
| Browser fallback in the user's own signed-in session | V (partial) | After the user signed in to Notion, the agent created the page "Xroga fallback test" through the browser, then reported a pop-up it could not dismiss and asked for help (it did not claim success) |
| Queue instead of error when the model gate is full; retry a stalled model request | U | Unit tests only; the stall was seen live once, the fix was not exercised live |
| Parallel connected-app lookups | V | Fixed after a live 409 defect; queued per run |
| Approvals: reads and own-app changes run without cards; outbound and deletions ask | V (Sheets, Gmail read) | Outbound send path not re-tested after the change |
| Lead generation returns a verified table | B, fix built, live re-run in progress | First live run ended with company names but no verified websites or contacts and asked the user to pick an unblock route. Cause found: the browser policy accepts only `https://`, so `http://` company sites were refused (`URL_NOT_ALLOWED`). Fix: public `http://` is opened over https; a lead-generation playbook was added |
| Parallel workers: ownership, no duplicate research, structured handoff | U | Worker ownership exists in code (`parallel-workers.ts`); six concurrent runs recorded on the server earlier; no live check that workers do not repeat the same company |
| Five or six workers genuinely active at once, measured | U | Server recorded at most six runs active; a dedicated overlap measurement was not run |
| Long task progress counting ("k of N") and resume after interruption | U | Guidance added; durable checkpoint recovery exists; no live interrupt-and-resume run this session |
| Result display (table in the final answer, no raw JSON) | U | The playbook asks for the table; checked live only on the Sheets and API answers |
| Video-editing workflow | N | No renderer or provider connected; not attempted. Must say so, not simulate |
| User-supplied GitHub repository and skill analysis | N | Not built or tested |
| Experience Engine (verified learning from executions) | N | Not built here |
| Two simultaneous accounts, tab and data isolation | U | Not tested live; server isolation unit-tested earlier |
| Notion and Ahrefs connected-app execution | N (account not available for Ahrefs) | Notion browser-fallback partly shown; API path not shown |
| Provider outage handling | U | Stall retry (unit) only |
| Performance benchmark (first useful action, total time, redundant visits) | N | Not measured; only wall-clock of single runs observed |
| Independent security review (egress, pin gate, `public-get`, plugin-connect) | N (external) | Seven review records dropped because their reviewed files changed; they need a new independent review |
| Release (CI on exact source, staging acceptance, private install, rollback) | N | Not complete |

## Known limitations

- The model provider key is paced at roughly 120 requests per minute; larger scale needs more provider capacity.
- A site that needs a login, CAPTCHA or consent the agent cannot pass is handed to the user.
- Public APIs that require a custom User-Agent or key are not callable through `http_get`.

## Update, 18 November 2026 (real Chrome, real DeepSeek, staging, build `4eb74265f` plus earlier fixes)

| Area | Class | Evidence |
| --- | --- | --- |
| Find 10 qualified leads, table plus CSV | V (one run) | Run reached "verified 10 of 10", saved `us-automation-leads.csv` (2,393 B). Rows read: small, local US businesses (for example an independent insurance agency in Hood River, OR; an Amish-owned hardware shop in Farmington, OH), each with website, location, contact and source page. Contact details were not independently re-checked by us |
| Leads saved to a Google Sheet from the same conversation | V (visual) | A sheet "US Automation Leads" with the header row and 10 data rows including source URLs was open in Chrome after the owner asked for it; no provider receipt was inspected |
| Long task past the old turn limit | V | The turn-renewal fix: one renewal at turn 48, run continued to completion. Earlier build stopped at "turn limit" with 2 of 10 verified |
| One dead page ends the task | V (after fix) | A certificate-warning page earlier ended a run as partial; navigation failures are now failed reads. The later run completed |
| Five concurrent workers, measured | V (one run) | Server run records: parent started 19:19:14 UTC, five worker runs started 19:19:22 to 19:19:27 (within 5 s), finishes at 19:19:34, :36, :38, :48 and one later; at least five workers active at the same time with the parent (six runs). The final table covered all five sites. One worker (NYT) never returned a result; the coordinator said so in the answer and read that page itself. Worker ownership of tabs was not inspected beyond this |
| Tab wall of `about:blank` in parallel reading | U | Bounded page pool (8 at a time) committed and built; the five-worker run did not show it, but tab behaviour during `delegate` reading was not observed |
| Gap: five-worker run duration | B | Total about 2 minutes for five single-fact lookups; a worker that never returned held the parent. Per-worker deadline and replace-on-stall is not implemented |
| Simple task (open a page, read the main heading) | V, with a quality gap | Real Chrome, real DeepSeek: 15 s, 4 model turns, no workers started; answer "Example Domain" was correct but hedged ("inferred from the title") because the text read did not expose the heading element. The zero-model direct path did not trigger for this phrasing |
| A silent worker holds the parent | Fixed in code, U | Per-worker deadline (15 minutes by default, configurable): only that worker is failed with a reason, its window closed, its slot freed; unit-tested (123 extension tests pass); not yet exercised live |
