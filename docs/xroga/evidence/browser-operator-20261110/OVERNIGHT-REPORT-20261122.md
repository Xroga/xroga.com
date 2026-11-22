# Browser Operator: overnight report (2026-11-22)

Scope: the Overnight Master Directive of 2026-11-22. Everything below was measured; "NOT RUN" means not run, "BLOCKED" means it needs something only the owner can provide. Xroga is not 100% complete and this report does not claim it.

## 1. Source identity
- Repository branch `claude/ops-integrated-20261112` (PR #976, draft), worktree `C:\xr-final`.
- Commits added overnight on top of `a0103a278` (build addendum 6): `670a96c50`, `634b29f2a`, `41da08861` and the evidence/report commit that carries this file. The release ZIP is built from the final commit with a clean tree (section 8).
- Model: DeepSeek v4.1 flash 1017 through Zurelay (`https://api.zurelay.com/v1`), effort `high` by default, `max` on a diagnosed stall.
- Staging backend: Cloud Run `xroga-api-universal-staging`, tag `browser-op-1110` on revision `xroga-api-universal-staging-effort-hm9` (image `xroga-api-release:effort-35ca88789`, original allowlist). Production untouched.

## 2. Implemented engineering (generic, no site procedure)
| Change | Where | What it stops |
|---|---|---|
| Dead-spot refusal | `agent/dead-spots.ts`, `agent/loop.ts` | A third click at a canvas point that already did nothing twice on an unchanged page is refused before it is sent, with a reason and other ways in. |
| After-picture for keys on painted pages | `agent/loop.ts` | A key press in a canvas app is compared picture-to-picture, so "nothing changed" is known instead of assumed. |
| Server-refused stops are not challenged | `agent/loop.ts` | When a run ends because the server refused a write (4xx/5xx, row-level security, another tenant), the give-up challenge no longer pushes the model to retry it. |
| Per-page still guard | `agent/guards.ts` (`STILL_NUDGE` 12, `STILL_STOP` 20) | Calls on one page that change nothing there (failed attempts included, focus-only changes not counted as progress, waits excluded) nudge at 12 and end the run at 20 with what was found. |
| No-progress stop | `agent/progress-tracker.ts`, `agent/loop.ts` (`NO_PROGRESS_STALLS` 4) | Four diagnosed dead ends in a row with no change since the first end the run instead of escalating forever. |
| `find` shows matching page text | `browser-control/core/tools/observe.ts` | "0 matches" for a heading or paragraph no longer reads as "not on the page": matching non-control lines are listed without refs. |
| view-source refusal | `agent/loop.ts` | `view-source:` pages (which the extension cannot control) are refused with the reason, instead of a dead end. |
| Skill text inside the untrusted boundary | `agent/well-known-skills.ts`, `agent/online-skills.ts` | A digest-valid but hostile site skill (or online skill) is wrapped with a fresh nonce boundary its text cannot close. |
| Worker start failure cleanup | `extension/run-manager.ts` | A worker that fails to start removes its window and its half-made conversation (candidate cause of the earlier "26 windows for 20 jobs"). |
| Harness | `checks/eval.ts`, `fixtures/autorun.mjs`, `live/eval-each.sh`, timeline fixture | Eval tab in front (background-tab screenshots took ~4 s), Windows build through a shell, stale timeline clip list fixed. |

## 3. Before/after behaviour (real DeepSeek, real Chromium, graded by page or server state)
- **Visual set, matched A/B** (same harness, same 8 tasks, effort `high`): new code 8/8, p50 26.0 s; previous code (`a0103a278`) 7/8, p50 30.7 s. canvas-menu: previous code failed at 20 turns, new code 6 turns. Files `live-model/visual-ab-new-670a96c50-20261122.jsonl`, `visual-ab-old-a0103a278-20261122.jsonl`.
- **Impossible task** (`stall-heading`: "click the big heading until the hidden control appears" on example.com, which now has no heading at all): before, 2 of 2 runs used the whole 300 s (28 turns, 29-36 calls, view-source detour, no answer). After, one run answered honestly in 124 s (18 turns: "this page has no big heading"); the other ran into the harness's 300 s cap one call before the still guard would have ended it (a detour to the linked page restarted the per-page count). Files `stall-heading-before-guard-20261122.jsonl`, `stall-heading-after-guard-20261122.jsonl`. Not yet good enough: the model ignores the nudge, and the backstop costs about 3-5 minutes.
- **Regression after the guard** (real DeepSeek, effort `high`, one run each): 12 of 12 passed, p50 36 s, p95 86 s; the still guard did not stop any legitimate task. File `live-model/regression-after-guard-20261122.jsonl`.

## 4. DeepSeek proof (product chain, not a direct call)
Real extension, enrolled device, staging backend revision with the effort policy, disposable user (deleted). In the stall runs the backend logged 52 turns at `high` and 9 at `max`, in the order `hhhhhhhhhhhhMMMMhhhh…hhhMMMMhhhhhhhMhh`: the extension escalates to `max` when the progress tracker diagnoses a stall and drops back to `high` after four turns; 15,163 reasoning tokens recorded. File `live-model/product-chain-stall-escalation-20261122.json` (Cloud Logging summary, no user content). Earlier: direct effort probes `max`/`high`/`none` each honoured (`product-chain-maxprobe-20261122.json`).

## 5. Donor source reuse
No new donor code was ported overnight; the work was Xroga's own guards. Donor status remains as in `FINAL-ENGINEERING-REPORT-20261122.md` (uiuing/browser-agent, FSB, opensidekick, Tencent/BrowserSkill ported under MIT; workflow-use AGPL rejected for code). The directive's "port 2-4 OSS modules" is NOT DONE in this session.

## 6. Multitasking
Window trace at the ceiling of 12 (earlier tonight): 20 jobs, 20 completed, at most 13 windows, one job per task, no leaks in 3 runs. The worker start-failure path now cleans up its window and conversation. A 1/2/4/8/12/20 benchmark series was not repeated overnight; the earlier table stands (concurrency works to 20, not reliably faster; ceiling 12).

## 7. Tests
| Test | Result |
|---|---|
| Extension unit suite (after the last change) | PASS 1474, skipped 4 |
| Agent unit tests incl. still-guard, dead-spots, hostile-skill, progress tracker | PASS 540 |
| Visual A/B (8 tasks each arm) | new 8/8 PASS, old 7/8 |
| stall-heading after guard (2 runs) | 1 PASS, 1 FAIL (harness 300 s cap) |
| Regression after guard (12 tasks: canvas-menu, timeline-split, three-pages, slow-list, add-rows, 7 replica workflows) | PASS 12/12, p50 36 s, p95 86 s; adv-docs-1 passed but used all 40 turns (206 s) |
| Chaos: restore after accepted write | PASS 5/5 (earlier round) |
| Two tenants on staging backend | PASS 40/40 cross requests refused (earlier round) |
| Hostile digest-valid skill | PASS (unit, boundary cannot be closed by the skill text) |
| Chromium scenario suite (full) | 304/305 PASS; FAIL `I-block-limit` in the full run (314 ms, empty snapshot), PASS when re-run alone; order-dependent flake, cause not analysed (`scenarios-full-20261122d.json`, `scenarios-iblocklimit-rerun-20261122.json`) |
| Real Google Ads / Meta / Shopify / Drive accounts | BLOCKED (owner accounts) |
| Real MV3 service-worker kill mid-turn | NOT RUN |
| Two signed-in owners through real Chrome | NOT RUN (one extension instance per device) |

## 8. Release artifact
Build commit `664f170f8` (working tree clean), ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-664f170f8.zip`, SHA-256 `E348DBCB05E6A7F7F4F94AF663C4FB68E281EFE9629A41F1AA2A928204763E45`, manifest `ARTIFACT-MANIFEST-664f170f8.json` (35 files, staging origins, extension id `ogebkgkppocnjeojdbkiokcpeaenonop`). Upgrade smoke from `05f62baa7` in real Chromium: same id, storage kept, service worker alive, side panel loads. Paired backend: tag `browser-op-1110` on `xroga-api-universal-staging-effort-hm9` (image digest `sha256:352d3124…eb01e`); rollback: retag to `00146-wod`. Staging only; production is not live with any of this. Overnight staging cleanup: disposable user deleted, temporary tag `effort-hm` and revisions `effort-hm7`/`effort-hm8` deleted, main traffic (100% on `00001-tdc`) untouched.

## 9. Owner-required external steps
1. Independent security review and PR #997 re-attestation (blob capture review is a self-review).
2. Production authorisation and the production vision flag; nothing here is live in production.
3. Real advertising, store and drive accounts (or sandbox accounts) for live, non-replica runs; spending, publishing and sending stay behind approval.
4. A signed-in run in the owner's own Chrome profiles ("Evander Throne", "M. Muhammad Abdullah"); not used overnight.

## 10. Remaining highest-severity defects
1. The model keeps trying on impossible tasks and ignores the nudge; the hard stop ends it after about 20 still calls (3-5 minutes). A cheaper early conclusion (a forced "report what you found" turn after the nudge) is the next step.
2. Per-page counts restart when the run detours to another page and back, so an impossible task can run longer than the guard intends.
3. TraceDraw and painted-menu seed 4 were not re-run overnight; timeline-split passes in the matched A/B but has failed in earlier hard sets.
4. No real third-party account was exercised; advanced workflows are proven on stateful replicas only.
5. No new donor modules ported overnight.
6. Excess turns on the document workflow: adv-docs-1 reached the correct server state but used all 40 turns (206 s); the cause was not analysed overnight.

## Round 7 (2026-11-22 morning): what was fixed after the report above
- **Still guard, second pass.** Counts are kept per page since the last real change, so a detour to another page and back no longer restarts them; at 16 calls a second, firmer reminder says the next call must be `done`. Unit tests added. Impossible-task runs after this change: 2 of 2 answered honestly (181 s and 150 s; before: 300 s cap with no answer).
- **The 40-turn documents run was a fixture bug, not an agent bug.** The test drive's server never listed documents the agent created, so the agent could not confirm its own save and kept investigating. Fixed in `fixtures/replica.mjs`. Documents runs after the fix: 4 of 5 passed in 19-23 turns (81-134 s); the fifth failed only because the grader demanded the first sentence of a document although the task allows any exact sentence, so the grader now accepts any sentence of each document (`eval-tasks.ts`). Files `live-model/stall-and-docs-round6-20261122.jsonl`, `adv-docs-after-fixture-fix-20261122.jsonl`. The saved eval record now keeps up to 20,000 characters of server state (it was cut at 2,500, which hid this).
- **`I-block-limit` flake.** The scenario took its first outline before the embedded frame attached; it now waits one second first. Full Chromium scenario suite after the change: 306 of 306 PASS (`scenarios-full-20261122e.json`).
- **Donor port: `enabled` postcondition** (uiuing/browser-agent @ a8517e2c, MIT, the element_state gap listed in `OSS-REUSE-LEDGER.md`): `expect: { enabled: true|false }` on a target, with the page's reading in the failure message. Unit tests plus Chromium scenario `S3-expect-enabled` (a button that locks after sending: met; one that stays enabled: unmet "the target is enabled"). `attribute_equals` is not ported (needs a new probe operation).
- Extension unit suite: 1477 passed, 4 skipped.
- Remaining: items 1 and 3-5 under section 10 stand (impossible tasks still take 2.5-3 minutes; TraceDraw and painted-menu seed 4 not re-run; no real third-party account; only one donor port this round).


**Release after round 7.** Build commit `6649442dd` (working tree clean), ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-6649442dd.zip`, SHA-256 `607623AF72693D3F6BF9E8F5570CB29C69852A3D91CEFF8E477ED6650E48BF90`, manifest `ARTIFACT-MANIFEST-6649442dd.json`. Upgrade smoke from the `664f170f8` ZIP in real Chromium: same id, storage kept, service worker alive, side panel loads. The backend is unchanged (tag `browser-op-1110` on `effort-hm9`; rollback `00146-wod`). Staging only; production not live with any of this.

## Round 8 (2026-11-22 midday)
- **Second donor port: `attribute` postcondition** (uiuing/browser-agent attribute_equals, MIT): `expect: { attribute: "aria-expanded=true" }` reads the target's attribute through a new probe operation, never reads `value` (use `value`), and masks the reading for sensitive fields. Unit test and Chromium scenario `S3-expect-attribute`. Both gaps the ledger listed for that donor are now closed. The compact tool catalogue grew by about 200 characters; its size test limit moved from 0.865 to 0.875 of the original and says why.
- **Visual set again (real DeepSeek, effort `high`, 8 runs):** 7 of 8 passed, p50 33 s: painted-menu 1, 2, 3 and 4 (one of two) passed, timeline-split 2 of 2, canvas-menu passed (3 turns, 13 s). The one failure was painted-menu seed 4 (22 turns): the model mis-read which painted label was Tools, clicked the wrong labels, and then honestly reported failure and corrected its own earlier wrong claims. Painted-menu seed 4 therefore remains intermittent (a vision reading miss; 1 pass, 1 fail this round). File `live-model/visual-round7-20261122.jsonl`.
- **Workers on the new build:** 8 pages, real DeepSeek: parallel 185 s, 8 of 8 codes, 3 workers active at once; single agent 170 s, 8 of 8 (`live-model/parallel-real-8pages-round7-20261122.json`). Same conclusion as before: correct, not faster.
- Chromium scenarios 307 of 307 PASS (`scenarios-full-20261122f.json`); extension unit suite 1478 passed, 4 skipped.


**Release after round 8.** Build commit `9d57e0c71` (working tree clean), ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-9d57e0c71.zip`, SHA-256 `19B4C554383645A0E181CF9CE15D04277EE593F8622EA959303C635C247A6652`, manifest `ARTIFACT-MANIFEST-9d57e0c71.json`. Upgrade smoke from the `6649442dd` ZIP in real Chromium: same id, storage kept, service worker alive, side panel loads. Backend unchanged (tag `browser-op-1110` on `effort-hm9`; rollback `00146-wod`). Staging only; production not live with any of this.

## Round 9 (2026-11-22 afternoon): features taken from the Codex browser recordings
Source of the ideas: the owner's two screen recordings of the Codex desktop browser agent drafting 50 + 50 emails (see the memory note; frames sampled every 5 s). Replica results only: the test webmail is `fixtures/pages/apps/adv-mail.html` (a replica with the quirks seen in the recordings: paragraph breaks squeezed unless a box is ticked, a draft that is only autosaved is lost when the editor closes, a Delete button over a row's middle on hover, the same recipient saved twice makes two drafts). The server's state is the grade.

- **Batch list with verified-only counts** (`agent/task-plan.ts`, `agent/loop.ts`): `plan` gained `items` and `mark`. Items are short unique names (duplicates refused); `saved` records the page-load count; `verified` is refused unless the item was saved, a page has loaded since (reload or reopen), and `check {text}` is visible on the page now. `done` with outcome success is refused while an item is not verified (twice, then the run ends as partial with the counts appended). The list is stored in the plan snapshot, so a restarted run reads it and continues without repeating items. 8 unit tests plus 4 loop tests. **Not adopted by the model in any live run**: in 11 webmail runs DeepSeek used milestones but never `items` or `mark`, so the live benefit is unproven; it is tested at unit level only.
- **Reload-persistence check**: delivered as the load-gated `verified` rule above, not as an automatic reload after a save (an automatic reload would drop an open editor and is meaningless in many apps).
- **Hover-revealed controls** (`core/tools/act.ts`, `core/interaction/actionability.ts`): for a row, card or clickable block, the pointer hovers first and, when a separate control (a row's Delete or Archive button) now covers the click point, or the pointer already rests there and the click was about to be refused, the click goes to another point of the element clear of it and the result says so. Chromium scenario `S3-click-clear-of-hover-controls` (row opens, nothing deleted). Not exercised in a live-model run (the model reopened drafts by ref and was never blocked).
- **Repeated sequences become one batch** (`agent/repeat-detector.ts`, wired in `agent/loop.ts`; prompt line): when the same 2-6 step sequence has been done three times, one advisory says the rest can go in one `batch`. `batch` steps can carry `keep: true` so reads in the middle return their text (cut to 1,500 characters each, 9,000 in all), which lets ten items be checked in one call. 4 + 3 unit tests.
- **Harness finding (important):** the eval harness never offered the `batch` tool, although the product does (`checks/eval.ts`: only `plan` was added). Every earlier eval therefore measured the model without batch. It is now offered by default (`batch:false` restores the old setting). Earlier cross-round comparisons in this report are between like-for-like runs, but they underused batch.
- **Webmail results (real DeepSeek, effort `high`, graded by server state: right recipients, subjects, bodies with both paragraphs separated, exactly one draft each, nothing sent):**

| Task | `batch` not offered | `batch` offered |
|---|---|---|
| 4 drafts | 3/3 pass; 28-32 turns, 139-200 s | 3/3 pass; 12 / 37 / 19 turns, 67 / 284 / 97 s |
| 10 drafts | 2 runs: 1 pass (53 turns, 300 s cap), 1 fail at the 300 s cap (49 turns) | 4/4 pass; 33-42 turns, 257-300 s (one at the cap) |

In the 10-draft runs the model created nine drafts in one batch call by itself; the time then went into verifying each draft with a separate batch per draft and into many `plan` updates (up to 18 in one run). `keep: true` was used in 2 of 4 of the later runs. The repeat advisory itself never fired in those runs because the model had already switched to batch; it is unit-tested only. Variance is large (the 4-draft task took 67 s once and 284 s once); n is small.
- Chromium scenarios 308 of 308 PASS (`scenarios-full-20261122g.json`); extension unit suite 1493 passed, 4 skipped.
- **Remaining against the recordings:** a live run that uses `items`/`mark`; a real MV3 interruption in the middle of a batch job (only the stored-state restore is tested); verifying many items in one call is possible but the model does not choose it reliably; the competitor's source and speed on the same task were not measured (only its recording was viewed).


**Release after round 9.** Build commit `50c8965b8` (working tree clean), ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-50c8965b8.zip`, SHA-256 `E7EF7706E2445E4F706EC447C263C9D2E1051B6DF27F2BFBCFB7A4C78BC2B02D`, manifest `ARTIFACT-MANIFEST-50c8965b8.json`. Upgrade smoke from the `9d57e0c71` ZIP in real Chromium: same id, storage kept, service worker alive, side panel loads. Backend unchanged (tag `browser-op-1110` on `effort-hm9`; rollback `00146-wod`). Staging only; production not live with any of this.

## Round 10 (2026-11-22 evening): the owner's video directives and the semantic-locator lesson
Source: the video-based directive, the second-video addendum and the owner's four clarifications. Evidence labels: `UNIT_ONLY`, `CONTROLLED` (real Chromium, test pages), `LIVE_DEEPSEEK_CHROME` (real DeepSeek on replica pages). No real third-party account was used.

**What the directives say that Xroga already does (checked against the code, not assumed):** the extension operates the user's existing logged-in Chrome tabs through `chrome.debugger`; no plugin, connector, MCP server or skill is needed for any run in this report (every replica task above ran with no site skill and no connector); `snapshot`, `find` and `click` work from the live accessibility tree and DOM (roles, names, states, refs, frames, shadow roots); a click is checked for visibility, stability and what receives it before it is sent; consequential actions (payments, sending, publishing, deletion) go through the approval gate. Skills and connectors stay optional.

**What was added in this round (code, with tests):**
- **A role or name that matches nothing now returns what is really there, at once** (`core/interaction/resolve.ts`, `nearMisses`). The second recording shows a competitor waiting out a timeout for a heading "Drafts" while the page had a "Drafts" link. Xroga's semantic lookup was already immediate (no wait), but its error said only "No element matches"; it now lists up to six nearest controls with usable refs (same name under another role first, then names that contain it, so "Drafts" finds the link "Drafts 4"). Chromium scenario `S3-role-mismatch-names-the-real-control` (CONTROLLED): the miss is answered in 15 ms naming `[a2] link «Drafts 4»`, and that ref opens the folder. 4 unit tests.
- **A ref the page replaced now names its replacement** (`resolve.ts`, `tools/act.ts` `withTarget`): a re-render that removes the button a ref pointed at is still refused (nothing is clicked on a guess, because another record may now sit there), but the error lists the matching controls now in the page with refs that can be used immediately. Scenario `S3-replaced-ref-names-the-new-one` (CONTROLLED): old ref refused, new Save named, its ref saves. I deliberately did not make Xroga silently re-aim a stale ref at the new node: the directive forbids stale input reaching another record, and the existing row-context checks exist for exactly that case.
- Chromium scenarios and unit suite: see the release paragraph below.

**Directive items NOT done in this round (stated plainly):**
- One action id carried through model, backend, side panel and cursor with ordered events and leases: not built. Today the call id is shared by the loop, the receipts and the side-panel rows, but there is no separate action/step/goal id, no sequence numbering across layers, and the visible-cursor/panel/backend divergence cases in the directive (queued click vs tab switch, late receipt after a later action) were not tested.
- A typed `PageControlMap` with generations, tiers L0-L3 and a capability manifest (`CapabilityDiscovery`): not built; the existing observation (refs, epochs per document, diffs) already covers most of its content, but no new tiered observer or manifest was written.
- Real MV3 service-worker kill after a server-accepted write, 20-worker lease anomaly, iframe Blob, provider 429 recovery, TraceDraw on the real app, Canva/Higgsfield/Ads/Meta/Shopify/Drive on real accounts: not run (no authorised accounts or not reached).
- A live DeepSeek run that exercises the new role-mismatch message: not run (the model picks refs from snapshots, so it rarely asks for a role that is absent); the behaviour is controlled-test evidence only.

