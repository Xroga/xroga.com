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
| GitHub repository analysis (read-only, no code run) | V (one run) | Real Chrome, real DeepSeek: analysed `nanobrowser/nanobrowser`; 29 model turns, 4 direct `public-get` reads (README, `package.json`, `AGENTS.md`, `LICENSE`); answer cited each source, said it executed nothing, and noted none of the pages carried embedded instructions. Claims are what the project says about itself, not verified behaviour |
| Interrupt and resume (extension reloaded mid-run) | V (one run, after a fix) | First attempt exposed a defect: after Resume every navigation was refused ("an earlier write might have been delivered"), because an interrupted navigation was classed as an uncertain write. Fixed in `restore.ts` (navigation and tab calls are reads to repeat; clicks and typing still protected), unit-tested. Retest with the fixed build: 12-site sequential task interrupted by reloading the extension at 19:42:21 UTC (last model turn 19:42:26), resumed from the saved state, completed with all 12 titles listed. The interrupt landed late in the run (the tab was already on page 12), so this does not show resuming from early progress |
| A page that changes under the agent | V (one observation) | While the agent was running, its own tab was navigated to `chrome://extensions` by the tester; the agent noticed, re-navigated, and continued the list |
| Page read headings | U | Instruction added: when asked for a heading or exact wording, read the page and quote it (headings come back as `#` lines). The re-run of the heading task after this change was not done |

## Update, 18 November 2026 (second): isolated repository execution (real Chrome, real DeepSeek, real Cloud Run worker, staging)

| Area | Class | Evidence |
| --- | --- | --- |
| Isolated offline execution worker on Cloud Run | V | `xroga-sandbox-worker` (gen2, scale to zero, one fresh container per run, service account with no roles, IAM invoker limited to the staging API). Self-test with positive control; adversarial probe after the automated security review: 1 to 2 visible processes, worker token unreadable from any `/proc/*/environ`, no network, no metadata server, a detached process from run A absent in run B |
| `run_repository`: a public GitHub repo run at an exact commit, with real output returned | V (one task) | Unfamiliar library `mahmoud/boltons`: DeepSeek ran `boltons.iterutils.unique()` and `chunked()` in the sandbox (3 turns, 2 direct reads, 1 `repo-run`), result `[['Apple','banana','cherry'],['kiwi','pear']]`, reported commit `d31d821d56c8` (matches the archive header read independently) and the library's own version string `26.2.1dev`; it stated what it could not cross-check. First attempt failed honestly (GitHub API refuses requests without a User-Agent; the failure reason was not reaching the agent); both fixed |
| Repositories that need packages or the internet (JobSpy, OpenOutreach, Maps scraper kit) | B / blocked | The sandbox is offline and installs nothing. A separately verified restricted-network stage (registry and approved-host allowlist) and the independent security review are required. Not built |
| Workspace coding agent (clone, edit, test, diff) running on the same worker | U | The existing software agent and change workflow run commands through the same sandbox seam; the worker now registers on staging, but no Workspace task was run on it in this session |
| Sandbox compute in the cost ledger | N | Not wired |

## Overnight run, 18 November 2026 (Chrome, real DeepSeek, staging backend, installed extension 0.2.8)

