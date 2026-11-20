# Browser Operator release handover v2 (2026-11-20), supersedes RELEASE-HANDOVER-20261120.md

Staging only. No Chrome Web Store publish, no production change. Independent security review and PR #997 re-attestation are separate external gates and are not done.

## 1. Artifact (source-matched)

| Item | Value |
|---|---|
| Source | `Xroga/xroga.com` branch `claude/ops-integrated-20261112`, commit `8b30dd51fcdaa8fd887b5ee52b9db14da0171460`, working tree clean at build time |
| ZIP | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-8b30dd51f.zip` |
| SHA-256 | `1A39EDCE00882D3F873048382C5B14CCB32196E18F961EC673671ADD843F43DB` (also in `...zip.sha256`) |
| Source to artifact manifest | `ARTIFACT-MANIFEST-8b30dd51f.json`: source commit, build command and environment, backend revision, ZIP hash, and path, size and SHA-256 of all 35 files |
| Build | `npx wxt build` in `apps/xroga-browser-extension` with `WXT_PRODUCT_PERMISSIONS=1` and the staging `WXT_XROGA_*` values listed in the manifest; Node v24.18.0 on this machine (repo pins 22.21.1); `SWC_NATIVE_BINDING_CACHE` set to an owner-only folder |
| Installed copy | `C:\xr-review-builds\xroga-extension-staging-0ff582593`, mirrored from `dist` and hash-compared identical |

Docs commits after `8b30dd51f` do not change the extension code.

## 2. Backend compatibility

Service `xroga-api-universal-staging` (us-east4), tag `browser-op-1110` on revision `xroga-api-universal-staging-00146-wod`, image digest `sha256:19a547eb1595e9a087251aa4806b29aac6ff05e1214d3d0b6620c066ee59605b`. The last backend source change is `16c9d82f0`; the revision was created five minutes after it. All extension changes since are client side. Workspace for sign-in: the Vercel branch alias of `claude/live-run-943-20261110` (rebuilt today after the retention policy removed it; it can be removed again).

## 3. Install, upgrade, rollback

* Install: `chrome://extensions`, Developer mode, Load unpacked, the installed folder or the unzipped ZIP. After replacing files press Reload on the card; do not use the On/Off switch.
* Upgrade smoke test (real Chromium, `live/upgrade-smoke.cjs`): old build installed in a persistent profile, value stored, folder replaced with this build, same profile relaunched. Result: same extension id, stored value preserved, service worker alive, side panel loads. Not exercised: a version number change (both builds are 0.2.8), Web Store update, a signed-in session.
* Rollback: Load unpacked from `C:\xr-review-builds\xroga-extension-staging-0ff582593-before-a72abe` or the earlier ZIP `xroga-browser-operator-staging-0.2.8-1d106c0f0.zip` (same key, same id). Backend rollback: move the `browser-op-1110` tag to `xroga-api-universal-staging-00145-git`.

## 4. What changed this stretch, with evidence

| Change | Evidence |
|---|---|
| Live DeepSeek harness (real model, simulated page) | `live/`, `LIVE-MODEL-SELECTION-20261120.md`, `live-model/*.json` |
| `find_skill` / `read_skill` selected by DeepSeek | 3 of 3 runs, first turn, Ads task |
| `run_script_console` selected and executed by DeepSeek | 0 of 3 with coordinate arguments; 3 of 3 after element targets; "All phases passed" 3 of 4 in the latest 4 runs (one run never used it); `openPath` offered, never adopted by the model |
| Docs-first gate no longer refuses programs whose methods come from a verified playbook | unit test; live runs |
| Console verification on changed Output lines, stale detection | unit tests; live runs |
| Outline label "already captured, do not snapshot first" | matched A/B, 10 runs each, real DeepSeek: time to first useful action p50 10.3 s to 3.9 s, p95 21.2 s to 5.6 s; fill_form first 3/10 to 10/10 |
| `canvas` honours `expect` (was accepted and silently ignored); wrong menu reported with a hint | 3 unit tests; not yet observed live |
| Failure diagnosis (adapted from browser-agent) | 12 unit tests; first version ended the run on a handover (regression caught by the full suite, fixed in `ee80c4516`) |
| Explicit 20 s test timeout | `elision.test.ts`: 0.9 to 1.4 s alone, over 5 s under full-suite load |
| 8 generated form layouts, timeline editor, wrong menu, prefilled editor | Chromium scenarios VAR-1, TL-1, CV-1..3 pass |
| Service-worker kill, offline, tab close (disposable Chromium, `fixtures/sw-kill.mjs`) | offline and tabclose pass; kill passes 8 of 8 when the machine is idle and failed 3 of 7 earlier under load: **intermittent, open** |
| Real owner-browser runs | public form pass (21 s worked); TraceDraw 1 pass, 1 fail; skills run interrupted by a service-worker restart |

## 5. Evidence matrix

Columns: implemented, unit, Chromium, DeepSeek (real model; S = simulated page, L = live browser), real third party, independent review, release.

| Capability | impl | unit | Chromium | DeepSeek | 3rd party | review | release |
|---|---|---|---|---|---|---|---|
| Form fill and submit, readback | yes | yes | VAR-1 8/8 | S 10/10 fill_form first; L 1 pass | httpbin | no | no |
| Skill discovery | yes | yes | n/a | S 3/3 | n/a | no | no |
| Console tool selection and run | yes | yes | not run | S 3/3 chosen, 3/4 passed | TraceDraw not re-run since | no | no |
| Strategy selector note | yes | yes | n/a | not observed | n/a | no | no |
| Failure diagnosis | yes | yes | n/a | not observed | n/a | no | no |
| Canvas expect, wrong-menu detection | yes | yes | not run | not observed | n/a | no | no |
| SW kill recovery | existing | existing | intermittent (see above) | L interrupted run, Resume unverified | n/a | no | no |
| Upgrade in place | yes | n/a | smoke pass | n/a | n/a | no | no |
| Canvas editor end to end | yes | yes | CV, TL pass | L 1 pass 1 fail | TraceDraw | no | no |

## 6. Still unfinished (engineering) and blocked (external)

Engineering, not done: root cause of the intermittent kill-mode failure; live observation of the strategy note, diagnosis directives and canvas `expect`; the model still spends 5 to 8 turns on menus before the console call and does not use `openPath`; stale-reference, slow-network and hidden-input fixture generation; a real video editor and second real canvas editor; Page Agent, Midscene, BrowserSkill, WebGenie, Stagehand, Browser Use, OpenBrowse source ports (dispositions recorded, nothing ported); executable skill bindings for Ads, Meta and Shopify browser workflows; p50/p95 on real pages and cost per verified outcome; the real-browser Resume check after a restart.

External: independent security review; PR #997 re-attestation; production authorization; owner accounts and a sandbox network policy for the official Google Ads, Meta and Shopify API workers.
