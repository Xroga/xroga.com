# Browser Operator handover v8 (2026-11-21) — donor source sprint

Branch `claude/ops-integrated-20261112`, draft PR #976. Supersedes nothing in v7; read v7 for the layer, marks, guard, plan and transfer work.
Status vocabulary (highest actually reached): CANDIDATE, SOURCE_STUDIED, ALREADY_COVERED, PORTED_UNIT, CHROME_VERIFIED, LIVE_DEEPSEEK_VERIFIED, APP_ACCOUNT_VERIFIED, BLOCKED, REJECTED.

## (a) Head and files changed since v7
Commits `e81d91ad0` (evidence ledger replaces the fixed strategy ladder; universal prompt; workers always offered; 16-app holdout suite), `d70ab89a6` (human-control guard), `f4141d89d` (donor sprint, squashed after push protection flagged a test string that looked like a payment key; the string is replaced). Files: `src/browser-control/core/{reading,diagnostics}.ts`, `core/tools/{diagnostics,wait}.ts`, `core/interaction/evidence.ts`, `core/human-guard.ts`, `probe/source.ts`, `protocol/{schemas,catalogue}.ts`, `src/agent/{prompt,progress-tracker}.ts`, scenarios `expect-count.ts` and `diagnostics.ts`, eval tasks, fixtures `c-ticker*.html`, `c-misleading*.html`, `docs/xroga/oss-capability-ledger.json`.

## (b) Original generic failures
1. The model had no way to say "the list gained a row" without knowing the old count. 2. A page that says "Saved!" while its request failed was reported as success: the receipt did not carry the request's status. 3. Waiting on a value (a job's progress, a stock figure) was only possible as text or fixed sleeps. 4. A person's key or click right after an agent input of the same kind could be explained away by it (human guard).

## (c) Fixes and before/after
| Donor (pinned SHA, source) | Measured gap | Xroga change and callable surface | Unit / Chromium / DeepSeek | Result | Limits |
|---|---|---|---|---|---|
| uiuing/browser-agent a8517e2c, `page/verify.ts` list_count_delta, textPresentIn (MIT) | expect.count needed an absolute number | `expect.count.delta` (baseline taken before the action in `Evidence`), whitespace-insensitive `hasText` | Chromium S3-expect-count-delta PASS (delta 1 met; 0 and -1 unmet saying "a change of 1") | CHROME_VERIFIED | not run through DeepSeek on its own |
| fullselfbrowsing/FSB 28284b8c, `ai/tool-definitions.js` trigger (MIT) | no wait on a value | `wait {target, reading:{equals,contains,matches,above,below,changed}}` | `reading.test.ts` (parsing, locale numbers), Chromium S3-wait-reading PASS, DeepSeek reading-job and reading-stock 4/4 | LIVE_DEEPSEEK_VERIFIED, no improvement shown: previous code also 4/4 | needs a target with a ref (controls, inputs, buttons, links), not plain text; no background trigger runtime, no refresh polling (by design) |
| esterhuizen/opensidekick 6f11eeea, `src/background/tools.js` read_console/read_network (MIT) | the page's failed request was invisible | `diagnostics` tool (console + requests, query/fragment stripped, no bodies/headers, bounded ring) and **request status in every action receipt** (`request: POST /api/x → 404 (the server refused or failed it)`) | `diagnostics.test.ts`, Chromium S3-diagnostics and S3-request-status PASS, DeepSeek diag-profile / diag-newsletter 6/6 new vs 5/6 previous | LIVE_DEEPSEEK_VERIFIED, difference not significant (n=6) | first run: with only the tool and no receipt status the model never called it (0/4): evidence the model must ask for is not used; evidence in the receipt is |
| Tencent/BrowserSkill (MIT), `cooperation-capture.ts` matches/humanInput | one agent input could swallow a person's following input; zoomed coordinates | `unexplained()` one-to-one consumption, visual-viewport offset in `recentInput` | `human-guard.test.ts` (3 new) | PORTED_UNIT | HUM-1/HUM-2 re-run: see below |
| alibaba/page-agent d8dd3344 (MIT) | none found | none | source read only | ALREADY_COVERED (trusted CDP input, no synthetic-event patches needed) | no token or accuracy comparison was run |
| browser-use/workflow-use (AGPL-3.0) | — | not read for code | — | REJECTED for code (copyleft); ideas only | — |