| Scenario | Result | Evidence |
| --- | --- | --- |
| B2B lead hunt: 10 independent HVAC and plumbing companies in Austin TX with verified websites, public contact, a seen automation gap, and source pages | PASS (staging, one run, 04:13 to about 04:22, about 9 minutes) | The side panel showed a table of real rows (for example Chuck's Air Conditioning: request-service page is a generic form plus phone, no scheduler; Touchstone Plumbing: contact form has no service type, address or preferred time; My Austin Plumber LLC: phone and email on the contact section). It screened out franchises and sites that already had online booking (Flint Plumbing, Air Comfort Systems, Alamo Austin Air), reported two sites it could not verify (a Cloudflare block and a browser address-policy block), noted Google's human check, and said it contacted no one. Not independently checked here: each row's accuracy against its site beyond what the panel showed; the CSV or Sheets export and reopen were not run |
| Defect found live: run one stalled on a false payment hand-off | FIXED, then re-verified | The agent clicked "Book Now" on a plumbing contact page. The pay-word list raised "Complete the payment yourself". After Cancel the agent clicked the same control again (repeat loop), stuck 4 minutes on company 1. Fixes: the lead playbook now forbids clicking Book, Schedule, Pay, chat or submit buttons on a company site (commit edd77df2e); the cancelled hand-off message now says never click that control again and carry on with the rest of the task (commit 5428d1826). Run two, on the rebuilt extension, hit no hand-off and finished |
| Extension tests after both fixes | 1216 pass, 4 skipped | Full vitest run |

| Named connected app, read (Notion) | PASS (staging, one run, about 2 minutes) | "Using my Notion, list my 5 most recently edited pages": five real page titles with edit times and links, Notion provider receipt, nothing changed, no tool-search loop, no Monid/Gmail pin involvement |
| Authorized write with deny, then allow, then read-back (Notion append) | PASS (staging) | The approval card showed the exact action, account and payload. Deny: nothing written, the agent stopped and said so. Allow after a deliberate retry: the first call was rejected by Notion (flat `text` field), the agent corrected the block shape and a second approval card was shown; after Allow the page was read back and showed the new paragraph "Overnight check 2026-11-18" with the earlier content unchanged, app receipt 781e7252-3ac1-495a-85af-c04bd7df193e. One paragraph remains on the Notion test page "Xroga fallback test" |

### Still not verified or not built after this overnight pass (no passes claimed)
- Five-worker overlap measurement and six-worker boundary; per-worker deadline and replacement of a stalled worker.
- Interrupt and resume (service-worker kill, Chrome restart) on a long real task; Stop, Pause, Resume on a real run.
- Lead hunt export to CSV or Google Sheets and reopen of the saved result.
- Two accounts (User A and User B) isolation live.
- Repositories that need packages or network; Workspace coding agent on the sandbox worker; sandbox compute in the cost ledger.
- Media and video generation (no provider connected), file-driven task with output artifact, visual editor task.
- Independent security review, human egress review of the connected-app and sandbox changes, and private package promotion: not signed, so the build is review-ready, not production-certified.

| Five-company parallel research (HQ city from each official site) | PARTIAL (staging, one run, 04:32 to about 04:39, about 7 minutes) | Honest and cited, not complete: Stripe's quote came from its official newsroom "About Stripe" page (two cities, both listed); Figma, Linear and Vercel were reported as not verified (a 404, a sign-up redirect, pages without a headquarters line, a Google human check not bypassed); it also stated no page contained instructions aimed at it. Gap: for a simple five-fact task the run took about 7 minutes and left three facts open; it did not try other official pages (careers, press, homepage footer). Parallel overlap of five workers was not measured in this run |
| Private build | Built | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-5428d1826.zip`, SHA-256 `2eb542fcc62b790cb31816c631c1100338751aab1fc5f1a300448ad2b14eaaff`; built from commit 5428d1826 (no extension source change since); manifest identical to the installed staging build; the owner's Chrome is running this build. Review-ready, not production-certified |

## Correction and follow-up, 18 November 2026 (afternoon)
- **Correction:** the earlier overnight lead-hunt entry above marked the 10-company hunt PASS. On reopening the saved answer (it reopened intact after 8 hours, which does prove durable reopen) only 3 rows had their own evidence; the answer then said "Rows 4-10 (verified earlier in this run)" and named companies that its own verification notes said were screened out or not verified. That run is a FAIL on completeness and honesty of the count, not a PASS. The row evidence for rows 1 to 3 was real.
- **Fixes (commits after 5428d1826):** k in "verified k of N" must be the number of table rows with their own evidence; each verified company's whole row is written in the reply as it is verified, because old page text is dropped by context compaction.
- **Re-run on the rebuilt extension (13:04, about 25 minutes, then stopped by me):** the agent captured real phones, emails and booking facts company by company (Sidney Cox, Heritage Air, Casa Mechanical, Brandenburg, A+ Air, Efficient Texas, Touchstone), but after Stop and a request for the table it reported most rows as title-only and said about 9 rows were unfilled. It named seven sites that refused navigation and did not invent rows. Verdict: not complete, honest. Run time was too long.
- **Pause and Resume:** PASS on a live run. While paused the active page did not change for 25 seconds; after Resume it moved to a new page.
- **Stop then follow-up:** PASS. After Stop the controls reset and a follow-up message was answered.
- **Durable reopen:** PASS. The lead-hunt conversation was found in Recent tasks and reopened with its table, 8 hours later, in a Chrome session that had restarted.

## Lead hunt after the code fixes (18 November 2026, 13:37 to 13:54, installed extension, real DeepSeek, staging)
| Scenario | Result | Evidence |
| --- | --- | --- |
| False "complete the payment yourself" card on a "Book Now" link during research (reported by the owner from a screenshot) | FIXED in code, re-verified live | Cause: `book now` was in the payment vocabulary (`classify.ts`); a prompt rule had not stopped the model clicking it. Fix `6fc6fed4c`: removed; `place order`, `complete booking`, `pay`, `checkout` stay gated; a unit test covers both. Live: the run reached Moore & More's "Book Now!" and "SCHEDULE SERVICE" and recorded them as a web form, with no hand-off card |
| Lead hunt, 5 independent Austin plumbing companies, table with exactly the verified rows | PASS (staging, one run, about 16 minutes) | Final answer: a 5-row table with phone or contact, the automation gap seen and the source page for each, and "Count: 5 verified rows (exactly the five above)". Companies named in the notes as blocked or unverified (for example Abundant, Bradbury) were not counted. Flint Plumbing was marked as the weakest gap because it has an embedded Housecall Pro booking path |
| CSV export of the result | PASS | The panel's Save as CSV wrote `Downloads\table.csv` (2122 bytes): a header row and the same 5 rows (Touchstone, Sidney Cox, Alberto, Moore & More, Flint). Google Sheets export not run |
| Private build | Rebuilt | `xroga-browser-operator-staging-0.2.8-6fc6fed4c.zip`, SHA-256 `d156f77c253958373a375237a290b6042afb819d2282e6793c9dc29bd788313c`; built from commit 6fc6fed4c (last extension source change); manifest identical to the installed copy; extension tests 1217 pass, 4 skipped. The earlier `-5428d1826` zip is superseded. Review-ready, not production-certified |
