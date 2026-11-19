# Browser Operator: implementation and verification matrix (2026-11-20)

Branch `claude/ops-integrated-20261112` (draft PR #976). Levels: IMPLEMENTED, UNIT, CHROME FIXTURE (real Chromium through `fixtures/autorun.mjs`),
DEEPSEEK STAGING (real extension + staging DeepSeek route), REAL THIRD-PARTY, NOT DONE, BLOCKED. A higher level does not imply the lower ones for a
different capability. "Evidence" names a file or test, not a claim.

## 1. Execution primitives (site independent)

| Capability | Implemented | Unit | Chrome fixture | DeepSeek staging | Real third party | Notes |
|---|---|---|---|---|---|---|
| DOM / accessibility actions, forms, tables | yes | yes | existing scenario sets in `src/background/scenarios` | earlier live runs (Notion, Sheets, lead hunt) | yes (earlier handover) | unchanged this stretch |
| Cross-origin frames, shadow DOM | yes | yes | existing fixtures (`d-deep`, `c-frame-target`, 3 loopback sites) | not re-run | not run | |
| Canvas pointer, drag, hover, type, key (`canvas` tool) | yes | `canvas.test.ts` | CV-1, CV-2, CV-3 pass | TraceDraw trial 1 | TraceDraw (one app) | CV-3 proves state, not receipt, exposes a wrong menu |
| Painted-editor text replace (no splice into example text) | yes | yes | CV-2 | TraceDraw trial 1 | one app | generic: `replace: true` selects all first |
| Painted-input delivery guard (retry after refusal, key by tab + full text) | yes (PR #1001) | `painted-input-delivery.test.ts` | not separate | indirectly | | |
| Tab ownership / adoption of a user-named tab | yes | `tabs-adopt.test.ts`, `tab-intent.test.ts` | not in a fixture | TraceDraw trial 1 | | |
| Visual grounding (DeepSeek reads a bound-tab screenshot) | yes | `pixels*.test.ts` | | probe + TraceDraw | | vision flag gated server side |
| Downloads and exports | yes (`confirm_download`) | yes | download endpoint in fixture server | TraceDraw SVG export verified by file | | |
| Uploads, attachments | yes | yes | | earlier live (photo, PDF) | yes (earlier) | |
| Deterministic multi-action runner | yes: `batch-plan.ts`, `command-surface.ts` (+ `command-surface-adapter.ts`) | 22 tests | not run in Chromium | **not yet selected by the model live** | | see section 3 |
| Code-owned progress fingerprints and strategy switching | yes: `progress-tracker.ts` | yes | | not yet observed live | | replaces prompt warnings as primary control |
| Evidence-based strategy choice | yes: `strategy-selector.ts`, wired at the first outline | 11 tests (layout shuffles, noise, no-vision) | | not yet observed live | | scores are design estimates, not measurements |
| Resumable / interrupted runs | existing (`sw-kill*` fixtures) | | existing fixtures | | | not re-run this stretch |
| Timeline-based media editor | NOT DONE | | NOT DONE | | NOT DONE | no fixture, no provider decision |
| Slow network, unexpected overlay, stale refs variations | partly (existing fixtures) | | NOT DONE as generated variations | | | next engineering item |

## 2. Findings this stretch

* The first TraceDraw trial (4 minutes, verifier pass) did not call `run_script_console`. Cause: the `app-script-console` playbook in the system prompt
  prescribed the manual canvas procedure step by step, so a generic tool offered beside it was never the better-looking choice. Fix: the playbook now
  tells the model to use `run_script_console` and no longer carries the click-by-click TraceDraw procedure. Whether the model now picks it live is
  UNVERIFIED.
* Three test files sat outside `__tests__` (the config only includes that folder) and never ran, including the #1001 test. Moved; they pass.
* `run_script_console` now fails fast if `canvas` or `read` is not in the run's tool list, instead of failing at the focus phase.

## 3. What a live run does and does not prove

* DEEPSEEK STAGING VERIFIED: TraceDraw A4 task, ONE trial, about 4 minutes, `scripts/verify-a4-svg.mjs` exit 0 (`LIVE-TRIAL-20261120.md`).
* NOT a benchmark: no p50/p95, no matched before/after, no cost per verified outcome yet.
* NOT proven: strategy selector and tracker changing behaviour in a real run; run_script_console chosen by the model.

## 4. Release gates (not mine)

Independent security sign-off, PR #997 re-attestation by the original reviewer, and production authorization remain open. No production change was made.

## 5. Next engineering items (decided by engineering, in order)

1. Generated fixture variations (moved controls, zoom, duplicate labels, delayed loading, stale refs, overlays) run through the autorun harness.
2. A timeline-editor fixture class and a business-form fixture class, then one real unfamiliar site per class as a transfer check.
3. A matched workload with enough runs for p50/p95 and cost, using `RunTimings`.
4. Domain skill catalog with retrieval on demand, license and version audit of the supplied repositories.
5. Source-matched ZIP with SHA-256, compatible backend revision, rollback note.
