# Xroga Browser Operator — completion report for this pass (10 Nov 2026)

**Read this first.** This pass delivered two things with real-browser evidence: a persistent on-page agent pointer, and a latency measurement with two measured fixes. It did **not** reach the full directive. Live DeepSeek and ledger acceptance, a real signed-in profile, the broad capability work, the side-panel polish and any release are **not done**. Every statement below carries its status.

## Source and identities

| Item | Value | Status |
| --- | --- | --- |
| My branch / draft PR | `claude/ops-browser-operator-20261110`, [#960](https://github.com/Xroga/xroga.com/pull/960), head `cc2ad7cde5d9faa380f7f99c70f20fbbfbf3d74f` (code commit `0056b3084`, then a register-regeneration commit; stacked on #942) | VERIFIED (remote head equals local) |
| Base (Codex, untouched) | #942 `e4c3ecc9f19c6a04636d6de1ebd68db07a8d306e`; #943 `c59b751bac797a62bd9421ec0da3357c5bbc74f9`; #951 (native OpenUI) `ad2d1c6f05…` not touched | VERIFIED (heads re-read before starting) |
| Built extension | `Xroga Browser Automation` manifest version `0.2.8`, MV3, from my head | VERIFIED (`dist/manifest.json`) |
| Extension ID tested | The ID Chrome assigned when loading the unpacked build into an isolated profile (Chrome for Testing **151.0.7922.34**). The real staging/production extension ID was **not** installed or verified | NOT TESTED |
| Backend / Workspace / production | Not changed. `XROGA_LOCAL_BROWSER_ENABLED` not set. Serving identities not touched | VERIFIED (nothing deployed) |

## Phase results

### Phase 1 — one real connected workflow (real account, real DeepSeek, canonical ledger): **BLOCKED / NOT TESTED**
This needs a signed-in Xroga account in a Chrome profile with the exact extension ID installed, the backend flag enabled, and a specific spending approval (the repo's own doc sets a $0.036 read-only cap). None of those is available to me without the owner. Every run in this report used the **deterministic model fixture**: `"model":"deterministic fixture","liveModelCalls":0,"costMicros":0`. No provider request ID, token count or ledger settlement exists for this pass. Do not read any result here as paid-provider acceptance.

### Phase 2 — persistent visible Xroga pointer: **VERIFIED in real Chrome; PARTIAL on edge cases**
What changed (`src/extension/border.ts`, `run-manager.ts`): the pointer lives in the same isolated overlay as the glow (one element per page, closed shadow root, inert, aria-hidden, pointer-events none, topmost). It stays for as long as the run works, sits at the **last verified action coordinate**, and shows a short status taken from real run events: *Waiting for response* from turn start, *Planning next step* only once the model streams text, the tool in use (*Clicking*, *Typing*, *Scrolling*, *Opening page*, …), *Analyzing page* after a tool. It was previously drawn for 1.6 s and then removed.

Evidence:
- `tests/chrome-extension/pointer.mjs` against the shipped page function in real Chrome: **19 of 19** checks — neutral anchored status with no invented coordinates; pointer at the verified point; **still visible, same point, same status after a 10-second model wait**; hides for a capture and returns immediately at the same point and status; label flips inside the viewport at the corner; an out-of-page point is clamped; clicks and typing pass through to the real page; no layout change; reduced motion removes the glide; idle cost **18.6 ms of main-thread time in 5 s**; 20 moves cost 204 ms over 10 s; exactly one overlay element for the whole run; removed on stop, when the extension id disappears, and on back-forward-cache entry.
- The **real extension** run (`operator.mjs`, Chrome 151) now asserts the pointer in the page: `pointerStaysThroughModelWait: true` (neutral, *Waiting for response*, after 2.5 s with the model held and nothing clicked yet), `pointerRestsAtLastActionDuringWait: true` (point mode after real clicks), and removal on **Stop** and on **Pause**. This run found and fixed a wrong label (the loop emits `message_start` as the request leaves, so the pointer said *Planning* during the wait).
- 24 unit tests for the per-tab state: stale coordinates dropped on a new document, nothing painted for other conversations or when the Settings switch is off, state forgotten when a run stops, restore after a screenshot.

Not verified (PARTIAL / NOT TESTED): pointer placement inside nested or cross-origin iframes (it lives in the top frame; I did not test iframe coordinate mapping); restricted pages (`chrome://`, the Web Store) where injection is not allowed (the existing code swallows the failure; the side panel does not yet say so); a hidden tab (the overlay exists but nothing paints); multi-window; side-panel or Workspace display of the pointer status (the status is page-local, not synced); a screen recording of the pointer (not captured).

### Phase 3 — latency: **VERIFIED measurement; target NOT met**
Method: the same simple task (open a catalog, click through, read the price, `done`; 5 model turns) repeated **12 times per session, 3 sessions each for the original code (`e4c3ecc9`) and my build, interleaved** so machine drift hits both equally; timed from the Playwright side (submit to the Workspace seeing `finished`); per-phase times from a new local recorder (`src/agent/timing.ts`, a bounded ring in extension storage, no page text/URL/account data, nothing sent anywhere). Same machine, real Chrome 151, real extension.

| | baseline `e4c3ecc9` (n=33 warm) | this build (n=33 warm) | change |
| --- | --- | --- | --- |
| median | 2,256 ms | 1,727 ms | **−23%** |
| p95 | 3,690 ms | 2,790 ms | **−24%** |
| pointer/status visible after submit | not available | p50 **236 ms**, p95 365 ms | meets the ~1 s goal |

What the measurement showed and what I changed:
- A navigating click spent ~934 ms (first measurement on the intermediate build, which still had the original settle): it waited for Chrome's `networkIdle`, which needs **500 ms of silence**. A navigation is now ready once the document has **loaded, no tracked request is in flight, and 250 ms have passed** (`networkIdle` still ends the wait if it comes first; the 5 s cap is unchanged). Click now **≈ 539 ms**.
- Every screenshot paid a **150–200 ms overlay fade**. The overlay now hides at once and resolves after two frames. Screenshot **346 → 149 ms**.
- Remaining per-run time (this build, p50): tool batch 746 ms (click 539, screenshot 149, others < 15), model bridge 421 ms over 5 turns, request preparation 134 ms; permission gate, journal write and result recording each < 50 ms.

Honest limits: the **model is a fixture**, so these numbers are local overhead only. Real DeepSeek latency (the dominant cost in real use) and the number of model turns per task were **not measured**. The 30 percent goal is **not reached** (−23%). A quiet-window readiness can miss a request that starts more than 250 ms after the last network activity; a later observation or the `wait` tool still sees it, but I have not measured the wrong-action or extra-turn rate on real dynamic sites. Treat the faster settle as **PARTIAL until checked on real sites**. The short-task fast path (reusing the current tab, small tool schema, skipping planning rounds) was **not implemented beyond these two changes**.

### Phase 4 — broad cross-domain capability: **NOT DONE in this pass**
No new reusable browser skills, iframe or shadow-DOM work, or file-guided flows were added. Existing capabilities were only **re-verified by the existing harness** (side-panel and Workspace entry, approved form submission, 55,479-character workbook with a delayed dynamic page, document read of `Orders!A602:B602`, voice dictation fixture). The model profile is still `vision:false`; nothing claims screenshot perception.

### Phases 5–6 — one run, safe automation, recovery: **re-verified, not extended**
Existing PR #942 behaviors passed again in real Chrome with my changes in place: pause then resume the same server run without replaying a billed turn, worker restart and re-pair, account boundary, uncertain-write protection, result saved locally before sync, Workspace refresh restoring the saved click once, sign-out clearing activity (`resumedWithoutReplay`, `restartAndAccountBoundary`, `manualPauseAndResume`, `workspaceReceiptRestoreAndSignOut` all true). I added no new recovery features. Page-reload and service-worker-termination behavior of the **pointer** itself is covered by the lifecycle design (no persistent worker state; overlay re-sent on commit and removed on pagehide) and unit tests, not by a dedicated kill-the-worker pointer test.

### Phase 7 — side panel and Workspace polish: **NOT DONE**
The side panel and `WorkspaceBrowserOperator` were not changed. The pointer status is not synchronized into the Workspace timeline. Codex's PR #951 was not touched.

### Phase 8 — acceptance matrix: **PARTIAL (fixtures only)**
Simple (open, click, read, filter-style) and a medium document-plus-dynamic-page flow ran in real Chrome against fixtures. **NOT TESTED / BLOCKED:** Google Cloud Console / Cloud Run, Meta Ads Manager, client discovery, real multi-site research, and security cases with a real wrong account or injected website text (the existing fixture covers an account mismatch). They need authorized disposable accounts and, for spending, owner approval.

### Phase 9 — release: **NOT PERFORMED**
CI on #960 is green (above). No backend flag, extension publication, Workspace change or production activation. Rollback is trivial for this pass: the branch is stacked on #942 and nothing is deployed.

## Test and CI summary

| Check | Result |
| --- | --- |
| Extension unit suite | **854 passed, 4 skipped** (same four provider tests as before), 76 files |
| `tsc --noEmit`, `eslint src` | clean |
| `operator.mjs` full harness (real extension, Chrome 151, fixture model) | **PASS** (approved submission, cancelled pending turn, voice fixture, pointer cues on click and input, pointer through waits, resume without replay, restart and account boundary, manual pause/resume, Workspace restore and sign-out) |
| `operator.mjs --document-only` | **PASS** (workbook 55,479 chars, delayed dynamic page, correct cell) |
| `pointer.mjs` | **19 of 19** |
| GitHub CI on #960 head `cc2ad7cd` | **All 6 checks passed** (`unit`, `integrated-candidate`, `deterministic-golden`, `disposable-policy-database`, `structured-mission-policy`, Vercel notice). The first run on `0056b3084` failed `unit` with *Inventory drift: docs/xroga/current-state.json*: the repo's source-hash registers cover the extension files; I regenerated them from a line-ending-clean export, the five governance checks and the 49 CI fixture tests passed locally, and the re-run is green. |

Raw samples, per-run phase ring and logs: `docs/xroga/evidence/browser-operator-20261110/` (not committed yet; see "Open items").

## Defects found and fixed during the work
1. Wrong pointer status during a model wait (real run) — fixed (`message_start` ≠ answering).
2. The old harness asserted a transient marker element; replaced by assertions on the persistent pointer.
3. Two heavy "16k window" tests time out at 5 s when 76 workers run in parallel on this machine; they pass alone and with `--maxWorkers=4`. Environmental, not changed.

## Environment notes (for whoever reproduces this)
- `@swc/core` refuses to start while `%LOCALAPPDATA%` carries an AppContainer ACL entry; setting `SWC_NATIVE_BINDING_CACHE` to a folder under the user profile works. I did not change any system permission.
- Branded Chrome 156 cannot side-load extensions; use the cached Chrome for Testing 151.
- The harness needs the repo's root dependencies; I linked the existing install with directory junctions (remove with `rmdir`, never recursive delete).
- The branch name starts with `claude/ops-` so the repo's Vercel rule does not auto-deploy it. A Vercel preview on #960 was cancelled by the ignored-build step (one deployment counted).

## Open items and cleanup (per the storage rule)
- Scratch to remove when done: worktree `C:\xr-browser-base` (original code, A/B baseline), `C:\xr-browser-run` (logs; profiles already deleted by the harness), `C:\xr-browser-cache`, `C:\Users\hp\.xr-swc-cache`, the junctions under `C:\xr-browser\node_modules`, `C:\xr-browser\frontend\node_modules`, `C:\xr-browser\backend\node_modules`, and three scratch scripts `evidence-*.py` at the worktree root (untracked). Free space on `C:` read 71 GB before and after (df rounding); no change of 512 MiB or more was observed.
- Decide whether to commit the evidence folder to the repo (it adds files under `docs/xroga/`, which this repo's governance checks may bind).
- Next work, in order of value: (1) one authorized live run with a real signed-in profile and the exact extension ID, to produce provider and ledger receipts; (2) measure real model latency and turns per task, then reduce turns (tool-schema selection, smaller observations) — that is where most real time is; (3) check the faster settle on real dynamic sites; (4) pointer placement in iframes and a restricted-page notice in the side panel; (5) sync the pointer status into the Workspace timeline.
