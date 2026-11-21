# Browser Operator, handover v7 (overnight session, 2026-11-21)

| | |
|---|---|
| Branch / build commit | `claude/ops-integrated-20261112` (draft PR #976) / `23a9b4f59`, tree clean at build |
| ZIP | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-23a9b4f59.zip`, SHA-256 `F47F9B1F1F7854D2242D6E51370DDDBE499CB51100464C569F5C200523E38525`, manifest `ARTIFACT-MANIFEST-23a9b4f59.json` (35 files) |
| Backend | unchanged: staging `xroga-api-universal-staging-00146-wod`, tag `browser-op-1110`, image `sha256:19a547eb…59605b`, vision flag 1 |
| Upgrade | from 9e366783c: same id, storage kept, worker alive, side panel loads (real Chromium) |
| Unit suite | 1424 passed, 4 skipped; typecheck clean |
| Note | the machine slept from about 04:00 to 13:46; one benchmark row from that window is a sleep artefact and is excluded |

## Changes (code, tests, highest verification level)
| Change | Files | Evidence level | Result |
|---|---|---|---|
| Canvas actions return a fresh screenshot with the coordinate grid (no separate screenshot turn; clears evidence debt) | `agent/loop.ts` | LIVE DEEPSEEK + REAL CHROMIUM (eval) | painted menus: median turns 7 → 4 (seeds 1-3) |
| `screenshot region:[x0,y0,x1,y1]`: enlarged crop, grid labelled in whole-page fractions | `browser-control/core/tools/observe.ts`, `labels.ts`, `host/page-port.ts`, schema | LIVE (model used it unprompted on seed 4) | aids aiming; did not solve seed 4 |
| After a no-change canvas click: enlarged crop around the click with a red crosshair and fine grid (`screenshot mark`, `region`) | `agent/loop.ts`, `labels.ts`, schema | LIVE (eval) | seed 4 improved from 0/2 to 1/3 (not solved) |
| Canvas no-change detection: identical after-images mean the click hit nothing; three in a row force a different method | `agent/loop.ts` | LIVE (eval) | removes the 16-identical-clicks loop seen on seed 4; seed 4 still fails (see below) |
| Human-control guard v2: every frame's probe records trusted input; every dispatched input is logged in `sendRaw`; unexplained input is the person's (no time window) | `host/cdp-session.ts`, `probe/source.ts`, `core/human-guard.ts`, `core/controller.ts` | CHROME FIXTURE | HUM-1 (top frame) and HUM-2 (person typing in an iframe; agent's own back-to-back clicks not delayed) pass 2/2 |
| Cross-app file transfer: `confirm_download keep:true` re-reads the finished download (https, data:, loopback only; never blob:/file:), checks size, stores it as a task attachment with SHA-256 for `upload` | `agent/confirm-download.ts`, `extension/run-manager.ts` | CHROME FIXTURE | XFER-1: download verified → kept → uploaded → destination holds the exact bytes, one file; 2/2 |
| Policy reconciliation: founder-approved scope replaces first-release exclusions; invariant 12 (person first); no-ceilings rule; layer invariants unchanged | `apps/xroga-browser-extension/AGENTS.md` | review | — |
| DeepSeek feature matrix (official / Zurelay / Xroga / live test / remediation) | `DEEPSEEK-V4-1-FLASH-STUDY-20261120.md` | DOC + PROBE | — |
| Eval tooling: per-run phase timings, painted-menu fixture (shuffled, nothing in the DOM), `live/eval-each.sh` (one autorun per task) | `background/checks/eval*.ts`, `fixtures/pages/painted-menus.html` | — | found that layer time on background tabs and the model's misreads, not the provider, dominated |

## Measured (real Chromium, real extension loop and layer, real DeepSeek v4.1 flash, vision on, reasoning none)
- Painted menus, before (1 run per seed): 4/4, turns 12/6/6/8.
- After the after-image (2 runs per seed): 7/8, seeds 1-3 turns 4/4/10/5/4/4; seed 4 one timeout, one 17 turns.
- After no-change detection (excluding the sleep row): seed 4 0/2 (6 and 25 turns), seed 1 12 turns, seed 3 4 turns. **Seed 4 is an open, reproducible defect:** Tools is at x 0.129-0.163 there; the model first clicks it correctly, then aims the dropdown item at the wrong x (0.58) and afterwards keeps aiming at x 0.566. The fixture is `painted-menus.html?seed=4` with task `painted-menu-4`.
- Regression, 10 mixed tasks (reads, form fills with shuffled fields, slow list, three-page task, injection, payment hand-over, painted menu), one run each, at commit 51ecb54a2/6c8850f23: **10/10**, wall time p50 19.5 s, p95 67.3 s, model turns p50 4, p95 11 (`live-model/regression-20261121.jsonl`). The later crosshair change touches only the no-change canvas path; its own run: painted-menu seeds 1-3 3/3 (6, 4, 4 turns), seed 4 1/3.
- Layer timings in the eval: background-tab screenshot ~0.7-1.7 s, canvas click ~0.4 s; model ~4.5-7 s per turn with images.

## Not done (exact)
- ENGINEERING: painted-menu grounding on seed 4 (above); TraceDraw product-chain completion not re-run after these changes; signed-in owner Chrome run; parallel workers with real DeepSeek not re-measured (last measurement used the fixture model: 3 workers ≈ 1 worker wall time); reasoning escalation not built (no measured gain); streaming model calls not adopted.
- ACCOUNT/PROVIDER: Google Ads / Meta / Shopify / Drive real-account workflows (need disposable accounts and connections); SkillsHub HTTP 402.
- SECURITY/RELEASE: independent security review, PR #997 re-attestation, production vision flag confirmation, production authorisation.

## Install, upgrade, rollback
Unzip, `chrome://extensions`, Developer mode, Load unpacked (same extension id; storage persists). Rollback: unzip the `9e366783c` ZIP over the same folder and reload. No backend change in this session; no staging tags, users or revisions were created this session.

## Addendum (same day): product-chain findings after v7
Disposable staging user and a no-traffic tag copy of the browser-op revision were used and then removed (tag, copy revisions, user deleted; allowlist back to three ids).
- **Why a 1-2 minute drawing task takes minutes in the product chain.** Measured: backend logs show the provider takes 3-8 s per turn (median ~5.4 s, ~21k input tokens with a screenshot); layer actions are fast when the page tab is in front (screenshot 0.43 s, click 0.4 s) but a screenshot of a tab that is NOT in front took ~3.9 s in the same product chain (426 ms vs 4006 ms measured). A TraceDraw turn still averaged ~14 s in the product (13-19 turns in 205 s): ~7 s provider, the rest extension/network time not yet attributed (the product keeps its phase timings only when a run finishes, and TraceDraw never finished). Simple product tasks finish in 11-14 s (2 turns).
- **TraceDraw product run, 3 attempts after the changes: not completed** within the 205-330 s window each time (13-19 turns): new document created, then the model reaches the wrong menu (Image, Window, Effects) and loops on Tools. Open.
- **Painted-menu seed 4 (fixture), with the dropdown-alignment hint:** 2 of 4 (13 and 14 turns, two 270 s timeouts). Improved from 0 of 2, not solved.
- **Added this round:** same-purpose-repeated detection for canvas aiming (four of the last six canvas actions share their purpose → one note to change the way in: shortcut, command search, console, keyboard menu), clearer menu_path advice (does not work for canvas-painted menus), a dropdown-alignment hint, the real-model harness now keeps the page tab in front and reports the run's phase timings when a run finishes.
- **SkillsHub** still returns HTTP 402 (checked again today).

## Final artifact for this addendum
Build commit `ffc5d68cc`, ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-ffc5d68cc.zip`, SHA-256 `1C45D7DA1C53AE859C43B7C71A1C1335E49DB06132752D41A201F65F52408CBC`, manifest `ARTIFACT-MANIFEST-ffc5d68cc.json`; upgrade from 23a9b4f59 passes (same id, storage kept, worker alive, side panel loads); 1424 unit tests pass. Rollback: the 23a9b4f59 ZIP. This supersedes the 23a9b4f59 ZIP named in the table above.

## Set-of-marks (final change of this session)
`screenshot marks:true` numbers the labels, icons and controls a screenshot shows (edge map, long rules removed, letters merged into words, connected components, reading order; plain image analysis in the extension, no model, no page code); `canvas mark:N` / `toMark:N` act on the centre of mark N. After every canvas pointer action the numbered picture comes back with the result. Files: `browser-control/core/tools/marks.ts` (+ unit tests), `observe.ts`, `canvas.ts`, `schemas.ts`, `agent/loop.ts`, `agent/prompt.ts`.
- Real Chromium scenario MARKS-1: in 4 shuffled painted layouts a mark opens Tools and a dropdown mark opens the Scripts panel (4/4). On a real painted application (TraceDraw welcome screen) the marks fall on the words (picture inspected).
- Real DeepSeek on the generated painted editor (reasoning off, vision on): seed 4 now 2 of 3 (4 and 7 turns; it was 0 of 2 and 13+ turns before), seeds 1 and 2 pass in 6-7 turns, seed 3 one failure and one pass in 3 and 9 turns, canvas-menu 3 turns, timeline split 18 turns (pass).
- TraceDraw through the product chain, with marks, run to a 460 s window: **still not completed** (47 turns). The model reads some marks wrongly in the dense real editor ("hit the Hints toggle, not Window"), then switches to the script console. The editor itself also loads slowly in a test browser (39 MB; 61-80% after 22 s). Open.
- Staging cleanup after the product runs: tag, temporary revisions and the throwaway user removed again; allowlist back to three ids.

## Final artifact (supersedes the ZIPs named above)
Build commit `24a5d5c00`, ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-24a5d5c00.zip`, SHA-256 `1C46F34D16E7315C9E0680AEF56E8FEB894E32C753ED87437B30DD32D4A85479`, manifest `ARTIFACT-MANIFEST-24a5d5c00.json`. Upgrade from ffc5d68cc passes (same id, storage kept, worker alive, side panel loads); 1429 unit tests pass. Rollback: the ffc5d68cc ZIP.
