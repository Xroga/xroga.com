# Xroga Browser Operator: completion matrix (single source of truth)

Updated 2026-11-12 on branch `claude/ops-plugin-actions-20261111` (PR #965). Columns: **Impl** implemented in source; **Integ** wired into the real
extension/backend path; **Fix** tested with fixtures or fake providers; **Chrome** tested in real Chrome (autorun build, fixture model unless noted);
**DS** tested with real DeepSeek on staging; **Svc** tested with a real authorized third-party service. Y = yes, P = partly, N = no, n/a = not applicable.
A passing unit test is not a user experience: the Chrome, DS and Svc columns are the ones that count. Evidence names a file, check or section of
`GAP-ASSESSMENT-20261112.md` (GAP).

| Capability | Impl | Integ | Fix | Chrome | DS | Svc | Open defects / limits | Evidence | External blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Browser control engine (Nanobrowser layer) | Y | Y | Y | Y (282 scenarios) | Y | n/a | none known | scenario suite; GAP 1 | none |
| DeepSeek route through Zurelay (staging) | Y | Y | Y | n/a | Y | n/a | production never exercised with a real authenticated call | GAP 3, 6 | production approval |
| Route A: open + read heading/title, no model call | Y | Y | Y | Y (6/6) | Y (staging, 3 runs 2.3-2.9 s, 0 turns) | n/a | handover on redirect/challenge/no heading; strict server rule deployed and verified on staging (image direct2-1112) | GAP 3e; check `direct-read` | independent review of the server rule |
| Complexity router (direct / readers / single / multi) | Y | Y | Y (8 tests) | Y (worker checks pass under it) | N (routing accuracy not measured on real requests) | n/a | thresholds are rules, untuned | `agent/router.ts` | none |
| Lightweight parallel readers (`delegate`) | Y | Y | Y | Y | Y | n/a | fastest strategy for independent page reads (4 sites 13.5 and 16.7 s) | GAP 3, 3h | none |
| Worker runs, dependency graph, resource locks, 4 tasks / 3 running | Y | Y | Y | Y | Y (benchmark, 2 runs each: 2, 3 and 4 workers all done; 4 tasks queue as designed) | n/a | workers are slower than readers for simple reads (4 sites: readers ~15 s, 4 workers ~29 s, one agent ~74 s); worker count is not auto-tuned | checks parallel-workers/graph/bench; GAP 3a | none |
| Batch tool (when/unless/repeat) | Y | Y | Y | Y | P | n/a | | check batch-tool | none |
| Anti-loop guards (repeat, no-effect, errors, read streak) | Y | Y | Y | Y (set G) | P | n/a | new patterns (circular navigation, plan repetition) not demonstrated | scenarios set G; `guards.ts` | none |
| Exact-count playbook, `count` / `exists` postconditions | Y | Y | Y | Y | P (model used `count` once; the page counts all roles so it fell back to the page counter) | n/a | model rarely chooses them | GAP 3c | none |
| Click settle latency | Y | Y | Y | Y | n/a | n/a | settle is still about 440 ms of a 565 ms click; deeper cuts would loosen "no effect" detection | `click-bench`; GAP 3f | none |
| Visual pointer overlay | Y | Y (#965 branch) | Y (3 unit tests) | Y | n/a | n/a | hidden-tab penalty fixed: the overlay is not drawn into a hidden tab and appears on activation (ten clicks in a hidden tab: pointer on 10.7/10.9 s vs off 10.8/10.5 s, was 16.9/15.6 vs 10.4/10.7); in a visible tab no measurable cost | GAP 3g | none |
| Downloads: `confirm_download` | Y | Y | Y | Y | Y | n/a | empty blob records no download | check `confirm-download`; GAP 3b | none |
| Uploads | Y | Y | Y | Y | N | n/a | interrupted upload not tested | scenarios | none |
| Canvas click by fraction (`at`) | Y | Y (editor tasks only) | Y | Y (controlled canvas) | N | n/a | needs positions the app shows; no real editor | scenario CV-1 | real editor account |
| Visual perception (OCR / vision model) | N | N | N | N | N | N | not built: needs a model/hosting/cost decision | GAP 4 | architecture approval |
| Workflow hints (sanitized, owner-scoped guidance) | Y | Y | Y (9) | N | N | n/a | no real run has used a hint; speed-up unproven | `workflow-hints.ts`, tests | none |
| Composio read/write path, approvals, one-use permits | Y | Y | Y (28 journeys) | n/a | n/a | N | no real account write or readback | GAP 3d | disposable Google account |
| Plugins UI + Composio discovery | Y | Y | Y | P | P | N | missing-connection guidance added (ask_user handover, then search again; 3 unit tests); never run with a real unconnected app | `missingConnectionNote` | disposable account |
| MCP servers (discovery, invocation) | P | P | P | N | N | N | not exercised through the Plugins path | n/a | an MCP server to connect |
| Recovery: segment renewal, restart-restore | Y | Y | Y | Y (restart-restore) | Y (60-turn run) | n/a | service-worker suspension, network loss, tab loss with the real model not tested | GAP 1 | none |
| Server finish for direct reads (`direct:true`) | Y | Y | Y | n/a | Y (looser version) | n/a | stricter version (goal, site, age, evidence) verified on staging with 3 real runs | `localBrowserDirectRead.ts` | independent review |
| #971 activity UI integration | Y (merged on `claude/ops-integrated-20261112`) | Y (candidate branch) | Y (1,111 unit tests pass on it) | Y (284 of 284 scenarios on the integrated build; `panel-shot` check: Black Hole header, live status, real activity row, Stop button, final answer) | N | n/a | candidate needs governance regeneration on its own branch and a human look at the screenshots; two defects found and fixed in the merge (lucide-react licence list, one placeholder-only string); Codex's #971 itself is unchanged | `panel-shot` PNGs; branch log | Codex coordination for the merge order |
| CI gates (#965) | n/a | n/a | n/a | n/a | n/a | n/a | tenant-security fails ONLY on the egress evidence for `composioClient.ts` (source changed after review) | review packet | independent security review |
| Private review build | Y | n/a | n/a | P (loads, panel renders) | n/a | n/a | not installed as a user with sign-in on the production build | `C:/xr-release/*.zip` | none |

## Performance facts measured this round (real Chrome, one laptop, fixture model with instant replies)

See GAP 3f. Per-click breakdown in a visible tab after the change: resolve 5 ms, actionability 72 ms, gate 2 ms, evidence begin 10 ms, CDP dispatch 20 ms, settle 437 ms,
page state 16 ms. Ten clicks end to end: 8.1-8.4 s before, 6.2-6.3 s after (median of three runs each).

## What is not claimed

No real-account result (Sheets, ads, design, video editors), no vision, no production run, no store submission. Fixture-only rows are labelled as such above.
