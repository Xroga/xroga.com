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