Catalogue size: the three additions raised the tool schema from 26.9 to 27.2 thousand characters; the size test was loosened from 0.84 to 0.865 of the old size on purpose.

## (d) Operational vs fixture-only vs blocked
Operational in real Chromium with the real extension: all of the above. Fixture-only: every page used (local fixtures). Blocked/not done: real Ads/Meta/Shopify/Drive accounts, signed-in owner Chrome, SkillsHub 402, independent security review, PR #997 re-attestation, production vision flag.

## (e) Latency, cost, outcome
Hard-category suite (5 categories x 2 seeds, real DeepSeek, vision, reasoning none): new code 10/10, p50 37.5 s, p95 118.6 s, turns p50 8; previous code 9/10 (one timeout), p50 41.4 s, p95 148.5 s, turns p50 9. Sample size 10 per arm; the difference is within noise except hard-slow (new 16-52 s, previous 14-148 s). Raw rows: `live-model/hard-*-20261121.jsonl`, `live-model/donor-*-20261121.jsonl`. TraceDraw was not run again (one recorded failure stands: 47 turns, 462 s).

## (f) Next gap
1. Executing parallel workers measured against sequential with the real model through the product chain (needs a throwaway staging user and a tagged copy; not done this session). 2. Plain-text counters cannot be a `reading` target; a text-regex wait would cover them. 3. Page Agent token/accuracy comparison. 4. Real-account categories.

## (g) Build and gates
See the addendum at the end of this file for the final commit, ZIP, SHA-256 and the full unit/scenario counts. Staging only; production needs the separate security and authorisation gates.

## Build addendum
Build commit `f4141d89d` (working tree clean at build), ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-f4141d89d.zip`, SHA-256 `210A795459962F4F4016168C2567C862603826857D0F6576CFFB295EB2C61A7D`, manifest `ARTIFACT-MANIFEST-f4141d89d.json`. Rollback: unzip the `24a5d5c00` ZIP (SHA-256 `1C46F34D...A85479`) over the same folder and reload.
Checks on this source: typecheck clean; unit suite 1443 passed, 4 skipped (before the last prompt bullet was shortened; `src/agent` re-run 522 passed); all 303 real-Chromium scenarios PASS (`scenarios-full-20261121-donor-sprint.json`), including HUM-1 and HUM-2 after the guard change and the five new S3 scenarios; upgrade from `24a5d5c00` keeps extension id, storage, service worker and side panel. Staging only.

## Executing workers against one agent, real DeepSeek (measured; check `parallel-real`)
Task: four independent three-step pages (choose, confirm, a code appears after 2.5 s), graded by the four codes in the answer. Real extension, real worker windows, real model, vision off for workers' panel path as configured by the panel. Files: `live-model/parallel-real-*-20261121.json`.
- Single agent (told not to use workers): 167, 127, 127 s, 3/3 correct.
- Model's free choice (no instruction): it never started workers (0 of 2), 125 and 134 s, 2/2 correct.
- Workers with the extension's default of 3 slots (a fourth task waits): 125 s, 163 s, and one run still waiting at 232 s (stopped by the check's window, 0 codes read): 2 of 3 correct, median slower than single.
- Workers with 4 slots (the product's server limit is 13): 152, 84, 92 s, 3/3 correct, 4 active at once. Median 92 s against 127 s single: about 1.4x faster, with large variance (n=3 per arm).
Conclusion: workers pay off only when all tasks can run at once and each is long; with the default 3 slots they do not. Each worker is slower than the single agent per page (window start, its own model turns), so small jobs stay single-agent, which is what the model chooses by itself. Not measured: more than four tasks, tasks that use different sites, cost per arm.
