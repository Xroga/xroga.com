# Private acceptance record, 2026-11-13

Source under test: branch `claude/ops-integrated-20261112` (Browser Operator #965 plus Codex #971), package source commit `d73b832c5` (clean tree), later commits are documentation only.
Package: `C:/xr-review-builds/xroga-browser-operator-staging-0.2.8-d73b832c5.zip`, SHA-256 `b9673a655350730a97ea1c41995ce76d2555773cd6d907b36d1b9779dc93821f`. Backend: staging
`browser-op-1110` (image `direct2-1112`). Model: DeepSeek V4.1 Flash 1017 through Zurelay; no other runtime model exists in any path exercised here.
Classes: **FIX** fixture or fake provider; **CHROME** real Chrome with a scripted model; **DEEPSEEK** real Chrome plus real DeepSeek on staging with a throwaway account (since deleted);
**SERVICE** real third-party account; **BLOCKED** needs something I may not or cannot create.

## What was run on the exact integrated source

| Run | Result |
| --- | --- |
| Typecheck, 1,146 unit tests, three consecutive full runs | all pass (CPU-bound long-run tests have an explicit 30 s timeout; they failed about one run in three before) |
| Real-Chrome scenario suite | pass (about 291 s) |
| CDP disruption harness, modes kill, offline, tabclose | all three pass |
| Checks direct-read, model-outage, parallel-workers, page-border, panel-shot | all pass |
| Final package extracted to a fresh folder and loaded in Chrome | pinned extension ID, service worker, side panel and settings page start; extracted files hash-identical to the build output |
| Real DeepSeek, six tasks (below) | all six ended `done` |
| Real DeepSeek, product Resume contract after a real worker kill | pass (second independent run) |

Real DeepSeek tasks (product build from the same source, staging, `auto` mode, harness pressing Allow and Done as the person would):

| Task | Seconds | Model turns | What happened |
| --- | --- | --- | --- |
| A open iana.org and read the heading | 2.9 | 0 | answered directly from the page, with the page title shown beside the first heading |
| B open a page, click its link, say what the next page says | 18.4 | 3 | click, read, done |
| C page titles of four sites in parallel | 14.2 | 2 | parallel readers; one page carried instruction-like text and was ignored |
| D add three todo items, exactly three | 38.9 | 5 | recovered from a DNS error by reloading, three items, verified by the page's own counter |
| E "use my connected Google Sheets app..." (no app connected) | 27.4 | 5 | detected the app is not connected, handed over, searched again, ended with honest instructions |
| F best SEO practices this year, five points with links | 35.2 | 3 | search engine blocked automation; answered from Google's own documentation with sources and said so; no five-point list with dated sources |

## The 26 acceptance items

| # | Item | Status |
| --- | --- | --- |
| 1 | Extension installation | CHROME: the extracted package loads. Not a Chrome Web Store install |
| 2 | Login and Workspace pairing | DEEPSEEK: device enrollment against staging verified for a throwaway account. **Interactive sign-in of the packaged build in the Workspace was not performed by me** (I may not type credentials into a sign-in page): owner step |
| 3 | Simple deterministic actions | DEEPSEEK (A, 0 model turns) |
| 4 | Real DeepSeek browser execution | DEEPSEEK (B) |
| 5 | Complex multistep task | DEEPSEEK (D, with error recovery) |
| 6 | Multiple tabs | DEEPSEEK (C, readers open background tabs) |
| 7 | Parallel research | DEEPSEEK (C, F); earlier strategy benchmark in GAP 3h |
| 8 | Multi-agent execution | DEEPSEEK in the earlier benchmark (2, 3, 4 workers); not repeated in this run |
| 9 | Complex forms | CHROME and FIX scenarios; real model only on a todo form |
| 10 | File uploads and downloads | downloads: DEEPSEEK (`confirm_download`, GAP 3c); uploads: FIX only |
| 11 | Real Chrome activity presentation | CHROME: panel capture shows the Black Hole header, live status, activity rows, Stop |
| 12 | Cursor movement | CHROME: pointer overlay checks and click benchmark; no visual recording of the pointer |
| 13 | Task cancellation | FIX and CHROME scenarios; not run with the real model in this round |
| 14 | Task recovery | DEEPSEEK: Interrupted, Resume, uncertain-write pause, follow-up completes, no duplicate |
| 15 | Service-worker restart | CHROME (kill) and DEEPSEEK (product) |
| 16 | Network loss | CHROME (offline mode, scripted model); not with the real model |
| 17 | Connected-tool discovery | DEEPSEEK for the not-connected case; discovery with a connected account **BLOCKED** (no disposable account) |
| 18 | MCP tool invocation | **BLOCKED**: runs only through Composio custom MCP toolkits, which cannot reach a local server; needs a reachable MCP server and a Composio project |
| 19 | Missing-connection handling | DEEPSEEK (E) |
| 20 | Connect-and-resume | hand-over verified (E); resume after a real connection **BLOCKED** |
| 21 | Safe connected-app writes | FIX only (28 fake-provider journeys, duplicate-write protection); real write **BLOCKED** |
| 22 | Canvas and editor interaction | CHROME on a controlled canvas (fraction click); real editor **BLOCKED**; no vision model by design |
| 23 | Artifact creation and verification | downloads verified with `confirm_download`; a generated report file was not produced in this run (F answered in chat) |
| 24 | Long-running continuation | DEEPSEEK: 60-turn run across a segment renewal (earlier) |
| 25 | Repeated-action loop prevention | FIX (unit) and CHROME (scenario set G); cycle guard new this round |
| 26 | Account isolation and authorization | FIX: route and tenant tests; two real accounts at once not tested |

## Blocked or pending, with the exact requirement

1. Independent security review of the `composioClient.ts` egress path and the direct-completion rule (the only failing CI job I know of, `disposable-policy-database`): a reviewer using `docs/xroga/security/review-packets/COMPOSIO-EGRESS-7b6e1f49-REVIEW-PACKET.md`.
2. A disposable Google account connected to the staging Xroga project (items 17, 20, 21), and a publicly reachable MCP server plus a disposable Composio project (item 18).
3. The owner's own sign-in of the packaged build in the Workspace (item 2), then the checklist in `docs/xroga/release/PRIVATE-REVIEW-HANDOVER.md`.
4. A vision decision (hosting, cost, privacy) before any pixel-only editor can be supported.
